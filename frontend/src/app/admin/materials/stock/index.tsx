import { useTableRealtime } from '@/hooks/useTableRealtime';
import { SearchInput } from '@/components/common/SearchInput';
import { firstRelation } from '@/utils/relations';
import { ModalViewport } from '@/components/common/ModalViewport';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Modal } from 'react-native';
import { useResponsive } from '../../../../hooks/useResponsive';
import { FilterChipGrid } from '@/components/common/FilterChipGrid';

export default function AdminStockLevels() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tick } = useTableRealtime(['materials']);
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    let isMounted = true;
    const fetchStock = async () => {
      try {
        let query = supabase.from('materials').select(`
          id, name, unit, current_stock, minimum_threshold, last_updated, project_id,
          project:projects(name)
        `).order('last_updated', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        let filteredData = (data || []).map(material => ({ ...material, project: firstRelation(material.project) }));

        if (isMounted) setMaterials(filteredData);
      } catch (err: any) {
        if (Platform.OS === 'web') console.error('Error fetching stock', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStock();
    return () => { isMounted = false; };
  }, [loading, tick]); // Refresh after assignment; typing only filters loaded rows.

  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-700';
      case 'Low Stock': return 'bg-yellow-100 text-yellow-700';
      case 'Out of Stock': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (assignModalVisible) {
      supabase.from('projects').select('id, name').eq('status', 'active').then(({ data }) => {
        if (data) setProjects(data);
      });
    }
  }, [assignModalVisible]);

  const handleAssign = async (projectId: string) => {
    if (!selectedMaterialId) return;
    try {
      await supabase.from('materials').update({ project_id: projectId }).eq('id', selectedMaterialId);
      setAssignModalVisible(false);
      setLoading(true); // Trigger a refresh
    } catch (e) {
      console.error(e);
    }
  };

  let filteredData = materials;
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


  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav
        title="Materials Inventory"
        actionLabel="+ New Order"
        onActionPress={() => router.push('/admin/materials/orders/create')}
      />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/materials')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Dashboard</Text>
        </Pressable>

        <View style={{ flexDirection: 'column', marginBottom: 24, gap: 16, zIndex: 50 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Site Inventory</Text>

          <SearchInput placeholder="Search material or site..." value={search} onChangeText={setSearch}
            mode="filter" entityLabel="materials"
            getLocalResults={query => materials.filter(m => `${m.name || ''} ${m.project?.name || ''}`.toLowerCase().includes(query.toLowerCase()))
              .map(m => ({ id: m.id, title: m.name, subtitle: m.project?.name }))} />

          <FilterChipGrid
            options={statuses.map(s => ({ id: s, label: s }))}
            selectedValue={statusFilter}
            onSelect={setStatusFilter}
          />
        </View>

        <View style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {!isMobile && (
            <View className="flex-row items-center bg-gray-50 py-4 border-b border-gray-200">
              <View className="w-[25%] px-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase">Material Name</Text></View>
              <View className="w-[25%]"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase">Project Site</Text></View>
              <View className="w-[15%]"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase">Quantity</Text></View>
              <View className="w-[20%]"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase">Stock Level</Text></View>
              <View className="w-[15%] pr-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase text-right">Status</Text></View>
            </View>
          )}

          {/* Table Body */}
          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : filteredData.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="layers-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No materials found.</Text>
            </View>
          ) : (
            filteredData.map(m => {
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
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16 }]}>{m.name || 'Unnamed Material'}</Text>
                      {m.project_id ? (
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>Project: {m.project?.name}</Text>
                      ) : (
                        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => { setSelectedMaterialId(m.id); setAssignModalVisible(true); }} className="bg-brand-orange/10 self-start px-2 py-1 rounded mt-1">
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold">Assign to Project</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View className={`px-2 py-1 rounded ${getStatusColor(calcStatus)}`}>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }]}>{calcStatus}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Quantity</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#374151', fontWeight: 'bold', fontSize: 14 }]}>{currentStock} {m.unit || 'units'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', width: '40%' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Stock Level: {pct}%</Text>
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
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{m.name || 'Unnamed Material'}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">Updated: {m.last_updated && Number.isFinite(new Date(m.last_updated).getTime()) ? format(new Date(m.last_updated), 'MMM dd, yyyy') : 'Not recorded'}</Text>
                  </View>

                  <View className="w-[25%] pr-2">
                    {m.project_id ? (
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm truncate font-medium">{m.project?.name}</Text>
                    ) : (
                      <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => { setSelectedMaterialId(m.id); setAssignModalVisible(true); }} className="bg-brand-orange/10 px-3 py-1.5 rounded-lg self-start">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold">Assign</Text>
                      </Pressable>
                    )}
                  </View>

                  <View className="w-[15%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 text-sm font-bold">{currentStock} {m.unit || 'units'}</Text>
                  </View>

                  <View className="w-[20%] pr-4">
                    <View className="flex-row items-center">
                      <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-3">
                        <View
                          className={`h-full ${pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-yellow-400' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-bold w-8 text-right">{pct}%</Text>
                    </View>
                  </View>

                  <View className="w-[15%] pr-6 items-end">
                    <View className={`px-2 py-1 rounded ${getStatusColor(calcStatus)}`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold uppercase">{calcStatus}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-md max-h-full">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-4">Assign Material to Project</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4 text-sm">Select an active project to assign this material to.</Text>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {projects.map(p => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={p.id}
                  onPress={() => handleAssign(p.id)}
                  className="py-3 px-4 border-b border-gray-100 hover:bg-gray-50 flex-row justify-between items-center"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold">{p.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </Pressable>
              ))}
              {projects.length === 0 && (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-center py-4">No active projects found.</Text>
              )}
            </ScrollView>

            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setAssignModalVisible(false)} className="mt-4 py-3 bg-gray-100 rounded-lg items-center">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-bold">Cancel</Text>
            </Pressable>
          </ScrollView>
        </ModalViewport>
      </Modal>

    </View>
  );
}
