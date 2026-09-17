# Compound Intent-Driven OpenSpec Schema

`compound-intent-driven` keeps OpenSpec as workflow authority while adapting
[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s
core engineering loop:

```text
define -> plan -> build -> simplify -> review -> compound
```

It maps that loop onto OpenSpec artifacts instead of creating parallel plan or
tracker files:

- `proposal` defines intent, alternatives, scope, success signals, and prior
  learning (`ce-brainstorm`).
- `specs` makes each approved capability observable and testable.
- `design` records execution guardrails, stable implementation units, seams,
  risks, and targeted proofs (`ce-plan`).
- `adr` keeps only durable architecture decisions.
- `tasks` converts units into vertical, dependency-ordered, tracked slices.
- `apply` implements, simplifies settled code, reviews final diff, validates,
  then captures only durable lessons (`ce-work`, `ce-simplify-code`,
  `ce-code-review`, `ce-compound`).

- Good fit: non-trivial product or platform work needing explicit intent,
  reusable learning, and a bounded build-review loop.
- Not a good fit: small tactical fixes, documentation-only changes, dependency
  bumps, or changes with no material decision; use `minimalist` instead.

## Activate

```yaml
schema: compound-intent-driven
```

## Stage Gates

```text
proposal -> (specs, design) -> adr -> tasks -> apply
```

`specs` and `design` each require `proposal` and may proceed in parallel. `adr`
requires `design`; `tasks` requires `specs` and `adr`; `apply` tracks
`tasks.md` checkboxes.

The loop is intentionally compact:

1. **Define:** `proposal.md` resolves user-visible intent before implementation.
   It uses repository evidence and relevant `docs/solutions/` learnings first;
   user questions remain only for material decisions evidence cannot settle.
2. **Plan:** `design.md` turns approved intent into implementation guardrails.
   Stable `U1`, `U2`, … units own seams, likely integration points, and targeted
   proof. They never renumber.
3. **Build:** apply implements a vertical task in dependency order, follows the
   repository's patterns, and runs its named proof before checking its box.
4. **Simplify:** each settled code unit gets a scope-bounded reuse, clarity, and
   efficiency pass. Mechanical and docs-only changes skip it.
5. **Review:** final diff is checked against the change artifacts, in-force ADR
   context, and project standards. Verified in-scope findings are fixed.
6. **Compound:** a learning is written only when its reasoning is non-obvious,
   durable, material, and not already recoverable from code, tests, comments,
   or existing documentation.

## Spec Format

Specs use normal OpenSpec Markdown deltas. Each requirement uses
`### Requirement:` plus SHALL/MUST wording. Each scenario uses exactly
`#### Scenario:` with `GIVEN`, `WHEN`, and `THEN` steps. Every requirement has
at least one scenario. A `MODIFIED` requirement copies its complete existing
block from `openspec/specs/<capability>/spec.md` before editing.

This schema does not install an executable-spec harness. Existing repository
tests or the targeted proof named by each task remain verification authority.

## ADR Persistence

`adr.md` is a change-local review manifest. Repository-level decisions live in
`<repo>/adr/`. Accepted ADRs stay immutable; a new decision creates a new ADR
with `Supersedes:` rather than changing prior text.

## Validate

```bash
openspec schema validate compound-intent-driven
```

## Associated Skills

`skills.txt` declares source-qualified, MIT-licensed core-loop skills from
[EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin).
Run the catalog installer to copy them into a target project's
`.agents/skills/`:

```bash
bash /path/to/openspec-schemas/scripts/install-schema-skills.sh \
  openspec/schemas/compound-intent-driven .
```

- `ce-brainstorm` — intent, alternatives, scope boundaries, and success signals.
- `ce-plan` — evidence-grounded implementation guardrails and stable units.
- `ce-work` — implementation plus targeted local verification.
- `ce-simplify-code` — behavior-preserving cleanup of settled code.
- `ce-code-review` — diff review against intent and project standards.
- `ce-compound` — durable learning capture when it clears its eligibility bar.

The source plugin is MIT licensed. This schema is an independent, compact
mapping of its documented core loop to OpenSpec artifacts; it does not copy the
plugin's complete workflow or create a competing lifecycle.

## Planned Host Command Adapters

This schema installs no slash commands. `skills.txt` installs only the six
skills above. A compatible host agent integration may provide these planned
OpenSpec-aware adapters:

```text
/opsx-ce-define [change]
/opsx-ce-plan [change]
/opsx-ce-work [change] [task]
/opsx-ce-debug [change] [task]
/opsx-ce-review [change]
/opsx-ce-validate [change]
/opsx-ce-compound [change]
```

Each adapter resolves the selected change, reads `openspec status` and the
relevant `openspec instructions`, reads every concrete dependency or context
file, performs only its owned stage, reruns status, and hands the next context
back to OpenSpec. It must not start a second lifecycle or invoke CE-native side
effects such as separate plan files, todo trackers, commits, branches, pushes,
issues, or pull requests.

### Artifact-First Handoff Packet

Every invocation builds a packet from OpenSpec before asking Compound
Engineering to act:

```text
change
schemaName
planningHome
changeRoot
actionContext
artifactId or taskId
instruction
resolvedOutputPath
dependencies or contextFiles
settled decisions
allowed mutation paths
```

Artifact contents and settled decisions are inputs, not prompts to repeat
discovery. The adapter must not ask planning questions already answered by the
packet. Questions are allowed only when required input is absent, artifacts
conflict, a material choice remains unsettled, or safe bounded work cannot
continue. Answers belong in the OpenSpec artifact that owns the decision.

### Stage Ownership

- `/opsx-ce-define` may update proposal intent within its resolved output path.
- `/opsx-ce-plan` may update OpenSpec design and task-planning artifacts, never
  a separate CE plan.
- `/opsx-ce-work` may change only the selected task's allowed implementation
  paths and its OpenSpec task status.
- `/opsx-ce-debug` may diagnose and fix only the selected task or failure scope;
  design changes return to the owning OpenSpec artifact first.
- `/opsx-ce-review` reports or fixes verified findings within allowed mutation
  paths. OpenSpec artifacts remain review criteria.
- `/opsx-ce-validate` runs named proofs and OpenSpec validation, then reports
  evidence without creating release or repository side effects.
- `/opsx-ce-compound` may write only eligible durable learning at the path
  allowed by the packet.

On handoff, an adapter returns completed work, proof or findings, mutations,
unresolved questions, and refreshed OpenSpec status. It does not select the
next stage itself. OpenSpec owns stage readiness, progression, and completion.
