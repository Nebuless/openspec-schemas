#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const schemas = path.join(root, 'openspec/schemas');
const hosts = { opencode: '.opencode/commands', senpi: '.senpi/prompts', pi: '.pi/prompts', atomic: '.atomic/prompts' };
const names = () => fs.readdirSync(schemas).filter(name => fs.existsSync(path.join(schemas, name, 'schema.yaml'))).sort();
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.status}`);
}
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
function collision(file, force, directory) {
  directories(path.dirname(file));
  const info = stat(file);
  if (info && (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || !force)) {
    throw new Error(`collision or unsafe target: ${file} (use --force for regular targets)`);
  }
}
function changeStatus(args, target) {
  const result = spawnSync('openspec', args, { cwd: target, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
  if (result.error || result.status !== 0) throw new Error(`openspec status failed: ${result.error?.message || result.stderr || result.status}`);
  const value = JSON.parse(result.stdout);
  if (!value || typeof value.changeRoot !== 'string' || !path.isAbsolute(value.changeRoot) || typeof value.schemaName !== 'string' || !Array.isArray(value.artifacts)) throw new Error('invalid status metadata');
  return value;
}
function graph(status) {
  const ids = new Set();
  const artifacts = status.artifacts.map(artifact => {
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
function setChangeSchema(args) {
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
  const source = changeStatus(statusArgs, target);
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
  const destination = changeStatus([...statusArgs, '--schema', schema], target);
  if (path.resolve(destination.changeRoot) !== changeRoot || destination.schemaName !== schema) throw new Error('target status does not match requested change/schema');
  run('openspec', ['schema', 'validate', schema], target);
  const compatible = graph(source) === graph(destination);
  if (!compatible && !seen.has('--allow-incompatible')) throw new Error('incompatible artifact graph (use --allow-incompatible to acknowledge; artifacts will not migrate)');
  console.log(`${seen.has('--apply') ? 'Apply' : 'Dry run'}: ${changeRoot}: ${source.schemaName} -> ${schema}${compatible ? '' : ' (incompatible graph; no artifact migration)'}`);
  if (!seen.has('--apply') || source.schemaName === schema) return;
  const updated = Buffer.from(lines.map(line => line === candidates[0] ? `schema:${match[1]}${schema}${match[3]}${match[4]}` : line).join('\n'), 'latin1');
  const temporary = `${metadata}.${require('node:crypto').randomUUID()}.tmp`;
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
      const persisted = changeStatus(statusArgs, target);
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
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === undefined) {
    console.log('Usage: openspec-schemas list | validate [schema] | verify | install <schema> [-t|--target <dir>] [-sk|--skills] [-a|--agents <opencode|senpi|pi|atomic>] [--agent <agent>] [--host <agent>] [-i|--activate] [--force]');
    console.log('       openspec-schemas set-change-schema <change> <schema> [-t|--target <project>] [--apply] [--allow-incompatible]');
    return;
  }
  if (command === 'list' || command === 'verify') {
    if (args.length) throw new Error('unexpected arguments');
    for (const name of names()) {
      if (command === 'list') console.log(name);
      else run('openspec', ['schema', 'validate', name], root);
    }
    return;
  }
  if (command === 'validate') {
    if (args.length > 1) throw new Error('unexpected arguments');
    const name = args[0];
    if (name && !names().includes(name)) throw new Error(`unknown schema: ${name}`);
    for (const schema of name ? [name] : names()) run('openspec', ['schema', 'validate', schema], root);
    return;
  }
  if (command === 'set-change-schema') return setChangeSchema(args);
  if (command !== 'install') throw new Error(`unknown command: ${command}`);
  const name = args.shift();
  if (!names().includes(name)) throw new Error(`unknown schema: ${name}`);
  let target = process.cwd();
  let host;
  let targetSet = false;
  let skills = false;
  let activate = false;
  let force = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--target' || arg === '-t' || arg === '--host' || arg === '--agents' || arg === '--agent' || arg === '-a') {
      const value = args.shift();
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${arg}`);
      if (arg === '--target' || arg === '-t') {
        if (targetSet) throw new Error('duplicate option: target');
        target = path.resolve(value);
        targetSet = true;
      } else {
        if (host) throw new Error('duplicate option: agent');
        host = value;
      }
    } else if (arg === '--skills' || arg === '-sk') {
      if (skills) throw new Error('duplicate option: skills');
      skills = true;
    } else if (arg === '--activate' || arg === '-i') {
      if (activate) throw new Error('duplicate option: activate');
      activate = true;
    } else if (arg === '--force') {
      if (force) throw new Error('duplicate option: force');
      force = true;
    } else throw new Error(`unknown option: ${arg}`);
  }
  if (host && (!Object.hasOwn(hosts, host) || name !== 'compound-intent-driven')) throw new Error('--host requires compound-intent-driven and a supported host');
  const source = path.join(schemas, name);
  const destination = path.join(target, 'openspec/schemas', name);
  if (destination === source || source.startsWith(destination + path.sep)) throw new Error('source and destination overlap');
  collision(destination, force, true);
  if (host) {
    for (const file of fs.readdirSync(path.join(root, hosts[host])).filter(file => /^opsx-ce-.*\.md$/.test(file))) {
      collision(path.join(target, hosts[host], file), force, false);
    }
  }
  if (skills) {
    const manifest = path.join(source, 'skills.txt');
    if (fs.existsSync(manifest)) {
      for (const line of fs.readFileSync(manifest, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))) {
        const skill = path.posix.basename(line.split('\t').at(-1).trim());
        if (!skill || skill === '.' || skill === '..') throw new Error('unsafe skill manifest');
        collision(path.join(target, '.agents/skills', skill), force, true);
      }
    }
  }
  const config = path.join(target, 'openspec/config.yaml');
  let updated;
  if (activate) {
    collision(config, true, false);
    const text = fs.readFileSync(config, 'utf8');
    const lines = text.split('\n');
    const candidates = lines.filter(line => /^(?:schema\s*:|["']schema["']\s*:|<<\s*:|---|\.\.\.)/.test(line));
    const simple = /^schema:([ \t]+)[a-zA-Z0-9_-]+([ \t]*(?:#[^\r\n]*)?)(\r?)$/;
    if (candidates.length !== 1 || !simple.test(candidates[0])) throw new Error('activation requires one simple existing top-level schema: line');
    updated = lines.map(line => simple.test(line) ? line.replace(simple, `schema:$1${name}$2$3`) : line).join('\n');
  }
  run('openspec', ['schema', 'validate', name], root);
  if (stat(destination)) fs.rmSync(destination, { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  const extra = force ? ['--force'] : [];
  if (skills) run('sh', [path.join(root, 'scripts/install-schema-skills.sh'), destination, target, ...extra], root);
  if (host) run('sh', [path.join(root, 'scripts/install-compound-adapters.sh'), host, target, ...extra], root);
  run('openspec', ['schema', 'validate', name], target);
  if (updated !== undefined) fs.writeFileSync(config, updated);
  console.log(`Installed ${name} in ${destination}`);
}
try { main(); } catch (error) { console.error(`openspec-schemas: ${error.message}`); process.exitCode = 1; }
