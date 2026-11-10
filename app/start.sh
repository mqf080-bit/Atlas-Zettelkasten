#!/usr/bin/env bash
# Start Tag Atlas: local server with API + vault watcher, then open the browser.
# Usage: ./start.sh [--no-open]
set -euo pipefail
cd "$(dirname "$0")"
RUN=".run"
mkdir -p "$RUN"

api_up() {
  curl -fsS --max-time 1 "http://127.0.0.1:$1/api/health" >/dev/null 2>&1
}

http_up() {
  curl -fsS --max-time 1 "http://127.0.0.1:$1/" >/dev/null 2>&1
}

PORT=""
for candidate in $(seq 4173 4180); do
  if api_up "$candidate"; then
    PORT="$candidate"
    break
  fi
done

if [ -z "$PORT" ]; then
  for candidate in $(seq 4173 4180); do
    if ! http_up "$candidate"; then
      PORT="$candidate"
      break
    fi
  done
fi

if [ -z "$PORT" ]; then
  echo "No free local port between 4173 and 4180." >&2
  exit 1
fi

if ! api_up "$PORT"; then
  nohup python3 serve.py --port "$PORT" >"$RUN/server.log" 2>&1 &
  echo $! >"$RUN/server.pid"
  for _ in $(seq 1 50); do
    api_up "$PORT" && break
    sleep 0.2
  done
fi

if ! api_up "$PORT"; then
  echo "Could not start the server. See $RUN/server.log" >&2
  exit 1
fi

URL="http://127.0.0.1:$PORT/"
echo "Atlas: $URL"
echo "Logs:  $RUN/server.log"

if [ "${1:-}" != "--no-open" ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$URL" >/dev/null 2>&1 &
  else
    echo "Open $URL in your browser."
  fi
fi
