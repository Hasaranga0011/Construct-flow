import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { SearchInput } from '@/components/common/SearchInput';

import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';

import { ProjectImage } from '@/components/common/ProjectImage';
import { RoleAvatar } from '@/components/common/RoleAvatar';

export default function AdminProjectsList() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const { isMobile } = useResponsive();

  useEffect(() => {
    let isMounted = true;
    const fetchProjects = async () => {
      try {
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Collect unique user IDs for PMs and Clients
          const userIds = new Set<string>();
          data.forEach(p => {
            if (p.pm_id) userIds.add(p.pm_id);
            if (p.client_id) userIds.add(p.client_id);
          });
          
          if (userIds.size > 0) {
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url, role')
              .in('id', Array.from(userIds));
              
            if (profilesData) {
              const profileMap = Object.fromEntries(profilesData.map(p => [p.id, p]));
              data.forEach((p: any) => {
                if (p.pm_id && profileMap[p.pm_id]) {
                  p.pm_name = profileMap[p.pm_id].full_name;
                  p.pm_avatar = profileMap[p.pm_id].avatar_url;
                }
                if (p.client_id && profileMap[p.client_id]) {
                  p.client_name = profileMap[p.client_id].full_name;
                  p.client_avatar = profileMap[p.client_id].avatar_url;
                }
              });
            }
          }
        }
        
        if (isMounted) setProjects(data || []);
      } catch (err) {
        console.error('Error fetching projects', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchProjects();

    const channel = supabase
      .channel('admin-projects-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return { bg: 'bg-[#DCFCE7]', text: 'text-brand-success' };
    if (s === 'archived') return { bg: 'bg-amber-100', text: 'text-amber-800' };
    if (s === 'completed') return { bg: 'bg-blue-100', text: 'text-blue-600' };
    return { bg: 'bg-gray-100', text: 'text-gray-500' };
  };

  const activeCount = projects.filter(p => String(p.status || '').toLowerCase() !== 'archived').length;
  const archivedCount = projects.filter(p => String(p.status || '').toLowerCase() === 'archived').length;

  const filteredRows = projects.filter(row => {
    const matchesSearch = String(row.name || '').toLowerCase().includes(search.toLowerCase()) || 
      String(row.location || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    const rowStatus = String(row.status || '').toLowerCase();
    if (statusFilter === 'active') return rowStatus !== 'archived';
    if (statusFilter === 'archived') return rowStatus === 'archived';
    return true;
  });

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col min-h-0 overflow-hidden">
        <TopNav title="Projects" actionLabel="+ New Project" onActionPress={() => router.push('/admin/projects/create')} />
        
        <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6'}`} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Projects</Text>
            
            <SearchInput items={projects} entityLabel="projects" 
              placeholder="Search projects..." 
              value={search} 
              onChangeText={setSearch} 
              className={isMobile ? "w-full" : "w-80"}
              config={{
                table: 'projects',
                searchColumn: 'name',
                secondaryColumn: 'location',
                titleColumn: 'name',
                subtitleColumn: 'location',
                routePrefix: '/admin/projects/'
              }}
            />
          </View>

          {/* Status Filter Tabs */}
          <View className="flex-row items-center flex-wrap gap-2 mb-6">
            <Pressable
              style={{ minHeight: 36, minWidth: 44 }}
              onPress={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg border ${statusFilter === 'all' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${statusFilter === 'all' ? 'text-brand-orange' : 'text-gray-600'}`}>
                All ({projects.length})
              </Text>
            </Pressable>
            <Pressable
              style={{ minHeight: 36, minWidth: 44 }}
              onPress={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg border ${statusFilter === 'active' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${statusFilter === 'active' ? 'text-emerald-700' : 'text-gray-600'}`}>
                Active ({activeCount})
              </Text>
            </Pressable>
            <Pressable
              style={{ minHeight: 36, minWidth: 44 }}
              onPress={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 rounded-lg border ${statusFilter === 'archived' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${statusFilter === 'archived' ? 'text-amber-800' : 'text-gray-600'}`}>
                Archived ({archivedCount})
              </Text>
            </Pressable>
          </View>
          
          <View className={`bg-white shadow-sm border border-gray-100 min-h-[400px] ${isMobile ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-xl p-6'}`}>
            {!isMobile && (
              <View className="flex-row py-3 border-b border-gray-200 pr-2">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[25%] text-xs font-semibold text-gray-500 uppercase">Project Name</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Location</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Personnel</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Budget</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
              </View>
            )}

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : filteredRows.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No projects found.</Text>
              </View>
            ) : isMobile ? (
              filteredRows.map(p => (
                <View key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm overflow-hidden">
                  <ProjectImage
                    project={p}
                    className="w-full h-36 rounded-lg mb-3"
                    showBadge
                    badgeText={p.status}
                    badgeVariant={['active', 'in progress'].includes(String(p.status).toLowerCase()) ? 'active' : 'default'}
                  />
                  <View className="mb-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">{p.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">{formatMoney(p.total_budget)}</Text>
                  </View>
                  <View className="flex-row items-center mb-3">
                    <Ionicons name="location-outline" size={14} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs ml-1 flex-1">{p.location || 'N/A'}</Text>
                  </View>
                  <View className="flex-row items-center justify-between mb-4 pt-2 border-t border-gray-100">
                    <View className="flex-row items-center gap-1.5 flex-1 pr-1">
                      <RoleAvatar size="xs" avatarUrl={p.pm_avatar} role="pm" name={p.pm_name} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 font-medium">{p.pm_name || 'No PM'}</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5 flex-1 pl-1 justify-end">
                      <RoleAvatar size="xs" avatarUrl={p.client_avatar} role="client" name={p.client_name} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 font-medium">{p.client_name || 'No Client'}</Text>
                    </View>
                  </View>
                  <Link href={`/admin/projects/${p.id}` as any} asChild>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }} className="bg-brand-orange py-3 rounded-lg items-center">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-sm font-bold">View Details</Text>
                    </Pressable>
                  </Link>
                </View>
              ))
            ) : (
              filteredRows.map(p => (
                <View key={p.id} className="flex-row items-center py-3.5 border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  <View className="w-[25%] flex-row items-center pr-4">
                    <ProjectImage
                      project={p}
                      className="w-12 h-12 rounded-lg mr-3 shadow-sm shrink-0"
                    />
                    <View className="flex-1 min-w-0">
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm">{p.name}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">ID: {p.id.slice(0, 8)}...</Text>
                    </View>
                  </View>
                  
                  <View className="w-[15%] pr-2">
                    <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">{p.location || 'N/A'}</Text>
                  </View>

                  <View className="w-[15%] pr-2 flex-col justify-center gap-1">
                    <View className="flex-row items-center gap-1.5">
                      <RoleAvatar size="xs" avatarUrl={p.pm_avatar} role="pm" name={p.pm_name} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-700 font-medium">{p.pm_name || 'Unassigned'}</Text>
                    </View>
                    {p.client_name ? (
                      <View className="flex-row items-center gap-1.5">
                        <RoleAvatar size="xs" avatarUrl={p.client_avatar} role="client" name={p.client_name} />
                        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">{p.client_name}</Text>
                      </View>
                    ) : null}
                  </View>
                  
                  <View className="w-[15%]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-semibold">
                      {p.total_budget != null ? formatMoney(p.total_budget) : 'TBD'}
                    </Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <View className={`px-2.5 py-1 rounded-full self-start ${getStatusBadge(p.status).bg}`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold uppercase ${getStatusBadge(p.status).text}`}>
                        {p.status}
                      </Text>
                    </View>
                  </View>
                
                <View className="flex-1 flex-row justify-end space-x-2 pl-1">
                  <Link href={`/admin/projects/${p.id}` as any} asChild>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }} className="bg-brand-orange px-3.5 py-2 rounded-lg shadow-sm active:opacity-80">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">View Details</Text>
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
