// Modified for Expo Go mobile compatibility
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

export default function WorkerDashboard() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [totalDays, setTotalDays] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        const userId = sessionData.session.user.id;

        const profileReq = await supabase.from('profiles').select('*').eq('id', userId).single();
        let attendanceData: any[] = [];
        let countRes = 0;

        if (userId) {
          const [recentReq, countReq] = await Promise.all([
            supabase
              .from('labour')
              .select('*, projects(name)')
              .eq('worker_id', userId)
              .eq('status', 'Present')
              .order('date', { ascending: false })
              .limit(7),
            supabase
              .from('labour')
              .select('id', { count: 'exact', head: true })
              .eq('worker_id', userId)
              .eq('status', 'Present')
          ]);
          attendanceData = recentReq.data || [];
          countRes = countReq.count || 0;
        }

        if (isMounted) {
          setProfile(profileReq.data);
          setRecentAttendance(attendanceData);
          setTotalDays(countRes);
        }
      } catch (error) {
        console.error('Worker dashboard error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="My Dashboard" showAction={false} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-4 md:p-6 lg:p-8" showsVerticalScrollIndicator={false}>

          {/* Profile Header */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8 mb-6 flex-col sm:flex-row items-center">
            <View className="w-16 h-16 bg-brand-orange rounded-full items-center justify-center mb-4 sm:mb-0 sm:mr-6">
              <Text className="text-white text-3xl font-bold">
                {(profile?.full_name || 'W').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-gray-800">{profile?.full_name || 'Worker'}</Text>
              <Text className="text-gray-500 capitalize mt-1">{profile?.role?.replace('_', ' ') || 'Worker'}</Text>
            </View>
            <View className="items-center bg-orange-50 border border-orange-200 px-4 py-2 rounded-xl">
              <Text className="text-3xl font-bold text-brand-orange">{totalDays}</Text>
              <Text className="text-xs text-orange-600 font-semibold">Days Present</Text>
            </View>
          </View>

          {/* Worker QR Code */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6 items-center">
            <Text className="text-lg font-bold text-gray-800 mb-2">Your Worker ID Card</Text>
            <Text className="text-gray-500 text-sm text-center mb-6">Show this QR code to your Site Manager to be scanned in.</Text>

            {profile?.qr_code ? (
              <View className="border-4 border-gray-800 p-3 rounded-xl mb-4 bg-white">
                <QRCode value={profile.qr_code} size={160} color="black" backgroundColor="white" />
              </View>
            ) : (
              <View className="w-44 h-44 border border-dashed border-gray-300 rounded-xl items-center justify-center mb-4">
                <Ionicons name="qr-code-outline" size={48} color="#D1D5DB" />
                <Text className="text-gray-400 text-xs text-center mt-2 px-4">QR code has not been assigned yet.</Text>
              </View>
            )}

            <Text className="text-brand-text font-bold text-base">Worker ID</Text>
            <Text className="text-gray-400 text-xs mt-1 font-mono">{profile?.id?.slice(0, 20)}...</Text>
          </View>

          {/* Recent Attendance */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <View className="p-6 border-b border-gray-100">
              <Text className="text-lg font-bold text-gray-800">Recent Check-Ins</Text>
            </View>
            {recentAttendance.length === 0 ? (
              <View className="p-10 items-center justify-center">
                <Ionicons name="calendar-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4">No attendance recorded yet.</Text>
              </View>
            ) : (
              recentAttendance.map((record, i) => (
                <View key={record.id} className={`flex-row items-center p-5 ${i < recentAttendance.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <View className="w-9 h-9 bg-green-100 rounded-full items-center justify-center mr-4">
                    <Ionicons name="checkmark" size={18} color="#22C55E" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-800">{record.projects?.name || 'Unknown Project'}</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">{new Date(record.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <View className="bg-green-100 px-2.5 py-1 rounded-full">
                    <Text className="text-green-600 font-bold text-xs">Present</Text>
                  </View>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}
