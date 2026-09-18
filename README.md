# OpenSpec Custom Schemas

Copyable workflow schemas for
[OpenSpec](https://github.com/Fission-AI/OpenSpec). OpenSpec provides the
built-in `spec-driven` workflow. This package adds eight focused alternatives
for different delivery styles.

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
| [`compound-intent-driven`](./openspec/schemas/compound-intent-driven/README.md) | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work uses Compound Engineering's define, plan, build, simplify, review, and learning loop |
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

`@nebulesstech/openspec-schemas` `0.1.7` is published on the `beta` tag;
`0.1.5` remains `latest`. Node >=20, Nub, and an initialized OpenSpec project
are required.

Install and activate a schema from your project directory:

```sh
nub dlx --minimum-release-age-exclude=@nebulesstech/openspec-schemas -p @nebulesstech/openspec-schemas@beta openspec-schemas install <schema-name> -t . -i
```

Each package includes a `skills.txt` manifest. Skills and Compound host adapters
are optional. See the [agent install guide](./AGENT_INSTALL.md) for complete
prerequisites, install choices, collision rules, skills, adapters, and local or
unreleased fallback.

## After Installation

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
- [Event-driven workflow](./openspec/schemas/event-driven/README.md)
- [Minimalist workflow](./openspec/schemas/minimalist/README.md)

## Optional Resources

- [Intent-driven starter project](https://github.com/intent-driven-dev/intent-driven-template)
- [Behaviour-driven starter project](https://github.com/intent-driven-dev/behaviour-driven-template)
- [Companion skills](https://github.com/intent-driven-dev/skills)
- [Custom schemas article](https://intent-driven.dev/blog/2026/02/12/openspec-custom-schemas/)
- [Video overview](https://www.youtube.com/watch?v=k01nbZfwB34)
