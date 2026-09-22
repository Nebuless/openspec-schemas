'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createPathGuard } = require('./opsx-path-guard.js');

const ownPackageRoot = path.resolve(__dirname, '..');
const profiles = new Set(['default', 'recommended', 'all']);
const markerVersion = 1;
const packageName = '@nebulesstech/openspec-schemas';

class OpsxError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function fail(code, message) { throw new OpsxError(code, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function stat(file) { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function safeName(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); }
function safeRepo(value) { return typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value); }
function unsafeText(value) { return typeof value !== 'string' || value.length === 0 || /[\0-\x1f\x7f]/.test(value) || /^[A-Za-z]:/.test(value) || /^\\\\/.test(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value); }
function safeRelative(value) {
  if (unsafeText(value) || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..' && !/[\s]/.test(part));
}
function targetFor(sourcePath) {
  if (!safeRelative(sourcePath)) fail('PROFILE_INVALID', `Unsafe skill path: ${sourcePath}`);
  const basename = path.posix.basename(sourcePath);
  if (!safeName(basename)) fail('PROFILE_INVALID', `Unsafe skill destination: ${basename}`);
  return `.agents/skills/${basename}`;
}

function schemaNames(packageRoot) {
  const directory = path.join(packageRoot, 'openspec/schemas');
  return fs.readdirSync(directory).filter(name => safeName(name) && stat(path.join(directory, name, 'schema.yaml'))?.isFile()).sort();
}

function schemaPackageVersion(packageRoot, schema) {
  const text = fs.readFileSync(path.join(packageRoot, 'openspec/schemas', schema, 'schema.yaml'), 'utf8');
  const versions = [...text.matchAll(/^version:[ \t]+([0-9]+)[ \t]*$/gm)];
  if (versions.length !== 1) fail('PROFILE_INVALID', `Schema '${schema}' has no unambiguous package version.`);
  return Number(versions[0][1]);
}

function parseManifest(text) {
  const resources = [];
  const targets = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let source;
    let sourcePath;
    if (line.includes('\t')) {
      const fields = line.split('\t');
      if (fields.length !== 2) fail('PROFILE_INVALID', `Malformed skills.txt declaration: ${line}`);
      source = fields[0].trim();
      sourcePath = fields[1].trim();
    } else {
      source = 'intent-driven-dev/skills';
      sourcePath = `.agents/skills/${line}`;
    }
    if (!safeRepo(source) || !safeRelative(sourcePath)) fail('PROFILE_INVALID', `Malformed skills.txt declaration: ${line}`);
    const target = targetFor(sourcePath);
    if (targets.has(target)) fail('PROFILE_INVALID', `Duplicate skill destination: ${target}`);
    targets.add(target);
    resources.push({ source, path: sourcePath, target });
  }
  return resources;
}

function loadProfile(packageRoot, schema, profile) {
  if (!safeName(schema) || !profiles.has(profile)) fail('PROFILE_INVALID', 'Invalid schema or profile selector.');
  const schemaRoot = path.join(packageRoot, 'openspec/schemas', schema);
  const manifest = path.join(schemaRoot, 'skills.txt');
  const manifestInfo = stat(manifest);
  if (!manifestInfo || !manifestInfo.isFile() || manifestInfo.isSymbolicLink()) fail('PROFILE_INVALID', `Package skills.txt unavailable for schema '${schema}'.`);
  const resolved = { default: parseManifest(fs.readFileSync(manifest, 'utf8')) };
  const optional = path.join(schemaRoot, 'skill-profiles.yaml');
  if (stat(optional)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(optional, 'utf8')); } catch { fail('PROFILE_INVALID', 'skill-profiles.yaml must contain strict JSON.'); }
    if (!object(value) || value.schemaVersion !== 1 || !object(value.profiles) || Object.keys(value).some(key => !['schemaVersion', 'profiles'].includes(key)) || Object.keys(value.profiles).some(name => !['recommended', 'all'].includes(name))) fail('PROFILE_INVALID', 'Invalid skill-profiles.yaml schema.');
    const visiting = new Set();
    const visit = name => {
      if (resolved[name]) return resolved[name];
      const declaration = value.profiles[name];
      if (!object(declaration) || Object.keys(declaration).some(key => !['extends', 'resources'].includes(key)) || !Array.isArray(declaration.extends) || !Array.isArray(declaration.resources)) fail('PROFILE_INVALID', `Invalid profile '${name}'.`);
      if (visiting.has(name)) fail('PROFILE_INVALID', 'Profile inheritance cycle.');
      visiting.add(name);
      const entries = [];
      for (const parent of declaration.extends) {
        if (!profiles.has(parent) || parent === name || (parent !== 'default' && !value.profiles[parent])) fail('PROFILE_INVALID', `Invalid profile parent '${parent}'.`);
        entries.push(...visit(parent));
      }
      for (const resource of declaration.resources) {
        if (!object(resource) || Object.keys(resource).some(key => !['source', 'path'].includes(key)) || !safeRepo(resource.source) || !safeRelative(resource.path)) fail('PROFILE_INVALID', `Invalid resource in profile '${name}'.`);
        entries.push({ source: resource.source, path: resource.path, target: targetFor(resource.path) });
      }
      visiting.delete(name);
      const byTarget = new Map();
      for (const entry of entries) {
        const prior = byTarget.get(entry.target);
        if (prior && (prior.source !== entry.source || prior.path !== entry.path)) fail('PROFILE_INVALID', `Ambiguous destination '${entry.target}'.`);
        byTarget.set(entry.target, entry);
      }
      resolved[name] = [...byTarget.values()].sort((left, right) => left.target.localeCompare(right.target));
      return resolved[name];
    };
    for (const name of Object.keys(value.profiles)) visit(name);
  }
  if (!resolved[profile]) fail('PROFILE_UNDECLARED', `Profile '${profile}' is not declared for schema '${schema}'.`);
  return resolved[profile].toSorted((left, right) => left.target.localeCompare(right.target));
}

