'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schemasRoot = path.join(root, 'openspec/schemas');
const agentsPath = path.resolve(process.argv[2] || path.join(schemasRoot, 'AGENTS.md'));
const changelogPath = path.resolve(process.argv[3] || path.join(root, 'CHANGELOG.md'));
const schemas = fs.readdirSync(schemasRoot)
  .filter(name => fs.existsSync(path.join(schemasRoot, name, 'schema.yaml')))
  .sort();
const agents = fs.readFileSync(agentsPath, 'utf8');
const changelog = fs.readFileSync(changelogPath, 'utf8');

const childIndex = agents.split('## Child DOX Index\n')[1];
assert(childIndex, 'missing Child DOX Index');
const indexedSchemas = [...childIndex.matchAll(/^\| `([^/`]+)\/` \|/gm)]
  .map(match => match[1])
  .sort();
assert.deepEqual(indexedSchemas, schemas, 'direct schema package rows must match schema.yaml directories');

const unreleased = changelog.split('## [Unreleased]\n')[1]?.split(/\n## \[/)[0];
assert(unreleased, 'missing Unreleased section');
const added = unreleased.split('### Added\n')[1]?.split(/\n### /)[0];
assert(added, 'missing Unreleased Added section');
assert.equal(added.trim(), '- Add optional OpenSpec lifecycle companion skills and nine Compound lifecycle adapters, including continuation routers.', 'Unreleased Added must describe lifecycle additions');
const released = changelog.split('## [0.1.9] - ')[1]?.split(/\n## \[/)[0];
assert(released, 'missing released 0.1.9 section');
assert(released.includes('- Add `intent-driven-design`, a discovery-led schema with journey evidence, explicit decisions, ADRs, and verifiable tasks.'), 'released section must contain intent-driven-design feature');

console.log(`test-schema-dox-index: ${schemas.length} schema rows and Unreleased feature passed`);
