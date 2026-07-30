import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Keyboard,
  Switch,
  FlatList,
  ListRenderItemInfo,
  KeyboardAvoidingView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageService } from '../storage/StorageService';
import { ApiService } from '../services/ApiService';
import { TodoList, TodoItem } from '../types';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  Text,
  ScreenHeader,
  Sheet,
  SheetActions,
  Button,
  Input,
  Checkbox,
  IconButton,
  EmptyState,
  Popover,
  ListRow,
  ConfirmSheet,
} from '../components';

export default function TodoDetailScreen({ route, navigation }: any) {
  const { list: initialList } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [list, setList] = useState<TodoList>(initialList);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [editText, setEditText] = useState('');
  const [newItemText, setNewItemText] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isRenameListModalVisible, setIsRenameListModalVisible] = useState(false);
  const [renameListText, setRenameListText] = useState('');
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(
    list.settings?.autoDeleteEnabled || false
  );
  const [autoDeleteHours, setAutoDeleteHours] = useState<string>(
    list.settings?.autoDeleteCompletedAfterHours?.toString() || '12'
  );

  // Keyboard Listener
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardShown(true)
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  // Reset keyboardShown when leaving screen
  useEffect(() => {
    return () => setKeyboardShown(false);
  }, []);

  // Echtzeit-Updates über die geteilte WebSocket-Verbindung
  useEffect(() => {
    const unsubscribe = ApiService.subscribe('todos', (updatedLists: TodoList[]) => {
      const updatedCurrentList = updatedLists.find(l => l.id === list.id);
      if (updatedCurrentList) {
        setList(updatedCurrentList);
      }
    });
    return unsubscribe;
  }, [list.id]);

  const handleLongPressTitle = () => {
    setRenameListText(list.name);
    setIsRenameListModalVisible(true);
  };

  const handleRenameList = async () => {
    if (renameListText.trim()) {
      const updatedList = { ...list, name: renameListText.trim() };
      setList(updatedList);
      await StorageService.updateTodoList(updatedList);
      setIsRenameListModalVisible(false);
    }
  };

  const handleSaveSettings = async () => {
    const hours = parseInt(autoDeleteHours);
    if (!isNaN(hours) && hours > 0) {
      const updatedList = {
        ...list,
        settings: {
          autoDeleteEnabled: autoDeleteEnabled,
          autoDeleteCompletedAfterHours: hours,
        },
      };
      setList(updatedList);
      await StorageService.updateTodoList(updatedList);
      setIsSettingsModalVisible(false);
    }
  };

  const handleToggleItem = async (itemId: string) => {
    if (selectionMode) {
      // Im Auswahlmodus: Item zur Auswahl hinzufügen/entfernen
      const newSelected = new Set(selectedItems);
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        newSelected.add(itemId);
      }
      setSelectedItems(newSelected);

      // Auswahlmodus beenden, wenn keine Items mehr ausgewählt
      if (newSelected.size === 0) {
        setSelectionMode(false);
      }
    } else {
      // Normaler Modus: Checkbox toggle
      // completedAt setzen, damit Auto-Delete ab dem Abhaken rechnet
      // (nicht ab Erstellung des Eintrags)
      const updatedItems = list.items.map(item =>
        item.id === itemId
          ? { ...item, completed: !item.completed, completedAt: !item.completed ? Date.now() : null }
          : item
      );
      const updatedList = { ...list, items: updatedItems };
      setList(updatedList);
      await StorageService.updateTodoList(updatedList);
    }
  };

  const handleLongPress = (itemId: string) => {
    // Auswahlmodus aktivieren
    setSelectionMode(true);
    const newSelected = new Set<string>();
    newSelected.add(itemId);
    setSelectedItems(newSelected);
  };

  const handleAddItem = async () => {
    if (newItemText.trim()) {
      const newItem: TodoItem = {
        id: Date.now().toString(),
        text: newItemText.trim(),
        completed: false,
        createdAt: Date.now(),
      };
      const updatedList = {
        ...list,
        items: [...list.items, newItem],
      };
      setList(updatedList);
      await StorageService.updateTodoList(updatedList);
      setNewItemText('');
    }
  };

  const handleEditSelected = () => {
    if (selectedItems.size === 1) {
      const itemId = Array.from(selectedItems)[0];
      const item = list.items.find(i => i.id === itemId);
      if (item) {
        setEditingItem(item);
        setEditText(item.text);
        setIsEditModalVisible(true);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (editText.trim() && editingItem) {
      const updatedItems = list.items.map(item =>
        item.id === editingItem.id ? { ...item, text: editText.trim() } : item
      );
      const updatedList = { ...list, items: updatedItems };
      setList(updatedList);
      await StorageService.updateTodoList(updatedList);
      setIsEditModalVisible(false);
      setEditingItem(null);
      setEditText('');
      setSelectionMode(false);
      setSelectedItems(new Set());
    }
  };

  const executeDeleteSelected = async () => {
    console.log('🗑️ Lösche', selectedItems.size, 'Items:', Array.from(selectedItems));
    const updatedItems = list.items.filter(item => !selectedItems.has(item.id));
    const updatedList = { ...list, items: updatedItems };
    setList(updatedList);
    await StorageService.updateTodoList(updatedList);
    setSelectionMode(false);
    setSelectedItems(new Set());
    setDeleteConfirmVisible(false);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  };

  const renderItem = ({ item }: ListRenderItemInfo<TodoItem>) => {
    const isSelected = selectedItems.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.itemSelected]}
        onPress={() => handleToggleItem(item.id)}
        onLongPress={() => !selectionMode && handleLongPress(item.id)}
        activeOpacity={0.7}
      >
        <Checkbox
          checked={selectionMode ? isSelected : item.completed}
          shape={selectionMode ? 'square' : 'circle'}
        />
        <Text
          style={[
            styles.itemText,
            item.completed && !selectionMode && styles.itemTextDone,
          ]}
        >
          {item.text}
        </Text>
      </TouchableOpacity>
    );
  };

  const completed = list.items.filter(i => i.completed).length;
  const total = list.items.length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={0}>
      {selectionMode ? (
        <View style={[styles.selHeader, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="close" onPress={exitSelection} accessibilityLabel="Auswahl beenden" />
          <Text style={styles.selCount}>{selectedItems.size} ausgewählt</Text>
          <Button
            variant="ghost"
            size="sm"
            standalone
            onPress={handleEditSelected}
            disabled={selectedItems.size !== 1}
          >
            Bearbeiten
          </Button>
          <Button
            variant="danger"
            size="sm"
            standalone
            onPress={() => setDeleteConfirmVisible(true)}
          >
            Löschen
          </Button>
        </View>
      ) : (
        <ScreenHeader
          title={list.name}
          subtitle={total === 0 ? 'Keine Einträge' : `${completed} von ${total} erledigt`}
          variant="compact"
          onBack={() => navigation.goBack()}
          actions={[
            {
              icon: 'ellipsis-vertical',
              onPress: () => setIsMenuVisible(true),
              accessibilityLabel: 'Menü',
            },
          ]}
        />
      )}

      {list.items.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title="Noch leer"
          subtitle="Füge deinen ersten Eintrag hinzu."
        />
      ) : (
        <FlatList
          data={list.items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View
        style={[
          styles.inputBar,
          { paddingBottom: 12 },
        ]}
      >
        <Input
          containerStyle={{ flex: 1 }}
          placeholder="Neuer Eintrag..."
          value={newItemText}
          onChangeText={setNewItemText}
          onSubmitEditing={handleAddItem}
          returnKeyType="send"
        />
        <IconButton
          icon="arrow-up"
          onPress={handleAddItem}
          accessibilityLabel="Eintrag hinzufügen"
          variant="tonal"
          tone={newItemText.trim() ? 'accent' : 'default'}
          style={!newItemText.trim() && styles.sendDisabled}
        />
      </View>

      <Popover visible={isMenuVisible} onClose={() => setIsMenuVisible(false)} offsetTop={insets.top + 52}>
        <ListRow
          title="Umbenennen"
          icon="pencil-outline"
          onPress={() => {
            setIsMenuVisible(false);
            handleLongPressTitle();
          }}
        />
        <ListRow
          title="Einstellungen"
          icon="settings-outline"
          onPress={() => {
            setIsMenuVisible(false);
            setIsSettingsModalVisible(true);
          }}
        />
      </Popover>

      <Sheet
        visible={isEditModalVisible}
        onClose={() => setIsEditModalVisible(false)}
        title="Eintrag bearbeiten"
        keyboardAware
      >
        <Input
          style={styles.multiline}
          placeholder="Text..."
          value={editText}
          onChangeText={setEditText}
          autoFocus
          multiline
        />
        <SheetActions>
          <Button
            variant="secondary"
            onPress={() => {
              setIsEditModalVisible(false);
              setEditingItem(null);
              setEditText('');
            }}
          >
            Abbrechen
          </Button>
          <Button onPress={handleSaveEdit} disabled={!editText.trim()}>
            Speichern
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isRenameListModalVisible}
        onClose={() => setIsRenameListModalVisible(false)}
        title="Liste umbenennen"
        keyboardAware
      >
        <Input
          placeholder="Neuer Name..."
          value={renameListText}
          onChangeText={setRenameListText}
          autoFocus
        />
        <SheetActions>
          <Button variant="secondary" onPress={() => setIsRenameListModalVisible(false)}>
            Abbrechen
          </Button>
          <Button onPress={handleRenameList} disabled={!renameListText.trim()}>
            Speichern
          </Button>
        </SheetActions>
      </Sheet>

      <Sheet
        visible={isSettingsModalVisible}
        onClose={() => setIsSettingsModalVisible(false)}
        title="Einstellungen"
        keyboardAware
      >
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Automatisches Löschen</Text>
            <Text style={styles.toggleHint}>Abgehakte Einträge nach Zeit löschen</Text>
          </View>
          <Switch
            value={autoDeleteEnabled}
            onValueChange={setAutoDeleteEnabled}
            trackColor={{ true: colors.accent, false: colors.borderStrong }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.borderStrong}
          />
        </View>
        {autoDeleteEnabled && (
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Löschen nach</Text>
            <Input
              containerStyle={styles.settingInput}
              value={autoDeleteHours}
              onChangeText={setAutoDeleteHours}
              keyboardType="numeric"
            />
            <Text style={styles.settingLabel}>Stunden</Text>
          </View>
        )}
        <SheetActions>
          <Button
            variant="secondary"
            onPress={() => {
              setIsSettingsModalVisible(false);
              setAutoDeleteEnabled(list.settings?.autoDeleteEnabled || false);
              setAutoDeleteHours(list.settings?.autoDeleteCompletedAfterHours?.toString() || '12');
            }}
          >
            Abbrechen
          </Button>
          <Button onPress={handleSaveSettings}>Speichern</Button>
        </SheetActions>
      </Sheet>

      <ConfirmSheet
        visible={deleteConfirmVisible}
        title="Einträge löschen"
        message={`${selectedItems.size} ${
          selectedItems.size === 1 ? 'Eintrag' : 'Einträge'
        } wirklich löschen?`}
        onConfirm={executeDeleteSelected}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    selHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    selCount: { ...t.type.bodyStrong, color: t.colors.text, flex: 1 },
    listContent: { padding: t.spacing.lg },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
      ...t.elevation.e1,
    },
    itemSelected: { backgroundColor: t.colors.accentSurface },
    itemText: { ...t.type.body, color: t.colors.text, flex: 1 },
    itemTextDone: { textDecorationLine: 'line-through', color: t.colors.textMuted },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    sendDisabled: { opacity: 0.45 },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.sm,
    },
    toggleInfo: { flex: 1 },
    toggleLabel: { ...t.type.bodyStrong, color: t.colors.text },
    toggleHint: { ...t.type.caption, color: t.colors.textMuted, marginTop: 2 },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      marginTop: t.spacing.md,
    },
    settingLabel: { ...t.type.body, color: t.colors.textSub },
    settingInput: { width: 72 },
  });
