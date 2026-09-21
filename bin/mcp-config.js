'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const hosts = new Set(['atomic', 'omp', 'opencode', 'pi']);

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

function object(value, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`invalid ${label}`);
  return value;
}

function selectedCatalog(source, selector) {
  const file = path.join(source, 'mcp.yaml');
  const info = stat(file);
  if (!info) throw new Error('--mcp requires schema mcp.yaml catalog');
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`unsafe MCP catalog: ${file}`);
  const entries = [];
  let current;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || /^#/.test(line) || line === 'version: 1' || line === 'servers:') continue;
    let match = /^  - name: ([a-z][a-z0-9-]*)$/.exec(line);
    if (match) { current = { name: match[1] }; entries.push(current); continue; }
    match = /^    (url|readOnly|auth): (.+)$/.exec(line);
    if (!match || !current) throw new Error('invalid mcp.yaml catalog');
    current[match[1]] = match[2];
  }
  if (!entries.length || new Set(entries.map(entry => entry.name)).size !== entries.length || entries.some(entry => !/^https:\/\/[^\s]+$/.test(entry.url || '') || entry.readOnly !== 'true' || entry.auth !== 'none')) throw new Error('invalid mcp.yaml catalog');
  const names = selector === 'all' ? entries.map(entry => entry.name) : selector.split(',');
  if (!names.length || names.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(names).size !== names.length) throw new Error('--mcp expects all or comma-separated catalog names');
  const selected = names.map(name => entries.find(entry => entry.name === name));
  if (selected.some(entry => !entry)) throw new Error(`unknown MCP catalog name: ${names.find((_, index) => !selected[index])}`);
  return selected;
}

function detectedHost(target) {
  const evidence = { atomic: ['.atomic'], omp: ['.omp/mcp.json', '.omp'], opencode: ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc', '.opencode'], pi: ['.pi'] };
  const candidates = Object.entries(evidence).filter(([, files]) => files.some(file => stat(path.join(target, file)))).map(([host]) => host);
  if (candidates.length !== 1) throw new Error('--mcp requires -a|--agents <atomic|omp|opencode|pi> when target host evidence is absent or ambiguous');
  return candidates[0];
}

function configPath(target, host) {
  if (host === 'atomic') return path.join(target, '.mcp.json');
  if (host === 'omp') return path.join(target, '.omp/mcp.json');
  const candidates = ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'].map(file => path.join(target, file)).filter(file => stat(file));
  if (candidates.length > 1) throw new Error('ambiguous OpenCode config candidates');
  return candidates[0] || path.join(target, 'opencode.jsonc');
}

function plan(target, source, selector, requestedHost, force) {
  const entries = selectedCatalog(source, selector);
  const host = requestedHost || detectedHost(target);
  if (!hosts.has(host)) throw new Error('--mcp host must be atomic, omp, opencode, or pi');
  if (host === 'pi') return { guided: true, entries };
  const file = configPath(target, host);
  directories(path.dirname(file));
  const info = stat(file);
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`unsafe MCP config: ${file}`);
  const original = info ? fs.readFileSync(file) : null;
  let config = {};
  if (original?.toString('utf8').trim()) {
    try { config = object(JSON.parse(original), 'MCP config'); } catch (error) { if (error.message.startsWith('invalid ')) throw error; throw new Error(`MCP config must be JSON without comments or trailing commas: ${file}`); }
  }
  const rootKey = host === 'opencode' ? 'mcp' : 'mcpServers';
  let servers = config[rootKey];
  if (host === 'opencode') {
    if (servers === undefined) servers = config[rootKey] = {};
    else object(servers, 'OpenCode mcp map');
    if (servers.servers === undefined) servers.servers = {};
    else object(servers.servers, 'OpenCode mcp.servers map');
    servers = servers.servers;
  } else if (servers === undefined) servers = config[rootKey] = {};
  else object(servers, 'mcpServers map');
  let changed = false;
  for (const entry of entries) {
    const expected = host === 'omp' ? { type: 'http', url: entry.url } : host === 'opencode' ? { type: 'remote', url: entry.url } : { url: entry.url };
    if (servers[entry.name] !== undefined && !isDeepStrictEqual(servers[entry.name], expected) && !force) throw new Error(`MCP server collision: ${entry.name} (use --force to replace selected server)`);
    if (!isDeepStrictEqual(servers[entry.name], expected)) { servers[entry.name] = expected; changed = true; }
  }
  return { file, info, original, updated: `${JSON.stringify(config, null, 2)}\n`, noop: !changed, entries };
}

function write(plan) {
  if (plan.guided) { console.log(`MCP guided-only for pi: ${plan.entries.map(entry => `${entry.name}=${entry.url}`).join(', ')}`); return; }
  if (plan.noop) return;
  directories(path.dirname(plan.file));
  const current = stat(plan.file);
  if (plan.info && (!current || !current.isFile() || current.isSymbolicLink() || current.ino !== plan.info.ino || current.dev !== plan.info.dev || !fs.readFileSync(plan.file).equals(plan.original))) throw new Error('MCP config changed during preflight');
  if (!plan.info && current) throw new Error('MCP config appeared during preflight');
  fs.mkdirSync(path.dirname(plan.file), { recursive: true });
  directories(path.dirname(plan.file));
  const mode = plan.info ? plan.info.mode & 0o7777 : 0o644;
  const temporary = `${plan.file}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, 'wx', mode);
  try {
    try { fs.writeFileSync(descriptor, plan.updated); fs.fchmodSync(descriptor, mode); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, plan.file);
  } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
}

module.exports = { plan, write };
