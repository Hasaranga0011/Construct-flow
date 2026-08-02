import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

const AttendanceRow = ({ 
  name, 
  role, 
  project, 
  checkIn, 
  hours, 
  status 
}: { 
  name: string, 
  role: string, 
  project: string, 
  checkIn: string, 
  hours: string | number, 
  status: 'Present' | 'Absent' | 'On Leave' 
}) => {
  
  let statusBadgeColor = '';
  let statusTextColor = '';

  switch (status) {
    case 'Present':
      statusBadgeColor = 'bg-[#DCFCE7]';
      statusTextColor = 'text-brand-success';
      break;
    case 'Absent':
      statusBadgeColor = 'bg-[#FEE2E2]';
      statusTextColor = 'text-brand-danger';
      break;
    case 'On Leave':
      statusBadgeColor = 'bg-[#FEF9C3]'; // yellow-100
      statusTextColor = 'text-[#A16207]'; // yellow-700
      break;
  }
  
  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Worker Name & Role */}
      <View className="w-1/4">
        <Text className="text-brand-text font-semibold text-sm">{name}</Text>
        <Text className="text-gray-500 text-xs">{role}</Text>
      </View>

      {/* Project/Site */}
      <View className="w-1/4">
        <Text className="text-brand-text text-sm">{project}</Text>
      </View>

      {/* Check-in Time */}
      <View className="w-1/6">
        <Text className="text-gray-600 text-sm">{checkIn}</Text>
      </View>

      {/* Hours Worked */}
      <View className="w-1/6">
        <Text className="text-brand-text text-sm font-medium">{hours}</Text>
      </View>

      {/* Status Badge */}
      <View className="w-1/6 items-end pr-2">
        <View className={`px-2 py-1 rounded ${statusBadgeColor}`}>
          <Text className={`text-xs font-semibold ${statusTextColor}`}>
            {status}
          </Text>
        </View>
      </View>
    </View>
  );
};

export const AttendanceTable = ({ refreshTrigger = 0, searchQuery = '', pmId }: { refreshTrigger?: number, searchQuery?: string, pmId?: string }) => {
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

        const today = new Date().toISOString().split('T')[0];

        // Fetch attendance for today from labour table
        let query = supabase
          .from('labour')
          .select(`
            id, check_in_time, hours_worked, status, worker_name, role,
            project:projects!inner(name, pm_id)
          `)
          .eq('date', today)
          .order('check_in_time', { ascending: false });

        if (pmId) {
          query = query.eq('project.pm_id', pmId);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        if (isMounted) setLabour(data || []);
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
  const formatTime = (isoString: string) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[400px]">
      <View className="mb-6">
        <Text className="text-lg font-bold text-brand-text mb-1">Worker Attendance</Text>
        <Text className="text-brand-text-muted text-xs">Daily check-in status across sites</Text>
      </View>

      {/* Table Header */}
      <View className="flex-row py-3 border-b border-gray-200">
        <Text className="w-1/4 text-xs font-semibold text-gray-500 uppercase">Worker</Text>
        <Text className="w-1/4 text-xs font-semibold text-gray-500 uppercase">Project / Site</Text>
        <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Check-in</Text>
        <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase">Hours</Text>
        <Text className="w-1/6 text-xs font-semibold text-gray-500 uppercase text-right pr-2">Status</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {filteredLabour.length === 0 ? (
            <View className="py-10 items-center">
              <Text className="text-gray-400">No workers found.</Text>
            </View>
          ) : (
            filteredLabour.map(l => {
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
                <AttendanceRow 
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
