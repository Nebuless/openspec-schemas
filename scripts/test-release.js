'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schemas-release-'));
const designSchema = 'intent-driven-design';
const designSchemaFiles = ['README.md', 'schema.yaml', 'skills.txt', 'templates/adr.md', 'templates/design.md', 'templates/journey.md', 'templates/proposal.md', 'templates/spec.md', 'templates/tasks.md'].map(file => `openspec/schemas/${designSchema}/${file}`);
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode: 0o755 }); }
function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
}
function ok(result) { assert.equal(result.status, 0, result.stderr + result.stdout); }
try {
  const tools = path.join(tmp, 'tools');
  write(path.join(tools, 'openspec'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.CALL_LOG) fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === 'status') {
  if (process.env.STATUS_FAIL) process.exit(1);
  const postflight = !args.includes('--schema') && process.env.STATUS_METADATA && fs.readFileSync(process.env.STATUS_METADATA, 'utf8') !== process.env.STATUS_ORIGINAL;
  if (postflight && process.env.POSTFLIGHT_FAIL) process.exit(1);
  process.stdout.write(postflight ? (process.env.POSTFLIGHT_STATUS ?? process.env.TARGET_STATUS) : (process.env[args.includes('--schema') ? 'TARGET_STATUS' : 'SOURCE_STATUS'] || '{}'));
} else process.exit(Number(process.env.VALIDATION_STATUS || 0));
`);
  write(path.join(tools, 'git'), '#!/bin/sh\nif [ "$1" = clone ]; then\n  destination=\n  for arg; do destination=$arg; done\n  mkdir -p "$destination/.agents/skills/openspec-git-discipline"\n  exit 0\nfi\nif [ "$1" = -C ] && [ "$3" = rev-parse ]; then\n  printf "%s\\n" 0123456789012345678901234567890123456789\n  exit 0\nfi\nif [ "$1" = ls-files ]; then\n  command -p git "$@"\n  exit $?\nfi\nexit 1\n');
  const env = { ...process.env, PATH: `${tools}:${process.env.PATH}` };
  const cli = (args, overrides = {}) => run(process.execPath, [path.join(root, 'bin/openspec-schemas.js'), ...args], { env: { ...env, ...overrides } });
  const listed = cli(['list'], { PATH: tmp });
  ok(listed); assert.equal(listed.stdout.split('\n').filter(name => name === designSchema).length, 1);
  ok(cli(['validate']));
  ok(cli(['verify']));
  ok(cli(['validate', designSchema]));
  ok(cli(['validate', 'minimalist']));
  assert.notEqual(cli(['validate', 'missing']).status, 0);
  assert.notEqual(cli(['validate', 'minimalist', 'event-driven']).status, 0);
  assert.notEqual(cli(['verify', 'minimalist']).status, 0);
  const target = path.join(tmp, 'project with spaces');
  const install = ['install', 'minimalist', '--target', target];
  assert.notEqual(cli(install, { PATH: tmp }).status, 0);
  assert.equal(fs.existsSync(target), false);
  assert.notEqual(cli(install, { VALIDATION_STATUS: '1' }).status, 0);
  assert.equal(fs.existsSync(target), false);
  assert.notEqual(cli([...install, '--activate']).status, 0);
  assert.equal(fs.existsSync(target), false);
  ok(cli(install));
  assert.notEqual(cli(['install', 'minimalist', '-t']).status, 0);
  assert.notEqual(cli(install).status, 0);
  const config = path.join(target, 'openspec/config.yaml');
  write(config, 'schema: old # keep\r\ncontext: |\r\n  unchanged\r\n');
  ok(cli([...install, '--force', '--activate']));
  assert.equal(fs.readFileSync(config, 'utf8'), 'schema: minimalist # keep\r\ncontext: |\r\n  unchanged\r\n');
  write(config, 'schema: old\nschema: duplicate\n');
  assert.notEqual(cli([...install, '--force', '--activate']).status, 0);
  assert.notEqual(cli(['install', '../minimalist']).status, 0);
  assert.notEqual(cli([...install, '--unknown']).status, 0);
  const shortTarget = path.join(tmp, 'short target');
  ok(cli(['install', 'minimalist', '-t', shortTarget]));
  assert.notEqual(cli(['install', 'minimalist', '-t', '-i']).status, 0);
  const shortActivation = path.join(tmp, 'short activation');
  write(path.join(shortActivation, 'openspec/config.yaml'), 'schema: old\n');
  ok(cli(['install', 'minimalist', '-t', shortActivation, '-i']));
  assert.equal(fs.readFileSync(path.join(shortActivation, 'openspec/config.yaml'), 'utf8'), 'schema: minimalist\n');
  const shortSkills = path.join(tmp, 'short skills');
  ok(cli(['install', 'minimalist', '-t', shortSkills, '-sk']));
  assert.equal(fs.existsSync(path.join(shortSkills, '.agents/skills')), true);
  const adapterTarget = path.join(tmp, 'adapter project');
  write(path.join(adapterTarget, '.pi/prompts/opsx-ce-plan.md'), 'existing');
  const adapters = ['install', 'compound-intent-driven', '--target', adapterTarget, '--host', 'pi'];
  assert.notEqual(cli(adapters).status, 0);
  assert.equal(fs.existsSync(path.join(adapterTarget, 'openspec')), false);
  ok(cli([...adapters, '--force']));
  assert.match(fs.readFileSync(path.join(adapterTarget, '.pi/prompts/opsx-ce-plan.md'), 'utf8'), /openspec/);
  const agentTarget = path.join(tmp, 'agent project');
  ok(cli(['install', 'compound-intent-driven', '-t', agentTarget, '-a', 'pi']));
  assert.match(fs.readFileSync(path.join(agentTarget, '.pi/prompts/opsx-ce-plan.md'), 'utf8'), /openspec/);
  const agentsTarget = path.join(tmp, 'agents project');
  ok(cli(['install', 'compound-intent-driven', '-t', agentsTarget, '--agents', 'atomic']));
  assert.match(fs.readFileSync(path.join(agentsTarget, '.atomic/prompts/opsx-ce-plan.md'), 'utf8'), /openspec/);
  const agentAliasTarget = path.join(tmp, 'agent alias project');
  ok(cli(['install', 'compound-intent-driven', '-t', agentAliasTarget, '--agent', 'opencode']));
  assert.match(fs.readFileSync(path.join(agentAliasTarget, '.opencode/commands/opsx-ce-plan.md'), 'utf8'), /openspec/);
  assert.notEqual(cli(['install', 'minimalist', '-a', 'pi']).status, 0);
  assert.notEqual(cli(['install', 'compound-intent-driven', '-a']).status, 0);
  assert.notEqual(cli(['install', 'compound-intent-driven', '-a', 'invalid']).status, 0);
  assert.notEqual(cli(['install', 'compound-intent-driven', '-a', 'pi', '--host', 'atomic']).status, 0);
  const project = path.join(tmp, 'switch project');
  const changeRoot = path.join(project, 'openspec/changes/authoritative-root');
  const metadata = path.join(changeRoot, '.openspec.yaml');
  const original = '# keep\r\nschema: old  # pinned\r\ncreated: 2026-01-01\r\ncontext: |\r\n  schema: untouched\r\n';
  write(metadata, original);
  fs.chmodSync(metadata, 0o640);
  write(path.join(project, 'openspec/config.yaml'), 'schema: project-default\n');
  write(path.join(changeRoot, 'proposal.md'), 'existing artifact\n');
  const artifact = { id: 'proposal', outputPath: 'proposal.md', status: 'done', requires: [] };
  const source = { changeName: 'example', changeRoot, schemaName: 'old', artifacts: [artifact] };
  const destination = { ...source, schemaName: 'custom-local' };
  const statusEnv = { SOURCE_STATUS: JSON.stringify(source), TARGET_STATUS: JSON.stringify(destination), STATUS_METADATA: metadata, STATUS_ORIGINAL: original };
  const switchArgs = ['set-change-schema', 'example', 'custom-local', '-t', project];
  const snapshot = directory => fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const info = fs.lstatSync(file);
    return [name, info.mode, info.isSymbolicLink() ? fs.readlinkSync(file) : info.isDirectory() ? snapshot(file) : fs.readFileSync(file).toString('hex')];
  });
  const before = snapshot(project);
  const log = path.join(tmp, 'status-calls');
  ok(cli(switchArgs, { ...statusEnv, CALL_LOG: log }));
  assert.deepEqual(snapshot(project), before);
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), [
    { args: ['status', '--change', 'example', '--json'], cwd: project },
    { args: ['status', '--change', 'example', '--json', '--schema', 'custom-local'], cwd: project },
    { args: ['schema', 'validate', 'custom-local'], cwd: project },
  ]);
  const rejected = (args = switchArgs, overrides = {}) => {
    const prior = snapshot(project);
    assert.notEqual(cli(args, { ...statusEnv, ...overrides }).status, 0);
    assert.deepEqual(snapshot(project), prior);
  };
  for (const overrides of [{ POSTFLIGHT_FAIL: '1' }, { POSTFLIGHT_STATUS: JSON.stringify(source) }, { POSTFLIGHT_STATUS: JSON.stringify({ ...destination, changeRoot: tmp }) }, { POSTFLIGHT_STATUS: '{' }, { POSTFLIGHT_STATUS: '{}' }]) {
    fs.writeFileSync(log, '');
    rejected([...switchArgs, '--apply'], { ...overrides, CALL_LOG: log });
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), [
      { args: ['status', '--change', 'example', '--json'], cwd: project },
      { args: ['status', '--change', 'example', '--json', '--schema', 'custom-local'], cwd: project },
      { args: ['schema', 'validate', 'custom-local'], cwd: project },
      { args: ['status', '--change', 'example', '--json'], cwd: project },
    ]);
  }
  for (const extra of [['--unknown'], ['extra'], ['--apply', '--apply'], ['--allow-incompatible', '--allow-incompatible'], ['--target', project], ['-t'], ['--target', '--apply']]) rejected([...switchArgs, ...extra]);
  for (const args of [[], ['example'], ['../example', 'custom-local'], ['archive', 'custom-local'], ['example', '../schema'], ['--apply', 'custom-local']]) rejected(['set-change-schema', ...args, '-t', project]);
  for (const overrides of [{ PATH: tmp }, { STATUS_FAIL: '1' }, { VALIDATION_STATUS: '1' }, { SOURCE_STATUS: '{' }, { TARGET_STATUS: '{}' }]) rejected([...switchArgs, '--apply'], overrides);
  for (const status of ['ready', 'blocked']) {
    ok(cli([...switchArgs, '--apply'], { ...statusEnv, TARGET_STATUS: JSON.stringify({ ...destination, artifacts: [{ ...artifact, status }] }) }));
    assert.equal(fs.readFileSync(metadata, 'utf8'), original.replace('schema: old', 'schema: custom-local'));
    write(metadata, original);
    fs.chmodSync(metadata, 0o640);
  }
  for (const artifacts of [[], [{ ...artifact, id: 'renamed' }], [{ ...artifact, outputPath: 'other.md' }], [{ ...artifact, status: 'invalid' }], [{ ...artifact, requires: ['proposal'] }], [{ ...artifact, dependencies: ['proposal'] }], [{ ...artifact, missingDeps: ['proposal'] }], [artifact, artifact]]) {
    rejected([...switchArgs, '--apply'], { TARGET_STATUS: JSON.stringify({ ...destination, artifacts }) });
  }
  for (const unsafeRoot of [undefined, path.join(tmp, 'outside'), path.join(project, 'openspec/changes-other/example'), path.join(project, 'openspec/changes/archive/example'), path.join(project, 'openspec/changes/missing'), path.join(project, 'openspec/changes')]) {
    rejected([...switchArgs, '--apply'], { SOURCE_STATUS: JSON.stringify({ ...source, changeRoot: unsafeRoot }) });
  }
  rejected([...switchArgs, '--apply'], { TARGET_STATUS: JSON.stringify({ ...destination, changeRoot: tmp }) });
  for (const text of ['created: today\n', 'schema: old\nschema: old\n', '"schema": old\n', 'schema: "old"\n', 'schema: old\n---\nschema: old\n', 'schema: old\n<<: *defaults\n', 'schema: wrong\n', 'schema: old\n\'schema\': other\n', 'schema: old\n"sch\\u0065ma": other\n', 'schema: old\n? schema\n: other\n']) {
    write(metadata, text);
    rejected([...switchArgs, '--apply', '--allow-incompatible']);
  }
  fs.unlinkSync(metadata);
  rejected([...switchArgs, '--apply']);
  fs.mkdirSync(metadata);
  rejected([...switchArgs, '--apply']);
  fs.rmdirSync(metadata);
  fs.symlinkSync(path.join(project, 'openspec/config.yaml'), metadata);
  rejected([...switchArgs, '--apply']);
  fs.unlinkSync(metadata);
  write(metadata, original);
  fs.chmodSync(metadata, 0o640);
  const linkedRoot = path.join(project, 'openspec/changes/linked');
  fs.symlinkSync(changeRoot, linkedRoot);
  rejected([...switchArgs, '--apply'], { SOURCE_STATUS: JSON.stringify({ ...source, changeRoot: linkedRoot }) });
  fs.unlinkSync(linkedRoot);
  const incompatible = { ...statusEnv, TARGET_STATUS: JSON.stringify({ ...destination, artifacts: [] }) };
  ok(cli([...switchArgs, '--allow-incompatible'], incompatible));
  assert.deepEqual(snapshot(project), before);
  ok(cli([...switchArgs, '--apply', '--allow-incompatible'], incompatible));
  assert.equal(fs.readFileSync(metadata, 'utf8'), original.replace('schema: old', 'schema: custom-local'));
  assert.equal(fs.statSync(metadata).mode & 0o777, 0o640);
  const applied = snapshot(project);
  ok(cli([...switchArgs, '--apply'], { SOURCE_STATUS: JSON.stringify(destination), TARGET_STATUS: JSON.stringify(destination) }));
  assert.deepEqual(snapshot(project), applied);
  write(metadata, original);
  fs.chmodSync(metadata, 0o640);
  ok(cli([...switchArgs, '--apply'], statusEnv));
  assert.deepEqual(snapshot(project), applied);
  write(metadata, original);
  fs.chmodSync(metadata, 0o640);
  assert.deepEqual(snapshot(project), before);
  const packageFiles = new Set(['package.json', 'README.md', 'AGENT_INSTALL.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE']);
  const tracked = run('git', ['ls-files', '-z']);
  ok(tracked);
  for (const file of tracked.stdout.split('\0').filter(Boolean)) {
    if (
      file.startsWith('bin/') ||
      file === 'scripts/install-schema-skills.sh' ||
      file === 'scripts/install-compound-adapters.sh' ||
      file.startsWith('openspec/schemas/') ||
      /^\.(?:opencode\/commands|senpi\/prompts|pi\/prompts|atomic\/prompts)\/opsx-ce-.*\.md$/.test(file)
    ) packageFiles.add(file);
  }
  for (const file of designSchemaFiles) packageFiles.add(file);
  const files = [...packageFiles];
  assert.deepEqual(files.filter(file => file.startsWith(`openspec/schemas/${designSchema}/`)).sort(), designSchemaFiles.toSorted()); assert.deepEqual(designSchemaFiles.filter(file => !fs.statSync(path.join(root, file)).isFile()), []);
  assert(files.includes('bin/openspec-schemas.js')); assert(files.includes('.pi/prompts/opsx-ce-plan.md')); assert(files.includes('CHANGELOG.md'));
  assert(!files.some(file => /^scripts\/(lint-|test-|quality)/.test(file))); assert(!files.some(file => /(^\.omo\/|node_modules|package-lock|^openspec\/changes\/|^\.opencode\/package.json|^\.(?:claude|codex|omp)\/|^openspec\/schemas\/intent-driven-design\/(?:assets|external|repos|research)\/)/.test(file))); assert(!files.some(file => /^\.(?:opencode\/commands|senpi\/prompts|pi\/prompts|atomic\/prompts)\/(?!opsx-ce-)/.test(file)));
  const extracted = path.join(tmp, 'package');
  for (const file of files) { const output = path.join(extracted, file); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(path.join(root, file), output); }
  const packedCli = args => run(process.execPath, [path.join(extracted, 'bin/openspec-schemas.js'), ...args], { env });
  const packedList = packedCli(['list']);
  ok(packedList); assert.equal(packedList.stdout.split('\n').filter(name => name === designSchema).length, 1);
  const packedTarget = path.join(tmp, 'packed-target');
  write(path.join(packedTarget, 'openspec/config.yaml'), 'schema: minimalist\n'); write(path.join(packedTarget, 'nested/config.yaml'), 'schema: unrelated\n'); write(path.join(packedTarget, 'sentinel'), 'keep');
  ok(packedCli(['install', designSchema, '--target', packedTarget, '--activate']));
  assert.equal(fs.readFileSync(path.join(packedTarget, 'openspec/config.yaml'), 'utf8'), `schema: ${designSchema}\n`); assert.equal(fs.readFileSync(path.join(packedTarget, 'nested/config.yaml'), 'utf8'), 'schema: unrelated\n'); assert.equal(fs.readFileSync(path.join(packedTarget, 'sentinel'), 'utf8'), 'keep');
  assert.deepEqual(designSchemaFiles.map(file => file.replace(`openspec/schemas/${designSchema}/`, '')).sort(), snapshot(path.join(packedTarget, 'openspec/schemas', designSchema)).flatMap(function paths(entry) {
    const [name, , value] = entry;
    return Array.isArray(value) ? value.flatMap(paths).map(file => `${name}/${file}`) : [name];
  }).sort());
  const collisionTarget = path.join(tmp, 'packed-collision');
  write(path.join(collisionTarget, `openspec/schemas/${designSchema}/schema.yaml`), 'old'); write(path.join(collisionTarget, 'sentinel'), 'keep');
  const collisionBefore = snapshot(collisionTarget);
  assert.notEqual(packedCli(['install', designSchema, '--target', collisionTarget]).status, 0); assert.deepEqual(snapshot(collisionTarget), collisionBefore);
  ok(packedCli(['install', designSchema, '--target', collisionTarget, '--force'])); assert.equal(fs.readFileSync(path.join(collisionTarget, 'sentinel'), 'utf8'), 'keep');
  const symlinkTarget = path.join(tmp, 'packed-symlink');
  write(path.join(symlinkTarget, 'sentinel'), 'keep'); fs.mkdirSync(path.join(symlinkTarget, 'openspec/schemas'), { recursive: true }); fs.symlinkSync(tmp, path.join(symlinkTarget, `openspec/schemas/${designSchema}`));
  const symlinkBefore = snapshot(symlinkTarget);
  assert.notEqual(packedCli(['install', designSchema, '--target', symlinkTarget, '--force']).status, 0); assert.deepEqual(snapshot(symlinkTarget), symlinkBefore); ok(run(process.execPath, [path.join(extracted, 'bin/openspec-schemas.js'), 'validate'], { env })); ok(run(process.execPath, [path.join(extracted, 'bin/openspec-schemas.js'), 'verify'], { env }));
  const fixture = path.join(tmp, 'quality');
  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  for (const file of ['quality.sh', 'install-git-hooks.sh', 'lint-markdown.js', 'update-changelog.js']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(fixture, 'scripts', file));
  write(path.join(fixture, 'scripts/test-ok.sh'), '#!/bin/sh\nexit "${TEST_STATUS:-0}"\n');
  write(path.join(fixture, 'scripts/test-release.js'), '');
  write(path.join(fixture, 'scripts/test-release-checks.js'), '');
  write(path.join(fixture, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n');
  write(path.join(fixture, 'openspec/schemas/example/schema.yaml'), '');
  write(path.join(tools, 'git'), '#!/bin/sh\nif [ "$1" = config ] && [ "$2" = --get ]; then printf "%s" "${HOOKS_PATH:-}"; fi\nexit 0\n');
  write(path.join(tools, 'qlty'), '#!/bin/sh\nexit "${QLTY_STATUS:-0}"\n');
  const quality = (args, overrides = {}) => run('/bin/sh', [path.join(fixture, 'scripts/quality.sh'), ...args], { env: { ...env, ...overrides } });
  ok(quality(['--require-qlty']));
  assert.notEqual(quality(['--bad']).status, 0);
  assert.notEqual(quality([], { TEST_STATUS: '1' }).status, 0);
  assert.notEqual(quality([], { QLTY_STATUS: '1' }).status, 0);
  ok(quality(['--skip-qlty'], { QLTY_STATUS: '1' }));
  ok(run('sh', [path.join(fixture, 'scripts/install-git-hooks.sh')], { env }));
  assert.notEqual(run('sh', [path.join(fixture, 'scripts/install-git-hooks.sh')], { env: { ...env, HOOKS_PATH: 'custom-hooks' } }).status, 0);
  fs.unlinkSync(path.join(tools, 'qlty'));
  fs.symlinkSync('/usr/bin/dirname', path.join(tools, 'dirname'));
  const missingQlty = quality(['--require-qlty'], { PATH: tools });
  assert.notEqual(missingQlty.status, 0);
  assert.match(missingQlty.stderr, /qlty required/);
  const missingHookTool = run('/bin/sh', [path.join(fixture, 'scripts/install-git-hooks.sh')], { env: { ...env, PATH: tools } });
  assert.notEqual(missingHookTool.status, 0);
  assert.match(missingHookTool.stderr, /qlty required/);
  fs.unlinkSync(path.join(tools, 'openspec'));
  assert.match(quality([], { PATH: tools }).stderr, /openspec required/);
  console.log('test-release: CLI, package file set, quality, hooks passed');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
