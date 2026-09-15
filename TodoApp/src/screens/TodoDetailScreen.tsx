import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, SectionList, Pressable, KeyboardAvoidingView, Platform, BackHandler, Switch, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StorageService } from '../storage/StorageService';
import { ApiService } from '../services/ApiService';
import { TodoList, TodoItem } from '../types';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, Sheet, SheetActions, Button, Input, Checkbox, IconButton, EmptyState, ListRow, useConfirm, useSnackbar, SyncNotice } from '../components';

export default function TodoDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [list, setList] = useState<TodoList>(route.params.list);
  const current = useRef(list);
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<TodoItem | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const [editor, setEditor] = useState<{ kind: 'item' | 'name'; id?: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);
  const [hours, setHours] = useState('12');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const snackbar = useSnackbar(88);
  const { confirm, element: confirmation } = useConfirm();
  const update = (next: TodoList) => { current.current = next; setList(next); };
  useEffect(() => ApiService.subscribe('todos', (lists: TodoList[]) => {
    const next = lists.find(item => item.id === current.current.id);
    if (next) update(next);
  }), []);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected.length) return false;
      setSelected([]);
      return true;
    });
    return () => subscription.remove();
  }, [selected.length]));

  async function commit(next: TodoList) {
    update(next);
    await StorageService.updateTodoList(next);
  }
  function toggle(item: TodoItem) {
    if (selected.length) {
      setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]);
      return;
    }
    void commit({ ...current.current, items: current.current.items.map(task => task.id === item.id
      ? { ...task, completed: !task.completed, completedAt: !task.completed ? Date.now() : null } : task) })
      .catch(() => snackbar.show({ text: 'Die Änderung konnte nicht gespeichert werden.' }));
  }
  async function add() {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      await commit({ ...current.current, items: [...current.current.items,
        { id: Date.now() + '-' + Math.random().toString(36).slice(2), text: text.trim(), completed: false, createdAt: Date.now() }] });
      setText('');
      input.current?.focus();
    } catch { snackbar.show({ text: 'Die Aufgabe konnte nicht gespeichert werden.' }); }
    finally { setAdding(false); }
  }
  function editItem(item: TodoItem) {
    setMenu(null); setEditText(item.text); setEditor({ kind: 'item', id: item.id }); setError('');
  }
  async function saveEdit() {
    if (!editText.trim() || !editor || saving) return;
    setSaving(true);
    try {
      await commit(editor.kind === 'name' ? { ...current.current, name: editText.trim() }
        : { ...current.current, items: current.current.items.map(item => item.id === editor.id ? { ...item, text: editText.trim() } : item) });
      setEditor(null); setSelected([]);
    } catch { setError('Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten.'); }
    finally { setSaving(false); }
  }
  async function remove(ids: string[]) {
    const removed = current.current.items.map((item, index) => ({ item, index })).filter(entry => ids.includes(entry.item.id));
    try {
      await commit({ ...current.current, items: current.current.items.filter(item => !ids.includes(item.id)) });
      setMenu(null); setSelected([]);
      snackbar.show({ text: removed.length === 1 ? 'Aufgabe entfernt' : removed.length + ' Aufgaben entfernt', action: 'Rückgängig',
        onAction: async () => {
          const items = [...current.current.items];
          for (const entry of removed) if (!items.some(item => item.id === entry.item.id)) items.splice(Math.min(entry.index, items.length), 0, entry.item);
          await commit({ ...current.current, items });
        } });
    } catch { snackbar.show({ text: 'Entfernen fehlgeschlagen.' }); }
  }
  async function saveSettings() {
    const value = Number(hours);
    if (autoDelete && (!Number.isInteger(value) || value < 1)) { setError('Bitte mindestens eine ganze Stunde eingeben.'); return; }
    setSaving(true);
    try {
      await commit({ ...current.current, settings: { autoDeleteEnabled: autoDelete, autoDeleteCompletedAfterHours: autoDelete ? value : 12 } });
      setSettings(false);
    } catch { setError('Einstellungen konnten nicht gespeichert werden.'); }
    finally { setSaving(false); }
  }
  const open = list.items.filter(item => !item.completed);
  const done = list.items.filter(item => item.completed);
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {selected.length ? <View style={[styles.selectionHeader, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" accessibilityLabel="Auswahl beenden" onPress={() => setSelected([])} />
        <Text style={styles.selectionTitle}>{selected.length} ausgewählt</Text>
        <IconButton icon="pencil-outline" accessibilityLabel="Ausgewählte Aufgabe bearbeiten" disabled={selected.length !== 1}
          onPress={() => { const item = list.items.find(item => item.id === selected[0]); if (item) editItem(item); }} />
        <IconButton icon="trash-outline" tone="danger" accessibilityLabel="Ausgewählte Aufgaben entfernen"
          onPress={() => confirm({ title: 'Aufgaben entfernen?', message: selected.length + ' ausgewählte Aufgaben werden entfernt.', onConfirm: () => { void remove(selected); } })} />
      </View> : <ScreenHeader title={list.name} subtitle={open.length + ' offen · ' + done.length + ' erledigt'} variant="compact"
        onBack={() => navigation.goBack()} actions={[{ icon: 'ellipsis-horizontal', accessibilityLabel: 'Listenoptionen', onPress: () => setListMenu(true) }]} />}
      <SyncNotice />
      {list.items.length ? <SectionList
        sections={[{ title: 'Offen', data: open }, { title: 'Erledigt', data: showDone ? done : [] }]}
        keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => section.title === 'Erledigt'
          ? done.length > 0 ? <Pressable style={styles.sectionHeader} accessibilityRole="button" accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone(value => !value)}>
            <Text style={styles.sectionTitle}>Erledigt · {done.length}</Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable> : null
          : <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{open.length ? 'Offene Aufgaben' : 'Alles erledigt'}</Text></View>}
        renderItem={({ item }) => <View style={[styles.item, selected.includes(item.id) && styles.selected]}>
          <Pressable style={styles.taskContent} onPress={() => toggle(item)} onLongPress={() => setSelected([item.id])}
            accessibilityRole="checkbox" accessibilityState={{ checked: selected.length ? selected.includes(item.id) : item.completed }}
            accessibilityLabel={item.text} accessibilityHint="Lange drücken für Mehrfachauswahl">
            <Checkbox checked={selected.length ? selected.includes(item.id) : item.completed} shape="square" size={22} />
            <Text style={[styles.itemText, item.completed && styles.itemDone]}>{item.text}</Text>
          </Pressable>
          {!selected.length && <IconButton icon="ellipsis-horizontal" accessibilityLabel={'Aktionen für ' + item.text} onPress={() => setMenu(item)} />}
        </View>} />
      : <EmptyState icon="checkmark-circle-outline" title="Was steht an?" subtitle="Füge unten deine erste Aufgabe hinzu." />}
      <View style={styles.inputBar}>
        <Input ref={input} containerStyle={{ flex: 1 }} placeholder="Aufgabe hinzufügen …" value={text} onChangeText={setText}
          onSubmitEditing={add} submitBehavior="submit" blurOnSubmit={false} returnKeyType="done" />
        <IconButton icon="add" accessibilityLabel="Aufgabe hinzufügen" onPress={add} disabled={!text.trim() || adding} variant="tonal" tone="accent" />
      </View>
      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.text}>
        <ListRow title="Bearbeiten" icon="pencil-outline" onPress={() => menu && editItem(menu)} />
        <ListRow title="Mehrere auswählen" icon="checkbox-outline" onPress={() => { if (menu) setSelected([menu.id]); setMenu(null); }} />
        <ListRow title="Entfernen" icon="trash-outline" destructive onPress={() => menu && void remove([menu.id])} />
      </Sheet>
      <Sheet visible={listMenu} onClose={() => setListMenu(false)} title="Listenoptionen">
        <ListRow title="Liste umbenennen" icon="pencil-outline" onPress={() => { setEditText(list.name); setError(''); setEditor({ kind: 'name' }); setListMenu(false); }} />
        <ListRow title="Automatisches Löschen" icon="time-outline" onPress={() => {
          setAutoDelete(!!list.settings?.autoDeleteEnabled); setHours(String(list.settings?.autoDeleteCompletedAfterHours || 12));
          setError(''); setSettings(true); setListMenu(false);
        }} />
        <ListRow title="App-Einstellungen" icon="settings-outline" onPress={() => { setListMenu(false); navigation.navigate('Settings'); }} />
      </Sheet>
      <Sheet visible={!!editor} onClose={() => !saving && setEditor(null)} title={editor?.kind === 'name' ? 'Liste umbenennen' : 'Aufgabe bearbeiten'}>
        <Input label={editor?.kind === 'name' ? 'Listenname' : 'Aufgabe'} value={editText} onChangeText={setEditText} autoFocus
          multiline={editor?.kind === 'item'} error={error} />
        <SheetActions><Button variant="secondary" disabled={saving} onPress={() => setEditor(null)}>Abbrechen</Button>
          <Button loading={saving} disabled={!editText.trim()} onPress={saveEdit}>Speichern</Button></SheetActions>
      </Sheet>
      <Sheet visible={settings} onClose={() => !saving && setSettings(false)} title="Automatisches Löschen">
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}><Text style={styles.itemText}>Erledigte Aufgaben löschen</Text>
            <Text style={styles.hint}>Entfernt erledigte Aufgaben nach der gewählten Zeit dauerhaft.</Text></View>
          <Switch value={autoDelete} onValueChange={setAutoDelete} accessibilityLabel="Automatisches Löschen"
            trackColor={{ true: colors.accent, false: colors.borderStrong }} />
        </View>
        {autoDelete && <Input label="Nach wie vielen Stunden?" value={hours} onChangeText={setHours} keyboardType="number-pad" />}
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <SheetActions><Button variant="secondary" disabled={saving} onPress={() => setSettings(false)}>Abbrechen</Button>
          <Button loading={saving} onPress={saveSettings}>Speichern</Button></SheetActions>
      </Sheet>
      {confirmation}{snackbar.element}
    </KeyboardAvoidingView>
  );
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { ...t.type.label, color: t.colors.textMuted },
  item: { flexDirection: 'row', alignItems: 'center', paddingRight: 4, backgroundColor: t.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border, borderRadius: 12, marginBottom: 4 },
  selected: { backgroundColor: t.colors.accentSurface },
  taskContent: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingLeft: 16, paddingRight: 8 },
  itemText: { ...t.type.body, color: t.colors.text, flexShrink: 1 },
  itemDone: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, backgroundColor: t.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
  selectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, backgroundColor: t.colors.surface },
  selectionTitle: { ...t.type.heading, color: t.colors.text, flex: 1 },
  toggleRow: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 16 },
  hint: { ...t.type.caption, color: t.colors.textMuted, marginTop: 4 },
  error: { ...t.type.label, color: t.colors.danger, marginTop: 8 },
});
