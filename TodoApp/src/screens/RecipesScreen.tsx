import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recipe, HealthLevel } from '../types';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { HEALTH_CONFIG, ALL_HEALTH_LEVELS, getRecipeIcon } from '../theme/recipeIcons';
import { Text, ScreenHeader, Fab, Sheet, SheetActions, Button, Input, Chip, ListRow, IconButton, EmptyState, SyncNotice, useConfirm, useSnackbar } from '../components';
import { ShoppingTransferSheet } from '../components/ShoppingTransferSheet';

export default function RecipesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const current = useRef(recipes);
  const revision = useRef(0);
  const [panel, setPanel] = useState<'create' | 'rename' | 'options' | 'random' | 'review' | null>(null);
  const [actionRecipe, setActionRecipe] = useState<Recipe | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(3);
  const [healthFilter, setHealthFilter] = useState<HealthLevel[]>(ALL_HEALTH_LEVELS);
  const [picked, setPicked] = useState<Recipe[]>([]);
  const [transfer, setTransfer] = useState(false);
  const snackbar = useSnackbar(88);
  const { confirm, element: confirmation } = useConfirm();
  const apply = (next: Recipe[]) => { current.current = next; setRecipes(next); };
  useFocusEffect(useCallback(() => {
    let alive = true;
    const before = revision.current;
    void (async () => {
      const raw = await AsyncStorage.getItem('@recipes');
      if (alive) apply(raw ? JSON.parse(raw) : []);
      try {
        const remote = await ApiService.fetchRecipesFromServer();
        if (alive && before === revision.current) {
          await AsyncStorage.setItem('@recipes', JSON.stringify(remote));
          if (alive && before === revision.current) apply(remote);
        }
      } catch { /* Keep local recipes; SyncNotice exposes the connection state. */ }
    })().catch(() => { if (alive) snackbar.show({ text: 'Gerichte konnten nicht geladen werden.' }); });
    return () => { alive = false; };
  }, []));
  useEffect(() => ApiService.subscribe('recipes', apply), []);
  async function save(next: Recipe[]) {
    revision.current++; apply(next);
    await AsyncStorage.setItem('@recipes', JSON.stringify(next));
    await ApiService.syncRecipesToServer(next);
  }
  async function saveForm() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (panel === 'rename' && actionRecipe) {
        await save(current.current.map(recipe => recipe.id === actionRecipe.id ? { ...recipe, name: name.trim(), updatedAt: Date.now() } : recipe));
        setPanel(null);
      } else {
        const recipe: Recipe = { id: Date.now() + '-' + Math.random().toString(36).slice(2), name: name.trim(), ingredients: [], createdAt: Date.now(), updatedAt: Date.now() };
        await save([...current.current, recipe]); setPanel(null);
        navigation.navigate('RecipeDetail', { recipe });
      }
    } catch { setError('Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten.'); }
    finally { setSaving(false); }
  }
  function remove(recipe: Recipe) {
    setPanel(null);
    confirm({ title: 'Gericht löschen?', message: '„' + recipe.name + '“ mit ' + recipe.ingredients.length + ' Zutaten wird gelöscht. Bereits geplante Mahlzeiten bleiben erhalten.',
      onConfirm: () => { void save(current.current.filter(value => value.id !== recipe.id)).then(() => ApiService.deleteRecipeFromServer(recipe.id)).catch(() => snackbar.show({ text: 'Gericht konnte nicht gelöscht werden.' })); } });
  }
  function roll() {
    const pool = recipes.filter(recipe => healthFilter.length === ALL_HEALTH_LEVELS.length || (!!recipe.healthLevel && healthFilter.includes(recipe.healthLevel)));
    if (!pool.length) { setError('Keine Gerichte mit dieser Einschätzung gefunden. Passe die Auswahl an.'); return; }
    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    setPicked(shuffled.slice(0, Math.min(count, shuffled.length))); setError(''); setPanel('review');
  }
  const shown = recipes.filter(recipe => recipe.name.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE')));
  return <View style={styles.container}>
    <ScreenHeader title="Gerichte" subtitle={recipes.length + ' gespeicherte Gerichte'} actions={[
      { icon: showSearch ? 'close' : 'search-outline', accessibilityLabel: showSearch ? 'Suche schließen' : 'Gerichte suchen', onPress: () => { setShowSearch(!showSearch); setSearch(''); } },
      { icon: 'settings-outline', accessibilityLabel: 'App-Einstellungen', onPress: () => navigation.navigate('Settings') },
    ]} />
    <SyncNotice />
    {showSearch && <Input value={search} onChangeText={setSearch} placeholder="Gerichte durchsuchen" autoFocus containerStyle={{ marginHorizontal: 16, marginBottom: 12 }} />}
    <FlatList data={shown} keyExtractor={item => item.id} contentContainerStyle={[styles.list, !shown.length && { flexGrow: 1 }]} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={recipes.length > 0 ? <View style={styles.suggestion}><View style={{ flex: 1 }}><Text style={styles.suggestionTitle}>Was koche ich?</Text><Text style={styles.caption}>Ideen aus deinen Gerichten</Text></View>
        <Button standalone variant="secondary" icon="shuffle-outline" onPress={() => { setError(''); setPanel('random'); }}>Vorschläge</Button></View> : null}
      ListEmptyComponent={<EmptyState icon={search ? 'search-outline' : 'restaurant-outline'} title={search ? 'Kein Gericht gefunden' : 'Deine Gerichte an einem Ort'}
        subtitle={search ? 'Versuche einen anderen Suchbegriff.' : 'Lege ein Gericht an und ergänze seine Zutaten.'} />}
      renderItem={({ item }) => <View style={styles.card}>
        <Pressable style={styles.cardMain} accessibilityRole="button" onPress={() => navigation.navigate('RecipeDetail', { recipe: item })} onLongPress={() => { setActionRecipe(item); setPanel('options'); }}>
          <View style={styles.cardIcon}><Ionicons name={getRecipeIcon(item.icon).icon} size={23} color={colors.accent} /></View>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.caption}>{item.ingredients.length + ' Zutaten' + (item.healthLevel ? ' · ' + HEALTH_CONFIG[item.healthLevel].label : '')}</Text></View>
        </Pressable>
        <IconButton icon="ellipsis-horizontal" accessibilityLabel={'Optionen für ' + item.name} onPress={() => { setActionRecipe(item); setPanel('options'); }} />
      </View>} />
    <Fab icon="add" label="Neues Gericht" accessibilityLabel="Neues Gericht" onPress={() => { setName(''); setError(''); setPanel('create'); }} />
    <Sheet visible={panel === 'create' || panel === 'rename'} onClose={() => { if (!saving) setPanel(null); }} title={panel === 'rename' ? 'Gericht umbenennen' : 'Neues Gericht'}>
      <Input label="Name des Gerichts" value={name} onChangeText={setName} placeholder="Zum Beispiel: Gemüse-Curry" autoFocus error={error} onSubmitEditing={saveForm} />
      <SheetActions><Button variant="secondary" disabled={saving} onPress={() => setPanel(null)}>Abbrechen</Button><Button disabled={!name.trim()} loading={saving} onPress={saveForm}>{panel === 'rename' ? 'Speichern' : 'Gericht erstellen'}</Button></SheetActions>
    </Sheet>
    <Sheet visible={panel === 'options'} onClose={() => setPanel(null)} title={actionRecipe?.name}>
      <ListRow title="Zutaten bearbeiten" icon="nutrition-outline" onPress={() => { setPanel(null); navigation.navigate('RecipeDetail', { recipe: actionRecipe }); }} />
      <ListRow title="Umbenennen" icon="pencil-outline" onPress={() => { setName(actionRecipe?.name || ''); setError(''); setPanel('rename'); }} />
      <ListRow title="Gericht löschen" destructive icon="trash-outline" onPress={() => { if (actionRecipe) remove(actionRecipe); }} />
    </Sheet>
    <Sheet visible={panel === 'random'} onClose={() => setPanel(null)} title="Gerichte vorschlagen" subtitle="Wie viele Ideen möchtest du?">
      <View style={styles.wrap}>{[1, 2, 3, 5, 7].map(value => <Chip key={value} label={String(value)} selected={count === value} onPress={() => setCount(value)} />)}</View>
      <Text style={styles.label}>Nach deiner Einschätzung filtern</Text>
      <View style={styles.wrap}>{ALL_HEALTH_LEVELS.map(level => <Chip key={level} label={HEALTH_CONFIG[level].label} selected={healthFilter.includes(level)}
        onPress={() => setHealthFilter(previous => previous.includes(level) ? previous.filter(value => value !== level) : [...previous, level])} />)}</View>
      <Text style={styles.hint}>Sind alle Stufen gewählt, werden auch Gerichte ohne Einschätzung berücksichtigt.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button standalone disabled={!healthFilter.length} onPress={roll} icon="shuffle-outline">Gerichte vorschlagen</Button>
    </Sheet>
    <Sheet visible={panel === 'review'} onClose={() => setPanel(null)} title="Deine Kochideen" subtitle={picked.length + ' Vorschläge aus deinen Gerichten'}>
      {picked.map(recipe => <ListRow key={recipe.id} title={recipe.name} subtitle={recipe.ingredients.length + ' Zutaten'} icon={getRecipeIcon(recipe.icon).icon}
        onPress={() => { setPanel(null); navigation.navigate('RecipeDetail', { recipe }); }} />)}
      <SheetActions><Button variant="secondary" icon="shuffle-outline" onPress={roll}>Neue Ideen</Button><Button disabled={!picked.some(recipe => recipe.ingredients.length)} onPress={() => { setPanel(null); setTransfer(true); }}>Zutaten wählen</Button></SheetActions>
    </Sheet>
    <ShoppingTransferSheet visible={transfer} recipes={picked} onClose={() => setTransfer(false)} onAdded={result => snackbar.show({
      text: result.added + ' Artikel zu „' + result.listName + '“ hinzugefügt' + (result.skipped ? ' · ' + result.skipped + ' bereits vorhanden' : ''),
      action: 'Liste öffnen', onAction: async () => { await AsyncStorage.setItem('@active_shopping_list', result.listId); navigation.navigate('ShoppingTab'); },
    })} />
    {confirmation}{snackbar.element}
  </View>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 12 },
  suggestionTitle: { color: t.colors.text, fontSize: 16, fontWeight: '600' },
  caption: { color: t.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  card: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.tabBorder, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingRight: 2 },
  cardMain: { flex: 1, minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: t.colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: t.colors.text, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  label: { color: t.colors.textSub, fontSize: 14, fontWeight: '600', marginTop: 12 },
  hint: { color: t.colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  error: { color: t.colors.danger, fontSize: 14, marginBottom: 16 },
});
