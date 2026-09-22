#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let snapshotApi = null;
function snapshotModule() {
  snapshotApi ||= require('./opsx-snapshot.js');
  return snapshotApi;
}
function createSnapshot(...args) {
  return snapshotModule().createSnapshot(...args);
}
function summarize(...args) {
  return snapshotModule().summarize(...args);
}
const { OpsxError, schemaNames, loadProfile, markerState, enableSchema, mutateSkills, readProjectSchema } = require('./opsx-skills.js');
const { handoff } = require('./change-schema.js');

let activeViewShutdown = null;

function handleStreamError(error) {
  if (error.code === 'EPIPE') {
    if (activeViewShutdown) activeViewShutdown();
    else process.exit(0);
    return;
  }
  throw error;
}

process.stdout.on('error', handleStreamError);
process.stderr.on('error', handleStreamError);

const root = path.resolve(__dirname, '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const schemaDirectory = path.join(root, 'openspec/schemas');
const versionFlags = new Set(['--version', '-v', '-V']);
const agents = new Set(['opencode', 'senpi', 'pi', 'atomic']);
const usage = 'Usage: opsx-schema [--json] | view | inspect [--change <id>] [--json] | doctor [--json] | list [--json] | enable <schema> [--yes] [--json] | handoff <change> <schema> [-t|--target <project>] [--apply] [--allow-incompatible] [--json] | skills inspect [--schema <name>] [--change <id>] [--profile <default|recommended|all>] [--json] | skills doctor [--json] | skills install|enable [--schema <name>] [--change <id>] [--profile <default|recommended|all>] [--force] [--apply] [--json] | skills disable [--schema <name>] [--change <id>] [--profile <default|recommended|all>] [--apply] [--json] | validate [schema] | verify | install <schema> [-t|--target <dir>] [-sk|--skills] [-a|--agents <opencode|senpi|pi|atomic>] [--agent <agent>] [--host <agent>] [-i|--activate] [--force] | set-change-schema <change> <schema> [-t|--target <project>] [--apply] [--allow-incompatible]';
const nativeUsage = `Usage: opsx-schema <command> [options]

Commands:
  inspect [--change <id>] [--json]   Read project state
  doctor [--json]                   Read diagnostics
  enable <schema> [--yes] [--json]  Preview or activate project schema
  skills <inspect|doctor|install|enable|disable> ...
  handoff <change> <schema> ...      Preview or apply change schema handoff
  view                              Open optional native TUI

Legacy-compatible commands:
  list, validate, verify, install, set-change-schema

Use 'openspec-schemas --help' for legacy command details.`;

function names() {
  return fs.readdirSync(schemaDirectory)
    .filter(name => fs.existsSync(path.join(schemaDirectory, name, 'schema.yaml')))
    .sort();
}

function writeJson(command, data, diagnostics = [], ok = true, mutations = []) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    command,
    ok,
    data,
    diagnostics,
    mutations,
    nextActions: [],
  })}\n`);
}

function parseInspect(args) {
  if (args.length === 0) return { change: null };
  if (args.length !== 2 || args[0] !== '--change') throw new Error(args[0] === '--change' ? 'missing or unexpected value: --change' : args[0]?.startsWith('-') ? `unknown option: ${args[0]}` : `unexpected argument: ${args[0]}`);
  if (!isName(args[1]) || args[1] === 'archive') throw new Error('invalid change id');
  return { change: args[1] };
}

function writeSummary(value) {
  process.stdout.write([
    `Project: ${value.project}`,
    `Schema: ${value.schema}`,
    `Changes: ${value.changes.active} active`,
    `Artifacts: ${value.artifacts.ready} ready, ${value.artifacts.blocked} blocked`,
    `Skills: ${value.skills.managed} managed, ${value.skills.enabled} enabled`,
    `Diagnostics: ${value.diagnostics.errors} errors, ${value.diagnostics.warnings} warnings`,
  ].join('\n') + '\n');
}

function usageError(message) {
  process.stderr.write(`Error: ${message}\n${usage}\n`);
  process.exitCode = 2;
}

function isName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function rejectOptions(args, allowed) {
  const seen = new Set();
  for (const arg of args) {
    if (!arg.startsWith('-')) throw new Error(`unexpected argument: ${arg}`);
    if (!allowed.has(arg)) throw new Error(`unknown option: ${arg}`);
    if (seen.has(arg)) throw new Error(`duplicate option: ${arg}`);
    seen.add(arg);
  }
}

function parseInstall(args) {
  const [schema, ...options] = args;
  if (!names().includes(schema)) throw new Error(`unknown schema: ${schema ?? ''}`);
  const valueOptions = new Map([['--target', 'target'], ['-t', 'target'], ['--host', 'agent'], ['--agents', 'agent'], ['--agent', 'agent'], ['-a', 'agent']]);
  const flagOptions = new Map([['--skills', 'skills'], ['-sk', 'skills'], ['--activate', 'activate'], ['-i', 'activate'], ['--force', 'force']]);
  const seen = new Set();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (valueOptions.has(option)) {
      const name = valueOptions.get(option);
      if (seen.has(name)) throw new Error(`duplicate option: ${name}`);
      seen.add(name);
      const value = options[++index];
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${option}`);
      if (name === 'agent' && !agents.has(value)) throw new Error(`unknown agent: ${value}`);
    } else if (flagOptions.has(option)) {
      const name = flagOptions.get(option);
      if (seen.has(name)) throw new Error(`duplicate option: ${name}`);
      seen.add(name);
    } else if (option.startsWith('-')) {
      throw new Error(`unknown option: ${option}`);
    } else {
      throw new Error(`unexpected argument: ${option}`);
    }
  }
  if (seen.has('agent') && schema !== 'compound-intent-driven') throw new Error('agent adapters require compound-intent-driven');
}

