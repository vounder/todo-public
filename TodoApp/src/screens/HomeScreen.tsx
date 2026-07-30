import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, ListRenderItemInfo } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageService } from '../storage/StorageService';
import { ApiService } from '../services/ApiService';
import { TodoList } from '../types';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { LIST_COLORS, tint } from '../theme/tokens';
import {
  Text,
  ScreenHeader,
  Card,
  Fab,
  Sheet,
  SheetActions,
  Button,
  Input,
  ListRow,
  EmptyState,
} from '../components';

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [renamingList, setRenamingList] = useState<TodoList | null>(null);
  const [renameText, setRenameText] = useState('');
  const [actionList, setActionList] = useState<TodoList | null>(null);

  // Daten beim Fokussieren des Screens laden
  useFocusEffect(
    useCallback(() => {
      loadTodoLists();
    }, [])
  );

  // WebSocket für Echtzeit-Updates
  useEffect(() => {
    const disconnect = ApiService.connectToServer((updatedLists) => {
      console.log('📥 Server-Update empfangen');
      setTodoLists(updatedLists);
    });

    return () => disconnect();
  }, []);

  const loadTodoLists = async () => {
    const lists = await StorageService.loadTodoLists();
    setTodoLists(lists);
  };

  const handleCreateList = async () => {
    if (newListName.trim()) {
      await StorageService.createTodoList(newListName.trim());
      setNewListName('');
      setIsModalVisible(false);
      loadTodoLists();
    }
  };

  const handleLongPressList = (list: TodoList) => {
    setActionList(list);
  };

  const handleRenameList = async () => {
    if (renameText.trim() && renamingList) {
      const updatedList = { ...renamingList, name: renameText.trim() };
      await StorageService.updateTodoList(updatedList);
      setIsRenameModalVisible(false);
      setRenamingList(null);
      setRenameText('');
      loadTodoLists();
    }
  };

  const handleDeleteList = async (listId: string) => {
    setActionList(null);
    const updated = await StorageService.deleteTodoList(listId);
    setTodoLists(updated);
  };

  const closeCreate = () => {
    setIsModalVisible(false);
    setNewListName('');
  };

  const closeRename = () => {
    setIsRenameModalVisible(false);
    setRenamingList(null);
    setRenameText('');
  };

  const renderListItem = ({ item, index }: ListRenderItemInfo<TodoList>) => {
    const completed = item.items.filter(i => i.completed).length;
    const total = item.items.length;
    const progress = total > 0 ? completed / total : 0;
    // Listenfarbe ist Nutzerdatum -- traegt hier nur als Tint, nie als Flaeche.
    const color = LIST_COLORS[(index ?? 0) % LIST_COLORS.length];

    return (
      <Card
        row
        style={styles.card}
        onPress={() => navigation.navigate('TodoDetail', { list: item })}
        onLongPress={() => handleLongPressList(item)}
      >
        <View style={[styles.avatar, { backgroundColor: tint(color) }]}>
          <Text style={[styles.avatarText, { color }]}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(progress * 100)}%` as any, backgroundColor: color },
                ]}
              />
            </View>
            <Text style={styles.cardCount}>{total === 0 ? 'Leer' : `${completed}/${total}`}</Text>
          </View>
        </View>
      </Card>
    );
  };

  const totalItems = todoLists.reduce((s, l) => s + l.items.length, 0);
  const totalDone = todoLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Meine Listen"
        subtitle={totalItems > 0 ? `${totalDone} von ${totalItems} erledigt` : undefined}
        actions={[
          {
            icon: 'construct-outline',
            onPress: () => navigation.navigate('Debug'),
            accessibilityLabel: 'Debug',
          },
          {
            icon: 'settings-outline',
            onPress: () => navigation.navigate('Settings'),
            accessibilityLabel: 'Einstellungen',
          },
        ]}
      />

      {todoLists.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="Noch keine Listen"
          subtitle="Erstelle deine erste To-do-Liste."
        />
      ) : (
        <FlatList
          data={todoLists}
          renderItem={renderListItem}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Fab icon="add" onPress={() => setIsModalVisible(true)} accessibilityLabel="Neue Liste" />

      <Sheet
        visible={isModalVisible}
        onClose={closeCreate}
        title="Neue Liste erstellen"
        keyboardAware
      >
        <Input
          placeholder="Listen-Name..."
          value={newListName}
          onChangeText={setNewListName}
          autoFocus
          onSubmitEditing={handleCreateList}
          returnKeyType="done"
        />
        <SheetActions>
          <Button variant="secondary" onPress={closeCreate}>
            Abbrechen
          </Button>
          <Button onPress={handleCreateList} disabled={!newListName.trim()}>
            Erstellen
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isRenameModalVisible}
        onClose={() => setIsRenameModalVisible(false)}
        title="Liste umbenennen"
        keyboardAware
      >
        <Input
          placeholder="Neuer Name..."
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
        />
        <SheetActions>
          <Button variant="secondary" onPress={closeRename}>
            Abbrechen
          </Button>
          <Button onPress={handleRenameList} disabled={!renameText.trim()}>
            Speichern
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={actionList !== null}
        onClose={() => setActionList(null)}
        title={actionList?.name}
      >
        <ListRow
          title="Umbenennen"
          icon="pencil-outline"
          onPress={() => {
            if (actionList) {
              setRenamingList(actionList);
              setRenameText(actionList.name);
              setIsRenameModalVisible(true);
              setActionList(null);
            }
          }}
        />
        <ListRow
          title="Löschen"
          icon="trash-outline"
          destructive
          onPress={() => actionList && handleDeleteList(actionList.id)}
        />
        <SheetActions>
          <Button variant="secondary" onPress={() => setActionList(null)}>
            Abbrechen
          </Button>
        </SheetActions>
      </Sheet>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    list: { padding: t.spacing.lg },
    card: { marginBottom: t.spacing.md },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: t.radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: t.spacing.md,
    },
    avatarText: { ...t.type.heading },
    cardBody: { flex: 1 },
    cardTitle: { ...t.type.bodyStrong, color: t.colors.text, marginBottom: t.spacing.sm },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: { height: 4, borderRadius: t.radius.pill },
    cardCount: {
      ...t.type.caption,
      color: t.colors.textMuted,
      minWidth: 36,
      textAlign: 'right',
    },
  });
