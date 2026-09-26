import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';

export default function PMProjectsList() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    let isMounted = true;
    const fetchProjects = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        let query = supabase.from('projects').select('*').eq('pm_id', user.id).order('created_at', { ascending: false });
        if (search) {
          query = query.ilike('name', `%${search}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (isMounted) setProjects(data || []);
      } catch (err) {
        console.error('Error fetching projects', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchProjects();
    return () => { isMounted = false; };
  }, [search]);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col h-screen overflow-hidden">
        <TopNav title="My Projects" showAction={false} />
        
        <ScrollView className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6'}`} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
            <Text className="text-2xl font-bold text-brand-text">Assigned Projects</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search projects..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
          
          <View className={`bg-white shadow-sm border border-gray-100 min-h-[400px] ${isMobile ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-xl p-6'}`}>
            {!isMobile && (
              <View className="flex-row py-3 border-b border-gray-200 pr-2">
                <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Project Name</Text>
                <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Location</Text>
                <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Budget</Text>
                <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
              </View>
            )}

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : projects.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text className="text-gray-400 text-lg font-medium">No assigned projects found.</Text>
              </View>
            ) : isMobile ? (
              projects.map(p => (
                <View key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                  <View className="flex-row items-center mb-3">
                    <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
                      <Text className="text-brand-orange font-bold text-lg">{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-brand-text font-bold text-base" numberOfLines={1}>{p.name}</Text>
                      <Text className="text-gray-500 text-xs font-medium">{formatMoney(p.total_budget)}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center mb-4 pl-[52px]">
                    <View className="flex-row items-center flex-1">
                      <Ionicons name="location-outline" size={14} color="#6B7280" />
                      <Text className="text-gray-500 text-xs ml-1" numberOfLines={1}>{p.location || 'N/A'}</Text>
                    </View>
                    <View className={`px-2 py-1 rounded-full ${p.status === 'active' ? 'bg-[#DCFCE7]' : p.status === 'completed' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <Text className={`text-[10px] font-bold uppercase ${p.status === 'active' ? 'text-brand-success' : p.status === 'completed' ? 'text-blue-600' : 'text-gray-500'}`}>
                        {p.status}
                      </Text>
                    </View>
                  </View>
                  <Link href={`/pm/projects/${p.id}` as any} asChild>
                    <Pressable className="bg-brand-orange py-3 rounded-lg items-center">
                      <Text className="text-white text-sm font-bold">View Details</Text>
                    </Pressable>
                  </Link>
                </View>
              ))
            ) : (
              projects.map(p => (
                <View key={p.id} className="flex-row items-center py-4 border-b border-gray-100">
                  <View className="w-[30%] flex-row items-center pr-4">
                    <View className="w-8 h-8 bg-orange-100 rounded items-center justify-center mr-3">
                      <Text className="text-brand-orange font-bold text-xs">{p.name.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text className="text-brand-text font-semibold text-sm truncate">{p.name}</Text>
                      <Text className="text-gray-400 text-[10px]">ID: {p.id.slice(0, 8)}...</Text>
                    </View>
                  </View>
                  
                  <View className="w-[20%] pr-2">
                    <Text className="text-gray-600 text-sm truncate">{p.location || 'N/A'}</Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <Text className="text-brand-text text-sm font-medium">
                      {p.total_budget ? `Rs. ${p.total_budget.toLocaleString()}` : 'TBD'}
                    </Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <View className={`px-2 py-1 rounded self-start ${p.status === 'active' ? 'bg-[#DCFCE7]' : p.status === 'completed' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <Text className={`text-[10px] font-bold uppercase ${p.status === 'active' ? 'text-brand-success' : p.status === 'completed' ? 'text-blue-600' : 'text-gray-500'}`}>
                        {p.status}
                      </Text>
                    </View>
                  </View>
                  
                  <View className="flex-1 flex-row justify-end space-x-2 pl-1">
                    <Link href={`/pm/projects/${p.id}` as any} asChild>
                      <Pressable className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm">
                        <Text className="text-white text-xs font-bold">View Details</Text>
                      </Pressable>
                    </Link>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
