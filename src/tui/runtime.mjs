import { attachController } from "./controller.mjs";
import { createInitialState } from "./state.mjs";
import { overviewSelectionIds, projectOverview } from "./overview-model.mjs";
import { createRequire } from "node:module";
import { paneSelectionIds } from "./panes-model.mjs";

const require = createRequire(import.meta.url);
const { envelope, validateEnvelope, IpcProtocolError } = require("../../bin/opsx-ipc-protocol.js");

let renderer = null;
let controller = null;
let overview = null;
let panes = null;
let rendererDestroyed = false;
let shuttingDown = false;
let requestedExitCode = 0;
let shutdownPromise = null;
let resolveLifetime;
const lifetimePromise = new Promise(resolve => { resolveLifetime = resolve; });
let lifetimeResolved = false;
let cleanup = () => {};
const pendingMessages = [];
const pendingRefresh = new Map();
const pendingActions = new Map();
let sessionId = null;

const signalExitCodes = new Map([
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
]);
const signalHandlers = new Map();

function validSnapshot(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && (value.root === null || (typeof value.root === "object" && !Array.isArray(value.root)))
    && Array.isArray(value.schemas) && Array.isArray(value.changes) && Array.isArray(value.diagnostics)
    && (value.health === null || (typeof value.health === "object" && !Array.isArray(value.health)))
    && (value.root === null || (typeof value.skills === "object" && value.skills !== null && !Array.isArray(value.skills)));
}

function validError(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && typeof value.code === "string" && typeof value.message === "string";
}

function sendMessage(message) {
  if (typeof process.send !== "function" || !process.connected) return false;
  try { process.send(message, () => {}); return true; } catch { return false; }
}

function receiveMessage(message) {
  try { validateEnvelope(message, sessionId); } catch (error) { if (error instanceof IpcProtocolError) return; throw error; }
  if (message.kind === "snapshot" && validSnapshot(message.snapshot)) {
    if (message.requestId === "initial" && controller) controller.dispatch({ type: "snapshot/receive", snapshot: message.snapshot, selectionIds: [...overviewSelectionIds(message.snapshot), ...paneSelectionIds(message.snapshot)] });
    else if (message.requestId === "initial") pendingMessages.push(message);
    else {
      const pending = pendingRefresh.get(message.requestId);
      if (!pending) return;
      pendingRefresh.delete(message.requestId);
      pending.resolve({ snapshot: message.snapshot, selectionIds: [...overviewSelectionIds(message.snapshot), ...paneSelectionIds(message.snapshot)] });
    }
    return;
  }
  if (message.kind === "snapshot-error" && validError(message.error)) {
    if (message.requestId === "initial" && controller) controller.dispatch({ type: "error/set", error: message.error });
    else if (message.requestId === "initial") pendingMessages.push(message);
    else {
      const pending = pendingRefresh.get(message.requestId);
      if (!pending) return;
      pendingRefresh.delete(message.requestId);
      pending.reject(message.error);
    }
    return;
  }
  if (message.kind === "preview-response") {
    const pending = pendingActions.get(message.requestId);
    if (pending) {
      pendingActions.delete(message.requestId);
      const { token, ...renderPreview } = message.preview;
      pending.resolve({ preview: renderPreview, confirmation: message.confirmation, token });
    }
    return;
  }
  if (message.kind === "apply-response" || message.kind === "action-error") {
    const pending = pendingActions.get(message.requestId);
    if (!pending) return;
    pendingActions.delete(message.requestId);
    if (message.kind === "apply-response") pending.resolve(message.result);
    else pending.reject(message.error);
  }
}

const onMessage = message => {
  if (!sessionId && message?.sessionId) sessionId = message.sessionId;
  receiveMessage(message);
};
process.on("message", onMessage);

function stableNode26() {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(process.versions.node ?? "");
  return match && (Number(match[1]) > 26 || (Number(match[1]) === 26 && Number(match[2]) >= 4));
}

