import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

export default function AdminAttendanceIndex() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [globalStats, setGlobalStats] = useState({ totalWorkers: 0, checkedIn: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchSites = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch projects
        let query = supabase.from('projects').select('id, name, location, status');
        if (search) query = query.ilike('name', `%${search}%`);
        
        const { data: projData, error: projErr } = await query;
        if (projErr) throw projErr;
        
        // Fetch today's attendance to show quick stats per site
        const { data: attData, error: attErr } = await supabase
          .from('labour')
          .select('id, project_id, status')
          .eq('date', today);
          
        const { count: totalWorkers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker');
          
        if (attErr) throw attErr;

        if (isMounted) {
          const enrichedProjects = (projData || []).map((p: any) => {
            const siteAttendance = (attData || []).filter((a: any) => a.project_id === p.id);
            return {
              ...p,
              checkedInToday: siteAttendance.filter((a: any) => a.status === 'Present').length
            };
          });
          
          setProjects(enrichedProjects);
          setGlobalStats({
            totalWorkers: totalWorkers || 0,
            checkedIn: (attData || []).filter((a: any) => a.status === 'Present').length
          });
        }
      } catch (err) {
        console.error('Error fetching sites for attendance', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchSites();
    return () => { isMounted = false; };
  }, [search]);

  return (
    <View className="flex-1 flex-col bg-gray-50 h-screen overflow-hidden">
      <TopNav title="Site Attendance" />
      
      <ScrollView className="flex-1 px-8 py-6" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/admin/labour')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Labour</Text>
        </Pressable>

        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-2xl font-bold text-brand-text mb-1">Select Construction Site</Text>
            <Text className="text-gray-500 text-sm">Choose a project to view and manage worker attendance.</Text>
          </View>
          
          <View className="flex-row items-center gap-4">
            <View className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100 flex-row items-center">
              <Ionicons name="people" size={20} color="#4F46E5" />
              <Text className="text-indigo-700 font-bold ml-2">{globalStats.checkedIn} / {globalStats.totalWorkers} Checked In Today</Text>
            </View>

            <View className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2 w-64 shadow-sm">
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search sites..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-6">
          {loading ? (
            <View className="w-full py-20 items-center justify-center">
              <ActivityIndicator color="#4F46E5" />
            </View>
          ) : projects.length === 0 ? (
            <View className="w-full py-20 items-center justify-center bg-white rounded-xl border border-gray-100">
              <Ionicons name="business-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium">No active sites found.</Text>
            </View>
          ) : (
            projects.map(p => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/admin/attendance/${p.id}`)}
                className="w-80 bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <View className="flex-row justify-between items-start mb-4">
                  <View className="w-12 h-12 bg-indigo-50 rounded-xl items-center justify-center">
                    <Ionicons name="calendar-outline" size={24} color="#4F46E5" />
                  </View>
                  <View className="bg-gray-100 px-2 py-1 rounded flex-row items-center">
                    <Ionicons name="time" size={12} color="#6B7280" />
                    <Text className="text-[10px] font-bold text-gray-500 ml-1">Today: {format(new Date(), 'MMM dd')}</Text>
                  </View>
                </View>
                
                <Text className="text-lg font-bold text-brand-text mb-1 group-hover:text-indigo-600 transition-colors">
                  {p.name}
                </Text>
                <View className="flex-row items-center mb-4">
                  <Ionicons name="location-outline" size={14} color="#9CA3AF" />
                  <Text className="text-gray-500 text-sm ml-1 truncate">{p.location || 'Location Not Set'}</Text>
                </View>

                <View className="flex-row items-center justify-between border-t border-gray-50 pt-4">
                  <Text className="text-gray-500 text-sm font-semibold">{p.checkedInToday} Checked In</Text>
                  <Text className="text-indigo-600 font-semibold text-sm">View Logs →</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}
