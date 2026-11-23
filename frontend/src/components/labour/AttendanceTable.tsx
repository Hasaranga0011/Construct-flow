import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader, TableSortControl } from '@/components/common/SortableHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { supabase } from '../../lib/supabase';
import { useTableLayout } from '@/hooks/useTableLayout';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RoleAvatar } from '../common/RoleAvatar';
import { formatHoursMinutes } from '@/utils/format';
import { api } from '@/services/api';

const AttendanceRow = ({
  name,
  role,
  project,
  checkIn,
  hours,
  status,
  isMobile,
}: {
  name: string,
  role: string,
  project: string,
  checkIn: string,
  hours: string | number,
  status: 'Present' | 'Absent' | 'On Leave'
  isMobile:boolean;
}) => {

  if (isMobile) {

    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <RoleAvatar
            name={name}
            role="worker"
            size="md"
            showBadge={true}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 15, fontWeight: '700', color: '#111827' }]}>
              {name}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 12, color: '#6B7280' }]}>
              {role}
            </Text>
          </View>
          <StatusBadge status={status} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, color: '#6B7280' }]}>{project}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="log-in-outline" size={14} color="#6B7280" />
              <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, color: '#6B7280' }]}>{checkIn}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, color: '#6B7280' }]}>{formatHoursMinutes(hours)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Worker Name & Role */}
      <View className="w-1/4 flex-row items-center gap-3">
        <RoleAvatar
          name={name}
          role="worker"
          size="sm"
          showBadge={false}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm" numberOfLines={1}>{name}</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs" numberOfLines={1}>{role}</Text>
        </View>
      </View>

      {/* Project/Site */}
      <View className="w-1/4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm">{project}</Text>
      </View>

      {/* Check-in Time */}
      <View className="w-1/6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">{checkIn}</Text>
      </View>

      {/* Hours Worked */}
      <View className="w-1/6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-medium">{formatHoursMinutes(hours)}</Text>
      </View>

      {/* Status Badge */}
      <View className="flex-1 flex-row justify-end">
        <StatusBadge status={status} />
      </View>
    </View>
  );
};

export const AttendanceTable = ({ refreshTrigger = 0, searchQuery = '', pmId }: { refreshTrigger?: number, searchQuery?: string, pmId?: string }) => {
  const { isCompact:isMobile, onLayout } = useTableLayout(900);
  const tableSort = useTableSort({"Worker":r=>r.worker_name,"Project / Site":r=>r.project?.name,"Check-in":r=>r.check_in_time,"Hours":r=>r.hours_worked,"Status":r=>r.status});
  const [labour, setLabour] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadLabour = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const data = await api.getFresh('/labour/');
        if (isMounted) setLabour((data || []).filter((row:any)=>row.date===today).map((row:any)=>({...row,project:{name:[row.project_name,row.site_name].filter(Boolean).join(' · ') || 'Site not recorded'}})));
      } catch (error) {
        console.warn('Failed to load attendance:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadLabour();

    return () => { isMounted = false; };
  }, [refreshTrigger, pmId]);

  const filteredLabour = labour.filter(item => {
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    const workerName = item.worker_name?.toLowerCase() || '';
    const projectName = item.project?.name?.toLowerCase() || '';
    return workerName.includes(s) || projectName.includes(s);
  });


  return (
    <View onLayout={onLayout} className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 ${isMobile ? '' : 'flex-1 min-h-[400px]'}`}>
      <TableSortControl sort={tableSort}/>
      <View className="mb-6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Worker Attendance</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">Daily check-in status across sites</Text>
      </View>

      {/* Table Header */}
      {!isMobile && (
        <View className="flex-row py-3 border-b border-gray-200">
          <SortableHeader sort={tableSort} column="Worker" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/4 text-xs font-semibold text-gray-500 uppercase">Worker</SortableHeader>
          <SortableHeader sort={tableSort} column="Project / Site" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/4 text-xs font-semibold text-gray-500 uppercase">Project / Site</SortableHeader>
          <SortableHeader sort={tableSort} column="Check-in" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Check-in</SortableHeader>
          <SortableHeader sort={tableSort} column="Hours" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Hours</SortableHeader>
          <SortableHeader sort={tableSort} column="Status" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-1/6 text-xs font-semibold text-gray-500 uppercase text-right pr-2">Status</SortableHeader>
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filteredLabour.length === 0 ? (
            <View className="py-10 items-center">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No workers found.</Text>
            </View>
          ) : (
            tableSort.sort(filteredLabour).map(l => {
              const pName = l.project?.name || 'Unknown Site';

              // Format check-in time
              let checkInFormatted = '--:--';
              if (l.check_in_time) {
                const dt = new Date(l.check_in_time);
                const hh = String(dt.getHours()).padStart(2, '0');
                const mm = String(dt.getMinutes()).padStart(2, '0');
                checkInFormatted = `${hh}:${mm}`;
              } else if (l.status === 'Absent' || l.status === 'On Leave') {
                checkInFormatted = l.status;
              }

              return (
                <AttendanceRow isMobile={isMobile}
                  key={l.id}
                  name={l.worker_name || 'Unknown'}
                  role={l.role || 'Worker'}
                  project={pName}
                  checkIn={checkInFormatted}
                  hours={l.hours_worked || 0}
                  status={l.status as any}
                />
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
};
