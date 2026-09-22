# Project Knowledge Base

## Purpose

Copyable OpenSpec workflow schemas, companion skill manifests, and Compound Engineering adapters. Node CLI packages installation; OpenSpec owns lifecycle and validation.

## Ownership

| Area | Owner | Notes |
|---|---|---|
| Public install/release docs and CLI | Root docs, `package.json`, `bin/` | Package `@nebulesstech/openspec-schemas`; released beta `0.1.9`, stable `1.8.0` latest candidate. Root README stays concise; AGENT_INSTALL owns change-local schema procedures. |
| Installers, lint, test | `scripts/` | Portable core; CI and hooks delegate here. |
| Schema packages | `openspec/schemas/` | Self-contained publishable directories. |
| Canonical Compound commands | `openspec/schemas/compound-intent-driven/adapters/shared/` | Host paths are projections. |
| Normative specs/history | `openspec/specs/`, `openspec/changes/` | Changes excluded from published payload. |

## Local Contracts

- Schema packages contain `schema.yaml`, `README.md`, `skills.txt`, optional strict `mcp.yaml` catalogs, and matching templates.
- Run `nub run test`, `nub run check --require-qlty`, and schema validation for changed schemas.
- Update relevant docs and an explicit `CHANGELOG.md` Unreleased entry.
- Commit subject: `type(optional-scope): lower-case description`, max 72 chars.
- Installer safety is contract: preflight collisions, reject symlinks, and let `--force` replace declared targets only.
- Change-local schema updates dry-run by default, mutate only `.openspec.yaml` with `--apply`, and require `--allow-incompatible` for graph mismatches.
- Native `opsx-schema handoff` uses OpenSpec list, status, and schema resolution as authority; it rejects completed, archived, external, or named-store changes and reports deterministic graph diffs before metadata-only transfer.
- Native `opsx-schema` read commands expose stable JSON envelopes for project state, diagnostics, schema resolution, and managed skill state; mutations stay explicit through `--yes`, `--apply`, `--force`, and `--allow-incompatible`. View previews show bounded summaries; incompatible handoffs require explicit acknowledgement and a new preview before exact confirmation.
- `bin/opsx-ipc-protocol.js` owns the versioned v2 private envelope contract; `bin/opsx-view-actions.js` owns parent-side preview tokens, selector validation, worker-bounded supported mutations, and cancellation fencing. Sidecar receives no raw command, filesystem, environment, or token-rendering authority.
- `.omo/` and generated `.qlty` state are local. Never edit, package, lint, or commit them.
- No CE-native plan/tracker or automatic commits, branches, pushes, issues, PRs, or OpenSpec stage advancement.

## Documentation Map

| Document | Audience | Owner |
|---|---|---|
| [`README.md`](./README.md) | Users choosing and installing a published schema | Root public docs |
| [`AGENT_INSTALL.md`](./AGENT_INSTALL.md) | Coding agents performing complete package, skill, adapter, or fallback installation | Root install docs |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Contributors and maintainers running local quality, CLI, and release operations | Root contributor docs |
| [`docs/architecture/`](./docs/architecture/) | Reviewers of durable architecture designs and implementation plans | Architecture docs |
| [`openspec/schemas/*/README.md`](./openspec/schemas/) | Users and agents needing schema-specific fit, activation, artifacts, and skills | Each schema package |
| [`openspec/specs/agent-install-guide/spec.md`](./openspec/specs/agent-install-guide/spec.md) | Changes to agent installation guidance | Normative install contract |
| [`openspec/specs/custom-schema-packaging/spec.md`](./openspec/specs/custom-schema-packaging/spec.md) | Changes to root catalog or schema packaging docs | Normative packaging contract |
| [`.agents/skills/writing-for-agents/SKILL.md`](./.agents/skills/writing-for-agents/SKILL.md) | Agent-facing pointers, `AGENTS.md`, or skill docs | Writing guidance |

## Work Guidance

```sh
nub install
nub run test
nub run check --require-qlty
nub run changelog:add --type Added --message "describe change"
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas list
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas validate <schema-name>
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas verify
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas install <schema-name> -t <dir> [-sk] [-a <opencode|senpi|pi|atomic>] [-i] [--force]
openspec schema validate <schema-name>
node bin/openspec-schemas.js list
node bin/openspec-schemas.js validate <schema-name>
node bin/openspec-schemas.js verify
node bin/opsx-schema.js handoff <change> <schema> [-t <project>] [--apply] [--allow-incompatible] [--json]
```

Nub owns package management through `packageManager`, `devEngines.packageManager`, and `nub.lock`. Package releases remain manual. Core consumers may use `--no-optional`; persistent Node 26 view consumers declare the pinned OpenTUI runtime dependencies at the consumer root before the first install, retain their lockfile, and use frozen installs for repeats. Inspect release artifact and run a clean-project Nub smoke test before publishing; use `latest` only for approved stable releases, never store credentials or add automatic publishing.
Public usage is Nub-first. `-a|--agents` accepts only `opencode`, `senpi`,
`pi`, or `atomic` and requires `compound-intent-driven`; `--agent` and `--host`
remain compatibility aliases. Keep local `node bin/openspec-schemas.js` commands for
maintainers and shell installers for local or unreleased fallback only.
With `--mcp`, selectors instead choose `atomic`, `omp`, `opencode`, or `pi`;
MCP installs never run Compound adapters. Host config preflight precedes all
mutations, Pi is guided-only, and OpenCode JSONC is accepted only when JSON or
empty/new so comments are never stripped. OpenCode servers are direct
`mcp.<server>` entries. Public `validate` and `verify` include optional catalog
security validation. Later MCP opt-in reuses an installed schema without
`--force`; a failed MCP config write leaves no partial schema install.

## Verification

- `package.json.files` is published payload boundary.
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

- OpenSpec skills and commands use CLI-authoritative artifact metadata, never guessed change roots. Specs globs require concrete non-empty `<changeRoot>/specs/<capability>/spec.md` files; keep local host copies and shipped adapter projections aligned.
- Compound envelope work keeps OpenSpec as artifact, task, and lifecycle authority. Planning records stable unit, batch, layer, path claim, proof, and continuation fields. Outer loops may use only pre-created, outer-owned worktrees after isolation checks; bounded workers and adapters never manage worktrees or create commits, pushes, pull requests, archival, or separate state.
- Keep plans and architecture designs in `docs/architecture/`; keep ADRs and specs in their OpenSpec-owned repository paths. Do not leave durable review artifacts only outside the repository.

## Child DOX Index

| Path | Scope |
|---|---|
| `scripts/AGENTS.md` | Installer safety, portable quality, linting, and tests. |
| `.agents/skills/writing-for-agents/` | Installed guidance for concise agent-facing documents. |
| `docs/architecture/AGENTS.md` | Durable architecture designs and implementation plans. |
| `openspec/schemas/AGENTS.md` | Self-contained schema authoring and validation. |
| `openspec/schemas/compound-intent-driven/adapters/shared/AGENTS.md` | Canonical `/opsx-ce-*` adapter contracts and projection parity. |
| `src/tui/AGENTS.md` | Isolated OpenTUI ESM sidecar and terminal lifecycle boundary. |
