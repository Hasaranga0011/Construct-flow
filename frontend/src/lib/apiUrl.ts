import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Device loopback points at the phone, not the development computer. */
export function resolveApiUrl(configured: string | undefined, platform: string, rawHostUri?: string | null): string {
  const url = new URL(configured || 'http://localhost:8000/api');
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(host);
  
  if (platform !== 'web' && loopback(url.hostname)) {
    let developmentHost = '';
    if (rawHostUri) {
      try {
        // Handle cases where rawHostUri is just an IP:PORT or an exp:// URL
        const parsed = rawHostUri.includes('://') ? new URL(rawHostUri) : new URL(`http://${rawHostUri}`);
        developmentHost = parsed.hostname;
      } catch (e) {
        developmentHost = rawHostUri.split(':')[0];
      }
    }
    
    if (!developmentHost || loopback(developmentHost) || developmentHost.endsWith('.exp.direct')) {
      // Fallback to active LAN IP of this machine, or 10.0.2.2 for android emulator
      developmentHost = '10.24.163.40';
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
  if (Platform.OS === 'web') {
    const configured = process.env.EXPO_PUBLIC_API_URL;
    const isLoopback = !configured || /localhost|127\.0\.0\.1/.test(configured);

    // Hosted build: use the configured backend URL as-is
    if (!isLoopback) {
      const clean = configured!.replace(/\/$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }

    // Local dev (existing behaviour): same host as the page, port 8000
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      return `http://${window.location.hostname}:8000/api`;
    }
    return 'http://localhost:8000/api';
  }

  // ...native branch unchanged below
  
  // Try multiple ways to get the Metro bundler IP in Expo Go
  const manifest = Constants.expoConfig || (Constants as any).manifest || (Constants as any).manifest2;
  const debuggerHost = 
    manifest?.hostUri || 
    manifest?.extra?.expoGo?.debuggerHost || 
    manifest?.extra?.expoClient?.hostUri || 
    Constants.experienceUrl;
    
  return resolveApiUrl(
    process.env.EXPO_PUBLIC_NATIVE_API_URL || process.env.EXPO_PUBLIC_API_URL,
    Platform.OS,
    debuggerHost
  );
}
