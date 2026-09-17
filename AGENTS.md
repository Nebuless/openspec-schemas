# Project Knowledge Base

## Purpose

Copyable OpenSpec workflow schemas, companion skill manifests, and Compound Engineering adapters. Node CLI packages installation; OpenSpec owns lifecycle and validation.

## Ownership

| Area | Owner | Notes |
|---|---|---|
| Public install/release docs | Root docs, `package.json`, `bin/` | Package `@nebulesstech/openspec-schemas`; beta `0.1.6`, latest `0.1.5`. |
| Installers, lint, test | `scripts/` | Portable core; CI and hooks delegate here. |
| Schema packages | `openspec/schemas/` | Self-contained publishable directories. |
| Canonical Compound commands | `openspec/schemas/compound-intent-driven/adapters/shared/` | Host paths are projections. |
| Normative specs/history | `openspec/specs/`, `openspec/changes/` | Changes excluded from npm payload. |

## Local Contracts

- Schema packages contain `schema.yaml`, `README.md`, `skills.txt`, and matching templates.
- Run `npm test`, `npm run check -- --require-qlty`, and schema validation for changed schemas.
- Update relevant docs and an explicit `CHANGELOG.md` Unreleased entry.
- Commit subject: `type(optional-scope): lower-case description`, max 72 chars.
- Installer safety is contract: preflight collisions, reject symlinks, and let `--force` replace declared targets only.
- `.omo/` and generated `.qlty` state are local. Never edit, package, lint, or commit them.
- No CE-native plan/tracker or automatic commits, branches, pushes, issues, PRs, or OpenSpec stage advancement.

## Work Guidance

```sh
nubx -y @nebulesstech/openspec-schemas@beta list
nubx -y @nebulesstech/openspec-schemas@beta validate <schema-name>
nubx -y @nebulesstech/openspec-schemas@beta verify
nubx -y @nebulesstech/openspec-schemas@beta install <schema-name> -t <dir> [-sk] [-a <opencode|senpi|pi|atomic>] [-i] [--force]
npm test
npm run check -- --require-qlty
npm run changelog:add -- --type Added --message "describe change"
npm pack --dry-run
openspec schema validate <schema-name>
node bin/openspec-schemas.js list
node bin/openspec-schemas.js validate <schema-name>
node bin/openspec-schemas.js verify
```

Public usage is NubJS-first. `-a|--agents` accepts only `opencode`, `senpi`,
`pi`, or `atomic` and requires `compound-intent-driven`; `--agent` and `--host`
remain compatibility aliases. Keep local `node bin/openspec-schemas.js` commands for
maintainers and shell installers for local or unreleased fallback only.

Package releases are manual. Inspect tarball and run a clean-project smoke test before `npm publish --tag beta`; never store credentials or add automatic publishing.

## Verification

- `package.json.files` is npm payload boundary.
- `.github/workflows/quality.yml` is a thin wrapper around portable quality checks.
- `sh scripts/install-git-hooks.sh` is opt-in; no hook installs itself.

## DOX Framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

| Path | Scope |
|---|---|
| `scripts/AGENTS.md` | Installer safety, portable quality, linting, and tests. |
| `openspec/schemas/AGENTS.md` | Self-contained schema authoring and validation. |
| `openspec/schemas/compound-intent-driven/adapters/shared/AGENTS.md` | Canonical `/opsx-ce-*` adapter contracts and projection parity. |