function parseSetChangeSchema(args) {
  const [change, schema, ...options] = args;
  if (!isName(change) || change === 'archive' || !isName(schema)) throw new Error('expected change and schema names');
  const seen = new Set();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const key = option === '-t' ? '--target' : option;
    if (!['--target', '--apply', '--allow-incompatible'].includes(key)) throw new Error(option.startsWith('-') ? `unknown option: ${option}` : `unexpected argument: ${option}`);
    if (seen.has(key)) throw new Error(`duplicate option: ${key}`);
    seen.add(key);
    if (key === '--target') {
      const value = options[++index];
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${option}`);
    }
  }
}

function parseHandoff(args) {
  const [change, schema, ...options] = args;
  if (!isName(change) || change === 'archive' || !isName(schema)) throw new Error('expected change and schema names');
  const parsed = { change, schema, target: process.cwd(), apply: false, allowIncompatible: false };
  const seen = new Set();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const key = option === '-t' ? '--target' : option;
    if (!['--target', '--apply', '--allow-incompatible'].includes(key)) throw new Error(option.startsWith('-') ? `unknown option: ${option}` : `unexpected argument: ${option}`);
    if (seen.has(key)) throw new Error(`duplicate option: ${key}`);
    seen.add(key);
    if (key === '--target') {
      const value = options[++index];
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${option}`);
      parsed.target = path.resolve(value);
    } else if (key === '--apply') parsed.apply = true;
    else parsed.allowIncompatible = true;
  }
  return parsed;
}

function parseEnable(args) {
  const [schema, ...options] = args;
  if (!isName(schema)) throw new Error('expected schema name');
  rejectOptions(options, new Set(['--yes']));
  return { schema, apply: options.includes('--yes') };
}

