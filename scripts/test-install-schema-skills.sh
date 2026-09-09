#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INSTALLER=$ROOT/scripts/install-schema-skills.sh
TMP=$(mktemp -d)

cleanup() {
	rm -rf "$TMP"
}
trap cleanup 0

fail() {
	echo "test-install-schema-skills: $1" >&2
	exit 1
}

write_manifest() {
	mkdir -p "$1"
	printf '%s\n' "$2" >"$1/skills.txt"
}

[ -x "$INSTALLER" ] || fail "installer must be executable"
TAB=$(printf '\t')

# Source-aware installation clones two sources and preserves full directories.
SOURCE_AWARE=$TMP/source-aware
write_manifest "$SOURCE_AWARE" "intent-driven-dev/skills${TAB}.agents/skills/gherkin-authoring
mattpocock/skills${TAB}skills/productivity/grilling"
"$INSTALLER" "$SOURCE_AWARE" "$TMP/target"
[ -f "$TMP/target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "intent-driven skill missing"
[ -f "$TMP/target/.agents/skills/grilling/SKILL.md" ] || fail "Matt skill missing"

# Existing source manifests remain valid.
LEGACY=$TMP/legacy
write_manifest "$LEGACY" "gherkin-authoring"
"$INSTALLER" "$LEGACY" "$TMP/legacy-target"
[ -f "$TMP/legacy-target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "legacy manifest install missing"

# Inherited Git config cannot redirect installer clones.
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=http.proxy \
GIT_CONFIG_VALUE_0=http://127.0.0.1:1 \
"$INSTALLER" "$LEGACY" "$TMP/config-isolation-target"
[ -f "$TMP/config-isolation-target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "Git configuration isolation failed"

# A collision fails without replacing the local copy, then --force replaces it.
printf 'local customization\n' >"$TMP/target/.agents/skills/grilling/SENTINEL"
if "$INSTALLER" "$SOURCE_AWARE" "$TMP/target"; then
	fail "collision without --force succeeded"
fi
[ -f "$TMP/target/.agents/skills/grilling/SENTINEL" ] || fail "collision changed local skill"
"$INSTALLER" "$SOURCE_AWARE" "$TMP/target" --force
[ ! -e "$TMP/target/.agents/skills/grilling/SENTINEL" ] || fail "--force did not replace local skill"

# Malformed declarations fail before creating the target tree.
MALFORMED=$TMP/malformed
write_manifest "$MALFORMED" "mattpocock/skills${TAB}../skills/engineering/tdd"
if "$INSTALLER" "$MALFORMED" "$TMP/malformed-target"; then
	fail "malformed declaration succeeded"
fi
[ ! -e "$TMP/malformed-target" ] || fail "malformed declaration mutated target"

# --force refuses a non-directory collision before replacing any declared skill.
rm -rf "$TMP/target/.agents/skills/grilling"
printf 'local file\n' >"$TMP/target/.agents/skills/grilling"
if "$INSTALLER" "$SOURCE_AWARE" "$TMP/target" --force; then
	fail "--force replaced a non-directory target"
fi
[ -f "$TMP/target/.agents/skills/grilling" ] || fail "non-directory target changed"

echo "test-install-schema-skills: passed"
