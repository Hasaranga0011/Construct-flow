import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { AttendanceTable } from '@/components/labour/AttendanceTable';
import { supabase } from '@/lib/supabase';

export default function AdminAttendanceProjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [sites, setSites] = useState<{ id: string; address: string | null }[]>([]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    supabase.from('sites').select('id,address').eq('project_id', id).then(({ data }) => {
      if (active) setSites((data || []) as { id: string; address: string | null }[]);
    });
    return () => { active = false; };
  }, [id]);

  return (
    <View className="flex-1 flex-col bg-gray-50 min-h-0 overflow-hidden">
      <TopNav title="Project Attendance Logs" showAction={false} />
      
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 md:px-8 py-6" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.back()} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Sites</Text>
        </Pressable>
        
        {sites.length > 0 && <View className="mb-6 min-w-0">
          <Text maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-3">Attendance sites</Text>
          {sites.map((site, index) => <Pressable key={site.id} accessibilityRole="button" onPress={() => router.push(`/admin/attendance/sites/${site.id}` as any)} className="min-h-[44px] rounded-lg bg-white border border-gray-200 p-4 mb-2">
            <Text maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold">{site.address || `Site ${index + 1}`}</Text>
          </Pressable>)}
        </View>}
        <View className="flex-1 min-h-[200px]">
          <AttendanceTable pmId={id} />
        </View>
      </ScrollView>
    </View>
  );
}
