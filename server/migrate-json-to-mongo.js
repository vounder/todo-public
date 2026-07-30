/**
 * Migration script: Import existing JSON data files into MongoDB
 * Run once: node migrate-json-to-mongo.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { connectDB } = require('./db');
const TodoList = require('./models/TodoList');
const Recipe = require('./models/Recipe');
const ShoppingItem = require('./models/ShoppingItem');
const Tag = require('./models/Tag');
const SortSettings = require('./models/SortSettings');
const IngredientTagMapping = require('./models/IngredientTagMapping');

const DATA_DIR = path.join(__dirname, 'data');

function loadJSON(filename, defaultValue = []) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`⚠️  Konnte ${filename} nicht laden:`, err.message);
  }
  return defaultValue;
}

async function migrate() {
  await connectDB();

  const todoLists = loadJSON('todos.json', []);
  const recipes = loadJSON('recipes.json', []);
  const shoppingList = loadJSON('shopping.json', []);
  const tags = loadJSON('tags.json', []);
  const sortSettings = loadJSON('sort-settings.json', null);
  const mappings = loadJSON('mappings.json', []);

  let migrated = 0;

  // --- Todo Lists ---
  for (const list of todoLists) {
    try {
      await TodoList.findOneAndUpdate(
        { id: list.id },
        { $setOnInsert: list },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`❌ TodoList ${list.id}:`, err.message);
    }
  }
  console.log(`✅ TodoLists: ${migrated}/${todoLists.length} migriert`);
  migrated = 0;

  // --- Recipes ---
  for (const recipe of recipes) {
    try {
      await Recipe.findOneAndUpdate(
        { id: recipe.id },
        { $setOnInsert: recipe },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`❌ Recipe ${recipe.id}:`, err.message);
    }
  }
  console.log(`✅ Recipes: ${migrated}/${recipes.length} migriert`);
  migrated = 0;

  // --- Shopping Items ---
  for (const item of shoppingList) {
    try {
      await ShoppingItem.findOneAndUpdate(
        { id: item.id },
        { $setOnInsert: item },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`❌ ShoppingItem ${item.id}:`, err.message);
    }
  }
  console.log(`✅ ShoppingItems: ${migrated}/${shoppingList.length} migriert`);
  migrated = 0;

  // --- Tags ---
  for (const tag of tags) {
    try {
      await Tag.findOneAndUpdate(
        { id: tag.id },
        { $setOnInsert: tag },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`❌ Tag ${tag.id}:`, err.message);
    }
  }
  console.log(`✅ Tags: ${migrated}/${tags.length} migriert`);

  // --- Sort Settings ---
  if (sortSettings) {
    try {
      const existing = await SortSettings.findOne();
      if (!existing) {
        await SortSettings.create(sortSettings);
        console.log('✅ SortSettings migriert');
      } else {
        console.log('⏭️  SortSettings bereits vorhanden, übersprungen');
      }
    } catch (err) {
      console.error('❌ SortSettings:', err.message);
    }
  }

  // --- Mappings ---
  migrated = 0;
  for (const m of mappings) {
    try {
      await IngredientTagMapping.findOneAndUpdate(
        { id: m.id },
        { $setOnInsert: m },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`❌ Mapping ${m.id}:`, err.message);
    }
  }
  console.log(`✅ Mappings: ${migrated}/${mappings.length} migriert`);

  await mongoose.disconnect();
  console.log('\n🎉 Migration abgeschlossen!');
}

migrate().catch(err => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});
