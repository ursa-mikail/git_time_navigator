#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀  Git Time Navigator — Starting up..."

# Copy .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📄  Created .env from .env.example"
fi

# Free ports if occupied
for PORT in 5173 8080 5432; do
  PID=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "⚡  Freeing port $PORT (PID $PID)..."
    kill -9 "$PID" 2>/dev/null || true
  fi
done

docker compose up --build -d

echo ""
echo "✅  All services running!"
echo "   Frontend  → http://localhost:5173"
echo "   Backend   → http://localhost:8080"
echo "   Postgres  → localhost:5432"
echo ""
echo "   Run ./scripts/down.sh  to stop"
echo "   Run ./scripts/clean.sh to remove everything"
