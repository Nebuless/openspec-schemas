'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { preflight, runView, SIDEcar } = require('../bin/opsx-view.js');
const { createActionAdapter, createWorkerRunner } = require('../bin/opsx-view-actions.js');
const { envelope } = require('../bin/opsx-ipc-protocol.js');

// allow: SIZE_OK — one focused stdlib script owns View lifecycle regressions and packed proof.
const root = path.resolve(__dirname, '..');
const cli = (args, env = {}) => spawnSync(process.execPath, [path.join(root, 'bin/opsx-schema.js'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

function readyRuntime(overrides = {}) {
  const runtime = new EventEmitter();
  const defaults = {
    release: { name: 'node' },
    versions: { node: '26.4.0' },
    platform: 'linux',
    arch: 'x64',
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    env: { TERM: 'xterm-256color' },
    execPath: '/fake/node',
    cwd: () => '/fixture/project',
  };
  Object.assign(runtime, defaults, overrides);
  runtime.report ??= { getReport: () => ({ header: { glibcVersionRuntime: '2.36' } }) };
  return runtime;
}

function fakeChild() {
  const child = new EventEmitter();
  child.connected = true;
  child.sent = [];
  child.send = (message, callback) => { child.sent.push(message); callback?.(); };
  child.kill = signal => { child.killedWith = signal; };
  return child;
}

function fakeForks({ stubborn = false, persistent = false } = {}) {
  const children = [];
  const signals = [];
  const groups = new Map();
  const forkProcess = (file, args, options) => {
    const child = new EventEmitter();
    child.pid = 4100 + children.length;
    child.connected = true;
    child.file = file;
    child.args = args;
    child.options = options;
    child.send = (message, callback) => { child.job = message; callback?.(); };
    children.push(child);
    groups.set(child.pid, true);
    setImmediate(() => child.emit('spawn'));
    return child;
  };
  const killProcess = (pid, signal) => {
    signals.push([pid, signal]);
    const group = -pid;
    if (pid >= 0 || groups.get(group) !== true) throw Object.assign(new Error('missing process group'), { code: 'ESRCH' });
    if (!persistent && (signal === 'SIGKILL' || (signal === 'SIGTERM' && !stubborn))) groups.set(group, false);
  };
  return { children, signals, groups, forkProcess, killProcess };
}

const viewSnapshot = {
  root: { path: '/fixture/project' },
  schemas: [{ name: 'target' }],
  changes: [{ id: 'change', schemaName: 'source' }],
  skills: { ownerships: [] },
  diagnostics: [],
};

const flush = () => new Promise(resolve => setImmediate(resolve));
const waitForFile = async (file, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

async function test() {
  const { createInitialState, reduce } = await import('../src/tui/state.mjs');
  const { attachController } = await import('../src/tui/controller.mjs');
  const protocolSessionId = 'a'.repeat(32);
  const realisticSnapshot = {
    root: { path: '/fixture/project' },
    schemas: Array.from({ length: 12 }, (_, index) => ({ name: `schema-${index}`, source: 'package', shadows: [] })),
    changes: Array.from({ length: 20 }, (_, changeIndex) => ({
      id: `change-${changeIndex}`,
      schemaName: 'target',
      artifacts: Array.from({ length: 5 }, (_, artifactIndex) => ({ id: `artifact-${artifactIndex}`, status: 'done', requires: [] })),
    })),
    skills: { ownerships: [] },
    diagnostics: [],
  };
  assert.doesNotThrow(() => envelope('snapshot', protocolSessionId, 'initial', { snapshot: realisticSnapshot }));
  assert.throws(() => envelope('snapshot', protocolSessionId, 'initial', { snapshot: { values: Array.from({ length: 201 }, () => null) } }), /IPC array is too large/);
  assert.throws(() => envelope('snapshot', protocolSessionId, 'initial', { snapshot: { command: 'unsafe' } }), /IPC field is forbidden/);
  assert.throws(() => envelope('snapshot', protocolSessionId, 'initial', { snapshot: { value: 'x'.repeat(512 * 1024) } }), /IPC payload is too large/);
  let deepSnapshot = {};
  for (let depth = 0; depth < 9; depth += 1) deepSnapshot = { nested: deepSnapshot };
  assert.throws(() => envelope('snapshot', protocolSessionId, 'initial', { snapshot: deepSnapshot }), /IPC payload is too deep/);

  const initialState = createInitialState();
  const earlyRefresh = reduce(initialState, { type: 'refresh/request' });
  assert.strictEqual(earlyRefresh.state, initialState);
  assert.deepEqual(earlyRefresh.effects, []);
  const hydratedState = createInitialState({ root: '/fixture/project' });
  const readyRefresh = reduce(hydratedState, { type: 'refresh/request' });
  assert.equal(readyRefresh.state.refresh.generation, 1);
  assert.equal(readyRefresh.state.refresh.pending, true);
  assert.deepEqual(readyRefresh.effects, [{ type: 'refresh/request', requestId: 'refresh-1' }]);

  const applyingRenderer = new EventEmitter();
  applyingRenderer.width = 120;
  applyingRenderer.height = 40;
  applyingRenderer.keyInput = new EventEmitter();
  applyingRenderer.idle = async () => {};
  let finishApply;
  let refreshCount = 0;
  const applyingController = attachController(applyingRenderer, {
    snapshot: viewSnapshot,
    preview: async () => ({ token: 'b'.repeat(64), preview: { compatible: true }, confirmation: 'APPLY' }),
    apply: () => new Promise(resolve => { finishApply = resolve; }),
    refresh: async () => {
      refreshCount += 1;
      return { snapshot: { ...viewSnapshot, refreshed: true }, selectionIds: ['change'] };
    },
  });
  applyingController.dispatch({ type: 'tab/select', tab: 'changes' });
  applyingController.dispatch({ type: 'focus/select', focusId: 'change' });
  applyingController.dispatch({ type: 'selection/select', selectedId: 'change' });
  applyingController.dispatch({ type: 'action/preview', requestId: 'request-preview-lock', operation: 'handoff', selectors: { change: 'change', schema: 'target' } });
  await flush();
  applyingController.dispatch({ type: 'action/confirm-open' });
  applyingController.dispatch({ type: 'action/apply', requestId: 'request-preview-lock', token: 'b'.repeat(64), confirmation: 'APPLY' });
  assert.equal(applyingController.getState().action.phase, 'applying');
  applyingController.dispatch({ type: 'tab/select', tab: 'config' });
  applyingController.dispatch({ type: 'focus/select', focusId: 'other' });
  applyingController.dispatch({ type: 'selection/select', selectedId: 'other' });
  assert.deepEqual(
    { tab: applyingController.getState().tab, focusId: applyingController.getState().focusId, selectedId: applyingController.getState().selectedId },
    { tab: 'changes', focusId: 'change', selectedId: 'change' },
  );
  finishApply({ applied: true });
  await flush();
  await flush();
  assert.equal(refreshCount, 1);
  assert.equal(applyingController.getState().snapshot.refreshed, true);
  assert.equal(applyingController.getState().action.phase, 'selecting');
  applyingController.dispose();

  for (const args of [['view', '--json'], ['view', '--unknown'], ['view', 'extra'], ['view', '--json', 'extra']]) {
    const result = cli(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
    assert.match(result.stderr, /^Error: .+\nUsage: opsx-schema /, args.join(' '));
  }
  const unsupported = cli(['view']);
  assert.equal(unsupported.status, 1);
  assert.equal(unsupported.stdout, '');
  assert.match(unsupported.stderr, /TUI_(?:RUNTIME|TARGET)_UNSUPPORTED/);
  assert.match(unsupported.stderr, /inspect --json/);
  assert.equal(cli(['--version']).status, 0);
  assert.equal(cli(['list']).status, 0);

  assert.throws(() => preflight(readyRuntime({ versions: { node: '26.4.0-pre' } })), /TUI_RUNTIME_UNSUPPORTED/);
  assert.throws(() => preflight(readyRuntime({ platform: 'darwin' })), /TUI_TARGET_UNSUPPORTED/);
  assert.throws(() => preflight(readyRuntime({ env: { TERM: 'xterm', OPENTUI_LIBC: 'musl' } })), /TUI_TARGET_UNSUPPORTED/);
  assert.throws(() => preflight(readyRuntime({ env: { TERM: 'dumb' } })), /TUI_TARGET_UNSUPPORTED/);
  assert.throws(() => preflight(readyRuntime({ stdin: { isTTY: false } })), /TUI_TARGET_UNSUPPORTED/);
  assert.throws(() => preflight(readyRuntime({ report: { getReport: () => ({ header: {} }) } })), /TUI_TARGET_UNSUPPORTED/);

  let options;
  const runtime = readyRuntime();
  const child = fakeChild();
  const normalPromise = runView({ runtime, env: { TERM: 'xterm-256color', TEST_VIEW: '1' }, spawnProcess: (execPath, args, value) => {
    child.spawned = { execPath, args };
    options = value;
    return child;
  } });
  assert.deepEqual(child.spawned, { execPath: '/fake/node', args: ['--experimental-ffi', SIDEcar] });
  assert.equal(options.cwd, '/fixture/project');
  assert.equal(options.shell, false);
  assert.equal(options.detached, false);
  assert.deepEqual(options.stdio, ['inherit', 'inherit', 'inherit', 'ipc']);
  assert.equal(options.env.TEST_VIEW, '1');
  child.emit('close', 0, null);
  assert.equal(await normalPromise, 0);
  assert.equal(runtime.listenerCount('SIGINT'), 0);
  assert.equal(runtime.listenerCount('SIGTERM'), 0);
  assert.equal(runtime.listenerCount('SIGHUP'), 0);
  assert.equal(runtime.listenerCount('disconnect'), 0);

  const initialWorkerRuntime = readyRuntime();
  const initialWorkerChild = fakeChild();
  const initialWorkerFixture = fakeForks();
  const initialWorkerPromise = runView({ runtime: initialWorkerRuntime, spawnProcess: () => initialWorkerChild, forkJobProcess: initialWorkerFixture.forkProcess, killProcess: initialWorkerFixture.killProcess });
  initialWorkerChild.emit('spawn');
  await flush();
  assert.equal(initialWorkerFixture.children.length, 1);
  assert.deepEqual(initialWorkerFixture.children[0].args, ['--opsx-view-job-host']);
  assert.equal(initialWorkerFixture.children[0].options.cwd, '/fixture/project');
  assert.equal(initialWorkerFixture.children[0].options.detached, true);
  assert.equal(initialWorkerFixture.children[0].options.shell, false);
  assert.deepEqual(initialWorkerFixture.children[0].options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  initialWorkerChild.connected = false;
  initialWorkerChild.emit('close', 0, null);
  assert.equal(await initialWorkerPromise, 0);
  assert.deepEqual(initialWorkerFixture.signals, [[-4100, 0], [-4100, 0], [-4100, 'SIGTERM'], [-4100, 0]]);

  const actionWorkerFixture = fakeForks();
  const actionRunner = createWorkerRunner({ forkProcess: actionWorkerFixture.forkProcess, killProcess: actionWorkerFixture.killProcess });
  const actionAdapter = createActionAdapter({ snapshot: async () => viewSnapshot, runner: actionRunner });
  let actionSettles = 0;
  const pendingAction = actionAdapter.preview({ sessionId: 'session', requestId: 'request', operation: 'handoff', selectors: { change: 'change', schema: 'target' }, acknowledgement: false });
  pendingAction.then(() => { actionSettles += 1; }, () => { actionSettles += 1; });
  await flush();
  assert.equal(actionWorkerFixture.children.length, 1);
  const firstClose = actionAdapter.close();
  assert.strictEqual(actionAdapter.close(), firstClose);
  await assert.rejects(pendingAction, error => error.code === 'VIEW_CLOSED');
  await firstClose;
  assert.equal(actionWorkerFixture.signals.filter(([, signal]) => signal === 'SIGTERM').length, 1);
  assert.ok(actionWorkerFixture.signals.every(([pid]) => pid === -4100));
  actionWorkerFixture.children[0].emit('message', { ok: true, value: {} });
  actionWorkerFixture.children[0].emit('error', new Error('late worker error'));
  actionWorkerFixture.children[0].emit('close', 1);
  await flush();
  assert.equal(actionSettles, 1);
  assert.equal(actionWorkerFixture.signals.filter(([, signal]) => signal === 'SIGTERM').length, 1);

  const stubbornFixture = fakeForks({ stubborn: true });
  const stubbornRunner = createWorkerRunner({ forkProcess: stubbornFixture.forkProcess, killProcess: stubbornFixture.killProcess, groupGraceMs: 1 });
  const stubbornJob = stubbornRunner.run({ type: 'snapshot' });
  await flush();
  const stubbornClose = stubbornRunner.close();
  await assert.rejects(stubbornJob, error => error.code === 'VIEW_CLOSED');
  await stubbornClose;
  assert.deepEqual(stubbornFixture.signals.filter(([, signal]) => signal !== 0), [[-4100, 'SIGTERM'], [-4100, 'SIGKILL']]);

  const spawnErrorFixture = fakeForks();
  const spawnErrorRunner = createWorkerRunner({ forkProcess: spawnErrorFixture.forkProcess, killProcess: spawnErrorFixture.killProcess });
  const spawnErrorJob = spawnErrorRunner.run({ type: 'snapshot' });
  spawnErrorFixture.children[0].removeAllListeners('spawn');
  spawnErrorFixture.children[0].emit('error', Object.assign(new Error('fork failed'), { code: 'EACCES' }));
  await assert.rejects(spawnErrorJob, error => error.code === 'EACCES');
  await spawnErrorRunner.close();
  assert.deepEqual(spawnErrorFixture.signals, []);

  const lateRuntime = readyRuntime();
  const lateChild = fakeChild();
  const lateWorkerFixture = fakeForks();
  const latePromise = runView({ runtime: lateRuntime, spawnProcess: () => lateChild, forkJobProcess: lateWorkerFixture.forkProcess, killProcess: lateWorkerFixture.killProcess });
  lateChild.emit('spawn');
  await flush();
  lateWorkerFixture.children[0].emit('message', { ok: true, value: viewSnapshot });
  lateWorkerFixture.children[0].emit('close', 0);
  await flush();
  assert.equal(lateWorkerFixture.signals.some(([pid, signal]) => pid === -4100 && signal === 'SIGTERM'), true);
  const sessionId = lateChild.sent[0].sessionId;
  lateChild.emit('message', envelope('preview-request', sessionId, 'request-preview-1', { operation: 'handoff', selectors: { change: 'change', schema: 'target' }, acknowledgement: false }));
  await flush();
  lateWorkerFixture.children[1].emit('message', { ok: true, value: viewSnapshot });
  lateWorkerFixture.children[1].emit('close', 0);
  await flush();
  assert.equal(lateWorkerFixture.signals.some(([pid, signal]) => pid === -4101 && signal === 'SIGTERM'), true);
  const pendingWorker = lateWorkerFixture.children[2];
  const sentBeforeClose = lateChild.sent.length;
  lateRuntime.emit('SIGTERM');
  await flush();
  assert.equal(lateWorkerFixture.signals.some(([pid, signal]) => pid === -4102 && signal === 'SIGTERM'), true);
  pendingWorker.emit('message', { ok: true, value: {} });
  pendingWorker.emit('error', new Error('late worker error'));
  pendingWorker.emit('close', 1);
  await flush();
  assert.equal(lateChild.sent.length, sentBeforeClose);
  assert.equal(lateWorkerFixture.signals.filter(([pid, signal]) => pid === -4102 && signal === 'SIGTERM').length, 1);
  lateChild.connected = false;
  lateChild.emit('close', null, 'SIGTERM');
  assert.equal(await latePromise, 143);

  for (const [event, signal, code] of [['SIGINT', 'SIGINT', 130], ['SIGTERM', 'SIGTERM', 143], ['SIGHUP', 'SIGHUP', 129], ['disconnect', 'SIGHUP', 129]]) {
    const signalRuntime = readyRuntime();
    const signalChild = fakeChild();
    const signalPromise = runView({ runtime: signalRuntime, spawnProcess: () => signalChild });
    signalRuntime.emit(event);
    signalRuntime.emit(event);
    assert.equal(signalChild.killedWith, signal);
    signalChild.emit('close', null, signal);
    assert.equal(await signalPromise, code);
    assert.equal(signalRuntime.listenerCount('SIGINT'), 0);
    assert.equal(signalRuntime.listenerCount('SIGTERM'), 0);
    assert.equal(signalRuntime.listenerCount('SIGHUP'), 0);
    assert.equal(signalRuntime.listenerCount('disconnect'), 0);
  }

  const epipeRuntime = readyRuntime();
  const epipeChild = fakeChild();
  let reap;
  const epipePromise = runView({ runtime: epipeRuntime, spawnProcess: () => epipeChild, setActiveShutdown: value => { reap = value; } });
  reap();
  reap();
  assert.equal(epipeChild.killedWith, 'SIGTERM');
  epipeChild.emit('close', null, 'SIGTERM');
  assert.equal(await epipePromise, 0);
  assert.equal(epipeRuntime.listenerCount('SIGTERM'), 0);

  const errorRuntime = readyRuntime();
  const errorChild = fakeChild();
  const errorPromise = runView({ runtime: errorRuntime, spawnProcess: () => errorChild });
  errorChild.emit('error', new Error('spawn failed'));
  assert.equal(await errorPromise, 1);
  assert.equal(errorRuntime.listenerCount('SIGINT'), 0);

  const deadlineRuntime = readyRuntime();
  const deadlineChild = fakeChild();
  const deadlinePromise = runView({ runtime: deadlineRuntime, spawnProcess: () => deadlineChild, shutdownDeadlineMs: 5 });
  deadlineRuntime.emit('SIGTERM');
  assert.equal(await deadlinePromise, 1);
  assert.equal(deadlineChild.killedWith, 'SIGKILL');
  assert.equal(deadlineRuntime.listenerCount('SIGHUP'), 0);

  for (const sidecarResult of [{ code: 0, signal: null }, { code: null, signal: 'SIGTERM' }]) {
    const cleanupRuntime = readyRuntime();
    const cleanupChild = fakeChild();
    const cleanupFixture = fakeForks({ persistent: true });
    const cleanupErrors = [];
    let cleanupSettles = 0;
    const cleanupPromise = runView({
      runtime: cleanupRuntime,
      spawnProcess: () => cleanupChild,
      forkJobProcess: cleanupFixture.forkProcess,
      killProcess: cleanupFixture.killProcess,
      jobGroupGraceMs: 0,
      stderr: { write: message => { cleanupErrors.push(message); } },
    });
    cleanupPromise.then(() => { cleanupSettles += 1; });
    cleanupChild.emit('spawn');
    await flush();
    cleanupChild.emit('close', sidecarResult.code, sidecarResult.signal);
    assert.equal(await cleanupPromise, 1);
    cleanupChild.emit('close', 0, null);
    await flush();
    assert.equal(cleanupSettles, 1);
    assert.deepEqual(cleanupFixture.signals.filter(([, signal]) => signal !== 0), [[-4100, 'SIGTERM'], [-4100, 'SIGKILL']]);
    assert.deepEqual(cleanupErrors, ['opsx-schema view: WORKER_CLEANUP_FAILED: Action process group did not exit.\n']);
  }

  const packedFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opsx-view-packed-'));
  const project = path.join(packedFixture, 'project');
  const fakeBin = path.join(packedFixture, 'bin');
  const fakePid = path.join(packedFixture, 'openspec.pid');
  const lateMarker = path.join(project, 'late.marker');
  const packed = spawnSync('nub', ['pack', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const archive = path.join(root, JSON.parse(packed.stdout)[0].filename);
  const extracted = spawnSync('tar', ['-xzf', archive, '-C', packedFixture], { encoding: 'utf8' });
  fs.rmSync(archive, { force: true });
  assert.equal(extracted.status, 0, extracted.stderr);
  const packedRoot = path.join(packedFixture, 'package');
  fs.mkdirSync(path.join(project, 'openspec'), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  const config = 'schema: spec-driven\n';
  fs.writeFileSync(path.join(project, 'openspec/config.yaml'), config);
  const fakeOpenSpec = path.join(fakeBin, 'openspec');
  fs.writeFileSync(fakeOpenSpec, `#!${process.execPath}\n'use strict';\nconst fs = require('node:fs');\nconst { spawn } = require('node:child_process');\nspawn(process.execPath, ['-e', "setTimeout(() => require('node:fs').writeFileSync(process.env.LATE_MARKER, 'late'), 8000)"], { stdio: 'ignore' });\nfs.writeFileSync(process.env.FAKE_OPENSPEC_PID, String(process.pid));\nsetTimeout(() => {}, 8000);\n`);
  fs.chmodSync(fakeOpenSpec, 0o755);
  const realRunner = createWorkerRunner({
    workerFile: path.join(packedRoot, 'bin/opsx-view-actions.js'),
    cwd: project,
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_OPENSPEC_PID: fakePid, LATE_MARKER: lateMarker },
    groupGraceMs: 1000,
  });
  const delayedSnapshot = realRunner.run({ type: 'snapshot' });
  await waitForFile(fakePid, 2000);
  const closeStarted = Date.now();
  const realClose = realRunner.close();
  await assert.rejects(delayedSnapshot, error => error.code === 'VIEW_CLOSED');
  await realClose;
  assert.ok(Date.now() - closeStarted < 5000);
  assert.throws(() => process.kill(Number(fs.readFileSync(fakePid, 'utf8')), 0), error => error.code === 'ESRCH');
  await new Promise(resolve => setTimeout(resolve, 8200));
  assert.equal(fs.existsSync(lateMarker), false);
  assert.equal(fs.readFileSync(path.join(project, 'openspec/config.yaml'), 'utf8'), config);
  fs.rmSync(packedFixture, { recursive: true, force: true });

  console.log('test-opsx-view: PASS');
}

test().catch(error => { console.error(error); process.exitCode = 1; });
