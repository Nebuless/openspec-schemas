'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o755 });
}

function snapshot(directory) {
  return fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const info = fs.lstatSync(file);
    return [name, info.mode, info.isSymbolicLink() ? fs.readlinkSync(file) : info.isDirectory() ? snapshot(file) : fs.readFileSync(file).toString('hex')];
  });
}

module.exports = function testOpsxSchema(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsx-schema-read-'));
  try {
    const tools = path.join(tmp, 'tools');
    const project = path.join(tmp, 'project with spaces');
    const changesDir = path.join(project, 'openspec/changes');
    const alphaRoot = path.join(changesDir, 'authoritative-root');
    const betaRoot = path.join(changesDir, 'second-root');
    const alphaSpec = path.join(alphaRoot, 'specs/capability/spec.md');
    write(alphaSpec, '# spec\n');
    write(path.join(betaRoot, 'tasks.md'), '- [x] done\n');
    write(path.join(project, '.agents/skills/unrelated/SKILL.md'), 'not managed\n');
    const dispatcher = `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const mode = process.env.MODE || 'normal';
const project = process.env.PROJECT;
const changesDir = path.join(project, 'openspec/changes');
const log = process.env.CALL_LOG;
if (log) fs.appendFileSync(log, JSON.stringify({ args, cwd: process.cwd(), telemetry: process.env.OPENSPEC_TELEMETRY }) + '\\n');
if (mode === 'timeout') setTimeout(() => {}, 20000);
if (mode === 'output-limit') { fs.writeSync(1, 'x'.repeat(2 * 1024 * 1024)); process.exit(0); }
const key = args.join(' ');
if (mode === 'nonzero' && key === 'doctor --json') process.exit(7);
if (mode === 'malformed' && key === 'doctor --json') { process.stdout.write('{'); process.exit(0); }
const root = { path: project, source: 'nearest' };
const listed = name => ({ name, completedTasks: name === 'alpha' ? 4 : 1, totalTasks: name === 'alpha' ? 4 : 1, lastModified: '2026-09-18T00:00:00.000Z', status: 'in-progress' });
function status(name) {
  const changeRoot = name === 'alpha' ? path.join(changesDir, 'authoritative-root') : path.join(changesDir, 'second-root');
  const records = name === 'alpha' ? [
    { id: 'done', outputPath: 'done.md', status: 'done', requires: [] },
    { id: 'ready', outputPath: 'ready.md', status: 'ready', requires: ['done'] },
    { id: 'blocked', outputPath: 'blocked.md', status: 'blocked', requires: ['ready'] },
    { id: 'skipped', outputPath: 'skipped.md', status: 'skipped', requires: [] },
    { id: 'specs', outputPath: 'specs/**/*.md', status: 'done', requires: ['done'] },
  ] : [{ id: 'tasks', outputPath: 'tasks.md', status: 'done', requires: [] }];
  const artifactPaths = Object.fromEntries(records.map(record => [record.id, {
    outputPath: record.outputPath,
    resolvedOutputPath: path.join(changeRoot, record.outputPath),
    existingOutputPaths: record.id === 'specs' ? [path.join(changeRoot, 'specs/capability/spec.md')] : record.id === 'tasks' ? [path.join(changeRoot, 'tasks.md')] : [],
  }]));
  const value = { changeName: name, schemaName: name === 'alpha' ? 'effective-schema' : 'other-schema', planningHome: { kind: 'repo', root: project, changesDir, defaultSchema: 'default-schema' }, changeRoot, artifactPaths, isComplete: true, artifacts: records, root };
  if (mode === 'missing-status') delete value.schemaName;
  if (mode === 'duplicate-artifact' && name === 'alpha') value.artifacts.push(value.artifacts[0]);
  if (mode === 'root-mismatch' && name === 'alpha') value.root = { path: path.join(project, 'other'), source: 'nearest' };
  if (mode === 'traversal' && name === 'alpha') value.changeRoot = path.join(changesDir, '../outside');
  if (mode === 'archive' && name === 'alpha') value.changeRoot = path.join(changesDir, 'archive/alpha');
  if (mode === 'missing-root' && name === 'alpha') value.changeRoot = path.join(changesDir, 'missing-root');
  if (mode === 'mismatched-resolved' && name === 'alpha') value.artifactPaths.done.resolvedOutputPath = path.join(changeRoot, 'other.md');
  return value;
}
if (key === 'list --json') {
  if (mode === 'outside') process.stdout.write(JSON.stringify({ changes: [], root: null, status: [{ severity: 'error', code: 'no_openspec_root', message: 'No root.' }] }));
  else if (mode === 'empty') process.stdout.write(JSON.stringify({ changes: [], root }));
  else if (mode === 'duplicate-list') process.stdout.write(JSON.stringify({ changes: [listed('alpha'), listed('alpha')], root }));
  else if (mode === 'unknown-list-status') process.stdout.write(JSON.stringify({ changes: [{ ...listed('alpha'), status: 'mystery' }], root }));
  else process.stdout.write(JSON.stringify({ changes: [listed('beta'), listed('alpha')], root }));
} else if (key === 'doctor --json') {
  const status = mode === 'doctor-warning' ? [{ severity: 'warning', code: 'health_warning', message: 'Warning.' }] : mode === 'doctor-error' ? [{ severity: 'error', code: 'health_error', message: 'Error.' }] : [];
  process.stdout.write(JSON.stringify({ root: { ...root, healthy: status.every(item => item.severity !== 'error'), status }, store: null, references: [], status }));
} else if (key === 'schema which --all --json') {
  const schemas = mode === 'missing-effective-schema' ? [{ name: 'other-schema', source: 'project', path: path.join(project, 'openspec/schemas/other-schema'), shadows: [] }] : [
    { name: 'effective-schema', source: 'project', path: path.join(project, 'openspec/schemas/effective-schema'), shadows: [] },
    { name: 'other-schema', source: 'project', path: path.join(project, 'openspec/schemas/other-schema'), shadows: [] },
  ];
  process.stdout.write(JSON.stringify(schemas));
} else if (args[0] === 'status') {
  const name = args[args.indexOf('--change') + 1];
  if (mode === 'partial' && name === 'alpha') process.exit(9);
  process.stdout.write(JSON.stringify(status(name)));
} else process.exit(2);
`;
    write(path.join(tools, 'openspec'), dispatcher);
    const callLog = path.join(tmp, 'calls.jsonl');
    const baseEnv = { ...process.env, PATH: `${tools}:${process.env.PATH}`, PROJECT: project, CALL_LOG: callLog };
    const cli = (args, overrides = {}, cwd = project) => spawnSync(process.execPath, [path.join(root, 'bin/opsx-schema.js'), ...args], { cwd, encoding: 'utf8', env: { ...baseEnv, ...overrides } });
    const json = (args, overrides, cwd) => {
      const result = cli(args, overrides, cwd);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout.endsWith('\n'), true);
      return [result, JSON.parse(result.stdout)];
    };

    const before = snapshot(project);
    let [result, envelope] = json(['inspect', '--json']);
    assert.equal(result.status, 0);
    assert.deepEqual(Object.keys(envelope), ['schemaVersion', 'command', 'ok', 'data', 'diagnostics', 'mutations', 'nextActions']);
    assert.equal(envelope.schemaVersion, 1);
    assert.equal(envelope.command, 'inspect');
    assert.equal(envelope.ok, true);
    assert.deepEqual(envelope.mutations, []);
    assert.deepEqual(envelope.nextActions, []);
    assert.deepEqual(envelope.data.changes.map(change => change.id), ['alpha', 'beta']);
    const alpha = envelope.data.changes[0];
    assert.equal(alpha.schemaName, 'effective-schema');
    assert.equal(alpha.planningHome.defaultSchema, 'default-schema');
    assert.notEqual(path.basename(alpha.changeRoot), alpha.id);
    assert.deepEqual(alpha.artifacts.map(artifact => artifact.status), ['done', 'ready', 'blocked', 'skipped', 'done']);
    assert.equal(envelope.data.changes[1].listed.status, 'in-progress');
    assert.equal(envelope.data.changes[1].listed.completedTasks, envelope.data.changes[1].listed.totalTasks);
    assert.equal(snapshot(project).toString(), before.toString());

    fs.writeFileSync(callLog, '');
    [result, envelope] = json(['inspect', '--change', 'alpha', '--json']);
    assert.equal(result.status, 0);
    assert.deepEqual(envelope.data.changes.map(change => change.id), ['alpha']);
    assert.deepEqual(fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse).map(call => call.args), [
      ['list', '--json'], ['doctor', '--json'], ['schema', 'which', '--all', '--json'], ['status', '--change', 'alpha', '--json'],
    ]);
    assert.equal(fs.readFileSync(callLog, 'utf8').includes('"telemetry":"0"'), true);

    const human = cli([]);
    const summary = json(['--json'])[1];
    assert.equal(human.status, 0);
    assert.match(human.stdout, /^Schema: mixed$/m);
    assert.equal(summary.data.schema, 'mixed');
    assert.equal(summary.data.changes.active, 2);
    assert.equal(summary.data.artifacts.ready, 1);
    assert.equal(summary.data.artifacts.blocked, 1);
    assert.deepEqual(summary.data.skills, { managed: 0, enabled: 0 });
    [result, envelope] = json(['--json'], { MODE: 'doctor-error' });
    assert.equal(result.status, 1);
    assert.equal(envelope.command, 'summary');
    assert.equal(envelope.ok, false);
    assert.equal(envelope.diagnostics.some(item => item.code === 'health_error' && item.severity === 'error'), true);
    assert.equal(envelope.data.diagnostics.errors, 1);

    [result, envelope] = json(['doctor', '--json'], { MODE: 'doctor-warning' });
    assert.equal(result.status, 0);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.diagnostics[0].severity, 'warning');
    [result, envelope] = json(['doctor', '--json'], { MODE: 'doctor-error' });
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);

    [result, envelope] = json(['inspect', '--json'], { MODE: 'empty' });
    assert.equal(result.status, 0);
    assert.deepEqual(envelope.data.changes, []);
    [result, envelope] = json(['inspect', '--json'], { MODE: 'outside' }, tmp);
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);
    assert.equal(cli([], { MODE: 'outside' }, tmp).status, 0);

    for (const [mode, code] of [['malformed', 'openspec_invalid_json'], ['nonzero', 'openspec_failed'], ['missing-status', 'invalid_status'], ['duplicate-list', 'duplicate_change'], ['duplicate-artifact', 'duplicate_artifact'], ['root-mismatch', 'root_mismatch'], ['traversal', 'unsafe_change_root'], ['archive', 'unsafe_change_root'], ['missing-root', 'unsafe_change_root'], ['mismatched-resolved', 'invalid_artifact'], ['unknown-list-status', 'invalid_change'], ['missing-effective-schema', 'unresolved_schema']]) {
      [result, envelope] = json(['inspect', '--json'], { MODE: mode });
      assert.equal(result.status, 1, mode);
      assert.equal(envelope.ok, false, mode);
      assert.equal(envelope.diagnostics.some(item => item.code === code), true, mode);
    }

    [result, envelope] = json(['inspect', '--json'], { MODE: 'partial' });
    assert.equal(result.status, 1);
    assert.equal(envelope.data.changes.length, 2);
    assert.equal(envelope.data.changes.find(change => change.id === 'alpha').complete, false);
    assert.equal(envelope.data.changes.find(change => change.id === 'beta').complete, true);

    fs.unlinkSync(alphaSpec);
    [result, envelope] = json(['inspect', '--change', 'alpha', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.diagnostics.some(item => item.code === 'missing_concrete_spec'), true);
    assert.equal(envelope.data.changes[0].artifacts.find(artifact => artifact.id === 'specs').status, 'done');
    assert.equal(envelope.data.changes[0].complete, true);
    write(alphaSpec, '');
    envelope = json(['inspect', '--change', 'alpha', '--json'])[1];
    assert.equal(envelope.diagnostics.some(item => item.code === 'empty_concrete_spec'), true);
    write(alphaSpec, '# spec\n');
    const linkedSpec = path.join(alphaRoot, 'specs/linked');
    fs.symlinkSync(tmp, linkedSpec);
    const escapedDispatcher = dispatcher.replace("path.join(changeRoot, 'specs/capability/spec.md')", "path.join(changeRoot, 'specs/linked/spec.md')");
    write(path.join(tools, 'openspec'), escapedDispatcher);
    envelope = json(['inspect', '--change', 'alpha', '--json'])[1];
    assert.equal(envelope.diagnostics.some(item => item.code === 'unsafe_symlink'), true);
    fs.unlinkSync(linkedSpec);
    const danglingSpec = path.join(alphaRoot, 'specs/dangling');
    fs.symlinkSync(path.join(tmp, 'absent'), danglingSpec);
    const danglingDispatcher = dispatcher.replace("path.join(changeRoot, 'specs/capability/spec.md')", "path.join(changeRoot, 'specs/dangling/spec.md')");
    write(path.join(tools, 'openspec'), danglingDispatcher);
    envelope = json(['inspect', '--change', 'alpha', '--json'])[1];
    assert.equal(envelope.diagnostics.some(item => item.code === 'unsafe_symlink'), true);
    fs.unlinkSync(danglingSpec);
    write(path.join(tools, 'openspec'), dispatcher);
    const linkedRoot = path.join(changesDir, 'linked-root');
    fs.symlinkSync(alphaRoot, linkedRoot);
    const symlinkDispatcher = fs.readFileSync(path.join(tools, 'openspec'), 'utf8').replace("path.join(changesDir, 'authoritative-root')", "path.join(changesDir, 'linked-root')");
    write(path.join(tools, 'openspec'), symlinkDispatcher);
    envelope = json(['inspect', '--change', 'alpha', '--json'])[1];
    assert.equal(envelope.diagnostics.some(item => item.code === 'unsafe_change_root'), true);
    fs.unlinkSync(linkedRoot);
    write(path.join(tools, 'openspec'), dispatcher);

    fs.writeFileSync(callLog, '');
    for (const args of [['inspect', '--change'], ['inspect', '--change', 'alpha', '--change', 'beta'], ['inspect', '--json', '--change', 'alpha'], ['inspect', '--unknown'], ['inspect', '-bad'], ['doctor', '--change', 'alpha'], ['doctor', '--json', '--json'], ['-inspect']]) {
      result = cli(args);
      assert.equal(result.status, 2, args.join(' '));
      assert.equal(result.stdout, '');
    }
    assert.equal(fs.readFileSync(callLog, 'utf8'), '');

    const childLog = path.join(tmp, 'legacy-child.log');
    const recordChild = path.join(tmp, 'record-child.js');
    write(recordChild, `const child = require('node:child_process'); child.spawnSync = (...args) => { require('node:fs').appendFileSync(process.env.CHILD_LOG, JSON.stringify(args.slice(0, 2)) + '\\n'); return { status: 0 }; };\n`);
    for (const args of [['install', 'compound-intent-driven', '-a', 'invalid'], ['install', 'minimalist', '-a', 'pi'], ['install', 'compound-intent-driven', '--host', 'invalid']]) {
      result = spawnSync(process.execPath, ['--require', recordChild, path.join(root, 'bin/opsx-schema.js'), ...args], { cwd: project, encoding: 'utf8', env: { ...baseEnv, CHILD_LOG: childLog } });
      assert.equal(result.status, 2, args.join(' '));
      assert.equal(result.stdout, '');
    }
    assert.equal(fs.existsSync(childLog), false);

    [result, envelope] = json(['inspect', '--json'], { MODE: 'timeout' });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'openspec_timeout');
    [result, envelope] = json(['inspect', '--json'], { MODE: 'output-limit' });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'openspec_output_limit');
    const missingPath = path.join(tmp, 'missing-runtime');
    fs.mkdirSync(missingPath);
    [result, envelope] = json(['inspect', '--json'], { PATH: missingPath });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'openspec_missing');

    const forceStream = path.join(tmp, 'force-stream.js');
    write(forceStream, `const stream = process[process.env.EPIPE_STREAM]; process.nextTick(() => { const error = new Error('forced stream error'); error.code = process.env.STREAM_ERROR_CODE; stream.emit('error', error); });\n`);
    result = spawnSync(process.execPath, ['--require', forceStream, path.join(root, 'bin/opsx-schema.js'), 'inspect', '--json'], { cwd: project, encoding: 'utf8', env: { ...baseEnv, EPIPE_STREAM: 'stdout', STREAM_ERROR_CODE: 'EPIPE' } });
    assert.equal(result.status, 0);
    result = spawnSync(process.execPath, ['--require', forceStream, path.join(root, 'bin/opsx-schema.js'), 'doctor', '--json'], { cwd: project, encoding: 'utf8', env: { ...baseEnv, EPIPE_STREAM: 'stdout', STREAM_ERROR_CODE: 'ENOSPC' } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forced stream error/);
    assert.deepEqual(snapshot(project), before);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
