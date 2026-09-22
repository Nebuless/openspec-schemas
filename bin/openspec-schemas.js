#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mcp = require('./mcp-config');
const { setChangeSchemaLegacy } = require('./change-schema.js');
function handleStreamError(error) {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
}
process.stdout.on('error', handleStreamError);
process.stderr.on('error', handleStreamError);
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
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
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (['--version', '-v', '-V'].includes(command)) {
    if (args.length) throw new Error('unexpected arguments');
    console.log(version);
    return;
  }
  if (command === '--help' || command === undefined) {
    console.log('Usage: openspec-schemas list | validate [schema] | verify | install <schema> [-t|--target <dir>] [-sk|--skills] [--mcp <all|name[,name...]>] [-a|--agents <host>] [--agent <host>] [--host <host>] [-i|--activate] [--force]');
    console.log('       openspec-schemas set-change-schema <change> <schema> [-t|--target <project>] [--apply] [--allow-incompatible]');
    return;
  }
  if (command === 'list' || command === 'verify') {
    if (args.length) throw new Error('unexpected arguments');
    for (const name of names()) {
      if (command === 'list') console.log(name);
      else { run('openspec', ['schema', 'validate', name], root); mcp.validateCatalog(path.join(schemas, name)); }
    }
    return;
  }
  if (command === 'validate') {
    if (args.length > 1) throw new Error('unexpected arguments');
    const name = args[0];
    if (name && !names().includes(name)) throw new Error(`unknown schema: ${name}`);
    for (const schema of name ? [name] : names()) { run('openspec', ['schema', 'validate', schema], root); mcp.validateCatalog(path.join(schemas, schema)); }
    return;
  }
  if (command === 'set-change-schema') return setChangeSchemaLegacy(args);
  if (command !== 'install') throw new Error(`unknown command: ${command}`);
  const name = args.shift();
  if (!names().includes(name)) throw new Error(`unknown schema: ${name}`);
  let target = process.cwd();
  let host;
  let targetSet = false;
  let skills = false;
  let activate = false;
  let force = false;
  let mcpSelector;
  let mcpInstall;
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
    } else if (arg === '--mcp') {
      const value = args.shift();
      if (!value || value.startsWith('-')) throw new Error('missing value: --mcp');
      if (mcpSelector) throw new Error('duplicate option: mcp');
      mcpSelector = value;
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
  const source = path.join(schemas, name);
  const destination = path.join(target, 'openspec/schemas', name);
  const installed = stat(destination);
  if (mcpSelector) {
    mcpInstall = mcp.plan(target, source, mcpSelector, host, force);
  } else if (host && (!Object.hasOwn(hosts, host) || name !== 'compound-intent-driven')) {
    throw new Error('--host requires compound-intent-driven and a supported host');
  }
  if (destination === source || source.startsWith(destination + path.sep)) throw new Error('source and destination overlap');
  if (mcpSelector && installed) collision(destination, true, true);
  else collision(destination, force, true);
  if (host && !mcpSelector) {
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
  let updated, originalConfig;
  if (activate) {
    collision(config, true, false);
    originalConfig = fs.readFileSync(config);
    const text = originalConfig.toString('utf8');
    const lines = text.split('\n');
    const candidates = lines.filter(line => /^(?:schema\s*:|["']schema["']\s*:|<<\s*:|---|\.\.\.)/.test(line));
    const simple = /^schema:([ \t]+)[a-zA-Z0-9_-]+([ \t]*(?:#[^\r\n]*)?)(\r?)$/;
    if (candidates.length !== 1 || !simple.test(candidates[0])) throw new Error('activation requires one simple existing top-level schema: line');
    updated = lines.map(line => simple.test(line) ? line.replace(simple, `schema:$1${name}$2$3`) : line).join('\n');
  }
  run('openspec', ['schema', 'validate', name], root);
  const replaceSchema = !(mcpSelector && installed);
  const backup = replaceSchema && installed ? `${destination}.${require('node:crypto').randomUUID()}.backup` : undefined;
  const createdParents = [path.dirname(destination), path.dirname(path.dirname(destination))].filter(directory => !stat(directory));
  try {
    if (replaceSchema) {
      if (backup) fs.renameSync(destination, backup);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.cpSync(source, destination, { recursive: true });
    }
    const extra = force ? ['--force'] : [];
    if (skills) run('sh', [path.join(root, 'scripts/install-schema-skills.sh'), destination, target, ...extra], root);
    if (host && !mcpSelector) run('sh', [path.join(root, 'scripts/install-compound-adapters.sh'), host, target, ...extra], root);
    run('openspec', ['schema', 'validate', name], target);
    if (updated !== undefined) fs.writeFileSync(config, updated);
    if (mcpInstall) mcp.write(mcpInstall);
    if (backup) fs.rmSync(backup, { recursive: true });
  } catch (error) {
    if (replaceSchema && stat(destination)) fs.rmSync(destination, { recursive: true });
    if (backup) fs.renameSync(backup, destination);
    if (updated !== undefined) fs.writeFileSync(config, originalConfig);
    for (const directory of createdParents) try { fs.rmdirSync(directory); } catch (cleanupError) { if (!['ENOENT', 'ENOTEMPTY'].includes(cleanupError.code)) throw cleanupError; }
    throw error;
  }
  console.log(`Installed ${name} in ${destination}`);
}
try { main(); } catch (error) { console.error(`openspec-schemas: ${error.message}`); process.exitCode = 1; }
