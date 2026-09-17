'use strict';
const fs = require('node:fs');
const { lint } = require('./lint-markdown');
const types = ['Added', 'Changed', 'Fixed'];

function validate(bytes) {
  const errors = lint(bytes, 'CHANGELOG.md');
  if (errors.length) throw new Error(errors.join('; '));
  const text = bytes.toString('utf8');
  const lines = text.split('\n');
  const start = lines.indexOf('## [Unreleased]');
  if (start < 0 || lines.filter(line => line === '## [Unreleased]').length !== 1) throw new Error('exactly one ## [Unreleased] required');
  if (lines.slice(0, start).some(line => line.startsWith('## '))) throw new Error('Unreleased must be first release');
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end < 0) end = lines.findIndex((line, index) => index > start && /^\[[^\]]+\]:/.test(line));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);
  for (const type of types) if (section.filter(line => line === `### ${type}`).length !== 1) throw new Error(`Unreleased requires exactly one ### ${type}`);
  for (const line of section) {
    if (line && !types.some(type => line === `### ${type}`) && !/^- \S/.test(line)) throw new Error(`invalid Unreleased content: ${line}`);
  }
  const headings = section.filter(line => /^### /.test(line));
  if (headings.join('\n') !== types.map(type => `### ${type}`).join('\n')) throw new Error('Unreleased sections must be ordered Added, Changed, Fixed');
  if (section.find(line => line.trim()) !== '### Added') throw new Error('Unreleased content must start with ### Added');
  return { lines, start, end };
}

function update(bytes, type, message) {
  if (!types.includes(type)) throw new Error('type must be Added, Changed, or Fixed');
  if (!message || message !== message.trim() || /[\x00-\x1f\x7f]/.test(message)) throw new Error('message must be nonempty single-line text without surrounding whitespace');
  const { lines, start, end } = validate(bytes);
  const heading = lines.indexOf(`### ${type}`, start);
  let next = lines.findIndex((line, index) => index > heading && index < end && /^### /.test(line));
  if (next < 0) next = end;
  const entry = `- ${message}`;
  if (lines.slice(start + 1, end).includes(entry)) return bytes.toString('utf8');
  let insertion = next;
  while (insertion > heading + 1 && !lines[insertion - 1]) insertion--;
  lines.splice(insertion, 0, ...(insertion === heading + 1 ? [''] : []), entry);
  const result = lines.join('\n');
  validate(Buffer.from(result));
  return result;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const bytes = fs.readFileSync('CHANGELOG.md');
    if (args.length === 1 && args[0] === '--check') validate(bytes);
    else if (args.length === 4 && args[0] === '--type' && args[2] === '--message') {
      const result = update(bytes, args[1], args[3]);
      if (result !== bytes.toString('utf8')) fs.writeFileSync('CHANGELOG.md', result);
    } else throw new Error('usage: update-changelog.js --type <Added|Changed|Fixed> --message <text> | --check');
  } catch (error) { console.error(`changelog: ${error.message}`); process.exitCode = 1; }
}
module.exports = { validate, update };