function destroyRenderer() {
  if (renderer && !rendererDestroyed) {
    rendererDestroyed = true;
    renderer.destroy();
  }
}

function disconnectIpc() {
  if (typeof process.disconnect === "function" && process.connected) process.disconnect();
}

function resolveLifetimeOnce() {
  if (lifetimeResolved) return;
  lifetimeResolved = true;
  resolveLifetime();
}

async function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    shuttingDown = true;
    requestedExitCode = code;
    try {
      cleanup();
      destroyRenderer();
      disconnectIpc();
    } finally {
      resolveLifetimeOnce();
      await new Promise(resolve => setImmediate(resolve));
      process.exitCode = requestedExitCode;
    }
  })();
  return shutdownPromise;
}

for (const [signal, code] of signalExitCodes) {
  const handler = () => { void shutdown(code); };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}
const onDisconnect = () => { void shutdown(129); };
const onInput = chunk => { if (chunk.includes(3)) void shutdown(130); };
const streamHandlers = new Map();
process.on("disconnect", onDisconnect);
process.stdin.on("data", onInput);
const detachBootstrapInput = () => process.stdin.off("data", onInput);
for (const stream of [process.stdout, process.stderr]) {
  const onError = () => {
    void shutdown(1);
  };
  streamHandlers.set(stream, onError);
  stream.on("error", onError);
}
cleanup = () => {
  cleanup = () => {};
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  process.off("disconnect", onDisconnect);
  detachBootstrapInput();
  process.stdin.pause?.();
  controller?.dispose();
  overview?.dispose();
  panes?.dispose();
  process.off("message", onMessage);
  for (const pending of pendingRefresh.values()) pending.reject({ code: "VIEW_SHUTDOWN", message: "View shutting down." });
  pendingRefresh.clear();
  for (const [stream, handler] of streamHandlers) stream.off("error", handler);
};

