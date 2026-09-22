'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const packageRoot = path.resolve(__dirname, '..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
const { markerState } = require('./opsx-skills.js');

const statuses = new Set(['done', 'ready', 'blocked', 'skipped']);
const changeStatuses = new Set(['no-tasks', 'complete', 'in-progress']);
const timeout = 15000;
const maxBuffer = 1024 * 1024;
const maxOutput = 256 * 1024;

function diagnostic(severity, code, message, source, change) {
  const value = { severity, code, message, source };
  if (change) value.change = change;
  return value;
}

function run(args) {
  const source = `openspec ${args.join(' ')}`;
  const result = spawnSync('openspec', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
    maxBuffer,
    timeout,
  });
  if (result.error) {
    const codes = { ENOENT: 'openspec_missing', ETIMEDOUT: 'openspec_timeout', ENOBUFS: 'openspec_output_limit' };
    return { diagnostic: diagnostic('error', codes[result.error.code] ?? 'openspec_runtime', result.error.message, source) };
  }
  if (Buffer.byteLength(result.stdout) > maxOutput || Buffer.byteLength(result.stderr) > maxOutput) return { diagnostic: diagnostic('error', 'openspec_output_limit', 'OpenSpec output exceeded the capture limit.', source) };
  if (result.status !== 0) return { diagnostic: diagnostic('error', 'openspec_failed', `OpenSpec exited with status ${result.status}.`, source) };
  try {
    return { value: JSON.parse(result.stdout) };
  } catch {
    return { diagnostic: diagnostic('error', 'openspec_invalid_json', 'OpenSpec did not return one valid JSON document.', source) };
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function isAbsolute(value) {
  return typeof value === 'string' && path.isAbsolute(value);
}

function isSafeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).some(part => part === '..' || part === 'archive');
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function hasSymlink(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return true;
  let current = path.resolve(parent);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return false;
}

function isGlob(value) {
  return /[*?[\]{}]/.test(value);
}

function validateRoot(root, source, diagnostics) {
  if (!isObject(root) || !isAbsolute(root.path) || typeof root.source !== 'string') {
    diagnostics.push(diagnostic('error', 'invalid_root', 'OpenSpec root metadata is missing or malformed.', source));
    return null;
  }
  return root;
}

function validateUpstreamStatus(value, source, diagnostics) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('error', 'invalid_diagnostics', 'OpenSpec status diagnostics must be an array.', source));
    return;
  }
  for (const item of value) {
    if (!isObject(item) || !['error', 'warning'].includes(item.severity) || typeof item.code !== 'string' || typeof item.message !== 'string') {
      diagnostics.push(diagnostic('error', 'invalid_diagnostics', 'OpenSpec returned a malformed diagnostic.', source));
      continue;
    }
    diagnostics.push(diagnostic(item.severity, item.code, item.message, source));
  }
}

function validateList(value, diagnostics) {
  const source = 'openspec list --json';
  if (!isObject(value) || !Array.isArray(value.changes)) {
    diagnostics.push(diagnostic('error', 'invalid_list', 'OpenSpec change list is malformed.', source));
    return { root: null, changes: [] };
  }
  validateUpstreamStatus(value.status, source, diagnostics);
  if (value.root === null) return { root: null, changes: [] };
  const root = validateRoot(value.root, source, diagnostics);
  const seen = new Set();
  const changes = [];
  for (const change of value.changes) {
    if (!isObject(change) || !isName(change.name) || !Number.isInteger(change.completedTasks) || !Number.isInteger(change.totalTasks) || !changeStatuses.has(change.status)) {
      diagnostics.push(diagnostic('error', 'invalid_change', 'OpenSpec change-list record is malformed.', source));
      continue;
    }
    if (seen.has(change.name)) {
      diagnostics.push(diagnostic('error', 'duplicate_change', `Duplicate change id '${change.name}'.`, source, change.name));
      continue;
    }
    seen.add(change.name);
    changes.push(change);
  }
  changes.sort((left, right) => left.name.localeCompare(right.name));
  return { root, changes };
}

function validateSchemas(value, diagnostics) {
  const source = 'openspec schema which --all --json';
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('error', 'invalid_schemas', 'OpenSpec schema resolution data is malformed.', source));
    return [];
  }
  const seen = new Set();
  const schemas = [];
  for (const schema of value) {
    if (!isObject(schema) || !isName(schema.name) || typeof schema.source !== 'string' || !isAbsolute(schema.path) || !Array.isArray(schema.shadows) || schema.shadows.some(shadow => typeof shadow !== 'string')) {
      diagnostics.push(diagnostic('error', 'invalid_schema', 'OpenSpec schema record is malformed.', source));
      continue;
    }
    if (seen.has(schema.name)) {
      diagnostics.push(diagnostic('error', 'duplicate_schema', `Duplicate schema id '${schema.name}'.`, source));
      continue;
    }
    seen.add(schema.name);
    schemas.push(schema);
  }
  return schemas.sort((left, right) => left.name.localeCompare(right.name));
}

