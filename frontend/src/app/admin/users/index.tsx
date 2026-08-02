import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function AdminUsersList() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // @ts-ignore
    const sub = supabase.channel('profiles-changes')
      // @ts-ignore
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
         setRefreshTrigger(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub as any); };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      try {
        let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
        
        if (search) {
          query = query.ilike('full_name', `%${search}%`);
        }
        
        if (roleFilter !== 'All') {
          query = query.eq('role', roleFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (isMounted) setUsers(data || []);
      } catch (err) {
        console.error('Error fetching users', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchUsers();
    return () => { isMounted = false; };
  }, [search, roleFilter, refreshTrigger]);

  const roles = ['All', 'admin', 'pm', 'site_manager', 'client', 'supplier', 'worker'];
  
  const formatRoleDisplay = (role: string) => {
    if (role === 'All') return 'All';
    if (role === 'admin') return 'Admin';
    if (role === 'pm') return 'Project Manager';
    if (role === 'site_manager') return 'Site Manager';
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col h-screen overflow-hidden">
        <TopNav title="Users Directory" actionLabel="+ New User" onActionPress={() => router.push('/admin/users/create')} />
        
        <ScrollView className="flex-1 px-8 py-6" showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-brand-text">All Users</Text>
            
            <View className="flex-row gap-4">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row border border-gray-200 rounded-lg bg-white">
                {roles.map(role => (
                  <Pressable 
                    key={role}
                    onPress={() => setRoleFilter(role)}
                    className={`px-4 py-2 border-r border-gray-100 ${roleFilter === role ? 'bg-brand-orange' : 'hover:bg-gray-50'}`}
                  >
                    <Text className={`font-semibold text-xs ${roleFilter === role ? 'text-white' : 'text-gray-500'}`}>{formatRoleDisplay(role)}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2 w-64 shadow-sm">
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput 
                  className="flex-1 ml-2 text-sm text-brand-text outline-none"
                  placeholder="Search by name..."
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            </View>
          </View>
          
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Name</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Role</Text>
              <Text className="w-[25%] text-xs font-semibold text-gray-500 uppercase">Contact/Email</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : users.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text className="text-gray-400 text-lg font-medium">No users found.</Text>
              </View>
            ) : (
              users.map(u => (
                <View key={u.id} className="flex-row items-center py-4 border-b border-gray-100">
                  <View className="w-[30%] flex-row items-center pr-4">
                    <View className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3">
                      <Text className="text-indigo-600 font-bold text-xs">{u.full_name?.charAt(0) || '?'}</Text>
                    </View>
                    <View>
                      <Text className="text-brand-text font-semibold text-sm truncate">{u.full_name || 'Unnamed User'}</Text>
                      <Text className="text-gray-400 text-[10px]">ID: {u.id.slice(0, 8)}...</Text>
                    </View>
                  </View>
                  
                  <View className="w-[20%] pr-2">
                    <View className="bg-gray-100 px-2 py-1 rounded self-start">
                      <Text className="text-gray-600 text-xs font-bold">{formatRoleDisplay(u.role)}</Text>
                    </View>
                  </View>
                  
                  <View className="w-[25%]">
                    <Text className="text-gray-500 text-xs truncate">{u.email || u.phone || 'Database Linked'}</Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <Text className="text-green-500 text-xs font-bold">Active</Text>
                  </View>
                  
                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable 
                      // @ts-ignore
                      onPress={() => router.push(`/admin/users/${u.id}`)} 
                      className="bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200"
                    >
                      <Text className="text-brand-text text-xs font-semibold">Manage</Text>
                    </Pressable>
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
