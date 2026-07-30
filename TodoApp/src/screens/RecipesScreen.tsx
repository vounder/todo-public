import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Recipe, Ingredient, IngredientTagMapping, HealthLevel, ShoppingListDef } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../services/ApiService';
import { findMappingFor } from '../services/ingredientTags';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  HEALTH_CONFIG,
  ALL_HEALTH_LEVELS,
  getRecipeIcon,
  healthColor,
} from '../theme/recipeIcons';
import {
  Text,
  ScreenHeader,
  Card,
  Fab,
  Sheet,
  SheetActions,
  Button,
  Input,
  Chip,
  Checkbox,
  ListRow,
  IconButton,
  EmptyState,
} from '../components';

export default function RecipesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [renameRecipe, setRenameRecipe] = useState<Recipe | null>(null);
  const [renameText, setRenameText] = useState('');
  const [actionRecipe, setActionRecipe] = useState<Recipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  // Random-Feature
  const [randomCountVisible, setRandomCountVisible] = useState(false);
  const [randomCount, setRandomCount] = useState(3);
  const [randomReviewVisible, setRandomReviewVisible] = useState(false);
  const [randomRecipes, setRandomRecipes] = useState<Recipe[]>([]);
  // Gesundheits-Filter: null = alle, sonst nur ausgewählte Level
  const [randomHealthFilter, setRandomHealthFilter] = useState<Set<HealthLevel>>(new Set(ALL_HEALTH_LEVELS));
  // key: `${recipeId}:${ingredientId}`
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [addingToList, setAddingToList] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListDef[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<string>('');

  useFocusEffect(useCallback(() => { loadRecipes(); loadTags(); loadShoppingLists(); }, []));

  const loadShoppingLists = async () => {
    try {
      const raw = await AsyncStorage.getItem('@shopping_lists');
      const lists: ShoppingListDef[] = raw ? JSON.parse(raw) : [];
      if (lists.length > 0) {
        setShoppingLists(lists);
        const lastId = await AsyncStorage.getItem('@last_shopping_list_id');
        const valid = lastId && lists.some(l => l.id === lastId);
        setSelectedShoppingListId(valid ? lastId! : lists[0].id);
      }
    } catch (e) {}
  };

  const loadRecipes = async () => {
    try {
      const data = await AsyncStorage.getItem('@recipes');
      const localRecipes: Recipe[] = data ? JSON.parse(data) : [];
      if (localRecipes.length > 0) setRecipes(localRecipes);
      try {
        const serverRecipes = await ApiService.fetchRecipesFromServer();
        if (serverRecipes) {
          // Merge: per Recipe gewinnt die Version mit dem neueren updatedAt
          const localMap = new Map(localRecipes.map(r => [r.id, r]));
          const merged = serverRecipes.map(serverRecipe => {
            const local = localMap.get(serverRecipe.id);
            if (local && (local.updatedAt ?? 0) > (serverRecipe.updatedAt ?? 0)) return local;
            return serverRecipe;
          });
          // Lokale Rezepte, die der Server nicht kennt, behalten
          const serverIds = new Set(serverRecipes.map(r => r.id));
          localRecipes.forEach(r => { if (!serverIds.has(r.id)) merged.push(r); });
          await AsyncStorage.setItem('@recipes', JSON.stringify(merged));
          setRecipes(merged);
        }
      } catch (e) {}
    } catch (e) {}
  };

  const loadTags = async () => {
    try {
      const serverTags = await ApiService.fetchTagsFromServer();
      if (serverTags) await AsyncStorage.setItem('@tags', JSON.stringify(serverTags));
    } catch (e) {}
  };

  const saveRecipes = async (newRecipes: Recipe[]) => {
    await AsyncStorage.setItem('@recipes', JSON.stringify(newRecipes));
    setRecipes(newRecipes);
    ApiService.syncRecipesToServer(newRecipes).catch(() => {});
  };

  const handleCreateRecipe = async () => {
    if (newRecipeName.trim()) {
      const newRecipe: Recipe = { id: Date.now().toString(), name: newRecipeName.trim(), ingredients: [], createdAt: Date.now() };
      await saveRecipes([...recipes, newRecipe]);
      setNewRecipeName(''); setIsModalVisible(false);
    }
  };

  const handleRenameRecipe = async () => {
    if (renameRecipe && renameText.trim()) {
      await saveRecipes(recipes.map(r => r.id === renameRecipe.id ? { ...r, name: renameText.trim() } : r));
      setIsRenameModalVisible(false); setRenameRecipe(null); setRenameText('');
    }
  };

  // ── Random Helpers ──────────────────────────────────────
  function ingredientKey(recipeId: string, ingredientId: string) {
    return `${recipeId}:${ingredientId}`;
  }

  function ingredientLabel(ing: Ingredient): string {
    const parts = [ing.amount?.trim(), ing.unit?.trim(), ing.name?.trim()].filter(Boolean);
    return parts.join(' ');
  }

  function rollRandom() {
    if (recipes.length === 0) return;
    // Gerichte filtern: wenn nicht alle Health-Filter aktiv, nur passende nehmen
    const allSelected = randomHealthFilter.size === ALL_HEALTH_LEVELS.length;
    const pool = allSelected
      ? recipes
      : recipes.filter(r => {
          if (!r.healthLevel) return false;
          return randomHealthFilter.has(r.healthLevel);
        });
    if (pool.length === 0) {
      Alert.alert('Keine Treffer', 'Keine Gerichte mit den ausgewählten Gesundheitsstufen gefunden.');
      return;
    }
    const count = Math.min(randomCount, pool.length);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, count);
    setRandomRecipes(picked);
    // Pre-select all ingredients
    const allKeys = new Set<string>();
    picked.forEach(r => r.ingredients.forEach(ing => allKeys.add(ingredientKey(r.id, ing.id))));
    setSelectedIngredients(allKeys);
    setRandomCountVisible(false);
    setRandomReviewVisible(true);
  }

  function toggleIngredient(key: string) {
    setSelectedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addSelectedToShoppingList() {
    setAddingToList(true);
    try {
      // Gelernte Mappings laden als Fallback wenn Zutat keine eigenen Tags hat
      const mappingsRaw = await AsyncStorage.getItem('@ingredient_tag_mappings');
      const mappings: IngredientTagMapping[] = mappingsRaw ? JSON.parse(mappingsRaw) : [];
      const raw = await AsyncStorage.getItem('@shopping_lists');
      const lists: ShoppingListDef[] = raw ? JSON.parse(raw) : [];
      const targetIdx = lists.findIndex(l => l.id === selectedShoppingListId);
      if (targetIdx === -1) { Alert.alert('Fehler', 'Liste nicht gefunden.'); setAddingToList(false); return; }

      let addedCount = 0;
      randomRecipes.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
          const key = ingredientKey(recipe.id, ing.id);
          if (!selectedIngredients.has(key)) return;
          const label = ingredientLabel(ing);
          // Rezept-Tags haben Vorrang; sonst gelernte Zuordnungen als Fallback
          const mappingMatch = (ing.tags && ing.tags.length > 0)
            ? null
            : findMappingFor(ing.name, mappings);
          lists[targetIdx].items.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: label,
            checked: false,
            createdAt: Date.now(),
            checkedAt: null,
            tags: (ing.tags && ing.tags.length > 0) ? ing.tags : (mappingMatch?.tagIds ?? []),
          });
          addedCount++;
        });
      });

      await AsyncStorage.setItem('@shopping_lists', JSON.stringify(lists));
      await AsyncStorage.setItem('@last_shopping_list_id', selectedShoppingListId);
      ApiService.syncShoppingListsToServer(lists).catch(() => {});

      // Alle zufälligen Rezepte in die Planer-Reserve eintragen
      const reserveRaw = await AsyncStorage.getItem('@meal_reserve');
      const reserveList: { id: string; title: string; notes?: string }[] = reserveRaw ? JSON.parse(reserveRaw) : [];
      let addedToReserve = 0;
      for (const recipe of randomRecipes) {
        const alreadyIn = reserveList.some(r => r.title.toLowerCase() === recipe.name.toLowerCase());
        if (!alreadyIn) {
          reserveList.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, title: recipe.name });
          addedToReserve++;
        }
      }
      if (addedToReserve > 0) {
        await AsyncStorage.setItem('@meal_reserve', JSON.stringify(reserveList));
      }

      setRandomReviewVisible(false);
      const listName = lists[targetIdx].name;
      const reserveHint = addedToReserve > 0 ? `\n${addedToReserve} Gericht${addedToReserve !== 1 ? 'e' : ''} zur Planer-Reserve hinzugefügt.` : '';
      Alert.alert('Fertig!', `${addedCount} Zutat${addedCount !== 1 ? 'en' : ''} zu „${listName}" hinzugefügt.${reserveHint}`);
    } catch {
      Alert.alert('Fehler', 'Zutaten konnten nicht hinzugefügt werden.');
    } finally {
      setAddingToList(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  const renderRecipeItem = ({ item }: { item: Recipe }) => {
    const health = item.healthLevel ? HEALTH_CONFIG[item.healthLevel] : null;
    const iconDef = getRecipeIcon(item.icon);
    return (
      <Card
        row
        style={styles.card}
        onPress={() => navigation.navigate('RecipeDetail', { recipe: item })}
        onLongPress={() => setActionRecipe(item)}
      >
        <View style={styles.cardIcon}>
          <Ionicons name={iconDef.icon} size={22} color={colors.textSub} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardSub}>
              {item.ingredients.length === 0 ? 'Keine Zutaten' : `${item.ingredients.length} Zutat${item.ingredients.length !== 1 ? 'en' : ''}`}
            </Text>
            {health && item.healthLevel && (
              <Chip
                label={health.label}
                color={healthColor(item.healthLevel, colors)}
                dot
                selected
                size="sm"
              />
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    );
  };

  const filteredRecipes = searchQuery.trim()
    ? recipes.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : recipes;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Gerichte"
        subtitle={recipes.length > 0 ? `${recipes.length} Rezept${recipes.length !== 1 ? 'e' : ''}` : undefined}
        actions={
          searchActive
            ? undefined
            : [{ icon: 'search-outline', onPress: () => setSearchActive(true), accessibilityLabel: 'Suchen' }]
        }
      >
        {searchActive && (
          <View style={styles.searchRow}>
            <Input
              containerStyle={{ flex: 1 }}
              placeholder="Gericht suchen..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <Button
              variant="ghost"
              size="sm"
              standalone
              onPress={() => { setSearchActive(false); setSearchQuery(''); }}
            >
              Abbrechen
            </Button>
          </View>
        )}
      </ScreenHeader>

      {filteredRecipes.length === 0 ? (
        recipes.length === 0 ? (
          <EmptyState icon="restaurant-outline" title="Noch keine Rezepte" subtitle="Erstelle dein erstes Gericht." />
        ) : (
          <EmptyState icon="search-outline" title="Kein Treffer" subtitle={`Kein Gericht passend zu „${searchQuery}“`} />
        )
      ) : (
        <FlatList
          data={filteredRecipes}
          renderItem={renderRecipeItem}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Fab icon="add" onPress={() => setIsModalVisible(true)} accessibilityLabel="Neues Rezept" />

      {recipes.length > 0 && (
        <Fab
          icon="dice-outline"
          label="Zufall"
          variant="secondary"
          offset={96}
          onPress={() => setRandomCountVisible(true)}
          accessibilityLabel="Zufällige Gerichte"
        />
      )}

      <Sheet
        visible={isModalVisible}
        onClose={() => { setIsModalVisible(false); setNewRecipeName(''); }}
        title="Neues Rezept"
        keyboardAware
      >
        <Input
          placeholder="Rezept-Name..."
          value={newRecipeName}
          onChangeText={setNewRecipeName}
          autoFocus
          onSubmitEditing={handleCreateRecipe}
          returnKeyType="done"
        />
        <SheetActions>
          <Button variant="secondary" onPress={() => { setIsModalVisible(false); setNewRecipeName(''); }}>
            Abbrechen
          </Button>
          <Button onPress={handleCreateRecipe} disabled={!newRecipeName.trim()}>Erstellen</Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={randomCountVisible}
        onClose={() => setRandomCountVisible(false)}
        title="Zufällige Gerichte"
        subtitle="Wie viele Gerichte zufällig auswählen?"
        bottomInset={24}
      >
        <View style={styles.countRow}>
          <IconButton
            icon="remove"
            onPress={() => setRandomCount(c => Math.max(1, c - 1))}
            accessibilityLabel="Weniger"
            variant="tonal"
          />
          <Text style={styles.countNum}>{randomCount}</Text>
          <IconButton
            icon="add"
            onPress={() => setRandomCount(c => Math.min(recipes.length, c + 1))}
            accessibilityLabel="Mehr"
            variant="tonal"
          />
        </View>
        <Text style={styles.countNote}>{recipes.length} Gerichte verfügbar</Text>

        <Text style={styles.filterLabel}>Gesundheitsstufe filtern</Text>
        <View style={styles.filterRow}>
          {ALL_HEALTH_LEVELS.map(level => {
            const cfg = HEALTH_CONFIG[level];
            const active = randomHealthFilter.has(level);
            return (
              <Chip
                key={level}
                label={cfg.label}
                icon={cfg.icon}
                color={healthColor(level, colors)}
                selected={active}
                size="sm"
                onPress={() => setRandomHealthFilter(prev => {
                  const next = new Set(prev);
                  if (next.has(level)) { if (next.size > 1) next.delete(level); }
                  else next.add(level);
                  return next;
                })}
              />
            );
          })}
        </View>
        {randomHealthFilter.size < ALL_HEALTH_LEVELS.length && (
          <TouchableOpacity onPress={() => setRandomHealthFilter(new Set(ALL_HEALTH_LEVELS))}>
            <Text style={styles.filterReset}>Alle auswählen</Text>
          </TouchableOpacity>
        )}

        <SheetActions>
          <Button icon="shuffle-outline" onPress={rollRandom}>Abfeuern</Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={randomReviewVisible}
        onClose={() => setRandomReviewVisible(false)}
        title="Zutaten prüfen"
        subtitle={`${selectedIngredients.size} gewählt`}
      >
        {shoppingLists.length > 1 && (
          <View style={styles.listPicker}>
            <Text style={styles.listPickerLabel}>Liste</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listPickerRow}>
              {shoppingLists.map(list => (
                <Chip
                  key={list.id}
                  label={list.name}
                  selected={list.id === selectedShoppingListId}
                  onPress={async () => {
                    setSelectedShoppingListId(list.id);
                    await AsyncStorage.setItem('@last_shopping_list_id', list.id);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          {randomRecipes.map(recipe => {
            const hasIngredients = recipe.ingredients.length > 0;
            return (
              <View key={recipe.id} style={styles.reviewRecipe}>
                <View style={styles.reviewHead}>
                  <Ionicons name={getRecipeIcon(recipe.icon).icon} size={16} color={colors.textSub} />
                  <Text style={styles.reviewName}>{recipe.name}</Text>
                  {recipe.healthLevel && (
                    <View
                      style={[styles.reviewDot, { backgroundColor: healthColor(recipe.healthLevel, colors) }]}
                    />
                  )}
                  <Text style={styles.reviewCount}>
                    {recipe.ingredients.length} Zutat{recipe.ingredients.length !== 1 ? 'en' : ''}
                  </Text>
                </View>
                {!hasIngredients ? (
                  <Text style={styles.reviewEmpty}>Keine Zutaten eingetragen</Text>
                ) : recipe.ingredients.map(ing => {
                  const key = ingredientKey(recipe.id, ing.id);
                  const checked = selectedIngredients.has(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.reviewRow}
                      onPress={() => toggleIngredient(key)}
                      activeOpacity={0.7}
                    >
                      <Checkbox checked={checked} shape="square" size={20} />
                      <Text style={[styles.reviewIng, !checked && styles.reviewIngOff]}>
                        {ingredientLabel(ing)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        <SheetActions>
          <Button
            variant="secondary"
            icon="refresh-outline"
            onPress={() => { setRandomReviewVisible(false); setRandomCountVisible(true); }}
          >
            Neu würfeln
          </Button>
          <Button
            icon="cart-outline"
            loading={addingToList}
            disabled={selectedIngredients.size === 0}
            onPress={addSelectedToShoppingList}
          >
            {`${selectedIngredients.size} hinzufügen`}
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isRenameModalVisible}
        onClose={() => setIsRenameModalVisible(false)}
        title="Rezept umbenennen"
        keyboardAware
      >
        <Input placeholder="Neuer Name..." value={renameText} onChangeText={setRenameText} autoFocus />
        <SheetActions>
          <Button variant="secondary" onPress={() => { setIsRenameModalVisible(false); setRenameRecipe(null); }}>
            Abbrechen
          </Button>
          <Button onPress={handleRenameRecipe} disabled={!renameText.trim()}>Speichern</Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={actionRecipe !== null}
        onClose={() => setActionRecipe(null)}
        title={actionRecipe?.name}
      >
        <ListRow
          title="Umbenennen"
          icon="pencil-outline"
          onPress={() => {
            if (actionRecipe) {
              setRenameRecipe(actionRecipe);
              setRenameText(actionRecipe.name);
              setIsRenameModalVisible(true);
              setActionRecipe(null);
            }
          }}
        />
        <ListRow
          title="Löschen"
          icon="trash-outline"
          destructive
          onPress={async () => {
            if (actionRecipe) {
              setActionRecipe(null);
              await saveRecipes(recipes.filter(r => r.id !== actionRecipe.id));
            }
          }}
        />
        <SheetActions>
          <Button variant="secondary" onPress={() => setActionRecipe(null)}>Abbrechen</Button>
        </SheetActions>
      </Sheet>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.sm },
    list: { padding: t.spacing.lg },
    card: { marginBottom: t.spacing.md },
    cardIcon: {
      width: 40,
      height: 40,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: t.spacing.md,
    },
    cardBody: { flex: 1 },
    cardTitle: { ...t.type.bodyStrong, color: t.colors.text },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.xs },
    cardSub: { ...t.type.caption, color: t.colors.textMuted },
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.xl,
    },
    countNum: { ...t.type.display, color: t.colors.text, minWidth: 48, textAlign: 'center' },
    countNote: { ...t.type.caption, color: t.colors.textMuted, textAlign: 'center', marginTop: t.spacing.sm },
    filterLabel: { ...t.type.label, color: t.colors.textSub, marginTop: t.spacing.xl, marginBottom: t.spacing.sm },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    filterReset: { ...t.type.label, color: t.colors.accent, marginTop: t.spacing.md },
    listPicker: { marginBottom: t.spacing.md },
    listPickerLabel: { ...t.type.label, color: t.colors.textSub, marginBottom: t.spacing.sm },
    listPickerRow: { gap: t.spacing.sm },
    reviewRecipe: { marginBottom: t.spacing.lg },
    reviewHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
    reviewName: { ...t.type.bodyStrong, color: t.colors.text, flexShrink: 1 },
    reviewDot: { width: 6, height: 6, borderRadius: 3 },
    reviewCount: { ...t.type.caption, color: t.colors.textMuted, marginLeft: 'auto' },
    reviewEmpty: { ...t.type.caption, color: t.colors.textMuted, fontStyle: 'italic' },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.sm,
    },
    reviewIng: { ...t.type.body, color: t.colors.text, flex: 1 },
    reviewIngOff: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
  });
