const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');
const { createAccessControl } = require('../../server/auth');
const { socketSession } = require('../../server/socketSession');
const loadTs = require('./load-ts.cjs');
const key = 'b'.repeat(64);
const { probeConnection } = loadTs('src/services/ConnectionProbe', {}, { URL, fetch, WebSocket });
const { parseConnectionLink } = loadTs('src/services/ConnectionLink', {}, { URL });

async function fixture(t, { databaseReady = true, denySocket = false, unrelated = false } = {}) {
  const access = createAccessControl(key);
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/connection' && !access.accepts((req.headers.authorization || '').slice(7))) { res.writeHead(401); res.end('{}'); return; }
    res.writeHead(databaseReady ? 200 : 503);
    res.end(JSON.stringify({ service: unrelated ? 'another-app' : 'todo-public', protocol: 1, database: databaseReady ? 'ready' : 'not-ready' }));
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', ws => socketSession(ws, { accepts: value => !denySocket && access.accepts(value), ready: () => databaseReady, register() {}, unregister() {}, initialData: async () => ({}), sync() {} }));
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('real HTTP and WebSocket handshake report all connection stages', async t => {
  const result = await probeConnection(await fixture(t), key);
  assert.equal(result.success, true);
  assert.ok(result.checks.every(check => check.state === 'success'));
});
test('bad keys fail authentication without reporting a successful connection', async t => {
  const result = await probeConnection(await fixture(t), 'bad');
  assert.equal(result.success, false);
  assert.equal(result.checks.find(check => check.id === 'authentication').state, 'error');
  assert.equal(result.checks.find(check => check.id === 'websocket').state, 'waiting');
});
test('database not ready and unrelated HTTP servers produce actionable errors', async t => {
  const unavailable = await probeConnection(await fixture(t, { databaseReady: false }), key);
  assert.equal(unavailable.checks.find(check => check.id === 'database').state, 'error');
  const wrong = await probeConnection(await fixture(t, { unrelated: true }), key);
  assert.equal(wrong.checks[0].state, 'error');
});
test('WebSocket rejection cannot be mistaken for successful HTTP-only setup', async t => {
  const result = await probeConnection(await fixture(t, { denySocket: true }), key);
  assert.equal(result.success, false);
  assert.equal(result.checks.at(-1).state, 'error');
});
test('slow HTTP bodies time out and cancellation stops setup', async t => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); });
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const timeout = await probeConnection(origin, key, { timeoutMs: 100 });
  assert.equal(timeout.success, false); assert.equal(timeout.checks[0].state, 'error');
  const abort = new AbortController(); abort.abort();
  const cancelled = await probeConnection(origin, key, { signal: abort.signal });
  assert.equal(cancelled.success, false); assert.match(cancelled.checks[0].message, /abgebrochen/);
});
test('QR imports only the Todo connection format and rejects credentials in origins', () => {
  const link = `todopublic://connect?server=${encodeURIComponent('https://sync.example.test')}#key=${key}`;
  const result = parseConnectionLink(link);
  assert.equal(result.url, 'https://sync.example.test'); assert.equal(result.key, key);
  assert.throws(() => parseConnectionLink('https://sync.example.test'));
  assert.throws(() => parseConnectionLink('todopublic://connect?server=invalid#key=short'));
  assert.throws(() => parseConnectionLink(`todopublic://connect?server=${encodeURIComponent('https://user:pass@sync.example.test')}#key=${key}`));
});
