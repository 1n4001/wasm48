#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  npm run dev >>/tmp/app-startup.log 2>&1 &
  i=0
  while [ "$i" -lt 40 ]; do
    if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
      break
    fi
    i=$((i + 1))
    sleep 0.25
  done
fi
# Point the live preview at this server and serve it without the sign-in redirect.
curl -sf -o /dev/null --max-time 2 -X POST \
  -H 'content-type: application/json' \
  -d '{"port":8080}' \
  http://127.0.0.1:6015/__control/target || true
curl -sf -o /dev/null --max-time 2 -X POST \
  -H 'content-type: application/json' \
  -d '{"mode":"public"}' \
  http://127.0.0.1:6015/__control/visibility || true
