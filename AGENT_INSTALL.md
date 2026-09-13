# Agent Install Guide

Use this flow when installing any schema from this repository into an existing OpenSpec project. Schemas declare companion skills in a `skills.txt` manifest inside the schema directory; Step 6 installs every declared skill into the target project. The repository currently includes `intent-driven`, `intent-driven-engineering`, `intent-driven-superpowers`, `behaviour-driven`, `spec-driven-with-adr`, `event-driven`, and `minimalist` schemas; the clone is authoritative if that list changes.

## Prerequisites

1. Run `openspec --version` in the target project. Confirm OpenSpec is installed and the CLI version is at least `1.0.0`.
2. If `openspec --version` fails, reports a version below `1.0.0`, or `openspec/config.yaml` is missing, stop and tell the user to install or upgrade OpenSpec and run `openspec init` first. Do not continue until these prerequisites are met.

## Step 1 — Clone This Repository

```bash
git clone https://github.com/Nebuless/openspec-schemas.git /tmp/openspec-schemas
```

## Step 2 — Select a Schema

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

## Step 3 — Copy the Schema

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

## Step 4 — Activate the Schema

Update `openspec/config.yaml` in the target project to activate the installed schema:

```yaml
schema: <schema-name>
```

Also update the `rules` keys to match the artifact IDs in the schema's `schema.yaml` (`artifacts[].id`). For example:

- `intent-driven` uses `proposal`, `specs`, `design`, `adr`, and `tasks` → set those as `rules` keys
- Check `openspec/schemas/<schema-name>/schema.yaml` (`artifacts[].id`) for the exact IDs of your chosen schema

Some schemas require additional `openspec/config.yaml` keys. Check the chosen
schema's README before validating. `behaviour-driven`, `intent-driven`,
`intent-driven-engineering`, and `intent-driven-superpowers` require
`stack: javascript` or `stack: python` when their opt-in executable spec skills
are enabled. Other schemas need no additional activation keys.

## Step 5 — Validate

Run:

```bash
openspec schema validate <schema-name>
```

Expected success output (example for the selected schema):

```text
Validation Results:
✓ <schema-name>
```

Replace `intent-driven` with the schema name you installed. If validation fails, report the error output to the user.

## Step 6 — Install Associated Skills

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
- If a target skill directory already exists, it stops without changing that directory. Ask the user whether to preserve it or explicitly replace only declared directories with `--force`. The installer refuses to replace an existing file at a skill path:

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

`intent-driven-superpowers` combines skills from
`intent-driven-dev/skills`, `mattpocock/skills`, and `obra/superpowers`. Install
it with the same command above; no separate plugin installation is required.
