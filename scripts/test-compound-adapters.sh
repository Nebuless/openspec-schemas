#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
shared=$root/openspec/schemas/compound-intent-driven/adapters/shared
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
fail() { printf 'test-compound-adapters: %s\n' "$1" >&2; exit 1; }
contains() { grep -F "$2" "$1" >/dev/null || fail "$1 missing $2"; }
for directory in "$shared" "$root/.opencode/commands" "$root/.senpi/prompts" "$root/.pi/prompts" "$root/.atomic/prompts"; do
	set -- "$directory"/opsx-ce-*.md
	[ "$#" -eq 7 ] || fail "expected seven files in $directory"
done
for name in define plan work debug review validate compound; do
	file=opsx-ce-$name.md
	body=$shared/$file
	[ -s "$body" ] || fail "missing $body"
	{
		IFS= read -r opening
		IFS= read -r description
		IFS= read -r closing
		[ "$opening" = --- ] && [ "$closing" = --- ] || fail "invalid frontmatter: $file"
		case $description in 'description: '?*) ;; *) fail "missing description: $file" ;; esac
		cat
	} <"$root/.opencode/commands/$file" >"$tmp/body"
	cmp "$body" "$tmp/body" || fail "OpenCode parity: $file"
	cmp "$body" "$root/.senpi/prompts/$file" || fail "Senpi parity: $file"
	cmp "$body" "$root/.pi/prompts/$file" || fail "Pi parity: $file"
	cmp "$body" "$root/.atomic/prompts/$file" || fail "Atomic parity: $file"
	for phrase in 'explicit change' 'unambiguous existing change' 'openspec status --change "<change>" --json' "reject any schemaName other than \`compound-intent-driven\`" 'openspec instructions' 'concrete dependency path' 'contextFiles' 'settled artifacts instead of re-asking plan/work scope' 'owned' 'parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance' "Refresh \`openspec status" 'Return outcome, proof' 'mutations' 'blocker' 'actionContext'; do
		contains "$body" "$phrase"
	done
done
contains "$shared/opsx-ce-define.md" 'instructions proposal'
contains "$shared/opsx-ce-define.md" 'ce-brainstorm'
contains "$shared/opsx-ce-plan.md" 'ce-plan'
contains "$shared/opsx-ce-plan.md" 'Never skip gates'
contains "$shared/opsx-ce-plan.md" 'tasks requires specs and adr'
contains "$shared/opsx-ce-work.md" 'Stop after one task'
contains "$shared/opsx-ce-work.md" 'ce-simplify-code'
contains "$shared/opsx-ce-debug.md" 'Reproduce before fixing'
contains "$shared/opsx-ce-review.md" 'fix only verified in-scope findings'
contains "$shared/opsx-ce-validate.md" 'openspec validate <change> --type change --strict'
contains "$shared/opsx-ce-validate.md" 'openspec schema validate compound-intent-driven'
contains "$shared/opsx-ce-compound.md" 'only one eligible learning or none'
printf 'test-compound-adapters: passed (7 canonical bodies, 28 host resources)\n'
