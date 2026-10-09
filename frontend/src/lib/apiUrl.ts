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
  return url.toString().replace(/\/$/, '');
}

export function getApiUrl(): string {
  return resolveApiUrl(
    Platform.OS === 'web' ? process.env.EXPO_PUBLIC_API_URL : process.env.EXPO_PUBLIC_NATIVE_API_URL || process.env.EXPO_PUBLIC_API_URL,
    Platform.OS,
    Constants.expoConfig?.hostUri,
  );
}
