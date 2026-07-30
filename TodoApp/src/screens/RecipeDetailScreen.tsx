import React, { useState, useEffect } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Recipe, Ingredient, Tag, HealthLevel, ShoppingListDef } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../services/ApiService';
import { migrateMappings, mergeMappings } from '../services/ingredientTags';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  RECIPE_ICONS,
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
  ConfirmSheet,
} from '../components';

export default function RecipeDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [recipe, setRecipe] = useState<Recipe>(route.params.recipe);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientAmount, setIngredientAmount] = useState('');
  const [ingredientUnit, setIngredientUnit] = useState('');
  const [isShoppingModalVisible, setIsShoppingModalVisible] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedIngredientTags, setSelectedIngredientTags] = useState<string[]>([]);
  const [isIngredientTagModalVisible, setIsIngredientTagModalVisible] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [isHealthModalVisible, setIsHealthModalVisible] = useState(false);
  const [isIconModalVisible, setIsIconModalVisible] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListDef[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<string>('');
  const [deleteIngredientId, setDeleteIngredientId] = useState<string | null>(null);

  useEffect(() => {
    loadTags();
    loadMappingsFromServer();
    loadShoppingLists();
  }, [recipe.name]);

  const loadTags = async () => {
    try {
      const data = await AsyncStorage.getItem('@tags');
      if (data) setTags(JSON.parse(data));
    } catch (e) {}
  };

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

  /**
   * Lief vorher alle 5 Sekunden und hat den lokalen Speicher jedes Mal
   * bedingungslos mit dem Serverstand ueberschrieben. Eine Zuordnung, die
   * die Einkaufsliste gerade gelernt hatte, deren Sync aber noch nicht durch
   * war, wurde dadurch geloescht -- solange irgendwo ein Rezept offen war.
   *
   * Jetzt einmalig beim Oeffnen und zusammenfuehrend statt ersetzend.
   */
  const loadMappingsFromServer = async () => {
    try {
      const serverRaw = await ApiService.fetchMappingsFromServer();
      if (!serverRaw) return;
      const localRaw = await AsyncStorage.getItem('@ingredient_tag_mappings');
      const merged = mergeMappings(
        migrateMappings(localRaw ? JSON.parse(localRaw) : []),
        migrateMappings(serverRaw),
      );
      await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(merged));
    } catch (e) {}
  };

  const saveRecipe = async (updatedRecipe: Recipe) => {
    try {
      const withTimestamp = { ...updatedRecipe, updatedAt: Date.now() };
      const data = await AsyncStorage.getItem('@recipes');
      const recipes: Recipe[] = data ? JSON.parse(data) : [];
      const index = recipes.findIndex(r => r.id === withTimestamp.id);
      if (index !== -1) {
        recipes[index] = withTimestamp;
        await AsyncStorage.setItem('@recipes', JSON.stringify(recipes));
        setRecipe(withTimestamp);
        ApiService.syncRecipesToServer(recipes).catch(() => {});
      }
    } catch (e) {}
  };

  const handleAddIngredient = async () => {
    if (ingredientName.trim()) {
      const newIngredient: Ingredient = {
        id: Date.now().toString(), name: ingredientName.trim(),
        amount: ingredientAmount.trim(), unit: ingredientUnit.trim(), tags: selectedIngredientTags,
      };
      await saveRecipe({ ...recipe, ingredients: [...recipe.ingredients, newIngredient] });
      setIngredientName(''); setIngredientAmount(''); setIngredientUnit('');
      setSelectedIngredientTags([]); setIsModalVisible(false);
    }
  };

  const handleOpenIngredientTagModal = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setSelectedIngredientTags(ingredient.tags || []);
    setIsIngredientTagModalVisible(true);
  };

  const handleSaveIngredientTags = async () => {
    if (editingIngredient) {
      await saveRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === editingIngredient.id ? { ...i, tags: selectedIngredientTags } : i) });
      setIsIngredientTagModalVisible(false); setEditingIngredient(null); setSelectedIngredientTags([]);
    }
  };

  const toggleIngredientTag = (tagId: string) => {
    setSelectedIngredientTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleDeleteIngredient = (ingredientId: string) => {
    saveRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== ingredientId) });
  };

  const handleSetHealthLevel = async (level: HealthLevel | null) => {
    await saveRecipe({ ...recipe, healthLevel: level ?? undefined });
    setIsHealthModalVisible(false);
  };

  const handleSetIcon = async (iconKey: string) => {
    await saveRecipe({ ...recipe, icon: iconKey });
    setIsIconModalVisible(false);
  };

  const handleOpenShoppingModal = () => {
    setSelectedIngredients(recipe.ingredients.map(i => i.id));
    setIsShoppingModalVisible(true);
  };

  const toggleIngredientSelection = (ingredientId: string) => {
    setSelectedIngredients(prev => prev.includes(ingredientId) ? prev.filter(id => id !== ingredientId) : [...prev, ingredientId]);
  };

  const handleAddSelectedToShoppingList = async () => {
    try {
      const raw = await AsyncStorage.getItem('@shopping_lists');
      const lists: ShoppingListDef[] = raw ? JSON.parse(raw) : [];
      const targetIdx = lists.findIndex(l => l.id === selectedShoppingListId);
      if (targetIdx === -1) { Alert.alert('Fehler', 'Liste nicht gefunden.'); return; }
      const ingredientsToAdd = recipe.ingredients.filter(i => selectedIngredients.includes(i.id));
      let addedCount = 0;
      for (const ingredient of ingredientsToAdd) {
        const exists = lists[targetIdx].items.find(item => item.name.toLowerCase().includes(ingredient.name.toLowerCase()));
        if (!exists) {
          lists[targetIdx].items.push({ id: `${Date.now()}-${Math.random()}`, name: `${ingredient.amount} ${ingredient.unit} ${ingredient.name}`.trim(), checked: false, createdAt: Date.now(), checkedAt: null, tags: ingredient.tags || [] });
          addedCount++;
        }
      }
      await AsyncStorage.setItem('@shopping_lists', JSON.stringify(lists));
      await AsyncStorage.setItem('@last_shopping_list_id', selectedShoppingListId);
      ApiService.syncShoppingListsToServer(lists).catch(() => {});
      // Rezept in Reserve des Planers eintragen (falls noch nicht vorhanden)
      const reserveRaw = await AsyncStorage.getItem('@meal_reserve');
      const reserveList: { id: string; title: string; notes?: string }[] = reserveRaw ? JSON.parse(reserveRaw) : [];
      const alreadyInReserve = reserveList.some(r => r.title.toLowerCase() === recipe.name.toLowerCase());
      if (!alreadyInReserve) {
        reserveList.push({ id: `${Date.now()}`, title: recipe.name });
        await AsyncStorage.setItem('@meal_reserve', JSON.stringify(reserveList));
      }
      setIsShoppingModalVisible(false);
      const listName = lists[targetIdx].name;
      Alert.alert('Erfolg', `${addedCount} Zutat${addedCount !== 1 ? 'en' : ''} zu „${listName}" hinzugefügt${alreadyInReserve ? '' : '\nRezept zur Planer-Reserve hinzugefügt'}`);
    } catch (e) {}
  };

  const renderIngredient = ({ item }: { item: Ingredient }) => {
    const ingredientTags = (item.tags || []).map(tagId => tags.find(t => t.id === tagId)).filter(Boolean) as Tag[];
    return (
      <Card
        row
        style={styles.card}
        onPress={() => handleOpenIngredientTagModal(item)}
        onLongPress={() => setDeleteIngredientId(item.id)}
      >
        <View style={styles.cardBody}>
          {(item.amount || item.unit) ? (
            <Text style={styles.cardAmount}>{item.amount} {item.unit}</Text>
          ) : null}
          <Text style={styles.cardName}>{item.name}</Text>
          {ingredientTags.length > 0 && (
            <View style={styles.tagsRow}>
              {ingredientTags.map(tag => (
                <Chip key={tag.id} label={tag.name} color={tag.color} selected size="sm" />
              ))}
            </View>
          )}
        </View>
        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
      </Card>
    );
  };

  const health = recipe.healthLevel ? HEALTH_CONFIG[recipe.healthLevel] : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScreenHeader
        title={recipe.name}
        subtitle={recipe.ingredients.length === 0 ? 'Keine Zutaten' : `${recipe.ingredients.length} Zutat${recipe.ingredients.length !== 1 ? 'en' : ''}`}
        variant="compact"
        onBack={() => navigation.goBack()}
        actions={[
          { icon: 'apps-outline', onPress: () => setIsIconModalVisible(true), accessibilityLabel: 'Icon wählen' },
          { icon: 'cart-outline', onPress: handleOpenShoppingModal, accessibilityLabel: 'Zur Einkaufsliste' },
        ]}
      />

      <TouchableOpacity
        style={styles.healthBand}
        onPress={() => setIsHealthModalVisible(true)}
        activeOpacity={0.8}
      >
        {health && recipe.healthLevel ? (
          <>
            <Ionicons name={health.icon} size={16} color={healthColor(recipe.healthLevel, colors)} />
            <Text style={[styles.healthBandText, { color: healthColor(recipe.healthLevel, colors) }]}>
              {health.label}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="fitness-outline" size={16} color={colors.textMuted} />
            <Text style={styles.healthBandPlaceholder}>Gesundheit einstellen</Text>
          </>
        )}
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {recipe.ingredients.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="nutrition-outline" size={56} color={colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Noch keine Zutaten</Text>
          <Text style={styles.emptySub}>Füge die ersten Zutaten hinzu.</Text>
        </View>
      ) : (
        <FlatList
          data={recipe.ingredients}
          renderItem={renderIngredient}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Fab icon="add" onPress={() => setIsModalVisible(true)} accessibilityLabel="Neue Zutat" />

      <Sheet
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        title="Neue Zutat"
        keyboardAware
      >
        <Input
          placeholder="Name (z.B. Mehl)"
          value={ingredientName}
          onChangeText={setIngredientName}
          autoFocus
        />
        <View style={styles.amountRow}>
          <Input
            containerStyle={{ flex: 1 }}
            placeholder="Menge"
            value={ingredientAmount}
            onChangeText={setIngredientAmount}
            keyboardType="numeric"
          />
          <Input
            containerStyle={{ flex: 1 }}
            placeholder="Einheit"
            value={ingredientUnit}
            onChangeText={setIngredientUnit}
          />
        </View>
        {tags.length > 0 && (
          <View style={styles.tagPicker}>
            <Text style={styles.pickerLabel}>Tags</Text>
            <View style={styles.tagPickerRow}>
              {tags.map(tag => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  color={tag.color}
                  selected={selectedIngredientTags.includes(tag.id)}
                  onPress={() => toggleIngredientTag(tag.id)}
                  size="sm"
                />
              ))}
            </View>
          </View>
        )}
        <SheetActions>
          <Button
            variant="secondary"
            onPress={() => {
              setIsModalVisible(false);
              setIngredientName(''); setIngredientAmount(''); setIngredientUnit('');
            }}
          >
            Abbrechen
          </Button>
          <Button onPress={handleAddIngredient} disabled={!ingredientName.trim()}>Hinzufügen</Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isShoppingModalVisible}
        onClose={() => setIsShoppingModalVisible(false)}
        title="Zur Einkaufsliste"
      >
        {shoppingLists.length > 1 && (
          <View style={styles.tagPicker}>
            <Text style={styles.pickerLabel}>Liste</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagPickerRow}>
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

        <Text style={styles.pickerLabel}>Zutaten auswählen</Text>
        <ScrollView style={styles.checkList} showsVerticalScrollIndicator={false}>
          {recipe.ingredients.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.checkItem}
              onPress={() => toggleIngredientSelection(item.id)}
              activeOpacity={0.7}
            >
              <Checkbox checked={selectedIngredients.includes(item.id)} shape="square" size={20} />
              <Text style={styles.checkLabel}>{item.amount} {item.unit} {item.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <SheetActions>
          <Button variant="secondary" onPress={() => setIsShoppingModalVisible(false)}>Abbrechen</Button>
          <Button onPress={handleAddSelectedToShoppingList} disabled={selectedIngredients.length === 0}>
            {`Hinzufügen (${selectedIngredients.length})`}
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isIngredientTagModalVisible}
        onClose={() => setIsIngredientTagModalVisible(false)}
        title="Tags zuweisen"
        subtitle={editingIngredient?.name}
      >
        {tags.length === 0 ? (
          <Text style={styles.noTags}>Noch keine Tags vorhanden</Text>
        ) : (
          <ScrollView style={styles.checkList} showsVerticalScrollIndicator={false}>
            {tags.map(tag => (
              <TouchableOpacity
                key={tag.id}
                style={styles.checkItem}
                onPress={() => toggleIngredientTag(tag.id)}
                activeOpacity={0.7}
              >
                <Checkbox
                  checked={selectedIngredientTags.includes(tag.id)}
                  shape="square"
                  size={20}
                />
                <Chip label={tag.name} color={tag.color} selected size="sm" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <SheetActions>
          <Button
            variant="secondary"
            onPress={() => {
              setIsIngredientTagModalVisible(false);
              setEditingIngredient(null);
              setSelectedIngredientTags([]);
            }}
          >
            Abbrechen
          </Button>
          <Button onPress={handleSaveIngredientTags}>Speichern</Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isHealthModalVisible}
        onClose={() => setIsHealthModalVisible(false)}
        title="Wie gesund ist das Gericht?"
        bottomInset={24}
      >
        {ALL_HEALTH_LEVELS.map(level => {
          const cfg = HEALTH_CONFIG[level];
          const tone = healthColor(level, colors);
          const isActive = recipe.healthLevel === level;
          return (
            <TouchableOpacity
              key={level}
              style={[styles.healthOption, isActive && { backgroundColor: `${tone}1F`, borderColor: tone }]}
              onPress={() => handleSetHealthLevel(level)}
              activeOpacity={0.75}
            >
              <View style={[styles.healthOptionIcon, { backgroundColor: `${tone}22` }]}>
                <Ionicons name={cfg.icon} size={20} color={tone} />
              </View>
              <Text style={[styles.healthOptionLabel, isActive && { color: tone }]}>{cfg.label}</Text>
              {isActive && (
                <Ionicons name="checkmark-circle" size={20} color={tone} style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          );
        })}
        {recipe.healthLevel && (
          <SheetActions>
            <Button variant="secondary" icon="close-outline" onPress={() => handleSetHealthLevel(null)}>
              Zurücksetzen
            </Button>
          </SheetActions>
        )}
      </Sheet>

      <Sheet
        visible={isIconModalVisible}
        onClose={() => setIsIconModalVisible(false)}
        title="Icon wählen"
        bottomInset={24}
      >
        <ScrollView contentContainerStyle={styles.iconGrid} showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
          {RECIPE_ICONS.map(iconDef => {
            const isActive = getRecipeIcon(recipe.icon).key === iconDef.key;
            return (
              <TouchableOpacity
                key={iconDef.key}
                style={[styles.iconGridItem, isActive && styles.iconGridItemActive]}
                onPress={() => handleSetIcon(iconDef.key)}
                activeOpacity={0.75}
              >
                <View style={styles.iconGridCircle}>
                  <Ionicons
                    name={iconDef.icon}
                    size={24}
                    color={isActive ? colors.accent : colors.textSub}
                  />
                </View>
                <Text
                  style={[styles.iconGridLabel, isActive && { color: colors.accent }]}
                  numberOfLines={1}
                >
                  {iconDef.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Sheet>

      <ConfirmSheet
        visible={deleteIngredientId !== null}
        title="Zutat löschen"
        message="Zutat wirklich aus dem Rezept entfernen?"
        onConfirm={() => {
          const id = deleteIngredientId;
          setDeleteIngredientId(null);
          if (id) handleDeleteIngredient(id);
        }}
        onCancel={() => setDeleteIngredientId(null)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    healthBand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    healthBandText: { ...t.type.label },
    healthBandPlaceholder: { ...t.type.label, color: t.colors.textMuted },
    list: { padding: t.spacing.lg },
    card: { marginBottom: t.spacing.sm },
    cardBody: { flex: 1 },
    cardAmount: { ...t.type.caption, color: t.colors.textMuted, marginBottom: 2 },
    cardName: { ...t.type.bodyStrong, color: t.colors.text },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, marginTop: t.spacing.sm },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: t.spacing.xl },
    emptyIcon: { marginBottom: t.spacing.lg, opacity: 0.6 },
    emptyTitle: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.sm },
    emptySub: { ...t.type.body, color: t.colors.textSub, textAlign: 'center' },
    amountRow: { flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.md },
    tagPicker: { marginTop: t.spacing.md },
    pickerLabel: { ...t.type.label, color: t.colors.textSub, marginBottom: t.spacing.sm },
    tagPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    checkList: { maxHeight: 320 },
    checkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.sm,
    },
    checkLabel: { ...t.type.body, color: t.colors.text, flex: 1 },
    noTags: { ...t.type.body, color: t.colors.textMuted, fontStyle: 'italic' },
    healthOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      padding: t.spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
      marginBottom: t.spacing.sm,
    },
    healthOptionIcon: {
      width: 36,
      height: 36,
      borderRadius: t.radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    healthOptionLabel: { ...t.type.bodyStrong, color: t.colors.text },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    iconGridItem: {
      width: '22%',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    iconGridItemActive: {
      backgroundColor: t.colors.accentSurface,
      borderColor: t.colors.accentBorder,
    },
    iconGridCircle: {
      width: 44,
      height: 44,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: t.spacing.xs,
    },
    iconGridLabel: { ...t.type.caption, color: t.colors.textSub, textAlign: 'center' },
  });
