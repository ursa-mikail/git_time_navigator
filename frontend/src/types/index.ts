export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  changed?: boolean
  children?: TreeNode[]
}

export interface Repository {
  id: number
  url: string
  name: string
  owner: string
  local_path?: string
  default_branch: string
  last_synced?: string
  created_at: string
}

export interface Commit {
  id: number
  repo_id: number
  hash: string
  short_hash: string
  author_name: string
  author_email: string
  message: string
  committed_at: string
  branch: string
  parents: string[]
  files_changed: string[]
  insertions: number
  deletions: number
}

export interface CommitFilter {
  q?: string
  author?: string
  branch?: string
  file?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface ChartData {
  label: string
  count: number
  series?: string
}

export interface DiffFile {
  path: string
  old_path?: string
  status: 'added' | 'removed' | 'modified' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

export interface AutocompleteResult {
  authors: string[]
  branches: string[]
  files: string[]
  commits: { hash: string; message: string }[]
}

export interface FilterPreset {
  id: number
  repo_id: number
  name: string
  filters: CommitFilter
  created_at: string
}

export interface WSMessage {
  type: string
  payload: Record<string, unknown>
}

export interface SwitchRequest {
  repo_id: number
  hash: string
  mode: 'checkout' | 'reset' | 'branch' | 'push'
  branch?: string
  api_token?: string
}

export interface NavigationLog {
  id: number
  repo_id: number
  action: string
  from_hash?: string
  to_hash: string
  notes?: string
  created_at: string
}