function parseSkills(args) {
  const [verb, ...options] = args;
  if (!['inspect', 'doctor', 'install', 'enable', 'disable'].includes(verb)) throw new Error(`unknown skills command: ${verb ?? ''}`);
  if (verb === 'doctor') { rejectOptions(options, new Set()); return { verb }; }
  const values = new Set(['--schema', '--change', '--profile']);
  const flags = new Set(verb === 'inspect' ? [] : verb === 'disable' ? ['--apply'] : ['--force', '--apply']);
  const parsed = { verb, schema: null, change: null, profile: 'default', force: false, apply: false };
  const seen = new Set();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (values.has(option)) {
      if (seen.has(option)) throw new Error(`duplicate option: ${option}`);
      seen.add(option);
      const value = options[++index];
      if (!value || value.startsWith('-')) throw new Error(`missing value: ${option}`);
      if (option === '--profile') {
        if (!['default', 'recommended', 'all'].includes(value)) throw new Error(`invalid profile: ${value}`);
        parsed.profile = value;
      } else {
        if (!isName(value) || (option === '--change' && value === 'archive')) throw new Error(`invalid value: ${option}`);
        parsed[option.slice(2)] = value;
      }
    } else if (flags.has(option)) {
      if (seen.has(option)) throw new Error(`duplicate option: ${option}`);
      seen.add(option);
      parsed[option.slice(2)] = true;
    } else throw new Error(option.startsWith('-') ? `unknown option: ${option}` : `unexpected argument: ${option}`);
  }
  if (parsed.schema && parsed.change) throw new Error('--schema and --change are mutually exclusive');
  return parsed;
}

