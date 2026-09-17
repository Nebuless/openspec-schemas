# Schema Package Guide

## Scope

Each child is a user-copyable OpenSpec schema package. `schema.yaml` defines artifact graph; templates and README must describe same contract.

## Required Shape

```text
<schema>/
  schema.yaml
  README.md
  skills.txt
  templates/
```

`skills.txt` may be empty. Every artifact declared by `schema.yaml` needs its declared template at the matching path.

## Authoring Rules

- Preserve artifact IDs and dependency graph unless changing workflow deliberately.
- Keep instructions artifact-specific: proposal states intent, specs state observable behavior, design selects implementation guardrails, ADR records durable decisions, tasks carry verifiable vertical work.
- Specs use OpenSpec Markdown deltas. Requirements use `SHALL` or `MUST`; scenarios use exact `#### Scenario:` heading and GIVEN/WHEN/THEN.
- For a modified requirement, copy complete prior requirement block before editing.
- Keep schema packages standalone. Do not rely on root docs, scripts, or agent state at runtime.
- Add or revise `skills.txt` only for real companion capabilities; installer accepts bare names and source-qualified tab entries.

## Validation

```sh
openspec schema validate <schema-name>
npm test
npm run check -- --require-qlty
```

## Special Cases

- `event-driven/` owns event-storming, event-modeling, and AsyncAPI artifacts; keep its README and templates synchronized.
- `compound-intent-driven/` has canonical adapter guidance below its own subtree. Do not edit host copies independently.
