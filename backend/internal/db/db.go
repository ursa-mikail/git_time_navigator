package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gitnav/backend/internal/models"
)

type DB struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, connStr string) (*DB, error) {
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Close() { d.pool.Close() }

// ── Repositories ────────────────────────────────────────────────────────────

func (d *DB) UpsertRepo(ctx context.Context, r *models.Repository) (*models.Repository, error) {
	var out models.Repository
	err := d.pool.QueryRow(ctx, `
		INSERT INTO repositories (url, name, owner, local_path, default_branch)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (url) DO UPDATE
		  SET name=$2, owner=$3, local_path=COALESCE($4, repositories.local_path)
		RETURNING id, url, name, owner, local_path, default_branch, last_synced, created_at`,
		r.URL, r.Name, r.Owner, r.LocalPath, r.DefaultBranch,
	).Scan(&out.ID, &out.URL, &out.Name, &out.Owner, &out.LocalPath,
		&out.DefaultBranch, &out.LastSynced, &out.CreatedAt)
	return &out, err
}

func (d *DB) ListRepos(ctx context.Context) ([]*models.Repository, error) {
	rows, err := d.pool.Query(ctx, `SELECT id,url,name,owner,local_path,default_branch,last_synced,created_at FROM repositories ORDER BY created_at DESC`)
	if err != nil {
		return []*models.Repository{}, err
	}
	defer rows.Close()
	out := make([]*models.Repository, 0)
	for rows.Next() {
		var r models.Repository
		if err := rows.Scan(&r.ID, &r.URL, &r.Name, &r.Owner, &r.LocalPath, &r.DefaultBranch, &r.LastSynced, &r.CreatedAt); err != nil {
			return out, err
		}
		out = append(out, &r)
	}
	return out, rows.Err()
}

func (d *DB) GetRepo(ctx context.Context, id int) (*models.Repository, error) {
	var r models.Repository
	err := d.pool.QueryRow(ctx, `SELECT id,url,name,owner,local_path,default_branch,last_synced,created_at FROM repositories WHERE id=$1`, id).
		Scan(&r.ID, &r.URL, &r.Name, &r.Owner, &r.LocalPath, &r.DefaultBranch, &r.LastSynced, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (d *DB) MarkSynced(ctx context.Context, repoID int) error {
	_, err := d.pool.Exec(ctx, `UPDATE repositories SET last_synced=NOW() WHERE id=$1`, repoID)
	return err
}

// ── Commits ──────────────────────────────────────────────────────────────────

func (d *DB) BulkUpsertCommits(ctx context.Context, commits []*models.Commit) error {
	if len(commits) == 0 {
		return nil
	}
	_, err := d.pool.CopyFrom(ctx, pgx.Identifier{"commits"},
		[]string{"repo_id", "hash", "short_hash", "author_name", "author_email",
			"message", "committed_at", "branch", "parents", "files_changed", "insertions", "deletions"},
		pgx.CopyFromSlice(len(commits), func(i int) ([]any, error) {
			c := commits[i]
			return []any{
				c.RepoID, c.Hash, c.ShortHash, c.AuthorName, c.AuthorEmail,
				c.Message, c.CommittedAt, c.Branch, c.Parents, c.FilesChanged,
				c.Insertions, c.Deletions,
			}, nil
		}),
	)
	return err
}

func (d *DB) SearchCommits(ctx context.Context, repoID int, f models.CommitFilter) ([]*models.Commit, int, error) {
	where := []string{"repo_id=$1"}
	args := []any{repoID}
	n := 2

	if f.Query != "" {
		where = append(where, fmt.Sprintf("(search_vector @@ plainto_tsquery('english',$%d) OR message ILIKE $%d OR hash ILIKE $%d)", n, n+1, n+1))
		args = append(args, f.Query, "%"+f.Query+"%")
		n += 2
	}
	if f.Author != "" {
		where = append(where, fmt.Sprintf("author_name ILIKE $%d", n))
		args = append(args, "%"+f.Author+"%")
		n++
	}
	if f.Branch != "" {
		where = append(where, fmt.Sprintf("branch=$%d", n))
		args = append(args, f.Branch)
		n++
	}
	if f.FilePath != "" {
		where = append(where, fmt.Sprintf("$%d=ANY(files_changed)", n))
		args = append(args, f.FilePath)
		n++
	}
	if f.DateFrom != nil {
		where = append(where, fmt.Sprintf("committed_at>=$%d", n))
		args = append(args, *f.DateFrom)
		n++
	}
	if f.DateTo != nil {
		where = append(where, fmt.Sprintf("committed_at<=$%d", n))
		args = append(args, *f.DateTo)
		n++
	}

	cond := strings.Join(where, " AND ")
	limit := f.Limit
	if limit == 0 {
		limit = 100
	}

	var total int
	_ = d.pool.QueryRow(ctx, "SELECT COUNT(*) FROM commits WHERE "+cond, args...).Scan(&total)

	args = append(args, limit, f.Offset)
	rows, err := d.pool.Query(ctx, `
		SELECT id,repo_id,hash,short_hash,author_name,author_email,message,committed_at,branch,parents,files_changed,insertions,deletions
		FROM commits WHERE `+cond+fmt.Sprintf(` ORDER BY committed_at DESC LIMIT $%d OFFSET $%d`, n, n+1),
		args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []*models.Commit
	for rows.Next() {
		var c models.Commit
		if err := rows.Scan(&c.ID, &c.RepoID, &c.Hash, &c.ShortHash, &c.AuthorName, &c.AuthorEmail,
			&c.Message, &c.CommittedAt, &c.Branch, &c.Parents, &c.FilesChanged, &c.Insertions, &c.Deletions); err != nil {
			return nil, 0, err
		}
		if c.Parents == nil {
			c.Parents = []string{}
		}
		if c.FilesChanged == nil {
			c.FilesChanged = []string{}
		}
		out = append(out, &c)
	}
	if out == nil {
		out = []*models.Commit{}
	}
	return out, total, rows.Err()
}

func (d *DB) GetCommit(ctx context.Context, repoID int, hash string) (*models.Commit, error) {
	var c models.Commit
	err := d.pool.QueryRow(ctx, `
		SELECT id,repo_id,hash,short_hash,author_name,author_email,message,committed_at,branch,parents,files_changed,insertions,deletions
		FROM commits WHERE repo_id=$1 AND (hash=$2 OR short_hash=$2)`, repoID, hash).
		Scan(&c.ID, &c.RepoID, &c.Hash, &c.ShortHash, &c.AuthorName, &c.AuthorEmail,
			&c.Message, &c.CommittedAt, &c.Branch, &c.Parents, &c.FilesChanged, &c.Insertions, &c.Deletions)
	if c.Parents == nil {
		c.Parents = []string{}
	}
	if c.FilesChanged == nil {
		c.FilesChanged = []string{}
	}
	return &c, err
}

func (d *DB) Autocomplete(ctx context.Context, repoID int, q string) (*models.AutocompleteResult, error) {
	res := &models.AutocompleteResult{}

	// Authors
	res.Authors = make([]string, 0)
	arows, _ := d.pool.Query(ctx, `SELECT DISTINCT author_name FROM commits WHERE repo_id=$1 AND author_name ILIKE $2 LIMIT 8`, repoID, "%"+q+"%")
	defer arows.Close()
	for arows.Next() {
		var s string
		arows.Scan(&s)
		res.Authors = append(res.Authors, s)
	}

	// Branches
	res.Branches = make([]string, 0)
	brows, _ := d.pool.Query(ctx, `SELECT DISTINCT branch FROM commits WHERE repo_id=$1 AND branch ILIKE $2 LIMIT 8`, repoID, "%"+q+"%")
	defer brows.Close()
	for brows.Next() {
		var s string
		brows.Scan(&s)
		res.Branches = append(res.Branches, s)
	}

	// Commit messages / hashes
	res.Commits = make([]struct {
		Hash    string `json:"hash"`
		Message string `json:"message"`
	}, 0)
	crows, _ := d.pool.Query(ctx, `
		SELECT hash, message FROM commits
		WHERE repo_id=$1 AND (message ILIKE $2 OR hash ILIKE $2)
		ORDER BY committed_at DESC LIMIT 10`, repoID, "%"+q+"%")
	defer crows.Close()
	for crows.Next() {
		var h, m string
		crows.Scan(&h, &m)
		res.Commits = append(res.Commits, struct {
			Hash    string `json:"hash"`
			Message string `json:"message"`
		}{h, m})
	}

	return res, nil
}

// ── Charts ───────────────────────────────────────────────────────────────────

func (d *DB) CommitFrequency(ctx context.Context, repoID int) ([]*models.ChartData, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT TO_CHAR(committed_at,'YYYY-MM-DD') as day, COUNT(*) as cnt
		FROM commits WHERE repo_id=$1 AND committed_at >= NOW()-INTERVAL '90 days'
		GROUP BY day ORDER BY day`, repoID)
	if err != nil {
		return []*models.ChartData{}, err
	}
	defer rows.Close()
	out := make([]*models.ChartData, 0)
	for rows.Next() {
		var c models.ChartData
		rows.Scan(&c.Label, &c.Count)
		out = append(out, &c)
	}
	return out, rows.Err()
}

func (d *DB) AuthorActivity(ctx context.Context, repoID int) ([]*models.ChartData, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT author_name, COUNT(*) as cnt FROM commits WHERE repo_id=$1
		GROUP BY author_name ORDER BY cnt DESC LIMIT 20`, repoID)
	if err != nil {
		return []*models.ChartData{}, err
	}
	defer rows.Close()
	out := make([]*models.ChartData, 0)
	for rows.Next() {
		var c models.ChartData
		rows.Scan(&c.Label, &c.Count)
		out = append(out, &c)
	}
	return out, rows.Err()
}

func (d *DB) FileHotspots(ctx context.Context, repoID int) ([]*models.ChartData, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT f, COUNT(*) as cnt
		FROM commits, UNNEST(files_changed) AS f
		WHERE repo_id=$1
		GROUP BY f ORDER BY cnt DESC LIMIT 20`, repoID)
	if err != nil {
		return []*models.ChartData{}, err
	}
	defer rows.Close()
	out := make([]*models.ChartData, 0)
	for rows.Next() {
		var c models.ChartData
		rows.Scan(&c.Label, &c.Count)
		out = append(out, &c)
	}
	return out, rows.Err()
}

// ── Navigation log ───────────────────────────────────────────────────────────

func (d *DB) LogNavigation(ctx context.Context, log *models.NavigationLog) error {
	_, err := d.pool.Exec(ctx, `
		INSERT INTO navigation_log (repo_id,action,from_hash,to_hash,notes)
		VALUES ($1,$2,$3,$4,$5)`,
		log.RepoID, log.Action, log.FromHash, log.ToHash, log.Notes)
	return err
}

func (d *DB) ListNavigationLog(ctx context.Context, repoID int) ([]*models.NavigationLog, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT id,repo_id,action,from_hash,to_hash,notes,created_at
		FROM navigation_log WHERE repo_id=$1 ORDER BY created_at DESC LIMIT 50`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.NavigationLog
	for rows.Next() {
		var l models.NavigationLog
		rows.Scan(&l.ID, &l.RepoID, &l.Action, &l.FromHash, &l.ToHash, &l.Notes, &l.CreatedAt)
		out = append(out, &l)
	}
	return out, rows.Err()
}

// ── Filter presets ───────────────────────────────────────────────────────────

func (d *DB) SaveFilterPreset(ctx context.Context, p *models.FilterPreset) (*models.FilterPreset, error) {
	var out models.FilterPreset
	err := d.pool.QueryRow(ctx, `
		INSERT INTO filter_presets (repo_id,name,filters) VALUES ($1,$2,$3)
		RETURNING id,repo_id,name,filters,created_at`,
		p.RepoID, p.Name, p.Filters).
		Scan(&out.ID, &out.RepoID, &out.Name, &out.Filters, &out.CreatedAt)
	return &out, err
}

func (d *DB) ListFilterPresets(ctx context.Context, repoID int) ([]*models.FilterPreset, error) {
	rows, err := d.pool.Query(ctx, `SELECT id,repo_id,name,filters,created_at FROM filter_presets WHERE repo_id=$1 ORDER BY created_at DESC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.FilterPreset
	for rows.Next() {
		var p models.FilterPreset
		rows.Scan(&p.ID, &p.RepoID, &p.Name, &p.Filters, &p.CreatedAt)
		out = append(out, &p)
	}
	return out, rows.Err()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (d *DB) DeleteRepo(ctx context.Context, id int) error {
	_, err := d.pool.Exec(ctx, `DELETE FROM repositories WHERE id=$1`, id)
	return err
}

func (d *DB) CommitCount(ctx context.Context, repoID int) (int, error) {
	var n int
	err := d.pool.QueryRow(ctx, `SELECT COUNT(*) FROM commits WHERE repo_id=$1`, repoID).Scan(&n)
	return n, err
}

func (d *DB) DistinctAuthors(ctx context.Context, repoID int) ([]string, error) {
	rows, err := d.pool.Query(ctx, `SELECT DISTINCT author_name FROM commits WHERE repo_id=$1 ORDER BY author_name`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) DistinctBranches(ctx context.Context, repoID int) ([]string, error) {
	rows, err := d.pool.Query(ctx, `SELECT DISTINCT branch FROM commits WHERE repo_id=$1 ORDER BY branch`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out, rows.Err()
}

// DistinctFiles returns the top 200 most-changed file paths for a repo.
func (d *DB) DistinctFiles(ctx context.Context, repoID int) ([]string, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT f, COUNT(*) as cnt
		FROM commits, UNNEST(files_changed) AS f
		WHERE repo_id=$1
		GROUP BY f ORDER BY cnt DESC LIMIT 200`, repoID)
	if err != nil {
		return []string{}, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var s string
		var cnt int
		rows.Scan(&s, &cnt)
		out = append(out, s)
	}
	return out, rows.Err()
}

// DateRange returns earliest and latest commit timestamps for a repo.
func (d *DB) DateRange(ctx context.Context, repoID int) (time.Time, time.Time, error) {
	var from, to time.Time
	err := d.pool.QueryRow(ctx, `SELECT MIN(committed_at), MAX(committed_at) FROM commits WHERE repo_id=$1`, repoID).Scan(&from, &to)
	return from, to, err
}

// DistinctDates returns every unique commit date (yyyy/mm/dd) for a repo, ordered newest first.
func (d *DB) DistinctDates(ctx context.Context, repoID int) ([]string, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT DISTINCT TO_CHAR(committed_at, 'YYYY/MM/DD') AS day
		FROM commits WHERE repo_id=$1
		ORDER BY day DESC`, repoID)
	if err != nil {
		return []string{}, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out, rows.Err()
}
