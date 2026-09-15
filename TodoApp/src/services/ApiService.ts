import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodoList, Tag, SortSettings, MealPlanEntry, ShoppingListDef } from '../types';
import { ServerConfig } from './ServerConfig';

export type UpdateType = 'todos' | 'recipes' | 'shopping' | 'shoppingLists' | 'tags' | 'sortSettings' | 'mappings' | 'mealPlan' | 'mealReserve';
type Listener = (data: any) => void;
type Pending = { id: string; type: UpdateType; path: string; method: 'POST' | 'DELETE'; body?: object };
export type ConnectionState = { pending: number; unavailable: boolean; syncing: boolean };
const STORAGE_KEYS: Record<UpdateType, string> = {
  todos: '@todo_lists', recipes: '@recipes', shopping: '@shopping_list', shoppingLists: '@shopping_lists',
  tags: '@tags', sortSettings: '@sort_settings', mappings: '@ingredient_tag_mappings', mealPlan: '@mealplan', mealReserve: '@meal_reserve',
};
const PATHS: Record<UpdateType, string> = {
  todos: '/todos', recipes: '/recipes', shopping: '/shopping', shoppingLists: '/shopping-lists',
  tags: '/tags', sortSettings: '/sort-settings', mappings: '/mappings', mealPlan: '/mealplan', mealReserve: '/mealreserve',
};
const QUEUE_KEY = '@sync_outbox_v1';

export class ApiService {
  private static get baseUrl(): string { const url = ServerConfig.getApiUrl(); if (!url) throw new Error('Kein Server konfiguriert.'); return url; }
  private static get wsUrl(): string { const url = ServerConfig.getWebSocketUrl(); if (!url) throw new Error('Kein Server konfiguriert.'); return url; }
  private static clientId: string | null = null;
  private static listeners = new Map<UpdateType, Set<Listener>>();
  private static statusListeners = new Set<() => void>();
  private static state: ConnectionState = { pending: 0, unavailable: false, syncing: false };
  private static failed = new Set<UpdateType>();
  private static outbox: Record<string, Pending> = {};
  private static revisions = new Map<UpdateType, number>();
  private static initialized: Promise<void> | null = null;
  private static writing: Promise<void> = Promise.resolve();
  private static flushing: Promise<void> | null = null;
  private static ws: WebSocket | null = null;
  private static reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static reconnectAttempts = 0;
  private static intentionallyClosed = false;

  static getSyncSnapshot = () => ApiService.state;
  static subscribeSync = (listener: () => void) => {
    ApiService.statusListeners.add(listener);
    return () => { ApiService.statusListeners.delete(listener); };
  };

  private static emit() {
    this.state = { pending: Object.keys(this.outbox).length, unavailable: this.failed.size > 0, syncing: this.flushing !== null };
    this.statusListeners.forEach(listener => listener());
  }

