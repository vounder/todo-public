import { Ingredient, IngredientTagMapping, ShoppingItem, ShoppingListDef } from '../types';
import { autoTagsFor } from './ingredientTags';

export function updateShoppingItem(lists: ShoppingListDef[], itemId: string, update: (item: ShoppingItem) => ShoppingItem | null): ShoppingListDef[] {
  return lists.map(list => ({ ...list, items: list.items.flatMap(item => {
    if (item.id !== itemId) return [item];
    const next = update(item);
    return next ? [next] : [];
  }) }));
}

export function moveShoppingItem(lists: ShoppingListDef[], itemId: string, targetId: string): ShoppingListDef[] {
  const source = lists.find(list => list.items.some(item => item.id === itemId));
  const target = lists.find(list => list.id === targetId);
  if (!source || !target || source.id === target.id) return lists;
  const item = source.items.find(item => item.id === itemId)!;
  return lists.map(list => list.id === source.id
    ? { ...list, items: list.items.filter(item => item.id !== itemId) }
    : list.id === targetId ? { ...list, items: [...list.items.filter(item => item.id !== itemId), item] } : list);
}

export function restoreShoppingItems(lists: ShoppingListDef[], removed: { listId: string; item: ShoppingItem; index: number }[]) {
  return lists.map(list => {
    const items = [...list.items];
    removed.filter(entry => entry.listId === list.id).sort((a, b) => a.index - b.index).forEach(({ item, index }) => {
      if (!items.some(existing => existing.id === item.id)) items.splice(Math.min(index, items.length), 0, item);
    });
    return { ...list, items };
  });
}

export function ingredientLabel(ingredient: Ingredient): string {
  return [ingredient.amount?.trim(), ingredient.unit?.trim(), ingredient.name.trim()].filter(Boolean).join(' ');
}
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').replace(/(\d),(\d)/g, '$1.$2');

// Only an identical, still-open purchase is already covered. Keep differing
// quantities/units separate; do not silently combine incompatible measures.
export function isIngredientPresent(items: ShoppingItem[], ingredient: Ingredient): boolean {
  return items.some(item => !item.checked && normalize(item.name) === normalize(ingredientLabel(ingredient)));
}
export function addIngredients(items: ShoppingItem[], ingredients: Ingredient[], mappings: IngredientTagMapping[] = [], allowDuplicates = false) {
  const next = [...items];
  let added = 0;
  for (const ingredient of ingredients) {
    if (!allowDuplicates && isIngredientPresent(next, ingredient)) continue;
    next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: ingredientLabel(ingredient),
      checked: false, checkedAt: null, createdAt: Date.now(),
      tags: ingredient.tags?.length ? ingredient.tags : autoTagsFor(ingredient.name, mappings) });
    added++;
  }
  return { items: next, added, skipped: ingredients.length - added };
}
