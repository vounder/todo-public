/**
 * API Service für Server-Synchronisation
 * Kommuniziert mit dem Backend-Server für Multi-Device-Sync
 */

import { TodoList, Tag, SortSettings, MealPlanEntry, ShoppingListDef } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerConfig } from './ServerConfig';

export type UpdateType =
  | 'todos' | 'recipes' | 'shopping' | 'shoppingLists'
  | 'tags' | 'sortSettings' | 'mappings' | 'mealPlan' | 'mealReserve';
type UpdateListener = (data: any) => void;

const STORAGE_KEYS: Partial<Record<UpdateType, string>> = {
  todos: '@todo_lists',
  recipes: '@recipes',
  shopping: '@shopping_list',
  shoppingLists: '@shopping_lists',
  tags: '@tags',
  sortSettings: '@sort_settings',
  mappings: '@ingredient_tag_mappings',
  mealPlan: '@mealplan',
  mealReserve: '@meal_reserve',
};

export class ApiService {
  private static get baseUrl(): string { const url = ServerConfig.getApiUrl(); if (!url) throw new Error('Kein Server konfiguriert.'); return url; }
  private static get wsUrl(): string { const url = ServerConfig.getWebSocketUrl(); if (!url) throw new Error('Kein Server konfiguriert.'); return url; }

  // Debug Mode
  private static DEBUG = __DEV__;
  private static REQUEST_TIMEOUT = 10000; // 10 Sekunden

  private static ws: WebSocket | null = null;
  private static clientId: string | null = null;
  private static listeners: Map<UpdateType, Set<UpdateListener>> = new Map();
  private static reconnectAttempts = 0;
  private static reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static intentionallyClosed = false;

  // Change Detection - speichere Hash der letzten gesendeten Daten
  private static lastSentHash: {
    todos: string | null;
    recipes: string | null;
    shopping: string | null;
  } = {
    todos: null,
    recipes: null,
    shopping: null
  };

  // Version Tracking vom Server
  private static serverVersions: {
    todos: number;
    recipes: number;
    shopping: number;
  } = {
    todos: 0,
    recipes: 0,
    shopping: 0
  };

  /**
   * Berechne Hash für Daten (für Change Detection)
   */
  private static calculateHash(data: any): string {
    // Deterministischer Hash ueber den GESAMTEN Inhalt.
    // (Vorher: Laenge + erste 100 Zeichen - Aenderungen weiter hinten
    // mit gleicher Gesamtlaenge wurden nicht erkannt.)
    const str = JSON.stringify(data);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return `${str.length}-${hash}`;
  }

  /**
   * Client-ID generieren oder abrufen
   */
  private static async getClientId(): Promise<string> {
    if (this.clientId) return this.clientId;

    let id = await AsyncStorage.getItem('@client_id');
    if (!id) {
      id = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('@client_id', id);
    }
    this.clientId = id;
    return id;
  }

  /**
   * Todo-Listen vom Server abrufen
   */
  static async fetchTodoListsFromServer(): Promise<TodoList[]> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/todos`;

    try {
      if (this.DEBUG) {
        console.log('🌐 [FETCH] Starting request to:', url);
        console.log('🌐 [FETCH] Timeout:', this.REQUEST_TIMEOUT, 'ms');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('⏱️ [FETCH] Request timeout after', this.REQUEST_TIMEOUT, 'ms');
        controller.abort();
      }, this.REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (this.DEBUG) {
        console.log('🌐 [FETCH] Response received in', duration, 'ms');
        console.log('🌐 [FETCH] Status:', response.status, response.statusText);
        console.log('🌐 [FETCH] Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [FETCH] Server error:', response.status, errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (this.DEBUG) {
        console.log('✅ [FETCH] Success! Received', data.data?.length || 0, 'lists');
      }

      return data.data || [];
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ [FETCH] Failed after', duration, 'ms');
      console.error('❌ [FETCH] Error type:', error.name);
      console.error('❌ [FETCH] Error message:', error.message);

      if (error.name === 'AbortError') {
        console.error('❌ [FETCH] Request was aborted (timeout)');
      } else if (error.message.includes('Network request failed')) {
        console.error('❌ [FETCH] Network error - possible causes:');
        console.error('  - Server nicht erreichbar');
        console.error('  - Keine Internetverbindung');
        console.error('  - Firewall blockiert Verbindung');
        console.error('  - DNS-Auflösung fehlgeschlagen');
      }

      return [];
    }
  }

  static async deleteTodoListFromServer(listId: string): Promise<void> {
    try {
      const clientId = await this.getClientId();
      await fetch(`${this.baseUrl}/todos/${listId}?clientId=${clientId}`, { method: 'DELETE' });
    } catch (err) {
      console.log('❌ [DELETE TODO LIST]', err);
    }
  }

  /**
   * Todo-Listen zum Server synchronisieren (nur bei Änderungen)
   */
  static async syncTodoListsToServer(lists: TodoList[]): Promise<TodoList[]> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/todos/sync`;

