import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recipe, Ingredient, Tag } from '../types';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { RECIPE_ICONS, HEALTH_CONFIG, ALL_HEALTH_LEVELS, getRecipeIcon, healthColor } from '../theme/recipeIcons';
import { Text, ScreenHeader, Sheet, SheetActions, Button, Input, Chip, IconButton, ListRow, EmptyState, SyncNotice, useSnackbar } from '../components';
import { ShoppingTransferSheet } from '../components/ShoppingTransferSheet';

export default function RecipeDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [recipe, setRecipe] = useState<Recipe>(route.params.recipe);
  const current = useRef(recipe);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [tags, setTags] = useState<Tag[]>([]);
  const [panel, setPanel] = useState<'ingredient' | 'options' | 'name' | 'health' | 'icon' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [chosenTags, setChosenTags] = useState<string[]>([]);
  const [transfer, setTransfer] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const snackbar = useSnackbar(88);
  const transferRecipes = useMemo(() => [recipe], [recipe]);
  const apply = (next: Recipe) => { current.current = next; setRecipe(next); };
  useEffect(() => {
    void AsyncStorage.getItem('@tags').then(raw => setTags(raw ? JSON.parse(raw) : [])).catch(() => {});
    const subscriptions = [
      ApiService.subscribe('recipes', (recipes: Recipe[]) => { const next = recipes.find(value => value.id === current.current.id); if (next) apply(next); }),
      ApiService.subscribe('tags', setTags),
    ];
    return () => subscriptions.forEach(fn => fn());
  }, []);
  function save(next: Recipe) {
    const updated = { ...next, updatedAt: Date.now() };
    apply(updated);
    const write = writes.current.catch(() => {}).then(async () => {
      const raw = await AsyncStorage.getItem('@recipes');
      const recipes: Recipe[] = raw ? JSON.parse(raw) : [];
      if (!recipes.some(value => value.id === updated.id)) throw new Error('Gericht existiert nicht mehr.');
      const result = recipes.map(value => value.id === updated.id ? updated : value);
      await AsyncStorage.setItem('@recipes', JSON.stringify(result));
      await ApiService.syncRecipesToServer(result);
    });
    writes.current = write;
    return write;
  }
  function openIngredient(ingredient?: Ingredient) {
    setEditing(ingredient?.id || null); setName(ingredient?.name || ''); setAmount(ingredient?.amount || '');
    setUnit(ingredient?.unit || ''); setChosenTags(ingredient?.tags || []); setError(''); setPanel('ingredient');
  }
  async function saveForm() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (panel === 'name') await save({ ...current.current, name: name.trim() });
      else {
        const ingredient: Ingredient = { id: editing || Date.now() + '-' + Math.random().toString(36).slice(2), name: name.trim(), amount: amount.trim(), unit: unit.trim(), tags: chosenTags };
        await save({ ...current.current, ingredients: editing ? current.current.ingredients.map(value => value.id === editing ? ingredient : value) : [...current.current.ingredients, ingredient] });
      }
      setPanel(null);
    } catch { setError('Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten.'); }
    finally { setSaving(false); }
  }
  async function removeIngredient(id: string) {
    const index = current.current.ingredients.findIndex(value => value.id === id);
    const ingredient = current.current.ingredients[index];
    if (!ingredient) return;
    try {
      await save({ ...current.current, ingredients: current.current.ingredients.filter(value => value.id !== id) });
      setPanel(null);
      snackbar.show({ text: 'Zutat entfernt', action: 'Rückgängig', onAction: async () => {
        if (current.current.ingredients.some(value => value.id === id)) return;
        const ingredients = [...current.current.ingredients];
        ingredients.splice(Math.min(index, ingredients.length), 0, ingredient);
        await save({ ...current.current, ingredients });
      } });
    } catch { setError('Zutat konnte nicht entfernt werden.'); }
  }
  async function changeProperty(update: Partial<Recipe>) {
    try { await save({ ...current.current, ...update }); setPanel(null); }
    catch { snackbar.show({ text: 'Änderung konnte nicht gespeichert werden.' }); }
  }
  const health = recipe.healthLevel ? HEALTH_CONFIG[recipe.healthLevel] : null;
  return <View style={styles.container}>
    <ScreenHeader title="Gericht" variant="compact" onBack={() => navigation.goBack()} actions={[
      { icon: 'ellipsis-horizontal', accessibilityLabel: 'Gerichtsoptionen', onPress: () => setPanel('options') },
    ]} />
    <SyncNotice />
    <FlatList data={recipe.ingredients} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View>
        <View style={styles.hero}>
          <View style={styles.recipeIcon}><Ionicons name={getRecipeIcon(recipe.icon).icon} size={26} color={colors.accent} /></View>
          <View style={{ flex: 1 }}><Text style={styles.title} accessibilityRole="header">{recipe.name}</Text><Text style={styles.subtitle}>{recipe.ingredients.length + ' Zutaten'}</Text></View>
        </View>
        <Pressable style={styles.healthRow} onPress={() => setPanel('health')} accessibilityRole="button" accessibilityLabel="Eigene Einschätzung ändern">
          <Ionicons name={health?.icon || 'heart-outline'} size={18} color={recipe.healthLevel ? healthColor(recipe.healthLevel, colors) : colors.textMuted} />
          <Text style={styles.healthText}>{health ? health.label : 'Eigene Einschätzung hinzufügen'}</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <View style={styles.section}><Text style={styles.sectionTitle}>Zutaten</Text><Button standalone variant="ghost" icon="add" onPress={() => openIngredient()}>Hinzufügen</Button></View>
      </View>}
      ListEmptyComponent={<View style={{ paddingVertical: 40 }}><EmptyState icon="nutrition-outline" title="Was kommt hinein?" subtitle="Ergänze die erste Zutat mit Menge und Einheit." /></View>}
      renderItem={({ item }) => <View style={styles.ingredient}>
        <Pressable style={styles.ingredientMain} onPress={() => openIngredient(item)} accessibilityRole="button" accessibilityLabel={item.name + ' bearbeiten'}>
          <Text style={styles.amount}>{[item.amount, item.unit].filter(Boolean).join(' ') || '–'}</Text>
          <View style={{ flex: 1 }}><Text style={styles.ingredientName}>{item.name}</Text>
            {!!item.tags?.length && <Text style={styles.caption}>{item.tags.map(id => tags.find(tag => tag.id === id)?.name).filter(Boolean).join(' · ')}</Text>}</View>
        </Pressable>
        <IconButton icon="pencil-outline" accessibilityLabel={'Zutat ' + item.name + ' bearbeiten'} onPress={() => openIngredient(item)} />
      </View>} />
    <View style={styles.footer}><Button standalone icon="cart-outline" disabled={!recipe.ingredients.length} onPress={() => setTransfer(true)}>Zutaten einkaufen</Button></View>

    <Sheet visible={panel === 'ingredient' || panel === 'name'} onClose={() => { if (!saving) setPanel(null); }} title={panel === 'name' ? 'Gericht umbenennen' : editing ? 'Zutat bearbeiten' : 'Zutat hinzufügen'}>
      <Input label={panel === 'name' ? 'Name des Gerichts' : 'Zutat'} value={name} onChangeText={setName} autoFocus placeholder={panel === 'ingredient' ? 'Zum Beispiel: Tomaten' : undefined} />
      {panel === 'ingredient' && <>
        <View style={styles.fields}><Input label="Menge" value={amount} onChangeText={setAmount} placeholder="250" containerStyle={{ flex: 1 }} />
          <Input label="Einheit" value={unit} onChangeText={setUnit} placeholder="g" containerStyle={{ flex: 1 }} /></View>
        <Text style={styles.hint}>Menge und Einheit sind optional.</Text>
        {!!tags.length && <><Text style={styles.label}>Kategorien</Text><View style={styles.wrap}>{tags.map(tag => <Chip key={tag.id} label={tag.name} color={tag.color} selected={chosenTags.includes(tag.id)}
          onPress={() => setChosenTags(previous => previous.includes(tag.id) ? previous.filter(id => id !== tag.id) : [...previous, tag.id])} />)}</View></>}
      </>}
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      <SheetActions><Button variant="secondary" disabled={saving} onPress={() => setPanel(null)}>Abbrechen</Button><Button disabled={!name.trim()} loading={saving} onPress={saveForm}>Speichern</Button></SheetActions>
      {panel === 'ingredient' && editing && <Button standalone variant="ghost" icon="trash-outline" disabled={saving} style={{ marginTop: 12 }} onPress={() => { void removeIngredient(editing); }}>Zutat entfernen</Button>}
    </Sheet>
    <Sheet visible={panel === 'options'} onClose={() => setPanel(null)} title="Gerichtsoptionen">
      <ListRow title="Umbenennen" icon="pencil-outline" onPress={() => { setName(recipe.name); setError(''); setPanel('name'); }} />
      <ListRow title="Symbol wählen" icon="shapes-outline" onPress={() => setPanel('icon')} />
      <ListRow title="Eigene Einschätzung" icon="heart-outline" onPress={() => setPanel('health')} />
      <ListRow title="App-Einstellungen" icon="settings-outline" onPress={() => { setPanel(null); navigation.navigate('Settings'); }} />
    </Sheet>
    <Sheet visible={panel === 'health'} onClose={() => setPanel(null)} title="Eigene Einschätzung" subtitle="Deine persönliche Einordnung für die Gerichtsauswahl.">
      {ALL_HEALTH_LEVELS.map(level => <ListRow key={level} title={HEALTH_CONFIG[level].label} icon={HEALTH_CONFIG[level].icon} selected={recipe.healthLevel === level} onPress={() => { void changeProperty({ healthLevel: level }); }} />)}
      <ListRow title="Ohne Einschätzung" selected={!recipe.healthLevel} onPress={() => { void changeProperty({ healthLevel: undefined }); }} />
    </Sheet>
    <Sheet visible={panel === 'icon'} onClose={() => setPanel(null)} title="Symbol wählen">
      <View style={styles.wrap}>{RECIPE_ICONS.map(option => <Pressable key={option.key} style={[styles.iconOption, getRecipeIcon(recipe.icon).key === option.key && { backgroundColor: colors.accentSurface, borderColor: colors.accent }]}
        accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: getRecipeIcon(recipe.icon).key === option.key }}
        onPress={() => { void changeProperty({ icon: option.key }); }}>
        <Ionicons name={option.icon} size={24} color={colors.textSub} /><Text style={styles.caption}>{option.label}</Text>
      </Pressable>)}</View>
    </Sheet>
    <ShoppingTransferSheet visible={transfer} recipes={transferRecipes} onClose={() => setTransfer(false)} onAdded={result => snackbar.show({
      text: result.added + ' Artikel zu „' + result.listName + '“ hinzugefügt' + (result.skipped ? ' · ' + result.skipped + ' bereits vorhanden' : ''), action: 'Liste öffnen',
      onAction: async () => { await AsyncStorage.setItem('@active_shopping_list', result.listId); navigation.navigate('ShoppingTab'); },
    })} />
    {snackbar.element}
  </View>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  recipeIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSurface },
  title: { color: t.colors.text, fontSize: 25, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: t.colors.textMuted, fontSize: 13, marginTop: 6 },
  healthRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: t.colors.surface, borderRadius: 12 },
  healthText: { color: t.colors.textSub, fontSize: 14, flex: 1 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  sectionTitle: { color: t.colors.text, fontSize: 18, fontWeight: '600' },
  ingredient: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.surface, borderRadius: 12, marginBottom: 6 },
  ingredientMain: { minHeight: 64, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  amount: { color: t.colors.textSub, fontSize: 14, width: 66 },
  ingredientName: { color: t.colors.text, fontSize: 16, lineHeight: 23 },
  caption: { color: t.colors.textMuted, fontSize: 12, marginTop: 4 },
  footer: { padding: 12, backgroundColor: t.colors.surface, borderTopWidth: 1, borderColor: t.colors.tabBorder },
  fields: { flexDirection: 'row', gap: 12, marginTop: 16 },
  hint: { fontSize: 13, color: t.colors.textMuted, marginVertical: 12 },
  label: { fontSize: 14, color: t.colors.textSub, fontWeight: '600', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  error: { color: t.colors.danger, fontSize: 14, marginTop: 12 },
  iconOption: { width: '30%', minHeight: 76, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: t.colors.border, borderRadius: 12, padding: 8 },
});
