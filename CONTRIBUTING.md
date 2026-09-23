# Contributing

This repo contains OpenSpec workflow schemas (folders under `openspec/schemas/`). Contributions typically add a new schema or refine an existing one.

## Prerequisites

- OpenSpec CLI installed and available as `openspec`

## Repo Layout

- Schemas live in `openspec/schemas/<schema-name>/`
  - `schema.yaml`
  - `templates/` (markdown templates used by `openspec instructions ...`)

## How Schemas Are Used

In a project, schemas are selected in `openspec/config.yaml` (for example by setting a default schema name). In this repository, schemas must remain copyable as self-contained folders under `openspec/schemas/`.

## Create Or Customize A Schema

### If you are using OpenCode (recommended)

Use the repo skill:

- `openspec-schema-authoring`

It guides you through `openspec schema init` / `openspec schema fork`, validation, and repo layout expectations.

### If you are NOT using OpenCode

Discover available schema sources (repo + upstream):
```bash
openspec schemas --json
```

Create a new schema from scratch:
```bash
openspec schema init <schema-name> --description "..." --artifacts "proposal,specs,design,tasks"
```

Or customize an existing schema (recommended):
```bash
openspec schema fork <source> [new-schema-name]
```

## Validate Before You Open A PR

Run validation for each schema you changed under `openspec/schemas/`:
```bash
openspec schema validate <schema-name>
```

If you are debugging schema resolution (e.g., you are not sure which schema folder is being used):
```bash
openspec schema which <schema-name>
```

## Maintainer CLI

Use the local CLI when testing changes from this checkout:

```sh
node bin/openspec-schemas.js list
node bin/openspec-schemas.js validate <schema-name>
node bin/openspec-schemas.js verify
node bin/openspec-schemas.js install <schema-name> -t /path/to/project -i
node bin/openspec-schemas.js install intent-driven-design -t /path/to/project --mcp all -a opencode
node bin/openspec-schemas.js set-change-schema <change> <schema> -t /path/to/project
node bin/openspec-schemas.js set-change-schema <change> <schema> -t /path/to/project --apply
node bin/opsx-schema.js view
```

`list` works without OpenSpec. `validate`, `verify`, and `install` require an
installed OpenSpec CLI. Use `validate <schema-name>` for one changed schema;
`verify` remains the compatibility check for every packaged schema. Both
commands also validate optional `mcp.yaml` catalog security metadata. Published
usage is Nub-first. See [`AGENT_INSTALL.md`](./AGENT_INSTALL.md) for package
installation, change-local schema updates, optional skills and adapters, and
local fallback details. `set-change-schema` is a dry run by default. Applying
updates only the selected change's `.openspec.yaml`; incompatible artifact
graphs require explicit `--allow-incompatible`.

## Local Quality And Opt-In Hooks

Package core targets Node >=20. The locked full toolchain for OpenSpec requires Node.js >=20.19.0. Nub, POSIX shell, Git, and OpenSpec are required. Node.js 24 runs the standard suite, including networked skill-installer integration tests. Node.js 26.4+ stable on Linux x64 glibc with a real non-dumb
TTY runs the native OpenTUI suite. Run `nub install` to provision project
dependencies, then run `nub run test` on Node 24 and `nub run test:tui` on the
Node 26.4 runtime. Use `$(mise where node@26)/bin/node --experimental-ffi scripts/test-opsx-view-native.mjs` when the runtime manager requires an explicit executable. Persistent view consumers must declare `@opentui/core@0.5.11` and `web-tree-sitter@0.25.10` at the consumer root before the first Nub install, retain the consumer lockfile, and use frozen installs for repeats. `opsx-schema view` has the same requirements. Targeted offline checks include `node scripts/test-artifact-layout.js`, `sh scripts/test-compound-adapters.sh`, and local lint scripts; they do not replace the standard networked suite. For each change, update relevant documentation and add a
matching entry under `CHANGELOG.md`'s Unreleased `Added`, `Changed`, or `Fixed`
section. For example:

```sh
nub run changelog:add --type Added --message "Describe change."
nub run test
nub run test:tui
nub run check --require-qlty
```

Package engine stays Node >=20. Node 26 global latest serves optional native
OpenTUI, not package engine. Quality checks don't query update services, run
background network checks, or update dependency versions automatically.

Changelog updates are explicit; hooks never infer or generate entries. Keep the
entry aligned with the conventional commit's scope and description. Commit
subjects use `type(optional-scope): lower-case description`, with one of
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, or `test`; the description is at most 72 characters. Run individual
checks with `nub run lint:markdown`, `nub run lint:commit --message
"docs: explain workflow"`, or `sh scripts/lint-commits.sh main..HEAD`.

The portable gate runs every shell and Node test, Markdown and changelog checks,
all local schema validations, and Git whitespace checks. Installed Qlty runs
with `qlty check --all`;
`--require-qlty` fails when absent, while `--skip-qlty` explicitly skips it.
The script does not install tools. Provision Qlty and its ShellCheck plugin
before offline use; Qlty may need its own plugin cache on first invocation.
Schema validation covers YAML semantics; Markdown content has adapter parity
tests. Qlty adds ShellCheck without broad Markdown style churn.

Hooks are never enabled automatically. With Git and Qlty available, run:

```sh
sh scripts/install-git-hooks.sh
```

This sets local `core.hooksPath` to `.githooks`, refuses an existing different
hook path, and never copies into `.git/hooks`. The commit-message hook checks
conventional subjects. Pre-commit checks staged Markdown and staged whitespace
without mutation or network access. Pre-push runs the full strict gate and
checks commits being pushed; it does not update the changelog, commit, or push
anything itself. Remove hooks with
`git config --local --unset core.hooksPath`. CI is a thin GitHub wrapper around
the same portable commands; no publishing or cloud upload is configured.

## Manual Release Checklist

Check current dist-tags with `npm view @nebulesstech/openspec-schemas version dist-tags`. Use `beta` for beta publication and `latest` only for an approved stable release.

1. Confirm ownership/access for `@nebulesstech/openspec-schemas`, review MIT licensing, and choose a new unpublished version.
2. Update `package.json`, `CHANGELOG.md`, and `publishConfig.tag` together. Use `beta` for beta releases. Set `latest` only after explicit stable approval.
3. Run `nub run test` and `nub run check --require-qlty`.
4. Review the allowlisted payload: CLI, two installers, schemas, declared host adapters, docs, license. No local runtime state, credentials, `.omo`, or root lockfile.
5. In a temporary directory, unpack a local tarball with `tar`, then exercise list, verify, and installation with an already installed OpenSpec CLI. Keep clean install and lockfile unchanged unless dependency metadata intentionally changed.
6. Publish manually only after review and authorization, explicitly using the selected channel tag and public access. No release credentials belong in this repository or workflow.
7. Inspect release artifact manually, then smoke-test the selected channel with `nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas list` and verify its dist-tag. Use `latest` only for an approved stable release.

## Schema PR Checklist

- `openspec schema validate <schema-name>` passes for every schema you changed
- `templates/` contains templates for every artifact declared in `schema.yaml`
- Schema README added/updated if appropriate
- Any repo docs that reference contributing are updated to point to this guide
- Compound envelope changes keep OpenSpec authoritative, keep task checkbox text parser-safe, and preserve adapter bans on lifecycle management and repository side effects
