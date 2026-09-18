# Plan One OpenSpec Artifact

CLI artifactPaths and resolvedOutputPath are layout authority; generates is relative to changeRoot. Expand specs/**/*.md into non-empty <changeRoot>/specs/<capability>/spec.md files for approved capabilities, never a literal glob or empty directory. Read concrete dependency files and verify contents plus refreshed existingOutputPaths and status before completion. Missing metadata blocks work; never guess paths.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Require one explicitly selected planning artifact: specs, design, adr, or tasks. Do not select a stage automatically. Require its status to be ready; blocked prerequisites or an already completed artifact require an explicit owning-artifact revision decision, not bypass. Run `openspec instructions <artifact> --change "<change>" --json`. Read its template, every concrete dependency path or contextFiles entry, and settled proposal/specs/design/ADR decisions. Build a packet containing artifactId, resolvedOutputPath, instruction, settled decisions, and allowed mutation paths. Missing paths or conflicts are blockers.

Use ce-plan reasoning for only that artifact. Preserve settled artifacts instead of re-asking plan/work scope. Specs and design require proposal; adr requires design; tasks requires specs and adr. Never skip gates. Retain stable U-IDs and named proofs. Write only owned OpenSpec output paths within changeRoot. For adr, report any needed repository-level ADR as a blocker for separately authorized work; never edit accepted ADRs. Do not implement.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after this artifact.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof (evidence and gate checks), mutations (exact paths), blocker (or none), and refreshed status. Report unavailable CLI honestly; never install a runtime.
