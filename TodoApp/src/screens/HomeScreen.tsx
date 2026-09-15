import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../storage/StorageService';
import { ApiService } from '../services/ApiService';
import { TodoList } from '../types';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, Fab, Sheet, SheetActions, Button, Input, ListRow, EmptyState, IconButton, useConfirm, useSnackbar, SyncNotice } from '../components';

export default function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [lists, setLists] = useState<TodoList[]>([]);
  const [actionList, setActionList] = useState<TodoList | null>(null);
  const [form, setForm] = useState<{ id?: string } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { confirm, element: confirmation } = useConfirm();
  const snackbar = useSnackbar(88);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        const local = await StorageService.loadTodoLists();
        if (active) setLists(local);
        const remote = await StorageService.refreshTodoLists();
        if (active) setLists(remote);
      } catch { /* SyncNotice explains connection failures; keep local content. */ }
    })();
    return () => { active = false; };
  }, []));
  useEffect(() => ApiService.subscribe('todos', setLists), []);

  function openForm(list?: TodoList) {
    setName(list?.name || '');
    setForm(list ? { id: list.id } : {});
    setActionList(null);
    setError('');
  }
  async function save() {
    if (!name.trim() || saving || !form) return;
    setSaving(true);
    setError('');
    try {
      if (form.id) {
        const list = (await StorageService.loadTodoLists()).find(list => list.id === form.id);
        if (list) await StorageService.updateTodoList({ ...list, name: name.trim() });
      } else {
        await StorageService.createTodoList(name.trim());
      }
      setLists(await StorageService.loadTodoLists());
      setForm(null);
    } catch { setError('Die Liste konnte nicht gespeichert werden. Bitte erneut versuchen.'); }
    finally { setSaving(false); }
  }
  function deleteList(list: TodoList) {
    setActionList(null);
    confirm({ title: 'Liste löschen?', message: '„' + list.name + '“ und ' + list.items.length + ' enthaltene Aufgaben werden gelöscht.',
      onConfirm: () => { void StorageService.deleteTodoList(list.id).then(setLists).catch(() => snackbar.show({ text: 'Die Liste konnte nicht gelöscht werden.' })); } });
  }
  const open = lists.reduce((sum, list) => sum + list.items.filter(item => !item.completed).length, 0);
  return (
    <View style={styles.container}>
      <ScreenHeader title="Aufgaben" subtitle={lists.length ? open + ' offen · ' + lists.length + (lists.length === 1 ? ' Liste' : ' Listen') : 'Platz für alles, was ansteht'}
        actions={[{ icon: 'settings-outline', accessibilityLabel: 'App-Einstellungen', onPress: () => navigation.navigate('Settings') }]} />
      <SyncNotice />
      <FlatList data={lists} keyExtractor={item => item.id}
        contentContainerStyle={[styles.content, !lists.length && { flex: 1 }]}
        ListEmptyComponent={<EmptyState icon="checkbox-outline" title="Deine erste Liste" subtitle="Fasse zusammen, was zusammengehört — zum Beispiel Zuhause, Arbeit oder Urlaub." />}
        renderItem={({ item }) => {
          const done = item.items.filter(task => task.completed).length;
          const remaining = item.items.length - done;
          return (
            <View style={styles.card}>
              <Pressable style={({ pressed }) => [styles.openList, pressed && { opacity: 0.65 }]}
                accessibilityRole="button" accessibilityLabel={item.name + ', ' + remaining + ' offene Aufgaben'}
                onPress={() => navigation.navigate('TodoDetail', { list: item })}
                onLongPress={() => setActionList(item)}>
                <View style={[styles.listIcon, remaining === 0 && item.items.length > 0 && { backgroundColor: colors.successSurface }]}>
                  <Ionicons name={remaining === 0 && item.items.length > 0 ? 'checkmark' : 'list-outline'} size={23}
                    color={remaining === 0 && item.items.length > 0 ? colors.success : colors.accent} accessible={false} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.cardMeta}>{item.items.length ? remaining + ' offen · ' + done + ' erledigt' : 'Noch keine Aufgaben'}</Text>
                </View>
              </Pressable>
              <IconButton icon="ellipsis-horizontal" accessibilityLabel={'Aktionen für ' + item.name} onPress={() => setActionList(item)} />
            </View>
          );
        }} />
      <Fab icon="add" label="Neue Liste" onPress={() => openForm()} accessibilityLabel="Neue Aufgabenliste" />
      <Sheet visible={form !== null} onClose={() => !saving && setForm(null)} title={form?.id ? 'Liste umbenennen' : 'Neue Liste'}>
        <Input label="Name" placeholder="Zum Beispiel Zuhause" value={name} onChangeText={setName} autoFocus
          error={error} onSubmitEditing={save} returnKeyType="done" />
        <SheetActions>
          <Button variant="secondary" onPress={() => setForm(null)} disabled={saving}>Abbrechen</Button>
          <Button onPress={save} disabled={!name.trim()} loading={saving}>{form?.id ? 'Speichern' : 'Liste erstellen'}</Button>
        </SheetActions>
      </Sheet>
      <Sheet visible={!!actionList} onClose={() => setActionList(null)} title={actionList?.name}>
        <ListRow title="Umbenennen" icon="pencil-outline" onPress={() => actionList && openForm(actionList)} />
        <ListRow title="Liste löschen" icon="trash-outline" destructive onPress={() => actionList && deleteList(actionList)} />
      </Sheet>
      {confirmation}
      {snackbar.element}
    </View>
  );
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: 16, paddingBottom: 112 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.surface,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
    paddingRight: 4, marginBottom: 12 },
  openList: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 88 },
  listIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { ...t.type.heading, color: t.colors.text },
  cardMeta: { ...t.type.label, color: t.colors.textMuted, marginTop: 4 },
});
