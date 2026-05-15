package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"

	"github.com/gitnav/backend/internal/db"
	gitops "github.com/gitnav/backend/internal/git"
	"github.com/gitnav/backend/internal/models"
)

type Server struct {
	db      *db.DB
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewServer(database *db.DB) *Server {
	return &Server{db: database, clients: make(map[*websocket.Conn]bool)}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	r.Get("/ws", s.handleWebSocket)

	r.Route("/api", func(r chi.Router) {
		// Repositories
		r.Get("/repos", s.listRepos)
		r.Post("/repos", s.cloneRepo)
		r.Delete("/repos/{id}", s.deleteRepo)

		// Commits
		r.Get("/repos/{id}/commits", s.listCommits)
		r.Get("/repos/{id}/commits/{hash}", s.getCommit)
		r.Get("/repos/{id}/autocomplete", s.autocomplete)
		r.Get("/repos/{id}/diff", s.getDiff)
		// File tree & content at a commit
		r.Get("/repos/{id}/commits/{hash}/tree", s.getFileTree)
		r.Get("/repos/{id}/commits/{hash}/file", s.getFileContent)

		// Actions
		r.Post("/repos/{id}/switch", s.switchVersion)
		r.Post("/repos/{id}/sync", s.syncRepo)

		// Charts
		r.Get("/repos/{id}/charts/frequency", s.chartFrequency)
		r.Get("/repos/{id}/charts/authors", s.chartAuthors)
		r.Get("/repos/{id}/charts/hotspots", s.chartHotspots)

		// Meta
		r.Get("/repos/{id}/authors", s.listAuthors)
		r.Get("/repos/{id}/branches", s.listBranches)
		r.Get("/repos/{id}/daterange", s.dateRange)
		r.Get("/repos/{id}/dates", s.distinctDates)
		r.Get("/repos/{id}/log", s.navLog)

		// Filter presets
		r.Get("/repos/{id}/presets", s.listPresets)
		r.Post("/repos/{id}/presets", s.savePreset)
	})

	return r
}

// ── WebSocket ────────────────────────────────────────────────────────────────

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) broadcast(msg models.WSMessage) {
	b, _ := json.Marshal(msg)
	s.mu.Lock()
	defer s.mu.Unlock()
	for conn := range s.clients {
		conn.WriteMessage(websocket.TextMessage, b)
	}
}

// ── Repos ────────────────────────────────────────────────────────────────────

func (s *Server) listRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := s.db.ListRepos(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, repos)
}

func (s *Server) cloneRepo(w http.ResponseWriter, r *http.Request) {
	var req models.RepoCloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, err)
		return
	}
	if req.URL == "" {
		writeJSON(w, 400, map[string]string{"error": "url is required"})
		return
	}

	owner, name, err := gitops.ParseGitHubURL(req.URL)
	if err != nil {
		writeErr(w, err)
		return
	}

	repo := &models.Repository{
		URL:           req.URL,
		Name:          name,
		Owner:         owner,
		DefaultBranch: "main",
	}

	// Best-effort: fetch default branch from GitHub API
	if req.APIToken != "" {
		if gh, err := gitops.FetchGitHubRepo(owner, name, req.APIToken); err == nil {
			repo.DefaultBranch = gh.DefaultBranch
		}
	}

	saved, err := s.db.UpsertRepo(r.Context(), repo)
	if err != nil {
		writeErr(w, err)
		return
	}

	cfg := gitops.AuthConfig{
		APIToken:      req.APIToken,
		SSHKeyPath:    req.SSHKeyPath,
		SSHPassphrase: req.SSHPassphrase,
		SSHKeyPEM:     req.SSHKeyPEM,
	}

	// Clone runs in background — NOT using r.Context() which dies after HTTP response
	go s.cloneAndIndex(saved, cfg)

	writeJSON(w, 201, saved)
}

