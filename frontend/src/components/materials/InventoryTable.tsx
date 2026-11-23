import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader, TableSortControl } from '@/components/common/SortableHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { supabase } from '../../lib/supabase';
import { useTableLayout } from '@/hooks/useTableLayout';
import { useAuth } from '@/context/AuthContext';

const InventoryRow = ({
  material,
  project,
  quantity,
  unit,
  stockLevel,
  status,
  time,
  isMobile,
}: {
  material: string,
  project: string,
  quantity: string,
  unit: string,
  stockLevel: number,
  status: string,
  time: string
  isMobile:boolean;
}) => {

  const getBarColor = () => {
    if (stockLevel < 30) return 'bg-brand-danger'; // red
    if (stockLevel < 60) return 'bg-brand-warning'; // orange
    return 'bg-brand-dark'; // black
  };


  if (isMobile) {

    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 }]}>
            {material}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, fontWeight: '600', color: '#374151' }]}>
            {quantity} {unit}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, color: '#6B7280', flex: 1 }]}>
            Project: {project}
          </Text>
          <StatusBadge status={status} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Material Name */}
      <View className="w-1/5">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">{material}</Text>
      </View>

      {/* Project */}
      <View className="w-1/5 pr-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{project}</Text>
      </View>

      {/* Quantity */}
      <View className="w-1/6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-medium">{quantity} {unit}</Text>
      </View>

      {/* Stock Level Bar */}
      <View className="w-1/6 pr-4">
        <View className="w-full h-1.5 bg-gray-100 rounded-full">
          <View
            className={`h-full rounded-full ${getBarColor()}`}
            style={{ width: `${Math.max(0, Math.min(100, stockLevel))}%` }}
          />
        </View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] mt-1">{Math.round(stockLevel)}%</Text>
      </View>

      {/* Status */}
      <View className="w-1/6">
        <StatusBadge status={status} />
      </View>

      {/* Time */}
      <View className="flex-1 flex-row justify-end">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs">{time}</Text>
      </View>
    </View>
  );
};

export const InventoryTable = ({ refreshTrigger = 0, searchQuery = '', projectId = '', allowedProjectIds }: { refreshTrigger?: number, searchQuery?: string, projectId?: string, allowedProjectIds?: string[] }) => {
  const { isCompact:isMobile, onLayout } = useTableLayout(900);
  const { user, role } = useAuth();
  const isPM = role === 'pm';
  const tableSort = useTableSort({"Material Name":r=>r.name,"Project ID":r=>r.projects?.name,"Quantity":r=>r.current_stock,"Stock Level":r=>Math.min(100,Number(r.current_stock||0)/Number(r.minimum_threshold||1)*100),"Status":r=>Number(r.current_stock||0)===0?'Out of Stock':Number(r.current_stock)<Number(r.minimum_threshold||1)?'Low Stock':'In Stock',"Last Updated":r=>r.last_updated});
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

        let pmProjectIds: string[] = [];
        if (isPM && user?.id) {
          if (allowedProjectIds) pmProjectIds = allowedProjectIds;
          else {
            const { data: projData, error: projectError } = await supabase.from('projects').select('id').eq('pm_id', user.id);
            if (projectError) throw projectError;
            pmProjectIds = (projData || []).map(p => p.id).filter((id): id is string => Boolean(id));
          }
          if (pmProjectIds.length === 0) {
            if (isMounted) {
              setMaterials([]);
              setLoading(false);
            }
            return;
          }
        }

        let query = supabase
          .from('materials')
          .select(`
            id, name, unit, current_stock, minimum_threshold, last_updated, project_id,
            projects(name, status)
          `)
          .order('last_updated', { ascending: false });

        if (projectId) {
          query = query.eq('project_id', projectId);
        } else if (isPM) {
          query = query.in('project_id', pmProjectIds);
        } else {
          // Scope to active / non-archived projects if no specific project is selected
          query = query.neq('projects.status', 'archived');
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
  }, [refreshTrigger, projectId, isPM, user?.id, allowedProjectIds]);

  const filteredMaterials = materials.filter(m => String(m.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <View onLayout={onLayout} className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 ${isMobile ? '' : 'flex-1 min-h-[400px]'}`}>
      <TableSortControl sort={tableSort}/>
      <View className="mb-6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Material Inventory</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">Stock levels across all active projects</Text>
      </View>

      {/* Table Header */}
      {!isMobile && (
        <View className="flex-row py-3 border-b border-gray-200">
          <SortableHeader sort={tableSort} column="Material Name" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/5 text-xs font-semibold text-gray-500 uppercase">Material Name</SortableHeader>
          <SortableHeader sort={tableSort} column="Project ID" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/5 text-xs font-semibold text-gray-500 uppercase">Project ID</SortableHeader>
          <SortableHeader sort={tableSort} column="Quantity" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Quantity</SortableHeader>
          <SortableHeader sort={tableSort} column="Stock Level" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Stock Level</SortableHeader>
          <SortableHeader sort={tableSort} column="Status" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Status</SortableHeader>
          <SortableHeader sort={tableSort} column="Last Updated" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Last Updated</SortableHeader>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className="flex-1">
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : filteredMaterials.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No materials found.</Text>
          </View>
        ) : (
          tableSort.sort(filteredMaterials).map((m: any) => {
            const projectName = m.projects?.name || 'Unknown';

            const globalStock = m.current_stock || 0;
            const threshold = m.minimum_threshold || 1;

            const pct = Math.min(100, (globalStock / threshold) * 100);

            let badgeStatus = 'In Stock';
            if (globalStock === 0) badgeStatus = 'Out of Stock';
            else if (globalStock < threshold) badgeStatus = 'Low Stock';

            return (
              <InventoryRow isMobile={isMobile}
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
