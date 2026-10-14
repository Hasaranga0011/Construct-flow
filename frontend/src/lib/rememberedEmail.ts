import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Remember me" for the login screens only. Stores the user's EMAIL ONLY —
 * never a password or token (the Supabase session uses its own storage).
 * Registration / user-creation forms must never import this module.
 */
export const REMEMBERED_EMAIL_KEY = 'login.rememberedEmail';

// Keys used by older builds. Removed once on startup so stale values stop appearing.
const LEGACY_KEYS = ['cf_remember_email', 'remembered_email', 'rememberEmail', 'savedEmail'];

export async function getRememberedEmail(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REMEMBERED_EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function saveRememberedEmail(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
  } catch {
    // ignore persistence issues
  }
}

export async function clearRememberedEmail(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // ignore
  }
}

/** One-time cleanup of legacy keys. Never touches REMEMBERED_EMAIL_KEY. */
export async function cleanupLegacyRememberedKeys(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
  } catch {
    // ignore
  }
}
