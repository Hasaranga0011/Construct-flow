import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/apiUrl';

type Provider = 'google' | 'openstreetmap';
type MapConfiguration = { provider: Provider; search_provider?: 'geoapify' };
let cached: { value: MapConfiguration; until: number } | null = null;
let request: Promise<MapConfiguration> | null = null;

export function useMapConfiguration(enabled = true) {
  const [configuration, setConfiguration] = useState<MapConfiguration>(cached?.value || { provider: 'openstreetmap' });
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    if (cached && cached.until > Date.now()) { setConfiguration(cached.value); return; }
    if (!request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      request = fetch(`${getApiUrl()}/maps/config`, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error('Map configuration unavailable');
        return response.json();
      }).then(value => {
        const provider: Provider = value?.provider === 'google' ? 'google' : 'openstreetmap';
        const configuration: MapConfiguration = { provider, ...(value?.search_provider === 'geoapify' ? { search_provider: 'geoapify' as const } : {}) };
        cached = { value: configuration, until: Date.now() + 30000 };
        return configuration;
      }).finally(() => { clearTimeout(timeout); request = null; });
    }
    request.then(value => { if (mounted) setConfiguration(value); }).catch(() => {});
    return () => { mounted = false; };
  }, [enabled]);
  return configuration;
}

export function useMapProvider(enabled = true) { return useMapConfiguration(enabled).provider; }
