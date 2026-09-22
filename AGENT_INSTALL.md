# Agent Install Guide

Package core targets Node >=20; the locked full toolchain for OpenSpec requires
Node.js >=20.19.0.

Use this flow when installing any schema from this repository into an existing OpenSpec project. Schemas declare companion skills in a `skills.txt` manifest inside the schema directory; Step 6 installs every declared skill into the target project. The repository currently includes `intent-driven`, `intent-driven-engineering`, `intent-driven-superpowers`, `compound-intent-driven`, `intent-driven-design`, `behaviour-driven`, `spec-driven-with-adr`, `event-driven`, and `minimalist` schemas; the clone is authoritative if that list changes.

## Prerequisites

1. Run `openspec --version` in the target project. Confirm OpenSpec is installed and the CLI version is at least `1.0.0`.
2. If `openspec --version` fails, reports a version below `1.0.0`, or `openspec/config.yaml` is missing, stop and tell the user to install or upgrade OpenSpec and run `openspec init` first. Do not continue until these prerequisites are met.

`opsx-schema` reads source authority from the installed package and project state
from OpenSpec metadata in the target project. Use `opsx-schema inspect --json`
to read project state and `opsx-schema doctor --json` for diagnostics. These are
read commands. They don't install, activate, migrate, or archive anything.

Use explicit flags in agent runs. `--apply`, `--yes`, `--force`, and
`--allow-incompatible` are opt-in controls, not implicit behavior. Keep JSON on
stdout when a command supports `--json`; use its exit status and structured
`diagnostics` field.

## Step 1 — Install from Published Package

Use the published package for released schemas. Nub's explicit remote runner
fetches and runs its `openspec-schemas` binary. `list` needs no OpenSpec CLI;
`install` requires the prerequisite OpenSpec CLI from this guide:

```bash
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas list
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas validate <schema-name>
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas install <schema-name> \
  -t . -sk -i
```

The package-specific cooling-window exemption permits the selected beta while
keeping Nub's release-age policy for all other packages. The package installer
validates before mutation, refuses collisions unless `--force` is explicit, and
does not install OpenSpec or host runtimes; Nub or the package manager may
resolve package-declared optional dependencies. `verify`
remains a compatibility command that validates every bundled schema; prefer
`validate <schema-name>` for one schema.

```bash
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas verify
```

### Persistent Node 26 View Runtime

The package core targets Node >=20 and can be installed with `--no-optional`
when view is not needed. A persistent Node.js 26 view consumer must declare the
package plus both pinned runtime dependencies before the first Nub install:

```json
{
  "dependencies": {
    "@nebulesstech/openspec-schemas": "0.1.8"
  },
  "optionalDependencies": {
    "@opentui/core": "0.5.11",
    "web-tree-sitter": "0.25.10"
  }
}
```

Keep the consumer lockfile and use `nub install --frozen` for repeat installs.
A bare local tar Nub install may omit package optional edges. Schema-copy
`nub dlx` does not create a persistent view runtime. Use
`$(mise where node@26)/bin/node --experimental-ffi scripts/test-opsx-view-native.mjs`
for the Node 26 runtime;
unsupported or dependency-missing view falls back to `opsx-schema inspect --json`
or `opsx-schema doctor`.

Install Compound adapters by adding `-a <host>`:

```bash
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas install compound-intent-driven \
  -t . -sk -a <opencode|senpi|pi|atomic> -i
```

`-a|--agents` accepts only `opencode`, `senpi`, `pi`, or `atomic` and requires
`compound-intent-driven`. `--agent` and `--host` are compatibility aliases for
`--agents`.
Install syntax is `install <schema> [-t|--target <dir>] [-sk|--skills]
[-a|--agents <host>] [--agent <host>] [--host <host>] [-i|--activate] [--force]`.

## Changing a Change's Schema

`openspec/config.yaml` sets the project default for new changes. An existing
change pins its schema in that change's `.openspec.yaml`; changing the project
default doesn't change the pinned schema.

Install the destination schema first if the project doesn't already have it.
Then preview the change-local update from the project directory:

```bash
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas set-change-schema <change> <schema> -t .
```

The command is a dry run unless `--apply` is present. It reports compatibility
and planned mutation without changing files. Apply a compatible update with:

```bash
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas set-change-schema <change> <schema> -t . --apply
```

The native equivalent is `opsx-schema handoff <change> <schema>`. It uses
OpenSpec list, status, and schema resolution as authority, reports graph
differences, and changes only selected change metadata with `--apply`. It
rejects completed, archived, external, and named-store changes. It doesn't
rewrite artifacts or create archive records. `--allow-incompatible` acknowledges
reported graph differences; it doesn't migrate artifacts.