  private static ready() {
    if (!this.initialized) this.initialized = (async () => {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) this.outbox = JSON.parse(raw);
      this.emit();
    })().catch(() => { this.initialized = null; throw new Error('Lokaler Speicher ist nicht verfügbar.'); });
    return this.initialized;
  }

  static async initialize() {
    await ServerConfig.load();
    if (!ServerConfig.getServerUrl()) return;
    await this.ready();
    this.ensureConnected();
    await this.flush();
  }

  private static persistQueue() {
    const serialized = JSON.stringify(this.outbox);
    const write = this.writing.catch(() => {}).then(() => AsyncStorage.setItem(QUEUE_KEY, serialized));
    this.writing = write;
    return write;
  }

  private static async getClientId() {
    if (!this.clientId) {
      this.clientId = await AsyncStorage.getItem('@client_id') || 'device-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      await AsyncStorage.setItem('@client_id', this.clientId);
    }
    return this.clientId;
  }

  private static async request(type: UpdateType, path: string, method = 'GET', body?: object): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const clientId = method === 'GET' ? undefined : await this.getClientId();
      const suffix = method === 'DELETE' ? (path.includes('?') ? '&' : '?') + 'clientId=' + encodeURIComponent(clientId!) : '';
      const response = await fetch(this.baseUrl + path + suffix, {
        method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        ...(body ? { body: JSON.stringify({ ...body, clientId }) } : {}),
      });
      // Only a structured record-not-found response is an idempotent delete.
      // An old server without this route also returns 404, but must stay pending.
      if (!response.ok) {
        if (method !== 'DELETE' || response.status !== 404) throw new Error('Serverfehler ' + response.status);
        const missing = await response.json();
        if (!/^(List|Entry|Recipe|Tag) not found$/.test(missing.error || '')) throw new Error('Löschfunktion am Server nicht verfügbar');
      }
      const result = method === 'DELETE' ? true : (await response.json()).data;
      if (method !== 'DELETE' && (result === undefined || result === null)) throw new Error('Unvollständige Serverantwort');
      this.failed.delete(type);
      this.emit();
      return result;
    } catch (error) {
      this.failed.add(type);
      this.emit();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private static async enqueue(key: string, operation: Omit<Pending, 'id'>) {
    await this.ready();
    this.outbox[key] = { ...operation, id: Date.now() + '-' + Math.random().toString(36).slice(2) };
    this.revisions.set(operation.type, (this.revisions.get(operation.type) || 0) + 1);
    try { await this.persistQueue(); } catch (error) { this.failed.add(operation.type); this.emit(); throw error; }
    this.emit();
    void this.flush().catch(() => {});
  }

  private static flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await this.ready();
      while (Object.keys(this.outbox).length) {
        const key = Object.keys(this.outbox)[0];
        const sent = this.outbox[key];
        try {
          await this.request(sent.type, sent.path, sent.method, sent.body);
          // A newer edit may have replaced the payload while this request ran.
          if (this.outbox[key]?.id === sent.id) delete this.outbox[key];
          await this.persistQueue();
          this.emit();
        } catch {
          break; // Keep the durable payload for retry or the next app launch.
        }
      }
    })().finally(() => { this.flushing = null; this.emit(); });
    this.emit();
    return this.flushing;
  }

  static async retry() {
    await this.flush();
    await Promise.allSettled([...this.failed].map(async type => {
      if (this.hasPending(type)) return;
      const data = await this.read(type);
      await this.notify(type, data);
    }));
  }

  private static hasPending(type: UpdateType) {
    return Object.values(this.outbox).some(operation => operation.type === type);
  }

  private static async read(type: UpdateType, query = '') {
    await this.ready();
    // Never replace unsent local edits with an older server snapshot.
    if (this.hasPending(type)) {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS[type]);
      if (raw) return JSON.parse(raw);
    }
    const revision = this.revisions.get(type);
    const result = await this.request(type, PATHS[type] + query);
    if (revision !== this.revisions.get(type)) {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS[type]);
      if (raw) return JSON.parse(raw);
    }
    return result;
  }

  private static async snapshot(type: UpdateType, body: object) {
    await this.enqueue(type, { type, path: PATHS[type] + '/sync', method: 'POST', body });
  }

  static fetchTodoListsFromServer(): Promise<TodoList[]> { return this.read('todos'); }
  static async syncTodoListsToServer(lists: TodoList[]) { await this.snapshot('todos', { lists }); return lists; }
  static deleteTodoListFromServer(id: string) {
    return this.enqueue('todo-delete-' + id, { type: 'todos', path: '/todos/' + encodeURIComponent(id), method: 'DELETE' });
  }
  static fetchRecipesFromServer(): Promise<any[]> { return this.read('recipes'); }
  static async syncRecipesToServer(recipes: any[]) { await this.snapshot('recipes', { recipes: recipes.map(recipe => ({ ...recipe, healthLevel: recipe.healthLevel ?? null })) }); return recipes; }
  static deleteRecipeFromServer(id: string) {
    return this.enqueue('recipe-delete-' + id, { type: 'recipes', path: '/recipes/' + encodeURIComponent(id), method: 'DELETE' });
  }
  static async syncShoppingListToServer(items: any[]) { await this.snapshot('shopping', { items }); return items; }
  static fetchTagsFromServer(): Promise<Tag[]> { return this.read('tags'); }
  static async syncTagsToServer(tags: Tag[]) { await this.snapshot('tags', { tags }); return tags; }
  static deleteTagFromServer(id: string) {
    return this.enqueue('tag-delete-' + id, { type: 'tags', path: '/tags/' + encodeURIComponent(id), method: 'DELETE' });
  }
  static fetchSortSettingsFromServer(): Promise<SortSettings | null> { return this.read('sortSettings'); }
  static async syncSortSettingsToServer(sortSettings: SortSettings) { await this.snapshot('sortSettings', { sortSettings }); return sortSettings; }
  static fetchMappingsFromServer(): Promise<{ ingredientName: string; tagIds: string[] }[] | null> { return this.read('mappings'); }
  static syncMappingsToServer(mappings: { ingredientName: string; tagIds: string[] }[]) { return this.snapshot('mappings', { mappings }); }
  static fetchShoppingListsFromServer(): Promise<ShoppingListDef[] | null> { return this.read('shoppingLists'); }
  static syncShoppingListsToServer(lists: ShoppingListDef[]) { return this.snapshot('shoppingLists', { lists }); }

  static fetchMealPlan(from?: string, to?: string): Promise<MealPlanEntry[]> {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    return this.read('mealPlan', query.size ? '?' + query.toString() : '');
  }
  static createMealPlanEntry(entry: Omit<MealPlanEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealPlanEntry> {
    return this.request('mealPlan', '/mealplan', 'POST', entry);
  }
  static updateMealPlanEntry(id: string, updates: Partial<MealPlanEntry>): Promise<MealPlanEntry> {
    return this.request('mealPlan', '/mealplan/' + encodeURIComponent(id), 'PUT', updates);
  }
  static deleteMealPlanEntry(id: string): Promise<boolean> {
    return this.request('mealPlan', '/mealplan/' + encodeURIComponent(id), 'DELETE');
  }
  static fetchMealReserve(): Promise<{ id: string; title: string; notes?: string }[]> { return this.read('mealReserve'); }
  static createMealReserveEntry(title: string, notes?: string): Promise<{ id: string; title: string; notes?: string }> {
    return this.request('mealReserve', '/mealreserve', 'POST', { title, notes });
  }
  static deleteMealReserveEntry(id: string): Promise<boolean> {
    return this.request('mealReserve', '/mealreserve/' + encodeURIComponent(id), 'DELETE');
  }
  static getServerInfo() { return { baseUrl: ServerConfig.getApiUrl() ?? 'Nicht konfiguriert', wsUrl: ServerConfig.getWebSocketUrl() ?? 'Nicht konfiguriert' }; }

  static subscribe(type: UpdateType, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    void this.ready().then(() => this.ensureConnected()).catch(() => {});
    return () => { this.listeners.get(type)?.delete(listener); };
  }
  static connectToServer(listener: (lists: TodoList[]) => void) { return this.subscribe('todos', listener); }

  private static async notify(type: UpdateType, data: any) {
    await this.ready();
    if (this.hasPending(type)) return;
    await AsyncStorage.setItem(STORAGE_KEYS[type], JSON.stringify(data));
    this.listeners.get(type)?.forEach(listener => listener(data));
  }

  private static ensureConnected() {
    if (!ServerConfig.getServerUrl()) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.intentionallyClosed = false;
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        this.reconnectAttempts = 0;
        this.ws?.send(JSON.stringify({ type: 'REGISTER', clientId: await this.getClientId() }));
        void this.retry();
      };
      this.ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          const types: Record<string, UpdateType> = {
            UPDATE: 'todos', RECIPES_UPDATE: 'recipes', SHOPPING_UPDATE: 'shopping',
            SHOPPING_LISTS_UPDATE: 'shoppingLists', TAGS_UPDATE: 'tags', SORT_SETTINGS_UPDATE: 'sortSettings',
            MAPPINGS_UPDATE: 'mappings', MEALPLAN_UPDATE: 'mealPlan', MEALRESERVE_UPDATE: 'mealReserve',
          };
          if (message.type === 'INIT') {
            for (const type of ['todos', 'recipes', 'shopping'] as const) {
              if (Array.isArray(message.data?.[type])) void this.notify(type, message.data[type]).catch(() => {});
            }
          } else if (types[message.type] && message.data != null) {
            void this.notify(types[message.type], message.data).catch(() => {});
          }
        } catch { /* Invalid messages must not affect the local cache. */ }
      };
      this.ws.onclose = () => { this.ws = null; this.scheduleReconnect(); };
      this.ws.onerror = () => {};
    } catch { this.scheduleReconnect(); }
  }

  private static scheduleReconnect() {
    if (this.reconnectTimer || this.intentionallyClosed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, Math.min(1000 * 2 ** this.reconnectAttempts++, 30000));
  }
  static disconnectFromServer() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.ws = null;
  }

  static reconnectForConfigurationChange(): void {
    this.disconnectFromServer();
    this.reconnectAttempts = 0;
    if (ServerConfig.getServerUrl()) void this.initialize().catch(() => {});
  }

  static async testConnection() {
    let httpAvailable = false;
    try { await this.request('todos', '/todos'); httpAvailable = true; } catch {}
    this.ensureConnected();
    const wsAvailable = this.ws?.readyState === 1;
    return {
      success: httpAvailable && wsAvailable, httpAvailable, wsAvailable,
      error: httpAvailable && wsAvailable ? undefined : 'Verbindung nicht vollständig verfügbar',
      details: [httpAvailable ? 'Server erreichbar' : 'Server nicht erreichbar', wsAvailable ? 'Live-Verbindung aktiv' : 'Live-Verbindung wird aufgebaut'],
    };
  }
}
