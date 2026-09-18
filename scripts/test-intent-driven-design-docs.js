'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const defaultReadme = path.resolve(__dirname, '../openspec/schemas/intent-driven-design/README.md');
const readme = path.resolve(process.argv[2] || defaultReadme);
assert(fs.existsSync(readme), `intent-driven-design README missing: ${readme}`);
const text = fs.readFileSync(readme, 'utf8');

function section(name) {
  const heading = `## ${name}\n`;
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${name}`);
  const bodyStart = start + heading.length;
  const next = text.indexOf('\n## ', bodyStart);
  return text.slice(bodyStart, next === -1 ? text.length : next);
}

function includes(haystack, value, label = value) {
  assert(haystack.includes(value), `missing ${label}`);
}

function exactlyOnce(haystack, value, label = value) {
  assert.equal(haystack.split(value).length - 1, 1, `${label} must appear exactly once`);
}

const graph = section('Workflow And Ownership');
includes(graph, 'journey -> proposal -> (specs, design) -> adr -> tasks', 'exact graph');
for (const output of ['journey.md', 'proposal.md', 'specs/**/*.md', 'design.md', 'adr.md', 'tasks.md']) includes(graph, output, `artifact output ${output}`);
for (const owner of ['intent and scope', 'observable behavior', 'implementation guardrails', 'durable architecture', 'execution']) includes(graph, owner, `decision owner ${owner}`);

const protocol = section('Receipts And Pause Points');
for (const pause of ['pause_discovery', 'pause_route_selection', 'pause_direction_selection', 'pause_loopback_acceptance', 'pause_pre_task_handoff']) exactlyOnce(protocol, pause, `pause point ${pause}`);
for (const receipt of ['grill-me', 'grill-with-docs', 'not_applicable', 'no_material_decision']) includes(protocol, receipt, `receipt ${receipt}`);
includes(protocol, 'branch_id', 'stable branch IDs');

const routing = section('Toolkit Routing Matrix');
for (const column of ['Trigger', 'Exclusion', 'Prerequisite', 'Owner artifact', 'Optional output', 'Approval gate', 'Loopback', 'Unavailable fallback or blocker', 'Provenance and license', 'Conflict rule']) includes(routing, column, `matrix column ${column}`);
for (const route of ['Impeccable', 'Emil Kowalski', 'Garden Skills', 'Elaya Design', 'MengTo', 'Jakub Krehel', 'Tastemaker', 'Owl-Listener', 'Leonxlnx']) exactlyOnce(routing, `| ${route} |`, `route ${route}`);
for (const route of ['Impeccable', 'Emil Kowalski', 'Garden Skills', 'Elaya Design', 'MengTo', 'Jakub Krehel', 'Tastemaker', 'Owl-Listener', 'Leonxlnx']) includes(routing, `${route} exclusion:`, `${route} exclusion`);
includes(routing, 'skill_invocation_unavailable', 'unavailable-tool receipt');
includes(routing, 'smallest specialist set', 'specialist cap');
includes(routing, 'user decides', 'user conflict ownership');

const loopbacks = section('Loopbacks');
for (const ownership of ['journey owns route changes', 'proposal owns intent or scope changes', 'specs own behavior changes', 'design owns implementation-guardrail changes']) exactlyOnce(loopbacks, ownership, `loopback ownership: ${ownership}`);
includes(loopbacks, 'accepted ADRs are immutable', 'accepted ADR boundary');

const reconciliation = section('Sibling Sync And Archive Reconciliation');
let cursor = -1;
for (const step of ['sibling change IDs', 'sync or archive', 'openspec/specs/', 'existingOutputPaths', 'refresh status', 'validate', 'reconciliation receipt']) {
  const next = reconciliation.indexOf(step);
  assert(next > cursor, `sibling reconciliation sequence missing or out of order: ${step}`);
  cursor = next;
}
includes(reconciliation, 'does not automatically invalidate', 'no-auto-invalidation disclaimer');

const skills = section('Skills And Installation Boundary');
for (const baseline of ['Impeccable', 'grill-me', 'grill-with-docs', 'grilling', 'domain-modeling']) includes(skills, baseline, `baseline skill ${baseline}`);
includes(skills, 'on demand', 'on-demand specialists');
includes(skills, 'not bundled', 'toolkit bundling disclaimer');
includes(skills, 'not lifecycle authorities', 'toolkit lifecycle disclaimer');

const associated = section('Associated Skills');
const associatedEntries = [
  ['impeccable', 'https://github.com/pbakaus/impeccable/tree/f2c7051/.agents/skills/impeccable'],
  ['grill-me', 'https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/productivity/grill-me'],
  ['grill-with-docs', 'https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/grill-with-docs'],
  ['grilling', 'https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/productivity/grilling'],
  ['domain-modeling', 'https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/domain-modeling'],
];
const skillLines = associated.split('\n').filter(line => line.startsWith('- [`'));
assert.equal(skillLines.length, associatedEntries.length, 'Associated Skills must list exactly five manifest skills');
for (const [name, source] of associatedEntries) {
  const line = skillLines.find(candidate => candidate.startsWith(`- [\`${name}\`](`));
  assert(line, `missing associated skill ${name}`);
  includes(line, `](${source})`, `${name} owning pinned source link`);
  assert.match(line, / - \S.+[.!]$/, `${name} needs one-line purpose`);
}
includes(associated, 'installed automatically', 'automatic skill installation');
includes(associated, 'install guide', 'install guide attribution');
includes(associated, '`.agents/skills/`', 'automatic install location');

const provenance = section('Research Provenance');
for (const pin of ['pbakaus/impeccable/tree/f2c7051', 'mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd', 'emilkowalski/skills/tree/85e8e23', 'ConardLi/garden-skills/tree/aaf9a82', 'elayadesign/ai-design-skills/tree/1c1e97c', 'MengTo/Skills/tree/5f47e38', 'jakubkrehel/skills/tree/267330e', 'codeswithroh/tastemaker/tree/20c438e', 'Owl-Listener/designer-skills/tree/9a6930c', 'Leonxlnx/taste-skill/tree/e79ca9e']) includes(provenance, pin, `pinned provenance ${pin}`);
includes(provenance, 'research snapshot', 'research snapshot boundary');
includes(provenance, 'mutable default-branch checkout', 'mutable install boundary');

assert.doesNotMatch(routing, /repository license at snapshot/, 'matrix must not use vague license text');
for (const route of ['Impeccable', 'Emil Kowalski', 'Garden Skills', 'Elaya Design', 'MengTo', 'Jakub Krehel', 'Tastemaker', 'Owl-Listener', 'Leonxlnx']) {
  const row = routing.split('\n').find(line => line.startsWith(`| ${route} |`));
  assert.match(row, /\b(?:MIT|Apache-2\.0|GPL-3\.0|BSD-[23]-Clause|license not declared at research snapshot)\b/, `${route} missing verified license type or undeclared status`);
}

exactlyOnce(section('Validate'), 'openspec schema validate intent-driven-design', 'validation command');
console.log('test-intent-driven-design-docs: standalone journey and nine toolkit routes passed');