Syntax is `set-change-schema <change> <schema> [-t|--target <project>]
[--apply] [--allow-incompatible]`.

Use this flow before implementation or during an active change. The command
never migrates artifacts automatically. With `--apply`, it updates only the
change's `.openspec.yaml`; it doesn't edit `openspec/config.yaml`, install a
schema, or rewrite artifact files. If source and destination artifact graphs
don't match, review the reported differences and pass `--allow-incompatible`
explicitly with `--apply`. Then reconcile existing artifacts yourself against
the destination schema.

Don't rewrite a completed change. It remains historical under its pinned
schema. Install or activate the desired project default as needed, then create
a new change under that schema.

Stop after successful package installation. Use the remaining steps only for
an unreleased branch, fork, or local checkout.

## Local or Unreleased Fallback

Clone the source:

```bash
git clone https://github.com/Nebuless/openspec-schemas.git /tmp/openspec-schemas
```

### Step 2 — Select a Schema

**If the user already named a schema**, check that it exists in the clone:

```bash
test -d /tmp/openspec-schemas/openspec/schemas/<schema-name>
```

If the directory exists, proceed with that schema. If it does not exist, fall through to the enumeration path below.

**If no schema was named** (or the named schema was not found), list what is available and ask the user to pick exactly one:

```bash
ls /tmp/openspec-schemas/openspec/schemas/
```

Do not proceed with copy/activation until exactly one schema name is confirmed.

### Step 3 — Copy the Schema

Copy the chosen schema directory (referred to as `<schema-name>` below) into the target project. Copy the full directory recursively to keep `schema.yaml`, the schema `README.md`, and all nested `templates/` files together. Choose one of these install locations:

**Option A — Project local (recommended):**

```bash
mkdir -p ./openspec/schemas
cp -R /tmp/openspec-schemas/openspec/schemas/<schema-name> ./openspec/schemas/<schema-name>
```

**Option B — User level (available across projects):**

```bash
cp -R /tmp/openspec-schemas/openspec/schemas/<schema-name> $HOME/.openspec/schemas/<schema-name>
```

### Step 4 — Activate the Schema

Update `openspec/config.yaml` in the target project to activate the installed schema:

```yaml
schema: <schema-name>
```

Also update the `rules` keys to match the artifact IDs in the schema's `schema.yaml` (`artifacts[].id`). For example:

- `intent-driven` uses `proposal`, `specs`, `design`, `adr`, and `tasks` → set those as `rules` keys
- `intent-driven-design` uses `journey`, `proposal`, `specs`, `design`, `adr`, and `tasks`; its exact graph is `journey -> proposal -> (specs, design) -> adr -> tasks`
- Check `openspec/schemas/<schema-name>/schema.yaml` (`artifacts[].id`) for the exact IDs of your chosen schema

Some schemas require additional `openspec/config.yaml` keys. Check the chosen
schema's README before validating. `behaviour-driven`, `intent-driven`,
`intent-driven-engineering`, and `intent-driven-superpowers` require
`stack: javascript` or `stack: python` when their opt-in executable spec skills
are enabled. Other schemas need no additional activation keys.

### Step 5 — Validate

Run:

```bash
openspec schema validate <schema-name>
```

Expected result: command exits with status 0 and reports the selected schema as valid. Exact output varies by OpenSpec CLI version.

Replace `intent-driven` with the schema name you installed. If validation fails, report the error output to the user.

### Step 6 — Install Associated Skills

Inspect profile resources before mutation:

```bash
opsx-schema skills inspect --schema <schema-name> --profile default --json
opsx-schema skills doctor --json
```

Skill profiles are dry-run by default. Apply only after reviewing planned
targets. Use `--force` only when replacing safe unmanaged directories at
declared targets is approved. It never bypasses managed drift, symlink, or
ownership checks. Existing files outside declared targets remain untouched.

Check whether the installed schema declares associated skills. The manifest lives inside the schema directory you copied in Step 3:

**Option A install:**

```bash
cat ./openspec/schemas/<schema-name>/skills.txt
```

**Option B install:**

```bash
cat $HOME/.openspec/schemas/<schema-name>/skills.txt
```

**If there is no `skills.txt`**, skip this step — the schema has no associated skills.

Run the source-aware installer from this repository clone:

**Option A install:**

```bash
bash /tmp/openspec-schemas/scripts/install-schema-skills.sh \
  ./openspec/schemas/<schema-name> .
```

**Option B install:**

