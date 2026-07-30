const http = require('http');
const https = require('https');

const configuredServerUrl = process.env.TODO_SERVER_URL;
if (!configuredServerUrl) {
  throw new Error(
    'TODO_SERVER_URL is required. Run the setup first or provide an HTTP(S) server URL.'
  );
}

const parsedServerUrl = new URL(configuredServerUrl);
if (!['http:', 'https:'].includes(parsedServerUrl.protocol)) {
  throw new Error('TODO_SERVER_URL must use http:// or https://.');
}

const configuredPath = parsedServerUrl.pathname.replace(/\/+$/, '');
const apiPath = configuredPath.endsWith('/api')
  ? configuredPath
  : `${configuredPath}/api`;
const SERVER_URL = `${parsedServerUrl.origin}${apiPath}`;

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const transport = urlObj.protocol === 'https:' ? https : http;
    const req = transport.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          json: async () => JSON.parse(data),
          text: async () => data,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Tag-Definitionen für Lebensmittel-Kategorien
const tagDefinitions = [
  { name: 'Fleisch', color: '#FF6B6B' },
  { name: 'Gemüse', color: '#4ECDC4' },
  { name: 'Milchprodukte', color: '#45B7D1' },
  { name: 'Kohlenhydrate', color: '#FFA07A' },
  { name: 'Gewürze', color: '#F7DC6F' },
  { name: 'Konserven', color: '#BB8FCE' },
  { name: 'Tiefkühl', color: '#85C1E2' },
  { name: 'Backwaren', color: '#98D8C8' },
];

