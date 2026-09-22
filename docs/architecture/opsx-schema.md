# Opsx Schema Architecture

> Status: Proposed architecture. Current shipped behavior is defined by the
> implementation and release documentation.

## Decision

Build `opsx-schema` as a project-aware schema and skill control plane around
OpenSpec. Keep `@nebulesstech/openspec-schemas`, `openspec-schemas`, and the
OpenSpec lifecycle CLI unchanged. `opsx-schema` becomes preferred binary.

OpenSpec remains authority for change roots, schema pins, artifact readiness,
instructions, validation, and archive semantics. Opsx Schema owns schema
packages, companion resources, project snapshots, JSON output, and the TUI.

Do not auto-migrate artifacts between schemas. A schema handoff only updates a
change-local `.openspec.yaml` after graph comparison and acknowledgement.

## User Surface

```text
opsx-schema list
opsx-schema inspect [--change <id>] [--json]
opsx-schema install <schema> [--skills] [--profile <name>] [--agents <host>] [--activate]
opsx-schema enable <schema> [--yes]
opsx-schema disable skills|adapter ... [--apply]
opsx-schema skills inspect|install|enable|disable|doctor
opsx-schema set-change-schema <change> <schema> [--apply] [--allow-incompatible]
opsx-schema doctor [--json] [--fix]
opsx-schema update-check [--json]
opsx-schema view
```

Keep every current `openspec-schemas` command and option alias. Do not provide
`openspec view`: this package cannot safely extend or shadow independently
installed OpenSpec.

All agent-consumable commands support `--json`, `--quiet`, and `--no-color`.
JSON stdout uses one versioned envelope:

```json
{
  "schemaVersion": 1,
  "command": "inspect",
  "ok": true,
  "data": {},
  "diagnostics": [],
  "mutations": [],
  "nextActions": []
}
```

### Agent Ergonomics

Adopt Axi patterns for agent-facing CLI behavior only. Axi does not establish
the TUI framework, pane model, reducer, or terminal layout; OpenTUI and Hunk
research govern those decisions.

- With no arguments, print a compact live project summary; do not mutate or
  launch the TUI.
- Keep list rows to stable summary fields; put artifact or document bodies in
  explicit detail commands with `--full` when needed.
- Include derived counts: active changes, ready and blocked artifacts, managed
  and enabled skills, and diagnostics by severity.
- Represent every empty state explicitly as zero counts and empty arrays.
- Reject leading, unknown, and malformed flags before OpenSpec or filesystem
  discovery. Usage and validation failures exit `2`; operational failures exit
  `1`.
- Make mutations flags-only and idempotent. Successful convergence returns a
  no-op mutation record. `--apply`, `--yes`, and `--allow-incompatible` remain
  required acknowledgement gates.
- Keep `--version`, `-v`, and `-V` dependency-free: no project scan, OpenSpec
  subprocess, or OpenTUI import.
- Offer integrations only through an explicit setup command. Inspection,
  diagnostics, and the TUI never install skills, adapters, or hooks.

`--json` remains canonical. TOON may become an optional compact projection only
after representative output-size and parser-compatibility tests; it does not
replace the JSON contract.

## Domain Boundary

Extract current single-file CommonJS implementation behind shared modules:

```text
bin/
  opsx-schema.js
  openspec-schemas.js
src/
  cli/          command dispatch, argument parsing, output
  domain/       snapshot, catalog, graph, manifests, profiles, diagnostics
  adapters/     OpenSpec CLI, filesystem, skill installer, update source
  commands/     list, inspect, install, enable, disable, doctor, view
  tui/          ESM-only OpenTUI boundary
```

One immutable snapshot drives `inspect`, `doctor`, agent JSON, and the TUI.
Lifecycle fields come from `openspec status --json`; filesystem reads only
discover candidates and diagnose local package/resources. Snapshot refresh
replaces state atomically and retains last good state as explicitly stale when
refresh fails.

Construct project context lazily after help, version, and command validation.
This keeps no-context commands fast and prevents invalid invocations from
calling OpenSpec or scanning a project.

Distinguish:

```text
ProjectDefaultSchema   openspec/config.yaml
ChangePinnedSchema     <changeRoot>/.openspec.yaml
InstalledSchema        local package inventory
```

## Skills And Interchange

Profiles are checked-in package policy:

```text
default      schema-declared baseline skills
recommended  default plus declared compatible specialist set
all          every explicitly declared supported skill
```

