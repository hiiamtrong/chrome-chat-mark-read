#!/bin/sh
set -eu
# Chrome dung chung instance/profile mac dinh nen lan chay thu hai bi treo: moi fixture mot --user-data-dir rieng.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
FAIL=0

for page in fixture structural; do
  profile="$(mktemp -d)"
  echo "=== $page"
  result="$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" \
    --virtual-time-budget=120000 --dump-dom "file://$DIR/$page.html" 2>/dev/null \
    | grep -oE '(<title>[^<]*</title>|(PASS|FAIL) [^<]*)' || true)"
  echo "$result" | grep -E '^(PASS|FAIL) ' || true
  case "$result" in
    *FAIL*) FAIL=1 ;;
  esac
  echo "$result" | head -1
done

exit "$FAIL"
