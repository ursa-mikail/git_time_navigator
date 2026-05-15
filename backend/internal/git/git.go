package git

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	gitssh "github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"golang.org/x/crypto/ssh"

	"github.com/gitnav/backend/internal/models"
)

const reposBase = "/tmp/repos"

// AuthConfig holds all possible auth methods.
type AuthConfig struct {
	APIToken      string // gh_*** or github_pat_***
	SSHKeyPath    string // host path e.g. /Users/alice/.ssh/id_rsa or ~/.ssh/id_rsa
	SSHPassphrase string
	SSHKeyPEM     string // raw PEM bytes (alternative to path)
}

// sanitise strips trailing slashes, .git, and whitespace from any URL.
func sanitise(raw string) string {
	raw = strings.TrimSpace(raw)
	// Strip trailing slashes and .git repeatedly until stable
	for {
		trimmed := strings.TrimRight(raw, "/")
		trimmed = strings.TrimSuffix(trimmed, ".git")
		trimmed = strings.TrimRight(trimmed, "/")
		if trimmed == raw {
			break
		}
		raw = trimmed
	}
	return raw
}

// toHTTPS converts any GitHub URL format to a canonical HTTPS clone URL.
//   git@github.com:owner/repo      → https://github.com/owner/repo.git
//   https://github.com/owner/repo/ → https://github.com/owner/repo.git
func toHTTPS(raw string) string {
	raw = sanitise(raw)
	if strings.HasPrefix(raw, "git@github.com:") {
		path := strings.TrimPrefix(raw, "git@github.com:")
		return "https://github.com/" + path + ".git"
	}
	// Already HTTPS — just ensure .git suffix
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimPrefix(raw, "https://")
	return "https://" + raw + ".git"
}

// toSSH converts any GitHub URL format to a canonical SSH clone URL.
//   https://github.com/owner/repo/ → git@github.com:owner/repo.git
func toSSH(raw string) string {
	raw = sanitise(raw)
	raw = strings.TrimPrefix(raw, "https://github.com/")
	raw = strings.TrimPrefix(raw, "http://github.com/")
	raw = strings.TrimPrefix(raw, "git@github.com:")
	return "git@github.com:" + raw + ".git"
}

// containerSSHPath maps a host key path (typed by the user) to its
// location inside the Docker container, where ~/.ssh is mounted at
// /home/hostuser/.ssh.
func containerSSHPath(keyPath string) string {
	const mount = "/home/hostuser/.ssh"

	// Already inside container
	if strings.HasPrefix(keyPath, mount) {
		return keyPath
	}

	// Expand ~ prefix
	if strings.HasPrefix(keyPath, "~") {
		idx := strings.Index(keyPath, "/")
		if idx == -1 {
			return filepath.Join(mount, "id_ed25519")
		}
		keyPath = keyPath[idx:] // "/.ssh/id_rsa" or "/id_rsa"
	}

	// Extract just the filename from any absolute path
	// handles: /Users/alice/.ssh/id_rsa  → id_rsa
	//          /.ssh/id_rsa              → id_rsa
	//          /id_rsa                   → id_rsa
	if idx := strings.LastIndex(keyPath, "/.ssh/"); idx != -1 {
		keyPath = keyPath[idx+6:]
	} else {
		keyPath = filepath.Base(keyPath)
	}

	keyPath = strings.TrimLeft(keyPath, "/")
	if keyPath == "" || keyPath == "." {
		keyPath = "id_ed25519"
	}
	return filepath.Join(mount, keyPath)
}

