import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function AdminProjectsList() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchProjects = async () => {
      try {
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
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
        <TopNav title="Projects" actionLabel="+ New Project" onActionPress={() => router.push('/admin/projects/create')} />
        
        <ScrollView className="flex-1 px-8 py-6" showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-brand-text">All Projects</Text>
            
            <View className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2 w-64 shadow-sm">
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
          
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Project Name</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Location</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Budget</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : projects.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text className="text-gray-400 text-lg font-medium">No projects found.</Text>
              </View>
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
                    <Link href={`/admin/projects/${p.id}` as any} asChild>
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
