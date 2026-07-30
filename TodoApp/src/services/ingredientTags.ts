import { IngredientTagMapping } from '../types';

/**
 * Gelernte Produkt-Tag-Zuordnungen: Suche und Zusammenfuehrung.
 *
 * Lag vorher doppelt in ShoppingListScreen und RecipesScreen -- inklusive
 * desselben Fehlers.
 */

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** Woerter eines Produktnamens, ohne Ziffern-/Zeichen-Rauschen ("H-Milch 3,5%"). */
function words(name: string): string[] {
  return normalize(name).split(/[^a-zäöüß]+/i).filter(Boolean);
}

/**
 * Passende Zuordnung zu einem Produktnamen finden.
 *
 * Drei Stufen, innerhalb jeder Stufe gewinnt der laengste Treffer:
 *
 *   1. Exakter Name.
 *   2. Ganzes Wort im Produktnamen ("Milch" trifft "H-Milch 3,5%").
 *   3. Teilstring ab vier Zeichen ("Fleisch" trifft "Fleischsalat").
 *
 * Die Wortgrenze in Stufe 2 ist der entscheidende Punkt: vorher wurde
 * blosses `includes` benutzt, und damit traf eine Zuordnung fuer "Ei" auch
 * "Fleisch", "Zwiebeln" oder "Eis" -- `"fleisch".includes("ei")` ist wahr.
 * Kurze Namen haben so reihenweise fremde Produkte falsch getaggt.
 *
 * Zusaetzlich wurde vorher `find()` benutzt, also der erste Treffer in
 * Anlagereihenfolge statt des passendsten. Bei "Milch" und "Milchreis"
 * entschied damit der Zufall.
 */
export function findMappingFor(
  name: string,
  mappings: IngredientTagMapping[],
): IngredientTagMapping | null {
  const target = normalize(name);
  if (!target) return null;

  const longestFirst = (a: IngredientTagMapping, b: IngredientTagMapping) =>
    b.ingredientName.length - a.ingredientName.length;

  const exact = mappings.filter(m => normalize(m.ingredientName) === target);
  if (exact.length > 0) return exact.sort(longestFirst)[0];

  const targetWords = new Set(words(target));
  const wordHits = mappings.filter(m => {
    const mw = words(m.ingredientName);
    // Einwortige Zuordnung: muss als ganzes Wort vorkommen.
    if (mw.length === 1) return targetWords.has(mw[0]);
    // Mehrwortige Zuordnung: alle Woerter muessen vorkommen.
    return mw.length > 0 && mw.every(w => targetWords.has(w));
  });
  if (wordHits.length > 0) return wordHits.sort(longestFirst)[0];

  // Nur vorwaerts: die gelernte Zuordnung steckt im Produktnamen
  // ("Butter" trifft "Erdnussbutter"). Die Rueckrichtung -- kurzer
  // Produktname steckt in einer langen Zuordnung -- ist rausgeflogen, weil
  // sie "Eis" auf "Milchreis" gezogen hat. Ein verpasster Treffer ist
  // deutlich harmloser als ein falscher.
  // Ab vier Zeichen, sonst trifft jedes Kurzwort quer durch das Sortiment.
  const partial = mappings.filter(m => {
    const mn = normalize(m.ingredientName);
    return mn.length >= 4 && target.includes(mn);
  });
  if (partial.length > 0) return partial.sort(longestFirst)[0];

  return null;
}

/** Tags fuer ein neues Produkt aus den gelernten Zuordnungen. */
export function autoTagsFor(name: string, mappings: IngredientTagMapping[]): string[] {
  return findMappingFor(name, mappings)?.tagIds ?? [];
}

/** Altformat (`tagId` als Einzelwert) auf `tagIds` heben. */
export function migrateMappings(raw: any[]): IngredientTagMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(m => m && typeof m.ingredientName === 'string')
    .map(m => ({
      ingredientName: m.ingredientName,
      tagIds: Array.isArray(m.tagIds) ? m.tagIds : m.tagId ? [m.tagId] : [],
    }));
}

/**
 * Lokale und Server-Zuordnungen vereinen.
 *
 * Vorher wurde anhand der reinen Anzahl entschieden, welche Seite gewinnt
 * ("Server nur uebernehmen wenn er mindestens so viele Eintraege hat").
 * Eine gerade gelernte Zuordnung, deren Sync noch nicht durch war, ging
 * damit verloren, sobald der Screen neu fokussiert wurde.
 *
 * Der Server gewinnt pro Produkt, weil er der gemeinsame Stand ist; lokal
 * bekannte Produkte, die er nicht kennt, bleiben erhalten statt zu
 * verschwinden.
 */
export function mergeMappings(
  local: IngredientTagMapping[],
  server: IngredientTagMapping[],
): IngredientTagMapping[] {
  const byName = new Map<string, IngredientTagMapping>();
  local.forEach(m => byName.set(normalize(m.ingredientName), m));
  server.forEach(m => byName.set(normalize(m.ingredientName), m));
  return [...byName.values()];
}