// cloneAndIndex runs in a goroutine with its own background context.
func (s *Server) cloneAndIndex(saved *models.Repository, cfg gitops.AuthConfig) {
	ctx := context.Background()

	s.broadcast(models.WSMessage{Type: "sync_start", Payload: map[string]any{
		"repo_id": saved.ID,
		"message": "Cloning " + saved.Owner + "/" + saved.Name + "…",
	}})

	localPath, gitRepo, err := gitops.CloneOrOpen(cfg, saved.URL, nil)
	if err != nil {
		log.Printf("clone error: %v", err)
		s.broadcast(models.WSMessage{Type: "sync_error", Payload: map[string]any{
			"repo_id": saved.ID,
			"error":   err.Error(),
		}})
		return
	}

	saved.LocalPath = localPath
	s.db.UpsertRepo(ctx, saved)

	s.broadcast(models.WSMessage{Type: "sync_progress", Payload: map[string]any{
		"repo_id": saved.ID,
		"message": "Indexing commits…",
	}})

	commits, err := gitops.LoadCommits(gitRepo, saved.ID)
	if err != nil {
		log.Printf("load commits error: %v", err)
		s.broadcast(models.WSMessage{Type: "sync_error", Payload: map[string]any{
			"repo_id": saved.ID,
			"error":   err.Error(),
		}})
		return
	}

	// Batch insert
	batchSize := 500
	for i := 0; i < len(commits); i += batchSize {
		end := i + batchSize
		if end > len(commits) {
			end = len(commits)
		}
		if err := s.db.BulkUpsertCommits(ctx, commits[i:end]); err != nil {
			log.Printf("bulk insert batch %d error: %v", i, err)
		}
		s.broadcast(models.WSMessage{Type: "sync_progress", Payload: map[string]any{
			"repo_id": saved.ID,
			"message": fmt.Sprintf("Indexed %d / %d commits…", end, len(commits)),
		}})
	}

	s.db.MarkSynced(ctx, saved.ID)
	count, _ := s.db.CommitCount(ctx, saved.ID)

	s.broadcast(models.WSMessage{Type: "sync_done", Payload: map[string]any{
		"repo_id":      saved.ID,
		"commit_count": count,
		"message":      fmt.Sprintf("✓ Indexed %d commits", count),
	}})
}

func (s *Server) deleteRepo(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	if err := s.db.DeleteRepo(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ── Commits ──────────────────────────────────────────────────────────────────

func (s *Server) listCommits(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	q := r.URL.Query()

	filter := models.CommitFilter{
		Query:    q.Get("q"),
		Author:   q.Get("author"),
		Branch:   q.Get("branch"),
		FilePath: q.Get("file"),
		Limit:    intQ(q.Get("limit"), 100),
		Offset:   intQ(q.Get("offset"), 0),
	}
	if df := q.Get("date_from"); df != "" {
		t, _ := time.Parse(time.RFC3339, df)
		filter.DateFrom = &t
	}
	if dt := q.Get("date_to"); dt != "" {
		t, _ := time.Parse(time.RFC3339, dt)
		filter.DateTo = &t
	}

	commits, total, err := s.db.SearchCommits(r.Context(), id, filter)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"commits": commits, "total": total})
}

func (s *Server) getCommit(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	hash := chi.URLParam(r, "hash")
	c, err := s.db.GetCommit(r.Context(), id, hash)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, c)
}

func (s *Server) autocomplete(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	q := r.URL.Query().Get("q")
	res, err := s.db.Autocomplete(r.Context(), id, q)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, res)
}

func (s *Server) getDiff(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	fromHash := r.URL.Query().Get("from")
	toHash := r.URL.Query().Get("to")

	repo, err := s.db.GetRepo(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	gr, err := gitops.OpenLocal(repo.LocalPath)
	if err != nil {
		writeErr(w, err)
		return
	}
	diff, err := gitops.GetDiff(gr, fromHash, toHash)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, diff)
}

// ── Actions ──────────────────────────────────────────────────────────────────

