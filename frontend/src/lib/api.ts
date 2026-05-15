import axios from 'axios'
import type {
  Repository, Commit, CommitFilter, ChartData,
  DiffFile, AutocompleteResult, FilterPreset, NavigationLog, SwitchRequest, TreeNode
} from '../types'

const BASE = (import.meta.env.VITE_API_URL as string) || ''
const api = axios.create({ baseURL: BASE })

// Safely extract data; fall back to a default if null/undefined
function safe<T>(data: T | null | undefined, fallback: T): T {
  return data ?? fallback
}

export const repoApi = {
  list: () =>
    api.get<Repository[]>('/api/repos').then(r => safe(r.data, [] as Repository[])),
  clone: (url: string, api_token?: string, ssh_key_path?: string, ssh_passphrase?: string) =>
    api.post<Repository>('/api/repos', { url, api_token, ssh_key_path, ssh_passphrase }).then(r => r.data),
  delete: (id: number) => api.delete(`/api/repos/${id}`),
  sync: (id: number, api_token?: string, ssh_key_path?: string) =>
    api.post(`/api/repos/${id}/sync`, { api_token, ssh_key_path }),
}

export const commitApi = {
  list: (id: number, filter: CommitFilter = {}) =>
    api.get<{ commits: Commit[]; total: number }>(`/api/repos/${id}/commits`, { params: filter })
      .then(r => ({
        commits: Array.isArray(r.data?.commits) ? r.data.commits : [],
        total:   typeof r.data?.total === 'number' ? r.data.total : 0,
      })),
  get: (id: number, hash: string) =>
    api.get<Commit>(`/api/repos/${id}/commits/${hash}`).then(r => r.data),
  autocomplete: (id: number, q: string) =>
    api.get<AutocompleteResult>(`/api/repos/${id}/autocomplete`, { params: { q } })
      .then(r => ({
        authors:  Array.isArray(r.data?.authors)  ? r.data.authors  : [],
        branches: Array.isArray(r.data?.branches) ? r.data.branches : [],
        files:    Array.isArray(r.data?.files)    ? r.data.files    : [],
        commits:  Array.isArray(r.data?.commits)  ? r.data.commits  : [],
      } as AutocompleteResult)),
  diff: (id: number, from: string, to: string) =>
    api.get<DiffFile[]>(`/api/repos/${id}/diff`, { params: { from, to } })
      .then(r => Array.isArray(r.data) ? r.data : [] as DiffFile[]),
}

export const chartApi = {
  frequency: (id: number) =>
    api.get<ChartData[]>(`/api/repos/${id}/charts/frequency`)
      .then(r => Array.isArray(r.data) ? r.data : [] as ChartData[]),
  authors: (id: number) =>
    api.get<ChartData[]>(`/api/repos/${id}/charts/authors`)
      .then(r => Array.isArray(r.data) ? r.data : [] as ChartData[]),
  hotspots: (id: number) =>
    api.get<ChartData[]>(`/api/repos/${id}/charts/hotspots`)
      .then(r => Array.isArray(r.data) ? r.data : [] as ChartData[]),
}

export const actionApi = {
  switch: (req: SwitchRequest) =>
    api.post(`/api/repos/${req.repo_id}/switch`, req).then(r => r.data),
}

export const metaApi = {
  authors: (id: number) =>
    api.get<string[]>(`/api/repos/${id}/authors`)
      .then(r => Array.isArray(r.data) ? r.data : [] as string[]),
  branches: (id: number) =>
    api.get<string[]>(`/api/repos/${id}/branches`)
      .then(r => Array.isArray(r.data) ? r.data : [] as string[]),
  navLog: (id: number) =>
    api.get<NavigationLog[]>(`/api/repos/${id}/log`)
      .then(r => Array.isArray(r.data) ? r.data : [] as NavigationLog[]),
  presets: (id: number) =>
    api.get<FilterPreset[]>(`/api/repos/${id}/presets`)
      .then(r => Array.isArray(r.data) ? r.data : [] as FilterPreset[]),
  savePreset: (id: number, name: string, filters: CommitFilter) =>
    api.post<FilterPreset>(`/api/repos/${id}/presets`, { name, filters }).then(r => r.data),
}

export const treeApi = {
  get: (repoId: number, hash: string) =>
    api.get<TreeNode>(`/api/repos/${repoId}/commits/${hash}/tree`).then(r => r.data),
  fileContent: (repoId: number, hash: string, path: string) =>
    api.get<{ content: string; path: string }>(
      `/api/repos/${repoId}/commits/${hash}/file`, { params: { path } }
    ).then(r => r.data),
}

export const wsConnect = (onMessage: (msg: { type: string; payload: Record<string, unknown> }) => void): WebSocket => {
  const wsBase = BASE.replace(/^http/, 'ws') || `ws://${window.location.host}`
  const ws = new WebSocket(`${wsBase}/ws`)
  ws.onmessage = e => {
    try { onMessage(JSON.parse(e.data)) } catch { /* ignore malformed */ }
  }
  ws.onerror = () => { /* silent — reconnect handled in hook */ }
  return ws
}
