#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSessionId, envelope, validateEnvelope, IpcProtocolError } = require('./opsx-ipc-protocol.js');
const { createActionAdapter, createWorkerRunner } = require('./opsx-view-actions.js');

const MIN_NODE = Object.freeze({ major: 26, minor: 4, patch: 0 });
const SIDEcar = path.join(__dirname, '..', 'src', 'tui', 'runtime.mjs');
const IPC_TYPE = 'opsx-schema:view-ipc';
const IPC_VERSION = 2;
let viewShutdown = null;

class ViewError extends Error {
  constructor(code, message) {
    super(`${code}: ${message} Try 'opsx-schema inspect --json' or 'opsx-schema doctor'.`);
    this.name = 'ViewError';
    this.code = code;
  }
}

function parseStableNodeVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function isAtLeast(version, minimum) {
  return version.major > minimum.major
    || (version.major === minimum.major && version.minor > minimum.minor)
    || (version.major === minimum.major && version.minor === minimum.minor && version.patch >= minimum.patch);
}

function glibcVersion(runtime = process) {
  const report = runtime.report?.getReport?.();
  const version = report?.header?.glibcVersionRuntime;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

function preflight(runtime = process, env = runtime.env) {
  if (runtime.release?.name !== 'node') throw new ViewError('TUI_RUNTIME_UNSUPPORTED', 'Node.js 26.4.0 or newer is required; Bun and other runtimes are unsupported.');
  const version = parseStableNodeVersion(runtime.versions?.node ?? '');
  if (!version || !isAtLeast(version, MIN_NODE)) throw new ViewError('TUI_RUNTIME_UNSUPPORTED', 'Node.js 26.4.0 or newer stable release is required for OpenTUI FFI.');
  if (runtime.platform !== 'linux' || runtime.arch !== 'x64') throw new ViewError('TUI_TARGET_UNSUPPORTED', 'OpenTUI view currently supports Linux x64 only.');
  if (!glibcVersion(runtime)) throw new ViewError('TUI_TARGET_UNSUPPORTED', 'OpenTUI view requires a detected glibc runtime on Linux x64.');
  if (env.OPENTUI_LIBC && env.OPENTUI_LIBC !== 'glibc') throw new ViewError('TUI_TARGET_UNSUPPORTED', 'OPENTUI_LIBC must be unset, empty, or glibc; musl and unknown values are unsupported.');
  for (const name of ['OTUI_ASSET_ROOT', 'OTUI_TREE_SITTER_WORKER_PATH']) {
    if (env[name]) throw new ViewError('TUI_TARGET_UNSUPPORTED', `${name} overrides are unsupported for packaged OpenTUI view.`);
  }
  if (!runtime.stdin?.isTTY || !runtime.stdout?.isTTY) throw new ViewError('TUI_TARGET_UNSUPPORTED', 'opsx-schema view requires TTY stdin and stdout.');
  if (!env.TERM || env.TERM === 'dumb') throw new ViewError('TUI_TARGET_UNSUPPORTED', 'opsx-schema view requires TERM set to a non-dumb terminal.');
}

function setViewShutdown(shutdown) {
  viewShutdown = shutdown;
}

function exitCodeForSignal(signal) {
  return { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal] ?? 1;
}

async function snapshotEnvelope(request, sessionId, runner) {
  try {
    const snapshot = await runner.run({ type: 'snapshot' });
    return envelope('snapshot', sessionId, request, { snapshot });
  } catch (error) {
    return envelope('snapshot-error', sessionId, request, { error: { code: typeof error?.code === 'string' ? error.code : 'SNAPSHOT_FAILED', message: error instanceof Error ? error.message : 'Snapshot unavailable.' } });
  }
}

async function sendSnapshot(child, request, sessionId, runner, isOpen) {
  if (!child.connected || typeof child.send !== 'function') return false;
  try {
    const message = await snapshotEnvelope(request, sessionId, runner);
    if (!isOpen() || !child.connected) return false;
    child.send(message, () => {});
    return true;
  } catch {
    return false;
  }
}

function runView({
  runtime = process,
  env = process.env,
  spawnProcess = spawn,
  setActiveShutdown = setViewShutdown,
  stderr = process.stderr,
  forkJobProcess,
  killProcess,
  jobGroupGraceMs = 1000,
  shutdownDeadlineMs = 5000,
} = {}) {
  preflight(runtime, env);
  return new Promise(resolve => {
    const child = spawnProcess(runtime.execPath, ['--experimental-ffi', SIDEcar], {
      cwd: runtime.cwd(),
      env: { ...env },
      shell: false,
      detached: false,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    let settled = false;
    let channelOpen = true;
    let forwardedSignal = null;
    let deadline = null;
    let cleanup = () => {};
    let initialSent = false;
    let initialInFlight = false;
    let spawned = false;
    const sessionId = createSessionId();
    const groupGraceMs = Math.min(jobGroupGraceMs, Math.max(0, Math.floor((shutdownDeadlineMs - 1) / 2)));
    const runner = createWorkerRunner({ forkProcess: forkJobProcess, killProcess, cwd: runtime.cwd(), env, groupGraceMs });
    const actions = createActionAdapter({ runner });
    const closeWorkers = () => {
      channelOpen = false;
      return actions.close();
    };
    const sendInitialSnapshot = () => {
      if (!channelOpen || initialSent || initialInFlight || !spawned || !child.connected) return;
      initialInFlight = true;
      sendSnapshot(child, 'initial', sessionId, runner, () => channelOpen).then(sent => { initialSent = sent; initialInFlight = false; });
    };
    const send = message => {
      if (!channelOpen || !child.connected) return false;
      try { child.send(message, () => {}); return true; } catch { return false; }
    };
    const sendActionError = (requestId, error) => send(envelope('action-error', sessionId, requestId, { error: { code: error.code || 'ACTION_FAILED', message: error.message || 'Action failed.' } }));
    const messageHandler = message => {
      if (!channelOpen) return;
      try {
        validateEnvelope(message, sessionId);
        if (message.kind === 'refresh-request') void sendSnapshot(child, message.requestId, sessionId, runner, () => channelOpen);
        else if (message.kind === 'preview-request') actions.preview(message).then(result => send(envelope('preview-response', sessionId, message.requestId, { operation: message.operation, preview: result, confirmation: result.confirmation })), error => sendActionError(message.requestId, error));
        else if (message.kind === 'apply-request') actions.apply(message).then(result => send(envelope('apply-response', sessionId, message.requestId, { operation: message.operation, result })), error => sendActionError(message.requestId, error));
        else if (message.kind === 'cancel-request') actions.cancel(message.token, message.sessionId, message.requestId);
      } catch (error) {
        if (error instanceof IpcProtocolError) return;
        sendActionError(message?.requestId || 'request-invalid', error);
      }
    };
    const finish = async code => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      cleanup();
      setActiveShutdown(null);
      try {
        await closeWorkers();
        resolve(code);
      } catch (error) {
        stderr.write(`opsx-schema view: ${error?.code || 'WORKER_CLEANUP_FAILED'}: ${error instanceof Error ? error.message : 'Action process cleanup failed.'}\n`);
        resolve(1);
      }
    };
    const forward = signal => {
      if (settled || forwardedSignal) return;
      forwardedSignal = signal;
      void closeWorkers().catch(() => {});
      child.kill(signal);
      deadline = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          void finish(1);
        }
      }, shutdownDeadlineMs);
    };
    const reapForEpipe = () => {
      if (settled || forwardedSignal) return;
      forwardedSignal = 'EPIPE';
      void closeWorkers().catch(() => {});
      child.kill('SIGTERM');
      deadline = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          void finish(0);
        }
      }, shutdownDeadlineMs);
    };
    setActiveShutdown(reapForEpipe);
    viewShutdown = reapForEpipe;
    child.on('message', messageHandler);
    child.once('spawn', () => {
      spawned = true;
      sendInitialSnapshot();
      if (!initialSent) setImmediate(sendInitialSnapshot);
    });
    const signalHandlers = new Map([
      ['SIGINT', () => forward('SIGINT')],
      ['SIGTERM', () => forward('SIGTERM')],
      ['SIGHUP', () => forward('SIGHUP')],
    ]);
    const disconnectHandler = () => forward('SIGHUP');
    for (const [signal, handler] of signalHandlers) runtime.on(signal, handler);
    runtime.on('disconnect', disconnectHandler);
    cleanup = () => {
      for (const [signal, handler] of signalHandlers) runtime.off(signal, handler);
      runtime.off('disconnect', disconnectHandler);
      child.off('message', messageHandler);
    };
    child.once('error', error => { stderr.write(`opsx-schema view: unable to start runtime: ${error.message}\n`); void finish(1); });
    child.once('close', (code, signal) => {
      if (forwardedSignal === 'EPIPE') void finish(0);
      else if (signal) void finish(exitCodeForSignal(signal));
      else void finish(code ?? 1);
    });
  });
}

module.exports = { MIN_NODE, SIDEcar, ViewError, parseStableNodeVersion, preflight, runView, setViewShutdown };
