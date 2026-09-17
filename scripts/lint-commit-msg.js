'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function lint(subject, allowSystem = false) {
  if (allowSystem && (/^Merge (branch(?:es)?|remote-tracking branch|tag|commit|pull request|[0-9a-f]{7,40} into) /.test(subject) || /^Revert "[^"]+"$/.test(subject))) return;
  const match = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\r\n]+\))?: (\S.*)$/.exec(subject);
  if (!match) throw new Error('expected type(optional-scope): description; allowed types: build chore ci docs feat fix perf refactor revert style test');
  const description = match[3];
  if (!/^\p{Ll}/u.test(description) || description.trim() !== description || /[\r\n\t]/.test(description) || [...description].length > 72) {
    throw new Error('description must start with a lower-case letter, have no trailing whitespace or control characters, and contain at most 72 characters');
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === '--message') lint(args[1]);
    else if (args.length === 2 && args[0] === '--range') {
      if (args[1].startsWith('-')) throw new Error('revision must not start with -');
      const commits = execFileSync('git', ['rev-list', ...(args[1] === 'HEAD' ? ['-1'] : []), args[1], '--'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const commit of commits) {
        const subject = execFileSync('git', ['show', '-s', '--format=%s', commit], { encoding: 'utf8' }).trimEnd();
        try { lint(subject, true); } catch (error) { throw new Error(`${commit}: ${error.message}: ${subject}`); }
      }
    } else if (args.length === 1 && !args[0].startsWith('-')) {
      lint(fs.readFileSync(args[0], 'utf8').split(/\r?\n/, 1)[0], true);
    } else throw new Error('usage: lint-commit-msg.js <message-file> | --message <subject>');
  } catch (error) { console.error(`commit lint: ${error.message}`); process.exitCode = 1; }
}
module.exports = { lint };
