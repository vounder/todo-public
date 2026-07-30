const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const { connectDB, mongoose } = require('./db');
const { healthResponse } = require('./health');
const TodoList = require('./models/TodoList');
const Recipe = require('./models/Recipe');
const ShoppingItem = require('./models/ShoppingItem');
const ShoppingList = require('./models/ShoppingList');
const Tag = require('./models/Tag');
const SortSettings = require('./models/SortSettings');
const IngredientTagMapping = require('./models/IngredientTagMapping');
const MealPlan = require('./models/MealPlan');
const MealReserve = require('./models/MealReserve');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);

app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
app.use(express.json());

let wsClients = [];

// ============================================
// Broadcast Helper
// ============================================

function broadcast(type, data, excludeClientId = null) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  let count = 0;
  wsClients.forEach(client => {
    if (client.readyState === 1 && (!excludeClientId || client.clientId !== excludeClientId)) {
      client.send(message);
      count++;
    }
  });
  if (count > 0) console.log(` ${type} gesendet an ${count} Client(s)`);
}

// ============================================
// REST API
// ============================================

app.get('/health', (req, res) => {
  const health = healthResponse(mongoose.connection.readyState === 1);
  res.status(health.statusCode).json({ ...health.body, timestamp: Date.now() });
});

// ---- TODOS ----