function validateArtifacts(value, changeRoot, source, diagnostics, change) {
  if (!Array.isArray(value.artifacts) || !isObject(value.artifactPaths)) {
    diagnostics.push(diagnostic('error', 'invalid_artifacts', 'Artifact metadata is missing or malformed.', source, change));
    return [];
  }
  const seen = new Set();
  const artifacts = [];
  for (const artifact of value.artifacts) {
    const pathData = isObject(artifact) ? value.artifactPaths[artifact.id] : null;
    const expectedOutput = isObject(artifact) && isSafeRelative(artifact.outputPath) ? path.resolve(changeRoot, artifact.outputPath) : null;
    const unsafeLink = isObject(pathData) && ((isAbsolute(pathData.resolvedOutputPath) && hasSymlink(changeRoot, pathData.resolvedOutputPath)) || (Array.isArray(pathData.existingOutputPaths) && pathData.existingOutputPaths.some(output => isAbsolute(output) && hasSymlink(changeRoot, output))));
    const valid = isObject(artifact) && isName(artifact.id) && isSafeRelative(artifact.outputPath) && statuses.has(artifact.status) && Array.isArray(artifact.requires) && artifact.requires.every(isName) && isObject(pathData) && pathData.outputPath === artifact.outputPath && isAbsolute(pathData.resolvedOutputPath) && path.resolve(pathData.resolvedOutputPath) === expectedOutput && isInside(changeRoot, pathData.resolvedOutputPath) && !unsafeLink && Array.isArray(pathData.existingOutputPaths) && pathData.existingOutputPaths.every(output => isAbsolute(output) && isInside(changeRoot, output));
    if (!valid) {
      diagnostics.push(diagnostic('error', unsafeLink ? 'unsafe_symlink' : 'invalid_artifact', 'Artifact metadata contains invalid types or unsafe paths.', source, change));
      continue;
    }
    if (seen.has(artifact.id)) {
      diagnostics.push(diagnostic('error', 'duplicate_artifact', `Duplicate artifact id '${artifact.id}'.`, source, change));
      continue;
    }
    seen.add(artifact.id);
    artifacts.push({ ...artifact, paths: pathData });
  }
  for (const artifact of artifacts) {
    if (artifact.requires.some(required => !seen.has(required))) diagnostics.push(diagnostic('error', 'invalid_dependency', `Artifact '${artifact.id}' has an unknown dependency.`, source, change));
    if (isGlob(artifact.outputPath)) {
      if (artifact.paths.existingOutputPaths.length === 0) diagnostics.push(diagnostic('warning', 'missing_concrete_specs', 'Specs artifact has no concrete existing output paths.', source, change));
      for (const output of artifact.paths.existingOutputPaths) {
        if (!fs.existsSync(output)) diagnostics.push(diagnostic('warning', 'missing_concrete_spec', `Concrete spec path does not exist: ${output}`, source, change));
        else if (!fs.statSync(output).isFile() || fs.statSync(output).size === 0) diagnostics.push(diagnostic('warning', 'empty_concrete_spec', `Concrete spec is missing content: ${output}`, source, change));
      }
    }
  }
  return artifacts;
}

function partialChange(listed) {
  return { id: listed.name, complete: false, listed, schemaName: null, planningHome: null, changeRoot: null, root: null, artifacts: [] };
}

function validateChange(value, listed, projectRoot, diagnostics) {
  const source = `openspec status --change ${listed.name} --json`;
  const partial = partialChange(listed);
  if (!isObject(value)) {
    diagnostics.push(diagnostic('error', 'invalid_status', 'OpenSpec change status is malformed.', source, listed.name));
    return partial;
  }
  validateUpstreamStatus(value.status, source, diagnostics);
  const planning = value.planningHome;
  const root = validateRoot(value.root, source, diagnostics);
  if (value.changeName !== listed.name || !isName(value.schemaName) || !isObject(planning) || !isAbsolute(planning.root) || !isAbsolute(planning.changesDir) || (planning.defaultSchema !== undefined && planning.defaultSchema !== null && !isName(planning.defaultSchema)) || !isAbsolute(value.changeRoot) || typeof value.isComplete !== 'boolean') {
    diagnostics.push(diagnostic('error', 'invalid_status', 'OpenSpec change status is missing required metadata.', source, listed.name));
    return partial;
  }
  const rootsMatch = root && path.resolve(root.path) === path.resolve(projectRoot) && path.resolve(planning.root) === path.resolve(projectRoot);
  const safeRoot = isInside(planning.changesDir, value.changeRoot) && !path.relative(planning.changesDir, value.changeRoot).split(path.sep).includes('archive') && fs.existsSync(value.changeRoot) && fs.lstatSync(value.changeRoot).isDirectory() && !hasSymlink(projectRoot, value.changeRoot);
  if (!rootsMatch) diagnostics.push(diagnostic('error', 'root_mismatch', 'Change root metadata conflicts with project root.', source, listed.name));
  if (!safeRoot) diagnostics.push(diagnostic('error', 'unsafe_change_root', 'Change root metadata is outside its authoritative changes root, archived, or symlinked.', source, listed.name));
  if (!rootsMatch || !safeRoot) return partial;
  const artifacts = validateArtifacts(value, value.changeRoot, source, diagnostics, listed.name);
  return { id: listed.name, complete: value.isComplete, listed, schemaName: value.schemaName, planningHome: planning, changeRoot: value.changeRoot, root, artifacts };
}

