import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getApiUrl } from '@/lib/apiUrl';
import { getFreshAccessToken } from '@/services/api';
import { useMapConfiguration } from '@/hooks/useMapProvider';
import type { MapLocation } from './mapHtml';
import { broadLocation, siteCoordinates, googleMapsSearchUrl } from '@/utils/siteLocation';

type Result = { lat: number; lon: number; name?: string; display_name: string; source?: string; match_type?: string; result_type?: string; precision?: string };

export function SitePinDetails({ location }: { location?: MapLocation | null }) {
  if (!location) return null;
  return <View className="mb-3 gap-1"><Text selectable className="text-xs font-medium text-slate-700">Site pin: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}</Text><Text className="text-[11px] leading-4 text-slate-500">Drag the pin to refine the site. The displayed address is the nearest mapped address and can be edited.</Text></View>;
}

export function SiteLocationSearch({ enabled = true, onSelect, onPreview }: { enabled?: boolean; onSelect: (location: MapLocation, zoom: number) => void; onPreview?: (location: MapLocation, zoom: number) => void }) {
  const configuration = useMapConfiguration(enabled);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const request = useRef<AbortController | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    request.current?.abort(); request.current = null;
  }, []);

  const search = useCallback(async (suggestions = false) => {
    stop();
    const coordinates = siteCoordinates(query);
    if (coordinates) {
      setResults([]); setError(''); setLoading(false);
      select.current({ ...coordinates, address: `Lat: ${coordinates.lat.toFixed(6)}, Lng: ${coordinates.lng.toFixed(6)}` }, 18);
      return;
    }
    if (query.trim().length < 2) { setError('Enter at least two characters.'); return; }
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), suggestions ? 12000 : 30000);
    setLoading(true); setError(''); setResults([]); setActive(-1);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Please sign in again to search locations.');
      const response = await fetch(`${getApiUrl()}/projects/${suggestions ? 'location-suggestions' : 'geocode'}?q=${encodeURIComponent(query.trim())}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const value = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : 'Location search is unavailable. Please try again.');
      const matches: Result[] = Array.isArray(value) ? value.filter(row => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon)) && Number(row.lat) >= 5.8 && Number(row.lat) <= 10 && Number(row.lon) >= 79.5 && Number(row.lon) <= 82.1 && typeof row.display_name === 'string') : [];
      setResults(matches);
      if (!matches.length) setError(suggestions ? 'No suggestions found. Add the city or street, or press Search for more matches.' : 'No matching place is listed. Try the street address and city, or pin the exact site on the map.');
    } catch (failure: any) {
      if (request.current === controller) setError(controller.signal.aborted ? 'Search timed out. Please try again.' : failure.message || 'Location search is unavailable.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }, [query, stop]);

  useEffect(() => {
    if (enabled && configuration.provider !== 'google' && query.trim().length >= 3 && !siteCoordinates(query)) debounce.current = setTimeout(() => { void search(true); }, 450);
    return stop;
  }, [enabled, configuration.provider, query, search, stop]);
  useEffect(() => { if (!enabled) setLoading(false); }, [enabled]);

  const choose = (row: Result) => {
    stop(); setResults([]); setError(''); setLoading(false); setActive(-1);
    if (broadLocation(row)) {
      onPreview?.({ lat: Number(row.lat), lng: Number(row.lon) }, row.result_type === 'street' ? 16 : 13);
      setError('This result covers an area or street. Click the exact building/site on the map, or drag your existing pin. The site address has not been changed.');
      return;
    }
    onSelect({ lat: Number(row.lat), lng: Number(row.lon), address: row.display_name }, row.result_type === 'city' || row.result_type === 'state' ? 13 : 16);
  };

  if (configuration.provider === 'google') return null;
  return <View className="mb-3 min-w-0">
    <Text className="text-xs font-semibold text-slate-700 mb-1">Search Location & Pin Site</Text>
    <View className="flex-row gap-2">
      <TextInput accessibilityLabel="Search site location" maxLength={200} value={query} placeholder="Place or street, city (e.g. Negombo)" returnKeyType="search" className="flex-1 min-w-0 border border-slate-300 rounded-xl px-3 py-3 text-sm text-slate-800 bg-white" onChangeText={value => { stop(); setQuery(value); setResults([]); setError(''); setLoading(false); setActive(-1); }} onSubmitEditing={() => { if (active >= 0 && results[active]) choose(results[active]); else void search(); }} onKeyPress={event => {
        const key = event.nativeEvent.key;
        if (results.length && ['ArrowDown', 'ArrowUp'].includes(key)) {
          event.preventDefault(); setActive(index => key === 'ArrowDown' ? Math.min(results.length - 1, index + 1) : Math.max(0, index - 1));
        }
      }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Search site location" onPress={() => void search()} className="bg-brand-orange rounded-xl items-center justify-center px-3" style={{ minHeight: 44, minWidth: 44 }}>{loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="search" color="#fff" size={18} />}</Pressable>
    </View>
    <Text className="text-[11px] text-slate-500 mt-1 mb-2">Type a place and city. Press Search for business matches. You can also paste latitude, longitude for an exact pin.</Text>
    <Text className="text-[11px] text-slate-500 mb-2">The current site stays unchanged until you choose a result or move the pin.</Text>
    {!!error && <Text accessibilityRole="alert" className="text-xs leading-5 text-amber-800 bg-amber-50 rounded-lg p-3 mb-2">{error}</Text>}
    {error.startsWith('No ') && query.trim().length >= 3 && <View className="rounded-xl border border-slate-200 bg-white p-3 mb-2">
      <Pressable accessibilityRole="link" accessibilityLabel="Find place in Google Maps" onPress={() => { void Linking.openURL(googleMapsSearchUrl(query)).catch(() => setError('Could not open Google Maps. You can still pin the site directly.')); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text className="text-sm font-semibold text-orange-700">Find this place in Google Maps ↗</Text></Pressable>
      <Text className="text-xs leading-5 text-slate-500">Choose the correct branch there, copy its latitude and longitude, then paste them into this search to place the exact pin.</Text>
    </View>}
    {loading && <Text accessibilityLiveRegion="polite" className="text-xs text-slate-500 mb-2">Finding locations…</Text>}
    {results.length > 0 && <View className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-2">
      <Text className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-3 py-2">Choose a location</Text>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 280 }}>
        {results.map((row, index) => <Pressable key={`${row.lat}:${row.lon}:${index}`} accessibilityRole="button" accessibilityLabel={`Select location: ${row.display_name}`} accessibilityState={{ selected: index === active }} onPress={() => choose(row)} className="flex-row items-start gap-3 px-3 py-3 border-t border-slate-100 hover:bg-orange-50" style={{ minHeight: 48, backgroundColor: index === active ? '#fff7ed' : undefined }}>
          <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"><Ionicons name="location-outline" color="#64748b" size={17} /></View>
          <View className="flex-1 min-w-0"><Text className="text-sm font-semibold text-slate-800">{row.name || row.display_name.split(',')[0]}</Text><Text className="text-xs leading-5 text-slate-500 mt-0.5">{row.display_name}</Text><Text className="text-[11px] text-slate-500 mt-1">{broadLocation(row) ? 'Area / street · zoom in and pin the exact site' : row.match_type === 'partial' ? 'Partial match · verify the site pin' : 'Place / address · check the building pin'}{row.source ? ` · ${row.source}` : ''}</Text></View>
        </Pressable>)}
      </ScrollView>
    </View>}
    {configuration.search_provider === 'geoapify' && <Pressable accessibilityRole="link" accessibilityLabel="Geoapify search attribution" onPress={() => { void Linking.openURL('https://www.geoapify.com/').catch(() => {}); }}><Text className="text-[11px] text-slate-500">Powered by Geoapify · © OpenStreetMap contributors</Text></Pressable>}
  </View>;
}