function assertSafeAncestors(root, relative, allowMissing = true) {
  const rootInfo = stat(root);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) fail('UNSAFE_TARGET', 'Project root must be an existing non-symlink directory.');
  if (!safeRelative(relative)) fail('UNSAFE_TARGET', `Unsafe project path: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const info = stat(current);
    if (!info) { if (allowMissing) continue; fail('UNSAFE_TARGET', `Missing path: ${relative}`); }
    if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `Symlink path refused: ${relative}`);
  }
}

function digestTree(directory) {
  const hash = crypto.createHash('sha256');
  const walk = (current, relative) => {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || (info.isFile() && info.nlink !== 1)) fail('UNSAFE_RESOURCE', `Unsafe resource tree entry: ${relative || '.'}`);
    if (info.isDirectory()) {
      hash.update(`D\0${relative}\0${info.mode & 0o7777}\0`);
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name), relative ? `${relative}/${name}` : name);
    } else {
      hash.update(`F\0${relative}\0${info.mode & 0o7777}\0${info.size}\0`);
      hash.update(fs.readFileSync(current));
    }
  };
  walk(directory, '');
  return `sha256:${hash.digest('hex')}`;
}

function markerPath(projectRoot) { return path.join(projectRoot, '.openspec/opsx-schema/managed-skills.json'); }
function controlPath(projectRoot, name) { return path.join(projectRoot, '.openspec/opsx-schema', name); }
function ownershipId(schema, profile) { return `${schema}:${profile}`; }

function validateMarker(value, projectRoot, packageVersion, packageRoot = ownPackageRoot) {
  const invalid = () => fail('MANAGED_SKILLS_CORRUPT', 'Managed skills marker is malformed or unsafe.');
  if (!object(value) || value.schemaVersion !== markerVersion || !object(value.package) || value.package.name !== packageName || value.package.version !== packageVersion || !Array.isArray(value.resources) || !Array.isArray(value.ownerships) || Object.keys(value).some(key => !['schemaVersion', 'package', 'resources', 'ownerships'].includes(key))) invalid();
  const resources = new Map();
  for (const resource of value.resources) {
    if (!object(resource) || Object.keys(resource).some(key => !['target', 'source', 'path', 'digest'].includes(key)) || !safeRepo(resource.source) || !safeRelative(resource.path) || resource.target !== targetFor(resource.path) || !/^sha256:[a-f0-9]{64}$/.test(resource.digest) || resources.has(resource.target)) invalid();
    assertSafeAncestors(projectRoot, resource.target);
    resources.set(resource.target, resource);
  }
  const ownerships = new Map();
  for (const ownership of value.ownerships) {
    if (!object(ownership) || Object.keys(ownership).some(key => !['id', 'schema', 'schemaVersion', 'profile', 'resources'].includes(key)) || !safeName(ownership.schema) || !Number.isInteger(ownership.schemaVersion) || ownership.schemaVersion < 1 || !profiles.has(ownership.profile) || ownership.id !== ownershipId(ownership.schema, ownership.profile) || !Array.isArray(ownership.resources) || ownership.resources.some(target => !resources.has(target)) || new Set(ownership.resources).size !== ownership.resources.length || ownerships.has(ownership.id)) invalid();
    ownerships.set(ownership.id, ownership);
  }
  const referenced = new Set([...ownerships.values()].flatMap(ownership => ownership.resources));
  if (referenced.size !== resources.size || [...resources.keys()].some(target => !referenced.has(target))) invalid();
  const attached = new Set(schemaNames(packageRoot));
  for (const ownership of ownerships.values()) if (attached.has(ownership.schema) && ownership.schemaVersion !== schemaPackageVersion(packageRoot, ownership.schema)) invalid();
  return { value, resources, ownerships };
}

function readMarker(projectRoot, packageVersion, packageRoot = ownPackageRoot) {
  const file = markerPath(projectRoot);
  const info = stat(file);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('MANAGED_SKILLS_CORRUPT', 'Managed skills marker is not a safe regular file.');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('MANAGED_SKILLS_CORRUPT', 'Managed skills marker is not valid JSON.'); }
  return validateMarker(value, projectRoot, packageVersion, packageRoot);
}

function markerState(projectRoot, packageVersion, packageRoot = ownPackageRoot) {
  const diagnostics = [];
  const journal = controlPath(projectRoot, 'transaction.json');
  if (stat(journal)) diagnostics.push({ severity: 'error', code: 'TRANSACTION_INCOMPLETE', message: 'Incomplete skills transaction requires manual recovery.', source: journal });
  try {
    const marker = readMarker(projectRoot, packageVersion, packageRoot);
    if (!marker) return { managed: 0, enabled: 0, ownerships: [], resources: [], diagnostics };
    let enabled = 0;
    for (const resource of marker.resources.values()) {
      const target = path.join(projectRoot, ...resource.target.split('/'));
      try {
        if (stat(target)?.isDirectory() && digestTree(target) === resource.digest) enabled += 1;
        else diagnostics.push({ severity: 'error', code: 'MANAGED_RESOURCE_MODIFIED', message: `Managed resource differs from ownership marker: ${resource.target}`, source: resource.target });
      } catch (error) {
        diagnostics.push({ severity: 'error', code: error.code || 'MANAGED_RESOURCE_MODIFIED', message: error.message, source: resource.target });
      }
    }
    return { managed: marker.resources.size, enabled, ownerships: [...marker.ownerships.values()], resources: [...marker.resources.values()], diagnostics };
  } catch (error) {
    diagnostics.push({ severity: 'error', code: error.code || 'MANAGED_SKILLS_CORRUPT', message: error.message, source: markerPath(projectRoot) });
    return { managed: null, enabled: null, ownerships: null, resources: null, diagnostics };
  }
}

function readProjectSchema(projectRoot) {
  const file = path.join(projectRoot, 'openspec/config.yaml');
  assertSafeAncestors(projectRoot, 'openspec/config.yaml', false);
  const info = stat(file);
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('CONFIG_INVALID', 'Project config must be an existing safe regular file.');
  const bytes = fs.readFileSync(file);
  const lines = bytes.toString('latin1').split('\n');
  const candidates = lines.filter(line => /^(?:schema\s*:|["']schema["']\s*:|<<\s*:|---|\.\.\.)/.test(line));
  const simple = /^schema:([ \t]+)([A-Za-z0-9_-]+)([ \t]*(?:#[^\r\n]*)?)(\r?)$/;
  const match = candidates.length === 1 ? simple.exec(candidates[0]) : null;
  if (!match) fail('CONFIG_INVALID', 'Enable requires one simple existing top-level schema line.');
  return { file, info, bytes, lines, line: candidates[0], match, schema: match[2] };
}

function replaceFileAtomically(record, bytes) {
  const temporary = `${record.file}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, 'wx', record.info.mode & 0o7777);
  try {
    try { fs.writeFileSync(descriptor, bytes); fs.fchmodSync(descriptor, record.info.mode & 0o7777); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    const current = stat(record.file);
    if (!current?.isFile() || current.isSymbolicLink() || current.dev !== record.info.dev || current.ino !== record.info.ino || !fs.readFileSync(record.file).equals(record.bytes)) fail('TARGET_CHANGED', 'Target changed during mutation preflight.');
    fs.renameSync(temporary, record.file);
  } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
}