if (process.release.name !== "node" || !stableNode26() || process.platform !== "linux" || process.arch !== "x64" || !process.report?.getReport?.().header?.glibcVersionRuntime) {
  process.stderr.write("opsx-schema view: TUI_RUNTIME_UNSUPPORTED: Node.js 26.4.0 stable on Linux x64 glibc is required.\n");
  await shutdown(1);
} else if (!shuttingDown) {
  try {
    const { createCliRenderer } = await import("@opentui/core");
    if (!shuttingDown) {
      renderer = await createCliRenderer({ exitSignals: [], exitOnCtrlC: false, useMouse: false });
      if (shuttingDown) destroyRenderer();
      else {
        const { createOverview } = await import("./overview.mjs");
        const { createPanes } = await import("./panes.mjs");
        overview = createOverview(renderer, { noColor: process.env.NO_COLOR?.length > 0 });
        panes = createPanes(renderer, { noColor: process.env.NO_COLOR?.length > 0 });
        const initialState = createInitialState();
        overview.update(projectOverview(initialState), { width: renderer.width, height: renderer.height });
        panes.update(initialState, { width: renderer.width, height: renderer.height });
        await renderer.idle();
        if (!shuttingDown) {
          controller = attachController(renderer, {
            initialState: createInitialState(),
            refresh: requestId => new Promise((resolve, reject) => {
              pendingRefresh.set(requestId, { resolve, reject });
              if (!sendMessage(envelope("refresh-request", sessionId, requestId))) {
                pendingRefresh.delete(requestId);
                reject({ code: "IPC_UNAVAILABLE", message: "View data channel unavailable." });
              }
            }),
            preview: effect => new Promise((resolve, reject) => {
              pendingActions.set(effect.requestId, { resolve, reject });
              const acknowledgement = effect.operation === "handoff" && effect.selectors.acknowledgement === true;
              if (!sendMessage(envelope("preview-request", sessionId, effect.requestId, { operation: effect.operation, selectors: effect.selectors, acknowledgement }))) {
                pendingActions.delete(effect.requestId);
                reject({ code: "IPC_UNAVAILABLE", message: "Action channel unavailable." });
              }
            }),
            apply: effect => new Promise((resolve, reject) => {
              pendingActions.set(effect.requestId, { resolve, reject });
              if (!sendMessage(envelope("apply-request", sessionId, effect.requestId, { operation: effect.operation, selectors: effect.selectors, token: effect.token, confirmation: effect.confirmation }))) {
                pendingActions.delete(effect.requestId);
                reject({ code: "IPC_UNAVAILABLE", message: "Action channel unavailable." });
              }
            }),
              cancel: (token, requestId) => {
                if (sessionId) {
                sendMessage(envelope("cancel-request", sessionId, requestId ?? `request-cancel-${Date.now().toString(36)}`, { token: token ?? "0".repeat(64) }));
                pendingActions.delete(requestId);
              }
            },
            semantic: {
              tab: (_event, context) => {
                const state = context.state;
                if (state.tab !== "changes") return null;
                const schemas = paneSelectionIds(state.snapshot).filter(id => id.startsWith("schema:"));
                const current = schemas.indexOf(state.focusId);
                const schema = schemas.length ? schemas[(current + 1) % schemas.length] : null;
                return schema ? { type: "focus/select", focusId: schema } : null;
              },
              up: (_event, context) => {
                const state = context.state;
                const ids = state.tab === "changes" ? paneSelectionIds(state.snapshot).filter(id => id.startsWith("change:")) : paneSelectionIds(state.snapshot).filter(id => id.startsWith("schema:"));
                if (!ids.length) return null;
                const index = Math.max(0, ids.indexOf(state.selectedId));
                return { type: "selection/select", selectedId: ids[Math.max(0, index - 1)] };
              },
              down: (_event, context) => {
                const state = context.state;
                const ids = state.tab === "changes" ? paneSelectionIds(state.snapshot).filter(id => id.startsWith("change:")) : paneSelectionIds(state.snapshot).filter(id => id.startsWith("schema:"));
                if (!ids.length) return null;
                const index = ids.indexOf(state.selectedId);
                return { type: "selection/select", selectedId: ids[Math.min(ids.length - 1, index < 0 ? 0 : index + 1)] };
              },
              operation: state => state.tab === "config" ? "schema.enable" : "handoff",
              selectors: state => {
                if (state.tab === "config") return { schema: state.selectedId?.replace(/^schema:/, "") };
                const occurrences = new Map();
                const change = state.snapshot?.changes?.find(item => {
                  const value = item.id ?? item.listed?.name;
                  const occurrence = occurrences.get(value) ?? 0;
                  occurrences.set(value, occurrence + 1);
                  return `change:${String(value).replace(/[^A-Za-z0-9._:-]+/g, "_")}:${occurrence}` === state.selectedId;
                });
                const destination = state.focusId?.startsWith("schema:") ? state.focusId.slice("schema:".length) : null;
                return change?.schemaName && destination && destination !== change.schemaName ? { change: change.id ?? change.listed?.name, schema: destination, acknowledgement: state.action.selectors?.acknowledgement === true } : null;
              },
            },
            onState: state => { overview.update(projectOverview(state), state.viewport); panes.update(state, state.viewport); },
            onQuit: code => { void shutdown(code); },
          });
          for (const message of pendingMessages.splice(0)) receiveMessage(message);
          detachBootstrapInput();
        }
      }
    }
  } catch (error) {
    if (!shuttingDown) {
         const message = error?.code === "ERR_MODULE_NOT_FOUND"
         ? "TUI_RUNTIME_UNSUPPORTED: optional OpenTUI runtime is unavailable"
         : error instanceof Error ? error.message : String(error);
       process.stderr.write(`opsx-schema view: ${message}\n`);
       if (message === "TUI_RUNTIME_UNSUPPORTED: optional OpenTUI runtime is unavailable") process.stderr.write("Use opsx-schema inspect --json or opsx-schema doctor.\n");
      await shutdown(1);
    }
  }
}

await lifetimePromise;
await shutdownPromise;
