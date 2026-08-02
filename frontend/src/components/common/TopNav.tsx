import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Text, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NotificationPanel } from './NotificationPanel';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useTheme } from '../../context/ThemeContext';

interface TopNavProps {
  title?: string;
  showAction?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  initialSearchQuery?: string;
  onSearch?: (query: string) => void;
}

export const TopNav = ({ title = '', showAction = true, actionLabel = '+ New Project', onActionPress = () => {}, initialSearchQuery = '', onSearch = undefined }: TopNavProps) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [localSearch, setLocalSearch] = useState(initialSearchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ projects: any[], workers: any[], materials: any[] } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();
  const { isDark } = useTheme();
  
  const { unreadCount } = useRealtimeNotifications();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(localSearch), 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      performGlobalSearch(debouncedSearch);
    } else {
      setSearchResults(null);
      setShowDropdown(false);
    }
  }, [debouncedSearch]);

  const performGlobalSearch = async (query: string) => {
    setIsSearching(true);
    setShowDropdown(true);
    try {
      const q = `%${query}%`;
      const [projRes, labRes, matRes] = await Promise.all([
        supabase.from('projects').select('id, name, location').ilike('name', q).limit(3),
        supabase.from('labour').select('id, name, trade').ilike('name', q).limit(3),
        supabase.from('materials').select('id, item_name').ilike('item_name', q).limit(3),
      ]);

      setSearchResults({
        projects: projRes.data || [],
        workers: labRes.data || [],
        materials: matRes.data || [],
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (type: string, id: string) => {
    setShowDropdown(false);
    setLocalSearch('');
    if (type === 'project') router.push(`/admin/dashboard`);
    if (type === 'worker') router.push(`/admin/labour`);
    if (type === 'material') router.push(`/admin/materials`);
  };

  return (
    <View style={{ zIndex: 10 }}>
      <LinearGradient 
        colors={isDark ? ['#0F172A', '#0F172A'] : ['#ffffff', '#fcfcfc']}
        className={`flex-row items-center justify-between py-4 px-6 border-b relative ${isDark ? 'border-gray-800' : 'border-gray-100'}`}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View>
          <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-brand-text'}`}>{title}</Text>
        </View>
        
        <View className="flex-row items-center space-x-4 gap-4">
          {/* Search Bar */}
          {onSearch !== undefined && (
            <View className="relative z-50">
              <View className={`border rounded-full px-4 py-2 w-72 flex-row items-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
                <Ionicons name="search" size={16} color={isDark ? "#6B7280" : "#9CA3AF"} />
                <TextInput 
                  placeholder="Search projects, workers..." 
                  className={`flex-1 text-sm ml-2 outline-none ${isDark ? 'text-white' : 'text-brand-text'}`}
                  style={{ outlineStyle: 'none' } as any}
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  value={localSearch}
                  onChangeText={(txt) => { setLocalSearch(txt); if (!txt) setShowDropdown(false); }}
                  onSubmitEditing={() => onSearch(localSearch)}
                  onFocus={() => { if (searchResults) setShowDropdown(true); }}
                />
                {isSearching && <ActivityIndicator size="small" color="#F97316" />}
              </View>

              {showDropdown && searchResults && (
                <View className="absolute top-12 right-0 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-96 z-50">
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {searchResults.projects.length > 0 && (
                      <View className="p-2 border-b border-gray-100">
                        <Text className="text-xs font-bold text-gray-500 uppercase px-2 py-1">Projects</Text>
                        {searchResults.projects.map((p) => (
                          <Pressable key={p.id} onPress={() => handleResultClick('project', p.id)} className="px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors">
                            <Text className="text-sm font-semibold text-brand-text">{p.name}</Text>
                            <Text className="text-xs text-gray-500">{p.location}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {searchResults.workers.length > 0 && (
                      <View className="p-2 border-b border-gray-100">
                        <Text className="text-xs font-bold text-gray-500 uppercase px-2 py-1">Workers</Text>
                        {searchResults.workers.map((w) => (
                          <Pressable key={w.id} onPress={() => handleResultClick('worker', w.id)} className="px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors">
                            <Text className="text-sm font-semibold text-brand-text">{w.name}</Text>
                            <Text className="text-xs text-gray-500">{w.trade}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {searchResults.materials.length > 0 && (
                      <View className="p-2">
                        <Text className="text-xs font-bold text-gray-500 uppercase px-2 py-1">Materials</Text>
                        {searchResults.materials.map((m) => (
                          <Pressable key={m.id} onPress={() => handleResultClick('material', m.id)} className="px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors">
                            <Text className="text-sm font-semibold text-brand-text">{m.item_name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {searchResults.projects.length === 0 && searchResults.workers.length === 0 && searchResults.materials.length === 0 && (
                      <View className="p-4 items-center">
                        <Text className="text-gray-500">No results found</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Bell Icon */}
          <Pressable 
            onPress={() => setShowNotifications(true)}
            className={`w-10 h-10 rounded-full border items-center justify-center relative transition-colors ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
          >
            <Ionicons name="notifications-outline" size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-orange rounded-full border border-white items-center justify-center">
                <Text className="text-[10px] text-white font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          {/* Action Button */}
          {showAction && (
            <Pressable onPress={onActionPress}>
              <LinearGradient
                colors={['#F97316', '#EA580C']}
                className="px-4 py-2 rounded-lg shadow-sm"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text className="text-white text-sm font-semibold">{actionLabel}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <NotificationPanel 
        visible={showNotifications} 
        onClose={() => setShowNotifications(false)} 
      />
    </View>
  );
};
