import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

export default function AdminMaterialsStockPage() {
  const router = useRouter();
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
        
        if (statusFilter !== 'All') {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        let filteredData = data || [];
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
    <View className="flex-1 flex-col bg-gray-50 h-screen overflow-hidden">
      <TopNav 
        title="Materials Inventory" 
        actionLabel="+ New Order" 
        onActionPress={() => router.push('/admin/materials/orders/create')} 
      />
      
      <ScrollView className="flex-1 px-8 py-6" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/admin/materials')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Dashboard</Text>
        </Pressable>

        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-brand-text">Site Inventory</Text>
          
          <View className="flex-row gap-4">
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

            <View className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2 w-64 shadow-sm">
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

        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-12">
          {/* Table Header */}
          <View className="flex-row items-center bg-gray-50 py-4 border-b border-gray-200">
            <View className="w-[25%] px-6"><Text className="text-xs font-bold text-gray-500 uppercase">Material Name</Text></View>
            <View className="w-[25%]"><Text className="text-xs font-bold text-gray-500 uppercase">Project Site</Text></View>
            <View className="w-[15%]"><Text className="text-xs font-bold text-gray-500 uppercase">Quantity</Text></View>
            <View className="w-[20%]"><Text className="text-xs font-bold text-gray-500 uppercase">Stock Level</Text></View>
            <View className="w-[15%] pr-6"><Text className="text-xs font-bold text-gray-500 uppercase text-right">Status</Text></View>
          </View>

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
            materials.map(m => (
              <View key={m.id} className="flex-row items-center py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <View className="w-[25%] px-6">
                  <Text className="text-brand-text font-bold text-sm truncate">{m.name || 'Unnamed Material'}</Text>
                  <Text className="text-gray-400 text-[10px]">Updated: {format(new Date(m.last_updated), 'MMM dd, yyyy')}</Text>
                </View>
                
                <View className="w-[25%] pr-2">
                  <Text className="text-gray-600 text-sm truncate font-medium">{m.project?.name || 'Unassigned Site'}</Text>
                </View>

                <View className="w-[15%] pr-2">
                  <Text className="text-gray-800 text-sm font-bold">{m.quantity}</Text>
                </View>
                
                <View className="w-[20%] pr-4">
                  <View className="flex-row items-center">
                    <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-3">
                      <View 
                        className={`h-full ${m.stock_level < 25 ? 'bg-red-500' : m.stock_level < 50 ? 'bg-yellow-400' : 'bg-green-500'}`} 
                        style={{ width: `${m.stock_level}%` }}
                      />
                    </View>
                    <Text className="text-gray-600 text-xs font-bold w-8 text-right">{m.stock_level}%</Text>
                  </View>
                </View>
                
                <View className="w-[15%] pr-6 items-end">
                  <View className={`px-2 py-1 rounded ${getStatusColor(m.status)}`}>
                    <Text className="text-[10px] font-bold uppercase">{m.status}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
