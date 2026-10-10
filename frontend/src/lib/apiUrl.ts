import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Device loopback points at the phone, not the development computer. */
export function resolveApiUrl(configured: string | undefined, platform: string, hostUri?: string | null): string {
  const url = new URL(configured || 'http://localhost:8000/api');
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(host);
  if (platform !== 'web' && loopback(url.hostname)) {
    const developmentHost = hostUri ? new URL(`http://${hostUri}`).hostname : '';
    if (!developmentHost || loopback(developmentHost) || developmentHost.endsWith('.exp.direct')) {
      throw new Error('Configure EXPO_PUBLIC_NATIVE_API_URL with the backend HTTPS URL or your computer LAN address.');
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
  // Temporarily hardcoded to force the correct LAN IP (bypassing any cached terminal environment variables)
  return 'http://192.168.8.159:8000/api';
}
