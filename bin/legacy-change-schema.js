'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function stat(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function directories(directory) {
  for (;;) {
    const info = stat(directory);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`unsafe directory: ${directory}`);
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

function runInherited(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.status}`);
}

function status(args, target) {
  const result = spawnSync('openspec', args, { cwd: target, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
  if (result.error || result.status !== 0) throw new Error(`openspec status failed: ${result.error?.message || result.stderr || result.status}`);
  const value = JSON.parse(result.stdout);
  if (!value || typeof value.changeRoot !== 'string' || !path.isAbsolute(value.changeRoot) || typeof value.schemaName !== 'string' || !Array.isArray(value.artifacts)) throw new Error('invalid status metadata');
  return value;
}

function graph(value) {
  const ids = new Set();
  const artifacts = value.artifacts.map(artifact => {
    if (!artifact || typeof artifact.id !== 'string' || !artifact.id || ids.has(artifact.id) || typeof artifact.outputPath !== 'string' || !artifact.outputPath || !['done', 'ready', 'blocked'].includes(artifact.status)) throw new Error('invalid artifact graph');
    ids.add(artifact.id);
    const requires = new Set();
    for (const field of ['requires', 'dependencies', 'missingDeps']) {
      if (Object.hasOwn(artifact, field)) {
        if (!Array.isArray(artifact[field]) || artifact[field].some(id => typeof id !== 'string' || !id)) throw new Error('invalid artifact dependencies');
        for (const id of artifact[field]) requires.add(id);
      }
    }
    return { id: artifact.id, outputPath: artifact.outputPath, requires: [...requires].sort() };
  });
  return JSON.stringify(artifacts.sort((left, right) => left.id.localeCompare(right.id)));
}

function setChangeSchemaLegacy(args) {
  const [change, schema, ...options] = args;
  if (![change, schema].every(value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) || change === 'archive') throw new Error('expected change and schema names');
  let target = process.cwd();
  const seen = new Set();
  while (options.length) {
    const option = options.shift();
    const key = option === '-t' ? '--target' : option;
    if (!['--target', '--apply', '--allow-incompatible'].includes(key)) throw new Error(`unknown option: ${option}`);
    if (seen.has(key)) throw new Error(`duplicate option: ${key}`);
    seen.add(key);
    if (key === '--target') {
      const value = options.shift();
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${option}`);
      target = path.resolve(value);
    }
  }
  directories(target);
  const statusArgs = ['status', '--change', change, '--json'];
  const source = status(statusArgs, target);
  const changeRoot = path.resolve(source.changeRoot);
  const relative = path.relative(path.join(target, 'openspec/changes'), changeRoot);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.split(path.sep).includes('archive')) throw new Error('unsafe changeRoot');
  directories(changeRoot);
  const metadata = path.join(changeRoot, '.openspec.yaml');
  const info = stat(metadata);
  if (!info || !info.isFile() || info.isSymbolicLink()) throw new Error('missing or unsafe change metadata');
  const original = fs.readFileSync(metadata);
  const text = original.toString('latin1');
  const lines = text.split('\n');
  const candidates = lines.filter(line => /^(?:schema\s*:|["']|\?|<<\s*:|---|\.\.\.|%|\{|\[)/.test(line));
  const simple = /^schema:([ \t]+)([a-zA-Z0-9_-]+)([ \t]*(?:#[^\r\n]*)?)(\r?)$/;
  const match = candidates.length === 1 ? simple.exec(candidates[0]) : null;
  if (!match || match[2] !== source.schemaName) throw new Error('metadata requires one simple existing top-level schema: matching status');
  const destination = status([...statusArgs, '--schema', schema], target);
  if (path.resolve(destination.changeRoot) !== changeRoot || destination.schemaName !== schema) throw new Error('target status does not match requested change/schema');
  runInherited('openspec', ['schema', 'validate', schema], target);
  const compatible = graph(source) === graph(destination);
  if (!compatible && !seen.has('--allow-incompatible')) throw new Error('incompatible artifact graph (use --allow-incompatible to acknowledge; artifacts will not migrate)');
  console.log(`${seen.has('--apply') ? 'Apply' : 'Dry run'}: ${changeRoot}: ${source.schemaName} -> ${schema}${compatible ? '' : ' (incompatible graph; no artifact migration)'}`);
  if (!seen.has('--apply') || source.schemaName === schema) return;
  const updated = Buffer.from(lines.map(line => line === candidates[0] ? `schema:${match[1]}${schema}${match[3]}${match[4]}` : line).join('\n'), 'latin1');
  const temporary = `${metadata}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, 'wx', info.mode & 0o7777);
  try {
    try {
      fs.writeFileSync(descriptor, updated);
      fs.fchmodSync(descriptor, info.mode & 0o7777);
    } finally { fs.closeSync(descriptor); }
    directories(changeRoot);
    const current = stat(metadata);
    if (!current || !current.isFile() || current.ino !== info.ino || current.dev !== info.dev || !fs.readFileSync(metadata).equals(original)) throw new Error('change metadata changed during preflight');
    fs.renameSync(temporary, metadata);
    try {
      const persisted = status(statusArgs, target);
      if (path.resolve(persisted.changeRoot) !== changeRoot || persisted.schemaName !== schema) throw new Error('postflight status does not match requested change/schema');
    } catch (error) {
      const rollback = fs.openSync(temporary, 'wx', info.mode & 0o7777);
      try {
        fs.writeFileSync(rollback, original);
        fs.fchmodSync(rollback, info.mode & 0o7777);
      } finally { fs.closeSync(rollback); }
      fs.renameSync(temporary, metadata);
      throw error;
    }
  } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
}

module.exports = { setChangeSchemaLegacy };
