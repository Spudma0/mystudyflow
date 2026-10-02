import 'react-native-get-random-values';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import aesjs from 'aes-js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client.
 *
 * Config comes from EXPO_PUBLIC_* vars so it is baked into the bundle. The anon
 * (publishable) key is safe to ship — every table is protected by row level
 * security, so a client can only ever read or write its own rows.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the project URL + key are filled in; the app shows a setup notice. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Session storage.
 *
 * SecureStore is capped at ~2KB per value, which a Supabase session can exceed.
 * The documented workaround: keep a random AES key in SecureStore (hardware
 * backed) and hold the encrypted payload in AsyncStorage. The token is never
 * written to disk in the clear.
 */
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this._decrypt(key, encrypted);
    } catch {
      return null;
    }
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    // The ciphertext is stored before the key it was made with, so a kill
    // between the two writes leaves an old key with old ciphertext — still
    // readable — rather than a new key against stale ciphertext, which CTR
    // mode would happily "decrypt" into garbage and lose the session.
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
    await AsyncStorage.setItem(`${key}__pending`, encrypted);
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    await AsyncStorage.setItem(key, encrypted);
    await AsyncStorage.removeItem(`${key}__pending`);
  }
}

// SecureStore has no web implementation; the browser preview falls back to
// AsyncStorage (localStorage), which is only ever used for local development.
const sessionStorage = Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore();

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'http://unconfigured.local',
  SUPABASE_ANON_KEY || 'unconfigured',
  {
    auth: {
      storage: sessionStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps never carry the session in a URL fragment.
      detectSessionInUrl: false,
    },
  }
);

/**
 * Keep the access token fresh for as long as the app is installed.
 *
 * `autoRefreshToken` alone is not enough on React Native: the refresh timer
 * has to be started and stopped with the app's foreground state, or the token
 * quietly expires while the app sits in the background and the next launch
 * looks like a signed-out user. Refreshing only while active also avoids two
 * refreshes racing and revoking each other's refresh token.
 */
if (isSupabaseConfigured && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  // The listener only fires on a change, so prime it for this launch.
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
}
