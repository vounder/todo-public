import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConfigPersistence } from './ConfigPersistence';
import {
  apiUrl,
  normalizeServerUrl,
  resolveServerUrl,
  webSocketUrl,
} from './ServerUrl';

const STORAGE_KEY = '@server_url_override';
const buildDefault = process.env.EXPO_PUBLIC_SERVER_URL;

class ServerConfigStore {
  private override: string | null = null;
  private accessKey = '';
  private localOnly = false;
  private loaded = false;
  private loading: Promise<string | null> | null = null;
  async load(): Promise<string | null> {
    if (this.loaded) return this.getServerUrl();
    if (!this.loading) this.loading = (async () => {
      const raw = await ConfigPersistence.read();
      if (raw) {
        const data = JSON.parse(raw);
        this.override = normalizeServerUrl(data.url);
        this.accessKey = typeof data.key === 'string' ? data.key : '';
        this.localOnly = data.localOnly === true;
      } else this.override = normalizeServerUrl(await AsyncStorage.getItem(STORAGE_KEY));
      this.loaded = true;
      return this.getServerUrl();
    })().finally(() => { this.loading = null; });
    return this.loading;
  }
  getServerUrl(): string | null { return this.localOnly ? null : resolveServerUrl(this.override, buildDefault); }
  getAccessKey(): string { return this.accessKey; }
  isLocalOnly(): boolean { return this.localOnly; }
  isConfigured(): boolean { return this.localOnly || !!this.getServerUrl(); }
  getApiUrl(): string | null { const url = this.getServerUrl(); return url ? apiUrl(url) : null; }
  getWebSocketUrl(): string | null { const url = this.getServerUrl(); return url ? webSocketUrl(url) : null; }
  async setOverride(value: string): Promise<string> {
    return this.setConnection(value, this.accessKey);
  }
  async setConnection(value: string, key: string): Promise<string> {
    const valid = normalizeServerUrl(value);
    if (!valid) throw new Error('Bitte eine vollständige http:// oder https:// Server-URL eingeben.');
    await ConfigPersistence.write(JSON.stringify({ url: valid, key, localOnly: false }));
    this.override = valid; this.accessKey = key; this.localOnly = false; this.loaded = true;
    return valid;
  }
  async useLocalOnly(): Promise<void> {
    await ConfigPersistence.write(JSON.stringify({ url: this.override, key: this.accessKey, localOnly: true }));
    this.localOnly = true; this.loaded = true;
  }
  async resetOverride(): Promise<string | null> {
    const fallback = this.getBuildDefault();
    if (!fallback) return null;
    return this.setConnection(fallback, '');
  }
  getBuildDefault(): string | null { return normalizeServerUrl(buildDefault); }
}
export const ServerConfig = new ServerConfigStore();
