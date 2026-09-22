'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');
const { createSnapshot } = require('./opsx-snapshot.js');
const { handoff } = require('./change-schema.js');
const { schemaNames, loadProfile, markerState, enableSchema, mutateSkills, readProjectSchema } = require('./opsx-skills.js');
const { createSnapshot: createSnapshotCore } = require('./opsx-snapshot.js');
const { canonical, createToken, digest } = require('./opsx-ipc-protocol.js');

// allow: SIZE_OK — action policy and explicitly same-file private job host share one publish boundary.
const TOKEN_TTL = 60_000;
const JOB_HOST_ARGUMENT = '--opsx-view-job-host';
const DEFAULT_GROUP_GRACE_MS = 1000;
const packageRoot = path.resolve(__dirname, '..');
const packageManifest = require(path.join(packageRoot, 'package.json'));
const allowedOperations = new Set(['handoff', 'skills.install', 'skills.disable', 'schema.enable']);

class ViewActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ViewActionError';
    this.code = code;
  }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function name(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); }
function projectRoot(snapshot) {
  if (!object(snapshot?.root) || typeof snapshot.root.path !== 'string' || !path.isAbsolute(snapshot.root.path)) throw new ViewActionError('PROJECT_UNAVAILABLE', 'Authoritative project root unavailable.');
  return path.resolve(snapshot.root.path);
}
function selectorsFor(operation, selectors) {
  if (!object(selectors)) throw new ViewActionError('SELECTORS_INVALID', 'Action selectors are required.');
  const keys = {
    handoff: ['change', 'schema', 'acknowledgement'],
    'skills.install': ['schema', 'profile'],
    'skills.disable': ['schema', 'profile'],
    'schema.enable': ['schema'],
  }[operation];
  if (!keys || Object.keys(selectors).some(key => !keys.includes(key))) throw new ViewActionError('SELECTORS_INVALID', 'Action selectors contain unsupported fields.');
  for (const key of keys) if (key !== 'acknowledgement' && !name(selectors[key])) throw new ViewActionError('SELECTORS_INVALID', `Invalid selector: ${key}`);
  if (operation === 'handoff' && typeof selectors.acknowledgement !== 'boolean') throw new ViewActionError('ACKNOWLEDGEMENT_REQUIRED', 'Handoff compatibility acknowledgement is required.');
  if (operation.startsWith('skills.') && !['default', 'recommended', 'all'].includes(selectors.profile)) throw new ViewActionError('PROFILE_INVALID', 'Skill profile is invalid.');
  return Object.fromEntries(keys.map(key => [key, selectors[key]]));
}

function snapshotRevision(snapshot) { return digest({ root: snapshot.root, schemas: snapshot.schemas, changes: snapshot.changes, skills: snapshot.skills, diagnostics: snapshot.diagnostics }); }
function configExpectedState(root) {
  const openspec = path.join(root, 'openspec');
  let rootInfo;
  let parentInfo;
  try {
    rootInfo = fs.lstatSync(root);
    parentInfo = fs.lstatSync(openspec);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error('Project config is unavailable.');
    const config = readProjectSchema(root);
    return {
      bytes: digest(config.bytes.toString('base64')),
      file: { dev: config.info.dev ?? null, ino: config.info.ino ?? null, mode: config.info.mode & 0o7777 },
      parent: { path: fs.realpathSync(openspec), dev: parentInfo.dev ?? null, ino: parentInfo.ino ?? null, mode: parentInfo.mode & 0o7777 },
      root: { path: fs.realpathSync(root), dev: rootInfo.dev ?? null, ino: rootInfo.ino ?? null },
    };
  } catch (error) {
    throw new ViewActionError('CONFIG_INVALID', error instanceof ViewActionError ? error.message : 'Project config is unavailable.');
  }
}

function expectedState(snapshot, operation, selectors) {
  const root = projectRoot(snapshot);
  return digest({ revision: snapshotRevision(snapshot), operation, selectors, config: operation === 'schema.enable' ? configExpectedState(root) : null });
}

