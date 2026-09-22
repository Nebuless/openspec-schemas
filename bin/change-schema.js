'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { setChangeSchemaLegacy } = require('./legacy-change-schema.js');
const { directories, identity, injectRace, inside, rollbackRecovery, sameFile, stat, verifyPath } = require('./change-schema-transaction.js');

function normalizeGraph(status, statuses, strictDependencies = false) {
  const ids = new Set();
  const graph = status.artifacts.map(artifact => {
    if (!artifact || typeof artifact.id !== 'string' || !artifact.id || ids.has(artifact.id) || typeof artifact.outputPath !== 'string' || !artifact.outputPath || !statuses.has(artifact.status)) throw new Error('invalid artifact graph');
    ids.add(artifact.id);
    const requires = new Set();
    for (const field of ['requires', 'dependencies', 'missingDeps']) {
      if (Object.hasOwn(artifact, field)) {
        if (!Array.isArray(artifact[field]) || artifact[field].some(id => typeof id !== 'string' || !id)) throw new Error('invalid artifact dependencies');
        for (const id of artifact[field]) {
          if (strictDependencies && requires.has(id)) throw new Error(`duplicate dependency '${id}' for artifact '${artifact.id}'`);
          requires.add(id);
        }
      }
    }
    return { id: artifact.id, outputPath: artifact.outputPath, requires: [...requires].sort() };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (strictDependencies) {
    for (const artifact of graph) {
      for (const required of artifact.requires) {
        if (!ids.has(required)) throw new Error(`unknown dependency '${required}' for artifact '${artifact.id}'`);
      }
    }
  }
  return graph;
}

function metadataPatch(metadata, expectedSchema, destinationSchema) {
  const original = fs.readFileSync(metadata);
  const text = original.toString('latin1');
  const lines = text.split('\n');
  const candidates = lines.filter(line => /^(?:schema\s*:|["']|\?|<<\s*:|---|\.\.\.|%|\{|\[)/.test(line));
  const simple = /^schema:([ \t]+)([a-zA-Z0-9_-]+)([ \t]*(?:#[^\r\n]*)?)(\r?)$/;
  const match = candidates.length === 1 ? simple.exec(candidates[0]) : null;
  if (!match || match[2] !== expectedSchema) throw new Error('metadata requires one simple existing top-level schema: matching status');
  const updated = Buffer.from(lines.map(line => line === candidates[0] ? `schema:${match[1]}${destinationSchema}${match[3]}${match[4]}` : line).join('\n'), 'latin1');
  return { original, updated };
}

class HandoffError extends Error {
  constructor(code, message, data = null, mutation = null) {
    super(message);
    this.code = code;
    this.data = data;
    this.mutation = mutation;
  }
}

function fail(code, message, data, mutation) {
  throw new HandoffError(code, message, data, mutation);
}

function runJson(args, target) {
  const result = spawnSync('openspec', args, { cwd: target, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0' }, maxBuffer: 1024 * 1024, timeout: 15000 });
  if (result.error) fail('OPENSPEC_FAILED', `openspec ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) fail('OPENSPEC_FAILED', `openspec ${args.join(' ')} failed: ${result.stderr || result.status}`);
  try { return JSON.parse(result.stdout); } catch { fail('OPENSPEC_INVALID_JSON', `openspec ${args.join(' ')} returned invalid JSON`); }
}

function validateSchema(schema, target) {
  const result = spawnSync('openspec', ['schema', 'validate', schema], {
    cwd: target,
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });
  if (result.error?.code === 'ETIMEDOUT') fail('SCHEMA_VALIDATION_TIMEOUT', `openspec schema validate ${schema} timed out`);
  if (result.error?.code === 'ENOBUFS') fail('SCHEMA_VALIDATION_OUTPUT_LIMIT', `openspec schema validate ${schema} exceeded the output limit`);
  if (result.error) fail('SCHEMA_VALIDATION_FAILED', `openspec schema validate ${schema} could not run`);
  if (result.status !== 0) fail('SCHEMA_VALIDATION_FAILED', `openspec schema validate ${schema} failed with status ${result.status}`);
}

function isName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateList(value, target, change) {
  if (!isObject(value) || !isObject(value.root) || path.resolve(value.root.path || '') !== target || !Array.isArray(value.changes)) fail('INVALID_LIST', 'OpenSpec list metadata does not match target project');
  const names = new Set();
  for (const item of value.changes) {
    if (!isObject(item) || !isName(item.name) || names.has(item.name) || !Number.isInteger(item.completedTasks) || !Number.isInteger(item.totalTasks) || !['no-tasks', 'complete', 'in-progress'].includes(item.status)) fail('INVALID_LIST', 'OpenSpec change-list data is malformed');
    names.add(item.name);
  }
  const matches = value.changes.filter(item => item.name === change);
  if (matches.length !== 1) fail('CHANGE_NOT_ACTIVE', `change '${change}' is not active`);
  const listed = matches[0];
  if (listed.status === 'complete') fail('CHANGE_COMPLETE', `change '${change}' is complete`);
  return listed;
}

function validateStatus(value, context, expectedSchema) {
  const { change, target, changeRoot } = context;
  if (!isObject(value) || value.changeName !== change || value.schemaName !== expectedSchema || !isObject(value.root) || path.resolve(value.root.path || '') !== target || !isObject(value.planningHome) || value.planningHome.kind !== 'repo' || path.resolve(value.planningHome.root || '') !== target || !path.isAbsolute(value.planningHome.changesDir || '') || !path.isAbsolute(value.changeRoot || '') || typeof value.isComplete !== 'boolean' || !Array.isArray(value.artifacts)) fail('INVALID_STATUS', 'OpenSpec status metadata does not match requested project, change, or schema');
  if (!inside(target, value.planningHome.changesDir) || !inside(value.planningHome.changesDir, value.changeRoot) || path.relative(value.planningHome.changesDir, value.changeRoot).split(path.sep).includes('archive')) fail('UNSAFE_CHANGE_ROOT', 'change root is external, archived, or unsafe');
  if (changeRoot && path.resolve(value.changeRoot) !== changeRoot) fail('INVALID_STATUS', 'target status change root differs from source');
  verifyPath(target, value.planningHome.changesDir);
  verifyPath(target, value.changeRoot);
  if (value.isComplete) fail('CHANGE_COMPLETE', `change '${change}' is complete`);
  return { ...value, changeRoot: path.resolve(value.changeRoot), planningHome: { ...value.planningHome, changesDir: path.resolve(value.planningHome.changesDir) } };
}

function validateSchemas(value, sourceSchema, targetSchema) {
  if (!Array.isArray(value)) fail('INVALID_SCHEMAS', 'OpenSpec schema resolution data is malformed');
  const seen = new Set();
  let destination;
  let sourceFound = false;
  for (const schema of value) {
    if (!isObject(schema) || !isName(schema.name) || seen.has(schema.name) || typeof schema.source !== 'string' || !path.isAbsolute(schema.path || '') || !Array.isArray(schema.shadows)) fail('INVALID_SCHEMAS', 'OpenSpec schema resolution data is malformed');
    seen.add(schema.name);
    if (schema.name === sourceSchema) sourceFound = true;
    if (schema.name === targetSchema) destination = schema;
  }
  if (!sourceFound) fail('SOURCE_SCHEMA_UNRESOLVED', `source schema '${sourceSchema}' is not OpenSpec-resolved`);
  if (!destination) fail('TARGET_SCHEMA_UNRESOLVED', `target schema '${targetSchema}' is not OpenSpec-resolved`);
  return destination;
}

function graphDiff(sourceGraph, targetGraph) {
  const source = new Map(sourceGraph.map(item => [item.id, item]));
  const target = new Map(targetGraph.map(item => [item.id, item]));
  const added = targetGraph.filter(item => !source.has(item.id));
  const removed = sourceGraph.filter(item => !target.has(item.id));
  const changed = sourceGraph.filter(item => target.has(item.id) && JSON.stringify(item) !== JSON.stringify(target.get(item.id))).map(item => ({ id: item.id, source: item, target: target.get(item.id) }));
  return { added, removed, changed };
}

function handoff(options) {
  const target = path.resolve(options.target);
  directories(target);
  const list = runJson(['list', '--json'], target);
  validateList(list, target, options.change);
  const rawSource = runJson(['status', '--change', options.change, '--json'], target);
  const source = validateStatus(rawSource, { change: options.change, target }, rawSource?.schemaName);
  if (!isName(source.schemaName)) fail('INVALID_STATUS', 'OpenSpec source schema is invalid');
  const metadata = path.join(source.changeRoot, '.openspec.yaml');
  verifyPath(target, metadata, 'file');
  const info = stat(metadata);
  const originalIdentity = identity(info);
  const patch = metadataPatch(metadata, source.schemaName, options.schema);
  const schema = validateSchemas(runJson(['schema', 'which', '--all', '--json'], target), source.schemaName, options.schema);
  const rawDestination = runJson(['status', '--change', options.change, '--json', '--schema', options.schema], target);
  const destination = validateStatus(rawDestination, { change: options.change, target, changeRoot: source.changeRoot }, options.schema);
  validateSchema(options.schema, target);
  let sourceGraph;
  let targetGraph;
  try {
    sourceGraph = normalizeGraph(source, new Set(['done', 'ready', 'blocked', 'skipped']), true);
    targetGraph = normalizeGraph(destination, new Set(['done', 'ready', 'blocked', 'skipped']), true);
  } catch (error) { fail('INVALID_GRAPH', error.message); }
  const diff = graphDiff(sourceGraph, targetGraph);
  const compatible = !diff.added.length && !diff.removed.length && !diff.changed.length;
  const data = {
    source: { schema: source.schemaName, projectRoot: target, changeRoot: source.changeRoot },
    target: { schema: options.schema, source: schema.source, path: schema.path, projectRoot: target, changeRoot: source.changeRoot },
    change: { name: options.change, planningRoot: source.planningHome.changesDir, metadata },
    compatibility: { compatible, acknowledged: compatible ? false : options.allowIncompatible },
    graphDiff: diff,
    applied: false,
  };
  let mutation = { operation: 'handoff', path: metadata, status: source.schemaName === options.schema ? 'noop' : options.apply ? 'pending' : 'planned', rollback: 'not-needed' };
  if (!compatible && !options.allowIncompatible) fail('INCOMPATIBLE_GRAPH', 'incompatible artifact graph (use --allow-incompatible to acknowledge; artifacts will not migrate)', data, mutation);
  if (!options.apply || source.schemaName === options.schema) return { data, mutation };
  const temporary = `${metadata}.${crypto.randomUUID()}.tmp`;
  let committedIdentity;
  try {
    const descriptor = fs.openSync(temporary, 'wx', info.mode & 0o7777);
    try {
      fs.writeFileSync(descriptor, patch.updated);
      fs.fchmodSync(descriptor, info.mode & 0o7777);
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    injectRace(source, metadata, patch.original);
    verifyPath(target, source.changeRoot);
    verifyPath(target, metadata, 'file');
    if (!sameFile(metadata, originalIdentity, patch.original)) fail('METADATA_CHANGED', 'change metadata changed during preflight', data, mutation);
    fs.renameSync(temporary, metadata);
    committedIdentity = identity(stat(metadata));
    mutation = { ...mutation, status: 'applied' };
    data.applied = true;
    try {
      const persisted = runJson(['status', '--change', options.change, '--json'], target);
      validateStatus(persisted, { change: options.change, target, changeRoot: source.changeRoot }, options.schema);
    } catch (postflightError) {
      let rollback;
      let rollbackIdentity;
      try {
        verifyPath(target, source.changeRoot);
        verifyPath(target, metadata, 'file');
        if (!sameFile(metadata, committedIdentity, patch.updated)) throw new Error('committed metadata ownership changed');
        rollback = `${metadata}.${crypto.randomUUID()}.tmp`;
        const descriptor = fs.openSync(rollback, 'wx', info.mode & 0o7777);
        rollbackIdentity = identity(fs.fstatSync(descriptor));
        try {
          fs.writeFileSync(descriptor, patch.original);
          fs.fchmodSync(descriptor, info.mode & 0o7777);
          fs.fsyncSync(descriptor);
        } finally { fs.closeSync(descriptor); }
        verifyPath(target, source.changeRoot);
        if (!sameFile(metadata, committedIdentity, patch.updated)) throw new Error('committed metadata ownership changed');
        fs.renameSync(rollback, metadata);
        mutation = { ...mutation, status: 'rolled-back', rollback: 'succeeded' };
        data.applied = false;
        fail(postflightError.code || 'POSTFLIGHT_FAILED', postflightError.message, data, mutation);
      } catch (rollbackError) {
        if (rollbackError instanceof HandoffError && rollbackError.mutation?.rollback === 'succeeded') throw rollbackError;
        mutation = {
          ...mutation,
          status: 'rollback-unresolved',
          rollback: 'unresolved',
          recovery: rollbackRecovery(rollback, rollbackIdentity, patch.original),
        };
        fail('ROLLBACK_UNRESOLVED', `${postflightError.message}; rollback unresolved: ${rollbackError.message}`, data, mutation);
      }
    }
    return { data, mutation };
  } finally {
    if (stat(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { HandoffError, graphDiff, handoff, normalizeGraph, setChangeSchemaLegacy };
