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
run_case "valid-equator-prose-after-table.md" 0
run_case "invalid-malformed-row-typo.md" 1

# OKR-документ
run_case "valid-okr.md" 0
run_case "invalid-okr-process-kr.md" 1
run_case "invalid-okr-delta-gap.md" 1
run_case "invalid-okr-missing-part2-block.md" 1
run_case "invalid-okr-empty-where.md" 1
run_case "invalid-okr-source.md" 1
run_case "invalid-okr-heading-in-part1.md" 1
run_case "invalid-okr-emdash.md" 1

# тип документа не определяется
run_case "invalid-unknown-doc.md" 1

# явное указание типа перекрывает автоопределение
out="$($PY --type equator "$DIR/fixtures/valid-okr.md" 2>&1)" && actual=0 || actual=$?
if [ "$actual" = "1" ]; then
  echo "OK   valid-okr.md --type equator (exit 1, ожидаемо)"
  pass=$((pass+1))
else
  echo "FAIL valid-okr.md --type equator (expected exit 1, got $actual)"
  echo "$out"
  fail=$((fail+1))
fi

echo "---"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
