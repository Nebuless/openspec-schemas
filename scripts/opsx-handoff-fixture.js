'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function write(file, content, mode = 0o755) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
}

function tree(directory) {
  return fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const info = fs.lstatSync(file);
    return [name, info.mode, info.isSymbolicLink() ? fs.readlinkSync(file) : info.isDirectory() ? tree(file) : fs.readFileSync(file).toString('hex')];
  });
}

function createFixture(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsx-handoff-'));
  const tools = path.join(tmp, 'tools');
  const project = path.join(tmp, 'project with spaces');
  const changeRoot = path.join(project, 'openspec/changes/authoritative-selected-root');
  const metadata = path.join(changeRoot, '.openspec.yaml');
  const original = '# retained\r\nschema: source-schema  # pin\r\ncreated: 2026-09-18\r\ncontext: |\r\n  schema: untouched\r\n';
  write(metadata, original, 0o640);
  fs.chmodSync(metadata, 0o640);
  write(path.join(changeRoot, 'proposal.md'), 'artifact\n');
  write(path.join(project, 'openspec/config.yaml'), 'schema: project-default\n');
  write(path.join(project, 'openspec/schemas/local-target/schema.yaml'), 'name: local-target\n');
  write(path.join(project, '.agents/skills/keep/SKILL.md'), 'keep\n');
  const sourceArtifacts = [
    { id: 'proposal', outputPath: 'proposal.md', status: 'done', requires: [] },
    { id: 'specs', outputPath: 'specs/**/*.md', status: 'skipped', dependencies: ['proposal'] },
    { id: 'tasks', outputPath: 'tasks.md', status: 'blocked', missingDeps: ['specs'] },
  ];
  const targetArtifacts = [
    { id: 'design', outputPath: 'design.md', status: 'ready', requires: ['proposal'] },
    { id: 'proposal', outputPath: 'proposal-v2.md', status: 'done', requires: [] },
    { id: 'tasks', outputPath: 'tasks.md', status: 'blocked', requires: ['design', 'proposal'] },
  ];
  const rootData = { path: project, source: 'nearest' };
  const planningHome = { kind: 'repo', root: project, changesDir: path.join(project, 'openspec/changes'), defaultSchema: 'project-default' };
  const listed = { name: 'selected', completedTasks: 1, totalTasks: 3, lastModified: '2026-09-18T00:00:00.000Z', status: 'in-progress' };
  const source = { changeName: 'selected', schemaName: 'source-schema', planningHome, changeRoot, isComplete: false, artifacts: sourceArtifacts, root: rootData };
  const target = { ...source, schemaName: 'local-target', artifacts: targetArtifacts };
  const stateFile = path.join(tmp, 'state.json');
  const baseState = {
    list: { changes: [listed], root: rootData }, source, target, postflight: target,
    schemas: [
      { name: 'local-target', source: 'project', path: path.join(project, 'openspec/schemas/local-target'), shadows: [] },
      { name: 'source-schema', source: 'user', path: path.join(tmp, 'schemas/source-schema'), shadows: [] },
    ],
  };
  fs.writeFileSync(stateFile, JSON.stringify(baseState));
  write(path.join(tools, 'openspec'), `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
if (process.env.CALL_LOG) fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ args, cwd: process.cwd(), telemetry: process.env.OPENSPEC_TELEMETRY }) + '\\n');
const key = args.join(' ');
if (key === 'list --json') process.stdout.write(JSON.stringify(state.list));
else if (key === 'schema which --all --json') process.stdout.write(JSON.stringify(state.schemas));
else if (key === 'schema validate local-target') {
  if (process.env.VALIDATION_MODE === 'nonzero') { process.stdout.write('SECRET STDOUT'); process.stderr.write('SECRET STDERR'); process.exit(6); }
  process.exit(Number(process.env.VALIDATION_STATUS || 0));
} else if (args[0] === 'status') {
  const selected = args[args.indexOf('--change') + 1];
  if (selected !== 'selected') process.exit(8);
  const destination = args.includes('--schema');
  const changed = fs.readFileSync(process.env.METADATA, 'latin1') !== process.env.ORIGINAL;
  if (process.env.RACE === 'rollback-content' && !destination && changed) { fs.writeFileSync(process.env.METADATA, 'third-party\\n'); process.exit(9); }
  if (process.env.POSTFLIGHT_FAIL && !destination && changed) process.exit(7);
  process.stdout.write(JSON.stringify(destination ? state.target : changed ? state.postflight : state.source));
} else process.exit(2);
`);
  const callLog = path.join(tmp, 'calls.jsonl');
  const baseEnv = { ...process.env, PATH: `${tools}:${process.env.PATH}`, STATE_FILE: stateFile, METADATA: metadata, ORIGINAL: original, CHANGE_ROOT: changeRoot };
  const cli = (args, overrides = {}, cwd = project, launcher = path.join(root, 'bin/opsx-schema.js')) => spawnSync(process.execPath, [launcher, ...args], { cwd, encoding: 'utf8', env: { ...baseEnv, ...overrides } });
  const preload = path.join(tmp, 'inject.js');
  write(preload, `'use strict';
const child = require('node:child_process'); const fs = require('node:fs');
const originalSpawn = child.spawnSync; const originalRename = fs.renameSync; let metadataRenames = 0;
child.spawnSync = (command, args, options) => {
  if (command === 'openspec' && args.join(' ') === 'schema validate local-target' && process.env.INJECT_VALIDATION) {
    fs.writeFileSync(process.env.SPAWN_OPTIONS, JSON.stringify({ timeout: options.timeout, maxBuffer: options.maxBuffer, stdio: options.stdio, telemetry: options.env.OPENSPEC_TELEMETRY }));
    const error = new Error('SECRET VALIDATION DETAIL'); error.code = process.env.INJECT_VALIDATION;
    return { error, status: null, stdout: '', stderr: '' };
  }
  return originalSpawn(command, args, options);
};
fs.renameSync = (source, destination) => {
  if (destination === process.env.METADATA && source.includes('.openspec.yaml.') && process.env.INJECT_ROLLBACK_RENAME) {
    metadataRenames += 1;
    if (metadataRenames === 2) { const error = new Error('injected rollback rename failure'); error.code = 'EIO'; throw error; }
  }
  return originalRename(source, destination);
};
`);
  return { tmp, project, changeRoot, metadata, original, sourceArtifacts, targetArtifacts, rootData, planningHome, listed, source, target, stateFile, baseState, callLog, cli, preload };
}

module.exports = { createFixture, tree };
