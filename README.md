# OpenSpec Custom Schemas

Custom [OpenSpec](https://github.com/Fission-AI/OpenSpec) schemas packaged as copyable folders under `openspec/schemas/`.

Default OpenSpec includes the `spec-driven` schema, which is a strong general-purpose workflow. This repo adds more focused workflows for specific delivery contexts, and also demonstrates how to customise OpenSpec for different styles of work.

Detailed write-up: [https://intent-driven.dev/blog/2026/02/12/openspec-custom-schemas/](https://intent-driven.dev/blog/2026/02/12/openspec-custom-schemas/)

## Video

[![Watch on YouTube](https://img.youtube.com/vi/k01nbZfwB34/0.jpg)](https://www.youtube.com/watch?v=k01nbZfwB34)

## Choosing a Schema

For most projects, the built-in `spec-driven` schema is all you need. For complex projects — meaningful behaviour, technical design, and long-lived architectural decisions — `intent-driven` is the most complete general-purpose schema in this collection. The remaining schemas are either lighter subsets or specialised for a particular style of delivery.

| Schema | Artifact flow | Choose when |
|--------|---------------|-------------|
| `spec-driven` (built-in) | `proposal -> specs -> design -> tasks` | Default for most projects; ships with OpenSpec |
| `behaviour-driven` | `proposal -> (specs, design) -> tasks` | Observable behaviour carries the intent, written as Gherkin-style `GIVEN`/`WHEN`/`THEN` scenarios in OpenSpec Markdown delta specs |
| `spec-driven-with-adr` | `proposal -> specs / design -> adr -> tasks` | You need durable Architecture Decision Records on top of spec-driven |
| `intent-driven` | `proposal -> (specs, design) -> adr -> tasks` | `behaviour-driven` plus durable ADRs: behaviour specs, design, and long-lived decisions |
| `intent-driven-engineering` | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work needing source-aware companion skills and phase-specific engineering guidance |
| `intent-driven-superpowers` | `proposal -> (specs, design) -> adr -> tasks` | Intent-driven work using Superpowers' disciplined implementation, debugging, review, and verification loops |
| `event-driven` | `event-storming -> event-modeling -> specs -> design -> asyncapi -> tasks` | Event-Driven Architecture Systems |
| `minimalist` | `specs -> tasks` | Small, well-scoped, low-risk changes |

How the schemas relate: `intent-driven` is `behaviour-driven` plus a durable ADR artifact — the same OpenSpec Markdown delta specs, adding per-change ADR review and repository-level decision records. It still subsumes `spec-driven-with-adr` (same ADR handling, richer specs, larger companion skill set). Choose `behaviour-driven` when you don't need durable ADRs. `event-driven` is domain-specific for event-centric/AsyncAPI-first systems, and `minimalist` is for small, low-risk changes.

Executable acceptance testing is not a schema feature. `behaviour-driven`, `intent-driven`, and `intent-driven-superpowers` declare the opt-in [`spec-as-source`](https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/spec-as-source) skill, which makes `spec.md` the executable source of truth — fenced-Gherkin authoring, acceptance-first task ordering, and specs/code zone isolation — and pulls in `acceptance-test-authoring` for the runner, extraction, linting, and reports. Install the skill when you want specs run as tests; use either schema alone for the artifact discipline without the test harness.

To try these schemas without installing anything, start from a template repo — [intent-driven-template](https://github.com/intent-driven-dev/intent-driven-template) or [behaviour-driven-template](https://github.com/intent-driven-dev/behaviour-driven-template) — each a starter project with the schema, OpenSpec config, commands, and companion skills already installed.

## Install a Schema

Ask your coding agent to read the install guide and follow the instructions:

```text
Read this file: https://raw.githubusercontent.com/intent-driven-dev/openspec-schemas/refs/heads/main/AGENT_INSTALL.md and follow the instructions.
```

If you already know which schema you want, include the name and the guide will confirm it exists before proceeding:

```text
Read this file: https://raw.githubusercontent.com/intent-driven-dev/openspec-schemas/refs/heads/main/AGENT_INSTALL.md and install schema intent-driven.
```

Otherwise the guide will enumerate all available schemas and ask you to pick one.

Schemas declare companion skills in a `skills.txt` manifest inside their schema directory. The [install guide](./AGENT_INSTALL.md) installs them into your project's `.agents/skills/`. Existing bare skill names remain compatible with [intent-driven-dev/skills](https://github.com/intent-driven-dev/skills); a schema can also use source-qualified tab-delimited declarations to install a complete skill directory from another GitHub repository.

### Example: intent-driven `config.yaml`

```yaml
schema: intent-driven

context: |
  Tech Stack:
    - Node.js, TypeScript
    - PostgreSQL

rules:
  proposal:
    - Maximum of 250 words
  tasks:
    - Break tasks to logical commits.
```

Artifact alignment source: `openspec/schemas/intent-driven/schema.yaml` (`proposal`, `specs`, `design`, `adr`, `tasks`).

For the full step-by-step install flow, see [`AGENT_INSTALL.md`](./AGENT_INSTALL.md).

## Custom Schemas

### Behaviour-Driven

Proposal-to-tasks workflow for changes where observable behaviour carries the
intent. Specs are OpenSpec Markdown deltas whose requirements and scenarios are
written in Gherkin style with `GIVEN`/`WHEN`/`THEN` steps, so archive can merge
them. To run those scenarios as an acceptance suite, add the schema's opt-in
[`spec-as-source`](https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/spec-as-source)
skill, which owns fenced-Gherkin authoring, acceptance-first task ordering, and
the two spec-first rules.

To try it without installing anything, start from the
[behaviour-driven-template](https://github.com/intent-driven-dev/behaviour-driven-template) —
a starter project with the schema, OpenSpec config, commands, and companion
skills already installed.

Artifact order:

```text
proposal -> (specs, design) -> tasks
```

Activation:

```yaml
schema: behaviour-driven
```

Validate:

```bash
openspec schema validate behaviour-driven
```

For more details, see `openspec/schemas/behaviour-driven/README.md`.

### Spec-Driven With ADR

Experimental proposal-to-tasks workflow for changes that also need durable
Architecture Decision Records persisted under the target repository's top-level
`adr/` folder. `intent-driven` shares this schema's ADR handling and adds
behaviour-focused specs plus a larger skill set — prefer it unless you want
plain spec-driven specs with ADRs and nothing more.

Artifact order:

```text
proposal -> specs / design -> adr -> tasks
```

Activation:

```yaml
schema: spec-driven-with-adr
```

Validate:

```bash
openspec schema validate spec-driven-with-adr
```

For more details, see `openspec/schemas/spec-driven-with-adr/README.md`.

### Intent-Driven

`behaviour-driven` plus durable Architecture Decision Records: behaviour is
written as Gherkin-style scenarios in OpenSpec Markdown delta specs, technical
design is constrained by in-force ADRs, and each change completes an ADR review
before task planning. Executable acceptance testing comes from the same opt-in
[`spec-as-source`](https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/spec-as-source)
skill that `behaviour-driven` declares.

To try it without installing anything, start from the
[intent-driven-template](https://github.com/intent-driven-dev/intent-driven-template) —
a starter project with the schema, OpenSpec config, commands, and companion
skills already installed. (Companion skills are canonically hosted at
[intent-driven-dev/skills](https://github.com/intent-driven-dev/skills).)

Artifact order:

```text
proposal -> (specs, design) -> adr -> tasks
```

Activation:

```yaml
schema: intent-driven
```

Validate:

```bash
openspec schema validate intent-driven
```

For more details, see `openspec/schemas/intent-driven/README.md`.

### Intent-Driven Engineering

`intent-driven-engineering` extends `intent-driven` with phase-specific
engineering guidance and source-qualified companion skills from both
[`intent-driven-dev/skills`](https://github.com/intent-driven-dev/skills) and
[`mattpocock/skills`](https://github.com/mattpocock/skills). Its installer
clones each declared source once and preserves existing local skills unless
`--force` is explicit.

Artifact order:

```text
proposal -> (specs, design) -> adr -> tasks
```

Activation:

```yaml
schema: intent-driven-engineering
```

Validate:

```bash
openspec schema validate intent-driven-engineering
```

For phase guidance and the declared skill set, see
`openspec/schemas/intent-driven-engineering/README.md`.

### Intent-Driven Superpowers

`intent-driven-superpowers` extends `intent-driven` with selected skills from
[obra/superpowers](https://github.com/obra/superpowers), plus complementary
engineering skills from [`intent-driven-dev/skills`](https://github.com/intent-driven-dev/skills)
and [`mattpocock/skills`](https://github.com/mattpocock/skills). It routes
planning, implementation, debugging, delegation, review, and verification
discipline to the phases where each skill applies. OpenSpec remains workflow
authority; skills do not create a competing lifecycle.

The source-aware installer clones each manifest source once, installs complete
skill directories, and refuses existing local skills unless `--force` is
explicit.

Artifact order:

```text
proposal -> (specs, design) -> adr -> tasks
```

Activation:

```yaml
schema: intent-driven-superpowers
```

Validate:

```bash
openspec schema validate intent-driven-superpowers
```

For phase routing and the complete declared skill set, see
`openspec/schemas/intent-driven-superpowers/README.md`.

### Event-Driven

Structured workflow for event-centric systems with [Event Storming](https://en.wikipedia.org/wiki/Event_storming) discovery followed by [AsyncAPI](https://www.asyncapi.com/) specification.

Artifact order:

```text
event-storming -> event-modeling -> specs -> design -> asyncapi -> tasks
```

Activation:

```yaml
schema: event-driven
```

Validate:

```bash
openspec schema validate event-driven
```

For more details, see `openspec/schemas/event-driven/README.md`.

### Minimalist

Fast path from spec to execution using user-story requirements and Gherkin acceptance-criteria style. Lightweight schema for well-scoped, low-risk changes.

Artifact order:

```text
specs -> tasks
```

Activation:

```yaml
schema: minimalist
```

Validate:

```bash
openspec schema validate minimalist
```

For more details, see `openspec/schemas/minimalist/README.md`.

## Contributing

See `CONTRIBUTING.md` for how to create/customize schemas using `openspec schema init` / `openspec schema fork`, and how to validate before opening a PR.
