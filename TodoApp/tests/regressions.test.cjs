const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const clean = value => JSON.parse(JSON.stringify(value));
const { updateShoppingItem, moveShoppingItem, restoreShoppingItems, addIngredients } = loadTs('src/services/shopping');
const item = (id, name, checked = false) => ({ id, name, checked, createdAt: 1 });
const lists = () => [
  { id: 'weekly', name: 'Woche', createdAt: 1, items: [item('milk', 'Milch')] },
  { id: 'drugstore', name: 'Drogerie', createdAt: 1, items: [item('soap', 'Handseife')] },
];

test('All-lists delete edits the actual source and preserves the other list', () => {
  const result = updateShoppingItem(lists(), 'soap', () => null);
  assert.deepEqual(clean(result.map(list => list.items.map(item => item.id))), [['milk'], []]);
});
test('Move transfers exactly once and ignores source-equals-target or missing lists', () => {
  const original = lists();
  assert.equal(moveShoppingItem(original, 'soap', 'drugstore'), original);
  assert.equal(moveShoppingItem(original, 'soap', 'missing'), original);
  const result = moveShoppingItem(original, 'soap', 'weekly');
  assert.deepEqual(clean(result.map(list => list.items.map(item => item.id))), [['milk', 'soap'], []]);
  assert.deepEqual(clean(original), lists());
});
test('Undo removal preserves newly added articles and newer edits', () => {
  const original = lists();
  const changed = updateShoppingItem(original, 'soap', () => null);
  changed[0].items[0] = item('milk', 'Hafermilch');
  changed[1].items.push(item('new', 'Shampoo'));
  const undone = restoreShoppingItems(changed, [{ listId: 'drugstore', item: original[1].items[0], index: 0 }]);
  assert.equal(undone[0].items[0].name, 'Hafermilch');
  assert.deepEqual(clean(undone[1].items.map(item => item.id)), ['soap', 'new']);
  const twice = restoreShoppingItems(undone, [{ listId: 'drugstore', item: original[1].items[0], index: 0 }]);
  assert.equal(twice[1].items.length, 2);
});
test('Ingredient transfer does not confuse milk, coconut milk or completed purchases', () => {
  const ingredient = { id: 'i', name: 'Milch', amount: '1', unit: 'l' };
  const result = addIngredients([item('coconut', '1 l Kokosmilch'), item('done', '1 l Milch', true)], [ingredient]);
  assert.equal(result.added, 1);
  assert.equal(result.items.at(-1).name, '1 l Milch');
});
test('Identical open amounts are skipped, different quantities retained, override respected', () => {
  const ingredient = { id: 'i', name: 'Milch', amount: '1,5', unit: 'l' };
  assert.equal(addIngredients([item('a', ' 1.5  L MILCH ')], [ingredient]).skipped, 1);
  assert.equal(addIngredients([item('a', '1 l Milch')], [ingredient]).added, 1);
  assert.equal(addIngredients([], [ingredient, ingredient]).added, 1);
  assert.equal(addIngredients([], [ingredient, ingredient], [], true).added, 2);
});
test('Ingredient categories use explicit tags before learned categories', () => {
  const ingredient = { id: 'i', name: 'Milch', amount: '', unit: '', tags: ['own'] };
  const mappings = [{ ingredientName: 'Milch', tagIds: ['learned'] }];
  assert.deepEqual(clean(addIngredients([], [ingredient], mappings).items[0].tags), ['own']);
  assert.deepEqual(clean(addIngredients([], [{ ...ingredient, tags: [] }], mappings).items[0].tags), ['learned']);
});

function setup(fetcher, values = new Map()) {
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const { ApiService } = loadTs('src/services/ApiService', {
    '@react-native-async-storage/async-storage': storage,
    './ServerConfig': { ServerConfig: {
      load: async () => 'https://sync.example.test',
      getServerUrl: () => 'https://sync.example.test',
      getApiUrl: () => 'https://sync.example.test/api',
      getWebSocketUrl: () => 'wss://sync.example.test',
      getAccessKey: () => 'test-access-key',
      isLocalOnly: () => false,
    } },
  }, {
    fetch: fetcher, WebSocket: class { readyState = 3; close() {} send() {} },
  });
  return { api: ApiService, values };
}
const response = data => ({ ok: true, status: 200, json: async () => ({ data }) });
const offline = async () => { throw new Error('Offline'); };

