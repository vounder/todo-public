import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recipe, ShoppingListDef, IngredientTagMapping } from '../types';
import { ApiService } from '../services/ApiService';
import { addIngredients, ingredientLabel, isIngredientPresent } from '../services/shopping';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text, Sheet, Chip, Checkbox, Button, ListRow } from './index';

export function ShoppingTransferSheet({ visible, recipes, onClose, onAdded }: {
  visible: boolean; recipes: Recipe[]; onClose: () => void;
  onAdded: (result: { added: number; skipped: number; listId: string; listName: string }) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [lists, setLists] = useState<ShoppingListDef[]>([]);
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = (recipe: Recipe, ingredientId: string) => recipe.id + ':' + ingredientId;
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setSelected(recipes.flatMap(recipe => recipe.ingredients.map(ingredient => key(recipe, ingredient.id))));
    setDuplicates(false); setRemember(false); setError('');
    void (async () => {
      const [raw, last] = await Promise.all([AsyncStorage.getItem('@shopping_lists'), AsyncStorage.getItem('@last_shopping_list_id')]);
      let data: ShoppingListDef[] = raw ? JSON.parse(raw) : [];
      if (!data.length) {
        const legacy = await AsyncStorage.getItem('@shopping_list');
        data = [{ id: 'default', name: 'Einkaufsliste', createdAt: Date.now(), items: legacy ? JSON.parse(legacy) : [] }];
        await AsyncStorage.setItem('@shopping_lists', JSON.stringify(data));
      }
      if (alive) { setLists(data); setTarget(data.some(list => list.id === last) ? last! : data[0].id); }
    })().catch(() => { if (alive) setError('Einkaufslisten konnten nicht geladen werden.'); });
    return () => { alive = false; };
  }, [visible, recipes]);
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const chosen = recipes.flatMap(recipe => recipe.ingredients.filter(ingredient => selected.includes(key(recipe, ingredient.id))));
  const targetList = lists.find(list => list.id === target);
  const preview = addIngredients(targetList?.items || [], chosen, [], duplicates);

  async function transfer() {
    if (!selected.length || !target || busy) return;
    setBusy(true); setError('');
    try {
      // Read current lists again: another screen or device may have changed them.
      const raw = await AsyncStorage.getItem('@shopping_lists');
      const current: ShoppingListDef[] = raw ? JSON.parse(raw) : [];
      const list = current.find(value => value.id === target);
      if (!list) { setError('Diese Liste existiert nicht mehr. Bitte erneut öffnen und eine Liste wählen.'); return; }
      if (remember) {
        const reserveRaw = await AsyncStorage.getItem('@meal_reserve');
        let reserve: { id: string; title: string; notes?: string }[] = reserveRaw ? JSON.parse(reserveRaw) : [];
        for (const recipe of recipes.filter(value => value.ingredients.some(ingredient => selected.includes(key(value, ingredient.id))))) {
          if (reserve.some(entry => entry.title.trim().toLocaleLowerCase('de-DE') === recipe.name.trim().toLocaleLowerCase('de-DE'))) continue;
          try {
            const created = await ApiService.createMealReserveEntry(recipe.name);
            reserve = [...reserve, created];
            await AsyncStorage.setItem('@meal_reserve', JSON.stringify(reserve));
          } catch {
            setError('Für später merken ist gerade nicht möglich. Versuche es erneut oder schalte diese Option aus, um die Einkaufsliste lokal zu speichern.');
            return;
          }
        }
      }
      const mappingsRaw = await AsyncStorage.getItem('@ingredient_tag_mappings');
      const mappings: IngredientTagMapping[] = mappingsRaw ? JSON.parse(mappingsRaw) : [];
      const result = addIngredients(list.items, chosen, mappings, duplicates);
      const next = current.map(value => value.id === target ? { ...value, items: result.items } : value);
      await AsyncStorage.setItem('@shopping_lists', JSON.stringify(next));
      await ApiService.syncShoppingListsToServer(next);
      await AsyncStorage.setItem('@last_shopping_list_id', target);
      onAdded({ added: result.added, skipped: result.skipped, listId: target, listName: list.name });
      onClose();
    } catch { setError('Speichern fehlgeschlagen. Deine Auswahl bleibt erhalten.'); }
    finally { setBusy(false); }
  }

  return <Sheet visible={visible} onClose={() => { if (!busy) onClose(); }} title="Zutaten einkaufen" subtitle="Wähle eine Liste und die benötigten Zutaten."
    footer={<Button standalone disabled={!selected.length || !target} loading={busy} icon="cart-outline" onPress={transfer}>
      {preview.added ? preview.added + ' Artikel hinzufügen' : 'Auswahl übernehmen'}
    </Button>}>
    <Text style={styles.label}>Einkaufsliste</Text>
    <View style={styles.wrap}>{lists.map(list => <Chip key={list.id} label={list.name} icon="cart-outline" selected={list.id === target} onPress={() => setTarget(list.id)} />)}</View>
    {recipes.map(recipe => <View key={recipe.id}>
      {recipes.length > 1 && <Text style={styles.group} accessibilityRole="header">{recipe.name}</Text>}
      {!recipe.ingredients.length && <Text style={styles.hint}>Dieses Gericht hat noch keine Zutaten.</Text>}
      {recipe.ingredients.map(ingredient => {
        const id = key(recipe, ingredient.id);
        const present = isIngredientPresent(targetList?.items || [], ingredient);
        return <Pressable key={id} style={styles.row} onPress={() => toggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(id) }} accessibilityLabel={ingredientLabel(ingredient) + (present ? ', bereits auf der Liste' : '')}>
          <Checkbox checked={selected.includes(id)} /><View style={{ flex: 1 }}><Text style={styles.body}>{ingredientLabel(ingredient)}</Text>
            {present && <Text style={styles.hint}>Bereits offen auf dieser Liste</Text>}</View>
        </Pressable>;
      })}
    </View>)}
    <ListRow title={selected.length === recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) ? 'Auswahl aufheben' : 'Alle Zutaten auswählen'}
      onPress={() => setSelected(selected.length === recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) ? [] : recipes.flatMap(recipe => recipe.ingredients.map(ingredient => key(recipe, ingredient.id))))} />
    <View style={styles.divider} />
    <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.body}>Identische Artikel erneut hinzufügen</Text><Text style={styles.hint}>Gleicher Name, gleiche Menge und Einheit. Erledigte Artikel zählen nicht als vorhanden.</Text></View>
      <Switch value={duplicates} onValueChange={setDuplicates} accessibilityLabel="Identische Artikel erneut hinzufügen" /></View>
    <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.body}>Gerichte für später merken</Text><Text style={styles.hint}>Zusätzlich unter „Für später“ im Planer ablegen.</Text></View>
      <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Gerichte für später merken" /></View>
    {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    {preview.skipped > 0 && <Text style={styles.hint}>{preview.skipped + ' identische offene Artikel werden ausgelassen.'}</Text>}
  </Sheet>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  label: { color: t.colors.textSub, fontSize: 14, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  body: { fontSize: 16, lineHeight: 23, color: t.colors.text },
  hint: { fontSize: 13, lineHeight: 19, color: t.colors.textMuted, marginTop: 4 },
  group: { fontSize: 17, fontWeight: '600', color: t.colors.text, marginTop: 16, marginBottom: 4 },
  divider: { height: 1, backgroundColor: t.colors.border, marginVertical: 8 },
  error: { fontSize: 14, lineHeight: 21, color: t.colors.danger, marginVertical: 12 },
});
