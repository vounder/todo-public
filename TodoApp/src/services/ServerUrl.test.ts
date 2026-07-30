import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiUrl,
  normalizeServerUrl,
  resolveServerUrl,
  webSocketUrl,
} from './ServerUrl';

test('normalizes HTTP(S) origins and rejects unsafe or incomplete input', () => {
  assert.equal(normalizeServerUrl(' https://sync.example.test/ '), 'https://sync.example.test');
  assert.equal(normalizeServerUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('ftp://sync.example.test'), null);
  assert.equal(normalizeServerUrl('https://user:pass@sync.example.test'), null);
  assert.equal(normalizeServerUrl('https://sync.example.test/api'), null);
  assert.equal(normalizeServerUrl('not a URL'), null);
});

test('prefers the persisted override and falls back to the build default', () => {
  assert.equal(
    resolveServerUrl('https://override.example.test', 'https://build.example.test'),
    'https://override.example.test'
  );
  assert.equal(
    resolveServerUrl('invalid', 'https://build.example.test'),
    'https://build.example.test'
  );
  assert.equal(resolveServerUrl(null, null), null);
});

test('derives REST and WebSocket endpoints from one origin', () => {
  assert.equal(apiUrl('https://sync.example.test'), 'https://sync.example.test/api');
  assert.equal(webSocketUrl('https://sync.example.test'), 'wss://sync.example.test');
  assert.equal(webSocketUrl('http://localhost:8080'), 'ws://localhost:8080');
});
