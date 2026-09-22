'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const packageVersion = require('../package.json').version;

function write(file, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
}

function tree(directory) {
  if (!fs.existsSync(directory)) return null;
  return fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const info = fs.lstatSync(file);
    return [name, info.mode & 0o7777, info.isSymbolicLink() ? `link:${fs.readlinkSync(file)}` : info.isDirectory() ? tree(file) : fs.readFileSync(file).toString('hex')];
  });
}

module.exports = function testOpsxSkills(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsx-skills-'));
  try {
    const project = path.join(tmp, 'project with spaces');
    const tools = path.join(tmp, 'tools');
    const sources = path.join(tmp, 'sources');
    const calls = path.join(tmp, 'calls.jsonl');
    write(path.join(project, 'openspec/config.yaml'), 'schema: minimalist # retained\ncontext: |\n  schema: untouched\n', 0o640);
    write(path.join(project, 'sentinel'), 'keep\n');
    write(path.join(sources, 'intent-driven-dev/skills/.agents/skills/openspec-git-discipline/SKILL.md'), '# discipline\n', 0o640);
    write(path.join(tools, 'openspec'), `#!${process.execPath}\n'use strict';\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\nconst root = { path: process.env.PROJECT, source: 'nearest' };\nif (process.env.CALL_LOG) fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({tool:'openspec',args})+'\\n');\nif (args.join(' ') === 'list --json') process.stdout.write(JSON.stringify({changes:[],root}));\nelse if (args.join(' ') === 'doctor --json') process.stdout.write(JSON.stringify({root,store:null,references:[],status:[]}));\nelse if (args.join(' ') === 'schema which --all --json') { const schema = process.env.OPSX_SCHEMA_UNRESOLVED ? 'minimalist' : 'intent-driven'; process.stdout.write(JSON.stringify([{name:schema,source:'package',path:path.join(process.env.PACKAGE_ROOT,\`openspec/schemas/\${schema}\`),shadows:[]} ])); }\nelse process.exit(2);\n`, 0o755);
    write(path.join(tools, 'git'), `#!${process.execPath}\n'use strict';\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\nif (process.env.CALL_LOG) fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({tool:'git',args,home:process.env.HOME,prompt:process.env.GIT_TERMINAL_PROMPT,nosystem:process.env.GIT_CONFIG_NOSYSTEM,global:process.env.GIT_CONFIG_GLOBAL})+'\\n');\nif (process.env.GIT_BLOCK_FILE) { fs.writeFileSync(process.env.GIT_BLOCK_FILE, 'ready'); while (!fs.existsSync(process.env.GIT_RELEASE_FILE)) {} }\nif (args[0] !== 'clone') process.exit(9);\nconst url = args.at(-2);\nconst destination = args.at(-1);\nconst match = /^https:\\/\\/github\\.com\\/([A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+)\\.git$/.exec(url);\nif (!match) process.exit(8);\nfs.cpSync(path.join(process.env.SOURCE_ROOT, match[1]), destination, {recursive:true});\n`, 0o755);
    const baseEnv = { ...process.env, PATH: `${tools}:${process.env.PATH}`, PROJECT: project, PACKAGE_ROOT: root, SOURCE_ROOT: sources, CALL_LOG: calls, OPSX_SCHEMA_GIT: path.join(tools, 'git') };
    const cli = (args, overrides = {}, cwd = project) => spawnSync(process.execPath, [path.join(root, 'bin/opsx-schema.js'), ...args], { cwd, encoding: 'utf8', env: { ...baseEnv, ...overrides } });
    const json = (args, overrides, cwd) => {
      const result = cli(args, overrides, cwd);
      assert.equal(result.stderr, '', `${args.join(' ')}: ${result.stderr}`);
      assert.equal(result.stdout.endsWith('\n'), true);
      return [result, JSON.parse(result.stdout)];
    };

    const initial = tree(project);
    fs.writeFileSync(calls, '');
    for (const args of [
      ['enable'], ['enable', 'minimalist', '--apply'], ['enable', 'minimalist', '--yes', '--yes'],
      ['skills'], ['skills', 'inspect', '--profile'], ['skills', 'inspect', '--profile', 'custom'],
      ['skills', 'install', '--schema'], ['skills', 'install', '--schema', 'minimalist', '--yes'],
      ['skills', 'disable', '--force'], ['skills', 'doctor', '--schema', 'minimalist'],
      ['skills', 'inspect', '--json', '--schema', 'minimalist'],
    ]) {
      const result = cli(args);
      assert.equal(result.status, 2, args.join(' '));
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Error: .+\nUsage: opsx-schema\b/);
    }
    assert.equal(fs.readFileSync(calls, 'utf8'), '');
    assert.deepEqual(tree(project), initial);

    const symlinkProject = path.join(tmp, 'symlink project');
    const symlinkProjectTarget = path.join(tmp, 'symlink project target');
    write(path.join(symlinkProjectTarget, 'openspec/config.yaml'), 'schema: minimalist\n');
    write(path.join(symlinkProjectTarget, 'sentinel'), 'keep\n');
    fs.symlinkSync(symlinkProjectTarget, symlinkProject);
    const symlinkProjectBefore = tree(symlinkProjectTarget);
    fs.writeFileSync(calls, '');
    let [result, envelope] = json(['skills', 'install', '--apply', '--json'], { PROJECT: symlinkProject }, symlinkProject);
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.diagnostics.some(item => item.code === 'UNSAFE_TARGET'), true);
    assert.deepEqual(tree(symlinkProjectTarget), symlinkProjectBefore);
    assert.equal(fs.readFileSync(calls, 'utf8').includes('"tool":"git"'), false);

    [result, envelope] = json(['skills', 'inspect', '--schema', 'minimalist', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.command, 'skills inspect');
    assert.equal(envelope.data.schema, 'minimalist');
    assert.equal(envelope.data.profile, 'default');
    assert.deepEqual(envelope.data.resources.map(resource => resource.target), ['.agents/skills/openspec-git-discipline']);
    assert.deepEqual(envelope.mutations, []);
    assert.equal(fs.readFileSync(calls, 'utf8').includes('"tool":"git"'), false);
    assert.deepEqual(tree(project), initial);

    fs.writeFileSync(calls, '');
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, false);
    assert.equal(envelope.mutations[0].operation, 'install');
    assert.equal(envelope.mutations[0].status, 'planned');
    assert.equal(fs.readFileSync(calls, 'utf8').includes('"tool":"git"'), false);
    assert.deepEqual(tree(project), initial);

    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, true);
    assert.equal(envelope.mutations[0].status, 'applied');
    assert.equal(fs.readFileSync(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), 'utf8'), '# discipline\n');
    assert.equal(fs.statSync(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md')).mode & 0o777, 0o640);
    const markerFile = path.join(project, '.openspec/opsx-schema/managed-skills.json');
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    assert.equal(marker.package.name, '@nebulesstech/openspec-schemas');
    assert.equal(marker.package.version, packageVersion);
    assert.deepEqual(marker.resources.map(resource => resource.target), ['.agents/skills/openspec-git-discipline']);
    assert.match(marker.resources[0].digest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(marker.ownerships[0].resources, ['.agents/skills/openspec-git-discipline']);
    assert.equal(marker.ownerships[0].schemaVersion, 1);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/mutation.lock')), false);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.equal(fs.readFileSync(path.join(project, 'sentinel'), 'utf8'), 'keep\n');
    const installed = tree(project);

    [result, envelope] = json(['skills', 'enable', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.mutations[0].status, 'noop');
    assert.deepEqual(tree(project), installed);
    const gitCalls = fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(call => call.tool === 'git');
    assert.deepEqual(gitCalls.at(-1).args.slice(0, 7), ['clone', '--depth', '1', '--no-tags', '--quiet', 'https://github.com/intent-driven-dev/skills.git', gitCalls.at(-1).args[6]]);
    assert.equal(gitCalls.at(-1).prompt, '0');
    assert.equal(gitCalls.at(-1).nosystem, '1');
    assert.equal(gitCalls.at(-1).global, '/dev/null');

    fs.appendFileSync(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), 'user change\n');
    const modified = tree(project);
    for (const args of [
      ['skills', 'disable', '--schema', 'minimalist', '--apply', '--json'],
      ['skills', 'install', '--schema', 'minimalist', '--force', '--apply', '--json'],
    ]) {
      [result, envelope] = json(args);
      assert.equal(result.status, 1);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.diagnostics.some(item => item.code === 'MANAGED_RESOURCE_MODIFIED'), true);
      assert.deepEqual(tree(project), modified);
    }
    fs.writeFileSync(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), '# discipline\n');
    [result, envelope] = json(['skills', 'disable', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(path.join(project, '.agents/skills/openspec-git-discipline')), false);
    assert.equal(fs.readFileSync(path.join(project, 'sentinel'), 'utf8'), 'keep\n');

    const config = path.join(project, 'openspec/config.yaml');
    const configBefore = fs.readFileSync(config);
    [result, envelope] = json(['enable', 'intent-driven', '--json'], { OPSX_SCHEMA_UNRESOLVED: '1' });
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.diagnostics[0].code, 'SCHEMA_UNRESOLVED');
    assert.deepEqual(envelope.mutations, []);
    assert.deepEqual(fs.readFileSync(config), configBefore);
    [result, envelope] = json(['enable', 'intent-driven', '--yes', '--json'], { OPSX_SCHEMA_UNRESOLVED: '1' });
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.diagnostics[0].code, 'SCHEMA_UNRESOLVED');
    assert.deepEqual(envelope.mutations, []);
    assert.deepEqual(fs.readFileSync(config), configBefore);
    [result, envelope] = json(['enable', 'intent-driven', '--json'], { OPSX_SCHEMA_ENABLE_RESOLVED: '1' });
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, false);
    assert.deepEqual(fs.readFileSync(config), configBefore);
    [result, envelope] = json(['enable', 'intent-driven', '--yes', '--json'], { OPSX_SCHEMA_ENABLE_RESOLVED: '1' });
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, true);
    assert.equal(fs.readFileSync(config, 'utf8'), 'schema: intent-driven # retained\ncontext: |\n  schema: untouched\n');
    assert.equal(fs.statSync(config).mode & 0o777, 0o640);

    write(markerFile, '{');
    const corruptBefore = tree(project);
    [result, envelope] = json(['skills', 'doctor', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.data.managed, null);
    assert.equal(envelope.data.enabled, null);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MANAGED_SKILLS_CORRUPT'), true);
    assert.deepEqual(tree(project), corruptBefore);
    [result, envelope] = json(['skills', 'disable', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MANAGED_SKILLS_CORRUPT'), true);
    assert.deepEqual(tree(project), corruptBefore);
    fs.rmSync(markerFile);

    write(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), 'user-owned\n');
    write(markerFile, `${JSON.stringify({ ...marker, ownerships: [] }, null, 2)}\n`, 0o600);
    const orphaned = tree(project);
    for (const args of [
      ['skills', 'install', '--schema', 'minimalist', '--apply', '--json'],
      ['skills', 'install', '--schema', 'minimalist', '--force', '--apply', '--json'],
    ]) {
      [result, envelope] = json(args);
      assert.equal(result.status, 1);
      assert.equal(envelope.diagnostics.some(item => ['MANAGED_SKILLS_CORRUPT', 'TARGET_COLLISION'].includes(item.code)), true);
      assert.deepEqual(tree(project), orphaned);
    }
    fs.rmSync(markerFile);
    const collision = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'TARGET_COLLISION'), true);
    assert.deepEqual(tree(project), collision);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--force', '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(fs.readFileSync(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), 'utf8'), '# discipline\n');
    assert.equal(fs.readFileSync(path.join(project, 'sentinel'), 'utf8'), 'keep\n');

    for (const attack of ['../escape', '/absolute', 'C:\\escape', '\\\\server\\share', 'bad\u0001name', '.agents/skills/../escape']) {
      const packed = path.join(tmp, `package-${Buffer.from(attack).toString('hex')}`);
      fs.cpSync(path.join(root, 'bin'), path.join(packed, 'bin'), { recursive: true });
      fs.cpSync(path.join(root, 'openspec'), path.join(packed, 'openspec'), { recursive: true });
      fs.copyFileSync(path.join(root, 'package.json'), path.join(packed, 'package.json'));
      write(path.join(packed, 'openspec/schemas/minimalist/skill-profiles.yaml'), JSON.stringify({ schemaVersion: 1, profiles: { recommended: { extends: ['default'], resources: [{ source: 'intent-driven-dev/skills', path: attack }] } } }));
      const attacked = tree(project);
      result = spawnSync(process.execPath, [path.join(packed, 'bin/opsx-schema.js'), 'skills', 'inspect', '--schema', 'minimalist', '--profile', 'recommended', '--json'], { cwd: project, encoding: 'utf8', env: baseEnv });
      assert.equal(result.stderr, '');
      envelope = JSON.parse(result.stdout);
      assert.equal(result.status, 1, attack);
      assert.equal(envelope.diagnostics.some(item => item.code === 'PROFILE_INVALID'), true, attack);
      assert.deepEqual(tree(project), attacked);
    }

    const earlyAlternate = path.join(project, '.opsx-schema-early-lock-alternate');
    const earlyTemporary = path.join(project, '.opsx-schema-early-lock-tmp');
    write(path.join(earlyAlternate, 'sentinel'), 'early-alternate-untouched\n', 0o600);
    fs.mkdirSync(earlyTemporary);
    fs.renameSync(path.join(project, '.agents'), path.join(project, '.agents-safe'));
    fs.symlinkSync('.opsx-schema-early-lock-alternate', path.join(project, '.agents'));
    const earlyGuardBefore = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { TMPDIR: earlyTemporary });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'TARGET_CHANGED'), true);
    assert.deepEqual(tree(project), earlyGuardBefore);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/mutation.lock')), false);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.deepEqual(fs.readdirSync(earlyTemporary), []);
    fs.unlinkSync(path.join(project, '.agents'));
    fs.renameSync(path.join(project, '.agents-safe'), path.join(project, '.agents'));
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { TMPDIR: earlyTemporary });
    assert.equal(result.status, 0);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MUTATION_LOCKED'), false);
    assert.deepEqual(fs.readdirSync(earlyTemporary), []);
    fs.rmSync(earlyAlternate, { recursive: true });
    fs.rmdirSync(earlyTemporary);

    const fstatFault = path.join(tmp, 'fstat-eio.js');
    const fstatTemporary = path.join(project, '.opsx-schema-fstat-tmp');
    write(fstatFault, `'use strict';\nconst fs = require('node:fs');\nconst original = fs.fstatSync;\nlet injected = false;\nfs.fstatSync = function fstatSync(...args) {\n  const mode = process.env.OPSX_SCHEMA_TEST_FSTAT_EIO;\n  if (mode === 'always' || (mode === 'first' && !injected)) {\n    injected = true;\n    const error = new Error('injected fstat failure');\n    error.code = 'EIO';\n    throw error;\n  }\n  return original.apply(this, args);\n};\n`);
    fs.mkdirSync(fstatTemporary);
    const fstatBefore = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { NODE_OPTIONS: `--require=${fstatFault}`, OPSX_SCHEMA_TEST_FSTAT_EIO: 'first', TMPDIR: fstatTemporary });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'EIO');
    assert.deepEqual(tree(project), fstatBefore);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/mutation.lock')), false);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.deepEqual(fs.readdirSync(fstatTemporary), []);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { TMPDIR: fstatTemporary });
    assert.equal(result.status, 0);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MUTATION_LOCKED'), false);
    assert.deepEqual(fs.readdirSync(fstatTemporary), []);
    const permanentFstatBefore = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { NODE_OPTIONS: `--require=${fstatFault}`, OPSX_SCHEMA_TEST_FSTAT_EIO: 'always', TMPDIR: fstatTemporary });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'EIO');
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/mutation.lock')), true);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.deepEqual(fs.readdirSync(fstatTemporary), []);
    fs.unlinkSync(path.join(project, '.openspec/opsx-schema/mutation.lock'));
    assert.deepEqual(tree(project), permanentFstatBefore);
    const lockCleanupSource = fs.readFileSync(path.join(root, 'bin/opsx-skills.js'), 'utf8');
    assert.equal(/readFileSync\(lock\)|lockToken\)\)/.test(lockCleanupSource), false);
    fs.rmdirSync(fstatTemporary);

    const closeReplacementFault = path.join(tmp, 'close-replacement.js');
    const closeReplacementTemporary = path.join(project, '.opsx-schema-close-tmp');
    const replacementBytes = 'replacement-lock-must-survive\n';
    write(closeReplacementFault, `'use strict';\nconst fs = require('node:fs');\nconst originalOpen = fs.openSync;\nconst originalClose = fs.closeSync;\nlet lockDescriptor = null;\nlet lockPath = null;\nfs.openSync = function openSync(file, ...args) {\n  const descriptor = originalOpen.call(this, file, ...args);\n  if (typeof file === 'string' && file.endsWith('/mutation.lock')) { lockDescriptor = descriptor; lockPath = file; }\n  return descriptor;\n};\nfs.closeSync = function closeSync(descriptor) {\n  if (descriptor === lockDescriptor && lockPath) {\n    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);\n    fs.writeFileSync(lockPath, process.env.OPSX_SCHEMA_TEST_REPLACEMENT);\n    lockDescriptor = null;\n  }\n  return originalClose.call(this, descriptor);\n};\n`);
    fs.mkdirSync(closeReplacementTemporary);
    const closeAlternate = path.join(project, '.opsx-schema-close-alternate');
    write(path.join(closeAlternate, 'sentinel'), 'close-alternate-untouched\n', 0o600);
    const closeTargetBefore = tree(path.join(project, '.agents'));
    const closeAlternateBefore = tree(closeAlternate);
    const sentinelBefore = fs.readFileSync(path.join(project, 'sentinel'));
    fs.renameSync(path.join(project, '.agents'), path.join(project, '.agents-close-safe'));
    fs.symlinkSync('.opsx-schema-close-alternate', path.join(project, '.agents'));
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { NODE_OPTIONS: `--require=${closeReplacementFault}`, OPSX_SCHEMA_TEST_REPLACEMENT: replacementBytes, TMPDIR: closeReplacementTemporary });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'TARGET_CHANGED'), true);
    const replacementLock = path.join(project, '.openspec/opsx-schema/mutation.lock');
    assert.equal(fs.readFileSync(replacementLock, 'utf8'), replacementBytes);
    assert.equal(fs.lstatSync(replacementLock).isFile(), true);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.deepEqual(fs.readdirSync(closeReplacementTemporary), []);
    assert.deepEqual(tree(path.join(project, '.agents-close-safe')), closeTargetBefore);
    assert.deepEqual(tree(closeAlternate), closeAlternateBefore);
    assert.deepEqual(fs.readFileSync(path.join(project, 'sentinel')), sentinelBefore);
    fs.unlinkSync(path.join(project, '.agents'));
    fs.renameSync(path.join(project, '.agents-close-safe'), path.join(project, '.agents'));
    fs.unlinkSync(replacementLock);
    fs.rmSync(closeAlternate, { recursive: true });
    fs.rmdirSync(closeReplacementTemporary);
    assert.match(lockCleanupSource, /unlinkSync\(lock\)[\s\S]*closeSync\(lockDescriptor\)/);

    fs.writeFileSync(path.join(project, '.openspec/opsx-schema/mutation.lock'), 'held');
    const locked = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MUTATION_LOCKED'), true);
    assert.deepEqual(tree(project), locked);
    fs.unlinkSync(path.join(project, '.openspec/opsx-schema/mutation.lock'));
    write(path.join(project, '.openspec/opsx-schema/transaction.json'), '{"incomplete":true}\n');
    const journaled = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'TRANSACTION_INCOMPLETE'), true);
    assert.deepEqual(tree(project), journaled);
    [result, envelope] = json(['skills', 'doctor', '--json']);
    assert.equal(envelope.diagnostics.some(item => item.code === 'TRANSACTION_INCOMPLETE'), true);
    assert.deepEqual(tree(project), journaled);
    fs.unlinkSync(path.join(project, '.openspec/opsx-schema/transaction.json'));

    fs.rmSync(path.join(project, '.agents/skills/openspec-git-discipline'), { recursive: true });
    fs.rmSync(markerFile, { force: true });
    write(path.join(project, '.agents/skills/openspec-git-discipline/SKILL.md'), 'user-before-swap\n', 0o640);
    const alternate = path.join(project, '.opsx-schema-test-alternate');
    write(path.join(alternate, 'sentinel'), 'alternate-untouched\n', 0o600);
    const originalUserTarget = tree(path.join(project, '.agents/skills/openspec-git-discipline'));
    const alternateBefore = tree(alternate);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--force', '--apply', '--json'], { OPSX_SCHEMA_TEST_HOOK: 'swap-agents-after-journal' });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => ['TARGET_CHANGED', 'UNSAFE_TARGET'].includes(item.code)), true);
    assert.equal(fs.lstatSync(path.join(project, '.agents')).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(path.join(project, '.agents')), '.opsx-schema-test-alternate');
    assert.deepEqual(tree(path.join(project, '.agents-before-swap/skills/openspec-git-discipline')), originalUserTarget);
    assert.deepEqual(tree(alternate), alternateBefore);
    assert.equal(fs.readFileSync(path.join(project, 'sentinel'), 'utf8'), 'keep\n');
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/transaction.json')), false);
    assert.equal(fs.existsSync(path.join(project, '.openspec/opsx-schema/mutation.lock')), false);
    fs.unlinkSync(path.join(project, '.agents'));
    fs.renameSync(path.join(project, '.agents-before-swap'), path.join(project, '.agents'));
    fs.rmSync(alternate, { recursive: true });
    fs.rmSync(path.join(project, '.agents/skills/openspec-git-discipline'), { recursive: true });
    for (const point of ['after-journal', 'after-backup', 'after-target', 'before-marker']) {
      const before = tree(project);
      [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json'], { OPSX_SCHEMA_TEST_FAIL_POINT: point });
      assert.equal(result.status, 1, point);
      assert.equal(envelope.diagnostics.some(item => item.code === 'TRANSACTION_FAILED'), true, point);
      assert.deepEqual(tree(project), before, point);
    }

    fs.writeFileSync(path.join(project, '.openspec/opsx-schema/mutation.lock'), 'held');
    const concurrent = tree(project);
    [result, envelope] = json(['skills', 'install', '--schema', 'minimalist', '--apply', '--json']);
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics.some(item => item.code === 'MUTATION_LOCKED'), true);
    assert.deepEqual(tree(project), concurrent);
    fs.unlinkSync(path.join(project, '.openspec/opsx-schema/mutation.lock'));

    const finalSnapshot = tree(project);
    fs.writeFileSync(calls, '');
    for (const args of [['skills', 'inspect', '--schema', 'minimalist', '--json'], ['skills', 'doctor', '--json'], ['inspect', '--json'], ['doctor', '--json']]) {
      cli(args);
      assert.deepEqual(tree(project), finalSnapshot, args.join(' '));
    }
    assert.equal(fs.readFileSync(calls, 'utf8').includes('"tool":"git"'), false);
    console.log('test-opsx-skills: profile authority, ownership, atomic mutations, safety passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

if (require.main === module) module.exports(path.resolve(__dirname, '..'));
