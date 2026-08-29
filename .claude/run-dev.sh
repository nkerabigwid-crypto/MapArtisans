#!/bin/sh
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec npm --prefix frontend run dev -- -p 3000