// Rezept-Definitionen mit Zutaten und Tags
const recipeDefinitions = [
  {
    name: 'Kartoffelsuppe',
    ingredients: [
      { name: 'Kartoffeln', amount: '800', unit: 'g', tags: ['Gemüse'] },
      { name: 'Möhren', amount: '2', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Lauch', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Gemüsebrühe', amount: '1', unit: 'l', tags: ['Konserven'] },
      { name: 'Sahne', amount: '200', unit: 'ml', tags: ['Milchprodukte'] },
      { name: 'Salz', amount: '1', unit: 'TL', tags: ['Gewürze'] },
      { name: 'Pfeffer', amount: '1', unit: 'TL', tags: ['Gewürze'] },
    ]
  },
  {
    name: 'Chili con Carne',
    ingredients: [
      { name: 'Rinderhackfleisch', amount: '500', unit: 'g', tags: ['Fleisch'] },
      { name: 'Kidneybohnen', amount: '400', unit: 'g', tags: ['Konserven'] },
      { name: 'Tomaten gehackt', amount: '400', unit: 'g', tags: ['Konserven'] },
      { name: 'Zwiebeln', amount: '2', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Knoblauch', amount: '2', unit: 'Zehen', tags: ['Gemüse'] },
      { name: 'Paprika', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Chilipulver', amount: '2', unit: 'TL', tags: ['Gewürze'] },
      { name: 'Kreuzkümmel', amount: '1', unit: 'TL', tags: ['Gewürze'] },
    ]
  },
  {
    name: 'Hähnchengeschnetzeltes',
    ingredients: [
      { name: 'Hähnchenbrust', amount: '500', unit: 'g', tags: ['Fleisch'] },
      { name: 'Champignons', amount: '250', unit: 'g', tags: ['Gemüse'] },
      { name: 'Sahne', amount: '200', unit: 'ml', tags: ['Milchprodukte'] },
      { name: 'Zwiebeln', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Salz', amount: '1', unit: 'TL', tags: ['Gewürze'] },
      { name: 'Pfeffer', amount: '1', unit: 'TL', tags: ['Gewürze'] },
    ]
  },
  {
    name: 'Tagliatelle al Salmone',
    ingredients: [
      { name: 'Tagliatelle', amount: '400', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Lachs', amount: '300', unit: 'g', tags: ['Fleisch'] },
      { name: 'Sahne', amount: '200', unit: 'ml', tags: ['Milchprodukte'] },
      { name: 'Knoblauch', amount: '2', unit: 'Zehen', tags: ['Gemüse'] },
      { name: 'Zitrone', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Dill', amount: '1', unit: 'Bund', tags: ['Gewürze'] },
    ]
  },
  {
    name: 'Spaghetti Bolognese',
    ingredients: [
      { name: 'Spaghetti', amount: '500', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Rinderhackfleisch', amount: '500', unit: 'g', tags: ['Fleisch'] },
      { name: 'Tomaten gehackt', amount: '800', unit: 'g', tags: ['Konserven'] },
      { name: 'Zwiebeln', amount: '2', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Knoblauch', amount: '3', unit: 'Zehen', tags: ['Gemüse'] },
      { name: 'Tomatenmark', amount: '2', unit: 'EL', tags: ['Konserven'] },
      { name: 'Parmesan', amount: '100', unit: 'g', tags: ['Milchprodukte'] },
    ]
  },
  {
    name: 'Spaghetti Carbonara',
    ingredients: [
      { name: 'Spaghetti', amount: '400', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Speck', amount: '150', unit: 'g', tags: ['Fleisch'] },
      { name: 'Eier', amount: '4', unit: 'Stück', tags: ['Milchprodukte'] },
      { name: 'Parmesan', amount: '100', unit: 'g', tags: ['Milchprodukte'] },
      { name: 'Pfeffer', amount: '1', unit: 'TL', tags: ['Gewürze'] },
    ]
  },
  {
    name: 'Lasagne',
    ingredients: [
      { name: 'Lasagneplatten', amount: '250', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Rinderhackfleisch', amount: '500', unit: 'g', tags: ['Fleisch'] },
      { name: 'Tomaten gehackt', amount: '800', unit: 'g', tags: ['Konserven'] },
      { name: 'Mozzarella', amount: '250', unit: 'g', tags: ['Milchprodukte'] },
      { name: 'Parmesan', amount: '100', unit: 'g', tags: ['Milchprodukte'] },
      { name: 'Zwiebeln', amount: '2', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Knoblauch', amount: '3', unit: 'Zehen', tags: ['Gemüse'] },
    ]
  },
  {
    name: 'Pizza',
    ingredients: [
      { name: 'Pizzateig', amount: '400', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Tomatensoße', amount: '200', unit: 'g', tags: ['Konserven'] },
      { name: 'Mozzarella', amount: '200', unit: 'g', tags: ['Milchprodukte'] },
      { name: 'Salami', amount: '100', unit: 'g', tags: ['Fleisch'] },
      { name: 'Champignons', amount: '100', unit: 'g', tags: ['Gemüse'] },
    ]
  },
  {
    name: 'Burger',
    ingredients: [
      { name: 'Burgerbrötchen', amount: '4', unit: 'Stück', tags: ['Backwaren'] },
      { name: 'Rinderhackfleisch', amount: '400', unit: 'g', tags: ['Fleisch'] },
      { name: 'Cheddar', amount: '4', unit: 'Scheiben', tags: ['Milchprodukte'] },
      { name: 'Tomaten', amount: '2', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Salat', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
      { name: 'Zwiebeln', amount: '1', unit: 'Stück', tags: ['Gemüse'] },
    ]
  },
  {
    name: 'Schnitzel',
    ingredients: [
      { name: 'Schweineschnitzel', amount: '4', unit: 'Stück', tags: ['Fleisch'] },
      { name: 'Mehl', amount: '100', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Eier', amount: '2', unit: 'Stück', tags: ['Milchprodukte'] },
      { name: 'Paniermehl', amount: '150', unit: 'g', tags: ['Kohlenhydrate'] },
      { name: 'Salz', amount: '1', unit: 'TL', tags: ['Gewürze'] },
      { name: 'Pfeffer', amount: '1', unit: 'TL', tags: ['Gewürze'] },
    ]
  },
];

async function createTags() {
  console.log('Erstelle Tags...');
  const tags = tagDefinitions.map((tag, index) => ({
    id: `tag-${Date.now()}-${index}`,
    name: tag.name,
    color: tag.color,
  }));

  const response = await fetch(`${SERVER_URL}/tags/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'migration-script', tags }),
  });

  const result = await response.json();
  console.log(`✓ ${tags.length} Tags erstellt`);
  return tags;
}

async function createRecipes(tags) {
  console.log('Erstelle Rezepte...');
  const tagMap = {};
  tags.forEach(tag => {
    tagMap[tag.name] = tag.id;
  });

  const recipes = recipeDefinitions.map((recipeDef, index) => ({
    id: `recipe-${Date.now()}-${index}`,
    name: recipeDef.name,
    createdAt: Date.now() + index,
    ingredients: recipeDef.ingredients.map((ing, ingIndex) => ({
      id: `ing-${Date.now()}-${index}-${ingIndex}`,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      tags: ing.tags.map(tagName => tagMap[tagName]).filter(Boolean),
    })),
  }));

  const response = await fetch(`${SERVER_URL}/recipes/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'migration-script', recipes }),
  });

  const result = await response.json();
  console.log(`✓ ${recipes.length} Rezepte erstellt`);
  return recipes;
}

async function main() {
  try {
    console.log('=== Gerichte Migration ===\n');

    const tags = await createTags();
    await new Promise(resolve => setTimeout(resolve, 500));

    const recipes = await createRecipes(tags);

    console.log('\n=== Migration abgeschlossen ===');
    console.log(`Tags: ${tags.length}`);
    console.log(`Rezepte: ${recipes.length}`);
  } catch (error) {
    console.error('Fehler:', error.message);
  }
}

main();