function parse(args) {
  if (args.length === 0) return { command: 'summary', json: false };
  if (args.length === 1 && args[0] === '--json') return { command: 'summary', json: true };
  if (args.length === 1 && versionFlags.has(args[0])) return { command: 'version', json: false };
  const [command, ...rest] = args;
  if (command === '--help') {
    if (rest.length) throw new Error(`unexpected argument: ${rest[0]}`);
    return { command, json: false };
  }
  if (command.startsWith('-')) throw new Error(`unknown option: ${command}`);
  const json = rest.at(-1) === '--json';
  const commandArgs = json ? rest.slice(0, -1) : rest;
  if (rest.includes('--json') && !json) throw new Error('option --json must follow command arguments');
  if (command === 'view') {
    if (json) throw new Error('option --json is not supported for command: view');
    if (commandArgs.length) throw new Error(`unexpected argument: ${commandArgs[0]}`);
    return { command, json: false };
  }
  if (command === 'list') {
    rejectOptions(commandArgs, new Set());
    return { command, json };
  }
  if (command === 'inspect') return { command, json, ...parseInspect(commandArgs) };
  if (command === 'doctor') {
    rejectOptions(commandArgs, new Set());
    return { command, json };
  }
  if (command === 'enable') return { command, json, ...parseEnable(commandArgs) };
  if (command === 'skills') return { command, json, ...parseSkills(commandArgs) };
  if (command === 'handoff') return { command, json, ...parseHandoff(commandArgs) };
  if (json) throw new Error(`--json is not supported for command: ${command}`);
  if (command === 'validate') {
    if (commandArgs.length > 1) throw new Error(`unexpected argument: ${commandArgs[1]}`);
    if (commandArgs[0] && !names().includes(commandArgs[0])) throw new Error(`unknown schema: ${commandArgs[0]}`);
  } else if (command === 'verify') {
    rejectOptions(commandArgs, new Set());
  } else if (command === 'install') {
    parseInstall(commandArgs);
  } else if (command === 'set-change-schema') {
    parseSetChangeSchema(commandArgs);
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  return { command, json: false };
}

function failure(command, error, json) {
  const diagnostic = { code: error.code || 'OPERATION_FAILED', severity: 'error', message: error.message, help: null };
  if (json) writeJson(command, null, [diagnostic], false);
  else process.stderr.write(`opsx-schema: ${error.message}\n`);
  process.exitCode = 1;
}

function selectedContext(parsed) {
  if (parsed.schema) return { projectRoot: process.cwd(), schema: parsed.schema };
  if (parsed.change) {
    const snapshot = createSnapshot(parsed.change);
    const change = snapshot.changes.find(item => item.id === parsed.change);
    if (!snapshot.root || !change?.schemaName || snapshot.diagnostics.some(item => item.severity === 'error')) throw new OpsxError('SCHEMA_UNRESOLVED', `Cannot resolve schema for change '${parsed.change}'.`);
    return { projectRoot: snapshot.root.path, schema: change.schemaName };
  }
  const snapshot = createSnapshot();
  if (!snapshot.root || snapshot.diagnostics.some(item => item.severity === 'error')) throw new OpsxError('SCHEMA_UNRESOLVED', 'Cannot resolve project default schema.');
  return { projectRoot: snapshot.root.path, schema: readProjectSchema(snapshot.root.path).schema };
}

function runSkills(parsed) {
  const command = `skills ${parsed.verb}`;
  try {
    if (parsed.verb === 'doctor') {
      const snapshot = createSnapshot();
      if (!snapshot.root) throw new OpsxError('PROJECT_UNAVAILABLE', 'OpenSpec project unavailable.');
      const state = markerState(snapshot.root.path, packageManifest.version, root);
      const ok = !state.diagnostics.some(item => item.severity === 'error');
      if (parsed.json) writeJson(command, state, state.diagnostics, ok);
      else process.stdout.write(`Skills: ${state.managed ?? 'unknown'} managed, ${state.enabled ?? 'unknown'} enabled\n`);
      process.exitCode = ok ? 0 : 1;
      return;
    }
    const context = selectedContext(parsed);
    if (parsed.verb === 'inspect') {
      const resources = loadProfile(root, context.schema, parsed.profile);
      const state = markerState(context.projectRoot, packageManifest.version, root);
      const data = { schema: context.schema, profile: parsed.profile, resources, state };
      const ok = !state.diagnostics.some(item => item.severity === 'error');
      if (parsed.json) writeJson(command, data, state.diagnostics, ok);
      else process.stdout.write(`${context.schema}:${parsed.profile}: ${resources.length} resources\n`);
      process.exitCode = ok ? 0 : 1;
      return;
    }
    if (!parsed.apply) {
      const resources = loadProfile(root, context.schema, parsed.profile);
      const data = { applied: false, schema: context.schema, profile: parsed.profile, resources };
      const mutations = [{ operation: parsed.verb, status: 'planned', schema: context.schema, profile: parsed.profile }];
      if (parsed.json) writeJson(command, data, [], true, mutations);
      else process.stdout.write(`Dry run: ${parsed.verb} ${context.schema}:${parsed.profile} (${resources.length} resources)\n`);
      return;
    }
    const result = mutateSkills({ projectRoot: context.projectRoot, packageRoot: root, packageVersion: packageManifest.version, schema: context.schema, profile: parsed.profile, operation: parsed.verb === 'disable' ? 'disable' : 'install', force: parsed.force });
    const data = { applied: result.applied, schema: context.schema, profile: parsed.profile, resources: result.resources };
    if (parsed.json) writeJson(command, data, [], true, [result.mutation]);
    else process.stdout.write(`${result.mutation.status}: ${parsed.verb} ${context.schema}:${parsed.profile}\n`);
  } catch (error) { failure(command, error, parsed.json); }
}

function writeReadResult(command, parsed) {
  const snapshot = createSnapshot(parsed.change);
  const ok = snapshot.root !== null && !snapshot.diagnostics.some(item => item.severity === 'error');
  if (parsed.json) writeJson(command, snapshot, snapshot.diagnostics, ok);
  else {
    const lines = snapshot.root ? [`Project: ${snapshot.root.path}`, `Changes: ${snapshot.changes.length}`] : ['Project: unavailable'];
    for (const change of snapshot.changes) lines.push(`Change: ${change.id} (${change.complete ? 'complete' : 'incomplete'})`);
    for (const item of snapshot.diagnostics) lines.push(`${item.severity.toUpperCase()} ${item.code}: ${item.message}`);
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  process.exitCode = ok ? 0 : 1;
}

function runLegacy(args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'openspec-schemas.js'), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function graphLine(prefix, artifact) {
  return `${prefix}: ${artifact.id} [${artifact.outputPath}] requires ${artifact.requires.length ? artifact.requires.join(', ') : 'none'}`;
}

function runHandoff(parsed) {
  try {
    const result = handoff(parsed);
    if (parsed.json) writeJson('handoff', result.data, [], true, [result.mutation]);
    else {
      const lines = [
        `Handoff: ${parsed.change}: ${result.data.source.schema} -> ${result.data.target.schema}`,
        `Project: ${result.data.source.projectRoot}`,
        `Change root: ${result.data.source.changeRoot}`,
        `Compatibility: ${result.data.compatibility.compatible ? 'compatible' : `incompatible${result.data.compatibility.acknowledged ? ' (acknowledged)' : ''}`}`,
        ...result.data.graphDiff.added.map(item => graphLine('Added', item)),
        ...result.data.graphDiff.removed.map(item => graphLine('Removed', item)),
        ...result.data.graphDiff.changed.map(item => `Changed: ${item.id} [${item.source.outputPath}] requires ${item.source.requires.length ? item.source.requires.join(', ') : 'none'} -> [${item.target.outputPath}] requires ${item.target.requires.length ? item.target.requires.join(', ') : 'none'}`),
        `Mutation: ${result.mutation.status}`,
        `Applied: ${result.data.applied}`,
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
    }
  } catch (error) {
    if (parsed.json) {
      const diagnostic = { code: error.code || 'OPERATION_FAILED', severity: 'error', message: error.message, help: null };
      writeJson('handoff', error.data || null, [diagnostic], false, error.mutation ? [error.mutation] : []);
      process.exitCode = 1;
    } else failure('handoff', error, false);
  }
}

function main() {
  let parsed;
  try {
    parsed = parse(process.argv.slice(2));
  } catch (error) {
    usageError(error.message);
    return;
  }
  if (parsed.command === 'version') {
    process.stdout.write(`${packageManifest.version}\n`);
  } else if (parsed.command === 'summary') {
    const snapshot = createSnapshot();
    const value = summarize(snapshot);
    const ok = snapshot.root !== null && !snapshot.diagnostics.some(item => item.severity === 'error');
    if (parsed.json) {
      writeJson('summary', value, snapshot.diagnostics, ok);
      process.exitCode = ok ? 0 : 1;
    } else writeSummary(value);
  } else if (parsed.command === 'list' && parsed.json) {
    writeJson('list', { schemas: names() });
  } else if (parsed.command === 'inspect' || parsed.command === 'doctor') {
    writeReadResult(parsed.command, parsed);
  } else if (parsed.command === 'enable') {
    try {
      if (!schemaNames(root).includes(parsed.schema)) throw new OpsxError('SCHEMA_UNKNOWN', `Unknown schema: ${parsed.schema}`);
      const snapshot = createSnapshot();
      if (!snapshot.root?.path || !snapshot.schemas.some(item => item.name === parsed.schema)) throw new OpsxError('SCHEMA_UNRESOLVED', `Schema is not resolved by OpenSpec: ${parsed.schema}`);
      const result = enableSchema(snapshot.root.path, parsed.schema, parsed.apply);
      if (parsed.json) writeJson('enable', { applied: result.applied, previous: result.previous, schema: result.schema }, [], true, [result.mutation]);
      else process.stdout.write(`${result.mutation.status}: enable ${result.schema}\n`);
    } catch (error) { failure('enable', error, parsed.json); }
  } else if (parsed.command === 'skills') {
    runSkills(parsed);
  } else if (parsed.command === 'handoff') {
    runHandoff(parsed);
  } else if (parsed.command === 'view') {
    const { runView, setViewShutdown } = require('./opsx-view.js');
    try {
      runView({ setActiveShutdown: shutdown => { activeViewShutdown = shutdown; setViewShutdown(shutdown); } })
        .then(code => { activeViewShutdown = null; process.exitCode = code; })
        .catch(error => { activeViewShutdown = null; process.stderr.write(`opsx-schema view: ${error.message}\n`); process.exitCode = 1; });
    } catch (error) {
      activeViewShutdown = null;
      process.stderr.write(`opsx-schema view: ${error.message}\n`);
      process.exitCode = 1;
    }
  } else if (parsed.command === '--help') {
    process.stdout.write(`${nativeUsage}\n`);
  } else {
    runLegacy(process.argv.slice(2));
  }
}

main();