// readSSHKey reads key PEM bytes from config, trying the mapped container
// path and common fallbacks.
func readSSHKey(cfg AuthConfig) ([]byte, string, error) {
	if cfg.SSHKeyPEM != "" {
		return []byte(cfg.SSHKeyPEM), "inline", nil
	}

	// Build candidate list
	candidates := []string{}

	if cfg.SSHKeyPath != "" {
		mapped := containerSSHPath(cfg.SSHKeyPath)
		candidates = append(candidates, mapped)
	}

	// Always try common defaults as fallback
	defaults := []string{
		"/home/hostuser/.ssh/id_ed25519",
		"/home/hostuser/.ssh/id_rsa",
		"/home/hostuser/.ssh/id_ecdsa",
	}
	for _, d := range defaults {
		if len(candidates) == 0 || candidates[0] != d {
			candidates = append(candidates, d)
		}
	}

	for _, p := range candidates {
		if b, err := os.ReadFile(p); err == nil {
			return b, p, nil
		}
	}

	return nil, "", fmt.Errorf(
		"no SSH key found. Tried: %s. "+
			"Your host ~/.ssh/ is mounted into the container automatically — "+
			"make sure the key exists on your machine.",
		strings.Join(candidates[:min(3, len(candidates))], ", "),
	)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// buildAuth returns the right transport.AuthMethod for the given config and URL.
// It always uses HTTPS internally to avoid SSH dial issues inside Docker.
func buildAuth(cfg AuthConfig) (cloneURL string, auth transport.AuthMethod, err error) {
	// SSH key specified — use SSH transport with SSH URL
	if cfg.SSHKeyPath != "" || cfg.SSHKeyPEM != "" {
		pemBytes, keyPath, readErr := readSSHKey(cfg)
		if readErr != nil {
			return "", nil, readErr
		}

		pk, pkErr := gitssh.NewPublicKeys("git", pemBytes, cfg.SSHPassphrase)
		if pkErr != nil {
			return "", nil, fmt.Errorf(
				"could not load SSH key from %q — wrong passphrase, or key format unsupported.\nError: %w",
				keyPath, pkErr,
			)
		}
		pk.HostKeyCallback = ssh.InsecureIgnoreHostKey()
		return "", pk, nil // caller sets URL separately
	}

	// Token — use HTTPS
	if cfg.APIToken != "" {
		return "", &githttp.BasicAuth{
			Username: "x-token", // any non-empty string
			Password: cfg.APIToken,
		}, nil
	}

	// No auth — use HTTPS anonymously (public repos only)
	return "", nil, nil
}

// CloneOrOpen clones or opens+pulls a repo. Always runs in a background context.
func CloneOrOpen(cfg AuthConfig, repoURL string, progress io.Writer) (string, *gogit.Repository, error) {
	// Pick the right URL format based on auth method
	var cloneURL string
	if cfg.SSHKeyPath != "" || cfg.SSHKeyPEM != "" {
		cloneURL = toSSH(repoURL)
	} else {
		cloneURL = toHTTPS(repoURL)
	}

	_, auth, err := buildAuth(cfg)
	if err != nil {
		return "", nil, err
	}

	slug := slugify(cloneURL)
	localPath := filepath.Join(reposBase, slug)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	// Already cloned — open and pull
	if info, statErr := os.Stat(localPath); statErr == nil && info.IsDir() {
		r, openErr := gogit.PlainOpen(localPath)
		if openErr != nil {
			// Corrupted — remove and re-clone
			os.RemoveAll(localPath)
			return doClone(ctx, cloneURL, localPath, auth, progress)
		}

		w, wtErr := r.Worktree()
		if wtErr != nil {
			return localPath, r, nil
		}

		pullOpts := &gogit.PullOptions{RemoteName: "origin", Force: true, Progress: progress}
		if auth != nil {
			pullOpts.Auth = auth
		}
		pullErr := w.PullContext(ctx, pullOpts)
		if pullErr != nil && pullErr != gogit.NoErrAlreadyUpToDate {
			if progress != nil {
				fmt.Fprintf(progress, "note: pull returned: %v\n", pullErr)
			}
		}
		return localPath, r, nil
	}

	return doClone(ctx, cloneURL, localPath, auth, progress)
}

func doClone(ctx context.Context, url, localPath string, auth transport.AuthMethod, progress io.Writer) (string, *gogit.Repository, error) {
	if mkErr := os.MkdirAll(reposBase, 0755); mkErr != nil {
		return localPath, nil, fmt.Errorf("cannot create repos dir: %w", mkErr)
	}
	opts := &gogit.CloneOptions{URL: url, Progress: progress}
	if auth != nil {
		opts.Auth = auth
	}
	r, err := gogit.PlainCloneContext(ctx, localPath, false, opts)
	if err != nil {
		// Clean up partial clone
		os.RemoveAll(localPath)
		return localPath, nil, fmt.Errorf("clone %q failed: %w", url, err)
	}
	return localPath, r, nil
}

// ── Git operations ─────────────────────────────────────────────────────────

func LoadCommits(r *gogit.Repository, repoID int) ([]*models.Commit, error) {
	refs, err := r.References()
	if err != nil {
		return []*models.Commit{}, err
	}

	seen := map[string]bool{}
	all := make([]*models.Commit, 0, 256)

	refs.ForEach(func(ref *plumbing.Reference) error {
		if !ref.Name().IsBranch() && !ref.Name().IsRemote() {
			return nil
		}
		branch := ref.Name().Short()
		iter, err := r.Log(&gogit.LogOptions{From: ref.Hash()})
		if err != nil {
			return nil
		}
		return iter.ForEach(func(c *object.Commit) error {
			h := c.Hash.String()
			if seen[h] {
				return nil
			}
			seen[h] = true

			parents := make([]string, len(c.ParentHashes))
			for i, ph := range c.ParentHashes {
				parents[i] = ph.String()
			}

			files := make([]string, 0)
			var ins, del int
			if stats, err := c.Stats(); err == nil {
				for _, s := range stats {
					files = append(files, s.Name)
					ins += s.Addition
					del += s.Deletion
				}
			}

			all = append(all, &models.Commit{
				RepoID:       repoID,
				Hash:         h,
				ShortHash:    h[:7],
				AuthorName:   c.Author.Name,
				AuthorEmail:  c.Author.Email,
				Message:      strings.TrimSpace(c.Message),
				CommittedAt:  c.Author.When,
				Branch:       branch,
				Parents:      parents,
				FilesChanged: files,
				Insertions:   ins,
				Deletions:    del,
			})
			return nil
		})
	})
	return all, nil
}

func Checkout(r *gogit.Repository, hash string) error {
	w, err := r.Worktree()
	if err != nil {
		return err
	}
	return w.Checkout(&gogit.CheckoutOptions{Hash: plumbing.NewHash(hash), Force: true})
}

func CheckoutBranch(r *gogit.Repository, hash, branch string) error {
	w, err := r.Worktree()
	if err != nil {
		return err
	}
	return w.Checkout(&gogit.CheckoutOptions{
		Hash:   plumbing.NewHash(hash),
		Branch: plumbing.NewBranchReferenceName(branch),
		Create: true, Force: true,
	})
}

func HardReset(r *gogit.Repository, hash string) error {
	w, err := r.Worktree()
	if err != nil {
		return err
	}
	return w.Reset(&gogit.ResetOptions{Commit: plumbing.NewHash(hash), Mode: gogit.HardReset})
}

func GetDiff(r *gogit.Repository, fromHash, toHash string) ([]*models.DiffFile, error) {
	from, err := r.CommitObject(plumbing.NewHash(fromHash))
	if err != nil {
		return nil, fmt.Errorf("from commit %q: %w", fromHash, err)
	}
	to, err := r.CommitObject(plumbing.NewHash(toHash))
	if err != nil {
		return nil, fmt.Errorf("to commit %q: %w", toHash, err)
	}
	fromTree, _ := from.Tree()
	toTree, _ := to.Tree()
	changes, err := fromTree.Diff(toTree)
	if err != nil {
		return nil, err
	}

	out := make([]*models.DiffFile, 0, len(changes))
	for _, c := range changes {
		patch, _ := c.Patch()
		df := &models.DiffFile{Path: c.To.Name}
		switch {
		case c.From.Name == "":
			df.Status = "added"
		case c.To.Name == "":
			df.Status = "removed"
			df.Path = c.From.Name
		case c.From.Name != c.To.Name:
			df.Status = "renamed"
			df.OldPath = c.From.Name
		default:
			df.Status = "modified"
		}
		if patch != nil {
			df.Patch = patch.String()
			for _, line := range strings.Split(df.Patch, "\n") {
				if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
					df.Additions++
				} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
					df.Deletions++
				}
			}
		}
		out = append(out, df)
	}
	return out, nil
}