function enableSchema(projectRoot, schema, apply) {
  const config = readProjectSchema(projectRoot);
  if (config.schema === schema) return { applied: false, previous: schema, schema, mutation: { operation: 'enable-schema', status: 'noop', target: 'openspec/config.yaml' } };
  const updated = Buffer.from(config.lines.map(line => line === config.line ? `schema:${config.match[1]}${schema}${config.match[3]}${config.match[4]}` : line).join('\n'), 'latin1');
  if (apply) replaceFileAtomically(config, updated);
  return { applied: apply, previous: config.schema, schema, mutation: { operation: 'enable-schema', status: apply ? 'applied' : 'planned', target: 'openspec/config.yaml' } };
}

function acquire(resources, stageRoot, environment) {
  const repositories = new Map();
  for (const resource of resources) {
    if (!repositories.has(resource.source)) {
      const destination = path.join(stageRoot, `repo-${repositories.size}`);
      const result = spawnSync('git', ['clone', '--depth', '1', '--no-tags', '--quiet', `https://github.com/${resource.source}.git`, destination], {
        encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
        env: { ...environment, HOME: path.join(stageRoot, 'git-home'), GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0' },
      });
      if (result.error || result.status !== 0) fail('SOURCE_UNAVAILABLE', `Failed to acquire ${resource.source}.`);
      repositories.set(resource.source, destination);
    }
    const source = path.join(repositories.get(resource.source), ...resource.path.split('/'));
    const relative = path.relative(repositories.get(resource.source), source);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('PROFILE_INVALID', 'Source path escapes repository.');
    const sourceInfo = stat(source);
    if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) fail('SOURCE_INVALID', `Declared skill directory unavailable: ${resource.source}/${resource.path}`);
    const staged = path.join(stageRoot, 'targets', path.basename(resource.target));
    fs.mkdirSync(path.dirname(staged), { recursive: true, mode: 0o700 });
    fs.cpSync(source, staged, { recursive: true, dereference: false, verbatimSymlinks: true });
    resource.staged = staged;
    resource.digest = digestTree(staged);
  }
}

