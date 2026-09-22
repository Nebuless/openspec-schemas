'use strict';

const crypto = require('node:crypto');

const IPC_TYPE = 'opsx-schema:view-ipc';
const IPC_VERSION = 2;
const MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 8;
const MAX_ITEMS = 200;
const OPERATIONS = Object.freeze(['handoff', 'skills.install', 'skills.disable', 'schema.enable']);
const KINDS = Object.freeze([
  'snapshot', 'snapshot-error', 'refresh-request', 'preview-request', 'preview-response',
  'apply-request', 'apply-response', 'action-error', 'cancel-request', 'hello',
]);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor', 'command', 'env']);

class IpcProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IpcProtocolError';
    this.code = 'IPC_PROTOCOL_INVALID';
  }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new IpcProtocolError(`${label} must be a plain object`);
}

function assertString(value, label, pattern = null, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) || (pattern && !pattern.test(value))) throw new IpcProtocolError(`${label} is invalid`);
}

function walk(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new IpcProtocolError('IPC payload is too deep');
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new IpcProtocolError('IPC array is too large');
    for (const item of value) walk(item, depth + 1);
    return;
  }
  if (!object(value)) return;
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new IpcProtocolError('IPC payload object prototype is invalid');
  const keys = Object.keys(value);
  if (keys.length > MAX_ITEMS) throw new IpcProtocolError('IPC object is too large');
  for (const key of keys) {
    if (FORBIDDEN.has(key)) throw new IpcProtocolError(`IPC field is forbidden: ${key}`);
    walk(value[key], depth + 1);
  }
}

function exactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new IpcProtocolError(`Unknown ${label} field: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new IpcProtocolError(`Missing ${label} field: ${key}`);
}

function requiredKeys(value, keys, label) {
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new IpcProtocolError(`Missing ${label} field: ${key}`);
}

function validSession(value) { return typeof value === 'string' && /^[a-f0-9]{32,128}$/.test(value); }
function validRequest(value) { return typeof value === 'string' && /^(?:initial|refresh-[1-9][0-9]*|request-[a-z0-9-]{1,80})$/.test(value); }
function validOperation(value) { return OPERATIONS.includes(value); }

function validateEnvelope(value, expectedSession = null) {
  assertObject(value, 'Envelope');
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw new IpcProtocolError('IPC payload cannot be serialized'); }
  if (typeof serialized !== 'string') throw new IpcProtocolError('IPC payload cannot be serialized');
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new IpcProtocolError('IPC payload is too large');
  walk(value);
  requiredKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId'], 'envelope');
  if (value.type !== IPC_TYPE || value.version !== IPC_VERSION || !KINDS.includes(value.kind)) throw new IpcProtocolError('Envelope type, version, or kind is invalid');
  if (!validSession(value.sessionId) || (expectedSession && value.sessionId !== expectedSession)) throw new IpcProtocolError('Envelope session is invalid');
  if (!validRequest(value.requestId)) throw new IpcProtocolError('Envelope request id is invalid');
  if (value.kind === 'refresh-request' || value.kind === 'hello') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId'], 'request');
    return value;
  }
  if (value.kind === 'cancel-request') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'token'], 'cancel request');
    assertString(value.token, 'token', /^[a-f0-9]{64}$/);
    return value;
  }
  if (value.kind === 'preview-request') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'operation', 'selectors', 'acknowledgement'], 'preview request');
    assertString(value.operation, 'operation');
    if (!validOperation(value.operation)) throw new IpcProtocolError('Operation is not allowed');
    assertObject(value.selectors, 'selectors');
    if (typeof value.acknowledgement !== 'boolean') throw new IpcProtocolError('acknowledgement must be boolean');
    return value;
  }
  if (value.kind === 'apply-request') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'operation', 'selectors', 'token', 'confirmation'], 'apply request');
    assertString(value.operation, 'operation');
    if (!validOperation(value.operation)) throw new IpcProtocolError('Operation is not allowed');
    assertObject(value.selectors, 'selectors');
    assertString(value.token, 'token', /^[a-f0-9]{64}$/);
    assertString(value.confirmation, 'confirmation', null, 160);
    if (/\r|\n/.test(value.confirmation)) throw new IpcProtocolError('Confirmation must be one line');
    return value;
  }
  if (value.kind === 'snapshot') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'snapshot'], 'snapshot');
    assertObject(value.snapshot, 'snapshot');
    return value;
  }
  if (value.kind === 'snapshot-error' || value.kind === 'action-error') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'error'], 'error response');
    assertObject(value.error, 'error');
    exactKeys(value.error, ['code', 'message'], 'error');
    assertString(value.error.code, 'error code');
    assertString(value.error.message, 'error message', null, 512);
    return value;
  }
  if (value.kind === 'preview-response') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'operation', 'preview', 'confirmation'], 'preview response');
    assertString(value.operation, 'operation');
    if (!validOperation(value.operation)) throw new IpcProtocolError('Operation is not allowed');
    assertObject(value.preview, 'preview');
    assertString(value.confirmation, 'confirmation', null, 160);
    return value;
  }
  if (value.kind === 'apply-response') {
    exactKeys(value, ['type', 'version', 'kind', 'sessionId', 'requestId', 'operation', 'result'], 'apply response');
    assertString(value.operation, 'operation');
    if (!validOperation(value.operation)) throw new IpcProtocolError('Operation is not allowed');
    assertObject(value.result, 'result');
    return value;
  }
  throw new IpcProtocolError('Unsupported IPC message');
}

function envelope(kind, sessionId, requestId, fields = {}) {
  const value = { type: IPC_TYPE, version: IPC_VERSION, kind, sessionId, requestId, ...fields };
  validateEnvelope(value, sessionId);
  return value;
}

function canonical(value, seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value !== 'object' || seen.has(value)) throw new IpcProtocolError('IPC value cannot be serialized');
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = `[${value.map(item => canonical(item, seen)).join(',')}]`;
  else if (Object.getPrototypeOf(value) === Object.prototype) result = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], seen)}`).join(',')}}`;
  else throw new IpcProtocolError('IPC value cannot be serialized');
  seen.delete(value);
  return result;
}

function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function createSessionId() { return crypto.randomBytes(24).toString('hex'); }
function createToken() { return crypto.randomBytes(32).toString('hex'); }

module.exports = { IPC_TYPE, IPC_VERSION, KINDS, OPERATIONS, IpcProtocolError, validateEnvelope, envelope, canonical, digest, createSessionId, createToken };
