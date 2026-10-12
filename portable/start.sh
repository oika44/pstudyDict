#!/bin/sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js をインストールしてください: https://nodejs.org/"; exit 1; }
( sleep 1; xdg-open http://localhost:4321 2>/dev/null || open http://localhost:4321 2>/dev/null ) &
exec node server.mjs
