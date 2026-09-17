# Define OpenSpec Intent

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions proposal --change "<change>" --json`. Read its template and every concrete dependency path or contextFiles entry, plus existing proposal and relevant repository learnings. Build a packet containing change, schemaName, artifactId, instruction, resolvedOutputPath, settled decisions, and allowed mutation paths. Missing paths or conflicting evidence are blockers; never guess ownership.

Use ce-brainstorm reasoning to define problem, alternatives, intent, boundaries, capabilities, and observable success. Preserve settled artifacts instead of re-asking plan/work scope. Ask only about unresolved material decisions. Write only the owned OpenSpec proposal output path resolved from instructions within changeRoot; do not implement or create learnings.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after this stage.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (evidence read, not invented tests), mutations (exact paths), blocker (or none), and refreshed status. Report unavailable CLI or failed status honestly; never install a runtime.