```bash
bash /tmp/openspec-schemas/scripts/install-schema-skills.sh \
  $HOME/.openspec/schemas/<schema-name> .
```

The installer supports two `skills.txt` forms:

```text
<skill-name>
<github-owner/repository><TAB><repository-relative-skill-directory>
```

Bare names remain compatible with existing schemas and resolve from `intent-driven-dev/skills/.agents/skills/<skill-name>`. Source-qualified lines let a schema declare a complete skill directory from another GitHub repository. The separator is one literal tab.

- The installer clones each declared source repository once, validates every declaration before target mutation, then copies complete skill directories into `./.agents/skills/`.
  - If a target skill directory already exists, it stops without changing that directory. Ask the user whether to preserve it or explicitly replace only safe unmanaged directories at declared targets with `--force`. Managed drift, symlinks, ownership mismatches, and existing files at skill paths remain refusals:

  ```bash
  bash /tmp/openspec-schemas/scripts/install-schema-skills.sh \
    ./openspec/schemas/<schema-name> . --force
  ```

- If a declared source or skill path is invalid or unavailable, it exits nonzero before copying any skills. Report the error instead of installing a partial set.

Finish by listing what the installer installed, for example:

```text
install-schema-skills: installed skills: architectural-decision-records, openspec-git-discipline -> ./.agents/skills/
```

For source-qualified manifests, `<github-owner/repository>` identifies the
repository and the tab-delimited path identifies the complete skill directory
inside it. The installer validates all declarations and source paths before
mutating the target, and clones each unique source repository once. A schema
may mix legacy and source-qualified lines; duplicate destination skill names
are rejected.

For `intent-driven-design`, the source-qualified manifest installs these five
baseline skill directories: `impeccable`, `grill-me`, `grill-with-docs`,
`grilling`, and `domain-modeling`. The specialist routes in its schema README
remain on demand and are not declared in `skills.txt`; install only routes the
user approves after checking their source, license, host compatibility, and
collision policy.

`intent-driven-superpowers` combines skills from
`intent-driven-dev/skills`, `mattpocock/skills`, and `obra/superpowers`. Install
it with the same command above; no separate plugin installation is required.

### Step 7: Install Compound Command Adapters

For `compound-intent-driven`, Step 6 installs only these six upstream Compound
Engineering skills: `ce-brainstorm`, `ce-plan`, `ce-work`,
`ce-simplify-code`, `ce-code-review`, and `ce-compound`. Its `skills.txt` does
not install slash commands.

Seven adapters ship in this repository. For this local or unreleased fallback,
choose your installed host and run its script from the target project:

```sh
sh /tmp/openspec-schemas/scripts/install-compound-adapters.sh opencode .
sh /tmp/openspec-schemas/scripts/install-compound-adapters.sh senpi .
sh /tmp/openspec-schemas/scripts/install-compound-adapters.sh pi .
sh /tmp/openspec-schemas/scripts/install-compound-adapters.sh atomic .
```

Run only the needed host command. OpenCode uses `.opencode/commands`, Senpi uses
`.senpi/prompts`, Pi uses `.pi/prompts`, and Atomic uses `.atomic/prompts`.
Omitted target defaults to `.`. Existing
adapter files cause refusal before mutation. After explicit replacement approval:

```sh
sh /tmp/openspec-schemas/scripts/install-compound-adapters.sh senpi . --force
```

All sources and destinations are preflighted; force replaces only declared safe
unmanaged targets. It never bypasses managed drift, symlinks, ownership checks,
or unrelated files. This adapter installer is local and installs no host
runtime, OpenSpec CLI, or companion skills.

Installed command/template surface:

```text
/opsx-ce-define [change]
/opsx-ce-plan [change] <specs|design|adr|tasks>
/opsx-ce-work [change] [task]
/opsx-ce-debug [change] [task]
/opsx-ce-review [change]
/opsx-ce-validate [change]
/opsx-ce-compound [change]
```

Confirm installed resources through your host's command/template discovery.
OpenSpec remains in charge of artifact status, instructions, task tracking,
validation, and lifecycle transitions. Adapters prohibit separate CE plans,
trackers, commits, branches, pushes, issues, PRs, and automatic stage selection
or advancement. Planning requires a selected ready artifact, work a selected
task; settled artifact scope is reused rather than asked again. Planning records
stable unit, batch, layer, path claim, proof, and continuation fields. Work may
use an optional pre-created, outer-owned worktree only after dependency, path
isolation, repository-instruction, and ownership checks. Adapters and bounded
workers don't manage worktrees. Every handoff names the exact next OpenSpec
command, or the blocking condition when no command is safe.