function sameResource(left, right) { return left.source === right.source && left.path === right.path && left.target === right.target; }

function mutateSkills({ projectRoot, packageRoot, packageVersion, schema, profile, operation, force, environment = process.env }) {
  const control = path.join(projectRoot, '.openspec/opsx-schema');
  const openspecState = path.dirname(control);
  const removeControl = !stat(control);
  const removeOpenspecState = !stat(openspecState);
  assertSafeAncestors(projectRoot, '.openspec/opsx-schema');
  const existingJournal = stat(path.join(control, 'transaction.json'));
  if (existingJournal) fail('TRANSACTION_INCOMPLETE', 'Incomplete skills transaction blocks mutation.');
  fs.mkdirSync(control, { recursive: true, mode: 0o700 });
  const lock = path.join(control, 'mutation.lock');
  const lockToken = Buffer.from(`${crypto.randomUUID()}\n`);
  const guard = createPathGuard(projectRoot, ['.agents', '.agents/skills', '.openspec', '.openspec/opsx-schema', '.openspec/opsx-schema/mutation.lock', '.openspec/opsx-schema/transaction.json', '.openspec/opsx-schema/managed-skills.json'], fail);
  let lockDescriptor;
  let lockIdentity = null;
  let stageRoot = null;
  let journalWritten = false;
  const applied = [];
  const backups = [];
  let markerBackup = null;
  let primaryError = null;
  try { lockDescriptor = fs.openSync(lock, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') fail('MUTATION_LOCKED', 'Another skills mutation owns mutation.lock.'); throw error; }
  try {
    fs.writeFileSync(lockDescriptor, lockToken);
    fs.fsyncSync(lockDescriptor);
    lockIdentity = fs.fstatSync(lockDescriptor);
    guard.update('.openspec/opsx-schema/mutation.lock');
    guard.verify('.openspec/opsx-schema/mutation.lock');
    guard.verify('.agents/skills');
    stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsx-schema-skills-'));
    const marker = readMarker(projectRoot, packageVersion, packageRoot);
    const attached = schemaNames(packageRoot).includes(schema);
    const selected = operation === 'disable' && !attached ? null : loadProfile(packageRoot, schema, profile);
    const id = ownershipId(schema, profile);
    const currentResources = new Map(marker ? marker.resources : []);
    const currentOwnerships = new Map(marker ? marker.ownerships : []);
    const ownedResourceTargets = new Set([...currentOwnerships.values()].flatMap(ownership => ownership.resources));
    if (attached && currentOwnerships.has(id) && currentOwnerships.get(id).schemaVersion !== schemaPackageVersion(packageRoot, schema)) fail('MANAGED_SKILLS_CORRUPT', `Ownership schema version mismatch for ${id}.`);
    for (const resource of selected || []) {
      guard.remember(path.posix.dirname(resource.target));
      guard.remember(resource.target);
      guard.verify(resource.target);
    }
    if (operation !== 'disable' && currentOwnerships.has(id)) {
      const ownership = currentOwnerships.get(id);
      const targets = selected.map(resource => resource.target).sort();
      const matching = JSON.stringify(ownership.resources.toSorted()) === JSON.stringify(targets) && selected.every(resource => {
        const managed = currentResources.get(resource.target);
        if (!managed || !sameResource(managed, resource)) return false;
        const target = path.join(projectRoot, ...resource.target.split('/'));
        return stat(target)?.isDirectory() && digestTree(target) === managed.digest;
      });
      if (matching) return { applied: false, resources: selected, mutation: { operation, status: 'noop', schema, profile } };
    }
    if (operation !== 'disable') acquire(selected, stageRoot, environment);
    if (operation === 'disable' && !currentOwnerships.has(id)) return { applied: false, resources: [], mutation: { operation, status: 'noop', schema, profile } };
    const ownedTargets = operation === 'disable' ? currentOwnerships.get(id).resources : [];
    const sharedTargets = new Set([...currentOwnerships.values()].filter(ownership => ownership.id !== id).flatMap(ownership => ownership.resources));
    const chosen = operation === 'disable' ? ownedTargets.filter(target => !sharedTargets.has(target)).map(target => currentResources.get(target)) : selected;
    for (const resource of chosen) {
      guard.remember(resource.target);
      guard.verify(resource.target);
    }
    for (const resource of chosen) {
      assertSafeAncestors(projectRoot, resource.target);
      const target = path.join(projectRoot, ...resource.target.split('/'));
      const info = stat(target);
      const managed = ownedResourceTargets.has(resource.target) ? currentResources.get(resource.target) : null;
      if (managed) {
        if (!sameResource(managed, resource)) fail('MANAGED_SKILLS_CORRUPT', `Conflicting ownership for ${resource.target}.`);
        if (!info?.isDirectory() || digestTree(target) !== managed.digest) fail('MANAGED_RESOURCE_MODIFIED', `Managed resource modified: ${resource.target}`);
      } else if (info) {
        if (!force || !info.isDirectory() || info.isSymbolicLink()) fail('TARGET_COLLISION', `Target collision: ${resource.target}`);
        digestTree(target);
      }
    }
    const nextOwnerships = new Map(currentOwnerships);
    const nextResources = new Map(currentResources);
    if (operation === 'disable') nextOwnerships.delete(id);
    else {
      nextOwnerships.set(id, { id, schema, schemaVersion: schemaPackageVersion(packageRoot, schema), profile, resources: selected.map(resource => resource.target).sort() });
      for (const resource of selected) nextResources.set(resource.target, { target: resource.target, source: resource.source, path: resource.path, digest: resource.digest });
    }
    const referenced = new Set([...nextOwnerships.values()].flatMap(ownership => ownership.resources));
    for (const target of nextResources.keys()) if (!referenced.has(target)) nextResources.delete(target);
    const nextMarker = { schemaVersion: markerVersion, package: { name: packageName, version: packageVersion }, resources: [...nextResources.values()].sort((a, b) => a.target.localeCompare(b.target)), ownerships: [...nextOwnerships.values()].sort((a, b) => a.id.localeCompare(b.id)) };
    const converged = marker && JSON.stringify(marker.value) === JSON.stringify(nextMarker) && chosen.every(resource => operation === 'disable' || digestTree(resource.staged) === resource.digest);
    if (converged) return { applied: false, resources: chosen, mutation: { operation, status: 'noop', schema, profile } };
    const journal = path.join(control, 'transaction.json');
    const guardedPaths = ['.openspec', '.openspec/opsx-schema', '.openspec/opsx-schema/mutation.lock', '.openspec/opsx-schema/transaction.json', '.openspec/opsx-schema/managed-skills.json'];
    for (const resource of chosen) guardedPaths.push(resource.target);
    for (const resource of selected || []) guardedPaths.push(resource.target, path.posix.dirname(resource.target));
    for (const relative of new Set(guardedPaths)) guard.remember(relative);
    guard.verify('.agents/skills');
    guard.verify('.openspec/opsx-schema/mutation.lock');
    guard.verify('.openspec/opsx-schema/transaction.json');
    fs.writeFileSync(journal, `${JSON.stringify({ schemaVersion: 1, operation, schema, profile, pid: process.pid })}\n`, { flag: 'wx', mode: 0o600 });
    guard.update('.openspec/opsx-schema/transaction.json');
    journalWritten = true;
    guard.verify('.openspec/opsx-schema/transaction.json');
    const backupRoot = path.join(stageRoot, 'backups');
    fs.mkdirSync(backupRoot, { mode: 0o700 });
    for (const resource of chosen) {
      const target = path.join(projectRoot, ...resource.target.split('/'));
      guard.verify(resource.target);
      const info = stat(target);
      if (info) {
        const backup = path.join(backupRoot, path.basename(resource.target));
        fs.renameSync(target, backup);
        guard.update(resource.target);
        backups.push({ target, backup });
      }
    }
    const markerFile = markerPath(projectRoot);
    guard.verify('.openspec/opsx-schema/managed-skills.json');
    if (stat(markerFile)) { markerBackup = path.join(stageRoot, 'marker-backup'); fs.copyFileSync(markerFile, markerBackup); }
    if (operation !== 'disable') {
      for (const resource of selected) {
        const target = path.join(projectRoot, ...resource.target.split('/'));
        guard.ensureDirectory(path.posix.dirname(resource.target));
        guard.verify(resource.target);
        if (stat(target)) fail('TARGET_CHANGED', `Target appeared during commit: ${resource.target}`);
        fs.renameSync(resource.staged, target);
        guard.update(resource.target);
        applied.push({ target, digest: resource.digest });
      }
    }
    for (const entry of applied) if (digestTree(entry.target) !== entry.digest) fail('TARGET_CHANGED', `Staged target changed during commit: ${entry.target}`);
    const markerTemporary = path.join(control, `managed-skills.${crypto.randomUUID()}.tmp`);
    guard.verify('.openspec/opsx-schema');
    guard.verify('.openspec/opsx-schema/managed-skills.json');
    fs.writeFileSync(markerTemporary, `${JSON.stringify(nextMarker, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    guard.verify('.openspec/opsx-schema');
    guard.verify('.openspec/opsx-schema/managed-skills.json');
    fs.renameSync(markerTemporary, markerFile);
    guard.update('.openspec/opsx-schema/managed-skills.json');
    guard.verify('.openspec/opsx-schema/transaction.json');
    fs.unlinkSync(journal);
    guard.update('.openspec/opsx-schema/transaction.json');
    journalWritten = false;
    return { applied: true, resources: chosen, mutation: { operation, status: 'applied', schema, profile } };
  } catch (error) {
    primaryError = error;
    try {
      for (const entry of applied.reverse()) {
        guard.verify(path.relative(projectRoot, entry.target).split(path.sep).join('/'));
        const info = stat(entry.target);
        if (info?.isDirectory() && digestTree(entry.target) === entry.digest) {
          fs.rmSync(entry.target, { recursive: true });
          guard.update(path.relative(projectRoot, entry.target).split(path.sep).join('/'));
        }
      }
      for (const backup of backups.reverse()) {
        const relative = path.relative(projectRoot, backup.target).split(path.sep).join('/');
        guard.verify(relative);
        if (!stat(backup.target) && stat(backup.backup)) {
          fs.renameSync(backup.backup, backup.target);
          guard.update(relative);
        }
      }
      if (guard) guard.verify('.openspec/opsx-schema/managed-skills.json');
      if (guard && markerBackup && stat(markerBackup)) {
        const restore = path.join(control, `managed-skills.${crypto.randomUUID()}.rollback`);
        guard.verify('.openspec/opsx-schema');
        fs.copyFileSync(markerBackup, restore);
        guard.verify('.openspec/opsx-schema/managed-skills.json');
        fs.renameSync(restore, markerPath(projectRoot));
        guard.update('.openspec/opsx-schema/managed-skills.json');
      } else if (guard && !markerBackup && applied.length) {
        fs.rmSync(markerPath(projectRoot), { force: true });
        guard.update('.openspec/opsx-schema/managed-skills.json');
      }
      if (guard && journalWritten) {
        guard.verify('.openspec/opsx-schema/transaction.json');
        fs.rmSync(controlPath(projectRoot, 'transaction.json'), { force: true });
        guard.update('.openspec/opsx-schema/transaction.json');
      }
    } catch (rollbackError) {
      fail('TRANSACTION_ROLLBACK_FAILED', `${error.message}; rollback failed: ${rollbackError.message}`);
    }
    if (error instanceof OpsxError || typeof error.code === 'string') throw error;
    fail('TRANSACTION_FAILED', error.message);
  } finally {
    let cleanupError = null;
    try { if (stageRoot) fs.rmSync(stageRoot, { recursive: true, force: true }); } catch (error) { cleanupError = error; }
    let ownsLockPath = false;
    try {
      if (!lockIdentity) lockIdentity = fs.fstatSync(lockDescriptor);
      const current = stat(lock);
      ownsLockPath = Boolean(current && current.isFile() && !current.isSymbolicLink() && current.nlink === 1 && current.dev === lockIdentity.dev && current.ino === lockIdentity.ino);
    } catch (error) { cleanupError ||= error; }
    try { if (ownsLockPath) fs.unlinkSync(lock); } catch (error) { cleanupError ||= error; }
    try { fs.closeSync(lockDescriptor); } catch (error) { cleanupError ||= error; }
    try { if (removeControl && stat(control)?.isDirectory() && fs.readdirSync(control).length === 0) fs.rmdirSync(control); } catch (error) { cleanupError ||= error; }
    try { if (removeOpenspecState && stat(openspecState)?.isDirectory() && fs.readdirSync(openspecState).length === 0) fs.rmdirSync(openspecState); } catch (error) { cleanupError ||= error; }
    if (cleanupError && !primaryError) throw cleanupError;
  }
}

module.exports = { OpsxError, schemaNames, loadProfile, markerState, enableSchema, mutateSkills, readProjectSchema };
