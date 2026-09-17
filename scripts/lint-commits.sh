#!/bin/sh
set -eu
[ "$#" -le 1 ] || { printf 'usage: lint-commits.sh [revision-range|HEAD]\n' >&2; exit 2; }
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
exec node "$root/scripts/lint-commit-msg.js" --range "${1:-${COMMIT_RANGE:-HEAD}}"
