import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../../hooks/useResponsive';

export default function AdminStockLevels() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    let isMounted = true;
    const fetchStock = async () => {
      try {
        let query = supabase.from('materials').select(`
          *,
          project:projects(name)
        `).order('last_updated', { ascending: false });
        
        const { data, error } = await query;
        if (error) throw error;
        
        let filteredData = data || [];
        
        if (statusFilter !== 'All') {
          filteredData = filteredData.filter(m => {
            const currentStock = m.current_stock || 0;
            const minThreshold = m.minimum_threshold || 1;
            let calcStatus = 'In Stock';
            if (currentStock === 0) calcStatus = 'Out of Stock';
            else if (currentStock < minThreshold) calcStatus = 'Low Stock';
            return calcStatus === statusFilter;
          });
        }

        if (search) {
          filteredData = filteredData.filter(m => 
            m.name?.toLowerCase().includes(search.toLowerCase()) || 
            m.project?.name?.toLowerCase().includes(search.toLowerCase())
          );
        }
        
        if (isMounted) setMaterials(filteredData);
      } catch (err: any) {
        if (Platform.OS === 'web') console.error('Error fetching stock', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchStock();
    return () => { isMounted = false; };
  }, [search, statusFilter]);

  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-700';
      case 'Low Stock': return 'bg-yellow-100 text-yellow-700';
      case 'Out of Stock': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav 
        title="Materials Inventory" 
        actionLabel="+ New Order" 
        onActionPress={() => router.push('/admin/materials/orders/create')} 
      />
      
      <ScrollView className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/admin/materials')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Dashboard</Text>
        </Pressable>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
          <Text className="text-2xl font-bold text-brand-text">Site Inventory</Text>
          
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, width: isMobile ? '100%' : 'auto' }}>
            <View className="flex-row border border-gray-200 rounded-lg overflow-hidden bg-white">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {statuses.map(s => (
                  <Pressable 
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    className={`px-4 py-2 ${statusFilter === s ? 'bg-brand-orange' : 'hover:bg-gray-50'}`}
                  >
                    <Text className={`font-semibold text-xs ${statusFilter === s ? 'text-white' : 'text-gray-500'}`}>{s}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search material or site..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
        </View>

        <View style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {!isMobile && (
            <View className="flex-row items-center bg-gray-50 py-4 border-b border-gray-200">
              <View className="w-[25%] px-6"><Text className="text-xs font-bold text-gray-500 uppercase">Material Name</Text></View>
              <View className="w-[25%]"><Text className="text-xs font-bold text-gray-500 uppercase">Project Site</Text></View>
              <View className="w-[15%]"><Text className="text-xs font-bold text-gray-500 uppercase">Quantity</Text></View>
              <View className="w-[20%]"><Text className="text-xs font-bold text-gray-500 uppercase">Stock Level</Text></View>
              <View className="w-[15%] pr-6"><Text className="text-xs font-bold text-gray-500 uppercase text-right">Status</Text></View>
            </View>
          )}

          {/* Table Body */}
          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : materials.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="layers-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium">No materials found.</Text>
            </View>
          ) : (
            materials.map(m => {
              const currentStock = m.current_stock || 0;
              const minThreshold = m.minimum_threshold || 1;
              const pct = Math.min(100, Math.round((currentStock / minThreshold) * 100));
              let calcStatus = 'In Stock';
              if (currentStock === 0) calcStatus = 'Out of Stock';
              else if (currentStock < minThreshold) calcStatus = 'Low Stock';

              return isMobile ? (
                <View key={m.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 16 }}>{m.name || 'Unnamed Material'}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>Project: {m.project?.name || 'Unassigned Site'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View className={`px-2 py-1 rounded ${getStatusColor(calcStatus)}`}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>{calcStatus}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Quantity</Text>
                      <Text style={{ color: '#374151', fontWeight: 'bold', fontSize: 14 }}>{currentStock} {m.unit || 'units'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', width: '40%' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Stock Level: {pct}%</Text>
                      <View style={{ width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                        <View 
                          style={{ height: '100%', width: `${pct}%`, backgroundColor: pct < 25 ? '#EF4444' : pct < 50 ? '#FACC15' : '#22C55E' }} 
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View key={m.id} className="flex-row items-center py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <View className="w-[25%] px-6">
                    <Text className="text-brand-text font-bold text-sm truncate">{m.name || 'Unnamed Material'}</Text>
                    <Text className="text-gray-400 text-[10px]">Updated: {format(new Date(m.last_updated), 'MMM dd, yyyy')}</Text>
                  </View>
                  
                  <View className="w-[25%] pr-2">
                    <Text className="text-gray-600 text-sm truncate font-medium">{m.project?.name || 'Unassigned Site'}</Text>
                  </View>
  
                  <View className="w-[15%] pr-2">
                    <Text className="text-gray-800 text-sm font-bold">{currentStock} {m.unit || 'units'}</Text>
                  </View>
                  
                  <View className="w-[20%] pr-4">
                    <View className="flex-row items-center">
                      <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-3">
                        <View 
                          className={`h-full ${pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-yellow-400' : 'bg-green-500'}`} 
                          style={{ width: `${pct}%` }}
                        />
                      </View>
                      <Text className="text-gray-600 text-xs font-bold w-8 text-right">{pct}%</Text>
                    </View>
                  </View>
                  
                  <View className="w-[15%] pr-6 items-end">
                    <View className={`px-2 py-1 rounded ${getStatusColor(calcStatus)}`}>
                      <Text className="text-[10px] font-bold uppercase">{calcStatus}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
