const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const { createAccessControl } = require('../auth');
const { socketSession } = require('../socketSession');

const key = 'a'.repeat(64);
test('server refuses to start without a strong access key', () => {
  assert.throws(() => createAccessControl(), /TODO_ACCESS_KEY/);
  assert.throws(() => createAccessControl('short'), /TODO_ACCESS_KEY/);
});
test('HTTP routes reject missing and invalid keys and accept a valid bearer', async t => {
  const app = express();
  app.use('/api', createAccessControl(key).middleware);
  app.get('/api/todos', (req, res) => res.json({ data: ['private'] }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/todos`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  assert.deepEqual(await response.json(), { data: ['private'] });
});
test('WebSocket sends no data before auth; bad keys cannot subscribe or cause broadcasts', async t => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  let reads = 0; let registrations = 0; let syncs = 0;
  wss.on('connection', ws => socketSession(ws, {
    accepts: createAccessControl(key).accepts, ready: () => true,
    register: () => registrations++, unregister: () => registrations--,
    initialData: async () => { reads++; return { todos: ['private'] }; }, sync: () => syncs++, timeout: 150,
  }));
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); });
  const url = `ws://127.0.0.1:${server.address().port}`;
  const unauthenticated = new WebSocket(url); const leaked = [];
  unauthenticated.on('message', data => leaked.push(data));
  const closeCode = await new Promise(resolve => unauthenticated.once('close', resolve));
  assert.equal(closeCode, 4401); assert.equal(reads, 0); assert.equal(registrations, 0); assert.deepEqual(leaked, []);
  const invalid = new WebSocket(url);
  invalid.on('open', () => invalid.send(JSON.stringify({ type: 'REGISTER', clientId: 'x', accessKey: 'bad' })));
  assert.equal(await new Promise(resolve => invalid.once('close', resolve)), 4401);
  assert.equal(reads, 0); assert.equal(syncs, 0);
  const valid = new WebSocket(url); const frames = [];
  valid.on('open', () => valid.send(JSON.stringify({ type: 'REGISTER', clientId: 'x', accessKey: key })));
  await new Promise((resolve, reject) => {
    valid.on('error', reject);
    valid.on('message', data => { frames.push(JSON.parse(data)); if (frames.length === 2) resolve(); });
  });
  assert.equal(frames[0].type, 'AUTH_OK'); assert.deepEqual(frames[1].data.todos, ['private']); assert.equal(reads, 1);
  valid.close();
});