// ── GitHub API ─────────────────────────────────────────────────────────────

type GitHubRepo struct {
	FullName      string `json:"full_name"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
	Description   string `json:"description"`
	CloneURL      string `json:"clone_url"`
	SSHURL        string `json:"ssh_url"`
}

func FetchGitHubRepo(owner, repo, token string) (*GitHubRepo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s", owner, repo)
	req, _ := http.NewRequest("GET", url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "GitTimeNavigator/1.0")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API %d: %s", resp.StatusCode, body)
	}
	var gr GitHubRepo
	return &gr, json.Unmarshal(body, &gr)
}

func GitHubForcePush(owner, repo, branch, sha, token string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs/heads/%s", owner, repo, branch)
	body := fmt.Sprintf(`{"sha":"%s","force":true}`, sha)
	req, _ := http.NewRequest("PATCH", url, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "GitTimeNavigator/1.0")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("GitHub push %d: %s", resp.StatusCode, b)
	}
	return nil
}

func ParseGitHubURL(rawURL string) (owner, repo string, err error) {
	s := sanitise(rawURL)
	s = strings.TrimPrefix(s, "git@github.com:")
	s = strings.TrimPrefix(s, "https://github.com/")
	s = strings.TrimPrefix(s, "http://github.com/")
	// Remove any remaining leading slashes
	s = strings.TrimLeft(s, "/")
	parts := strings.SplitN(s, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("cannot parse GitHub URL: %q (expected owner/repo)", rawURL)
	}
	return parts[0], parts[1], nil
}

func OpenLocal(path string) (*gogit.Repository, error) {
	return gogit.PlainOpen(path)
}

// ── File tree ──────────────────────────────────────────────────────────────

type TreeNode struct {
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	Type     string      `json:"type"`
	Size     int64       `json:"size,omitempty"`
	Changed  bool        `json:"changed,omitempty"`
	Children []*TreeNode `json:"children,omitempty"`
}

func GetFileTree(r *gogit.Repository, hash string, changedFiles []string) (*TreeNode, error) {
	commit, err := r.CommitObject(plumbing.NewHash(hash))
	if err != nil {
		return nil, fmt.Errorf("commit not found: %w", err)
	}
	tree, err := commit.Tree()
	if err != nil {
		return nil, err
	}

	changed := make(map[string]bool, len(changedFiles))
	for _, f := range changedFiles {
		changed[f] = true
	}

	root := &TreeNode{Name: "/", Path: "", Type: "dir", Children: make([]*TreeNode, 0)}
	nodeMap := map[string]*TreeNode{"": root}

	tree.Files().ForEach(func(f *object.File) error {
		parts := strings.Split(f.Name, "/")
		for i := 1; i < len(parts); i++ {
			dirPath := strings.Join(parts[:i], "/")
			if _, ok := nodeMap[dirPath]; !ok {
				parentPath := strings.Join(parts[:i-1], "/")
				dn := &TreeNode{Name: parts[i-1], Path: dirPath, Type: "dir", Children: make([]*TreeNode, 0)}
				nodeMap[parentPath].Children = append(nodeMap[parentPath].Children, dn)
				nodeMap[dirPath] = dn
			}
		}
		parentPath := strings.Join(parts[:len(parts)-1], "/")
		nodeMap[parentPath].Children = append(nodeMap[parentPath].Children, &TreeNode{
			Name: parts[len(parts)-1], Path: f.Name,
			Type: "file", Size: f.Size, Changed: changed[f.Name],
		})
		return nil
	})

	sortTree(root)
	return root, nil
}

func GetFileContent(r *gogit.Repository, hash, filePath string) (string, error) {
	commit, err := r.CommitObject(plumbing.NewHash(hash))
	if err != nil {
		return "", err
	}
	tree, err := commit.Tree()
	if err != nil {
		return "", err
	}
	f, err := tree.File(filePath)
	if err != nil {
		return "", err
	}
	if bin, _ := f.IsBinary(); bin {
		return "[binary file]", nil
	}
	return f.Contents()
}

func sortTree(node *TreeNode) {
	if node.Type == "file" || node.Children == nil {
		return
	}
	var dirs, files []*TreeNode
	for _, c := range node.Children {
		sortTree(c)
		if c.Type == "dir" {
			dirs = append(dirs, c)
		} else {
			files = append(files, c)
		}
	}
	sortNodes(dirs)
	sortNodes(files)
	node.Children = append(dirs, files...)
}

func sortNodes(nodes []*TreeNode) {
	for i := 1; i < len(nodes); i++ {
		for j := i; j > 0 && nodes[j].Name < nodes[j-1].Name; j-- {
			nodes[j], nodes[j-1] = nodes[j-1], nodes[j]
		}
	}
}

func slugify(u string) string {
	r := strings.NewReplacer(
		"https://", "", "http://", "", "git@", "",
		"/", "_", ":", "_", ".", "_",
	)
	return strings.Trim(r.Replace(u), "_")
}
