# TUI Runtime Boundary

## Purpose

Own the isolated OpenTUI runtime sidecar used by `opsx-schema view`.

## Ownership

- `runtime.mjs` owns dynamic `@opentui/core` import, versioned parent IPC envelopes, Overview/pane bootstrap frames, action response transport, and terminal cleanup.
- `state.mjs`, `input.mjs`, and `controller.mjs` own pure state transitions, typed confirmation routing, keyboard routing, and renderer orchestration.
- `overview-model.mjs` owns pure authoritative snapshot projection and semantic selection IDs; `overview.mjs` owns one reconciled OpenTUI Overview subtree; `panes-model.mjs` and `panes.mjs` own Changes, Archive, and Config projection/rendering.
- CommonJS launch and platform gates stay in `bin/opsx-view.js`.

## Local Contracts

- Keep this boundary ESM-only and free of OpenSpec project discovery, filesystem, subprocess, or mutations; parent `bin/opsx-view.js` owns snapshot collection and IPC refresh responses.
- Import OpenTUI dynamically after parent preflight; keep controller orchestration free of OpenSpec discovery and mutations.
- Manage renderer signals explicitly with `exitSignals: []` and `exitOnCtrlC: false`.
- Create the renderer with `useMouse: false`; controller listeners must be removable and refresh effects must remain injectable.
- Route Ctrl+C before modal, text-input, focused-target, or global handlers; only Up/Down may consume repeated key events.
- Initialize viewport from renderer dimensions, invalidate readiness on resize, and restore readiness only from the current renderer-idle completion.
- Flush the initial frame with `renderer.idle()`, then retain the sidecar until explicit shutdown; destroy renderer and disconnect IPC at most once.
- Overview reads only injected controller state, starts UNLOADED, hides outside Overview tab, and performs no OpenSpec discovery, mutation, filesystem, or subprocess work.
- Overview model preserves unknown versus observed zero values, trusts health only for boolean health with consistent roots, sanitizes semantic text, and keeps top-level diagnostics single-sourced.
- Overview renderer uses only `BoxRenderable` and `TextRenderable`, reconciles bounded diagnostic nodes, keeps selection/focus semantics visible in text, and omits explicit colors when `NO_COLOR` is nonempty.
- Parent sends only versioned private snapshot envelopes after child connection; sidecar validates and ignores malformed or late messages, and rejects pending refreshes during shutdown without rendering after disposal.
- IPC protocol v2 is shared from CommonJS parent and ESM sidecar. Sidecar never discovers projects, reads files, runs subprocesses, mutates, or renders opaque preview tokens. Enter opens typed confirmation only after parent preview; exact case/space confirmation is required, paste cannot submit, incompatible handoffs require explicit acknowledgement plus a new preview, Escape revokes, and Ctrl+C remains exit 130.
- Changes requires explicit active-change selection; Archive reports active-snapshot limitation; Config observes project config, resolved schemas, and managed skills independently. Narrow layout thresholds are 80/100/140 columns with read-only resize below 80x24.
- Display rows use bounded native text truncation, explicit shortening markers, reserved diagnostic overflow and error rows, and attached-node checks during reconciliation.

## Verification

- Run `node --check src/tui/runtime.mjs`.
- Run `nub run test:tui` only on supported Node.js >=26.4 Linux x64 glibc with a real TTY.

## Child DOX Index

No child DOX files.
