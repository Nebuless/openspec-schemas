# OpenSpec Custom Schemas

Copyable workflow schemas for
[OpenSpec](https://github.com/Fission-AI/OpenSpec). OpenSpec provides the
built-in `spec-driven` workflow. This package adds nine focused alternatives
for different delivery styles.

## Provenance

This repository is a Nebuless-maintained fork and extension of
[Hari Krishnan's OpenSpec Custom Schemas](https://github.com/intent-driven-dev/openspec-schemas),
originally published by [Hari Krishnan](https://github.com/harikrishnan83).
The upstream baseline content uses five named schemas: `minimalist`,
`event-driven`, `spec-driven-with-adr`, `behaviour-driven`, and
`intent-driven`. [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
is the underlying OpenSpec platform, not the source of this schema collection.

Fork additions include:

- npm package and `openspec-schemas` CLI
- `intent-driven-engineering`, `intent-driven-superpowers`, `compound-intent-driven`, and `intent-driven-design`
- Compound lifecycle adapters and OpenSpec lifecycle companion skills
- source-aware skill installer
- guarded schema switching and managed skills
- opt-in MCP catalogs
- `opsx-schema` CLI and optional view

## Choosing a Schema

Start with `spec-driven` for most projects. Choose `intent-driven` when complex
work needs observable behaviour, technical design, and durable architecture
decisions. Each linked schema guide covers fit, activation, stage gates, and
companion skills.

| Schema | Artifact flow | Choose when |
|---|---|---|
| `spec-driven` (built-in) | `proposal -> specs -> design -> tasks` | General-purpose OpenSpec workflow |
| [`behaviour-driven`](./openspec/schemas/behaviour-driven/README.md) | `proposal -> (specs, design) -> tasks` | Observable behaviour carries the intent, without durable ADRs |
| [`spec-driven-with-adr`](./openspec/schemas/spec-driven-with-adr/README.md) | `proposal -> specs / design -> adr -> tasks` | Standard specs need durable Architecture Decision Records |
| [`intent-driven`](./openspec/schemas/intent-driven/README.md) | `proposal -> (specs, design) -> adr -> tasks` | Complex work needs behaviour specs, design, and durable decisions |
| [`intent-driven-engineering`](./openspec/schemas/intent-driven-engineering/README.md) | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work needs source-aware engineering skills and phase guidance |
| [`intent-driven-superpowers`](./openspec/schemas/intent-driven-superpowers/README.md) | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work uses Superpowers implementation, debugging, review, and verification skills |
| [`compound-intent-driven`](./openspec/schemas/compound-intent-driven/README.md) | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work uses Compound Engineering's core loop with OpenSpec lifecycle helpers and safe continuation adapters |
| [`intent-driven-design`](./openspec/schemas/intent-driven-design/README.md) | `journey -> proposal -> (specs, design) -> adr -> tasks` | Product, UI, or platform work needs discovery evidence, explicit user decisions, and durable architecture records |
| [`event-driven`](./openspec/schemas/event-driven/README.md) | `event-storming -> event-modeling -> specs -> design -> asyncapi -> tasks` | Event-centric or AsyncAPI-first systems |
| [`minimalist`](./openspec/schemas/minimalist/README.md) | `specs -> tasks` | Small, well-scoped, low-risk changes |

`intent-driven` builds on `behaviour-driven` with an ADR artifact. Both use
OpenSpec Markdown delta specs. It also subsumes `spec-driven-with-adr` with
richer behaviour specs and companion skills. Choose `behaviour-driven` when
durable ADRs aren't needed.

Schemas define artifact workflows. They don't run acceptance tests. The
`behaviour-driven`, `intent-driven`, `intent-driven-engineering`, and
`intent-driven-superpowers` packages declare the optional
[`spec-as-source`](https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/spec-as-source)
companion skill for fenced-Gherkin authoring and executable acceptance testing.

## Install a Schema

Package source is version `1.8.0`. Registry state is released `0.1.9` on `beta`, with `1.8.0` prepared for `latest`. Package core targets Node >=20; the locked full toolchain for OpenSpec requires Node.js >=20.19.0. Nub and an initialized OpenSpec project are
required. `opsx-schema view` additionally requires Node.js >=26.4, Linux x64
glibc, a non-dumb TTY, and the optional OpenTUI runtime. The package manifest
retains `@opentui/core@0.5.11` and `web-tree-sitter@0.25.10` as optional
dependencies for package-manager installs.

Install and activate a schema from your project directory:

```sh
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@latest openspec-schemas install <schema-name> -t . -i
```

Each package includes a `skills.txt` manifest. Companion skills and Compound host adapters
are optional. `compound-intent-driven` adds OpenSpec lifecycle companions for
explore, propose, apply, sync, and archive, plus `/opsx-ce-*` adapters. OpenSpec
CLI state remains lifecycle authority: continuation commands act only on an
explicit selection, and archive remains user-controlled. See the [agent install
guide](./AGENT_INSTALL.md) for complete prerequisites, install choices,
collision rules, skills, adapters, and local or unreleased fallback.

Schemas may also include a strict read-only `mcp.yaml` catalog. After explicit
approval, install selected catalog entries with `--mcp` and `-a`; see the agent
install guide for host detection, safe config behavior, and Pi guidance.

## Inspect Project State

`opsx-schema` is additive. Existing `openspec-schemas` commands remain
compatible for schema listing, validation, installation, and verification.
Use `opsx-schema` for project state and guarded operations:

```sh
opsx-schema inspect
opsx-schema inspect --change <change-id> --json
opsx-schema doctor --json
opsx-schema skills inspect --schema <schema-name> --profile default --json
opsx-schema handoff <change-id> <schema-name> --json
```

Read commands support `--json`. JSON writes one object to stdout with
`schemaVersion`, `command`, `ok`, `data`, `diagnostics`, `mutations`, and
`nextActions`. Errors use a nonzero exit status. Commands don't expose secrets,
tokens, or unsafe hidden switches.

Schema activation and skill changes are guarded. `opsx-schema enable` previews
by default and needs `--yes` to update `openspec/config.yaml`. Skill install,
enable, and disable preview by default and need `--apply`; `--force` only
replaces safe unmanaged directories at declared targets and never bypasses
managed drift, symlink, or ownership checks. `handoff` is a
metadata-only dry run unless `--apply` is present, and incompatible graphs need
`--allow-incompatible`.

`opsx-schema view` is optional. Archived records are unavailable from its active snapshot. It requires stable Node.js >=26.4, Linux x64
glibc, a non-dumb TTY, `--experimental-ffi`, and optional `@opentui/core` and
`web-tree-sitter` dependencies. View is read-only until a displayed action is
previewed and explicitly confirmed. Incompatible handoffs reject by default; acknowledgement requires a separate explicit control and a new preview before exact confirmation. It doesn't replace inspect or doctor.

For persistent Node.js 26 view use, declare the package and both pinned runtime
dependencies in the consumer package manifest before the first Nub install:

```json
{
  "dependencies": {
    "@nebulesstech/openspec-schemas": "1.8.0"
  },
  "optionalDependencies": {
    "@opentui/core": "0.5.11",
    "web-tree-sitter": "0.25.10"
  }
}
```

Keep the consumer lockfile and use `nub install --frozen-lockfile` for repeats. A bare local
tar Nub install may omit package optional edges; schema-copy `nub dlx` does not
create a persistent view runtime. Core commands remain Node >=20 and support
`--no-optional` when OpenTUI is not needed. Use
`$(mise where node@26)/bin/node --experimental-ffi scripts/test-opsx-view-native.mjs`
for the Node 26 runtime.

## After Installation

Run `opsx-schema view` for the isolated terminal runtime bootstrap. On an
unsupported host, use `opsx-schema inspect --json` or `opsx-schema doctor`.

The package installer copies the selected schema into your project. With `-i`,
it also updates the existing top-level `schema:` value in
`openspec/config.yaml`.

Read the selected schema's linked guide before starting work. It explains:

- when the workflow fits
- how its artifacts depend on one another
- what belongs in each artifact
- which companion skills are available
- how to validate the schema

OpenSpec remains responsible for schema validation, artifact instructions, and
workflow lifecycle. This package supplies schema files and optional companion
resources.

To change the schema for work that hasn't started or is already in progress,
keep the project default separate from the change-local pinned schema. Completed
changes stay historical; start a new change with the new schema. See
[Changing a Change's Schema](./AGENT_INSTALL.md#changing-a-changes-schema) for
the dry-run and apply workflow.

## Package Scope

Schema folders are self-contained and copyable. Each contains:

```text
schema.yaml
README.md
skills.txt
mcp.yaml (optional)
templates/
```

The published CLI installs those folders. It doesn't install OpenSpec, Node,
Nub, agent hosts, or other runtimes.

## Hand Off to a Coding Agent

Send your agent this prompt:

```text
Read https://raw.githubusercontent.com/Nebuless/openspec-schemas/refs/heads/main/AGENT_INSTALL.md and follow the instructions.
```

Add a schema name to the prompt if you've already chosen one. Otherwise, the
guide asks the agent to list available schemas and confirm one before install.

## More Documentation

- [Complete agent installation](./AGENT_INSTALL.md)
- [Contributor and release operations](./CONTRIBUTING.md)
- [Behaviour-driven workflow](./openspec/schemas/behaviour-driven/README.md)
- [Spec-driven with ADR workflow](./openspec/schemas/spec-driven-with-adr/README.md)
- [Intent-driven workflow](./openspec/schemas/intent-driven/README.md)
- [Intent-driven engineering workflow](./openspec/schemas/intent-driven-engineering/README.md)
- [Intent-driven Superpowers workflow](./openspec/schemas/intent-driven-superpowers/README.md)
- [Compound intent-driven workflow](./openspec/schemas/compound-intent-driven/README.md)
- [Intent-driven design workflow](./openspec/schemas/intent-driven-design/README.md)
- [Event-driven workflow](./openspec/schemas/event-driven/README.md)
- [Minimalist workflow](./openspec/schemas/minimalist/README.md)

## Optional Resources

- [Intent-driven starter project](https://github.com/intent-driven-dev/intent-driven-template)
- [Behaviour-driven starter project](https://github.com/intent-driven-dev/behaviour-driven-template)
- [Companion skills](https://github.com/intent-driven-dev/skills)
- [Custom schemas article](https://intent-driven.dev/blog/2026/02/12/openspec-custom-schemas/)
- [Video overview](https://www.youtube.com/watch?v=k01nbZfwB34)
