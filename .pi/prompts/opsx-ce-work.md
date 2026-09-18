# Work One OpenSpec Task

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks, plus relevant code and learnings. Stop if apply is blocked or all_done. Require one selected unchecked task, explicit or unambiguous from context, with dependencies complete. Never choose the next task automatically. Build a packet containing taskId, instruction, settled decisions, named proof, and allowed mutation paths; missing ownership is a blocker.

Use ce-work reasoning. Preserve settled artifacts instead of re-asking plan/work scope. Establish targeted proof before behavior changes when feasible, implement only selected task, and run its named verification. Allow only task-owned implementation/test paths authorized by the packet and the owned OpenSpec task checkbox within changeRoot. Mark that checkbox only after proof passes. Use ce-simplify-code only on settled changed code; skip mechanical/docs-only work. Preserve behavior, security, input validation, data-loss protection, and accessibility. Rerun affected proofs after simplification. Stop on scope/design conflicts.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after one task.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (commands, results, failures), mutations (exact paths and checkbox), blocker (or none), and refreshed status. Report unavailable CLI honestly; never install a runtime.
