---
description: Retain one eligible OpenSpec learning
---
# Retain One OpenSpec Learning

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks, plus verified proof/review evidence and existing learnings. Stop if apply is blocked or work lacks passing proof or has unresolved findings. Build a packet containing instruction, settled decisions, evidence, and one allowed learning output path in the repository learning store (normally docs/solutions/). Missing path authorization is a blocker to writing, not permission to invent a store.

Use ce-compound reasoning. Preserve settled artifacts instead of re-asking plan/work scope. Write only one eligible learning or none: reasoning must be non-obvious, durable, material, not recoverable from code/tests/comments/existing docs, and costly or risky to lose. Check duplicates first. No draft files, automatic refresh of older learnings, or mandatory learning quota. The sole write exception outside owned OpenSpec paths is the packet-authorized learning path. Do not edit OpenSpec artifacts or task status in this stage. If nothing qualifies, return no learning and its reason.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after this learning decision.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (eligibility and verification evidence), mutations (one exact path or none), blocker (or none), and refreshed status. Report unavailable CLI honestly; never install a runtime.
