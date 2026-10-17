import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', '10.0.2.2']);

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (LOOPBACK_HOSTS.has(host)) return true;
  // Private IPv4 ranges:
  // 10.0.0.0/8
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  // 192.168.0.0/16
  // 169.254.0.0/16 (Link-local)
  if (/^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

export function validateReleaseApiUrl(rawUrl: string | undefined): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(
      'Missing required environment variable: EXPO_PUBLIC_API_URL. ' +
      'In release builds, EXPO_PUBLIC_API_URL must be configured in your EAS environment variables.'
    );
  }

  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://')) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must start with "https://" in release builds. Current value: "${trimmed}".`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`EXPO_PUBLIC_API_URL is an invalid URL: "${trimmed}".`);
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL cannot target localhost, loopback, or private IP addresses in release builds. Hostname: "${parsed.hostname}".`
    );
  }

  let finalUrl = trimmed.replace(/\/$/, '');
  if (!finalUrl.endsWith('/api')) {
    finalUrl += '/api';
  }
  return finalUrl;
}

/** Device loopback points at the phone, not the development computer. */
export function resolveApiUrl(configured: string | undefined, platform: string, rawHostUri?: string | null): string {
  if (!configured || !configured.trim()) {
    throw new Error(
      'Missing required environment variable: EXPO_PUBLIC_API_URL. ' +
      'Please configure EXPO_PUBLIC_API_URL in your .env file or environment variables.'
    );
  }

  // Release builds: enforce HTTPS, no localhost/private IPs, no fallback
  if (!__DEV__) {
    return validateReleaseApiUrl(configured);
  }

  // Development builds (__DEV__):
  let url: URL;
  try {
    url = new URL(configured.trim());
  } catch {
    throw new Error(`EXPO_PUBLIC_API_URL is an invalid URL: "${configured}".`);
  }

  if (platform !== 'web' && isPrivateOrLoopbackHost(url.hostname)) {
    let developmentHost = '';
    if (rawHostUri) {
      try {
        const parsed = rawHostUri.includes('://') ? new URL(rawHostUri) : new URL(`http://${rawHostUri}`);
        developmentHost = parsed.hostname;
      } catch {
        developmentHost = rawHostUri.split(':')[0];
      }
    }

    if (!developmentHost || isPrivateOrLoopbackHost(developmentHost) || developmentHost.endsWith('.exp.direct')) {
      developmentHost = platform === 'android' ? '10.0.2.2' : 'localhost';
    }
    url.hostname = developmentHost;
  }

  let finalUrl = url.toString().replace(/\/$/, '');
  if (!finalUrl.endsWith('/api')) {
    finalUrl += '/api';
  }
  return finalUrl;
}

export function getApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (!__DEV__) {
    return validateReleaseApiUrl(configured);
  }

  if (!configured || !configured.trim()) {
    throw new Error(
      'Missing required environment variable: EXPO_PUBLIC_API_URL. ' +
      'Please configure EXPO_PUBLIC_API_URL in your .env file.'
    );
  }

  if (Platform.OS === 'web') {
    const isLoopback = isPrivateOrLoopbackHost(new URL(configured).hostname);
    if (!isLoopback) {
      const clean = configured.trim().replace(/\/$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }

    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:8000/api`;
    }
    const clean = configured.trim().replace(/\/$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  // Native in __DEV__:
  const manifest = Constants.expoConfig || (Constants as any).manifest || (Constants as any).manifest2;
  const debuggerHost =
    manifest?.hostUri ||
    manifest?.extra?.expoGo?.debuggerHost ||
    manifest?.extra?.expoClient?.hostUri ||
    Constants.experienceUrl;

  return resolveApiUrl(configured, Platform.OS, debuggerHost);
}