# Scripts Guide

## Purpose

POSIX installers plus Node stdlib lint/tests. Scripts are portable source of truth; hooks and CI call them.

## Ownership

| Area | Files | Rule |
|---|---|---|
| Schema skills | `install-schema-skills.sh` | Manifest preflight before clone/copy; source-qualified entries use literal tabs. |
| Compound adapters | `install-compound-adapters.sh` | Exactly seven declared adapter files per supported host. |
| Package CLI tests | `test-release.js` | Protect CLI collision, activation, package allowlist, and hook behavior. |
| Quality | `quality.sh` | Runs tests, Markdown/changelog checks, every schema validation, Git whitespace, optional/required Qlty. |
| Commit/changelog | `lint-*.js`, `update-changelog.js` | No dependencies; changelog edits are explicit. |

## Local Contracts

- Shell: POSIX `sh`, `set -eu`, quote paths, support spaces, no Bash features.
- Preflight all files before mutation. Reject unsafe links, overlap, malformed paths, and undeclared collisions.
- `--force` replaces only declared regular targets; never delete unrelated files or follow symlinks.
- Tests may intentionally print expected installer errors. Assert exit status, safety, and no partial mutation.
- Keep scripts executable when used as hooks/installers.

## Work Guidance

```sh
npm test
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
