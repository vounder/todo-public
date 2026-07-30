import AsyncStorage from '@react-native-async-storage/async-storage';
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
  private loaded = false;
  async load(): Promise<string | null> {
    if (!this.loaded) { this.override = normalizeServerUrl(await AsyncStorage.getItem(STORAGE_KEY)); this.loaded = true; }
    return this.getServerUrl();
  }
  getServerUrl(): string | null { return resolveServerUrl(this.override, buildDefault); }
  getApiUrl(): string | null { const url = this.getServerUrl(); return url ? apiUrl(url) : null; }
  getWebSocketUrl(): string | null { const url = this.getServerUrl(); return url ? webSocketUrl(url) : null; }
  async setOverride(value: string): Promise<string> {
    const valid = normalizeServerUrl(value);
    if (!valid) throw new Error('Bitte eine vollständige http:// oder https:// Server-URL eingeben.');
    this.override = valid; this.loaded = true; await AsyncStorage.setItem(STORAGE_KEY, valid); return valid;
  }
  async resetOverride(): Promise<string | null> { this.override = null; this.loaded = true; await AsyncStorage.removeItem(STORAGE_KEY); return this.getServerUrl(); }
  getBuildDefault(): string | null { return normalizeServerUrl(buildDefault); }
}
export const ServerConfig = new ServerConfigStore();
