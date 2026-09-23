import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'agri_rescue_token';
const MODE_KEY = 'agri_rescue_app_mode';

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// SecureStore is unavailable on web, so fall back to localStorage there.
export async function saveToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
}

export async function saveAppMode(mode: 'sell' | 'buy'): Promise<void> {
  await setItem(MODE_KEY, mode);
}

export async function loadAppMode(): Promise<'sell' | 'buy' | null> {
  const value = await getItem(MODE_KEY);
  return value === 'sell' || value === 'buy' ? value : null;
}

export async function clearAppMode(): Promise<void> {
  await removeItem(MODE_KEY);
}
