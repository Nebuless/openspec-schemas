'use strict';
const fs = require('node:fs');
const path = require('node:path');

function stat(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function directories(directory) {
  for (;;) {
    const info = stat(directory);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`unsafe directory: ${directory}`);
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function verifyPath(projectRoot, absolute, finalType = 'directory') {
  if (!inside(projectRoot, absolute)) throw new Error(`unsafe path outside project: ${absolute}`);
  const relative = path.relative(projectRoot, absolute);
  let current = projectRoot;
  const projectInfo = stat(current);
  if (!projectInfo || !projectInfo.isDirectory() || projectInfo.isSymbolicLink()) throw new Error(`unsafe project root: ${projectRoot}`);
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = stat(current);
    if (!info || info.isSymbolicLink()) throw new Error(`unsafe or missing path: ${current}`);
    if (current !== absolute && !info.isDirectory()) throw new Error(`unsafe path ancestor: ${current}`);
    if (current === absolute && (finalType === 'directory' ? !info.isDirectory() : !info.isFile())) throw new Error(`unsafe ${finalType}: ${current}`);
  }
}

function identity(info) {
  return info && info.isFile() && !info.isSymbolicLink() ? { dev: info.dev, ino: info.ino } : null;
}

function sameFile(file, expected, bytes) {
  const current = identity(stat(file));
  return current && current.dev === expected.dev && current.ino === expected.ino && fs.readFileSync(file).equals(bytes);
}

function injectRace(source, metadata, original) {
  if (process.env.OPSX_SCHEMA_TEST_RACE === 'content') fs.writeFileSync(metadata, Buffer.from(original.toString('latin1').replace('created:', 'raced:'), 'latin1'));
  if (process.env.OPSX_SCHEMA_TEST_RACE === 'path') {
    fs.renameSync(source.changeRoot, `${source.changeRoot}-moved`);
    fs.mkdirSync(source.changeRoot);
  }
}

function rollbackRecovery(rollback, rollbackIdentity, original) {
  if (!rollback || !rollbackIdentity) return { retained: false, temporaryPath: null, reason: 'no rollback temporary was created' };
  if (sameFile(rollback, rollbackIdentity, original)) return { retained: true, temporaryPath: rollback, reason: 'original metadata retained after rollback failure' };
  const current = identity(stat(rollback));
  if (!current || current.dev !== rollbackIdentity.dev || current.ino !== rollbackIdentity.ino) return { retained: true, temporaryPath: rollback, reason: 'rollback temporary identity changed; cleanup refused' };
  try {
    fs.unlinkSync(rollback);
    return { retained: false, temporaryPath: null, reason: 'unusable rollback temporary cleaned' };
  } catch {
    return { retained: true, temporaryPath: rollback, reason: 'rollback temporary cleanup failed' };
  }
}

module.exports = { directories, identity, injectRace, inside, rollbackRecovery, sameFile, stat, verifyPath };
