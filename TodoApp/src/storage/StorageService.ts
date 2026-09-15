import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodoList } from '../types';
import { ApiService } from '../services/ApiService';

const STORAGE_KEY = '@todo_lists';
export class StorageService {
  private static writing: Promise<unknown> = Promise.resolve();
  static async loadTodoLists(): Promise<TodoList[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }
  static async refreshTodoLists(): Promise<TodoList[]> {
    const lists = await ApiService.fetchTodoListsFromServer();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    return lists;
  }
  private static change(update: (lists: TodoList[]) => TodoList[]) {
    const operation = this.writing.catch(() => {}).then(async () => {
      const next = update(await this.loadTodoLists());
      await this.saveTodoLists(next);
      return next;
    });
    this.writing = operation;
    return operation;
  }
  static async saveTodoLists(lists: TodoList[]) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    await ApiService.syncTodoListsToServer(lists);
  }
  static async createTodoList(name: string) {
    const list: TodoList = { id: Date.now() + '-' + Math.random().toString(36).slice(2), name, createdAt: Date.now(), items: [] };
    await this.change(lists => [...lists, list]);
    return list;
  }
  static async updateTodoList(updated: TodoList) {
    await this.change(lists => lists.map(list => list.id === updated.id ? updated : list));
  }
  static async deleteTodoList(id: string) {
    const next = await this.change(lists => lists.filter(list => list.id !== id));
    await ApiService.deleteTodoListFromServer(id);
    return next;
  }
  static async clearAll() { await AsyncStorage.removeItem(STORAGE_KEY); }
}
