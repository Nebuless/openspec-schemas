# Project Knowledge Base

## Overview

Copyable OpenSpec workflow schemas, companion skill manifests, and optional Compound Engineering adapters. Node CLI packages schema installation; OpenSpec owns schema lifecycle and validation.

## Structure

```text
bin/                 Package CLI.
scripts/             Installers, quality checks, linters, offline tests.
openspec/schemas/    Self-contained, publishable schema packages.
openspec/specs/      Repository-level normative OpenSpec specifications.
openspec/changes/    Active and archived development history; excluded from npm payload.
.opencode/           OpenCode adapter projection.
.senpi/ .pi/ .atomic/ Host adapter projections.
```

## Where To Look

| Task | Location | Notes |
|---|---|---|
| Pick/install schema | `README.md`, `AGENT_INSTALL.md`, `bin/openspec-schemas.js` | Installer validates before mutation. |
| Create/refine schema | `openspec/schemas/<name>/` | Read local schema README and `schema.yaml`. |
| Add Compound command | `openspec/schemas/compound-intent-driven/adapters/shared/` | Canonical source; update all projections. |
| Quality/release | `CONTRIBUTING.md`, `scripts/quality.sh`, `package.json` | CI only wraps portable checks. |
| Package payload | `package.json` | `files` allowlist is release boundary. |

## Commands

```sh
npm test
npm run check -- --require-qlty
npm run lint:markdown
npm run changelog:add -- --type Added --message "describe change"
npm pack --dry-run
openspec schema validate <schema-name>
node bin/openspec-schemas.js list
node bin/openspec-schemas.js verify
```

## Conventions

- Schema folders remain standalone and copyable: `schema.yaml`, `README.md`, `skills.txt`, matching `templates/`.
- Validate every changed schema. Update schema README, root docs, and explicit `CHANGELOG.md` Unreleased entry when relevant.
- Commit subjects: `type(optional-scope): lower-case description`; max 72 chars. Hooks are opt-in via `sh scripts/install-git-hooks.sh`.
- Package release is manual. Run tests, strict quality, and tarball inspection before publish. Do not store publish credentials or release automation here.
- `.omo/` is local runtime state. Never edit, package, lint, or commit it. Also exclude local `.qlty` results and dependency directories.

## Safety Boundaries

- Installers preflight all target collisions. Keep symlink checks, declared-target-only `--force`, and validation-before-mutation behavior.
- Do not add independent CE plans, trackers, commits, branches, pushes, issues, PRs, or automatic OpenSpec stage advancement.
- Host adapters are projections, not independent workflows. Canonical content lives under `openspec/schemas/compound-intent-driven/adapters/shared/`.
