'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readmePath = path.resolve(process.argv[2] || path.join(root, 'README.md'));
const guidePath = path.join(root, 'AGENT_INSTALL.md');
const schemasPath = path.join(root, 'openspec/schemas');
const readme = fs.readFileSync(readmePath, 'utf8');
const guide = fs.readFileSync(guidePath, 'utf8');
const packagedSchemas = fs.readdirSync(schemasPath)
  .filter(name => fs.existsSync(path.join(schemasPath, name, 'schema.yaml')))
  .sort();

function section(text, name) {
  const heading = `## ${name}\n`;
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${name}`);
  const bodyStart = start + heading.length;
  const next = text.indexOf('\n## ', bodyStart);
  return text.slice(bodyStart, next === -1 ? text.length : next);
}

function includes(text, value, label = value) {
  assert(text.includes(value), `missing ${label}`);
}

assert.equal(packagedSchemas.length, 9, 'expected nine packaged schemas');
includes(readme, 'adds nine focused alternatives', 'unambiguous nine-schema count');
includes(readme, `Package source is version \`${packageManifest.version}\`.`, 'source package version');
includes(readme, 'https://github.com/intent-driven-dev/openspec-schemas', 'fork source link');
includes(readme, "Hari Krishnan's OpenSpec Custom Schemas", 'fork author credit');
includes(readme, 'https://github.com/harikrishnan83', 'fork author link');
includes(readme, 'https://github.com/Fission-AI/OpenSpec', 'underlying platform link');
for (const schema of ['minimalist', 'event-driven', 'spec-driven-with-adr', 'behaviour-driven', 'intent-driven']) {
  includes(readme, `\`${schema}\``, `upstream baseline schema ${schema}`);
}
for (const addition of ['npm package', 'source-aware skill installer', 'guarded schema switching', 'opt-in MCP catalogs', '`opsx-schema` CLI']) {
  includes(readme, addition, `fork addition ${addition}`);
}

const catalog = section(readme, 'Choosing a Schema');
const catalogRows = catalog.split('\n').filter(line => line.startsWith('| '));
assert.equal(catalogRows.filter(line => line.startsWith('| `spec-driven` (built-in) |')).length, 1, 'catalog must contain one upstream built-in row');

for (const schema of packagedSchemas) {
  const link = `| [\`${schema}\`](./openspec/schemas/${schema}/README.md) |`;
  assert.equal(catalogRows.filter(line => line.startsWith(link)).length, 1, `catalog must contain exactly one linked ${schema} row`);
}
assert.equal(catalogRows.length, packagedSchemas.length + 2, 'catalog must contain header, built-in, and nine packaged rows');

const designRow = catalogRows.find(line => line.startsWith('| [`intent-driven-design`](./openspec/schemas/intent-driven-design/README.md) |'));
assert(designRow, 'missing intent-driven-design catalog row');
includes(designRow, '`journey -> proposal -> (specs, design) -> adr -> tasks`', 'intent-driven-design exact graph');
includes(designRow, 'discovery evidence', 'intent-driven-design fit');

const guideIntro = guide.slice(0, guide.indexOf('\n## Prerequisites'));
for (const schema of packagedSchemas) includes(guideIntro, `\`${schema}\``, `AGENT_INSTALL schema ${schema}`);
assert.equal((guideIntro.match(/`intent-driven-design`/g) || []).length, 1, 'AGENT_INSTALL schema list must contain intent-driven-design once');

const activation = section(guide, 'Local or Unreleased Fallback');
includes(activation, '`intent-driven-design` uses `journey`, `proposal`, `specs`, `design`, `adr`, and `tasks`', 'intent-driven-design rule IDs');
includes(activation, 'journey -> proposal -> (specs, design) -> adr -> tasks', 'intent-driven-design guide graph');

const skills = section(guide, 'Local or Unreleased Fallback');
for (const name of ['impeccable', 'grill-me', 'grill-with-docs', 'grilling', 'domain-modeling']) includes(skills, `\`${name}\``, `baseline skill ${name}`);
includes(skills, 'source-qualified', 'source-aware baseline install');
includes(skills, 'specialist', 'specialists');
includes(skills, 'on demand', 'specialists on demand');
includes(skills, 'not declared in `skills.txt`', 'specialists excluded from manifest');

const switching = section(guide, "Changing a Change's Schema");
includes(switching, 'updates only', 'metadata-only schema switch');
includes(switching, ".openspec.yaml", 'change-local metadata');
includes(switching, 'never migrates artifacts automatically', 'no automatic migration');
includes(switching, 'reconcile existing artifacts yourself', 'manual reconciliation');

console.log('test-intent-driven-design-catalog: built-in plus 9 packaged schemas and install guidance passed');
