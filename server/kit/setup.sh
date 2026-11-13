#!/usr/bin/env bash
# GP Mastering separation server: set up or update it on Modal (macOS / Linux).
# Run from this folder:  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3.10 or newer is needed. Install it from https://www.python.org/downloads/ and run this again."
  exit 1
fi

echo "== 1/4  Installing Modal's command-line tool"
"$PY" -m pip install --quiet --upgrade "modal==1.6.4" || "$PY" -m pip install --quiet --user --upgrade "modal==1.6.4"

echo "== 2/4  Signing in to Modal"
if [ -z "${MODAL_TOKEN_ID:-}" ] && [ ! -f "$HOME/.modal.toml" ]; then
  echo "A browser window opens: sign in to Modal (or create a free account) and approve."
  "$PY" -m modal setup
else
  echo "Already signed in."
fi

echo "== 3/4  Access token"
if [ -s access-token.txt ]; then
  TOKEN="$(tr -d '\r\n' < access-token.txt)"
  echo "Using the token saved in access-token.txt."
else
  TOKEN="$("$PY" -c 'import secrets; print(secrets.token_urlsafe(24))')"
  printf '%s\n' "$TOKEN" > access-token.txt
  chmod 600 access-token.txt
  echo "Made a new token and saved it in access-token.txt."
fi
"$PY" -m modal secret create gpm-sep "GPM_TOKEN=$TOKEN" --force >/dev/null

echo "== 4/4  Deploying (the first time takes a few minutes)"
LOG="$(mktemp)"
"$PY" -m modal deploy modal_app.py 2>&1 | tee "$LOG"
URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.modal\.run' "$LOG" | head -n 1 || true)"
rm -f "$LOG"

echo
echo "Done. In GP Mastering, under Stem balance, choose Separate on: My server and enter:"
echo "  Address: ${URL:-(see the web function on the deployment page linked above)}"
echo "  Token:   $TOKEN"
