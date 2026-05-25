#!/bin/bash
# Usage: ./scripts/colorize-all.sh https://your-domain.vercel.app lumiere2026
BASE_URL=${1:-http://localhost:3000}
SECRET=${2:-lumiere2026}
PAGE=0

echo "Starting color extraction from $BASE_URL"

while true; do
  echo -n "Page $PAGE... "
  RESPONSE=$(curl -s "$BASE_URL/api/cache/colorize?secret=$SECRET&page=$PAGE")
  echo $RESPONSE

  DONE=$(echo $RESPONSE | grep -o '"done":true')
  if [ -n "$DONE" ]; then
    echo "All done!"
    break
  fi

  PAGE=$((PAGE + 1))
  sleep 2
done