No project text, README, or agent prompt can cause external skill installation.
Every install preflights source, manifest, collision, symlink, and target type
before mutation. Managed resources record ownership and content digests under
`.openspec/opsx-schema/managed-skills.json`; cleanup refuses unknown or modified
resources by default.

Ownership records include a package marker, declared target path, source, and
content digest. Setup and cleanup preserve unrelated resources, repair stale
managed paths only when ownership proves them safe, and return no-op when no
managed resource needs change.

Design and Compound work interoperate through explicit handoff. Design change
owns discovery, decisions, specs, design, ADR, and tasks. Compound change owns
bounded execution. Future `handoff` command may create a destination context
only after source approval; it must not migrate source artifacts or create a
second lifecycle authority.

## TUI

Run only with `opsx-schema view`. Use imperative `@opentui/core` in isolated
Node >=26.4 ESM code launched with `--experimental-ffi`. Core CLI remains Node
>=20 CommonJS. Initial TUI support is Linux x64 glibc only; unsupported runtime
or target exits nonzero with diagnostic and suggests `inspect --json` and
`doctor`.

Shell, inspired by Hunk without copying it:

```text
header and tabs
navigation rail | content pane | optional detail pane
contextual footer
```

Panes:

- Overview: project root, active schema, health, skills, current change,
  warnings, update state.
- Changes: active changes, pinned schemas, artifact graph and readiness.
- Archive: read-only historical entries with confirmation state.
- Config: schemas, managed skills, host adapters, runtime, update status.

Use pure reducer state separate from terminal geometry. Route keys centrally:

```text
modal > text input > focused pane > global command
```

Keyboard: `1-4` panes, `Tab` / `Shift-Tab` focus, arrows selection, `Enter`
activate, `r` refresh, `?` help, `q` quit. Mouse is additive: explicit
down/up activation, scrolling, focus transfer. Every mouse action has a
keyboard equivalent. Layout defines full, medium, and tight breakpoints.

## Delivery Increments

1. Add `opsx-schema` launcher and shared JSON envelope; preserve legacy binary.
   Add no-argument compact summary and dependency-free version fast path.
2. Build snapshot adapter, `inspect`, `doctor`, diagnostics, compact JSON
   projections, aggregates, explicit empty states, and JSON tests.
3. Add schema enable and skill profile management with explicit mutation plans.
4. Move existing `set-change-schema` into command module unchanged in safety.
5. Spike isolated OpenTUI runtime and deterministic renderer smoke test.
6. Ship shell and Overview with keyboard, mouse, loading/error/stale states.
7. Ship Changes, Archive, Config, confirmations, update-check, docs, release QA.

Each increment stays independently releasable. No package publish occurs as
part of implementation.

## Verification

- Preserve current install, collision, symlink, activation, handoff rollback,
  package allowlist, and extracted-package CLI tests.
- Add JSON contract fixtures for valid/malformed OpenSpec status, roots outside
  project, archives, incompatible graphs, and unavailable runtime.
- Add pre-dispatch tests proving help/version and invalid flags do not resolve
  project context; test structured errors, explicit empty states, truncation,
  idempotent no-ops, EPIPE, and managed-resource preservation.
- Add pure reducer/key/breakpoint tests and OpenTUI test-renderer frame tests.
- Manual terminal matrix: Linux x64 glibc Node 26.4 FFI, Node 20 error path,
  and unsupported-target path; 80x24, 100x30, 140x40; mouse on/off; no-color;
  tmux; CJK names; normal exit, SIGINT, and SIGTERM cleanup.

## Source Basis

- Current CLI and safety contracts: `bin/openspec-schemas.js`,
  `scripts/test-release.js`, `AGENT_INSTALL.md`, and
  `scripts/install-schema-skills.sh`.
- OpenTUI pinned research: `anomalyco/opentui` revision
  `4954312d749f71e80664aa8b0e8a75384186eb99`; runtime, interaction, testing,
  and package-entrypoint documentation at https://opentui.com/docs.
- TUI design reference: `modem-dev/hunk` revision
  `9b95a71b76c472bad21ffa5cc6b01b204e2f6f7a`; reducer, command routing,
  responsive shell, and mouse/keyboard patterns.
- Agent CLI reference: `kunchenguid/axi` revision
  `058bc36ce8a6fee49569efc407d25d6fd3b584d0`; compact outputs, aggregates,
  structured errors, lazy context, explicit integration setup, and version fast
  path. Its repository has no TUI implementation.
