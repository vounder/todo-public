import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, SectionList, ScrollView, KeyboardAvoidingView, Platform, TextInput, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShoppingItem, ShoppingListDef, AppSettings, Tag, SortSettings, SortType, IngredientTagMapping } from '../types';
import { ApiService } from '../services/ApiService';
import { autoTagsFor, migrateMappings } from '../services/ingredientTags';
import { moveShoppingItem, updateShoppingItem, restoreShoppingItems } from '../services/shopping';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { TAG_COLORS } from '../theme/tokens';
import { Text, Input, Button, IconButton, Checkbox, Chip, Sheet, SheetActions, ListRow, EmptyState, SyncNotice, useSnackbar, useConfirm } from '../components';

const DEFAULT_SORT: SortSettings = { activeSort: 'default', customSorts: [] };
const SORTS: { id: SortType; name: string }[] = [
  { id: 'default', name: 'Reihenfolge der Eingabe' }, { id: 'a-z', name: 'Name: A bis Z' },
  { id: 'z-a', name: 'Name: Z bis A' }, { id: 'length-asc', name: 'Kurze Namen zuerst' }, { id: 'length-desc', name: 'Lange Namen zuerst' },
];
const uid = () => Date.now() + '-' + Math.random().toString(36).slice(2);
type Panel = 'lists' | 'manage' | 'options' | 'listForm' | 'item' | 'edit' | 'move' | 'tags' | 'newTag' | 'sort' | 'customSort' | 'settings' | null;

