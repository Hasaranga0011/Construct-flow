import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useResponsive } from '../../hooks/useResponsive';

const InventoryRow = ({ 
  material, 
  project, 
  quantity, 
  unit,
  stockLevel, 
  status, 
  time 
}: { 
  material: string, 
  project: string, 
  quantity: string, 
  unit: string,
  stockLevel: number, 
  status: string, 
  time: string 
}) => {
  const { isMobile } = useResponsive();

  const getBarColor = () => {
    if (stockLevel < 30) return 'bg-brand-danger'; // red
    if (stockLevel < 60) return 'bg-brand-warning'; // orange
    return 'bg-brand-dark'; // black
  };

  const getStatusColor = () => {
    if (status === 'Out of Stock') return 'bg-[#FEE2E2] text-brand-danger';
    if (status === 'Low Stock') return 'bg-orange-100 text-brand-warning';
    return 'bg-gray-100 text-gray-600';
  };

  if (isMobile) {
    const getMobileStatusStyle = () => {
      if (status === 'Out of Stock') return { bg: '#FEE2E2', text: '#991B1B' };
      if (status === 'Low Stock') return { bg: '#FEF3C7', text: '#92400E' };
      return { bg: '#D1FAE5', text: '#065F46' };
    };
    const mobileStatus = getMobileStatusStyle();
    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {material}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
            {quantity} {unit}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: '#6B7280', flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            Project: {project}
          </Text>
          <View style={{ backgroundColor: mobileStatus.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: mobileStatus.text, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>
              {status}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const statusStyle = getStatusColor();

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Material Name */}
      <View className="w-1/5">
        <Text className="text-brand-text font-semibold text-sm truncate" numberOfLines={1}>{material}</Text>
      </View>

      {/* Project */}
      <View className="w-1/5 pr-2">
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{project}</Text>
      </View>

      {/* Quantity */}
      <View className="w-1/6">
        <Text className="text-brand-text text-sm font-medium">{quantity} {unit}</Text>
      </View>

      {/* Stock Level Bar */}
      <View className="w-1/6 pr-4">
        <View className="w-full h-1.5 bg-gray-100 rounded-full">
          <View 
            className={`h-full rounded-full ${getBarColor()}`} 
            style={{ width: `${Math.max(0, Math.min(100, stockLevel))}%` }} 
          />
        </View>
        <Text className="text-gray-400 text-[10px] mt-1">{Math.round(stockLevel)}%</Text>
      </View>

      {/* Status */}
      <View className="w-1/6">
        <View className={`px-2 py-1 rounded self-start ${statusStyle.split(' ')[0]}`}>
          <Text className={`text-[10px] font-bold uppercase ${statusStyle.split(' ')[1]}`}>{status}</Text>
        </View>
      </View>

      {/* Time */}
      <View className="flex-1 flex-row justify-end">
        <Text className="text-gray-400 text-xs">{time}</Text>
      </View>
    </View>
  );
};

export const InventoryTable = ({ refreshTrigger = 0, searchQuery = '', projectId = '' }: { refreshTrigger?: number, searchQuery?: string, projectId?: string }) => {
  const { isMobile } = useResponsive();
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadMaterials = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        let query = supabase
          .from('materials')
          .select(`
            id, name, unit, current_stock, minimum_threshold, last_updated, project_id,
            projects!inner(name, status)
          `)
          .order('last_updated', { ascending: false });

        if (projectId) {
          query = query.eq('project_id', projectId);
        } else {
          // Scope to active projects if no specific project is selected
          query = query.eq('projects.status', 'active');
        }

        if (searchQuery) {
          query = query.ilike('name', `%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        if (isMounted) setMaterials(data || []);
      } catch (error) {
        console.warn('Failed to load materials:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadMaterials();
    
    return () => { isMounted = false; };
  }, [refreshTrigger, searchQuery, projectId]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[400px]">
      <View className="mb-6">
        <Text className="text-lg font-bold text-brand-text mb-1">Material Inventory</Text>
        <Text className="text-brand-text-muted text-xs">Stock levels across all active projects</Text>
      </View>

      {/* Table Header */}
      {!isMobile && (
        <View className="flex-row py-3 border-b border-gray-200">
          <Text className="w-1/5 text-xs font-semibold text-gray-500 uppercase">Material Name</Text>
          <Text className="w-1/5 text-xs font-semibold text-gray-500 uppercase">Project ID</Text>
          <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Quantity</Text>
          <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Stock Level</Text>
          <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Status</Text>
          <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase text-right">Last Updated</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : materials.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text className="text-gray-400">No materials found.</Text>
          </View>
        ) : (
          materials.map((m: any) => {
            const projectName = m.projects?.name || 'Unknown';
            
            const globalStock = m.current_stock || 0;
            const threshold = m.minimum_threshold || 1;
            
            const pct = Math.min(100, (globalStock / threshold) * 100);
            
            let badgeStatus = 'In Stock';
            if (globalStock === 0) badgeStatus = 'Out of Stock';
            else if (globalStock < threshold) badgeStatus = 'Low Stock';
            
            return (
              <InventoryRow 
                key={m.id}
                material={m.name} 
                project={projectName} 
                quantity={`${globalStock}`}
                unit={m.unit || ''}
                stockLevel={pct} 
                status={badgeStatus} 
                time={m.last_updated ? new Date(m.last_updated).toLocaleDateString() : 'N/A'} 
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
};
