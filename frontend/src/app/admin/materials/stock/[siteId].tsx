import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../../lib/supabase';

type Material = {
  id: string;
  name?: string | null;
  item_name?: string | null;
  unit?: string | null;
  current_stock?: number | null;
  minimum_threshold?: number | null;
};

export default function AdminSiteStockPage() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!siteId) return;
    let isMounted = true;

    const loadStock = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('materials')
          .select('*')
          .eq('project_id', siteId)
          .order('name');
        
        if (queryError) throw queryError;
        if (isMounted) setMaterials((data || []) as Material[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load site stock.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStock();

    const channel = supabase.channel(`admin-site-stock:${siteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials', filter: `project_id=eq.${siteId}` }, () => {
        setRefreshTrigger(value => value + 1);
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [siteId, refreshTrigger]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Stock" showAction={false} />
      
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-brand-danger text-center mb-4">{error}</Text>
          <Pressable
            onPress={() => setRefreshTrigger(t => t+1)}
            className="bg-brand-orange px-6 py-3 rounded-lg">
            <Text className="text-white font-semibold">Retry</Text>
          </Pressable>
        </View>
      ) : materials.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="folder-open-outline" size={48} color="#6B7280" />
          <Text className="text-brand-text-muted mt-3 text-center">No records found</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 600 }} className="w-full">
              {/* Table Header */}
              <View className="flex-row items-center bg-gray-50 border-b border-gray-200 py-3 px-4 rounded-t-lg">
                <Text className="flex-[2] text-xs font-semibold text-gray-500 uppercase">Name</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-center">Unit</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-center">Quantity</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-center">Min Qty</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-center">Status</Text>
              </View>

              {/* Table Rows */}
              {materials.map((material) => {
                const current = Number(material.current_stock ?? 0);
                const minimum = Number(material.minimum_threshold ?? 1);
                const isLow = current < minimum;
                
                return (
                  <View 
                    key={material.id} 
                    className={`flex-row items-center border-b border-gray-100 py-4 px-4 ${isLow ? 'bg-red-50' : 'bg-white'}`}
                  >
                    <Text className="flex-[2] text-sm text-brand-text font-medium" numberOfLines={1}>
                      {material.name || material.item_name || 'Unnamed Material'}
                    </Text>
                    <Text className="flex-1 text-sm text-gray-600 text-center">{material.unit || '-'}</Text>
                    <Text className={`flex-1 text-sm text-center font-semibold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                      {current}
                    </Text>
                    <Text className="flex-1 text-sm text-gray-500 text-center">{minimum}</Text>
                    <View className="flex-1 items-center">
                      <View className={`px-2 py-1 rounded-full ${isLow ? 'bg-red-100' : 'bg-green-100'}`}>
                        <Text className={`text-xs font-semibold ${isLow ? 'text-red-700' : 'text-green-700'}`}>
                          {isLow ? 'Low Stock' : 'In Stock'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}
