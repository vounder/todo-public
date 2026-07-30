import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  FlatList, ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ShoppingItem, ShoppingListDef, AppSettings, Tag, SortSettings, SortType, CustomSort, IngredientTagMapping } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { TAG_COLORS } from '../theme/tokens';
import { autoTagsFor, migrateMappings, mergeMappings } from '../services/ingredientTags';
import { Text, Checkbox, Chip } from '../components';

export default function ShoppingListScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Frueher eine feste Modulkonstante; jetzt ans Theme gebunden, damit
  // die Aufrufstellen im JSX unveraendert bleiben.
  const PRIMARY = colors.accent;
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [autoDeleteHours, setAutoDeleteHours] = useState('24');
  const [keyboardShown, setKeyboardShown] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [isTagModalVisible, setIsTagModalVisible] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [selectedItemForTags, setSelectedItemForTags] = useState<ShoppingItem | null>(null);
  const [isItemTagModalVisible, setIsItemTagModalVisible] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  const [isContextMenuVisible, setIsContextMenuVisible] = useState(false);
  const [menuItem, setMenuItem] = useState<ShoppingItem | null>(null);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

  // Multi-list
  const [shoppingLists, setShoppingLists] = useState<ShoppingListDef[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [isListPickerVisible, setIsListPickerVisible] = useState(false);
  const [isManageListsVisible, setIsManageListsVisible] = useState(false);
  const [isAllListsView, setIsAllListsView] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameListText, setRenameListText] = useState('');

  const [mappings, setMappings] = useState<IngredientTagMapping[]>([]);
  const mappingsRef = useRef<IngredientTagMapping[]>([]);
  const [sortSettings, setSortSettings] = useState<SortSettings>({ activeSort: 'default', customSorts: [] });
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  const [isCustomSortModalVisible, setIsCustomSortModalVisible] = useState(false);
  const [newSortName, setNewSortName] = useState('');
  const [customTagOrder, setCustomTagOrder] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useFocusEffect(useCallback(() => {
    loadShoppingLists(); loadTags(); loadSortSettings(); loadMappingsFromServer();
  }, []));

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setKeyboardShown(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setKeyboardShown(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  const loadTags = async () => {
    try {
      const data = await AsyncStorage.getItem('@tags');
      if (data) setTags(JSON.parse(data));
      try {
        const serverTags = await ApiService.fetchTagsFromServer();
        if (serverTags) { await AsyncStorage.setItem('@tags', JSON.stringify(serverTags)); setTags(serverTags); }
      } catch (e) {}
    } catch (e) {}
  };

  const saveTags = async (newTags: Tag[]) => {
    try {
      await AsyncStorage.setItem('@tags', JSON.stringify(newTags));
      setTags(newTags);
      ApiService.syncTagsToServer(newTags).catch(() => {});
    } catch (e) {}
  };

  // Migriert altes tagId-Format zu tagIds-Array
  const loadMappingsFromServer = async () => {
    try {
      const localData = await AsyncStorage.getItem('@ingredient_tag_mappings');
      const localMappings = localData ? migrateMappings(JSON.parse(localData)) : [];
      if (localMappings.length > 0) {
        mappingsRef.current = localMappings;
        setMappings(localMappings);
        // Migrierte Daten sofort lokal persistieren
        await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(localMappings));
      }
      const serverRaw = await ApiService.fetchMappingsFromServer();
      if (serverRaw) {
        // Vereinen statt nach Anzahl entscheiden: eine gerade gelernte
        // Zuordnung, deren Sync noch nicht durch war, ging vorher beim
        // naechsten Fokussieren verloren.
        const merged = mergeMappings(localMappings, migrateMappings(serverRaw));
        mappingsRef.current = merged;
        await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(merged));
        setMappings(merged);
        // Lokal Gelerntes, das der Server nicht kannte, nachreichen.
        if (merged.length > serverRaw.length) {
          ApiService.syncMappingsToServer(merged).catch(() => {});
        }
      }
    } catch (e) {}
  };

  const saveMappings = async (newMappings: IngredientTagMapping[]) => {
    mappingsRef.current = newMappings; // synchron aktuell halten
    setMappings(newMappings);
    await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(newMappings));
    ApiService.syncMappingsToServer(newMappings).catch(() => {});
  };

  const loadSortSettings = async () => {
    try {
      const data = await AsyncStorage.getItem('@sort_settings');
      const parsed = data ? JSON.parse(data) : {};
      const local: SortSettings = {
        activeSort: parsed.activeSort ?? 'default',
        activeSortId: parsed.activeSortId,
        customSorts: parsed.customSorts ?? [],
      };
      setSortSettings(local);

      try {
        const serverSettings = await ApiService.fetchSortSettingsFromServer();
        if (!serverSettings) return;

        // Eigene Sortierungen aus beiden Quellen vereinen statt die lokalen
        // durch die Serverantwort zu ersetzen. Vorher wurde ein fehlendes
        // customSorts zu [] und hat den lokalen Speicher geleert -- und genau
        // das passierte immer, weil das Server-Schema das Feld gar nicht
        // kannte. Eine Sortierung, die der Server nicht kennt, ist nicht
        // geloescht; sie ist nur noch nicht angekommen.
        const serverSorts = serverSettings.customSorts ?? [];
        const byId = new Map((local.customSorts ?? []).map(s => [s.id, s]));
        serverSorts.forEach(s => byId.set(s.id, s));
        const merged: SortSettings = {
          activeSort: serverSettings.activeSort ?? local.activeSort,
          activeSortId: serverSettings.activeSortId ?? local.activeSortId,
          customSorts: [...byId.values()],
        };
        setSortSettings(merged);
        await AsyncStorage.setItem('@sort_settings', JSON.stringify(merged));

        if (merged.customSorts.length > serverSorts.length) {
          ApiService.syncSortSettingsToServer(merged).catch(() => {});
        }
      } catch (e) {}
    } catch (e) {}
  };

  const saveSortSettings = async (settings: SortSettings) => {
    try {
      await AsyncStorage.setItem('@sort_settings', JSON.stringify(settings));
      setSortSettings(settings);
      ApiService.syncSortSettingsToServer(settings).catch(() => {});
    } catch (e) {}
  };

  // ── Multi-List Management ──────────────────────────────────────
  const DEFAULT_LIST_ID = 'default';

  async function loadShoppingLists() {
    try {
      // Lade lokale Listen
      let lists: ShoppingListDef[] = [];
      const raw = await AsyncStorage.getItem('@shopping_lists');
      if (raw) {
        lists = JSON.parse(raw);
      } else {
        // Migration: alte @shopping_list einmalig übernehmen
        const oldRaw = await AsyncStorage.getItem('@shopping_list');
        const oldItems: ShoppingItem[] = oldRaw ? JSON.parse(oldRaw) : [];
        lists = [{ id: DEFAULT_LIST_ID, name: 'Einkaufsliste', createdAt: Date.now(), items: oldItems }];
        await AsyncStorage.setItem('@shopping_lists', JSON.stringify(lists));
      }
      if (lists.length === 0) {
        lists = [{ id: DEFAULT_LIST_ID, name: 'Einkaufsliste', createdAt: Date.now(), items: [] }];
        await AsyncStorage.setItem('@shopping_lists', JSON.stringify(lists));
      }

      // Prüfe auto-delete auf aktiver Liste
      const settingsData = await AsyncStorage.getItem('@app_settings');
      const settings: AppSettings = settingsData ? JSON.parse(settingsData) : {};
      const deleteAfterHours = settings.autoDeleteCheckedShoppingAfterHours || 24;
      setAutoDeleteHours(deleteAfterHours.toString());
      const now = Date.now();
      lists = lists.map(list => ({
        ...list,
        items: list.items.filter(item => {
          if (!item.checked || !item.checkedAt) return true;
          return (now - item.checkedAt) / (1000 * 60 * 60) < deleteAfterHours;
        }),
      }));

      setShoppingLists(lists);
      // Active list: entweder bisher gewählt oder erste Liste
      setActiveListId(prev => {
        const valid = prev && lists.some(l => l.id === prev);
        const id = valid ? prev : lists[0].id;
        setItems(lists.find(l => l.id === id)?.items || []);
        return id;
      });

      // Server sync
      try {
        const serverLists = await ApiService.fetchShoppingListsFromServer();
        if (serverLists && serverLists.length > 0) {
          await AsyncStorage.setItem('@shopping_lists', JSON.stringify(serverLists));
          setShoppingLists(serverLists);
          setActiveListId(prev => {
            const id = serverLists.some(l => l.id === prev) ? prev : serverLists[0].id;
            setItems(serverLists.find(l => l.id === id)?.items || []);
            return id;
          });
        }
      } catch {}
    } catch (e) {}
  }

  // Aktive Liste wechseln
  function switchToList(id: string) {
    setIsAllListsView(false);
    const list = shoppingLists.find(l => l.id === id);
    if (list) {
      setActiveListId(id);
      setItems(list.items);
    }
    setIsListPickerVisible(false);
  }

  // Alle Listen nach Änderung persistieren & synchen
  async function persistLists(updated: ShoppingListDef[]) {
    setShoppingLists(updated);
    await AsyncStorage.setItem('@shopping_lists', JSON.stringify(updated));
    ApiService.syncShoppingListsToServer(updated).catch(() => {});
  }

  async function handleCreateList() {
    if (!newListName.trim()) return;
    const newList: ShoppingListDef = {
      id: Date.now().toString(),
      name: newListName.trim(),
      createdAt: Date.now(),
      items: [],
    };
    const updated = [...shoppingLists, newList];
    await persistLists(updated);
    setNewListName('');
    switchToList(newList.id);
  }

  async function handleRenameList() {
    if (!renamingListId || !renameListText.trim()) return;
    const updated = shoppingLists.map(l =>
      l.id === renamingListId ? { ...l, name: renameListText.trim() } : l
    );
    await persistLists(updated);
    setRenamingListId(null);
    setRenameListText('');
  }

  async function handleDeleteList(id: string) {
    if (shoppingLists.length <= 1) {
      Alert.alert('Nicht möglich', 'Die letzte Einkaufsliste kann nicht gelöscht werden.');
      return;
    }
    const list = shoppingLists.find(l => l.id === id);
    setConfirmModal({
      title: 'Liste löschen',
      message: `„${list?.name}“ wirklich löschen?`,
      onConfirm: async () => {
        const updated = shoppingLists.filter(l => l.id !== id);
        await persistLists(updated);
        if (activeListId === id) switchToList(updated[0].id);
      },
    });
  }

  // ── Items der aktiven Liste laden/speichern ─────────────────────
  const loadItems = async () => loadShoppingLists();

  const saveItems = async (newItems: ShoppingItem[]) => {
    try {
      setItems(newItems);
      const updated = shoppingLists.map(l =>
        l.id === activeListId ? { ...l, items: newItems } : l
      );
      await persistLists(updated);
    } catch (e) {}
  };

  const handleAddItem = async () => {
    if (newItemName.trim()) {
      // Aus gelernten Zuordnungen passende Tags raussuchen
      const autoTags = autoTagsFor(newItemName, mappingsRef.current);
      const newItem: ShoppingItem = { id: Date.now().toString(), name: newItemName.trim(), checked: false, createdAt: Date.now(), checkedAt: null, tags: autoTags };
      await saveItems([...items, newItem]);
      setNewItemName('');
      Keyboard.dismiss();
    }
  };

  const handleCreateTag = async () => {
    if (newTagName.trim()) {
      const newTag: Tag = { id: Date.now().toString(), name: newTagName.trim(), color: newTagColor };
      await saveTags([...tags, newTag]);
      setNewTagName(''); setNewTagColor(TAG_COLORS[0]); setIsTagModalVisible(false);
    }
  };

  const handleToggleItemTag = async (item: ShoppingItem, tagId: string) => {
    // Frische Daten aus aktuellem items-State holen — selectedItemForTags ist stale nach erstem Tap
    const freshItem = items.find(i => i.id === item.id) || item;
    const itemTags = freshItem.tags || [];
    const isRemoving = itemTags.includes(tagId);
    const newTags = isRemoving ? itemTags.filter(t => t !== tagId) : [...itemTags, tagId];
    // selectedItemForTags sofort updaten damit Checkboxen im Modal stimmen
    setSelectedItemForTags(prev => prev && prev.id === freshItem.id ? { ...prev, tags: newTags } : prev);
    await saveItems(items.map(i => i.id === freshItem.id ? { ...i, tags: newTags } : i));

    // Auto-Mapping lernen: Tag hinzugefügt/entfernt → Regel speichern/aktualisieren
    const itemNameLower = freshItem.name.trim().toLowerCase();
    const current = mappingsRef.current;
    const existingIndex = current.findIndex(m => m.ingredientName === itemNameLower);
    if (isRemoving) {
      if (existingIndex !== -1) {
        const existingTagIds: string[] = Array.isArray(current[existingIndex].tagIds) ? current[existingIndex].tagIds : [];
        const updatedTagIds = existingTagIds.filter(t => t !== tagId);
        if (updatedTagIds.length === 0) {
          await saveMappings(current.filter((_, i) => i !== existingIndex));
        } else {
          await saveMappings(current.map((m, i) => i === existingIndex ? { ...m, tagIds: updatedTagIds } : m));
        }
      }
    } else {
      if (existingIndex === -1) {
        await saveMappings([...current, { ingredientName: itemNameLower, tagIds: [tagId] }]);
      } else {
        const existingTagIds: string[] = Array.isArray(current[existingIndex].tagIds) ? current[existingIndex].tagIds : [];
        if (!existingTagIds.includes(tagId)) {
          await saveMappings(current.map((m, i) => i === existingIndex ? { ...m, tagIds: [...existingTagIds, tagId] } : m));
        }
      }
    }
  };

  const handleDeleteTag = (tagId: string, tagName: string) => {
    setConfirmModal({
      title: 'Tag löschen',
      message: `Tag „${tagName}“ wirklich löschen? Er wird von allen Items entfernt.`,
      onConfirm: async () => {
        await saveItems(items.map(item => ({ ...item, tags: (item.tags || []).filter(t => t !== tagId) })));
        await saveTags(tags.filter(t => t.id !== tagId));
        if (selectedTagFilter === tagId) setSelectedTagFilter(null);
      },
    });
  };

  const sortItems = (itemsToSort: ShoppingItem[]): ShoppingItem[] => {
    const sorted = [...itemsToSort];
    switch (sortSettings.activeSort) {
      case 'a-z': return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'z-a': return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'length-asc': return sorted.sort((a, b) => a.name.length - b.name.length);
      case 'length-desc': return sorted.sort((a, b) => b.name.length - a.name.length);
      case 'custom':
        if (sortSettings.activeSortId) {
          const customSort = (sortSettings.customSorts || []).find(s => s.id === sortSettings.activeSortId);
          if (customSort) {
            return sorted.sort((a, b) => {
              const ai = Math.min(...(a.tags || []).map(t => customSort.tagOrder.indexOf(t)).filter(i => i >= 0), Infinity);
              const bi = Math.min(...(b.tags || []).map(t => customSort.tagOrder.indexOf(t)).filter(i => i >= 0), Infinity);
              if (ai === Infinity && bi === Infinity) return 0;
              if (ai === Infinity) return 1;
              if (bi === Infinity) return -1;
              return ai - bi;
            });
          }
        }
        return sorted;
      default: return sorted;
    }
  };

  /**
   * Tags in derselben Reihenfolge wie die aktive Item-Sortierung.
   *
   * Damit die Tag-Liste beim Zuweisen nicht in einer anderen Ordnung steht
   * als die Liste, die man gerade vor sich hat. Bewusst dieselben Faelle wie
   * in sortItems -- laufen die auseinander, ist die Verwirrung groesser als
   * ohne Sortierung.
   */
  const sortTags = (tagsToSort: Tag[]): Tag[] => {
    const sorted = [...tagsToSort];
    switch (sortSettings.activeSort) {
      case 'a-z': return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'z-a': return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'length-asc': return sorted.sort((a, b) => a.name.length - b.name.length);
      case 'length-desc': return sorted.sort((a, b) => b.name.length - a.name.length);
      case 'custom': {
        const customSort = (sortSettings.customSorts || []).find(s => s.id === sortSettings.activeSortId);
        if (!customSort) return sorted;
        // Tags ausserhalb der definierten Reihenfolge hinten anhaengen --
        // genau wie sortItems Eintraege ohne Treffer nach unten sortiert.
        return sorted.sort((a, b) => {
          const ai = customSort.tagOrder.indexOf(a.id);
          const bi = customSort.tagOrder.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
      default: return sorted;
    }
  };

  const handleCreateCustomSort = async () => {
    if (newSortName.trim() && customTagOrder.length > 0) {
      const newCustomSort: CustomSort = { id: Date.now().toString(), name: newSortName.trim(), tagOrder: customTagOrder };
      const updatedSettings = { ...sortSettings, customSorts: [...(sortSettings.customSorts || []), newCustomSort], activeSort: 'custom' as SortType, activeSortId: newCustomSort.id };
      await saveSortSettings(updatedSettings);
      setNewSortName(''); setCustomTagOrder([]); setIsCustomSortModalVisible(false);
    }
  };

  const handleSelectSort = async (sortType: SortType, sortId?: string) => {
    await saveSortSettings({ ...sortSettings, activeSort: sortType, activeSortId: sortId });
    setIsSortModalVisible(false);
  };

  const handleDeleteCustomSort = async (sortId: string) => {
    await saveSortSettings({
      ...sortSettings,
      customSorts: (sortSettings.customSorts || []).filter(s => s.id !== sortId),
      activeSort: sortSettings.activeSortId === sortId ? 'default' as SortType : sortSettings.activeSort,
      activeSortId: sortSettings.activeSortId === sortId ? undefined : sortSettings.activeSortId,
    });
  };

  const moveTagInOrder = (tagId: string, direction: 'up' | 'down') => {
    const idx = customTagOrder.indexOf(tagId);
    if (idx === -1) return;
    const newOrder = [...customTagOrder];
    if (direction === 'up' && idx > 0) [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    else if (direction === 'down' && idx < newOrder.length - 1) [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    setCustomTagOrder(newOrder);
  };

  const toggleTagInOrder = (tagId: string) => {
    setCustomTagOrder(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const allTagsInOrder = tags.length > 0 && tags.every(t => customTagOrder.includes(t.id));

  const toggleAllTagsInOrder = () => {
    setCustomTagOrder(prev => {
      const all = tags.length > 0 && tags.every(t => prev.includes(t.id));
      if (all) return [];
      // Bestehende Reihenfolge erhalten, nur die fehlenden Tags anhaengen --
      // sonst wuerde ein Klick die bereits sortierte Liste umwerfen.
      return [...prev, ...tags.filter(t => !prev.includes(t.id)).map(t => t.id)];
    });
  };

  const handleToggleItemInList = async (listId: string, itemId: string) => {
    const targetList = shoppingLists.find(l => l.id === listId);
    if (!targetList) return;
    const newListItems = targetList.items.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked, checkedAt: !item.checked ? Date.now() : null } : item
    );
    const updated = shoppingLists.map(l => l.id === listId ? { ...l, items: newListItems } : l);
    await persistLists(updated);
    if (activeListId === listId) setItems(newListItems);
  };

  const handleToggleItem = async (itemId: string) => {
    if (isAllListsView) {
      const listId = itemToListIdMap.get(itemId);
      if (listId) await handleToggleItemInList(listId, itemId);
      return;
    }
    await saveItems(items.map(item => item.id === itemId ? { ...item, checked: !item.checked, checkedAt: !item.checked ? Date.now() : null } : item));
  };

  const handleDeleteItem = async (itemId: string, _itemName: string) => {
    await saveItems(items.filter(i => i.id !== itemId));
  };

  const handleMoveItem = async (targetListId: string) => {
    if (!menuItem) return;
    const item = menuItem;
    setIsMoveModalVisible(false);
    setMenuItem(null);
    // Aus aktiver Liste entfernen
    const newSourceItems = items.filter(i => i.id !== item.id);
    // Zur Zielliste hinzufügen
    const updated = shoppingLists.map(list => {
      if (list.id === activeListId) return { ...list, items: newSourceItems };
      if (list.id === targetListId) return { ...list, items: [...list.items, item] };
      return list;
    });
    setItems(newSourceItems);
    await persistLists(updated);
  };

  const handleClearChecked = () => {
    setConfirmModal({
      title: 'Erledigte löschen',
      message: isAllListsView ? 'Alle erledigten Items in allen Listen löschen?' : 'Alle abgehakten Items löschen?',
      onConfirm: async () => {
        if (isAllListsView) {
          const updated = shoppingLists.map(l => ({ ...l, items: l.items.filter(i => !i.checked) }));
          await persistLists(updated);
          setItems(updated.find(l => l.id === activeListId)?.items || []);
        } else {
          await saveItems(items.filter(i => !i.checked));
        }
      },
    });
  };

  const getSortDisplayName = () => {
    switch (sortSettings.activeSort) {
      case 'a-z': return 'A-Z';
      case 'z-a': return 'Z-A';
      case 'length-asc': return 'Laenge ';
      case 'length-desc': return 'Laenge ';
      case 'custom':
        const cs = (sortSettings.customSorts || []).find(s => s.id === sortSettings.activeSortId);
        return cs ? cs.name : 'Benutzerdefiniert';
      default: return 'Standard';
    }
  };

  const allListsItems: ShoppingItem[] = shoppingLists.flatMap(list => list.items);
  const itemToListIdMap = new Map<string, string>(
    shoppingLists.flatMap(list => list.items.map(item => [item.id, list.id] as [string, string]))
  );
  const itemToListNameMap = new Map<string, string>(
    shoppingLists.flatMap(list => list.items.map(item => [item.id, list.name] as [string, string]))
  );

  const checkedCount = isAllListsView
    ? allListsItems.filter(i => i.checked).length
    : items.filter(i => i.checked).length;
  let filteredItems: ShoppingItem[] = isAllListsView
    ? allListsItems
    : (selectedTagFilter ? items.filter(item => (item.tags || []).includes(selectedTagFilter)) : items);
  if (!isAllListsView) filteredItems = sortItems(filteredItems);

  const canDrag = !isAllListsView && sortSettings.activeSort === 'default' && !selectedTagFilter;

  const renderItem = ({ item }: ListRenderItemInfo<ShoppingItem>) => {
    const itemTags = (item.tags || []).map(tagId => tags.find(t => t.id === tagId)).filter(Boolean) as Tag[];
    const fromListName = isAllListsView ? itemToListNameMap.get(item.id) : undefined;
    return (
      <TouchableOpacity
        style={[styles.card, item.checked ? styles.cardChecked : { backgroundColor: colors.surface }]}
        onPress={() => handleToggleItem(item.id)}
        onLongPress={() => { setSelectedItemForTags(item); setIsItemTagModalVisible(true); }}
        activeOpacity={0.7}
      >
        <Checkbox checked={item.checked} size={24} />
        <View style={styles.cardBody}>
          {fromListName && (
            <View style={styles.listNameBadge}>
              <Text style={styles.listNameBadgeText}>{fromListName}</Text>
            </View>
          )}
          <Text style={[styles.cardText, item.checked && styles.cardTextDone, { color: item.checked ? colors.textMuted : colors.text }]}>{item.name}</Text>
          {itemTags.length > 0 && (
            <View style={styles.tagsRow}>
              {itemTags.map(tag => (
                <Chip key={tag.id} label={tag.name} color={tag.color} selected size="sm" />
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => setMenuItem(item)} style={styles.delBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.headerTitle}>Einkaufsliste</Text>
            <Text style={styles.headerSub}>
              {isAllListsView
                ? (allListsItems.length === 0 ? 'Leer' : `${allListsItems.length - checkedCount} offen  ${checkedCount} erledigt`)
                : (items.length === 0 ? 'Leer' : `${items.length - checkedCount} offen  ${checkedCount} erledigt`)}
            </Text>
          </View>
          {/* Listenselektor */}
          <TouchableOpacity style={styles.listSelector} onPress={() => setIsListPickerVisible(true)} activeOpacity={0.8}>
            <Text style={styles.listSelectorText} numberOfLines={1}>
              {isAllListsView ? 'Alle Listen' : (shoppingLists.find(l => l.id === activeListId)?.name ?? '')}
            </Text>
            <Ionicons name="chevron-down" size={13} color={colors.textSub} style={{ marginLeft: 3 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setIsContextMenuVisible(true)}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textSub} />
          </TouchableOpacity>
        </View>

        {sortSettings.activeSort !== 'default' && (
          <TouchableOpacity style={styles.sortBadge} onPress={() => setIsSortModalVisible(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="swap-vertical" size={14} color={colors.onAccent} />
              <Text style={styles.sortBadgeText}>{getSortDisplayName()}</Text>
            </View>
          </TouchableOpacity>
        )}

        {tags.length > 0 && !isAllListsView && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
            <TouchableOpacity
              style={[styles.filterChip, !selectedTagFilter && styles.filterChipActive]}
              onPress={() => setSelectedTagFilter(null)}>
              <Text style={[styles.filterChipText, !selectedTagFilter && styles.filterChipTextActive]}>Alle</Text>
            </TouchableOpacity>
            {tags.map(tag => (
              <TouchableOpacity
                key={tag.id}
                style={[styles.filterChip, selectedTagFilter === tag.id && styles.filterChipActive]}
                onPress={() => setSelectedTagFilter(selectedTagFilter === tag.id ? null : tag.id)}
                onLongPress={() => handleDeleteTag(tag.id, tag.name)}>
                <View style={[styles.filterDot, { backgroundColor: tag.color }]} />
                <Text style={[styles.filterChipText, selectedTagFilter === tag.id && styles.filterChipTextActive]}>{tag.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {checkedCount > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearChecked}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="trash-outline" size={14} color={colors.onAccent} />
              <Text style={styles.clearBtnText}>{checkedCount} Erledigt loeschen</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {filteredItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={56} color={colors.textMuted} style={{ marginBottom: 20 }} />
          <Text style={styles.emptyTitle}>{isAllListsView ? 'Alle Listen leer' : selectedTagFilter ? 'Keine Items mit diesem Tag' : 'Einkaufsliste leer'}</Text>
          <Text style={styles.emptySub}>{isAllListsView ? 'Wähle eine Liste, um Items hinzuzufügen.' : 'Fuege unten neue Items hinzu!'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: keyboardShown ? 10 : insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!isAllListsView && (
        <View style={[styles.inputBar, { paddingBottom: 12, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="Neues Item..."
            placeholderTextColor={colors.textMuted}
            value={newItemName}
            onChangeText={setNewItemName}
            onSubmitEditing={handleAddItem}
            returnKeyType="send"
          />
          <TouchableOpacity style={[styles.sendBtn, !newItemName.trim() && styles.sendBtnDisabled]} onPress={handleAddItem} disabled={!newItemName.trim()}>
            <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
          </TouchableOpacity>
        </View>
      )}

      {/* Context Menu */}
      {/* ── Modal: Listen-Auswahl ── */}
      <Modal visible={isListPickerVisible} animationType="fade" transparent onRequestClose={() => setIsListPickerVisible(false)}>
        <TouchableOpacity style={styles.ctxOverlay} activeOpacity={1} onPress={() => setIsListPickerVisible(false)}>
          <View style={[styles.listPickerMenu, { backgroundColor: colors.surface }]}>
            <Text style={[styles.listPickerTitle, { color: colors.text }]}>Einkaufsliste wählen</Text>

            {/* Alle anzeigen */}
            <TouchableOpacity
              style={[styles.listPickerItem, isAllListsView && styles.listPickerItemActive]}
              onPress={() => { setIsAllListsView(true); setIsListPickerVisible(false); }}
            >
              <Ionicons name="layers-outline" size={18} color={isAllListsView ? PRIMARY : colors.textSub} style={{ marginRight: 10 }} />
              <Text style={[styles.listPickerItemText, { color: isAllListsView ? PRIMARY : colors.text }, isAllListsView && { fontWeight: '700' }]}>
                Alle anzeigen
              </Text>
              {allListsItems.filter(i => !i.checked).length > 0 && (
                <View style={[styles.listCountBadge, { marginLeft: 'auto', backgroundColor: isAllListsView ? PRIMARY : `${PRIMARY}22` }]}>
                  <Text style={[styles.listCountBadgeText, { color: isAllListsView ? colors.onAccent : PRIMARY }]}>
                    {allListsItems.filter(i => !i.checked).length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.ctxDivider} />

            {shoppingLists.map(list => {
              const openCount = list.items.filter(i => !i.checked).length;
              const isActive = !isAllListsView && list.id === activeListId;
              return (
                <TouchableOpacity
                  key={list.id}
                  style={[styles.listPickerItem, isActive && styles.listPickerItemActive]}
                  onPress={() => switchToList(list.id)}
                >
                  <Ionicons
                    name={isActive ? 'cart' : 'cart-outline'}
                    size={18}
                    color={isActive ? PRIMARY : colors.textSub}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.listPickerItemText, { color: isActive ? PRIMARY : colors.text }, isActive && { fontWeight: '700' }]}>
                    {list.name}
                  </Text>
                  {openCount > 0 ? (
                    <View style={[styles.listCountBadge, { marginLeft: 'auto', backgroundColor: isActive ? PRIMARY : `${PRIMARY}22` }]}>
                      <Text style={[styles.listCountBadgeText, { color: isActive ? colors.onAccent : PRIMARY }]}>{openCount}</Text>
                    </View>
                  ) : (
                    isActive && <Ionicons name="checkmark" size={16} color={PRIMARY} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.ctxDivider} />
            <TouchableOpacity
              style={styles.listPickerItem}
              onPress={() => { setIsListPickerVisible(false); setIsManageListsVisible(true); }}
            >
              <Ionicons name="settings-outline" size={18} color={colors.textSub} style={{ marginRight: 10 }} />
              <Text style={[styles.listPickerItemText, { color: colors.text }]}>Listen verwalten</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: Listen verwalten ── */}
      <Modal visible={isManageListsVisible} animationType="slide" transparent onRequestClose={() => setIsManageListsVisible(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsManageListsVisible(false)} />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Listen verwalten</Text>

            {/* Neue Liste anlegen */}
            <View style={styles.newListRow}>
              <TextInput
                style={[styles.sheetInput, { flex: 1, marginBottom: 0, marginRight: 8, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="Neue Liste (z. B. Kaufland)..."
                placeholderTextColor={colors.textMuted}
                value={newListName}
                onChangeText={setNewListName}
                returnKeyType="done"
                onSubmitEditing={handleCreateList}
              />
              <TouchableOpacity
                style={[styles.btnPrimary, { width: 44, flex: undefined, paddingVertical: 0, height: 44, borderRadius: 12 }, !newListName.trim() && { opacity: 0.4 }]}
                onPress={handleCreateList}
                disabled={!newListName.trim()}
              >
                <Ionicons name="add" size={22} color={colors.onAccent} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 16, maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {shoppingLists.map(list => (
                <View key={list.id}>
                  {renamingListId === list.id ? (
                    <View style={styles.renameRow}>
                      <TextInput
                        style={[styles.sheetInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                        value={renameListText}
                        onChangeText={setRenameListText}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleRenameList}
                      />
                      <TouchableOpacity style={styles.renameConfirmBtn} onPress={handleRenameList}>
                        <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.renameCancelBtn} onPress={() => { setRenamingListId(null); setRenameListText(''); }}>
                        <Ionicons name="close" size={18} color={colors.textSub} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={[styles.managedListRow, list.id === activeListId && styles.managedListRowActive]}>
                      <Ionicons name="cart-outline" size={18} color={list.id === activeListId ? PRIMARY : colors.textSub} style={{ marginRight: 10 }} />
                      <Text style={[styles.managedListName, list.id === activeListId && { color: PRIMARY, fontWeight: '700' }]}>
                        {list.name}
                      </Text>
                      <Text style={styles.managedListCount}>{list.items.length}</Text>
                      <TouchableOpacity
                        onPress={() => { setRenamingListId(list.id); setRenameListText(list.name); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 10 }}
                      >
                        <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                      </TouchableOpacity>
                      {shoppingLists.length > 1 && (
                        <TouchableOpacity
                          onPress={() => handleDeleteList(list.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ marginLeft: 10 }}
                        >
                          <Ionicons name="trash-outline" size={17} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={() => setIsManageListsVisible(false)}>
              <Text style={styles.btnPrimaryText}>Fertig</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Item-Kontextmenü */}
      <Modal visible={!!menuItem && !isMoveModalVisible} animationType="fade" transparent onRequestClose={() => setMenuItem(null)}>
        <TouchableOpacity style={styles.ctxOverlay} activeOpacity={1} onPress={() => setMenuItem(null)}>
          <View style={[styles.ctxMenu, { backgroundColor: colors.surface }]}>
            <Text style={[styles.ctxMenuTitle, { color: colors.text }]} numberOfLines={1}>{menuItem?.name}</Text>
            <View style={styles.ctxDivider} />
            {shoppingLists.length > 1 && (
              <>
                <TouchableOpacity style={styles.ctxItem} onPress={() => setIsMoveModalVisible(true)}>
                  <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.textSub} />
                  <Text style={styles.ctxItemText}>In andere Liste verschieben</Text>
                </TouchableOpacity>
                <View style={styles.ctxDivider} />
              </>
            )}
            <TouchableOpacity style={styles.ctxItem} onPress={() => {
              const item = menuItem!;
              setMenuItem(null);
              handleDeleteItem(item.id, item.name);
            }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.ctxItemText, { color: colors.danger }]}>Löschen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* In andere Liste verschieben */}
      <Modal visible={isMoveModalVisible} animationType="slide" transparent onRequestClose={() => setIsMoveModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsMoveModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>In Liste verschieben</Text>
            {menuItem && <Text style={styles.sheetSubtitle} numberOfLines={1}>{menuItem.name}</Text>}
            {shoppingLists.filter(l => l.id !== activeListId).map(list => (
              <TouchableOpacity
                key={list.id}
                style={styles.moveListItem}
                onPress={() => handleMoveItem(list.id)}
                activeOpacity={0.75}
              >
                <Ionicons name="list-outline" size={20} color={PRIMARY} style={{ marginRight: 12 }} />
                <Text style={styles.moveListItemText}>{list.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <Modal visible={isContextMenuVisible} animationType="fade" transparent onRequestClose={() => setIsContextMenuVisible(false)}>
        <TouchableOpacity style={styles.ctxOverlay} activeOpacity={1} onPress={() => setIsContextMenuVisible(false)}>
          <View style={[styles.ctxMenu, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.ctxItem} onPress={() => { setIsContextMenuVisible(false); setIsSortModalVisible(true); }}>
              <Ionicons name="swap-vertical" size={20} color={colors.textSub} />
              <Text style={styles.ctxItemText}>Sortierung</Text>
            </TouchableOpacity>
            <View style={styles.ctxDivider} />
            <TouchableOpacity style={styles.ctxItem} onPress={() => { setIsContextMenuVisible(false); setIsTagModalVisible(true); }}>
              <Ionicons name="pricetag-outline" size={20} color={colors.textSub} />
              <Text style={styles.ctxItemText}>Tag erstellen</Text>
            </TouchableOpacity>
            <View style={styles.ctxDivider} />
            <TouchableOpacity style={styles.ctxItem} onPress={() => { setIsContextMenuVisible(false); setIsSettingsVisible(true); }}>
              <Ionicons name="settings-outline" size={20} color={colors.textSub} />
              <Text style={styles.ctxItemText}>Einstellungen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Sheet */}
      <Modal visible={isSettingsVisible} animationType="slide" transparent onRequestClose={() => setIsSettingsVisible(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsSettingsVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Einstellungen</Text>
            <Text style={styles.sheetLabel}>Abgehakte Items loeschen nach (Stunden):</Text>
            <TextInput style={[styles.sheetInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder="24" placeholderTextColor={colors.textMuted} value={autoDeleteHours} onChangeText={setAutoDeleteHours} keyboardType="numeric" />
            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setIsSettingsVisible(false); loadItems(); }}>
                <Text style={styles.btnSecondaryText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={async () => {
                const hours = parseInt(autoDeleteHours) || 24;
                await AsyncStorage.setItem('@app_settings', JSON.stringify({ autoDeleteCheckedShoppingAfterHours: hours }));
                setIsSettingsVisible(false);
              }}>
                <Text style={styles.btnPrimaryText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tag Creation Sheet */}
      <Modal visible={isTagModalVisible} animationType="slide" transparent onRequestClose={() => setIsTagModalVisible(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsTagModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Neues Tag</Text>
            <TextInput style={[styles.sheetInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder="Tag-Name" placeholderTextColor={colors.textMuted} value={newTagName} onChangeText={setNewTagName} autoFocus />
            <Text style={styles.sheetLabel}>Farbe waehlen:</Text>
            <View style={styles.colorPicker}>
              {TAG_COLORS.map(color => (
                <TouchableOpacity key={color} style={[styles.colorDot, { backgroundColor: color }, newTagColor === color && styles.colorDotSelected]} onPress={() => setNewTagColor(color)} />
              ))}
            </View>
            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setIsTagModalVisible(false); setNewTagName(''); setNewTagColor(TAG_COLORS[0]); }}>
                <Text style={styles.btnSecondaryText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, !newTagName.trim() && styles.btnDisabled]} onPress={handleCreateTag} disabled={!newTagName.trim()}>
                <Text style={styles.btnPrimaryText}>Erstellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Item Tag Assignment Sheet */}
      <Modal visible={isItemTagModalVisible} animationType="slide" transparent onRequestClose={() => setIsItemTagModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsItemTagModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Tags verwalten</Text>
            {selectedItemForTags && <Text style={styles.sheetSubtitle}>{selectedItemForTags.name}</Text>}
            {tags.length === 0 ? (
              <Text style={styles.noTagsText}>Noch keine Tags vorhanden</Text>
            ) : (
              <ScrollView style={styles.checkList} showsVerticalScrollIndicator={false}>
                {sortTags(tags).map(tag => {
                  // Frische Tags aus items lesen, nicht aus stale selectedItemForTags
                  const freshTags = items.find(i => i.id === selectedItemForTags?.id)?.tags || selectedItemForTags?.tags || [];
                  const isSelected = freshTags.includes(tag.id);
                  return (
                    <TouchableOpacity key={tag.id} style={styles.checkItem} onPress={() => selectedItemForTags && handleToggleItemTag(selectedItemForTags, tag.id)}>
                      <Checkbox checked={isSelected} shape="square" size={22} />
                      <Chip label={tag.name} color={tag.color} selected size="sm" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={() => setIsItemTagModalVisible(false)}>
              <Text style={styles.btnPrimaryText}>Fertig</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sort Sheet */}
      <Modal visible={isSortModalVisible} animationType="slide" transparent onRequestClose={() => setIsSortModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsSortModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '80%' }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sortierung</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(['default', 'a-z', 'z-a', 'length-asc', 'length-desc'] as SortType[]).map(type => {
                const labels: Record<string, string> = { 'default': 'Standard (Erstellungsdatum)', 'a-z': 'A-Z', 'z-a': 'Z-A', 'length-asc': 'Laenge aufsteigend', 'length-desc': 'Laenge absteigend' };
                const active = sortSettings.activeSort === type;
                return (
                  <TouchableOpacity key={type} style={[styles.sortItem, active && styles.sortItemActive]} onPress={() => handleSelectSort(type)}>
                    <Text style={[styles.sortItemText, active && styles.sortItemTextActive]}>{labels[type]}</Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
              {sortSettings.customSorts.length > 0 && (
                <>
                  <View style={styles.sortDivider} />
                  <Text style={styles.sortSection}>Benutzerdefiniert</Text>
                  {sortSettings.customSorts.map(cs => {
                    const active = sortSettings.activeSort === 'custom' && sortSettings.activeSortId === cs.id;
                    return (
                      <View key={cs.id} style={styles.sortCustomRow}>
                        <TouchableOpacity style={[styles.sortItem, styles.sortItemFlex, active && styles.sortItemActive]} onPress={() => handleSelectSort('custom', cs.id)}>
                          <Text style={[styles.sortItemText, active && styles.sortItemTextActive]}>{cs.name}</Text>
                          {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteCustomSort(cs.id)} style={styles.sortDelBtn}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}
              <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={() => { setIsSortModalVisible(false); setCustomTagOrder([]); setIsCustomSortModalVisible(true); }}>
                <Text style={styles.btnPrimaryText}>+ Neue Sortierung erstellen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSecondary, { marginTop: 8 }]} onPress={() => setIsSortModalVisible(false)}>
                <Text style={styles.btnSecondaryText}>Schliessen</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom Sort Creation Sheet */}
      <Modal visible={isCustomSortModalVisible} animationType="slide" transparent onRequestClose={() => setIsCustomSortModalVisible(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsCustomSortModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '85%' }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Neue Sortierung</Text>
            <TextInput style={styles.sheetInput} placeholder="Name der Sortierung" placeholderTextColor={colors.textMuted} value={newSortName} onChangeText={setNewSortName} autoFocus />
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <View style={styles.selectAllRow}>
                <Text style={styles.sheetLabel}>Tags auswählen</Text>
                <TouchableOpacity
                  onPress={toggleAllTagsInOrder}
                  disabled={tags.length === 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selectAllText}>
                    {allTagsInOrder ? 'Alle abwählen' : 'Alle auswählen'}
                  </Text>
                </TouchableOpacity>
              </View>
              {tags.map(tag => {
                const isSelected = customTagOrder.includes(tag.id);
                return (
                  <TouchableOpacity key={tag.id} style={styles.checkItem} onPress={() => toggleTagInOrder(tag.id)}>
                    <Checkbox checked={isSelected} shape="square" size={22} />
                    <Chip label={tag.name} color={tag.color} selected size="sm" />
                  </TouchableOpacity>
                );
              })}
              {customTagOrder.length > 0 && (
                <>
                  <Text style={[styles.sheetLabel, { marginTop: 12 }]}>Reihenfolge (oben = zuerst):</Text>
                  {customTagOrder.map((tagId, index) => {
                    const tag = tags.find(t => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <View key={tagId} style={styles.orderRow}>
                        <View style={{ flex: 1 }}>
                          <Chip label={tag.name} color={tag.color} selected size="sm" />
                        </View>
                        <View style={styles.orderBtns}>
                          <TouchableOpacity style={[styles.orderBtn, index === 0 && styles.orderBtnDisabled]} onPress={() => moveTagInOrder(tagId, 'up')} disabled={index === 0}>
                            <Ionicons name="chevron-up" size={16} color={colors.textSub} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.orderBtn, index === customTagOrder.length - 1 && styles.orderBtnDisabled]} onPress={() => moveTagInOrder(tagId, 'down')} disabled={index === customTagOrder.length - 1}>
                            <Ionicons name="chevron-down" size={16} color={colors.textSub} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.orderBtn, { backgroundColor: colors.dangerSurface }]} onPress={() => setCustomTagOrder(customTagOrder.filter(id => id !== tagId))}>
                            <Ionicons name="close" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
            <View style={[styles.sheetRow, { marginTop: 12 }]}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setIsCustomSortModalVisible(false); setNewSortName(''); setCustomTagOrder([]); }}>
                <Text style={styles.btnSecondaryText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, (!newSortName.trim() || customTagOrder.length === 0) && styles.btnDisabled]} onPress={handleCreateCustomSort} disabled={!newSortName.trim() || customTagOrder.length === 0}>
                <Text style={styles.btnPrimaryText}>Erstellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm Modal */}
      <Modal visible={confirmModal !== null} animationType="slide" transparent onRequestClose={() => setConfirmModal(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setConfirmModal(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{confirmModal?.title}</Text>
            <Text style={[styles.confirmMessage, { color: colors.textSub }]}>{confirmModal?.message}</Text>
            <View style={[styles.sheetRow, { marginTop: 8 }]}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setConfirmModal(null)}>
                <Text style={styles.btnSecondaryText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.danger }]}
                onPress={() => { const fn = confirmModal?.onConfirm; setConfirmModal(null); fn?.(); }}
              >
                <Text style={styles.btnPrimaryText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },

    // Header ist jetzt neutrale Flaeche mit Hairline statt gesaettigtem
    // Cyan-Block mit 24px-Rundung.
    header: {
      backgroundColor: t.colors.surface,
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.sm },
    headerTitle: { ...t.type.display, color: t.colors.text },
    headerSub: { ...t.type.caption, color: t.colors.textMuted, marginTop: 2 },
    headerBtns: { flexDirection: 'row', gap: t.spacing.xs },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: t.radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sortBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.surfaceAlt,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs + 1,
      borderRadius: t.radius.pill,
      marginBottom: t.spacing.sm,
    },
    sortBadgeText: { ...t.type.caption, color: t.colors.textSub },
    filterRow: { maxHeight: 36, marginBottom: t.spacing.sm },
    filterRowContent: { flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: 2 },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs + 1,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: 'transparent',
      gap: t.spacing.xs,
    },
    filterChipActive: {
      backgroundColor: t.colors.accentSurface,
      borderColor: t.colors.accentBorder,
    },
    filterChipText: { ...t.type.caption, color: t.colors.textSub },
    filterChipTextActive: { color: t.colors.accent },
    filterDot: { width: 6, height: 6, borderRadius: 3 },
    clearBtn: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.dangerSurface,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.pill,
      marginTop: t.spacing.xs,
    },
    clearBtnText: { ...t.type.caption, color: t.colors.danger },

    list: { padding: t.spacing.lg },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      ...t.elevation.e1,
    },
    cardChecked: { opacity: 0.6 },
    cardBody: { flex: 1, marginLeft: t.spacing.md },
    cardText: { ...t.type.body, color: t.colors.text },
    cardTextDone: { textDecorationLine: 'line-through', color: t.colors.textMuted },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: t.spacing.sm, gap: t.spacing.xs },
    delBtn: { paddingLeft: t.spacing.sm },

    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.spacing.xxl },
    emptyTitle: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.sm },
    emptySub: { ...t.type.body, color: t.colors.textSub, textAlign: 'center' },

    inputBar: {
      backgroundColor: t.colors.surface,
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    input: {
      ...t.type.body,
      flex: 1,
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: 13,
      color: t.colors.text,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnDisabled: { opacity: 0.45 },

    sheetOverlay: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.colors.sheetBg,
      borderTopLeftRadius: t.radius.sheet,
      borderTopRightRadius: t.radius.sheet,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.md,
      ...t.elevation.e3,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.handle,
      alignSelf: 'center',
      marginBottom: t.spacing.lg,
    },
    sheetTitle: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.sm },
    sheetSubtitle: { ...t.type.body, color: t.colors.textSub, marginBottom: t.spacing.lg },
    moveListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    moveListItemText: { ...t.type.bodyStrong, color: t.colors.text },
    sheetLabel: { ...t.type.label, color: t.colors.textSub, marginBottom: t.spacing.sm },
    selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectAllText: { ...t.type.label, color: t.colors.accent, marginBottom: t.spacing.sm },
    sheetInput: {
      ...t.type.body,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: 13,
      color: t.colors.text,
      backgroundColor: t.colors.inputBg,
      marginBottom: t.spacing.md,
    },
    sheetRow: { flexDirection: 'row', gap: t.spacing.md },
    checkList: { maxHeight: 260, marginBottom: t.spacing.sm },
    checkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    noTagsText: {
      ...t.type.body,
      color: t.colors.textMuted,
      textAlign: 'center',
      paddingVertical: t.spacing.xl,
    },
    colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md, marginBottom: t.spacing.lg },
    colorDot: { width: 36, height: 36, borderRadius: t.radius.pill },
    colorDotSelected: { borderWidth: 3, borderColor: t.colors.text },

    sortItem: {
      padding: t.spacing.md,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surfaceAlt,
      marginBottom: t.spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sortItemFlex: { flex: 1, marginRight: t.spacing.sm, marginBottom: 0 },
    sortItemActive: { backgroundColor: t.colors.accentSurface },
    sortItemText: { ...t.type.body, color: t.colors.text },
    sortItemTextActive: { color: t.colors.accent },
    sortDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginVertical: t.spacing.md,
    },
    sortSection: { ...t.type.label, color: t.colors.textMuted, marginBottom: t.spacing.sm },

    ctxOverlay: {
      flex: 1,
      backgroundColor: t.colors.overlay,
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
    },
    ctxMenu: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      marginTop: 100,
      marginRight: t.spacing.lg,
      minWidth: 200,
      overflow: 'hidden',
      ...t.elevation.e2,
    },
    ctxMenuTitle: {
      ...t.type.label,
      color: t.colors.textMuted,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
    },
    ctxItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.md,
    },
    ctxItemText: { ...t.type.body, color: t.colors.text },
    ctxDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginHorizontal: t.spacing.md,
    },

    sortCustomRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.sm },
    sortDelBtn: { padding: t.spacing.md },
    orderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.sm, gap: t.spacing.sm },
    orderBtns: { flexDirection: 'row', gap: t.spacing.xs },
    orderBtn: {
      width: 30,
      height: 30,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    orderBtnDisabled: { opacity: 0.3 },

    btnSecondary: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: 'center',
    },
    btnSecondaryText: { ...t.type.bodyStrong, color: t.colors.text },
    btnPrimary: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.accent,
      alignItems: 'center',
    },
    btnPrimaryText: { ...t.type.bodyStrong, color: t.colors.onAccent },
    btnDisabled: { opacity: 0.45 },
    confirmMessage: { ...t.type.body, color: t.colors.textSub, marginBottom: t.spacing.xl },

    listSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surfaceAlt,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.pill,
      maxWidth: 140,
      marginRight: t.spacing.sm,
    },
    listSelectorText: { ...t.type.label, color: t.colors.textSub, flexShrink: 1 },

    listPickerMenu: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      marginTop: 100,
      marginRight: t.spacing.lg,
      minWidth: 220,
      overflow: 'hidden',
      ...t.elevation.e2,
    },
    listPickerTitle: {
      ...t.type.label,
      color: t.colors.textMuted,
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.sm,
    },
    listPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
    },
    listPickerItemActive: { backgroundColor: t.colors.accentSurface },
    listPickerItemText: { ...t.type.body, color: t.colors.text },
    listCountBadge: {
      paddingHorizontal: t.spacing.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
      minWidth: 26,
      alignItems: 'center',
    },
    listCountBadgeText: { ...t.type.caption },
    listNameBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.accentSurface,
      paddingHorizontal: t.spacing.sm,
      paddingVertical: 2,
      borderRadius: t.radius.xs,
      marginBottom: 3,
    },
    listNameBadgeText: { ...t.type.caption, color: t.colors.accent },

    sheetTall: { minHeight: 300 },
    newListRow: { flexDirection: 'row', alignItems: 'center' },
    managedListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    managedListRowActive: { backgroundColor: t.colors.accentSurface, borderRadius: t.radius.sm },
    managedListName: { ...t.type.body, flex: 1, color: t.colors.text },
    managedListCount: { ...t.type.caption, color: t.colors.textMuted, marginLeft: t.spacing.sm },
    renameRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.spacing.sm },
    renameConfirmBtn: {
      width: 38,
      height: 38,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: t.spacing.sm,
    },
    renameCancelBtn: {
      width: 38,
      height: 38,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
