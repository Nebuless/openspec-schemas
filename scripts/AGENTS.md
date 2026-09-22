# Scripts Guide

## Purpose

POSIX installers plus Node stdlib lint/tests. Scripts are portable source of truth; hooks and CI call them.

## Ownership

| Area | Files | Rule |
|---|---|---|
| Schema skills | `install-schema-skills.sh` | Manifest preflight before clone/copy; source-qualified entries use literal tabs. |
| Compound adapters | `install-compound-adapters.sh` | Exactly seven declared adapter files per supported host. |
| Package CLI tests | `test-release.js`, `test-opsx-schema.js`, `test-opsx-skills.js` | Protect CLI collision, activation, schema-local MCP catalogs, host detection/config safety, OPSX commands, managed skills, change-local schema updates, package allowlist, and hook behavior. |
| Native handoff tests | `test-opsx-handoff.js` | Protect parser, OpenSpec authority, graph diff, metadata transaction, rollback, and packed CLI behavior. |
| View runtime tests | `test-opsx-view.js`, `test-opsx-view-native.mjs` | Keep Node20-safe parser/preflight/spawn checks separate from supported Node26.4 FFI renderer smoke. |
| Artifact layout | `test-artifact-layout.js` | Protect CLI-authoritative paths, concrete non-empty specs, all host guidance, and adapter projection parity. |
| Quality | `quality.sh` | Runs tests, Markdown/changelog checks, every schema validation, Git whitespace, optional/required Qlty. |
| Commit/changelog | `lint-*.js`, `update-changelog.js` | No dependencies; changelog edits are explicit. |

## Local Contracts

- Shell: POSIX `sh`, `set -eu`, quote paths, support spaces, no Bash features.
- Preflight all files before mutation. Reject unsafe links, overlap, malformed paths, and undeclared collisions.
- `--force` replaces only declared regular targets; never delete unrelated files or follow symlinks.
- MCP config preflight completes before schema copy; failed config writes roll back schema installation, and later MCP opt-in reuses an installed schema without `--force`.
- Public schema validation includes optional catalog checks; remote catalogs contain no auth, headers, secrets, or network calls.
- `set-change-schema` dry-runs unless `--apply` is explicit, updates only the selected change's `.openspec.yaml`, and gates graph mismatches behind `--allow-incompatible`.
- `opsx-schema handoff` adds strict pre-authority parsing, active selected-change authority, deterministic graph diff output, detected-race checks, fresh-status postflight, and owned rollback; Node filesystem rename is not an atomic compare-and-swap primitive.
- View behavior remains covered by the existing view test surfaces; Todo 10 production protocol/action changes are kept outside test files and verified by Sol.
- Tests may intentionally print expected installer errors. Assert exit status, safety, and no partial mutation.
- Keep scripts executable when used as hooks/installers.

## Work Guidance

```sh
nub run test
sh scripts/quality.sh --require-qlty
sh -n scripts/*.sh
node --check scripts/*.js
```

## Verification

- Install tools, publish packages, or access credentials from a quality/test script.
- Add network dependency to offline adapter/release tests.
- Weaken collision or validation checks to simplify an install path.

## Child DOX Index

No child DOX files. Scripts are one tightly coupled quality and installer boundary.
