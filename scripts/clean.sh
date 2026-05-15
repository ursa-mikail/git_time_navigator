#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🧹  Cleaning Git Time Navigator (containers + volumes + images)..."

docker compose down --volumes --remove-orphans

# Remove built images
docker rmi gitnav_backend gitnav_frontend 2>/dev/null || true
docker rmi git-time-navigator-backend git-time-navigator-frontend 2>/dev/null || true

# Free ports
for PORT in 5173 8080 5432; do
  PID=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "⚡  Freeing port $PORT (PID $PID)..."
    kill -9 "$PID" 2>/dev/null || true
  fi
done

echo "✅  Clean complete. Run ./scripts/up.sh to start fresh."
