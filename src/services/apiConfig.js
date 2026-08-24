import AsyncStorage from '@react-native-async-storage/async-storage';

// Production backend - same one the web app talks to (see
// StockMgmt_WebApp/.env.production). No per-tenant subdomain needed; the
// backend resolves the default tenant when the Host header carries none.
// For local dev against a machine-hosted API instead, set
// EXPO_PUBLIC_API_URL (e.g. in a .env file) to override this - e.g.
// http://10.0.2.2:8002 for the Android emulator, or http://<lan-ip>:8002
// for a real device on the same network.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://stockapi.fudeasy.com';

const TOKEN_KEY = 'access_token';
const ACTIVE_BRANCH_KEY = 'active_branch_id';

export async function getAuthToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setAuthToken(token) {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function getActiveBranchId() {
  const raw = await AsyncStorage.getItem(ACTIVE_BRANCH_KEY);
  return raw ? Number(raw) : null;
}

export async function setActiveBranchId(id) {
  if (id === null || id === undefined) {
    await AsyncStorage.removeItem(ACTIVE_BRANCH_KEY);
  } else {
    await AsyncStorage.setItem(ACTIVE_BRANCH_KEY, String(id));
  }
}

export async function clearSession() {
  await setAuthToken(null);
  await setActiveBranchId(null);
}
