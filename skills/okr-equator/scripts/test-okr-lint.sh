#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="python3 $DIR/okr-lint.py"

pass=0
fail=0

run_case() {
  local file="$1" expect="$2"
  local out
  out="$($PY "$DIR/fixtures/$file" 2>&1)" && actual=0 || actual=$?
  if [ "$actual" = "$expect" ]; then
    echo "OK   $file (exit $actual)"
    pass=$((pass+1))
  else
    echo "FAIL $file (expected exit $expect, got $actual)"
    echo "$out"
    fail=$((fail+1))
  fi
}

run_case "valid-equator.md" 0
run_case "invalid-missing-section.md" 1
run_case "invalid-bad-status.md" 1
run_case "invalid-no-pipe-table.md" 1
run_case "valid-equator-prose-after-table.md" 0

echo "---"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