    try {
      // Prüfe ob sich die Daten geändert haben
      const currentHash = this.calculateHash(lists);
      if (this.lastSentHash.todos === currentHash) {
        if (this.DEBUG) {
          console.log('⏭️  [SYNC] Keine Änderungen - Skip Server-Push');
        }
        return lists; // Keine Änderungen, nichts zu tun
      }

      const clientId = await this.getClientId();

      if (this.DEBUG) {
        console.log('📤 [SYNC] Änderungen erkannt - Starting sync to:', url);
        console.log('📤 [SYNC] Client ID:', clientId);
        console.log('📤 [SYNC] Sending', lists.length, 'lists');
        console.log('📤 [SYNC] Timeout:', this.REQUEST_TIMEOUT, 'ms');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('⏱️ [SYNC] Request timeout after', this.REQUEST_TIMEOUT, 'ms');
        controller.abort();
      }, this.REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          lists,
          version: this.serverVersions.todos,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (this.DEBUG) {
        console.log('📤 [SYNC] Response received in', duration, 'ms');
        console.log('📤 [SYNC] Status:', response.status, response.statusText);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [SYNC] Server error:', response.status, errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Speichere Hash und Version nach erfolgreichem Sync
      this.lastSentHash.todos = currentHash;
      if (data.version !== undefined) {
        this.serverVersions.todos = data.version;
      }

      if (this.DEBUG) {
        console.log('✅ [SYNC] Success! Received', data.data?.length || 0, 'lists back');
        console.log('✅ [SYNC] Server Version:', data.version);
      }

      return data.data || lists;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ [SYNC] Failed after', duration, 'ms');
      console.error('❌ [SYNC] Error type:', error.name);
      console.error('❌ [SYNC] Error message:', error.message);

      if (error.name === 'AbortError') {
        console.error('❌ [SYNC] Request was aborted (timeout)');
      } else if (error.message.includes('Network request failed')) {
        console.error('❌ [SYNC] Network error - possible causes:');
        console.error('  - Server nicht erreichbar');
        console.error('  - Keine Internetverbindung');
        console.error('  - Firewall blockiert Verbindung');
      }

      return lists;
    }
  }

  /**
   * Server-Adressen für Debug-Anzeige
   */
  static getServerInfo() {
    return { baseUrl: ServerConfig.getApiUrl() ?? 'Nicht konfiguriert', wsUrl: ServerConfig.getWebSocketUrl() ?? 'Nicht konfiguriert' };
  }

  static reconnectForConfigurationChange(): void {
    this.disconnectFromServer();
    if (ServerConfig.getServerUrl() && [...this.listeners.values()].some((listeners) => listeners.size > 0)) this.ensureConnected();
  }

  // ============================================
  // WebSocket: EINE geteilte Verbindung fuer die ganze App,
  // mit Subscriptions, Auto-Reconnect und Sender-Registrierung.
  // ============================================

