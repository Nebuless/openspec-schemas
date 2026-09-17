#!/bin/sh
set -eu
[ "$#" -eq 0 ] || { printf 'usage: install-git-hooks.sh\n' >&2; exit 2; }
command -v git >/dev/null 2>&1 || { printf 'git required\n' >&2; exit 1; }
command -v qlty >/dev/null 2>&1 || { printf 'qlty required\n' >&2; exit 1; }
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
existing=$(git config --get core.hooksPath || :)
if [ -n "$existing" ] && [ "$existing" != .githooks ]; then
  printf 'Refusing to replace existing core.hooksPath: %s\n' "$existing" >&2
  exit 1
fi
git config --local core.hooksPath .githooks
printf 'Hooks enabled. Remove with: git config --local --unset core.hooksPath\n'