app.get('/api/todos', async (req, res) => {
  try {
    const lists = await TodoList.find().lean();
    res.json({ success: true, data: lists, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/todos/sync', async (req, res) => {
  const { lists, clientId } = req.body;
  if (!Array.isArray(lists)) return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    for (const list of lists) {
      await TodoList.findOneAndUpdate(
        { id: list.id },
        { $set: list },
        { upsert: true, new: true }
      );
    }
    const updated = await TodoList.find().lean();
    broadcast('UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/todos', async (req, res) => {
  const { name, clientId } = req.body;
  try {
    const newList = await TodoList.create({ id: uuidv4(), name, createdAt: Date.now(), items: [] });
    const all = await TodoList.find().lean();
    broadcast('UPDATE', all, clientId);
    res.json({ success: true, data: newList.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  const { list, clientId } = req.body;
  try {
    const updated = await TodoList.findOneAndUpdate({ id }, { $set: list }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'List not found' });
    const all = await TodoList.find().lean();
    broadcast('UPDATE', all, clientId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId } = req.query;
  try {
    const deleted = await TodoList.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'List not found' });
    const all = await TodoList.find().lean();
    broadcast('UPDATE', all, clientId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/todos', async (req, res) => {
  try {
    await TodoList.deleteMany({});
    broadcast('UPDATE', []);
    res.json({ success: true, message: 'All data cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- RECIPES ----

app.get('/api/recipes', async (req, res) => {
  try {
    const data = await Recipe.find().lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recipes/sync', async (req, res) => {
  const { recipes: clientRecipes, clientId } = req.body;
  if (!Array.isArray(clientRecipes)) return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    for (const recipe of clientRecipes) {
      await Recipe.findOneAndUpdate({ id: recipe.id }, { $set: recipe }, { upsert: true, new: true });
    }
    const updated = await Recipe.find().lean();
    broadcast('RECIPES_UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- SHOPPING (legacy flat list) ----

app.get('/api/shopping', async (req, res) => {
  try {
    const data = await ShoppingItem.find().lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/shopping/sync', async (req, res) => {
  const { items, clientId } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    for (const item of items) {
      await ShoppingItem.findOneAndUpdate({ id: item.id }, { $set: item }, { upsert: true, new: true });
    }
    const incomingIds = items.map(i => i.id);
    await ShoppingItem.deleteMany({ id: { $nin: incomingIds } });
    const updated = await ShoppingItem.find().lean();
    broadcast('SHOPPING_UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- SHOPPING LISTS (multi-list) ----

app.get('/api/shopping-lists', async (req, res) => {
  try {
    const lists = await ShoppingList.find().lean();
    res.json({ success: true, data: lists, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/shopping-lists/sync', async (req, res) => {
  const { lists, clientId } = req.body;
  if (!Array.isArray(lists)) return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    for (const list of lists) {
      await ShoppingList.findOneAndUpdate(
        { id: list.id },
        { $set: list },
        { upsert: true, new: true }
      );
    }
    const incomingIds = lists.map(l => l.id);
    await ShoppingList.deleteMany({ id: { $nin: incomingIds } });
    const updated = await ShoppingList.find().lean();
    broadcast('SHOPPING_LISTS_UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- TAGS ----

app.get('/api/tags', async (req, res) => {
  try {
    const data = await Tag.find().lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tags/sync', async (req, res) => {
  const { tags: clientTags, clientId } = req.body;
  if (!Array.isArray(clientTags)) return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    for (const tag of clientTags) {
      await Tag.findOneAndUpdate({ id: tag.id }, { $set: tag }, { upsert: true, new: true });
    }
    const updated = await Tag.find().lean();
    broadcast('TAGS_UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- SORT SETTINGS ----

app.get('/api/sort-settings', async (req, res) => {
  try {
    let data = await SortSettings.findOne().lean();
    if (!data) data = { activeSort: 'default', sortDirection: 'asc' };
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sort-settings/sync', async (req, res) => {
  const { sortSettings: clientSettings, clientId } = req.body;
  if (!clientSettings || typeof clientSettings !== 'object') return res.status(400).json({ success: false, error: 'Invalid data format' });

  try {
    let doc = await SortSettings.findOne();
    if (doc) {
      Object.assign(doc, clientSettings);
      await doc.save();
    } else {
      doc = await SortSettings.create(clientSettings);
    }
    broadcast('SORT_SETTINGS_UPDATE', doc.toObject(), clientId);
    res.json({ success: true, data: doc.toObject(), timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- ITEM TAG MAPPINGS (gelernte Zuweisungen) ----

app.get('/api/mappings', async (req, res) => {
  try {
    const data = await IngredientTagMapping.find().lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mappings/sync', async (req, res) => {
  const { mappings, clientId } = req.body;
  if (!mappings || !Array.isArray(mappings)) return res.status(400).json({ success: false, error: 'Invalid data format' });
  try {
    for (const m of mappings) {
      await IngredientTagMapping.findOneAndUpdate(
        { ingredientName: m.ingredientName },
        { $set: { id: m.ingredientName, ingredientName: m.ingredientName, tagIds: Array.isArray(m.tagIds) ? m.tagIds : [] } },
        { upsert: true, new: true }
      );
    }
    // Einträge löschen die der Client nicht mehr hat
    const clientNames = mappings.map(m => m.ingredientName);
    await IngredientTagMapping.deleteMany({ ingredientName: { $nin: clientNames } });
    const updated = await IngredientTagMapping.find().lean();
    broadcast('MAPPINGS_UPDATE', updated, clientId);
    res.json({ success: true, data: updated, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// MEAL PLAN API
// ============================================

app.get('/api/mealplan', async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    const data = await MealPlan.find(filter).sort({ date: 1, slot: 1 }).lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mealplan', async (req, res) => {
  const { date, slot, title, status, recipeId, notes, assignedDate, clientId } = req.body;
  if (!date || !slot || !title) return res.status(400).json({ success: false, error: 'date, slot und title sind Pflichtfelder' });

  try {
    const entry = await MealPlan.create({
      id: uuidv4(),
      date,
      slot,
      title,
      status: status || 'planned',
      recipeId,
      notes,
      assignedDate,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const all = await MealPlan.find().sort({ date: 1, slot: 1 }).lean();
    broadcast('MEALPLAN_UPDATE', all, clientId);
    res.json({ success: true, data: entry.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/mealplan/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId, ...updates } = req.body;
  updates.updatedAt = Date.now();

  try {
    const updated = await MealPlan.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Entry not found' });
    const all = await MealPlan.find().sort({ date: 1, slot: 1 }).lean();
    broadcast('MEALPLAN_UPDATE', all, clientId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/mealplan/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId } = req.query;

  try {
    const deleted = await MealPlan.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Entry not found' });
    const all = await MealPlan.find().sort({ date: 1, slot: 1 }).lean();
    broadcast('MEALPLAN_UPDATE', all, clientId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// MEAL RESERVE API (Reserve-Liste)
// ============================================

app.get('/api/mealreserve', async (req, res) => {
  try {
    const data = await MealReserve.find().sort({ createdAt: 1 }).lean();
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mealreserve', async (req, res) => {
  const { title, notes, clientId } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title ist Pflichtfeld' });

  try {
    const entry = await MealReserve.create({
      id: uuidv4(),
      title,
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const all = await MealReserve.find().sort({ createdAt: 1 }).lean();
    broadcast('MEALRESERVE_UPDATE', all, clientId);
    res.json({ success: true, data: entry.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/mealreserve/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId } = req.query;

  try {
    const deleted = await MealReserve.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Entry not found' });
    const all = await MealReserve.find().sort({ createdAt: 1 }).lean();
    broadcast('MEALRESERVE_UPDATE', all, clientId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Auto-Delete Scheduler
// ============================================

async function checkAndDeleteCompletedTodos() {
  try {
    const lists = await TodoList.find({ 'settings.autoDeleteEnabled': true });
    for (const list of lists) {
      const deleteAfterMs = (list.settings.autoDeleteCompletedAfterHours || 12) * 3600000;
      const now = Date.now();
      const before = list.items.length;
      list.items = list.items.filter(item => {
        if (item.completed) return (now - item.createdAt) <= deleteAfterMs;
        return true;
      });
      if (list.items.length !== before) {
        await list.save();
        console.log(` Auto-Delete: ${before - list.items.length} Items in "${list.name}" geloescht`);
      }
    }
    const all = await TodoList.find().lean();
    broadcast('UPDATE', all);
  } catch (err) {
    console.error('Auto-Delete Fehler:', err.message);
  }
}

async function checkAndDeleteCheckedShoppingItems() {
  try {
    const cutoff = Date.now() - 24 * 3600000;
    const result = await ShoppingItem.deleteMany({ checked: true, checkedAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(` Auto-Delete: ${result.deletedCount} Shopping Items geloescht`);
      const all = await ShoppingItem.find().lean();
      broadcast('SHOPPING_UPDATE', all);
    }
  } catch (err) {
    console.error('Auto-Delete Shopping Fehler:', err.message);
  }
}

setInterval(checkAndDeleteCompletedTodos, 5 * 60 * 1000);
setInterval(checkAndDeleteCheckedShoppingItems, 5 * 60 * 1000);
console.log('Auto-Delete Scheduler gestartet');

// ============================================
// Server starten
// ============================================

async function start() {
  await connectDB();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server laeuft auf Port ${PORT}`);
    console.log(`REST API: http://0.0.0.0:${PORT}/api/todos`);
    console.log(`WebSocket: ws://0.0.0.0:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws) => {
    ws.id = uuidv4();
    ws.clientId = null; // wird vom Client per REGISTER-Message gesetzt
    ws.isAlive = true;
    wsClients.push(ws);
    console.log(`Client verbunden: ${ws.id} (${wsClients.length} aktiv)`);

    try {
      const [todos, recipes, shopping] = await Promise.all([
        TodoList.find().lean(),
        Recipe.find().lean(),
        ShoppingItem.find().lean()
      ]);
      ws.send(JSON.stringify({
        type: 'INIT',
        data: { todos, recipes, shopping },
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('INIT Fehler:', err.message);
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'REGISTER' && typeof data.clientId === 'string') {
          // Client identifiziert sich, damit Broadcasts ihn als
          // Absender ausschliessen koennen (kein Echo eigener Updates).
          ws.clientId = data.clientId;
          console.log(`Client ${ws.id} registriert als ${data.clientId}`);
        } else if (data.type === 'SYNC') {
          broadcast('UPDATE', [], ws.clientId);
        }
      } catch (err) {
        console.error('Fehler beim Parsen:', err);
      }
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      wsClients = wsClients.filter(c => c.id !== ws.id);
      console.log(`Client getrennt: ${ws.id} (${wsClients.length} aktiv)`);
    });

    ws.on('error', (err) => console.error('WebSocket Fehler:', err));
  });

  // Heartbeat: tote Verbindungen erkennen und aufraeumen
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`Client ${ws.id} reagiert nicht - Verbindung wird beendet`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30 * 1000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  process.on('SIGTERM', () => {
    console.log('SIGTERM  Server wird heruntergefahren...');
    server.close(() => { console.log('Server beendet'); process.exit(0); });
  });
}

start().catch(err => {
  console.error('Startfehler:', err);
  process.exit(1);
});