  /**
   * Updates eines Datentyps abonnieren. Stellt die geteilte
   * WebSocket-Verbindung sicher. Gibt eine Unsubscribe-Funktion zurueck.
   */
  static subscribe(type: UpdateType, listener: UpdateListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    this.ensureConnected();

    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Kompatibilitaets-Wrapper (alte API): abonniert Todo-Updates.
   */
  static connectToServer(onUpdate: (lists: TodoList[]) => void): () => void {
    return this.subscribe('todos', onUpdate);
  }

  private static notify(type: UpdateType, data: any) {
    // Empfangene Daten zentral lokal persistieren
    const key = STORAGE_KEYS[type];
    if (key && data !== undefined && data !== null) {
      AsyncStorage.setItem(key, JSON.stringify(data)).catch((e) =>
        console.error(`Error persisting ${type}:`, e)
      );
    }
    this.listeners.get(type)?.forEach((listener) => {
      try {
        listener(data);
      } catch (e) {
        console.error(`Listener error (${type}):`, e);
      }
    });
  }

  private static ensureConnected() {
    // 0 = CONNECTING, 1 = OPEN
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0)) {
      return;
    }
    this.connect();
  }

  private static connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.intentionallyClosed = false;

    try {
      if (this.DEBUG) console.log('[WS] Connecting to', this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = async () => {
        if (this.DEBUG) console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        // Beim Server registrieren, damit eigene Updates nicht
        // als Echo zurueckkommen.
        try {
          const clientId = await this.getClientId();
          this.ws?.send(JSON.stringify({ type: 'REGISTER', clientId }));
        } catch (e) {
          console.error('[WS] Register failed:', e);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.versions) {
            this.serverVersions = { ...this.serverVersions, ...message.versions };
          }

          switch (message.type) {
            case 'INIT': {
              const d = message.data || {};
              if (Array.isArray(d.todos)) this.notify('todos', d.todos);
              if (Array.isArray(d.recipes)) this.notify('recipes', d.recipes);
              if (Array.isArray(d.shopping)) this.notify('shopping', d.shopping);
              break;
            }
            case 'UPDATE':
              if (Array.isArray(message.data)) this.notify('todos', message.data);
              break;
            case 'RECIPES_UPDATE':
              if (Array.isArray(message.data)) this.notify('recipes', message.data);
              break;
            case 'SHOPPING_UPDATE':
              if (Array.isArray(message.data)) this.notify('shopping', message.data);
              break;
            case 'SHOPPING_LISTS_UPDATE':
              if (Array.isArray(message.data)) this.notify('shoppingLists', message.data);
              break;
            case 'TAGS_UPDATE':
              if (Array.isArray(message.data)) this.notify('tags', message.data);
              break;
            case 'SORT_SETTINGS_UPDATE':
              if (message.data) this.notify('sortSettings', message.data);
              break;
            case 'MAPPINGS_UPDATE':
              if (Array.isArray(message.data)) this.notify('mappings', message.data);
              break;
            case 'MEALPLAN_UPDATE':
              if (Array.isArray(message.data)) this.notify('mealPlan', message.data);
              break;
            case 'MEALRESERVE_UPDATE':
              if (Array.isArray(message.data)) this.notify('mealReserve', message.data);
              break;
          }
        } catch (error: any) {
          console.error('[WS] Message parse error:', error.message);
        }
      };

      this.ws.onerror = (error: any) => {
        console.error('[WS] Error:', error?.message || error?.type || 'unknown');
      };

      this.ws.onclose = (event: any) => {
        if (this.DEBUG) console.log(`[WS] Closed (code ${event.code})`);
        this.ws = null;
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (error: any) {
      console.error('[WS] Init error:', error?.message);
      this.scheduleReconnect();
    }
  }

  private static scheduleReconnect() {
    if (this.reconnectTimer || this.intentionallyClosed) return;
    // Exponential Backoff: 1s, 2s, 4s, ... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    if (this.DEBUG) console.log(`[WS] Reconnect in ${delay}ms (Versuch ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * WebSocket-Verbindung trennen
   */
  static disconnectFromServer(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Rezepte vom Server abrufen
   */
  static async fetchRecipesFromServer(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/recipes`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (this.DEBUG) {
        console.log('✅ [RECIPES FETCH] Received', data.data?.length || 0, 'recipes');
      }

      return data.data || [];
    } catch (error) {
      console.error('❌ [RECIPES FETCH] Failed:', error);
      return [];
    }
  }

  /**
   * Rezepte zum Server synchronisieren (nur bei Änderungen)
   */
  static async syncRecipesToServer(recipes: any[]): Promise<any[]> {
    try {
      // Prüfe ob sich die Daten geändert haben
      const currentHash = this.calculateHash(recipes);
      if (this.lastSentHash.recipes === currentHash) {
        if (this.DEBUG) {
          console.log('⏭️  [RECIPES] Keine Änderungen - Skip Server-Push');
        }
        return recipes;
      }

      const clientId = await this.getClientId();

      if (this.DEBUG) {
        console.log('📤 [RECIPES] Änderungen erkannt - Syncing to server');
      }

      const response = await fetch(`${this.baseUrl}/recipes/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          recipes,
          version: this.serverVersions.recipes
        }),
      });

      const data = await response.json();

      // Speichere Hash und Version nach erfolgreichem Sync
      this.lastSentHash.recipes = currentHash;
      if (data.version !== undefined) {
        this.serverVersions.recipes = data.version;
      }

      if (this.DEBUG) {
        console.log('✅ [RECIPES] Sync erfolgreich (Version:', data.version, ')');
      }

      return data.data || [];
    } catch (error) {
      console.error('❌ [RECIPES SYNC] Failed:', error);
      return recipes;
    }
  }

  /**
   * Shopping List zum Server synchronisieren (nur bei Änderungen)
   */
  static async syncShoppingListToServer(items: any[]): Promise<any[]> {
    try {
      // Prüfe ob sich die Daten geändert haben
      const currentHash = this.calculateHash(items);
      if (this.lastSentHash.shopping === currentHash) {
        if (this.DEBUG) {
          console.log('⏭️  [SHOPPING] Keine Änderungen - Skip Server-Push');
        }
        return items;
      }

      const clientId = await this.getClientId();

      if (this.DEBUG) {
        console.log('📤 [SHOPPING] Änderungen erkannt - Syncing to server');
      }

      const response = await fetch(`${this.baseUrl}/shopping/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          items,
          version: this.serverVersions.shopping
        }),
      });

      const data = await response.json();

      // Speichere Hash und Version nach erfolgreichem Sync
      this.lastSentHash.shopping = currentHash;
      if (data.version !== undefined) {
        this.serverVersions.shopping = data.version;
      }

      if (this.DEBUG) {
        console.log('✅ [SHOPPING] Sync erfolgreich (Version:', data.version, ')');
      }

      return data.data || [];
    } catch (error) {
      console.error('❌ [SHOPPING SYNC] Failed:', error);
      return items;
    }
  }

  /**
   * Tags zum Server synchronisieren
   */
  static async syncTagsToServer(tags: Tag[]): Promise<Tag[]> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/tags/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, tags }),
      });

      // Wenn Endpoint nicht existiert (404), lokal fortfahren
      if (response.status === 404) {
        if (this.DEBUG) {
          console.log('ℹ️ [TAGS SYNC] Endpoint not available on server, using local only');
        }
        return tags;
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error: any) {
      if (this.DEBUG) {
        console.log('ℹ️ [TAGS SYNC] Server sync not available, continuing with local storage');
      }
      return tags;
    }
  }

  /**
   * Tags vom Server abrufen
   */
  static async fetchTagsFromServer(): Promise<Tag[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      // Wenn Endpoint nicht existiert, leeres Array zurückgeben
      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      // Stille Fehlerbehandlung - Tags sind optional
      return [];
    }
  }

  /**
   * Sortier-Einstellungen zum Server synchronisieren
   */
  static async syncSortSettingsToServer(sortSettings: SortSettings): Promise<SortSettings> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/sort-settings/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sortSettings }),
      });

      if (response.status === 404) {
        if (this.DEBUG) {
          console.log('ℹ️ [SORT SETTINGS SYNC] Endpoint not available on server, using local only');
        }
        return sortSettings;
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || sortSettings;
    } catch (error: any) {
      if (this.DEBUG) {
        console.log('ℹ️ [SORT SETTINGS SYNC] Server sync not available, continuing with local storage');
      }
      return sortSettings;
    }
  }

  /**
   * Sortier-Einstellungen vom Server abrufen
   */
  static async fetchSortSettingsFromServer(): Promise<SortSettings | null> {
    try {
      const response = await fetch(`${this.baseUrl}/sort-settings`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || null;
    } catch (error) {
      return null;
    }
  }

  // ============================================
  // ITEM TAG MAPPINGS (gelernte Zuweisungen)
  // ============================================

  /**
   * Gelernte Item-Tag-Zuweisungen zum Server synchronisieren
   */
  static async syncMappingsToServer(mappings: { ingredientName: string; tagIds: string[] }[]): Promise<void> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mappings/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, mappings }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      if (this.DEBUG) console.log('✅ [MAPPINGS SYNC] OK –', mappings.length, 'rules');
    } catch {
      // Silently fail — AsyncStorage ist Source of Truth
    }
  }

  /**
   * Gelernte Item-Tag-Zuweisungen vom Server abrufen
   */
  static async fetchMappingsFromServer(): Promise<{ ingredientName: string; tagIds: string[] }[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/mappings`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch {
      return null;
    }
  }

  // ============================================
  // SHOPPING LISTS (multi-list)
  // ============================================

  static async fetchShoppingListsFromServer(): Promise<ShoppingListDef[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/shopping-lists`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch {
      return null;
    }
  }

  static async syncShoppingListsToServer(lists: ShoppingListDef[]): Promise<void> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/shopping-lists/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists, clientId }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      if (this.DEBUG) console.log('✅ [SHOPPING LISTS SYNC] OK');
    } catch (err) {
      console.error('❌ [SHOPPING LISTS SYNC]', err);
    }
  }

  // ============================================
  // MEAL PLAN API
  // ============================================

  static async fetchMealPlan(from?: string, to?: string): Promise<MealPlanEntry[]> {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${this.baseUrl}/mealplan${query}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || [];
    } catch (err) {
      console.error('❌ [MEALPLAN FETCH]', err);
      return [];
    }
  }

  static async createMealPlanEntry(entry: Omit<MealPlanEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealPlanEntry | null> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mealplan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, clientId }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch (err) {
      console.error('❌ [MEALPLAN CREATE]', err);
      return null;
    }
  }

  static async updateMealPlanEntry(id: string, updates: Partial<MealPlanEntry>): Promise<MealPlanEntry | null> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mealplan/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, clientId }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch (err) {
      console.error('❌ [MEALPLAN UPDATE]', err);
      return null;
    }
  }

  static async deleteMealPlanEntry(id: string): Promise<boolean> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mealplan/${id}?clientId=${clientId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (err) {
      console.error('❌ [MEALPLAN DELETE]', err);
      return false;
    }
  }

  // ============================================
  // MEAL RESERVE API
  // ============================================

  static async fetchMealReserve(): Promise<{ id: string; title: string; notes?: string }[]> {
    try {
      const response = await fetch(`${this.baseUrl}/mealreserve`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || [];
    } catch (err) {
      console.error('❌ [MEALRESERVE FETCH]', err);
      return [];
    }
  }

  static async createMealReserveEntry(title: string, notes?: string): Promise<{ id: string; title: string; notes?: string } | null> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mealreserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, notes, clientId }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch (err) {
      console.error('❌ [MEALRESERVE CREATE]', err);
      return null;
    }
  }

  static async deleteMealReserveEntry(id: string): Promise<boolean> {
    try {
      const clientId = await this.getClientId();
      const response = await fetch(`${this.baseUrl}/mealreserve/${id}?clientId=${clientId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (err) {
      console.error('❌ [MEALRESERVE DELETE]', err);
      return false;
    }
  }

  /**
   * Server-Verbindung testen (für Debug-Zwecke)
   */
  static async testConnection(): Promise<{
    success: boolean;
    httpAvailable: boolean;
    wsAvailable: boolean;
    error?: string;
    details: string[];
  }> {
    const details: string[] = [];
    let httpAvailable = false;
    let wsAvailable = false;

    details.push('🔍 Testing server connection...');
    details.push(`📍 Server: ${this.baseUrl}`);
    details.push(`📍 WebSocket: ${this.wsUrl}`);
    details.push('');

    // Test HTTP
    details.push('1️⃣ Testing HTTP connection...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/todos`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        httpAvailable = true;
        details.push(`✅ HTTP OK! Status: ${response.status}`);
      } else {
        details.push(`⚠️ HTTP responded with error: ${response.status}`);
      }
    } catch (error: any) {
      details.push(`❌ HTTP failed: ${error.message}`);
    }

    details.push('');

    // Test WebSocket
    details.push('2️⃣ Testing WebSocket connection...');
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(this.wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket timeout after 5s'));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          wsAvailable = true;
          details.push('✅ WebSocket connected!');
          ws.close();
          resolve(true);
        };

        ws.onerror = (error: any) => {
          clearTimeout(timeout);
          details.push(`❌ WebSocket error: ${error.message || 'Unknown'}`);
          reject(error);
        };
      });
    } catch (error: any) {
      details.push(`❌ WebSocket failed: ${error.message}`);
    }

    details.push('');

    // Summary
    const success = httpAvailable && wsAvailable;
    if (success) {
      details.push('🎉 All tests passed!');
    } else {
      details.push('❌ Some tests failed:');
      if (!httpAvailable) details.push('  - HTTP connection failed');
      if (!wsAvailable) details.push('  - WebSocket connection failed');
    }

    return {
      success,
      httpAvailable,
      wsAvailable,
      error: success ? undefined : 'Connection test failed',
      details,
    };
  }
}
