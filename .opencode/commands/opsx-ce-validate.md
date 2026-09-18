---
description: Validate named OpenSpec proofs
---
# Validate OpenSpec Proofs

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks. Stop if apply is blocked; all_done still requires evidence. Build a packet containing task IDs, instruction, settled decisions, named proofs, and allowed mutation paths. Preserve settled artifacts instead of re-asking plan/work scope.

Run every named task proof and `openspec validate <change> --type change --strict`. If this schema was edited, also run `openspec schema validate compound-intent-driven`. Capture exact commands, exit results, and observed evidence; skipped or unavailable checks are blockers, never success. Verify checked tasks and absence of unresolved review findings before claiming completion. Run only local bounded checks; do not deploy, publish, or invoke destructive/external-side-effect proofs. Request a safe proof when needed. Do not fix code or edit artifacts/checkboxes here. No owned OpenSpec paths are writable in this read-only stage; only declared disposable local test output is allowed.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after validation.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (commands/results and gaps), mutations (none or test output paths), blocker (or none), and refreshed status. Report unavailable CLI honestly; never install a runtime.
