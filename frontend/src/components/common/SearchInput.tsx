import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { SearchOverlay } from './SearchOverlay';

export interface SearchConfig {
  table: string;
  searchColumn: string;
  secondaryColumn?: string;
  titleColumn: string;
  subtitleColumn?: string;
  routePrefix?: string;
  filterColumn?: string;
  filterValue?: string | null;
}
export interface LocalSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  raw?: any;
}
interface SearchProps {
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
  config?: SearchConfig;
  /** Complete, already scoped rows loaded by the page. Never fetched per keystroke. */
  items?: any[];
  getLocalResults?: (query: string) => LocalSearchResult[];
  onSelectResult?: (item: LocalSearchResult) => void;
  mode?: 'filter' | 'navigate';
  entityLabel?: string;
  className?: string;
}

export function SearchInput({ placeholder = 'Search...', value, onChangeText, config,
  items, getLocalResults, onSelectResult, mode, entityLabel = 'results', className = '' }: SearchProps) {
  const router = useRouter();
  const input = useRef<TextInput>(null);
  const container = useRef<View>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressingOptions = useRef(false);
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<LocalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const local = items !== undefined || !!getLocalResults;
  const queryText = value.trim();
  const actualMode = mode || (config?.routePrefix || onSelectResult ? 'navigate' : 'filter');
  // Depend on configuration values, not an inline object's identity on each parent render.
  const { table, searchColumn, secondaryColumn, titleColumn, subtitleColumn,
    filterColumn, filterValue } = config || {};

  useEffect(() => {
    setLoading(false);
    setError('');
    setRemote([]);
    if (local || !table || !searchColumn || !titleColumn || !queryText || !open) return;
    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounce = setTimeout(async () => {
      setLoading(true);
      try {
        let request = supabase.from(table).select('*').limit(8);
        if (filterColumn && filterValue !== undefined) request = request.eq(filterColumn, filterValue);
        // Quoted PostgREST values prevent commas/parentheses in a name changing the filter.
        const pattern = `%${queryText.replace(/[\\%_]/g, '\\$&')}%`;
        request = secondaryColumn
          ? request.or(`${searchColumn}.ilike.${JSON.stringify(pattern)},${secondaryColumn}.ilike.${JSON.stringify(pattern)}`)
          : request.ilike(searchColumn, pattern);
        const response = await Promise.race([
          request.abortSignal(controller.signal),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              reject(new Error('Search timed out. Please retry.'));
              controller.abort();
            }, 8000);
          }),
        ]);
        if (response.error) throw response.error;
        if (active) setRemote((response.data || []).map(row => ({
          id: String(row.id), title: String(row[titleColumn] || ''),
          subtitle: subtitleColumn ? row[subtitleColumn] : undefined, raw: row,
        })));
      } catch (failure) {
        if (active) setError(failure instanceof Error && failure.message.includes('timed out')
          ? failure.message : 'Unable to search. Please retry.');
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryText, local, table, searchColumn, secondaryColumn, titleColumn, subtitleColumn,
    filterColumn, filterValue, retry, open]);

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const cancelBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  const dismiss = () => { cancelBlur(); setOpen(false); };
  const results: LocalSearchResult[] = !local ? remote : getLocalResults ? getLocalResults(value).slice(0, 8)
    : (items || []).filter(row => {
      if (filterColumn && filterValue !== undefined && row[filterColumn] !== filterValue) return false;
      return [row[searchColumn || 'name'], row[secondaryColumn || ''], row[subtitleColumn || '']]
        .some(field => String(field || '').toLowerCase().includes(queryText.toLowerCase()));
    }).slice(0, 8).map(row => ({ id: String(row.id), title: String(row[titleColumn || 'name'] || ''),
      subtitle: subtitleColumn ? row[subtitleColumn] : undefined, raw: row }));
  const select = (item: LocalSearchResult) => {
    dismiss();
    if (actualMode === 'navigate') onChangeText('');
    else onChangeText(item.title);
    if (onSelectResult) onSelectResult(item);
    else if (config?.routePrefix && actualMode === 'navigate') router.push(`${config.routePrefix}${item.id}` as any);
  };
  const webPreventBlur = Platform.OS === 'web' ? { onMouseDown: (event: any) => event.preventDefault() } : {};

  return <View testID="search-field" ref={container} className={`relative min-w-0 ${className}`} style={{ zIndex: 1000, overflow: 'visible' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1,
      borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: '100%' }}>
      <Ionicons name="search" size={16} color="#9CA3AF" />
      <TextInput ref={input} maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 0 }}
        className="flex-1 ml-2 text-sm text-gray-900 outline-none" placeholder={placeholder}
        placeholderTextColor="#9CA3AF" value={value}
        onChangeText={text => { cancelBlur(); onChangeText(text); setOpen(!!text.trim()); }}
        onFocus={() => { cancelBlur(); if (queryText) setOpen(true); }}
        onBlur={() => {
          cancelBlur();
          // Blur only dismisses suggestions. The parent is the sole owner of the query.
          blurTimer.current = setTimeout(() => { if (!pressingOptions.current) setOpen(false); }, 150);
        }}
        onKeyPress={event => { if (event.nativeEvent.key === 'Escape') dismiss(); }} />
      <View {...webPreventBlur} style={{ width: 44 }}>
        {!!value && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" style={{ minWidth: 44, minHeight: 44,
          alignItems: 'center', justifyContent: 'center' }} onPress={() => { dismiss(); onChangeText(''); input.current?.focus(); }}>
          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
        </Pressable>}
      </View>
    </View>
    {open && !!queryText && (local || !!config) && <SearchOverlay anchor={container} onClose={dismiss}><View testID="search-suggestions" {...webPreventBlur}
      onTouchStart={() => { pressingOptions.current = true; cancelBlur(); }}
      onTouchEnd={() => { pressingOptions.current = false; }}
      onTouchCancel={() => { pressingOptions.current = false; }}
      style={{ position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, maxHeight: 300,
        zIndex: 1001, elevation: 20, backgroundColor: 'white', borderRadius: 8, borderWidth: 1,
        borderColor: '#E5E7EB', shadowOpacity: 0.15, shadowRadius: 8, overflow: 'hidden' }}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }}>
        {loading && !local ? <View style={{ padding: 16, flexDirection: 'row', gap: 8 }}>
          <ActivityIndicator size="small" color="#F97316" /><Text maxFontSizeMultiplier={1.3}>Searching...</Text>
        </View> : error && !local ? <View style={{ padding: 12 }}>
          <Text maxFontSizeMultiplier={1.3}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry search" onPress={() => setRetry(n => n + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#EA580C' }}>Retry</Text>
          </Pressable>
        </View> : results.length === 0 ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}
          style={{ padding: 16, color: '#6B7280' }}>No {entityLabel} match {"\u2018"}{queryText}{"\u2019"}</Text>
        : results.map(item => <Pressable accessibilityRole="button" key={item.id} accessibilityLabel={`Select ${item.title}`}
          onPress={() => select(item)} style={{ minHeight: 44, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontWeight: '600', color: '#111827' }}>{item.title}</Text>
          {!!item.subtitle && <Text maxFontSizeMultiplier={1.3} style={{ color: '#6B7280' }}>{item.subtitle}</Text>}
          {!!item.badge && <Text maxFontSizeMultiplier={1.3} style={{ color: '#EA580C' }}>{item.badge}</Text>}
        </Pressable>)}
      </ScrollView>
    </View></SearchOverlay>}
  </View>;
}
