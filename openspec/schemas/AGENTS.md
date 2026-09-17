# Schema Package Guide

## Purpose

Each child is a user-copyable schema package. `schema.yaml`, templates, and README describe one contract.

## Ownership

Schema directories own workflow artifact graphs, templates, companion skill declarations, and schema-specific documentation.

## Local Contracts

```text
<schema>/
  schema.yaml
  README.md
  skills.txt
  templates/
```

`skills.txt` may be empty. Every artifact declared by `schema.yaml` needs its declared template at the matching path.

## Work Guidance

- Preserve artifact IDs and dependency graph unless changing workflow deliberately.
- Keep instructions artifact-specific: proposal states intent, specs state observable behavior, design selects implementation guardrails, ADR records durable decisions, tasks carry verifiable vertical work.
- Specs use OpenSpec Markdown deltas. Requirements use `SHALL` or `MUST`; scenarios use exact `#### Scenario:` heading and GIVEN/WHEN/THEN.
- For a modified requirement, copy complete prior requirement block before editing.
- Keep schema packages standalone. Do not rely on root docs, scripts, or agent state at runtime.
- Add or revise `skills.txt` only for real companion capabilities; installer accepts bare names and source-qualified tab entries.

## Verification

```sh
openspec schema validate <schema-name>
npm test
npm run check -- --require-qlty
```

## Child DOX Index

| Path | Scope |
|---|---|
| `behaviour-driven/` | Gherkin-style observable behavior workflow. |
| `compound-intent-driven/` | Compound Engineering artifact workflow. |
| `compound-intent-driven/adapters/shared/AGENTS.md` | Canonical adapter guidance and projection parity. |
| `event-driven/` | Event-storming, event-modeling, AsyncAPI workflow. |
| `intent-driven/` | Behavior-driven workflow with ADRs. |
| `intent-driven-engineering/` | Source-aware companion skill workflow. |
| `intent-driven-superpowers/` | Superpowers companion skill workflow. |
| `minimalist/` | Small scope specs-to-tasks workflow. |
| `spec-driven-with-adr/` | Spec-driven workflow with ADR artifact. |
