import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, Pressable, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDebounce } from '../../hooks/useDebounce';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

export interface SearchConfig {
  table: string;
  searchColumn: string;
  secondaryColumn?: string;
  titleColumn: string;
  subtitleColumn?: string;
  routePrefix?: string; // Navigate to this route + id (e.g. '/admin/projects/')
  filterColumn?: string;
  filterValue?: string | null;
}

export const GlobalSearchDropdown = ({ 
  placeholder, 
  value, 
  onChangeText, 
  config,
  className = "" 
}: { 
  placeholder: string, 
  value: string, 
  onChangeText: (v: string) => void,
  config?: SearchConfig,
  className?: string 
}) => {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(value, 300);
  const containerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && showDropdown) {
      const handleClick = (e: any) => {
        // @ts-ignore
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setShowDropdown(false);
        }
      };
      // setTimeout to avoid immediate trigger from the focus event
      setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showDropdown]);

  useEffect(() => {
    if (!config || !debouncedSearch || debouncedSearch.trim() === '') {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    let isMounted = true;
    const fetchResults = async () => {
      setLoading(true);
      setShowDropdown(true);
      try {
        let query = supabase.from(config.table).select('*').limit(5);
        
        if (config.filterColumn && config.filterValue !== undefined) {
          query = query.eq(config.filterColumn, config.filterValue);
        }

        if (config.secondaryColumn) {
          query = query.or(`${config.searchColumn}.ilike.%${debouncedSearch}%,${config.secondaryColumn}.ilike.%${debouncedSearch}%`);
        } else {
          query = query.ilike(config.searchColumn, `%${debouncedSearch}%`);
        }
        
        const { data, error } = await query;
        if (!error && isMounted) {
          setResults(data || []);
        }
      } catch (err) {
        console.warn('Search err:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchResults();
    return () => { isMounted = false; };
  }, [debouncedSearch, config]);

  return (
    <View ref={containerRef} className={`relative z-50 ${className}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, width: '100%' }}>
        <Ionicons name="search" size={16} color="#9CA3AF" />
        <TextInput 
          className="flex-1 ml-2 text-sm text-gray-900 outline-none"
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={(txt) => {
            onChangeText(txt);
            if (txt.length > 0) setShowDropdown(true);
            else setShowDropdown(false);
          }}
          onFocus={() => { if (value.length > 0) setShowDropdown(true); }}
        />
        {value.length > 0 && (
          <Pressable onPress={() => { onChangeText(''); setShowDropdown(false); }}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {showDropdown && config && (
        <View 
          className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg"
          style={{ zIndex: 100, elevation: 10, maxHeight: 250 }}
        >
          {loading ? (
            <View className="py-4 items-center justify-center">
              <ActivityIndicator size="small" color="#F97316" />
            </View>
          ) : results.length === 0 ? (
            <View className="py-4 items-center justify-center">
              <Text className="text-gray-500 text-sm">No matches found.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {results.map((item, index) => (
                <Pressable 
                  key={item.id || index}
                  onPress={() => {
                    setShowDropdown(false);
                    // Emit selection to caller
                    onChangeText(item[config.titleColumn]);
                    // Navigate if configured
                    if (config.routePrefix) {
                      router.push(`${config.routePrefix}${item.id}` as any);
                    }
                  }}
                  className={`py-3 px-4 flex-row items-center justify-between ${index !== results.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50`}
                >
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-sm" numberOfLines={1}>{item[config.titleColumn]}</Text>
                    {config.subtitleColumn && item[config.subtitleColumn] && (
                      <Text className="text-gray-500 text-xs" numberOfLines={1}>{item[config.subtitleColumn]}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};
