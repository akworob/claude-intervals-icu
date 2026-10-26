#!/bin/sh
# Starts hhopke/intervals-icu-mcp over stdio with the credentials kept in
# ~/.config/intervals-icu/credentials.env, the same file the /forma panel reads.
# Version pinned: bump it deliberately after reading the server's changelog.
set -e
CREDENTIALS="$HOME/.config/intervals-icu/credentials.env"
if [ ! -f "$CREDENTIALS" ]; then
  echo "intervals-icu: missing $CREDENTIALS (see README)" >&2
  exit 1
fi
set -a
. "$CREDENTIALS"
set +a
export INTERVALS_ICU_DELETE_MODE="${INTERVALS_ICU_DELETE_MODE:-safe}"
UVX=$(command -v uvx || echo "$HOME/.local/bin/uvx")
exec "$UVX" intervals-icu-mcp==5.7.1