function createSnapshot(selectedChange) {
  const diagnostics = [];
  const listResult = run(['list', '--json']);
  if (listResult.diagnostic) return { root: null, schemas: [], changes: [], health: null, diagnostics: [listResult.diagnostic] };
  const list = validateList(listResult.value, diagnostics);
  if (!list.root) return { root: null, schemas: [], changes: [], health: null, diagnostics };

  const doctorResult = run(['doctor', '--json']);
  let health = null;
  if (doctorResult.diagnostic) diagnostics.push(doctorResult.diagnostic);
  else if (!isObject(doctorResult.value)) diagnostics.push(diagnostic('error', 'invalid_doctor', 'OpenSpec doctor data is malformed.', 'openspec doctor --json'));
  else {
    const root = validateRoot(doctorResult.value.root, 'openspec doctor --json', diagnostics);
    validateUpstreamStatus(doctorResult.value.status, 'openspec doctor --json', diagnostics);
    if (root && path.resolve(root.path) !== path.resolve(list.root.path)) diagnostics.push(diagnostic('error', 'root_mismatch', 'Doctor root conflicts with list root.', 'openspec doctor --json'));
    health = doctorResult.value;
  }

  const schemasResult = run(['schema', 'which', '--all', '--json']);
  const schemaDiagnosticCount = diagnostics.length;
  const schemas = schemasResult.diagnostic ? (diagnostics.push(schemasResult.diagnostic), []) : validateSchemas(schemasResult.value, diagnostics);
  const schemaInventoryValid = !schemasResult.diagnostic && Array.isArray(schemasResult.value) && diagnostics.length === schemaDiagnosticCount;
  const selected = selectedChange ? list.changes.filter(change => change.name === selectedChange) : list.changes;
  if (selectedChange && selected.length === 0) diagnostics.push(diagnostic('error', 'change_not_found', `Change '${selectedChange}' is not active.`, 'openspec list --json', selectedChange));
  const changes = selected.map(listed => {
    const result = run(['status', '--change', listed.name, '--json']);
    if (result.diagnostic) {
      diagnostics.push({ ...result.diagnostic, change: listed.name });
      return partialChange(listed);
    }
    return validateChange(result.value, listed, list.root.path, diagnostics);
  });
  if (schemaInventoryValid) {
    const resolvedSchemas = new Set(schemas.map(schema => schema.name));
    for (const change of changes) {
      if (change.schemaName && !resolvedSchemas.has(change.schemaName)) diagnostics.push(diagnostic('error', 'unresolved_schema', `Effective schema '${change.schemaName}' is absent from resolved schema inventory.`, 'openspec schema which --all --json', change.id));
    }
  }
  diagnostics.sort((left, right) => `${left.severity}\0${left.source}\0${left.change ?? ''}\0${left.code}\0${left.message}`.localeCompare(`${right.severity}\0${right.source}\0${right.change ?? ''}\0${right.code}\0${right.message}`));
  let config = null;
  try {
    const projectConfig = require('./opsx-skills.js').readProjectSchema(list.root.path);
    config = { valid: true, defaultSchema: projectConfig.schema };
  } catch (error) {
    diagnostics.push(diagnostic('warning', error.code || 'CONFIG_INVALID', error.message, 'openspec/config.yaml'));
  }
  const skills = markerState(list.root.path, packageVersion, packageRoot);
  diagnostics.push(...skills.diagnostics);
  diagnostics.sort((left, right) => `${left.severity}\0${left.source}\0${left.change ?? ''}\0${left.code}\0${left.message}`.localeCompare(`${right.severity}\0${right.source}\0${right.change ?? ''}\0${right.code}\0${right.message}`));
  return { root: list.root, schemas, changes, health, config, skills, diagnostics };
}

function summarize(snapshot) {
  const effective = [...new Set(snapshot.changes.map(change => change.schemaName).filter(Boolean))];
  const artifacts = snapshot.changes.flatMap(change => change.artifacts);
  return {
    project: snapshot.root ? snapshot.root.path : path.basename(process.cwd()) || process.cwd(),
    schema: effective.length === 1 ? effective[0] : effective.length > 1 ? 'mixed' : 'unknown',
    changes: { active: snapshot.changes.length },
    artifacts: { ready: artifacts.filter(artifact => artifact.status === 'ready').length, blocked: artifacts.filter(artifact => artifact.status === 'blocked').length },
    skills: { managed: snapshot.skills?.managed ?? 0, enabled: snapshot.skills?.enabled ?? 0 },
    diagnostics: { errors: snapshot.diagnostics.filter(item => item.severity === 'error').length, warnings: snapshot.diagnostics.filter(item => item.severity === 'warning').length },
  };
}

module.exports = { createSnapshot, summarize };
