#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking Docker availability..."
docker --version >/dev/null
docker compose version >/dev/null

# Load env vars if .env exists
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

MODEL="${OLLAMA_MODEL:-llava:latest}"

echo "==> Starting stack (docker compose up -d --build)..."
docker compose up -d --build

echo "==> Waiting for Ollama to be reachable on http://localhost:11434..."
retries=60
until curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "Timed out waiting for Ollama. Check container logs: docker compose logs -f ollama"
    exit 1
  fi
  sleep 1
done

echo "==> Checking if model \"$MODEL\" is available..."
if ! docker compose exec -T ollama ollama list 2>/dev/null | grep -q "$MODEL"; then
  echo "==> Pulling model \"$MODEL\"..."
  docker compose exec -T ollama ollama pull "$MODEL"
else
  echo "==> Model \"$MODEL\" already present."
fi

cat <<'MSG'
==> All set.
- Open http://localhost:3000
- View logs: docker compose logs -f
- Stop: ./scripts/stop.sh
MSG