export default function ShoppingListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [lists, setLists] = useState<ShoppingListDef[]>([]);
  const current = useRef(lists);
  const editRevision = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [activeId, setActiveId] = useState('');
  const [all, setAll] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const mappings = useRef<IngredientTagMapping[]>([]);
  const [sort, setSort] = useState<SortSettings>(DEFAULT_SORT);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<TextInput>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<ShoppingItem | null>(null);
  const [draft, setDraft] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [chosenTags, setChosenTags] = useState<string[]>([]);
  const [tagColor, setTagColor] = useState<string>(TAG_COLORS[0]);
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [autoDelete, setAutoDelete] = useState(false);
  const [hours, setHours] = useState('24');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const snackbar = useSnackbar(88);
  const { confirm, element: confirmation } = useConfirm();

  function apply(next: ShoppingListDef[]) {
    current.current = next; setLists(next);
    setActiveId(previous => next.some(list => list.id === previous) ? previous : next[0]?.id || '');
  }
  function commit(next: ShoppingListDef[]) {
    editRevision.current++; apply(next);
    const write = writes.current.catch(() => {}).then(async () => {
      await AsyncStorage.setItem('@shopping_lists', JSON.stringify(next));
      await ApiService.syncShoppingListsToServer(next);
    });
    writes.current = write;
    return write;
  }
  function safely(action: Promise<unknown>) {
    void action.catch(() => snackbar.show({ text: 'Die Änderung konnte nicht gespeichert werden.' }));
  }
  function open(panelName: Panel) { setError(''); setPanel(panelName); }
  function chooseList(id: string, every = false) {
    setActiveId(id); setAll(every); setFilter(null); setPanel(null);
    safely(AsyncStorage.setItem('@active_shopping_list', every ? 'all' : id));
  }

  useFocusEffect(useCallback(() => {
    let alive = true;
    const revision = editRevision.current;
    void (async () => {
      const stored = await AsyncStorage.multiGet(['@shopping_lists', '@shopping_list', '@tags', '@sort_settings', '@ingredient_tag_mappings', '@app_settings', '@active_shopping_list']);
      const values = Object.fromEntries(stored);
      const parsed = (key: string, fallback: any) => values[key] ? JSON.parse(values[key]!) : fallback;
      let local: ShoppingListDef[] = parsed('@shopping_lists', []);
      if (!local.length) {
        local = [{ id: 'default', name: 'Einkaufsliste', createdAt: Date.now(), items: parsed('@shopping_list', []) }];
        await AsyncStorage.setItem('@shopping_lists', JSON.stringify(local));
      }
      const settings: AppSettings = parsed('@app_settings', {});
      const enabled = settings.autoDeleteCheckedShoppingEnabled ?? Boolean(settings.autoDeleteCheckedShoppingAfterHours);
      const limit = settings.autoDeleteCheckedShoppingAfterHours || 24;
      if (!alive) return;
      apply(local); setTags(parsed('@tags', []));
      setSort({ ...DEFAULT_SORT, ...parsed('@sort_settings', {}) });
      mappings.current = migrateMappings(parsed('@ingredient_tag_mappings', []));
      setAutoDelete(enabled); setHours(String(limit));
      const target = values['@active_shopping_list'];
      if (target === 'all') setAll(true);
      else if (target && local.some(list => list.id === target)) { setActiveId(target); setAll(false); }
      const cleanup = (data: ShoppingListDef[]) => enabled ? data.map(list => ({ ...list, items: list.items.filter(item =>
        !item.checked || !item.checkedAt || Date.now() - item.checkedAt < limit * 3600000) })) : data;
      const cleaned = cleanup(local);
      if (JSON.stringify(cleaned) !== JSON.stringify(local)) await commit(cleaned);
      await Promise.allSettled([
        (async () => {
          const remote = await ApiService.fetchShoppingListsFromServer();
          if (!alive || editRevision.current !== revision || !remote) return;
          // A fresh server can legitimately have no lists. Keep the initial local list.
          const next = remote.length ? cleanup(remote) : local;
          await AsyncStorage.setItem('@shopping_lists', JSON.stringify(next));
          if (alive && editRevision.current === revision) apply(next);
          if (JSON.stringify(next) !== JSON.stringify(remote)) await ApiService.syncShoppingListsToServer(next);
        })(),
        (async () => { const data = await ApiService.fetchTagsFromServer(); if (alive) { setTags(data); await AsyncStorage.setItem('@tags', JSON.stringify(data)); } })(),
        (async () => { const data = await ApiService.fetchSortSettingsFromServer(); if (alive && data) { setSort({ ...DEFAULT_SORT, ...data }); await AsyncStorage.setItem('@sort_settings', JSON.stringify(data)); } })(),
        (async () => { const data = await ApiService.fetchMappingsFromServer(); if (alive && data) { mappings.current = migrateMappings(data); await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(mappings.current)); } })(),
      ]);
    })().catch(() => { if (alive) snackbar.show({ text: 'Gespeicherte Einkaufslisten konnten nicht geladen werden.' }); });
    return () => { alive = false; };
  }, []));
  useEffect(() => {
    const unsubscribe = [
      ApiService.subscribe('shoppingLists', apply),
      ApiService.subscribe('tags', setTags),
      ApiService.subscribe('sortSettings', data => setSort({ ...DEFAULT_SORT, ...data })),
      ApiService.subscribe('mappings', data => { mappings.current = migrateMappings(data); }),
    ];
    return () => unsubscribe.forEach(fn => fn());
  }, []);

  async function add() {
    if (!name.trim() || adding || !activeId) return;
    setAdding(true);
    try {
      const item: ShoppingItem = { id: uid(), name: name.trim(), checked: false, checkedAt: null, createdAt: Date.now(), tags: autoTagsFor(name, mappings.current) };
      await commit(current.current.map(list => list.id === activeId ? { ...list, items: [...list.items, item] } : list));
      setName(''); input.current?.focus();
    } catch { snackbar.show({ text: 'Artikel konnte nicht gespeichert werden.' }); }
    finally { setAdding(false); }
  }
  function toggle(item: ShoppingItem) {
    safely(commit(updateShoppingItem(current.current, item.id, value => ({ ...value, checked: !value.checked, checkedAt: !value.checked ? Date.now() : null }))));
  }
  async function remove(ids: string[]) {
    const removed = current.current.flatMap(list => list.items.map((item, index) => ({ listId: list.id, item, index })).filter(entry => ids.includes(entry.item.id)));
    try {
      await commit(current.current.map(list => ({ ...list, items: list.items.filter(item => !ids.includes(item.id)) })));
      setPanel(null);
      snackbar.show({ text: removed.length === 1 ? 'Artikel entfernt' : removed.length + ' Artikel entfernt', action: 'Rückgängig',
        onAction: () => commit(restoreShoppingItems(current.current, removed)) });
    } catch { snackbar.show({ text: 'Artikel konnten nicht entfernt werden.' }); }
  }
  async function move(targetId: string) {
    if (!selected) return;
    const source = current.current.find(list => list.items.some(item => item.id === selected.id));
    if (!source || source.id === targetId) return;
    try {
      const id = selected.id;
      await commit(moveShoppingItem(current.current, id, targetId));
      setPanel(null);
      snackbar.show({ text: 'Artikel verschoben', action: 'Rückgängig', onAction: () => commit(moveShoppingItem(current.current, id, source.id)) });
    } catch { setError('Verschieben fehlgeschlagen. Bitte erneut versuchen.'); }
  }
  async function saveForm() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      if (panel === 'edit' && selected) {
        await commit(updateShoppingItem(current.current, selected.id, item => ({ ...item, name: draft.trim() })));
      } else if (panel === 'listForm') {
        await commit(editingListId
          ? current.current.map(list => list.id === editingListId ? { ...list, name: draft.trim() } : list)
          : [...current.current, { id: uid(), name: draft.trim(), createdAt: Date.now(), items: [] }]);
        if (!editingListId) chooseList(current.current[current.current.length - 1].id);
      } else if (panel === 'newTag') {
        const id = uid();
        const next = [...tags, { id, name: draft.trim(), color: tagColor }];
        await AsyncStorage.setItem('@tags', JSON.stringify(next)); setTags(next); await ApiService.syncTagsToServer(next);
        setChosenTags(previous => [...previous, id]); setPanel('tags'); return;
      } else if (panel === 'customSort') {
        const id = uid();
        await saveSort({ ...sort, activeSort: 'custom', activeSortId: id, customSorts: [...sort.customSorts, { id, name: draft.trim(), tagOrder: customOrder }] });
      }
      setPanel(null);
    } catch { setError('Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten.'); }
    finally { setSaving(false); }
  }
  async function saveSort(next: SortSettings) {
    await AsyncStorage.setItem('@sort_settings', JSON.stringify(next)); setSort(next);
    await ApiService.syncSortSettingsToServer(next);
  }
  async function assignTags() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await commit(updateShoppingItem(current.current, selected.id, item => ({ ...item, tags: chosenTags })));
      const normalized = selected.name.trim().toLocaleLowerCase('de-DE');
      const next = mappings.current.filter(mapping => mapping.ingredientName !== normalized);
      if (chosenTags.length) next.push({ ingredientName: normalized, tagIds: chosenTags });
      await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(next)); mappings.current = next;
      await ApiService.syncMappingsToServer(next); setPanel(null);
    } catch { setError('Kategorien konnten nicht gespeichert werden.'); }
    finally { setSaving(false); }
  }
  async function deleteTag(id: string) {
    try {
      const nextTags = tags.filter(tag => tag.id !== id);
      await AsyncStorage.setItem('@tags', JSON.stringify(nextTags)); setTags(nextTags); await ApiService.syncTagsToServer(nextTags);
      await ApiService.deleteTagFromServer(id);
      await commit(current.current.map(list => ({ ...list, items: list.items.map(item => ({ ...item, tags: item.tags?.filter(tag => tag !== id) })) })));
      const nextMappings = mappings.current.map(mapping => ({ ...mapping, tagIds: mapping.tagIds.filter(tag => tag !== id) })).filter(mapping => mapping.tagIds.length);
      await AsyncStorage.setItem('@ingredient_tag_mappings', JSON.stringify(nextMappings)); mappings.current = nextMappings;
      await ApiService.syncMappingsToServer(nextMappings);
      await saveSort({ ...sort, customSorts: sort.customSorts.map(order => ({ ...order, tagOrder: order.tagOrder.filter(tag => tag !== id) })) });
      const raw = await AsyncStorage.getItem('@recipes');
      if (raw) {
        const recipes = JSON.parse(raw).map((recipe: any) => ({ ...recipe, ingredients: recipe.ingredients.map((ingredient: any) => ({ ...ingredient, tags: ingredient.tags?.filter((tag: string) => tag !== id) })) }));
        await AsyncStorage.setItem('@recipes', JSON.stringify(recipes)); await ApiService.syncRecipesToServer(recipes);
      }
      if (filter === id) setFilter(null);
      setChosenTags(previous => previous.filter(tag => tag !== id));
    } catch { snackbar.show({ text: 'Kategorie konnte nicht vollständig entfernt werden. Bitte erneut versuchen.' }); }
  }
  async function saveSettings() {
    const value = Number(hours);
    if (autoDelete && (!Number.isInteger(value) || value < 1)) { setError('Bitte mindestens eine ganze Stunde eingeben.'); return; }
    setSaving(true);
    try {
      const raw = await AsyncStorage.getItem('@app_settings');
      await AsyncStorage.setItem('@app_settings', JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), autoDeleteCheckedShoppingEnabled: autoDelete, autoDeleteCheckedShoppingAfterHours: value || 24 }));
      setPanel(null); snackbar.show({ text: 'Einstellungen gespeichert' });
    } catch { setError('Einstellungen konnten nicht gespeichert werden.'); }
    finally { setSaving(false); }
  }

  const active = lists.find(list => list.id === activeId);
  const visibleLists = all ? lists : active ? [active] : [];
  const visibleItems = visibleLists.flatMap(list => list.items).filter(item => !filter || item.tags?.includes(filter));
  const done = visibleItems.filter(item => item.checked);
  const openItems = visibleItems.filter(item => !item.checked);
  const custom = sort.activeSort === 'custom' ? sort.customSorts.find(order => order.id === sort.activeSortId) : undefined;
  const rank = (item: ShoppingItem) => {
    const positions = (item.tags || []).map(tag => custom?.tagOrder.indexOf(tag) ?? -1).filter(index => index >= 0);
    return positions.length ? Math.min(...positions) : 999;
  };
  const sorted = (items: ShoppingItem[]) => [...items].sort((a, b) => {
    if (sort.activeSort === 'a-z') return a.name.localeCompare(b.name, 'de');
    if (sort.activeSort === 'z-a') return b.name.localeCompare(a.name, 'de');
    if (sort.activeSort === 'length-asc') return a.name.length - b.name.length;
    if (sort.activeSort === 'length-desc') return b.name.length - a.name.length;
    if (custom) return rank(a) - rank(b);
    return a.createdAt - b.createdAt;
  });
  const sections: { title: string; data: ShoppingItem[]; done?: boolean; groupTag?: string }[] = [];
  if (all) {
    visibleLists.forEach(list => {
      const data = sorted(openItems.filter(item => list.items.some(entry => entry.id === item.id)));
      if (data.length) sections.push({ title: list.name + ' · ' + data.length, data });
    });
  } else if (custom && !filter) {
    [...custom.tagOrder, 'untagged'].forEach((tagId, index) => {
      const data = sorted(openItems.filter(item => rank(item) === (tagId === 'untagged' ? 999 : index)));
      if (data.length) sections.push({ title: (tags.find(tag => tag.id === tagId)?.name || 'Weitere Artikel') + ' · ' + data.length, data, groupTag: tagId });
    });
  } else if (openItems.length) sections.push({ title: 'Offen · ' + openItems.length, data: sorted(openItems) });
  if (done.length) sections.push({ title: 'Erledigt · ' + done.length, data: showDone ? sorted(done) : [], done: true });
  const source = lists.find(list => list.items.some(item => item.id === selected?.id));
  const sortName = custom?.name || SORTS.find(item => item.id === sort.activeSort)?.name || 'Reihenfolge der Eingabe';

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Pressable style={styles.listSelector} onPress={() => open('lists')} accessibilityRole="button" accessibilityLabel={(all ? 'Alle Listen' : active?.name || 'Einkaufsliste') + ', Liste wechseln'}>
          <Text style={styles.title} numberOfLines={2}>{all ? 'Alle Listen' : active?.name || 'Einkaufsliste'}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSub} />
        </Pressable>
        <IconButton icon="swap-vertical-outline" accessibilityLabel="Sortierung ändern" onPress={() => open('sort')} />
        <IconButton icon="ellipsis-horizontal" accessibilityLabel="Einkaufsoptionen" onPress={() => open('options')} />
      </View>
      <Text style={styles.subtitle}>{openItems.length + ' offen · ' + done.length + ' erledigt'}</Text>
      {tags.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip label="Alle Kategorien" selected={!filter} onPress={() => setFilter(null)} />
        {tags.map(tag => <Chip key={tag.id} label={tag.name} color={tag.color} selected={filter === tag.id} onPress={() => setFilter(filter === tag.id ? null : tag.id)} />)}
      </ScrollView>}
    </View>
    <SyncNotice />
    <SectionList sections={sections} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.list, !visibleItems.length && { flexGrow: 1 }]}
      ListEmptyComponent={<EmptyState icon={filter ? 'filter-outline' : 'cart-outline'} title={filter ? 'Keine passenden Artikel' : 'Deine Liste ist bereit'}
        subtitle={filter ? 'Wähle eine andere Kategorie.' : all ? 'Wähle eine Liste, um Artikel hinzuzufügen.' : 'Trage unten ein, was du einkaufen möchtest.'} />}
      ListHeaderComponent={openItems.length === 0 && done.length > 0 ? <View style={styles.complete}><Ionicons name="checkmark-circle-outline" size={24} color={colors.success} /><Text style={styles.completeText}>Alles eingekauft</Text></View> : null}
      renderSectionHeader={({ section }) => section.done
        ? <Pressable style={styles.section} accessibilityRole="button" accessibilityState={{ expanded: showDone }} onPress={() => setShowDone(!showDone)}>
          <Text style={styles.sectionTitle}>{section.title}</Text><Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        : <View style={styles.section}><Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text></View>}
      renderSectionFooter={({ section }) => section.done && showDone ? <Button standalone variant="ghost" icon="trash-outline" onPress={() => {
        confirm({ title: 'Erledigte Artikel entfernen?', message: done.length + ' erledigte Artikel werden aus der aktuellen Ansicht entfernt.', confirmLabel: 'Entfernen', onConfirm: () => { void remove(done.map(item => item.id)); } });
      }}>Erledigte entfernen</Button> : null}
      renderItem={({ item, section }) => {
        const captions = (item.tags || []).filter(tag => tag !== section.groupTag).map(id => tags.find(tag => tag.id === id)?.name).filter(Boolean);
        return <View style={styles.itemRow}>
          <Pressable style={styles.itemMain} onPress={() => toggle(item)} onLongPress={() => { setSelected(item); open('item'); }}
            accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }} accessibilityLabel={item.name}>
            <Checkbox checked={item.checked} />
            <View style={styles.itemBody}>
              <Text style={[styles.itemText, item.checked && styles.checked]}>{item.name}</Text>
              {captions.length > 0 && !item.checked && <Text style={styles.itemCaption}>{captions.join(' · ')}</Text>}
              {all && item.checked && <Text style={styles.itemCaption}>{lists.find(list => list.items.some(entry => entry.id === item.id))?.name}</Text>}
            </View>
          </Pressable>
          <IconButton icon="ellipsis-horizontal" accessibilityLabel={'Optionen für ' + item.name} onPress={() => { setSelected(item); open('item'); }} />
        </View>;
      }} />
    {!all && <View style={styles.composer}><Input ref={input} value={name} onChangeText={setName} placeholder="Artikel hinzufügen"
      containerStyle={{ flex: 1 }} returnKeyType="done" submitBehavior="submit" blurOnSubmit={false} onSubmitEditing={add} />
      <IconButton icon="add" variant="tonal" accessibilityLabel="Artikel hinzufügen" disabled={!name.trim() || adding} onPress={add} /></View>}
    {all && <Button standalone variant="ghost" icon="list-outline" onPress={() => open('lists')}>Liste zum Hinzufügen wählen</Button>}

    <Sheet visible={panel === 'lists'} onClose={() => setPanel(null)} title="Einkaufsliste wählen">
      <ListRow title="Alle Listen" icon="albums-outline" selected={all} onPress={() => chooseList(activeId, true)} />
      {lists.map(list => <ListRow key={list.id} title={list.name} subtitle={list.items.filter(item => !item.checked).length + ' offen'} icon="cart-outline" selected={!all && activeId === list.id} onPress={() => chooseList(list.id)} />)}
      <ListRow title="Listen verwalten" icon="create-outline" onPress={() => open('manage')} />
    </Sheet>
    <Sheet visible={panel === 'options'} onClose={() => setPanel(null)} title="Einkaufsoptionen">
      <ListRow title="Listen verwalten" icon="list-outline" onPress={() => open('manage')} />
      <ListRow title="Kategorien verwalten" icon="pricetags-outline" onPress={() => { setSelected(null); open('tags'); }} />
      <ListRow title="Erledigte Artikel automatisch entfernen" subtitle={autoDelete ? 'Nach ' + hours + ' Stunden' : 'Ausgeschaltet'} icon="time-outline" onPress={() => open('settings')} />
      <ListRow title="App-Einstellungen" icon="settings-outline" onPress={() => { setPanel(null); navigation.navigate('Settings'); }} />
    </Sheet>
    <Sheet visible={panel === 'manage'} onClose={() => setPanel(null)} title="Listen verwalten">
      {lists.map(list => <View key={list.id} style={styles.manageRow}><View style={{ flex: 1 }}><Text style={styles.itemText}>{list.name}</Text><Text style={styles.itemCaption}>{list.items.length + ' Artikel'}</Text></View>
        <IconButton icon="pencil-outline" accessibilityLabel={list.name + ' umbenennen'} onPress={() => { setEditingListId(list.id); setDraft(list.name); open('listForm'); }} />
        <IconButton icon="trash-outline" accessibilityLabel={list.name + ' löschen'} disabled={lists.length < 2} onPress={() => {
          setPanel(null); confirm({ title: 'Liste löschen?', message: '„' + list.name + '“ und alle ' + list.items.length + ' Artikel werden gelöscht.', onConfirm: () => safely(commit(current.current.filter(item => item.id !== list.id))) });
        }} />
      </View>)}
      <Button standalone icon="add" onPress={() => { setEditingListId(null); setDraft(''); open('listForm'); }}>Neue Liste</Button>
    </Sheet>
    <Sheet visible={panel === 'listForm' || panel === 'edit' || panel === 'newTag'} onClose={() => { if (!saving) setPanel(null); }}
      title={panel === 'edit' ? 'Artikel bearbeiten' : panel === 'newTag' ? 'Neue Kategorie' : editingListId ? 'Liste umbenennen' : 'Neue Einkaufsliste'}>
      <Input label={panel === 'edit' ? 'Artikel' : 'Name'} value={draft} onChangeText={setDraft} autoFocus error={error} onSubmitEditing={saveForm} />
      {panel === 'newTag' && <View style={styles.wrap}>{TAG_COLORS.map((color, index) => <Pressable key={color} style={[styles.color, { backgroundColor: color }]} accessibilityRole="radio" accessibilityLabel={'Farbe ' + (index + 1)} accessibilityState={{ checked: tagColor === color }} onPress={() => setTagColor(color)}>
        {tagColor === color && <Ionicons name="checkmark-circle" size={28} color="#09090B" />}
      </Pressable>)}</View>}
      <SheetActions><Button variant="secondary" onPress={() => setPanel(null)} disabled={saving}>Abbrechen</Button><Button disabled={!draft.trim()} loading={saving} onPress={saveForm}>Speichern</Button></SheetActions>
    </Sheet>
    <Sheet visible={panel === 'item'} onClose={() => setPanel(null)} title={selected?.name} subtitle={source?.name}>
      <ListRow title="Bearbeiten" icon="pencil-outline" onPress={() => { setDraft(selected?.name || ''); open('edit'); }} />
      <ListRow title="Kategorien zuweisen" icon="pricetags-outline" onPress={() => { setChosenTags(selected?.tags || []); open('tags'); }} />
      {lists.length > 1 && <ListRow title="In andere Liste verschieben" icon="arrow-forward-outline" onPress={() => open('move')} />}
      <ListRow title="Entfernen" destructive icon="trash-outline" onPress={() => { if (selected) void remove([selected.id]); }} />
    </Sheet>
    <Sheet visible={panel === 'move'} onClose={() => setPanel(null)} title="Artikel verschieben" subtitle={'Aus „' + (source?.name || '') + '“'}>
      {lists.filter(list => list.id !== source?.id).map(list => <ListRow key={list.id} title={list.name} icon="cart-outline" onPress={() => { void move(list.id); }} />)}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Sheet>
    <Sheet visible={panel === 'tags'} onClose={() => setPanel(null)} title={selected ? 'Kategorien zuweisen' : 'Kategorien verwalten'} subtitle={selected ? selected.name : 'Kategorien helfen beim Filtern und Sortieren.'}>
      {selected ? <View style={styles.wrap}>{tags.map(tag => <Chip key={tag.id} label={tag.name} color={tag.color} selected={chosenTags.includes(tag.id)} onPress={() => setChosenTags(previous => previous.includes(tag.id) ? previous.filter(id => id !== tag.id) : [...previous, tag.id])} />)}</View>
        : tags.map(tag => <View key={tag.id} style={styles.manageRow}><View style={[styles.dot, { backgroundColor: tag.color }]} /><Text style={[styles.itemText, { flex: 1 }]}>{tag.name}</Text>
          <IconButton icon="trash-outline" accessibilityLabel={tag.name + ' löschen'} onPress={() => {
            setPanel(null); confirm({ title: 'Kategorie löschen?', message: '„' + tag.name + '“ wird von Artikeln und Zutaten entfernt. Diese bleiben erhalten.', onConfirm: () => { void deleteTag(tag.id); } });
          }} /></View>)}
      {!tags.length && <Text style={styles.hint}>Noch keine Kategorien angelegt.</Text>}
      <ListRow title="Neue Kategorie" icon="add" onPress={() => { setDraft(''); setTagColor(TAG_COLORS[0]); open('newTag'); }} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {selected && <Button standalone loading={saving} onPress={assignTags}>Übernehmen</Button>}
    </Sheet>
    <Sheet visible={panel === 'sort'} onClose={() => setPanel(null)} title="Sortierung" subtitle={'Aktuell: ' + sortName}>
      {SORTS.map(option => <ListRow key={option.id} title={option.name} selected={sort.activeSort === option.id} trailing={sort.activeSort === option.id ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : undefined}
        onPress={() => { safely(saveSort({ ...sort, activeSort: option.id, activeSortId: undefined })); setPanel(null); }} />)}
      {sort.customSorts.map(order => <View key={order.id} style={styles.manageRow}>
        <View style={{ flex: 1 }}><ListRow title={order.name} subtitle="Eigene Kategorienreihenfolge" selected={custom?.id === order.id} onPress={() => { safely(saveSort({ ...sort, activeSort: 'custom', activeSortId: order.id })); setPanel(null); }} /></View>
        <IconButton icon="trash-outline" accessibilityLabel={'Sortierung ' + order.name + ' löschen'} onPress={() => {
          const next = { ...sort, customSorts: sort.customSorts.filter(item => item.id !== order.id), ...(custom?.id === order.id ? { activeSort: 'default' as SortType, activeSortId: undefined } : {}) };
          safely(saveSort(next));
        }} />
      </View>)}
      <ListRow title="Eigene Sortierung erstellen" icon="add" onPress={() => { setDraft(''); setCustomOrder(tags.map(tag => tag.id)); open('customSort'); }} />
    </Sheet>
    <Sheet visible={panel === 'customSort'} onClose={() => setPanel(null)} title="Eigene Sortierung">
      <Input label="Name der Sortierung" placeholder="Zum Beispiel: Mein Supermarkt" value={draft} onChangeText={setDraft} error={error} />
      <Text style={styles.hint}>Ordne die Kategorien in der Reihenfolge deines Einkaufs an.</Text>
      {customOrder.map((id, index) => <View key={id} style={styles.manageRow}><Text style={[styles.itemText, { flex: 1 }]}>{tags.find(tag => tag.id === id)?.name}</Text>
        <IconButton icon="arrow-up" accessibilityLabel={(tags.find(tag => tag.id === id)?.name || '') + ' nach oben'} disabled={index === 0} onPress={() => setCustomOrder(previous => { const next = [...previous]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} />
        <IconButton icon="arrow-down" accessibilityLabel={(tags.find(tag => tag.id === id)?.name || '') + ' nach unten'} disabled={index === customOrder.length - 1} onPress={() => setCustomOrder(previous => { const next = [...previous]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })} />
      </View>)}
      {!tags.length && <Text style={styles.hint}>Lege zuerst Kategorien über die Einkaufsoptionen an.</Text>}
      <Button standalone disabled={!draft.trim() || !customOrder.length} loading={saving} onPress={saveForm}>Sortierung speichern</Button>
    </Sheet>
    <Sheet visible={panel === 'settings'} onClose={() => setPanel(null)} title="Automatisch aufräumen">
      <View style={styles.manageRow}><Text style={[styles.itemText, { flex: 1 }]}>Erledigte Artikel automatisch entfernen</Text><Switch value={autoDelete} onValueChange={setAutoDelete} accessibilityLabel="Erledigte Artikel automatisch entfernen" /></View>
      <Text style={styles.hint}>Ausgeschaltet bleiben erledigte Artikel erhalten, bis du sie selbst entfernst.</Text>
      {autoDelete && <Input label="Stunden nach dem Abhaken" value={hours} onChangeText={setHours} keyboardType="number-pad" />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button standalone loading={saving} style={{ marginTop: 16 }} onPress={saveSettings}>Speichern</Button>
    </Sheet>
    {confirmation}{snackbar.element}
  </KeyboardAvoidingView>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: t.colors.surface, borderBottomWidth: 1, borderBottomColor: t.colors.tabBorder },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  listSelector: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 21, fontWeight: '700', color: t.colors.text, flexShrink: 1, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: t.colors.textMuted, marginTop: 1, marginBottom: 4 },
  filters: { gap: 8, paddingTop: 6 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: t.colors.textSub, flexShrink: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.surface, borderRadius: 12, marginBottom: 5, paddingRight: 2 },
  itemMain: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14 },
  itemBody: { flex: 1, paddingRight: 4 },
  itemText: { fontSize: 16, lineHeight: 23, color: t.colors.text },
  checked: { textDecorationLine: 'line-through', color: t.colors.textMuted },
  itemCaption: { fontSize: 12, color: t.colors.textMuted, marginTop: 3 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: t.colors.surface, alignItems: 'center', borderTopWidth: 1, borderColor: t.colors.tabBorder },
  manageRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 4, marginBottom: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  hint: { color: t.colors.textSub, fontSize: 14, lineHeight: 21, marginVertical: 12 },
  error: { color: t.colors.danger, fontSize: 14, marginVertical: 12 },
  color: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.colors.borderStrong },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  complete: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  completeText: { color: t.colors.success, fontSize: 18, fontWeight: '600' },
});
