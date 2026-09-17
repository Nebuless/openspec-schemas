# Compound Adapter Canonical Source

## Scope

Seven host-neutral `/opsx-ce-*` command bodies. These files define artifact-first Compound Engineering actions under OpenSpec lifecycle control.

## Commands

`opsx-ce-define`, `opsx-ce-plan`, `opsx-ce-work`, `opsx-ce-debug`, `opsx-ce-review`, `opsx-ce-validate`, `opsx-ce-compound`.

## Contract

- Resolve change, read OpenSpec status/instructions and concrete context files before action.
- Continue from approved artifacts. Never ask for plan/work scope already recorded there.
- Restrict edits to stage-owned OpenSpec artifacts or selected implementation task.
- Return result, proof, mutations, next context, and material blockers.
- Questions only when change cannot resolve, a required artifact is missing, or recorded evidence shows material blocker.

## Forbidden Side Effects

- No separate CE plans or trackers.
- No commits, branches, pushes, issues, PRs, shipping, or automatic stage advancement.
- Do not replace OpenSpec task tracking, validation, or artifact ownership.

## Projection Parity

Every edit must be copied byte-identically to:

```text
.opencode/commands/
.senpi/prompts/
.pi/prompts/
.atomic/prompts/
```

Run:

```sh
sh scripts/test-compound-adapters.sh
sh scripts/test-install-compound-adapters.sh
```
