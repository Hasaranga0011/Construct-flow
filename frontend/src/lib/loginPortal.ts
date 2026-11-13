import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeRole } from '../utils/auth';

/**
 * Login-portal gate.
 *
 * Team Login  -> only team roles (pm, site_manager, worker, admin)
 * Partner Login -> only partner roles (client, supplier)
 *
 * The portal the user signed in from is stored before sign-in (it must survive
 * the Google OAuth redirect), and AuthContext checks the resolved profile role
 * against it before the session is accepted. A mismatching account is signed
 * out immediately and an error message is shown on the login page.
 */
export type LoginPortal = 'team' | 'partner';

const KEY = 'login_portal';

export const TEAM_PORTAL_ROLES = ['pm', 'site_manager', 'worker', 'admin'];
export const PARTNER_PORTAL_ROLES = ['client', 'supplier'];

const ROLE_LABELS: Record<string, string> = {
  pm: 'Project Manager',
  site_manager: 'Site Manager',
  worker: 'Worker',
  admin: 'Admin',
  client: 'Client',
  supplier: 'Supplier',
};

export async function setLoginPortal(portal: LoginPortal): Promise<void> {
  try { await AsyncStorage.setItem(KEY, portal); } catch { /* ignore */ }
}

export async function clearLoginPortal(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Reads and clears the pending portal (one-shot per sign-in). */
export async function consumeLoginPortal(): Promise<LoginPortal | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    if (value) await AsyncStorage.removeItem(KEY);
    return value === 'team' || value === 'partner' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Returns an error message when `role` may not use `portal`, otherwise null.
 * Messages mention "Team Login" / "Partner Login" so the login pages can show
 * the matching switch button.
 */
export function portalAccessError(portal: LoginPortal, role: string | null | undefined): string | null {
  const normalized = normalizeRole(role ?? null);
  if (!normalized) return null; // unknown role -> handled by the layout ("no authorized role")
  const label = ROLE_LABELS[normalized] ?? normalized;

  if (portal === 'team' && PARTNER_PORTAL_ROLES.includes(normalized)) {
    return `This is a Partner account (${label}). Partners cannot sign in through the Team Portal. Please log in via Partner Login.`;
  }
  if (portal === 'partner' && TEAM_PORTAL_ROLES.includes(normalized)) {
    return `This is a Team account (${label}). Team members cannot sign in through the Partner Portal. Please log in via Team Login.`;
  }
  return null;
}

