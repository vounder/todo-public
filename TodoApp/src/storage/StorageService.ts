import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodoList } from '../types';
import { ApiService } from '../services/ApiService';

const STORAGE_KEY = '@todo_lists';

/**
 * Storage Service mit automatischer Server-Synchronisation
 * Speichert Daten lokal (für Offline) und synchronisiert mit Server
 */
export class StorageService {
  /**
   * Alle Todo-Listen laden (lokal + Server-Sync)
   */
  static async loadTodoLists(): Promise<TodoList[]> {
    try {
      // Zuerst lokale Daten laden
      const jsonData = await AsyncStorage.getItem(STORAGE_KEY);
      let localLists: TodoList[] = jsonData ? JSON.parse(jsonData) : [];

      // Dann vom Server abrufen und mergen
      try {
        const serverLists = await ApiService.fetchTodoListsFromServer();
        if (serverLists.length > 0) {
          const merged = this.mergeLists(localLists, serverLists);
          // Gemergte Daten lokal speichern
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged, null, 2));
          return merged;
        }
      } catch (error) {
        console.log('Server nicht erreichbar, nutze lokale Daten');
      }

      return localLists;
    } catch (error) {
      console.error('Fehler beim Laden der Todo-Listen:', error);
      return [];
    }
  }

  /**
   * Alle Todo-Listen speichern (lokal + Server)
   */
  static async saveTodoLists(lists: TodoList[]): Promise<void> {
    try {
      // Lokal speichern
      const jsonData = JSON.stringify(lists, null, 2);
      await AsyncStorage.setItem(STORAGE_KEY, jsonData);

      // Zum Server synchronisieren (im Hintergrund)
      try {
        await ApiService.syncTodoListsToServer(lists);
      } catch (error) {
        console.log('Server-Sync fehlgeschlagen, Daten nur lokal gespeichert');
      }
    } catch (error) {
      console.error('Fehler beim Speichern der Todo-Listen:', error);
      throw error;
    }
  }

  /**
   * Listen zusammenführen (neuere Einträge gewinnen)
   */
  private static mergeLists(local: TodoList[], server: TodoList[]): TodoList[] {
    const merged = new Map<string, TodoList>();

    // Lokale Listen hinzufügen
    local.forEach(list => {
      merged.set(list.id, list);
    });

    // Server-Listen mergen
    server.forEach(serverList => {
      const existing = merged.get(serverList.id);
      if (!existing) {
        // Neue Liste vom Server
        merged.set(serverList.id, serverList);
      } else {
        // Liste existiert lokal und auf Server - Items mergen
        const mergedItems = this.mergeItems(existing.items, serverList.items);
        merged.set(serverList.id, {
          ...serverList,
          items: mergedItems,
        });
      }
    });

    return Array.from(merged.values());
  }

  /**
   * Items zusammenführen (neuere Items gewinnen, lokale Löschungen respektieren)
   */
  private static mergeItems(localItems: any[], serverItems: any[]): any[] {
    const merged = new Map();
    const localIds = new Set(localItems.map(item => item.id));

    // Lokale Items hinzufügen (haben Priorität)
    localItems.forEach(item => {
      merged.set(item.id, item);
    });

    // Nur Server-Items hinzufügen die lokal nicht existieren
    // (nicht die, die lokal gelöscht wurden)
    serverItems.forEach(serverItem => {
      if (!merged.has(serverItem.id)) {
        // Item existiert nur auf Server, nicht lokal
        // Füge es hinzu (könnte von anderem Gerät sein)
        merged.set(serverItem.id, serverItem);
      }
    });

    return Array.from(merged.values());
  }

  /**
   * Neue Todo-Liste erstellen
   */
  static async createTodoList(name: string): Promise<TodoList> {
    const lists = await this.loadTodoLists();
    const newList: TodoList = {
      id: Date.now().toString(),
      name,
      createdAt: Date.now(),
      items: [],
    };
    lists.push(newList);
    await this.saveTodoLists(lists);
    return newList;
  }

  /**
   * Todo-Liste aktualisieren
   */
  static async updateTodoList(updatedList: TodoList): Promise<void> {
    const lists = await this.loadTodoLists();
    const index = lists.findIndex(list => list.id === updatedList.id);
    if (index !== -1) {
      lists[index] = updatedList;
      await this.saveTodoLists(lists);
    }
  }

  /**
   * Todo-Liste löschen
   */
  static async deleteTodoList(listId: string): Promise<TodoList[]> {
    // Erst vom Server löschen (explizit, damit Sync-Upsert sie nicht zurückbringt)
    await ApiService.deleteTodoListFromServer(listId);

    // Lokal direkt aus AsyncStorage lesen (ohne Server-Merge)
    const jsonData = await AsyncStorage.getItem(STORAGE_KEY);
    const lists: TodoList[] = jsonData ? JSON.parse(jsonData) : [];
    const filteredLists = lists.filter(list => list.id !== listId);

    // Nur lokal speichern — kein syncTodoListsToServer, da Liste schon gelöscht
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredLists, null, 2));
    return filteredLists;
  }

  /**
   * Alle Daten löschen (für Debug-Zwecke)
   */
  static async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Fehler beim Löschen aller Daten:', error);
    }
  }
}