func (s *Server) switchVersion(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	var req models.SwitchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, err)
		return
	}
	req.RepoID = id

	repo, err := s.db.GetRepo(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}

	gr, err := gitops.OpenLocal(repo.LocalPath)
	if err != nil {
		writeErr(w, err)
		return
	}

	switch req.Mode {
	case "checkout":
		err = gitops.Checkout(gr, req.Hash)
	case "branch":
		if req.Branch == "" {
			writeJSON(w, 400, map[string]string{"error": "branch name required"})
			return
		}
		err = gitops.CheckoutBranch(gr, req.Hash, req.Branch)
	case "reset":
		err = gitops.HardReset(gr, req.Hash)
	case "push":
		if req.APIToken == "" {
			writeJSON(w, 400, map[string]string{"error": "API token required for remote push"})
			return
		}
		if req.Branch == "" {
			req.Branch = repo.DefaultBranch
		}
		err = gitops.GitHubForcePush(repo.Owner, repo.Name, req.Branch, req.Hash, req.APIToken)
	default:
		writeJSON(w, 400, map[string]string{"error": "unknown mode"})
		return
	}

	if err != nil {
		writeErr(w, err)
		return
	}

	// Log it
	s.db.LogNavigation(r.Context(), &models.NavigationLog{
		RepoID: id,
		Action: req.Mode,
		ToHash: req.Hash,
		Notes:  fmt.Sprintf("mode=%s branch=%s", req.Mode, req.Branch),
	})

	s.broadcast(models.WSMessage{Type: "version_switched", Payload: map[string]any{
		"repo_id": id, "hash": req.Hash, "mode": req.Mode,
	}})

	writeJSON(w, 200, map[string]string{"ok": "true", "hash": req.Hash, "mode": req.Mode})
}

func (s *Server) syncRepo(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	var body struct {
		APIToken      string `json:"api_token"`
		SSHKeyPath    string `json:"ssh_key_path"`
		SSHPassphrase string `json:"ssh_passphrase"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	repo, err := s.db.GetRepo(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}

	cfg := gitops.AuthConfig{
		APIToken:      body.APIToken,
		SSHKeyPath:    body.SSHKeyPath,
		SSHPassphrase: body.SSHPassphrase,
	}

	go s.cloneAndIndex(repo, cfg)

	writeJSON(w, 202, map[string]string{"status": "syncing"})
}

// ── Charts ───────────────────────────────────────────────────────────────────

func (s *Server) chartFrequency(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	data, err := s.db.CommitFrequency(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, data)
}

func (s *Server) chartAuthors(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	data, err := s.db.AuthorActivity(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, data)
}

func (s *Server) chartHotspots(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	data, err := s.db.FileHotspots(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, data)
}

// ── Meta ─────────────────────────────────────────────────────────────────────

func (s *Server) listAuthors(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	authors, err := s.db.DistinctAuthors(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, authors)
}

func (s *Server) listBranches(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	branches, err := s.db.DistinctBranches(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, branches)
}

func (s *Server) dateRange(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	from, to, err := s.db.DateRange(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{
		"from":     from.Format("2006/01/02"),
		"to":       to.Format("2006/01/02"),
		"from_iso": from.UTC().Format("2006-01-02"),
		"to_iso":   to.UTC().Format("2006-01-02"),
	})
}

func (s *Server) distinctDates(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	dates, err := s.db.DistinctDates(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, dates)
}

func (s *Server) navLog(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	logs, err := s.db.ListNavigationLog(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, logs)
}

func (s *Server) listPresets(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	presets, err := s.db.ListFilterPresets(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, presets)
}

func (s *Server) savePreset(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	var p models.FilterPreset
	json.NewDecoder(r.Body).Decode(&p)
	p.RepoID = id
	saved, err := s.db.SaveFilterPreset(r.Context(), &p)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, saved)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	log.Printf("API error: %v", err)
	msg := err.Error()
	if strings.Contains(msg, "no rows") {
		writeJSON(w, 404, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, 500, map[string]string{"error": msg})
}

func paramInt(r *http.Request, key string) int {
	v, _ := strconv.Atoi(chi.URLParam(r, key))
	return v
}

func intQ(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}

// ── File Tree & Content ───────────────────────────────────────────────────────

func (s *Server) getFileTree(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	hash := chi.URLParam(r, "hash")

	repo, err := s.db.GetRepo(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	commit, err := s.db.GetCommit(r.Context(), id, hash)
	if err != nil {
		writeErr(w, err)
		return
	}
	gr, err := gitops.OpenLocal(repo.LocalPath)
	if err != nil {
		writeErr(w, err)
		return
	}
	tree, err := gitops.GetFileTree(gr, commit.Hash, commit.FilesChanged)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, tree)
}

func (s *Server) getFileContent(w http.ResponseWriter, r *http.Request) {
	id := paramInt(r, "id")
	hash := chi.URLParam(r, "hash")
	filePath := r.URL.Query().Get("path")

	repo, err := s.db.GetRepo(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	gr, err := gitops.OpenLocal(repo.LocalPath)
	if err != nil {
		writeErr(w, err)
		return
	}
	content, err := gitops.GetFileContent(gr, hash, filePath)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"content": content, "path": filePath})
}
