'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function lint(bytes, file) {
  const errors = [];
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) errors.push('UTF-8 BOM forbidden');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return ['invalid UTF-8']; }
  if (text.includes('\r')) errors.push('LF line endings required');
  if (!text.endsWith('\n')) errors.push('final newline required');
  const optional = /(^|\/)(templates|prompts|commands|specs|changes|skills|agents)\//.test(file);
  let fence = null;
  let frontmatter = false;
  let previous = optional ? 1 : 0;
  let h1 = 0;
  let priorLine = '';
  for (const [index, line] of text.split('\n').entries()) {
    const report = message => errors.push(`${index + 1}: ${message}`);
    if (/[ \t]+$/.test(line)) report('trailing whitespace');
    if (line.includes('\t') && !fence) report('tab outside code fence');
    if (index === 0 && line === '---') { frontmatter = true; continue; }
    if (frontmatter) {
      if (line === '---') frontmatter = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) { fence = marker[1]; priorLine = ''; continue; }
    const heading = /^ {0,3}(#{1,6})(?:\s|$)/.exec(line);
    const setext = priorLine.trim() && /^ {0,3}(=+|-+)\s*$/.exec(line);
    const level = heading ? heading[1].length : setext ? (setext[1][0] === '=' ? 1 : 2) : 0;
    if (level) {
      if (level === 1) h1++;
      if (level > previous + 1) report('heading hierarchy skips a level');
      previous = level;
    }
    priorLine = line;
  }
  if (fence) errors.push('unclosed code fence');
  if (h1 > 1 || (!optional && h1 !== 1)) errors.push('exactly one H1 required (zero allowed in templates, prompts, commands, specs, changes)');
  return errors;
}

if (require.main === module) {
  try {
    let files = process.argv.slice(2);
    const staged = files.length === 1 && files[0] === '--staged';
    if (staged || !files.length) {
      files = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(file => /\.md$/i.test(file));
    }
    for (const file of files) {
      const bytes = staged ? execFileSync('git', ['show', `:${file}`]) : fs.readFileSync(file);
      for (const error of lint(bytes, file)) { console.error(`${file}: ${error}`); process.exitCode = 1; }
    }
  } catch (error) { console.error(`markdown lint: ${error.message}`); process.exitCode = 1; }
}
module.exports = { lint };
