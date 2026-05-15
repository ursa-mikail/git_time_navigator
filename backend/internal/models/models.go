package models

import "time"

type Repository struct {
	ID            int        `json:"id"`
	URL           string     `json:"url"`
	Name          string     `json:"name"`
	Owner         string     `json:"owner"`
	LocalPath     string     `json:"local_path,omitempty"`
	DefaultBranch string     `json:"default_branch"`
	LastSynced    *time.Time `json:"last_synced,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Commit struct {
	ID           int       `json:"id"`
	RepoID       int       `json:"repo_id"`
	Hash         string    `json:"hash"`
	ShortHash    string    `json:"short_hash"`
	AuthorName   string    `json:"author_name"`
	AuthorEmail  string    `json:"author_email"`
	Message      string    `json:"message"`
	CommittedAt  time.Time `json:"committed_at"`
	Branch       string    `json:"branch"`
	Parents      []string  `json:"parents"`
	FilesChanged []string  `json:"files_changed"`
	Insertions   int       `json:"insertions"`
	Deletions    int       `json:"deletions"`
}

type FilterPreset struct {
	ID        int            `json:"id"`
	RepoID    int            `json:"repo_id"`
	Name      string         `json:"name"`
	Filters   map[string]any `json:"filters"`
	CreatedAt time.Time      `json:"created_at"`
}

type NavigationLog struct {
	ID        int       `json:"id"`
	RepoID    int       `json:"repo_id"`
	Action    string    `json:"action"`
	FromHash  string    `json:"from_hash,omitempty"`
	ToHash    string    `json:"to_hash"`
	Notes     string    `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CommitFilter struct {
	Query     string     `json:"query"`
	Author    string     `json:"author"`
	Branch    string     `json:"branch"`
	FilePath  string     `json:"file_path"`
	DateFrom  *time.Time `json:"date_from,omitempty"`
	DateTo    *time.Time `json:"date_to,omitempty"`
	Limit     int        `json:"limit"`
	Offset    int        `json:"offset"`
}

type ChartData struct {
	Label  string `json:"label"`
	Count  int    `json:"count"`
	Series string `json:"series,omitempty"`
}

type DiffFile struct {
	Path      string `json:"path"`
	OldPath   string `json:"old_path,omitempty"`
	Status    string `json:"status"` // added, removed, modified, renamed
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch,omitempty"`
}

type RepoCloneRequest struct {
	URL           string `json:"url"`
	APIToken      string `json:"api_token,omitempty"`
	SSHKeyPath    string `json:"ssh_key_path,omitempty"`
	SSHPassphrase string `json:"ssh_passphrase,omitempty"`
	SSHKeyPEM     string `json:"ssh_key_pem,omitempty"`
}

type SwitchRequest struct {
	RepoID   int    `json:"repo_id"`
	Hash     string `json:"hash"`
	Mode     string `json:"mode"` // checkout | reset | branch
	Branch   string `json:"branch,omitempty"`
	APIToken string `json:"api_token,omitempty"`
}

type WSMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type AutocompleteResult struct {
	Authors  []string `json:"authors"`
	Branches []string `json:"branches"`
	Files    []string `json:"files"`
	Commits  []struct {
		Hash    string `json:"hash"`
		Message string `json:"message"`
	} `json:"commits"`
}
