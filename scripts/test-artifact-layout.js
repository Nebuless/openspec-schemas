'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const schemas = fs.readdirSync(path.join(root, 'openspec/schemas'))
  .filter(name => fs.existsSync(path.join(root, 'openspec/schemas', name, 'schema.yaml')));
assert.equal(schemas.length, 8);
const required = ['changeRoot', 'artifactPaths', 'resolvedOutputPath', 'non-empty', '<changeRoot>/specs/<capability>/spec.md'];
function check(file) {
  const text = read(file);
  for (const phrase of required) assert(text.includes(phrase), `${file}: missing ${phrase}`);
  assert.doesNotMatch(text, /openspec\/changes\/<change>\/adr\.md/, file);
  return text;
}
for (const name of schemas) {
  const base = `openspec/schemas/${name}`;
  const yaml = check(`${base}/schema.yaml`);
  const specs = yaml.split('  - id: specs\n')[1].split('\n  - id: ')[0];
  for (const phrase of [...required, 'existingOutputPaths', 'specs/**/*.md', 'empty directory']) {
    assert(specs.includes(phrase), `${name} specs instruction: missing ${phrase}`);
  }
  check(`${base}/README.md`);
}
for (const host of ['.opencode', '.claude', '.codex', '.omp']) {
  for (const name of fs.readdirSync(path.join(root, host, 'skills')).filter(name => name.startsWith('openspec-') && name !== 'openspec-linearized')) {
    check(`${host}/skills/${name}/SKILL.md`);
  }
}
for (const directory of ['.opencode/commands', '.claude/commands/opsx']) {
  for (const name of fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.md') && !name.startsWith('opsx-ce-'))) {
    check(`${directory}/${name}`);
  }
}
for (const name of ['define', 'plan', 'work', 'debug', 'review', 'validate', 'compound']) {
  const file = `opsx-ce-${name}.md`;
  const body = read(`openspec/schemas/compound-intent-driven/adapters/shared/${file}`);
  for (const phrase of ['artifactPaths', 'resolvedOutputPath', 'existingOutputPaths', 'non-empty']) {
    assert(body.includes(phrase), `${file}: missing ${phrase}`);
  }
  if (name === 'plan') check(`openspec/schemas/compound-intent-driven/adapters/shared/${file}`);
  for (const host of ['.senpi', '.pi', '.atomic']) assert.equal(read(`${host}/prompts/${file}`), body);
  assert.equal(read(`.opencode/commands/${file}`).replace(/^---\n[^\n]+\n---\n/, ''), body);
}
console.log('test-artifact-layout: 8 schemas, all OpenSpec skills/commands, 28 adapter projections passed');
