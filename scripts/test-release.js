'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const testOpsxSchema = require('./test-opsx-schema.js');
const testOpsxSkills = require('./test-opsx-skills.js');
const testOpsxHandoff = require('./test-opsx-handoff.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schemas-release-'));
const designSchema = 'intent-driven-design';
const designSchemaFiles = ['README.md', 'mcp.yaml', 'schema.yaml', 'skills.txt', 'templates/adr.md', 'templates/design.md', 'templates/journey.md', 'templates/proposal.md', 'templates/spec.md', 'templates/tasks.md'].map(file => `openspec/schemas/${designSchema}/${file}`);
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode: 0o755 }); }
function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
}
function ok(result) { assert.equal(result.status, 0, result.stderr + result.stdout); }
const snapshot = directory => fs.readdirSync(directory).sort().map(name => {
  const file = path.join(directory, name);
  const info = fs.lstatSync(file);
  return [name, info.mode, info.isSymbolicLink() ? fs.readlinkSync(file) : info.isDirectory() ? snapshot(file) : fs.readFileSync(file).toString('hex')];
});
function packedFiles(archive) {
  const listing = run('tar', ['-tzf', archive]);
  ok(listing);
  return listing.stdout.split('\n').filter(Boolean).map(file => file.replace(/^package\//, ''));
}
try {
  testOpsxSchema(root);
  testOpsxSkills(root);
  testOpsxHandoff(root);
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
  const cli = (args, overrides = {}) => run(process.execPath, [path.join(root, 'bin/openspec-schemas.js'), ...args], { env: { ...env, ...overrides } }); const forceEpipe = path.join(tmp, 'force-epipe.js'); write(forceEpipe, `const stream = process[process.env.EPIPE_STREAM]; process.nextTick(() => { const error = new Error('forced stream error'); error.code = process.env.STREAM_ERROR_CODE; stream.emit('error', error); });\n`); for (const [launcher, stream] of [['openspec-schemas.js', 'stdout'], ['opsx-schema.js', 'stderr']]) { const result = run(process.execPath, ['--require', forceEpipe, path.join(root, 'bin', launcher), '--version'], { env: { ...env, EPIPE_STREAM: stream, STREAM_ERROR_CODE: 'EPIPE' } }); assert.equal(result.status, 0, result.stderr); assert.doesNotMatch(result.stderr, /Unhandled|forced stream error|\n\s+at /); } const streamFailure = run(process.execPath, ['--require', forceEpipe, path.join(root, 'bin/openspec-schemas.js'), '--version'], { env: { ...env, EPIPE_STREAM: 'stdout', STREAM_ERROR_CODE: 'ENOSPC' } }); assert.notEqual(streamFailure.status, 0); assert.match(streamFailure.stderr, /forced stream error/);
  const legacyUsage = cli([]); assert.equal(legacyUsage.status, 0); assert.match(legacyUsage.stdout, /^Usage: openspec-schemas /); assert.equal(legacyUsage.stderr, '');
  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); const opsxCli = args => run(process.execPath, [path.join(root, 'bin/opsx-schema.js'), ...args], { cwd: tmp, env: { ...env, PATH: tmp } }); const opsxFailures = []; const requireOpsx = (condition, message) => { if (!condition) opsxFailures.push(message); }; const strictFlagError = result => result.status === 2 && result.stdout === '' && /^Error: .+\nUsage: opsx-schema\b/m.test(result.stderr); assert.equal(strictFlagError({ status: 2, stdout: '', stderr: 'Success: accepted\n' }), false);
  requireOpsx(packageManifest.bin?.['opsx-schema'] === 'bin/opsx-schema.js', 'package bin maps opsx-schema to bin/opsx-schema.js'); requireOpsx(fs.existsSync(path.join(root, 'bin/opsx-schema.js')), 'bin/opsx-schema.js exists'); const opsxSummary = opsxCli([]); const summaryFields = [/^Project: .+$/m, /^Schema: .+$/m, /^Changes: \d+ active$/m, /^Artifacts: \d+ ready, \d+ blocked$/m, /^Skills: \d+ managed, \d+ enabled$/m, /^Diagnostics: \d+ errors?, \d+ warnings?$/m]; requireOpsx(opsxSummary.status === 0 && opsxSummary.stderr === '' && summaryFields.every(field => field.test(opsxSummary.stdout)), 'no arguments exit 0 with Project, Schema, Changes, Artifacts, Skills, and Diagnostics summary fields'); for (const versionFlag of ['--version', '-v', '-V']) for (const launcher of [cli, opsxCli]) { const version = launcher([versionFlag]); requireOpsx(version.status === 0 && version.stdout === `${packageManifest.version}\n` && version.stderr === '', `${versionFlag} exits 0 with package version only from both launchers`); }
  const opsxJson = opsxCli(['list', '--json']); let jsonEnvelope; try { jsonEnvelope = JSON.parse(opsxJson.stdout); } catch { opsxFailures.push('--json writes one valid JSON document to stdout'); } requireOpsx(opsxJson.status === 0 && opsxJson.stderr === '' && jsonEnvelope?.schemaVersion === 1 && jsonEnvelope.command === 'list' && jsonEnvelope.ok === true && Array.isArray(jsonEnvelope.diagnostics) && Array.isArray(jsonEnvelope.mutations) && Array.isArray(jsonEnvelope.nextActions), '--json exits 0 with versioned success envelope and clean stderr');
  const opsxBefore = fs.readdirSync(tmp).sort(); for (const args of [['--json=invalid'], ['--unknown'], ['list', '--unknown'], ['list', '--json', '--json'], ['list', '--json=invalid'], ['--json', 'list'], ['--version', '--json'], ['-list']]) { const result = opsxCli(args); requireOpsx(strictFlagError(result) && !/success/i.test(result.stdout + result.stderr), `${args.join(' ')} exits 2 with no output or success diagnostic`); } requireOpsx(opsxJson.stdout.endsWith('\n') && jsonEnvelope?.data?.schemas?.includes(designSchema) && jsonEnvelope?.schemaVersion === 1, '--json list has deterministic newline, schema version, and schema payload'); requireOpsx(JSON.stringify(fs.readdirSync(tmp).sort()) === JSON.stringify(opsxBefore), 'opsx-schema summary and JSON commands do not mutate current project');
  const listed = cli(['list'], { PATH: tmp }); ok(listed); assert.equal(listed.stdout.split('\n').filter(name => name === designSchema).length, 1); const opsxListed = opsxCli(['list']); requireOpsx(opsxListed.status === listed.status && opsxListed.stdout === listed.stdout && opsxListed.stderr === listed.stderr, 'opsx-schema list preserves openspec-schemas behavior');
  ok(cli(['validate'])); ok(cli(['verify'])); ok(cli(['validate', designSchema]));
  ok(cli(['validate', 'minimalist'])); assert.notEqual(cli(['validate', 'missing']).status, 0);
  assert.notEqual(cli(['validate', 'minimalist', 'event-driven']).status, 0); assert.notEqual(cli(['verify', 'minimalist']).status, 0);
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
   const mcpEntries = {
      atomic: { file: '.mcp.json', value: { mcpServers: { inspo: { url: 'https://inspomcp.dev/api/mcp' }, 'ui-skills': { url: 'https://www.ui-skills.com/mcp' } } } },
      omp: { file: '.omp/mcp.json', value: { mcpServers: { inspo: { type: 'http', url: 'https://inspomcp.dev/api/mcp' }, 'ui-skills': { type: 'http', url: 'https://www.ui-skills.com/mcp' } } } },
      opencode: { file: 'opencode.jsonc', value: { mcp: { inspo: { type: 'remote', url: 'https://inspomcp.dev/api/mcp' }, 'ui-skills': { type: 'remote', url: 'https://www.ui-skills.com/mcp' } } } },
   };
   for (const [host, expected] of Object.entries(mcpEntries)) {
     const mcpTarget = path.join(tmp, `mcp ${host}`);
     write(path.join(mcpTarget, 'sentinel'), 'keep');
     ok(cli(['install', designSchema, '-t', mcpTarget, '--mcp', 'all', '-a', host]));
     assert.deepEqual(JSON.parse(fs.readFileSync(path.join(mcpTarget, expected.file), 'utf8')), expected.value);
     assert.equal(fs.existsSync(path.join(mcpTarget, '.opencode/commands/opsx-ce-plan.md')), false);
     assert.equal(fs.readFileSync(path.join(mcpTarget, 'sentinel'), 'utf8'), 'keep');
   }
   const selectedMcpTarget = path.join(tmp, 'mcp selected');
   ok(cli(['install', designSchema, '-t', selectedMcpTarget, '--mcp', 'inspo', '-a', 'atomic']));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(selectedMcpTarget, '.mcp.json'), 'utf8')), { mcpServers: { inspo: { url: 'https://inspomcp.dev/api/mcp' } } });
   const aliasMcpTarget = path.join(tmp, 'mcp alias');
   ok(cli(['install', designSchema, '-t', aliasMcpTarget, '--mcp', 'inspo', '--agents', 'atomic']));
   assert.equal(fs.existsSync(path.join(aliasMcpTarget, '.mcp.json')), true);
   const hostAliasMcpTarget = path.join(tmp, 'mcp host alias');
   ok(cli(['install', designSchema, '-t', hostAliasMcpTarget, '--mcp', 'inspo', '--agent', 'omp']));
   assert.equal(fs.existsSync(path.join(hostAliasMcpTarget, '.omp/mcp.json')), true);
   const detectedMcpTarget = path.join(tmp, 'mcp detected');
   write(path.join(detectedMcpTarget, '.omp/existing'), 'keep');
   ok(cli(['install', designSchema, '-t', detectedMcpTarget, '--mcp', 'ui-skills']));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(detectedMcpTarget, '.omp/mcp.json'), 'utf8')), { mcpServers: { 'ui-skills': { type: 'http', url: 'https://www.ui-skills.com/mcp' } } });
   const ambiguousMcpTarget = path.join(tmp, 'mcp ambiguous');
   write(path.join(ambiguousMcpTarget, '.omp/existing'), 'keep'); write(path.join(ambiguousMcpTarget, '.pi/existing'), 'keep');
   const ambiguousMcpBefore = snapshot(ambiguousMcpTarget);
   assert.notEqual(cli(['install', designSchema, '-t', ambiguousMcpTarget, '--mcp', 'all']).status, 0); assert.deepEqual(snapshot(ambiguousMcpTarget), ambiguousMcpBefore);
   assert.notEqual(cli(['install', designSchema, '-t', path.join(tmp, 'mcp missing host'), '--mcp', 'all']).status, 0);
   assert.notEqual(cli(['install', 'minimalist', '-t', path.join(tmp, 'mcp absent catalog'), '--mcp', 'all', '-a', 'atomic']).status, 0);
   assert.notEqual(cli(['install', designSchema, '-t', path.join(tmp, 'mcp unknown'), '--mcp', 'missing', '-a', 'atomic']).status, 0);
   const mcpCollisionTarget = path.join(tmp, 'mcp collision');
   write(path.join(mcpCollisionTarget, '.mcp.json'), JSON.stringify({ mcpServers: { inspo: { url: 'https://wrong.example/mcp' }, unrelated: { url: 'https://keep.example/mcp' } } }, null, 2));
   const mcpCollisionBefore = snapshot(mcpCollisionTarget);
   assert.notEqual(cli(['install', designSchema, '-t', mcpCollisionTarget, '--mcp', 'inspo', '-a', 'atomic']).status, 0); assert.deepEqual(snapshot(mcpCollisionTarget), mcpCollisionBefore);
   ok(cli(['install', designSchema, '-t', mcpCollisionTarget, '--mcp', 'inspo', '-a', 'atomic', '--force']));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(mcpCollisionTarget, '.mcp.json'), 'utf8')), { mcpServers: { inspo: { url: 'https://inspomcp.dev/api/mcp' }, unrelated: { url: 'https://keep.example/mcp' } } });
    const mcpNoop = snapshot(mcpCollisionTarget); ok(cli(['install', designSchema, '-t', mcpCollisionTarget, '--mcp', 'inspo', '-a', 'atomic', '--force'])); assert.deepEqual(snapshot(mcpCollisionTarget), mcpNoop);
    const mcpOptInTarget = path.join(tmp, 'mcp opt in');
    ok(cli(['install', designSchema, '-t', mcpOptInTarget]));
    const installedSchema = snapshot(path.join(mcpOptInTarget, 'openspec/schemas', designSchema));
    ok(cli(['install', designSchema, '-t', mcpOptInTarget, '--mcp', 'inspo', '-a', 'opencode']));
    assert.deepEqual(snapshot(path.join(mcpOptInTarget, 'openspec/schemas', designSchema)), installedSchema);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(mcpOptInTarget, 'opencode.jsonc'), 'utf8')), { mcp: { inspo: { type: 'remote', url: 'https://inspomcp.dev/api/mcp' } } });
    const failMcpWrite = path.join(tmp, 'fail-mcp-write.js');
    write(failMcpWrite, `'use strict';
if (process.argv[1] === process.env.TEST_CLI) {
  const fs = require('node:fs');
  const renameSync = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (destination === process.env.FAIL_MCP_DESTINATION) throw new Error('injected MCP config write failure');
    return renameSync(source, destination);
  };
}
`);
    const atomicMcpTarget = path.join(tmp, 'mcp atomic failure');
    const atomicMcpConfig = path.join(atomicMcpTarget, 'opencode.jsonc');
    write(atomicMcpConfig, '{}\n');
    write(path.join(atomicMcpTarget, 'openspec/config.yaml'), 'schema: old\n');
    const atomicMcpBefore = snapshot(atomicMcpTarget);
    assert.notEqual(cli(['install', designSchema, '-t', atomicMcpTarget, '--mcp', 'inspo', '-a', 'opencode', '--activate'], { NODE_OPTIONS: `--require=${failMcpWrite}`, TEST_CLI: path.join(root, 'bin/openspec-schemas.js'), FAIL_MCP_DESTINATION: atomicMcpConfig }).status, 0);
    assert.deepEqual(snapshot(atomicMcpTarget), atomicMcpBefore);
    const failAfterMcpWrite = path.join(tmp, 'fail-after-mcp-write.js');
    write(failAfterMcpWrite, `'use strict';
if (process.argv[1] === process.env.TEST_CLI) {
  const Module = require('node:module');
  const load = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    const loaded = load.call(this, request, parent, isMain);
    if (request === './mcp-config' && parent?.filename === process.env.TEST_CLI) {
      return { ...loaded, write(plan) { loaded.write(plan); throw new Error('injected post-MCP failure'); } };
    }
    return loaded;
  };
}
`);
    const postMcpTarget = path.join(tmp, 'mcp post-commit failure');
    const postMcpConfig = path.join(postMcpTarget, 'opencode.jsonc');
    write(postMcpConfig, '{}\n');
    ok(cli(['install', designSchema, '-t', postMcpTarget]));
    const postMcpBefore = snapshot(postMcpTarget);
    const postMcpFailure = cli(['install', designSchema, '-t', postMcpTarget, '--mcp', 'inspo', '-a', 'opencode'], {
      NODE_OPTIONS: `--require=${failAfterMcpWrite}`,
      TEST_CLI: path.join(root, 'bin/openspec-schemas.js'),
    });
    assert.notEqual(postMcpFailure.status, 0);
    assert.deepEqual(snapshot(postMcpTarget), postMcpBefore);
    const swapAfterValidation = path.join(tmp, 'swap-after-validation.js');
    write(swapAfterValidation, `'use strict';
if (process.argv[1] === process.env.TEST_CLI) {
  const fs = require('node:fs');
  const childProcess = require('node:child_process');
  const original = childProcess.spawnSync;
  let swapped = false;
  childProcess.spawnSync = function spawnSync(command, args, options) {
    const result = original.call(this, command, args, options);
    if (!swapped && command === 'openspec' && args[0] === 'schema' && args[1] === 'validate') {
      swapped = true;
      fs.renameSync(process.env.SWAP_PARENT, process.env.SWAP_BACKUP);
      fs.symlinkSync(process.env.SWAP_EXTERNAL, process.env.SWAP_PARENT);
    }
    return result;
  };
}
`);
    const swappedInstallTarget = path.join(tmp, 'ancestor swap install');
    const swappedInstallParent = path.join(swappedInstallTarget, 'openspec');
    const swappedInstallExternal = path.join(tmp, 'ancestor swap install external');
    write(path.join(swappedInstallParent, 'sentinel'), 'internal');
    write(path.join(swappedInstallExternal, 'sentinel'), 'external');
    const swappedInstallExternalBefore = snapshot(swappedInstallExternal);
    const swappedInstall = cli(['install', designSchema, '-t', swappedInstallTarget], {
      NODE_OPTIONS: `--require=${swapAfterValidation}`,
      TEST_CLI: path.join(root, 'bin/openspec-schemas.js'),
      SWAP_PARENT: swappedInstallParent,
      SWAP_BACKUP: path.join(swappedInstallTarget, 'openspec-before-swap'),
      SWAP_EXTERNAL: swappedInstallExternal,
    });
    assert.notEqual(swappedInstall.status, 0);
    assert.deepEqual(snapshot(swappedInstallExternal), swappedInstallExternalBefore);
    assert.equal(fs.readFileSync(path.join(swappedInstallExternal, 'sentinel'), 'utf8'), 'external');
    const swapBeforeMcpWrite = path.join(tmp, 'swap-before-mcp-write.js');
    write(swapBeforeMcpWrite, `'use strict';
if (process.argv[1] === process.env.TEST_CLI) {
  const fs = require('node:fs');
  const childProcess = require('node:child_process');
  const original = childProcess.spawnSync;
  let swapped = false;
  childProcess.spawnSync = function spawnSync(command, args, options) {
    const result = original.call(this, command, args, options);
    if (!swapped && command === 'openspec' && args[0] === 'schema' && args[1] === 'validate' && options.cwd === process.env.SWAP_PROJECT) {
      swapped = true;
      fs.renameSync(process.env.SWAP_PARENT, process.env.SWAP_BACKUP);
      fs.symlinkSync(process.env.SWAP_EXTERNAL, process.env.SWAP_PARENT);
    }
    return result;
  };
}
`);
    const swappedMcpTarget = path.join(tmp, 'ancestor swap mcp');
    const swappedMcpParent = path.join(swappedMcpTarget, '.omp');
    const swappedMcpExternal = path.join(tmp, 'ancestor swap mcp external');
    write(path.join(swappedMcpParent, 'sentinel'), 'internal');
    write(path.join(swappedMcpExternal, 'sentinel'), 'external');
    const swappedMcpExternalBefore = snapshot(swappedMcpExternal);
    const swappedMcp = cli(['install', designSchema, '-t', swappedMcpTarget, '--mcp', 'inspo', '-a', 'omp'], {
      NODE_OPTIONS: `--require=${swapBeforeMcpWrite}`,
      TEST_CLI: path.join(root, 'bin/openspec-schemas.js'),
      SWAP_PROJECT: swappedMcpTarget,
      SWAP_PARENT: swappedMcpParent,
      SWAP_BACKUP: path.join(swappedMcpTarget, '.omp-before-swap'),
      SWAP_EXTERNAL: swappedMcpExternal,
    });
    assert.notEqual(swappedMcp.status, 0);
    assert.deepEqual(snapshot(swappedMcpExternal), swappedMcpExternalBefore);
    assert.equal(fs.readFileSync(path.join(swappedMcpExternal, 'sentinel'), 'utf8'), 'external');
    const jsoncTarget = path.join(tmp, 'mcp jsonc');
   const jsonc = '{\n  // keep\n  "mcp": {}\n}\n'; write(path.join(jsoncTarget, 'opencode.jsonc'), jsonc);
   const jsoncBefore = snapshot(jsoncTarget); assert.notEqual(cli(['install', designSchema, '-t', jsoncTarget, '--mcp', 'inspo', '-a', 'opencode']).status, 0); assert.deepEqual(snapshot(jsoncTarget), jsoncBefore);
   const malformedMcpTarget = path.join(tmp, 'mcp malformed'); write(path.join(malformedMcpTarget, '.mcp.json'), '{'); const malformedMcpBefore = snapshot(malformedMcpTarget);
   assert.notEqual(cli(['install', designSchema, '-t', malformedMcpTarget, '--mcp', 'inspo', '-a', 'atomic']).status, 0); assert.deepEqual(snapshot(malformedMcpTarget), malformedMcpBefore);
   const mapMcpTarget = path.join(tmp, 'mcp map mismatch'); write(path.join(mapMcpTarget, '.mcp.json'), JSON.stringify({ mcpServers: [] })); const mapMcpBefore = snapshot(mapMcpTarget);
   assert.notEqual(cli(['install', designSchema, '-t', mapMcpTarget, '--mcp', 'inspo', '-a', 'atomic']).status, 0); assert.deepEqual(snapshot(mapMcpTarget), mapMcpBefore);
   const linkedMcpTarget = path.join(tmp, 'mcp symlink'); write(path.join(linkedMcpTarget, 'outside'), '{}'); fs.symlinkSync(path.join(linkedMcpTarget, 'outside'), path.join(linkedMcpTarget, '.mcp.json')); const linkedMcpBefore = snapshot(linkedMcpTarget);
   assert.notEqual(cli(['install', designSchema, '-t', linkedMcpTarget, '--mcp', 'inspo', '-a', 'atomic', '--force']).status, 0); assert.deepEqual(snapshot(linkedMcpTarget), linkedMcpBefore);
   const piMcpTarget = path.join(tmp, 'mcp pi'); write(path.join(piMcpTarget, '.pi/existing'), 'keep'); const piMcpBefore = snapshot(piMcpTarget);
   const piMcp = cli(['install', designSchema, '-t', piMcpTarget, '--mcp', 'all', '-a', 'pi']); ok(piMcp); assert.match(piMcp.stdout, /guided-only/); assert.deepEqual(snapshot(piMcpTarget).filter(([name]) => name !== 'openspec'), piMcpBefore);
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
  const packageFiles = new Set(['package.json', 'README.md', 'AGENT_INSTALL.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE', 'bin/mcp-config.js', 'bin/change-schema.js', 'bin/change-schema-transaction.js', 'bin/legacy-change-schema.js', 'bin/openspec-schemas.js', 'bin/opsx-ipc-protocol.js', 'bin/opsx-schema.js', 'bin/opsx-snapshot.js', 'bin/opsx-skills.js', 'bin/opsx-path-guard.js', 'bin/opsx-view-actions.js', 'bin/opsx-view.js', 'src/tui/controller.mjs', 'src/tui/input.mjs', 'src/tui/overview-model.mjs', 'src/tui/overview.mjs', 'src/tui/panes-model.mjs', 'src/tui/panes.mjs', 'src/tui/runtime.mjs', 'src/tui/state.mjs']);
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
  assert(files.includes('bin/openspec-schemas.js')); assert(files.includes('bin/mcp-config.js')); assert(files.includes('.pi/prompts/opsx-ce-plan.md')); assert(files.includes('CHANGELOG.md'));
  for (const file of ['bin/change-schema.js', 'bin/change-schema-transaction.js', 'bin/legacy-change-schema.js', 'bin/opsx-ipc-protocol.js', 'bin/opsx-schema.js', 'bin/opsx-snapshot.js', 'bin/opsx-skills.js', 'bin/opsx-path-guard.js', 'bin/opsx-view-actions.js', 'bin/opsx-view.js', 'src/tui/controller.mjs', 'src/tui/input.mjs', 'src/tui/overview-model.mjs', 'src/tui/overview.mjs', 'src/tui/panes-model.mjs', 'src/tui/panes.mjs', 'src/tui/runtime.mjs', 'src/tui/state.mjs']) assert(files.includes(file));
  assert(!files.some(file => /^scripts\/(lint-|test-|quality)/.test(file))); assert(!files.some(file => /(^\.omo\/|node_modules|package-lock|^openspec\/changes\/|^\.opencode\/package.json|^\.(?:claude|codex|omp)\/|^openspec\/schemas\/intent-driven-design\/(?:assets|external|repos|research)\/)/.test(file))); assert(!files.some(file => /^\.(?:opencode\/commands|senpi\/prompts|pi\/prompts|atomic\/prompts)\/(?!opsx-ce-)/.test(file)));
   const extracted = path.join(tmp, 'package');
  for (const file of files) { const output = path.join(extracted, file); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(path.join(root, file), output); }
  const packedCli = args => run(process.execPath, [path.join(extracted, 'bin/openspec-schemas.js'), ...args], { env });
  const packedList = packedCli(['list']);
  ok(packedList); assert.equal(packedList.stdout.split('\n').filter(name => name === designSchema).length, 1);
   const packedOpsxList = run(process.execPath, [path.join(extracted, 'bin/opsx-schema.js'), 'list', '--json'], { env });
   ok(packedOpsxList); assert.equal(JSON.parse(packedOpsxList.stdout).data.schemas.includes(designSchema), true);
   assert.equal(fs.existsSync(path.join(extracted, 'src/tui/runtime.mjs')), true);
   const packed = run('nub', ['pack', '--ignore-scripts', '--json']);
   ok(packed);
   const archive = path.join(root, JSON.parse(packed.stdout)[0].filename);
   try {
     const tarFiles = packedFiles(archive);
     for (const file of ['bin/mcp-config.js', 'bin/change-schema.js', 'bin/change-schema-transaction.js', 'bin/legacy-change-schema.js', 'bin/opsx-ipc-protocol.js', 'bin/opsx-schema.js', 'bin/opsx-snapshot.js', 'bin/opsx-skills.js', 'bin/opsx-path-guard.js', 'bin/opsx-view-actions.js', 'bin/opsx-view.js', 'src/tui/controller.mjs', 'src/tui/input.mjs', 'src/tui/overview-model.mjs', 'src/tui/overview.mjs', 'src/tui/panes-model.mjs', 'src/tui/panes.mjs', 'src/tui/runtime.mjs', 'src/tui/state.mjs', `openspec/schemas/${designSchema}/mcp.yaml`]) assert(tarFiles.includes(file));
     assert(!tarFiles.some(file => file.startsWith('scripts/test-')));
     assert(!tarFiles.some(file => file === 'nub.lock' || file.startsWith('openspec/changes/')));
     const tarExtracted = path.join(tmp, 'tar-package');
     fs.mkdirSync(tarExtracted);
     ok(run('tar', ['-xzf', archive, '-C', tarExtracted]));
     const tarRoot = path.join(tarExtracted, 'package');
     const tarCore = run(process.execPath, [path.join(tarRoot, 'bin/opsx-schema.js'), '--version'], { env: { ...env, NODE_PATH: '' } });
     ok(tarCore);
     assert.equal(tarCore.stdout, `${JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version}\n`);
     const tarView = run(process.execPath, [path.join(tarRoot, 'bin/opsx-schema.js'), 'view'], { cwd: tmp, env: { ...env, NODE_PATH: '' } });
     assert.equal(tarView.status, 1);
      assert.match(tarView.stderr, /TUI_(?:RUNTIME|TARGET)_UNSUPPORTED/);
   } finally {
     fs.rmSync(archive, { force: true });
   }
  const packedSkillsProject = path.join(tmp, 'packed-skills-project');
  write(path.join(packedSkillsProject, 'openspec/config.yaml'), 'schema: minimalist\n');
  const packedSkills = run(process.execPath, [path.join(extracted, 'bin/opsx-schema.js'), 'skills', 'inspect', '--schema', 'minimalist', '--json'], { cwd: packedSkillsProject, env });
  ok(packedSkills); assert.deepEqual(JSON.parse(packedSkills.stdout).data.resources.map(resource => resource.target), ['.agents/skills/openspec-git-discipline']);
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
  const packedCatalog = path.join(extracted, `openspec/schemas/${designSchema}/mcp.yaml`);
  const validCatalog = fs.readFileSync(packedCatalog, 'utf8');
  fs.writeFileSync(packedCatalog, validCatalog.replace('auth: none', 'auth: bearer-token'));
  assert.notEqual(packedCli(['validate', designSchema]).status, 0);
  assert.notEqual(packedCli(['verify']).status, 0);
  fs.writeFileSync(packedCatalog, validCatalog.replace('version: 1', 'version: 2'));
  assert.notEqual(packedCli(['validate', designSchema]).status, 0);
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
  assert.deepEqual(opsxFailures, [], `opsx-schema desired contract missing:\n- ${opsxFailures.join('\n- ')}`);
  console.log('test-release: CLI, package file set, quality, hooks passed');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