test('Failed planner reads reject instead of replacing the saved agenda with an empty list', async () => {
  const values = new Map([['@mealplan', '[{"id":"saved"}]'], ['@meal_reserve', '[{"id":"idea"}]']]);
  const { api } = setup(offline, values);
  await assert.rejects(api.fetchMealPlan(), /Offline/);
  await assert.rejects(api.fetchMealReserve(), /Offline/);
  assert.equal(values.get('@mealplan'), '[{"id":"saved"}]');
  assert.equal(values.get('@meal_reserve'), '[{"id":"idea"}]');
  assert.equal(api.getSyncSnapshot().unavailable, true);
});
test('Failed meal and reserve mutations reject so editors can keep drafts', async () => {
  const { api } = setup(offline);
  await assert.rejects(api.createMealPlanEntry({ date: '2026-09-14', slot: 'dinner', title: 'Curry', status: 'planned' }));
  await assert.rejects(api.updateMealPlanEntry('missing', { title: 'Curry' }));
  await assert.rejects(api.createMealReserveEntry('Suppe'));
  await assert.rejects(api.deleteMealPlanEntry('saved'));
});
test('Offline edits survive an app restart and synchronize on retry', async () => {
  const { api, values } = setup(offline);
  values.set('@shopping_lists', JSON.stringify(lists()));
  await api.syncShoppingListsToServer(lists());
  await api.retry();
  assert.equal(api.getSyncSnapshot().pending, 1);
  const calls = [];
  const restarted = setup(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(lists()); }, values).api;
  await restarted.retry();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.lists, lists());
  assert.equal(restarted.getSyncSnapshot().pending, 0);
  assert.equal(values.get('@sync_outbox_v1'), '{}');
});
test('Unsent local changes take precedence over an older server fetch', async () => {
  const { api, values } = setup(offline);
  const local = lists(); values.set('@shopping_lists', JSON.stringify(local));
  await api.syncShoppingListsToServer(local);
  assert.deepEqual(clean(await api.fetchShoppingListsFromServer()), local);
  await api.retry();
});
test('A delayed GET cannot overwrite a change queued while the GET was running', async () => {
  let finishGet;
  const { api, values } = setup((url, options) => options.method === 'GET'
    ? new Promise(resolve => { finishGet = () => resolve(response([{ id: 'old' }])); })
    : offline());
  const pendingRead = api.fetchShoppingListsFromServer();
  while (!finishGet) await new Promise(resolve => setImmediate(resolve));
  values.set('@shopping_lists', JSON.stringify(lists()));
  await api.syncShoppingListsToServer(lists());
  finishGet();
  assert.deepEqual(clean(await pendingRead), lists());
  await api.retry();
});
test('A newer snapshot queued during an in-flight POST is sent as well', async () => {
  let release; const sent = [];
  const { api } = setup(async (url, options) => {
    sent.push(JSON.parse(options.body).lists);
    if (sent.length === 1) return new Promise(resolve => { release = () => resolve(response([])); });
    return response([]);
  });
  await api.syncShoppingListsToServer([{ id: 'first' }]);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await api.syncShoppingListsToServer([{ id: 'newer' }]);
  release(); await api.retry();
  assert.deepEqual(sent, [[{ id: 'first' }], [{ id: 'newer' }]]);
  assert.equal(api.getSyncSnapshot().pending, 0);
});
test('Explicit recipe deletion remains pending when the server has not installed the route', async () => {
  const { api } = setup(async () => ({ ok: false, status: 404, json: async () => { throw new Error('HTML route-not-found'); } }));
  await api.deleteRecipeFromServer('recipe-1'); await api.retry();
  assert.equal(api.getSyncSnapshot().pending, 1);
});
test('Record-not-found deletion is idempotent and can be replayed safely', async () => {
  const { api } = setup(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Recipe not found' }) }));
  await api.deleteRecipeFromServer('recipe-1'); await api.retry();
  assert.equal(api.getSyncSnapshot().pending, 0);
});
test('Clearing a recipe rating sends null so server upserts clear the previous rating', async () => {
  const { api, values } = setup(offline);
  await api.syncRecipesToServer([{ id: 'recipe', healthLevel: undefined }]); await api.retry();
  assert.equal(JSON.parse(values.get('@sync_outbox_v1')).recipes.body.recipes[0].healthLevel, null);
});

const deleteResource = require('../../server/deleteResource');
test('Server deletion targets one id and broadcasts the remaining recipes', async () => {
  let records = [{ id: 'a' }, { id: 'b' }];
  const messages = [];
  const model = {
    findOneAndDelete: async ({ id }) => { const record = records.find(item => item.id === id); records = records.filter(item => item.id !== id); return record; },
    find: () => ({ lean: async () => records }),
  };
  const handler = deleteResource(model, (...args) => messages.push(args), 'RECIPES_UPDATE', 'Recipe');
  const result = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'a' }, query: { clientId: 'this-device' } }, result);
  assert.deepEqual(records, [{ id: 'b' }]);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(messages, [['RECIPES_UPDATE', [{ id: 'b' }], 'this-device']]);
  await handler({ params: { id: 'a' }, query: {} }, result);
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error, 'Recipe not found');
});
test('A server deletion failure reports an error without broadcasting success', async () => {
  let broadcast = false;
  const handler = deleteResource({ findOneAndDelete: async () => { throw new Error('Database unavailable'); } }, () => { broadcast = true; }, 'TAGS_UPDATE', 'Tag');
  const result = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'tag' }, query: {} }, result);
  assert.equal(result.code, 500); assert.equal(broadcast, false);
});

const { LIGHT, DARK, TAG_COLORS, tagTextColor } = loadTs('src/theme/tokens', {
  'react-native': { Platform: { select: values => values.default }, StyleSheet: { hairlineWidth: 1 } },
});
function rgb(hex) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); }
function luminance(hex) {
  const channels = rgb(hex).map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }
test('Secondary text, checkbox outlines and arbitrary category colors meet contrast thresholds', () => {
  for (const palette of [LIGHT, DARK]) {
    for (const surface of [palette.bg, palette.surface]) {
      assert.ok(contrast(palette.textMuted, surface) >= 4.5, 'Secondary text on ' + surface);
      assert.ok(contrast(palette.borderStrong, surface) >= 3, 'Checkbox outline on ' + surface);
      for (const color of [...TAG_COLORS, '#FFFFFF', '#FFFF00', '#000000']) {
        const tint = '#' + rgb(color).map((channel, index) => Math.round(channel * (32 / 255) + rgb(surface)[index] * (1 - 32 / 255)).toString(16).padStart(2, '0')).join('');
        assert.ok(contrast(tagTextColor(color, palette.isDark), tint) >= 4.5, 'Category text: ' + color);
      }
    }
  }
});
