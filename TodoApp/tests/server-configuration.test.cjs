const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

function setup(initialUrl, fetcher) {
  const values = new Map(initialUrl ? [['@server_url_override', initialUrl]] : []);
  const sockets = [];
  const calls = [];
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key),
  };
  class Socket {
    readyState = 0;
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.closed = true; this.readyState = 3; }
  }
  const { ApiService } = loadTs('src/services/ApiService', {
    '@react-native-async-storage/async-storage': storage,
    './ConfigPersistence': { ConfigPersistence: { read: async () => values.get('secure') ?? null, write: async value => values.set('secure', value) } },
  }, {
    URL, process: { env: {} }, WebSocket: Socket,
    fetch: async (url, options) => { calls.push(url); return fetcher ? fetcher(url, options) : { ok: true, json: async () => ({ data: [] }) }; },
  });
  return { api: ApiService, sockets, calls, values };
}

test('a fresh public install makes no network connection before server setup', async () => {
  const { api, sockets, calls } = setup();
  await api.initialize();
  assert.equal(sockets.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(api.getServerInfo().baseUrl, 'Nicht konfiguriert');
});

test('local mode survives a restart and never sends queued changes until explicitly connected', async () => {
  const { api, sockets, calls, values } = setup();
  await api.configure();
  await api.syncTodoListsToServer([{ id: 'local', items: [] }]);
  await api.retry();
  assert.equal(api.getSyncSnapshot().localOnly, true);
  assert.equal(api.getSyncSnapshot().pending, 1);
  assert.equal(sockets.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(values.get('secure')).localOnly, true);
  assert.equal(JSON.parse(values.get('@sync_outbox_v1')).todos.body.lists[0].id, 'local');
});

test('startup uses the persisted server for both REST and WebSocket', async () => {
  const { api, sockets, calls } = setup('https://sync.example.test');
  await api.initialize();
  await api.fetchTodoListsFromServer();
  assert.deepEqual(calls, ['https://sync.example.test/api/todos']);
  assert.equal(sockets[0].url, 'wss://sync.example.test');
  api.disconnectFromServer();
});

test('configuration reconnect detaches the old socket before opening its replacement', async () => {
  const { api, sockets } = setup('https://sync.example.test');
  await api.initialize();
  api.reconnectForConfigurationChange();
  await api.initialize();
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[0].onclose, null);
  assert.equal(sockets[0].onmessage, null);
  assert.equal(sockets[1].url, 'wss://sync.example.test');
  api.disconnectFromServer();
});

test('initial server snapshot cannot erase local edits after their first sync', async () => {
  let serverLists = [];
  let releaseWrite;
  const writeStarted = new Promise(resolve => { releaseWrite = resolve; });
  let continueWrite;
  const writeGate = new Promise(resolve => { continueWrite = resolve; });
  const { api, sockets, values } = setup(undefined, async (url, options) => {
    if (options.method === 'POST') {
      releaseWrite();
      await writeGate;
      serverLists = JSON.parse(options.body).lists;
    }
    return { ok: true, json: async () => ({ data: serverLists }) };
  });
  await api.configure();
  const local = [{ id: 'kept', name: 'Local list', items: [] }];
  values.set('@todo_lists', JSON.stringify(local));
  await api.syncTodoListsToServer(local);
  await api.configure('https://sync.example.test', 'a'.repeat(64));
  await writeStarted;
  const notifications = [];
  const unsubscribe = api.subscribe('todos', data => notifications.push(data));
  sockets.at(-1).onmessage({ data: JSON.stringify({ type: 'INIT', data: { todos: [] } }) });
  continueWrite();
  await api.retry();
  for (let count = 0; count < 50 && !notifications.length; count++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.getSyncSnapshot().pending, 0);
  assert.equal(JSON.parse(values.get('@todo_lists'))[0].id, 'kept');
  assert.equal(notifications.at(-1)?.[0].id, 'kept');
  unsubscribe();
  api.disconnectFromServer();
});
