'use strict';
const fs = require('node:fs');
const path = require('node:path');

function stat(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function identity(info) {
  if (!info) return { exists: false };
  return { exists: true, dev: info.dev, ino: info.ino, type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : info.isSymbolicLink() ? 'symlink' : 'special' };
}

function sameIdentity(expected, current) {
  return expected.exists === current.exists && (!expected.exists || (expected.dev === current.dev && expected.ino === current.ino && expected.type === current.type));
}

function absoluteChain(file) {
  const chain = [];
  let current = path.resolve(file);
  for (;;) {
    chain.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) return chain;
    current = parent;
  }
}

function createAbsolutePathGuard(files, fail) {
  const states = new Map();
  const remember = file => {
    for (const current of absoluteChain(file)) if (!states.has(current)) states.set(current, identity(stat(current)));
  };
  const verifyOne = current => {
    const expected = states.get(current);
    if (!expected || !sameIdentity(expected, identity(stat(current))) || (expected.exists && ['symlink', 'special'].includes(expected.type))) fail(`Path identity changed: ${current}`);
  };
  const verify = file => {
    for (const current of absoluteChain(file)) verifyOne(current);
  };
  const update = file => states.set(path.resolve(file), identity(stat(path.resolve(file))));
  const ensureDirectory = file => {
    const chain = absoluteChain(file);
    verifyOne(chain[0]);
    for (let index = 1; index < chain.length; index += 1) {
      const parent = chain[index - 1];
      const current = chain[index];
      verifyOne(parent);
      const expected = states.get(current);
      if (!expected) fail(`Untracked path: ${current}`);
      if (!expected.exists) {
        if (stat(current)) fail(`Path appeared: ${current}`);
        fs.mkdirSync(current);
        update(current);
      } else {
        verifyOne(current);
        if (expected.type !== 'directory') fail(`Directory path changed type: ${current}`);
      }
    }
  };
  for (const file of files) remember(file);
  return { remember, verify, update, ensureDirectory };
}

function createPathGuard(projectRoot, relatives, fail) {
  const states = new Map([[projectRoot, identity(stat(projectRoot))]]);
  const remember = relative => {
    let current = projectRoot;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (!states.has(current)) states.set(current, identity(stat(current)));
    }
  };
  for (const relative of relatives) remember(relative);
  const verifyAbsolute = absolute => {
    const expected = states.get(absolute);
    if (!expected || !sameIdentity(expected, identity(stat(absolute))) || (expected.exists && ['symlink', 'special'].includes(expected.type))) fail('TARGET_CHANGED', `Project path identity changed: ${path.relative(projectRoot, absolute) || '.'}`);
  };
  const verify = relative => {
    let current = projectRoot;
    verifyAbsolute(current);
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      verifyAbsolute(current);
    }
  };
  const update = relative => {
    const absolute = path.join(projectRoot, ...relative.split('/'));
    states.set(absolute, identity(stat(absolute)));
  };
  const ensureDirectory = relative => {
    let current = projectRoot;
    const built = [];
    verifyAbsolute(current);
    for (const part of relative.split('/')) {
      built.push(part);
      const parent = current;
      current = path.join(current, part);
      verifyAbsolute(parent);
      const expected = states.get(current);
      if (!expected) fail('TARGET_CHANGED', `Untracked project path: ${built.join('/')}`);
      if (!expected.exists) {
        if (stat(current)) fail('TARGET_CHANGED', `Project path appeared: ${built.join('/')}`);
        fs.mkdirSync(current, { mode: 0o700 });
        states.set(current, identity(stat(current)));
      } else {
        verifyAbsolute(current);
        if (expected.type !== 'directory') fail('UNSAFE_TARGET', `Directory path changed type: ${built.join('/')}`);
      }
    }
  };
  return { verify, update, ensureDirectory, remember };
}

module.exports = { createAbsolutePathGuard, createPathGuard };
