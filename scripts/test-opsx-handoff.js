'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createFixture, tree } = require('./opsx-handoff-fixture.js');

module.exports = function testOpsxHandoff(root) {
  const fixture = createFixture(root);
  const { tmp, project, changeRoot, metadata, original, sourceArtifacts, targetArtifacts, rootData, planningHome, listed, source, target, stateFile, baseState, callLog, cli, preload } = fixture;
  try {
    const json = (args, overrides, cwd, launcher) => {
      const result = cli(args, overrides, cwd, launcher);
      assert.equal(result.stderr, '', result.stderr);
      assert.equal(result.stdout.endsWith('\n'), true);
      assert.equal(result.stdout.split('\n').filter(Boolean).length, 1);
      return [result, JSON.parse(result.stdout)];
    };
    const handoff = ['handoff', 'selected', 'local-target', '-t', project];

    fs.writeFileSync(callLog, '');
    const before = tree(project);
    let [result, envelope] = json([...handoff, '--allow-incompatible', '--json'], { CALL_LOG: callLog });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(Object.keys(envelope), ['schemaVersion', 'command', 'ok', 'data', 'diagnostics', 'mutations', 'nextActions']);
    assert.equal(envelope.command, 'handoff');
    assert.equal(envelope.ok, true);
    assert.deepEqual(envelope.data.source, { schema: 'source-schema', projectRoot: project, changeRoot });
    assert.equal(envelope.data.target.schema, 'local-target');
    assert.equal(envelope.data.target.source, 'project');
    assert.equal(envelope.data.compatibility.compatible, false);
    assert.equal(envelope.data.compatibility.acknowledged, true);
    assert.deepEqual(envelope.data.graphDiff.added.map(item => item.id), ['design']);
    assert.deepEqual(envelope.data.graphDiff.removed.map(item => item.id), ['specs']);
    assert.deepEqual(envelope.data.graphDiff.changed.map(item => item.id), ['proposal', 'tasks']);
    assert.deepEqual(envelope.data.graphDiff.changed[1].source.requires, ['specs']);
    assert.deepEqual(envelope.data.graphDiff.changed[1].target.requires, ['design', 'proposal']);
    assert.equal(envelope.data.applied, false);
    assert.deepEqual(envelope.mutations, [{ operation: 'handoff', path: metadata, status: 'planned', rollback: 'not-needed' }]);
    assert.deepEqual(tree(project), before);
    assert.deepEqual(fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse).map(call => call.args), [
      ['list', '--json'],
      ['status', '--change', 'selected', '--json'],
      ['schema', 'which', '--all', '--json'],
      ['status', '--change', 'selected', '--json', '--schema', 'local-target'],
      ['schema', 'validate', 'local-target'],
    ]);

    for (const [name, graphOverride] of [
      ['source-missing-dependency', { source: { ...source, artifacts: [{ ...sourceArtifacts[0], requires: ['absent'] }] } }],
      ['target-missing-dependency', { target: { ...target, artifacts: [{ ...targetArtifacts[0], requires: ['absent'] }] } }],
      ['duplicate-dependency', { source: { ...source, artifacts: [{ ...sourceArtifacts[0], requires: ['proposal', 'proposal'] }] } }],
      ['malformed-dependency', { target: { ...target, artifacts: [{ ...targetArtifacts[0], requires: 'proposal' }] } }],
    ]) {
      fs.writeFileSync(stateFile, JSON.stringify({ ...baseState, ...graphOverride }));
      const prior = tree(project);
      [result, envelope] = json([...handoff, '--allow-incompatible', '--apply', '--json']);
      assert.equal(result.status, 1, name);
      assert.equal(envelope.diagnostics[0].code, 'INVALID_GRAPH', name);
      assert.deepEqual(envelope.mutations, [], name);
      assert.deepEqual(tree(project), prior, name);
    }
    fs.writeFileSync(stateFile, JSON.stringify(baseState));

    const spawnOptions = path.join(tmp, 'spawn-options.json');
    for (const [injected, code] of [['ETIMEDOUT', 'SCHEMA_VALIDATION_TIMEOUT'], ['ENOBUFS', 'SCHEMA_VALIDATION_OUTPUT_LIMIT']]) {
      [result, envelope] = json([...handoff, '--allow-incompatible', '--json'], { NODE_OPTIONS: `--require=${preload}`, INJECT_VALIDATION: injected, SPAWN_OPTIONS: spawnOptions });
      assert.equal(result.status, 1, injected);
      assert.equal(envelope.diagnostics[0].code, code, injected);
      assert.doesNotMatch(JSON.stringify(envelope), /SECRET/, injected);
      assert.deepEqual(JSON.parse(fs.readFileSync(spawnOptions, 'utf8')), { timeout: 15000, maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'], telemetry: '0' });
      assert.deepEqual(tree(project), before, injected);
    }
    [result, envelope] = json([...handoff, '--allow-incompatible', '--json'], { VALIDATION_MODE: 'nonzero' });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'SCHEMA_VALIDATION_FAILED');
    assert.doesNotMatch(JSON.stringify(envelope), /SECRET/);
    assert.deepEqual(tree(project), before);

    result = cli(handoff);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /incompatible artifact graph/);
    assert.deepEqual(tree(project), before);
    result = cli([...handoff, '--allow-incompatible']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, [
      'Handoff: selected: source-schema -> local-target',
      `Project: ${project}`,
      `Change root: ${changeRoot}`,
      'Compatibility: incompatible (acknowledged)',
      'Added: design [design.md] requires proposal',
      'Removed: specs [specs/**/*.md] requires proposal',
      'Changed: proposal [proposal.md] requires none -> [proposal-v2.md] requires none',
      'Changed: tasks [tasks.md] requires specs -> [tasks.md] requires design, proposal',
      'Mutation: planned',
      'Applied: false',
      '',
    ].join('\n'));

    [result, envelope] = json([...handoff, '--allow-incompatible', '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, true);
    assert.equal(envelope.mutations[0].status, 'applied');
    assert.equal(envelope.mutations[0].rollback, 'not-needed');
    assert.equal(fs.readFileSync(metadata, 'latin1'), original.replace('schema: source-schema', 'schema: local-target'));
    assert.equal(fs.statSync(metadata).mode & 0o777, 0o640);
    assert.equal(fs.readFileSync(path.join(project, 'openspec/config.yaml'), 'utf8'), 'schema: project-default\n');
    assert.equal(fs.readFileSync(path.join(changeRoot, 'proposal.md'), 'utf8'), 'artifact\n');
    assert.equal(fs.readFileSync(path.join(project, '.agents/skills/keep/SKILL.md'), 'utf8'), 'keep\n');

    const noopState = { ...baseState, source: target, target, postflight: target };
    fs.writeFileSync(stateFile, JSON.stringify(noopState));
    const appliedTree = tree(project);
    [result, envelope] = json([...handoff, '--apply', '--json']);
    assert.equal(result.status, 0);
    assert.equal(envelope.data.applied, false);
    assert.equal(envelope.data.compatibility.compatible, true);
    assert.deepEqual(envelope.data.graphDiff, { added: [], removed: [], changed: [] });
    assert.deepEqual(envelope.mutations, [{ operation: 'handoff', path: metadata, status: 'noop', rollback: 'not-needed' }]);
    assert.deepEqual(tree(project), appliedTree);

    fs.writeFileSync(stateFile, JSON.stringify(baseState));
    fs.writeFileSync(metadata, original, { mode: 0o640 });
    fs.chmodSync(metadata, 0o640);
    [result, envelope] = json([...handoff, '--allow-incompatible', '--apply', '--json'], { POSTFLIGHT_FAIL: '1' });
    assert.equal(result.status, 1);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.mutations[0].status, 'rolled-back');
    assert.equal(envelope.mutations[0].rollback, 'succeeded');
    assert.equal(fs.readFileSync(metadata, 'latin1'), original);
    assert.deepEqual(fs.readdirSync(changeRoot).filter(name => name.startsWith('.openspec.yaml.')), []);
    [result, envelope] = json([...handoff, '--allow-incompatible', '--apply', '--json'], { RACE: 'rollback-content' });
    assert.equal(result.status, 1);
    assert.match(envelope.diagnostics[0].message, /rollback unresolved/);
    assert.equal(envelope.mutations[0].status, 'rollback-unresolved');
    assert.equal(envelope.mutations[0].rollback, 'unresolved');
    assert.equal(fs.readFileSync(metadata, 'utf8'), 'third-party\n');

    fs.writeFileSync(metadata, original, { mode: 0o640 });
    fs.chmodSync(metadata, 0o640);
    [result, envelope] = json([...handoff, '--allow-incompatible', '--apply', '--json'], { NODE_OPTIONS: `--require=${preload}`, INJECT_ROLLBACK_RENAME: '1', POSTFLIGHT_FAIL: '1' });
    assert.equal(result.status, 1);
    assert.equal(envelope.diagnostics[0].code, 'ROLLBACK_UNRESOLVED');
    assert.equal(envelope.mutations[0].status, 'rollback-unresolved');
    assert.equal(envelope.mutations[0].rollback, 'unresolved');
    assert.equal(envelope.mutations[0].recovery.retained, true);
    assert.match(envelope.mutations[0].recovery.temporaryPath, /\.openspec\.yaml\..+\.tmp$/);
    assert.equal(fs.readFileSync(envelope.mutations[0].recovery.temporaryPath, 'latin1'), original);
    fs.unlinkSync(envelope.mutations[0].recovery.temporaryPath);

    fs.writeFileSync(metadata, original, { mode: 0o640 });
    fs.chmodSync(metadata, 0o640);
    for (const race of ['content', 'path']) {
      const prior = tree(project);
      result = cli([...handoff, '--allow-incompatible', '--apply'], { OPSX_SCHEMA_TEST_RACE: race });
      assert.equal(result.status, 1, race);
      if (race === 'content') assert.match(result.stderr, /changed during preflight/);
      else {
        assert.match(result.stderr, /path identity changed|unsafe/);
        assert.notDeepEqual(tree(project), prior, `${race} must be observed, not overwritten`);
        fs.rmSync(changeRoot, { recursive: true, force: true });
        fs.renameSync(`${changeRoot}-moved`, changeRoot);
      }
      if (race === 'content') {
        assert.notDeepEqual(tree(project), prior, `${race} must be observed, not overwritten`);
        fs.writeFileSync(metadata, original, { mode: 0o640 });
      }
    }

    const rejectState = override => fs.writeFileSync(stateFile, JSON.stringify({ ...baseState, ...override }));
    for (const [name, override] of [
      ['completed-list', { list: { ...baseState.list, changes: [{ ...listed, status: 'complete', completedTasks: 3 }] } }],
      ['completed-status', { source: { ...source, isComplete: true } }],
      ['named-store', { source: { ...source, planningHome: { ...planningHome, kind: 'named-store' } } }],
      ['external-root', { source: { ...source, changeRoot: path.join(tmp, 'external') } }],
      ['wrong-name', { source: { ...source, changeName: 'other' } }],
      ['missing-schema', { schemas: baseState.schemas.filter(schema => schema.name !== 'local-target') }],
    ]) {
      rejectState(override);
      const prior = tree(project);
      result = cli([...handoff, '--allow-incompatible'], {}, project);
      assert.equal(result.status, 1, name);
      assert.deepEqual(tree(project), prior, name);
    }
    rejectState({ list: { ...baseState.list, changes: [] } });
    result = cli([...handoff, '--allow-incompatible']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not active/);

    rejectState({});
    fs.unlinkSync(metadata);
    fs.symlinkSync(path.join(project, 'openspec/config.yaml'), metadata);
    result = cli([...handoff, '--allow-incompatible']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsafe|metadata/);
    fs.unlinkSync(metadata);
    fs.writeFileSync(metadata, original, { mode: 0o640 });
    for (const invalid of ['created: today\n', 'schema: source-schema\nschema: source-schema\n', 'schema: wrong\n', 'schema: "source-schema"\n']) {
      fs.writeFileSync(metadata, invalid);
      result = cli([...handoff, '--allow-incompatible']);
      assert.equal(result.status, 1);
    }
    fs.writeFileSync(metadata, original, { mode: 0o640 });
    fs.chmodSync(metadata, 0o640);

    fs.writeFileSync(callLog, '');
    for (const args of [
      ['handoff'], ['handoff', 'selected'], ['handoff', 'archive', 'local-target'], ['handoff', '../selected', 'local-target'],
      ['handoff', 'selected', '../schema'], ['handoff', '--apply', 'local-target'], ['handoff', 'selected', 'local-target', 'extra'],
      ['handoff', 'selected', 'local-target', '--apply', '--apply'], ['handoff', 'selected', 'local-target', '-t', project, '--target', project],
      ['handoff', 'selected', 'local-target', '--json', '--apply'], ['handoff', 'selected', 'local-target', '--unknown'],
    ]) {
      result = cli(args);
      assert.equal(result.status, 2, args.join(' '));
      assert.equal(result.stdout, '');
    }
    assert.equal(fs.readFileSync(callLog, 'utf8'), '');

    const legacyState = {
      ...baseState,
      source: { changeName: 'selected', changeRoot, schemaName: 'source-schema', artifacts: sourceArtifacts.filter(artifact => artifact.status !== 'skipped') },
      target: { changeName: 'selected', changeRoot, schemaName: 'local-target', artifacts: targetArtifacts },
      postflight: { changeName: 'selected', changeRoot, schemaName: 'local-target', artifacts: targetArtifacts },
    };
    fs.writeFileSync(stateFile, JSON.stringify(legacyState));
    const legacyArgs = ['set-change-schema', 'selected', 'local-target', '-t', project, '--allow-incompatible'];
    const direct = cli(legacyArgs, {}, project, path.join(root, 'bin/openspec-schemas.js'));
    const delegated = cli(legacyArgs);
    assert.deepEqual({ status: delegated.status, stdout: delegated.stdout, stderr: delegated.stderr }, { status: direct.status, stdout: direct.stdout, stderr: direct.stderr });
    fs.writeFileSync(stateFile, JSON.stringify({ ...legacyState, source: { ...legacyState.source, isComplete: true }, target: { ...legacyState.target, isComplete: true } }));
    const legacyCompleted = cli(legacyArgs, {}, project, path.join(root, 'bin/openspec-schemas.js'));
    assert.equal(legacyCompleted.status, 0, legacyCompleted.stderr);
    fs.writeFileSync(stateFile, JSON.stringify({ ...baseState, source: { ...source, isComplete: true } }));
    const nativeCompleted = cli([...handoff, '--allow-incompatible', '--json']);
    assert.equal(nativeCompleted.status, 1);
    assert.equal(JSON.parse(nativeCompleted.stdout).diagnostics[0].code, 'CHANGE_COMPLETE');

    const packDirectory = path.join(tmp, 'pack');
    fs.mkdirSync(packDirectory);
    const packed = spawnSync('nub', ['pack', '--ignore-scripts', '--pack-destination', packDirectory, '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const packedName = JSON.parse(packed.stdout)[0].filename;
    const tarball = path.isAbsolute(packedName) ? packedName : path.join(packDirectory, packedName);
    const extracted = path.join(tmp, 'extracted');
    fs.mkdirSync(extracted);
    const unpacked = spawnSync('tar', ['-xzf', tarball, '-C', extracted], { encoding: 'utf8' });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    assert.equal(fs.existsSync(path.join(extracted, 'package/bin/change-schema.js')), true);
    const packedCli = path.join(extracted, 'package/bin/opsx-schema.js');
    fs.writeFileSync(stateFile, JSON.stringify(baseState));
    const packedPreview = cli([...handoff, '--allow-incompatible', '--json'], {}, project, packedCli);
    assert.equal(packedPreview.status, 0, packedPreview.stderr);
    assert.equal(JSON.parse(packedPreview.stdout).command, 'handoff');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

if (require.main === module) {
  module.exports(path.resolve(__dirname, '..'));
  process.stdout.write('test-opsx-handoff: parser, authority, transaction, output, package passed\n');
}