function createWorkerRunner({
  forkProcess = fork,
  killProcess = process.kill.bind(process),
  workerFile = __filename,
  cwd = process.cwd(),
  env = process.env,
  groupGraceMs = DEFAULT_GROUP_GRACE_MS,
} = {}) {
  const active = new Set();
  let closed = false;
  let closePromise = null;
  const closedError = () => new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
  const groupExists = record => {
    if (!record.spawned) return false;
    try {
      killProcess(-record.pid, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };
  const signalGroup = (record, signal) => {
    if (!groupExists(record)) return;
    try { killProcess(-record.pid, signal); }
    catch (error) { if (error?.code !== 'ESRCH') throw error; }
  };
  const waitForGroupAbsence = async record => {
    const deadline = Date.now() + groupGraceMs;
    while (groupExists(record)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining)));
    }
    return true;
  };
  const settle = (record, callback, value) => {
    if (record.settled) return;
    record.settled = true;
    callback(value);
  };
  const stop = record => {
    if (record.stopPromise) return record.stopPromise;
    record.stopPromise = (async () => {
      await record.spawnResult;
      if (!record.spawned || !groupExists(record)) { active.delete(record); return; }
      signalGroup(record, 'SIGTERM');
      if (!await waitForGroupAbsence(record)) {
        signalGroup(record, 'SIGKILL');
        if (!await waitForGroupAbsence(record)) throw new ViewActionError('WORKER_CLEANUP_FAILED', 'Action process group did not exit.');
      }
      active.delete(record);
    })();
    return record.stopPromise;
  };
  const run = job => new Promise((resolve, reject) => {
    if (closed) { reject(closedError()); return; }
    let child;
    try {
      child = forkProcess(workerFile, [JOB_HOST_ARGUMENT], {
        cwd,
        env: { ...env },
        detached: true,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
    } catch (error) { reject(error); return; }
    let resolveSpawn;
    const spawnResult = new Promise(resolve => { resolveSpawn = resolve; });
    const record = { child, pid: null, spawned: false, spawnKnown: false, spawnResult, resolveSpawn, stopPromise: null, settled: false, reject };
    active.add(record);
    const markSpawn = spawned => {
      if (record.spawnKnown) return;
      record.spawnKnown = true;
      record.resolveSpawn(spawned);
    };
    const onMessage = message => message.ok
      ? settle(record, resolve, message.value)
      : settle(record, reject, Object.assign(new Error(message.message), { code: message.code }));
    child.once('spawn', () => {
      record.pid = child.pid;
      record.spawned = Number.isInteger(record.pid) && record.pid > 0;
      markSpawn(record.spawned);
      if (closed) return;
      child.send(job, error => {
        if (!error) return;
        settle(record, reject, error);
        void stop(record).catch(() => {});
      });
    });
    child.once('message', onMessage);
    child.once('error', error => {
      markSpawn(false);
      settle(record, reject, error);
      if (!record.spawned) active.delete(record);
      else void stop(record).catch(() => {});
    });
    child.once('close', () => {
      markSpawn(false);
      settle(record, reject, new ViewActionError('WORKER_FAILED', 'Action worker stopped before completion.'));
      void stop(record).catch(() => {});
    });
  });
  const close = () => {
    if (closePromise) return closePromise;
    closed = true;
    const records = [...active];
    for (const record of records) if (!record.settled) settle(record, record.reject, closedError());
    closePromise = Promise.all(records.map(stop)).then(() => undefined);
    return closePromise;
  };
  return { run, close };
}

const defaultWorkerRunner = createWorkerRunner();

async function runOperation(job) {
  return defaultWorkerRunner.run({ ...job, packageRoot, packageVersion: packageManifest.version });
}

async function observeSnapshot(snapshot, run = runOperation) {
  return snapshot === createSnapshotCore ? run({ type: 'snapshot' }) : snapshot();
}

function validateAction(snapshot, operation, selectors) {
  const root = projectRoot(snapshot);
  if (!allowedOperations.has(operation)) throw new ViewActionError('OPERATION_NOT_ALLOWED', 'Operation is not allowed.');
  const selected = selectorsFor(operation, selectors);
  if (operation === 'handoff') {
    const change = snapshot.changes?.find(item => item.id === selected.change || item.listed?.name === selected.change);
    if (!change) throw new ViewActionError('CHANGE_NOT_ACTIVE', `Change '${selected.change}' is not active.`);
    if (change.complete === true || change.listed?.status === 'complete') throw new ViewActionError('CHANGE_COMPLETE', 'Completed changes cannot be handed off.');
    if (!snapshot.schemas?.some(item => item.name === selected.schema)) throw new ViewActionError('SCHEMA_UNRESOLVED', 'Destination schema is not resolved.');
    if (typeof change.schemaName !== 'string') throw new ViewActionError('SCHEMA_UNRESOLVED', 'Current effective schema is not resolved.');
    if (selected.schema === change.schemaName) throw new ViewActionError('DESTINATION_REQUIRED', 'Handoff destination must differ from current effective schema.');
  } else if (operation === 'schema.enable') {
    if (!schemaNames(packageRoot).includes(selected.schema) || !snapshot.schemas?.some(item => item.name === selected.schema)) throw new ViewActionError('SCHEMA_INELIGIBLE', 'Schema must be packaged and resolved.');
    configExpectedState(root);
  } else if (!snapshot.schemas?.some(item => item.name === selected.schema) || !schemaNames(packageRoot).includes(selected.schema)) {
    throw new ViewActionError('SCHEMA_UNRESOLVED', 'Schema is not resolved.');
  } else if (operation === 'skills.disable' && !snapshot.skills?.ownerships?.some(item => item.id === `${selected.schema}:${selected.profile}`)) {
    throw new ViewActionError('SKILL_OWNERSHIP_INVALID', 'Skill ownership is not observed for this schema profile.');
  }
  return { root, selectors: selected };
}

function previewDescription(operation, selectors, result) {
  if (operation === 'handoff') return `Apply handoff ${selectors.change} to ${selectors.schema}?`;
  if (operation === 'schema.enable') return `Apply project schema enable ${selectors.schema}?`;
  return `Apply ${operation} ${selectors.schema}:${selectors.profile}?`;
}

async function previewOperation(snapshot, operation, selectors, run = runOperation) {
  const context = validateAction(snapshot, operation, selectors);
  const job = operation === 'handoff'
    ? { type: 'preview', operation, selectors: context.selectors, root: context.root }
    : operation === 'schema.enable'
      ? { type: 'preview', operation, selectors: context.selectors, root: context.root }
      : { type: 'preview', operation, selectors: context.selectors, root: context.root };
  const result = await run(job);
  if (operation === 'handoff' && selectors.acknowledgement !== true && result?.data?.compatibility) result.data.compatibility = { ...result.data.compatibility, acknowledged: false };
  const stateFingerprint = expectedState(snapshot, operation, context.selectors);
  const previewDigest = digest({ operation, selectors: context.selectors, stateFingerprint, result });
  return { operation, selectors: context.selectors, result, stateFingerprint, snapshotRevision: snapshotRevision(snapshot), previewDigest, confirmation: previewDescription(operation, context.selectors, result) };
}

function createActionAdapter({ snapshot = createSnapshot, now = () => Date.now(), runner = createWorkerRunner() } = {}) {
  const tokens = new Map();
  const cancelledRequests = new Set();
  let closed = false;
  const run = job => runner.run({ ...job, packageRoot, packageVersion: packageManifest.version });
  const revoke = token => tokens.delete(token);
  const revokeAll = () => tokens.clear();
  const preview = async ({ sessionId, requestId, operation, selectors, acknowledgement }) => {
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    const requestKey = `${sessionId}:${requestId}`;
    if (cancelledRequests.has(requestKey)) throw new ViewActionError('ACTION_CANCELLED', 'Action request was cancelled.');
    const selected = operation === 'handoff' ? { ...selectors, acknowledgement } : { ...selectors };
    const current = await observeSnapshot(snapshot, run);
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    if (cancelledRequests.has(requestKey)) throw new ViewActionError('ACTION_CANCELLED', 'Action request was cancelled.');
    const model = await previewOperation(current, operation, selected, run);
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    if (cancelledRequests.has(requestKey)) throw new ViewActionError('ACTION_CANCELLED', 'Action request was cancelled.');
    const token = createToken();
    tokens.set(token, { token, sessionId, requestId, createdAt: now(), operation, selectors: model.selectors, acknowledgement: acknowledgement === true, stateFingerprint: model.stateFingerprint, snapshotRevision: model.snapshotRevision, previewDigest: model.previewDigest });
    return { ...model, token };
  };
  const apply = async ({ sessionId, requestId, operation, selectors, token, confirmation }) => {
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    const requestKey = `${sessionId}:${requestId}`;
    if (cancelledRequests.has(requestKey)) { revoke(token); throw new ViewActionError('ACTION_CANCELLED', 'Action request was cancelled.'); }
    const record = tokens.get(token);
    if (!record || record.sessionId !== sessionId || record.requestId !== requestId || record.operation !== operation || now() - record.createdAt > TOKEN_TTL) { revoke(token); throw new ViewActionError('PREVIEW_EXPIRED', 'Preview token expired or does not belong to request.'); }
    const selected = selectorsFor(operation, selectors);
    if (canonical(selected) !== canonical(record.selectors)) throw new ViewActionError('STALE_PREVIEW', 'Selection changed; preview again.');
    if (confirmation !== (operation === 'handoff' ? `Apply handoff ${selected.change} to ${selected.schema}?` : operation === 'schema.enable' ? `Apply project schema enable ${selected.schema}?` : `Apply ${operation} ${selected.schema}:${selected.profile}?`)) throw new ViewActionError('CONFIRMATION_MISMATCH', 'Exact confirmation required.');
    const current = await observeSnapshot(snapshot, run);
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    if (operation === 'schema.enable') {
      let currentState;
      try { currentState = expectedState(current, operation, selected); } catch { revoke(token); throw new ViewActionError('STALE_PREVIEW', 'Authoritative state changed; preview again.'); }
      if (currentState !== record.stateFingerprint) { revoke(token); throw new ViewActionError('STALE_PREVIEW', 'Authoritative state changed; preview again.'); }
    }
    const freshSelectors = operation === 'handoff' ? { ...selected, acknowledgement: record.acknowledgement } : selected;
    const fresh = await previewOperation(current, operation, freshSelectors, run);
    if (closed) throw new ViewActionError('VIEW_CLOSED', 'View action channel is closed.');
    if (fresh.stateFingerprint !== record.stateFingerprint || fresh.previewDigest !== record.previewDigest) { revoke(token); throw new ViewActionError('STALE_PREVIEW', 'Authoritative state changed; preview again.'); }
    revoke(token);
    return run({ type: 'apply', operation, selectors: selected, root: projectRoot(current), acknowledgement: record.acknowledgement });
  };
  const cancel = (token, sessionId, requestId) => {
    if (typeof sessionId === 'string' && typeof requestId === 'string') cancelledRequests.add(`${sessionId}:${requestId}`);
    revoke(token);
  };
  let closePromise = null;
  const close = () => {
    if (closePromise) return closePromise;
    closed = true;
    revokeAll();
    cancelledRequests.clear();
    closePromise = runner.close();
    return closePromise;
  };
  return { preview, apply, cancel, close };
}

function executeJob(job) {
  let value;
  if (job.type === 'snapshot') value = createSnapshotCore();
  else {
    const { operation, selectors, root, type, acknowledgement } = job;
    if (operation === 'handoff') value = handoff({ change: selectors.change, schema: selectors.schema, target: root, apply: type === 'apply', allowIncompatible: type === 'preview' || acknowledgement === true });
    else if (operation === 'schema.enable') value = enableSchema(root, selectors.schema, type === 'apply');
    else value = type === 'apply'
      ? mutateSkills({ projectRoot: root, packageRoot: job.packageRoot, packageVersion: job.packageVersion, schema: selectors.schema, profile: selectors.profile, operation: operation === 'skills.disable' ? 'disable' : 'install', force: false })
      : { applied: false, resources: loadProfile(job.packageRoot, selectors.schema, selectors.profile), mutation: { operation: operation === 'skills.disable' ? 'disable' : 'install', status: 'planned', schema: selectors.schema, profile: selectors.profile } };
  }
  return value;
}

if (process.argv[2] === JOB_HOST_ARGUMENT) {
  let stopping = false;
  const terminate = () => {
    stopping = true;
    process.off('SIGTERM', terminate);
    process.exitCode = 143;
    if (process.connected) process.disconnect();
  };
  process.once('SIGTERM', terminate);
  process.once('message', job => {
    let message;
    try { message = { ok: true, value: executeJob(job) }; }
    catch (error) { message = { ok: false, code: error.code || 'ACTION_FAILED', message: error.message || 'Action failed.' }; }
    if (stopping || !process.connected) return;
    process.send(message, () => {
      process.off('SIGTERM', terminate);
      if (process.connected) process.disconnect();
    });
  });
}

module.exports = { ViewActionError, createActionAdapter, createWorkerRunner, TOKEN_TTL, validateAction, previewOperation };
