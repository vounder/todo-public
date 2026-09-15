import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'todo_connection_v1';
// Web credentials last for the browser tab; native credentials use the OS vault.
export const ConfigPersistence = {
  async read(): Promise<string | null> {
    return Platform.OS === 'web' ? globalThis.sessionStorage.getItem(KEY) : SecureStore.getItemAsync(KEY);
  },
  async write(value: string): Promise<void> {
    if (Platform.OS === 'web') globalThis.sessionStorage.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  },
};
