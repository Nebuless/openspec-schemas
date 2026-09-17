#!/bin/sh
set -eu
mode=optional
case $# in
  0) ;;
  1) case $1 in --require-qlty) mode=required ;; --skip-qlty) mode=skip ;; *) printf 'quality: unknown argument: %s\n' "$1" >&2; exit 2 ;; esac ;;
  *) printf 'usage: quality.sh [--require-qlty|--skip-qlty]\n' >&2; exit 2 ;;
esac
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
command -v openspec >/dev/null 2>&1 || { printf 'quality: openspec required\n' >&2; exit 1; }
if [ "$mode" = required ]; then
  command -v qlty >/dev/null 2>&1 || { printf 'quality: qlty required\n' >&2; exit 1; }
fi
export OPENSPEC_TELEMETRY=0
for test in scripts/test-*.sh; do sh "$test"; done
for test in scripts/test-*.js; do node "$test"; done
node scripts/lint-markdown.js
node scripts/update-changelog.js --check
for schema in openspec/schemas/*/schema.yaml; do
  name=${schema%/schema.yaml}
  openspec schema validate "${name##*/}"
done
git diff --check
git diff --cached --check
if [ "$mode" != skip ]; then
  if command -v qlty >/dev/null 2>&1; then qlty check --all; else printf 'quality: qlty absent; skipped (use --require-qlty to enforce)\n'; fi
fi
