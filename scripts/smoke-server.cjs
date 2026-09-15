const fs = require('node:fs');
const assert = require('node:assert/strict');
const { WebSocket } = require('../server/node_modules/ws');
const { readEnv } = require('../server/setup/config');

async function main() {
  const env = readEnv('.env');
  const origin = `http://127.0.0.1:${env.SERVER_HOST_PORT}`;
  const headers = { Authorization: `Bearer ${env.TODO_ACCESS_KEY}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(origin + '/api/todos')).status, 401);
  const health = await (await fetch(origin + '/health')).json();
  assert.equal(health.database, 'ready');
  const access = await fetch(origin + '/api/connection', { headers });
  assert.equal(access.status, 200);
  const created = await fetch(origin + '/api/todos', { method: 'POST', headers, body: JSON.stringify({ name: 'Installation smoke test', clientId: 'smoke-test' }) });
  assert.equal(created.ok, true);
  const lists = await (await fetch(origin + '/api/todos', { headers })).json();
  const item = lists.data.find(list => list.name === 'Installation smoke test');
  assert.ok(item);
  const ws = new WebSocket(origin.replace('http:', 'ws:'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket timeout')); }, 7000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'REGISTER', clientId: 'smoke-test', accessKey: env.TODO_ACCESS_KEY })));
    ws.on('error', reject);
    ws.on('message', data => { if (JSON.parse(data).type === 'AUTH_OK') { clearTimeout(timer); resolve(); } });
  });
  ws.close();
  assert.equal((await fetch(origin + '/api/todos/' + encodeURIComponent(item.id), { method: 'DELETE', headers })).ok, true);
  assert.ok(fs.readFileSync('setup-card.local.html', 'utf8').includes('<svg'));
  console.log('Docker installation: healthy database, authenticated HTTP/WebSocket, list create/read/delete and QR card verified.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
