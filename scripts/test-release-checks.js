'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lint: lintCommit } = require('./lint-commit-msg');
const { lint: lintMarkdown } = require('./lint-markdown');
const { update, validate } = require('./update-changelog');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-checks-'));
const changelog = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n';
const run = (command, args, cwd = root) => spawnSync(command, args, { cwd, encoding: 'utf8' });
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

try {
  for (const message of ['feat: add checker', 'fix(parser): reject bad input', 'docs(API): clarify output', `feat: ${'a'.repeat(72)}`]) assert.doesNotThrow(() => lintCommit(message));
  for (const message of ['Feature: bad type', 'fix: Uppercase start', 'fix missing colon', `fix: ${'a'.repeat(73)}`]) assert.throws(() => lintCommit(message));
  assert.throws(() => lintCommit("Merge branch 'main'"));
  assert.doesNotThrow(() => lintCommit("Merge branch 'main'", true));

  assert.deepEqual(lintMarkdown(Buffer.from('# Good\n\n## Child\n\n```js\nconst x = 1;\n```\n'), 'doc.md'), []);
  assert(lintMarkdown(Buffer.from('## Skipped\n'), 'doc.md').length);
  assert(lintMarkdown(Buffer.from('# Bad\r\n'), 'doc.md').some(error => error.includes('LF')));
  assert(lintMarkdown(Buffer.from('# Bad\n\ttext\n'), 'doc.md').some(error => error.includes('tab')));
  assert(lintMarkdown(Buffer.from('---\nname:\tbad\n---\n# Bad\n'), 'doc.md').some(error => error.includes('tab')));
  assert(lintMarkdown(Buffer.from('---\nkey:\tvalue\n---\n# Bad\n'), 'doc.md').some(error => error.includes('tab')));
  assert(lintMarkdown(Buffer.from('# Bad  \n'), 'doc.md').some(error => error.includes('trailing')));
  assert(lintMarkdown(Buffer.from('# Bad'), 'doc.md').some(error => error.includes('final newline')));
  assert(lintMarkdown(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Bad\n')]), 'doc.md').some(error => error.includes('BOM')));
  assert(lintMarkdown(Buffer.from('# Parent\n\n### Skipped\n'), 'doc.md').some(error => error.includes('skips')));
  assert.deepEqual(lintMarkdown(Buffer.from('## Template section\n'), 'templates/doc.md'), []);
  assert(lintMarkdown(Buffer.from('# Bad\n```\n'), 'doc.md').some(error => error.includes('unclosed')));

  validate(Buffer.from(changelog));
  const changed = update(Buffer.from(changelog), 'Added', 'Add release checks.');
  assert.match(changed, /### Added\n\n- Add release checks\./);
  assert.equal(update(Buffer.from(changed), 'Added', 'Add release checks.'), changed);
  assert.equal(update(Buffer.from(changed), 'Fixed', 'Add release checks.'), changed);
  assert.throws(() => update(Buffer.from(changelog), 'Removed', 'No.'));
  assert.throws(() => validate(Buffer.from('# Changelog\n\n## [Unreleased]\n\n### Added\n')));
  assert.throws(() => validate(Buffer.from('# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n### Added\n\n### Changed\n')));

  const repo = path.join(tmp, 'repo');
  write(path.join(repo, 'good.md'), '# Good\n');
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.mkdirSync(path.join(repo, '.githooks'));
  for (const file of ['lint-commit-msg.js', 'lint-markdown.js', 'update-changelog.js']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(repo, 'scripts', file));
  fs.copyFileSync(path.join(root, 'scripts/lint-commits.sh'), path.join(repo, 'scripts/lint-commits.sh'));
  for (const file of ['commit-msg', 'pre-commit', 'pre-push']) fs.copyFileSync(path.join(root, '.githooks', file), path.join(repo, '.githooks', file));
  write(path.join(repo, 'scripts/quality.sh'), '#!/bin/sh\nexit 0\n');
  write(path.join(repo, 'CHANGELOG.md'), changelog);
  assert.equal(run('node', ['scripts/update-changelog.js', '--type', 'Added', '--message', 'Add fixture check.'], repo).status, 0);
  assert.match(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'), /- Add fixture check\./);
  assert.equal(run('git', ['init', '-q'], repo).status, 0);
  assert.equal(run('git', ['config', 'user.email', 'test@example.com'], repo).status, 0);
  assert.equal(run('git', ['config', 'user.name', 'Test'], repo).status, 0);
  assert.equal(run('git', ['add', 'good.md'], repo).status, 0);
  const preCommit = run('sh', ['.githooks/pre-commit'], repo);
  assert.equal(preCommit.status, 0, preCommit.stderr);
  write(path.join(repo, 'bad.md'), '# Bad\t\n');
  assert.equal(run('git', ['add', 'bad.md'], repo).status, 0);
  assert.notEqual(run('sh', ['.githooks/pre-commit'], repo).status, 0);
  write(path.join(repo, 'COMMIT_EDITMSG'), 'feat: valid subject\n\nbody\n');
  assert.equal(run('sh', ['.githooks/commit-msg', 'COMMIT_EDITMSG'], repo).status, 0);
  write(path.join(repo, 'COMMIT_EDITMSG'), 'bad subject\n');
  assert.notEqual(run('sh', ['.githooks/commit-msg', 'COMMIT_EDITMSG'], repo).status, 0);
  assert.equal(run('git', ['commit', '--no-verify', '-m', 'feat: add good doc'], repo).status, 0);
  const goodHead = run('git', ['rev-parse', 'HEAD'], repo).stdout.trim();
  const pushInput = `refs/heads/main ${goodHead} refs/heads/main 0000000000000000000000000000000000000000\n`;
  assert.equal(spawnSync('sh', ['.githooks/pre-push', 'origin', 'unused'], { cwd: repo, input: pushInput, encoding: 'utf8' }).status, 0);
  write(path.join(repo, 'next.txt'), 'next\n');
  assert.equal(run('git', ['add', 'next.txt'], repo).status, 0);
  assert.equal(run('git', ['commit', '--no-verify', '-m', 'bad subject'], repo).status, 0);
  const badHead = run('git', ['rev-parse', 'HEAD'], repo).stdout.trim();
  const badPushInput = `refs/heads/main ${badHead} refs/heads/main 0000000000000000000000000000000000000000\n`;
  assert.notEqual(spawnSync('sh', ['.githooks/pre-push', 'origin', 'unused'], { cwd: repo, input: badPushInput, encoding: 'utf8' }).status, 0);
  for (const hook of ['commit-msg', 'pre-commit', 'pre-push']) {
    assert(fs.statSync(path.join(root, '.githooks', hook)).mode & 0o111, `${hook} must be executable`);
  }
  assert.match(fs.readFileSync(path.join(root, '.githooks/pre-push'), 'utf8'), /quality\.sh --require-qlty/);
  assert.match(fs.readFileSync(path.join(root, '.githooks/pre-push'), 'utf8'), /lint-commits\.sh/);
  assert.match(fs.readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8'), /lint-markdown\.js --staged/);
  assert.match(fs.readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8'), /diff --cached --check/);
  console.log('test-release-checks: commits, Markdown, changelog, hooks passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
