import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { GlobalSearchDropdown } from '@/components/common/GlobalSearchDropdown';
import { useDebounce } from '@/hooks/useDebounce';
import { useResponsive } from '../../../hooks/useResponsive';

export default function AdminUsersList() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { isMobile } = useResponsive();
  const debouncedSearch = useDebounce(search, 300);

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
        
        if (debouncedSearch) {
          query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
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
  }, [debouncedSearch, roleFilter, refreshTrigger]);

  const roles = ['All', 'admin', 'pm', 'site_manager', 'client', 'supplier', 'worker'];
  
  const formatRoleDisplay = (role: string) => {
    if (role === 'All') return 'All';
    if (role === 'admin') return 'Admin';
    if (role === 'pm') return 'Project Manager';
    if (role === 'site_manager') return 'Site Manager';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getRoleColor = (role: string) => {
    if (role === 'admin') return { bg: 'bg-red-50', text: 'text-red-700' };
    if (role === 'pm') return { bg: 'bg-purple-50', text: 'text-purple-700' };
    if (role === 'site_manager') return { bg: 'bg-blue-50', text: 'text-blue-700' };
    if (role === 'worker') return { bg: 'bg-orange-50', text: 'text-orange-700' };
    if (role === 'client') return { bg: 'bg-emerald-50', text: 'text-emerald-700' };
    if (role === 'supplier') return { bg: 'bg-pink-50', text: 'text-pink-700' };
    return { bg: 'bg-gray-100', text: 'text-gray-700' };
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col h-screen overflow-hidden">
        <TopNav title="Users Directory" actionLabel="+ New User" onActionPress={() => router.push('/admin/users/create')} />
        
        <ScrollView className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6'}`} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 16, zIndex: 50, elevation: 50 }}>
            <Text className="text-2xl font-bold text-brand-text">All Users</Text>
            
            <GlobalSearchDropdown 
              placeholder="Search users..." 
              value={search} 
              onChangeText={setSearch} 
              className={isMobile ? "w-full" : "w-64"}
              config={{
                table: 'profiles',
                searchColumn: 'full_name',
                secondaryColumn: 'email',
                titleColumn: 'full_name',
                subtitleColumn: 'email',
                routePrefix: '/admin/users/'
              }}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className={isMobile ? "pb-2" : "pb-2 max-w-[700px]"} contentContainerStyle={{ gap: 8 }}>
              {roles.map(role => (
                <Pressable 
                  key={role}
                  onPress={() => setRoleFilter(role)}
                  className={`px-4 py-2 rounded-full border ${roleFilter === role ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`font-semibold text-sm ${roleFilter === role ? 'text-white' : 'text-gray-600'}`}>
                    {formatRoleDisplay(role)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          
          <View className={`bg-white shadow-sm border border-gray-100 min-h-[400px] ${isMobile ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-xl p-6'}`}>
            {!isMobile && (
              <View className="flex-row py-3 border-b border-gray-200 pr-2">
                <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">User</Text>
                <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Role</Text>
                <Text className="w-[25%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
                <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
              </View>
            )}

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : users.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text className="text-gray-400 text-lg font-medium">No users found.</Text>
              </View>
            ) : isMobile ? (
              users.map(u => {
                const colors = getRoleColor(u.role);
                return (
                  <View key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                    <View className="flex-row items-center mb-3">
                      <View className="w-11 h-11 rounded-full bg-indigo-50 items-center justify-center mr-3">
                        <Text className="text-indigo-600 font-bold text-lg">{u.full_name?.charAt(0) || '?'}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-brand-text font-bold text-base" numberOfLines={1}>{u.full_name || 'Unnamed User'}</Text>
                        <Text className="text-gray-500 text-xs font-medium">{u.email}</Text>
                      </View>
                      <View className={`px-3 py-1 rounded-full ${colors.bg}`}>
                        <Text className={`text-[10px] font-bold uppercase ${colors.text}`}>
                          {formatRoleDisplay(u.role)}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center mb-4 pl-[52px]">
                      <Ionicons name="call-outline" size={14} color="#6B7280" />
                      <Text className="text-gray-500 text-xs ml-2">{u.phone || 'No phone'}</Text>
                    </View>
                    <Pressable 
                      // @ts-ignore
                      onPress={() => router.push(`/admin/users/${u.id}`)} 
                      className="bg-gray-50 border border-gray-200 py-2.5 rounded-lg items-center"
                    >
                      <Text className="text-gray-700 text-sm font-semibold">Edit User</Text>
                    </Pressable>
                  </View>
                );
              })
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
                    <View className={`px-2 py-1 rounded self-start ${getRoleColor(u.role).bg}`}>
                      <Text className={`text-xs font-bold ${getRoleColor(u.role).text}`}>{formatRoleDisplay(u.role)}</Text>
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
