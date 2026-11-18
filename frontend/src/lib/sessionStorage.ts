import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type Manifest = { generation: string; chunks: number };
const chunkKey = (key: string, generation: string, index: number) => `${key}.${generation}.${index}`;
const manifestKey = (key: string) => `${key}.secure`;

async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(manifestKey(key));
  if (!raw) return null;
  const result = JSON.parse(raw) as Manifest;
  if (!Number.isInteger(result.chunks) || result.chunks < 1 || result.chunks > 100) throw new Error('Invalid secure session');
  return result;
}

async function removeChunks(key: string, previous: Manifest | null) {
  if (!previous) return;
  await Promise.all(Array.from({ length: previous.chunks }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, previous.generation, i))));
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    const saved = await manifest(key);
    if (saved) {
      const chunks = await Promise.all(Array.from({ length: saved.chunks }, (_, i) => SecureStore.getItemAsync(chunkKey(key, saved.generation, i))));
      if (chunks.some(value => value == null)) throw new Error('Secure session is incomplete. Please sign in again.');
      return chunks.join('');
    }
    // Migrate an existing session once, then remove its unencrypted copy.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) await sessionStorage.setItem(key, legacy);
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
      return;
    }
    const previous = await manifest(key);
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Unicode-aware chunks preserve surrogate pairs and stay within 2 KiB.
    const pieces = value.match(/[\s\S]{1,400}/gu) || [''];
    if (pieces.length > 100) throw new Error('Session is too large to store securely');
    try {
      await Promise.all(pieces.map((piece, i) => SecureStore.setItemAsync(chunkKey(key, generation, i), piece)));
      await SecureStore.setItemAsync(manifestKey(key), JSON.stringify({ generation, chunks: pieces.length }));
    } catch (error) {
      await removeChunks(key, { generation, chunks: pieces.length });
      throw error;
    }
    await AsyncStorage.removeItem(key);
    await removeChunks(key, previous);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
      return;
    }
    const previous = await manifest(key);
    await SecureStore.deleteItemAsync(manifestKey(key));
    await removeChunks(key, previous);
    await AsyncStorage.removeItem(key);
  },
};
