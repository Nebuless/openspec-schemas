---
description: Review bounded OpenSpec work
---
# Review OpenSpec Work

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks, plus the scoped diff and repository standards. Stop if apply is blocked; all_done does not prevent review. Build a packet containing reviewed task IDs, instruction, settled decisions, proof criteria, and allowed mutation paths. Missing ownership is a blocker.

Use ce-code-review reasoning against the artifacts. Preserve settled artifacts instead of re-asking plan/work scope. Report verified findings with severity, path, evidence, and impact; fix only verified in-scope findings in task-owned implementation/test paths authorized by the packet. OpenSpec writes are limited to the owned task status within changeRoot, supported by rerun proofs. Do not create review trackers or change settled intent. Report out-of-scope findings without fixing them. Rerun affected named proofs after each fix; unresolved findings block completion.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after review.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (findings and commands/results), mutations (exact paths), blocker (or none), and refreshed status. Report unavailable CLI honestly; never install a runtime.
