# 🕰️ Git Time Navigator

A **visual Git time machine** — browse history, jump between commits, filter by author/date/file, view analytics charts, and control your repository through a stunning UI.

---

## Features

- **Visual commit timeline** — interactive graph with color-coded branches
- **Click-to-switch** — checkout any commit locally or push to remote
- **Real-time search** — auto-complete powered by PostgreSQL full-text search
- **Live filter panel** — author, date range, file path, keyword
- **Analytics charts** — commit frequency, author activity, file hotspots
- **GitHub API integration** — paste your token once, control remote branches
- **Guided UX** — tooltips, walkthroughs, and contextual help throughout

---

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | TypeScript · React 18 · Vite        |
| Backend   | Go 1.22 · Chi router · WebSockets   |
| Database  | PostgreSQL 16 · pgx/v5              |
| Git ops   | go-git · GitHub REST API            |
| Container | Docker · Docker Compose             |

---

## Quick Start

```bash
# Clone / unzip project
cd git-time-navigator

# Start everything
./scripts/up.sh

# Open browser
open http://localhost:5173
```

The UI will guide you from there.

---

## Scripts

| Script              | Purpose                                |
|---------------------|----------------------------------------|
| `./scripts/up.sh`   | Build images and start all services    |
| `./scripts/down.sh` | Stop all services                      |
| `./scripts/clean.sh`| Stop + remove volumes, images, orphans |

---

## First-time Setup in UI

1. **Connect a repo** — paste a GitHub repo URL (`https://github.com/owner/repo`)
2. **Add API token** — enter your `gh_***` GitHub token for write operations
3. **Load history** — backend fetches commits into PostgreSQL
4. **Explore** — filter, chart, click, switch!

---

## Ports

| Service    | Port  |
|------------|-------|
| Frontend   | 5173  |
| Backend    | 8080  |
| PostgreSQL | 5432  |

All ports are freed on `clean.sh`.

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```env
POSTGRES_USER=gitnav
POSTGRES_PASSWORD=gitnav
POSTGRES_DB=gitnavdb
BACKEND_PORT=8080
VITE_API_URL=http://localhost:8080
```

---

## Architecture

```
Browser (React/TS)
    │  WebSocket (live updates)
    │  REST (commits, filters, actions)
    ▼
Go Backend (Chi)
    │  pgx/v5
    ▼
PostgreSQL ─── Full-text search index on commits
    │
Go Backend ─── go-git (local ops) + GitHub API (remote ops)
```

---

## Security Notes

- GitHub tokens are **never stored in the database** — held in-memory per session
- Force-push operations require explicit confirmation in the UI
- All destructive actions show a diff preview before executing

---

## License

MIT
