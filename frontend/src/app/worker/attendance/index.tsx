// Modified for Expo Go mobile compatibility
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export default function WorkerAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ present: 0, absent: 0, total: 0 });
  const [workerQr, setWorkerQr] = useState<string>('');
  const qrRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchAttendance = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        const userId = sessionData.session.user.id;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, qr_code')
          .eq('id', userId)
          .single();

        const name = profileData?.full_name;
        if (!name) {
          if (isMounted) setLoading(false);
          return;
        }
        
        if (isMounted) setWorkerQr(profileData?.qr_code || name || '');

        const { data, error } = await supabase
          .from('labour')
          .select('*, projects(name)')
          .eq('worker_name', name)
          .order('date', { ascending: false });

        if (error) throw error;

        if (isMounted && data) {
          setRecords(data);
          setStats({
            present: data.filter(r => r.status === 'Present').length,
            absent: data.filter(r => r.status === 'Absent').length,
            total: data.length,
          });
        }
      } catch (error) {
        console.error('Worker attendance error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAttendance();
    return () => { isMounted = false; };
  }, []);

  const handleShareQR = async () => {
    try {
      if (!qrRef.current || !workerQr) return;
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'QR sharing is not available on this device.');
        return;
      }
      qrRef.current.toDataURL(async (data: string) => {
        const fileUri = `${FileSystem.cacheDirectory}constructflow-worker-qr.png`;
        await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle: 'Share worker QR code' });
      });
    } catch (error: any) {
      Alert.alert('QR sharing failed', error.message || 'Unable to share the QR code.');
    }
  };
  const getStatusStyle = (status: string) => {
    if (status === 'Present') return { bg: 'bg-green-100', text: 'text-green-700', icon: 'checkmark-circle' as const };
    if (status === 'Absent') return { bg: 'bg-red-100', text: 'text-red-700', icon: 'close-circle' as const };
    return { bg: 'bg-gray-100', text: 'text-gray-500', icon: 'help-circle' as const };
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-light" edges={['top']}>
      <TopNav title="My Attendance & QR" showAction={false} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          
          {/* QR Code Section */}
          <View className="bg-white rounded-2xl p-8 mb-8 shadow-sm border border-gray-100 items-center">
            <Text className="text-lg font-bold text-gray-800 mb-6 text-center">Your Check-In QR</Text>
            
            <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              {workerQr ? (
                <QRCode
                  getRef={(c) => (qrRef.current = c)}
                  value={workerQr}
                  size={250}
                  color="black"
                  backgroundColor="white"
                />
              ) : (
                <View style={{ width: 250, height: 250, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" />
                </View>
              )}
            </View>

            <Pressable 
              onPress={handleShareQR}
              className="mt-6 flex-row items-center bg-brand-orange px-6 py-3 rounded-full hover:bg-orange-600 transition-colors"
            >
              <Ionicons name="share-outline" size={20} color="white" />
              <Text className="text-white font-bold ml-2">Share QR Code</Text>
            </Pressable>
          </View>

          {/* Summary Cards */}
          <View className="flex-row flex-wrap gap-3 md:gap-4 mb-8">
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 items-center">
              <Text className="text-3xl font-bold text-green-600">{stats.present}</Text>
              <Text className="text-gray-500 text-xs mt-1 font-semibold text-center">Present</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 items-center">
              <Text className="text-3xl font-bold text-red-500">{stats.absent}</Text>
              <Text className="text-gray-500 text-xs mt-1 font-semibold text-center">Absent</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 items-center">
              <Text className="text-3xl font-bold text-brand-orange">
                {stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%
              </Text>
              <Text className="text-gray-500 text-xs mt-1 font-semibold text-center">Rate</Text>
            </View>
          </View>

          {/* History Table */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-10">
            <View className="flex-row py-4 px-4 bg-gray-50 border-b border-gray-100">
              <Text className="flex-1 text-[10px] font-bold text-gray-500 uppercase">Date</Text>
              <Text className="w-24 text-[10px] font-bold text-gray-500 uppercase text-right">Status</Text>
            </View>

            {records.length === 0 ? (
              <View className="p-8 items-center justify-center">
                <Ionicons name="calendar-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4 text-center">No attendance records found.</Text>
              </View>
            ) : (
              records.map((record, i) => {
                const style = getStatusStyle(record.status);
                return (
                  <View key={record.id} className={`flex-row items-center py-4 px-4 ${i < records.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800 text-sm">
                        {new Date(record.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </Text>
                      <Text className="text-gray-400 text-[10px] mt-0.5 truncate" numberOfLines={1}>
                        {record.projects?.name || 'Unknown Project'}
                      </Text>
                    </View>
                    <View className={`flex-row items-center ${style.bg} px-2 py-1 rounded-full w-24 justify-center`}>
                      <Ionicons name={style.icon} size={12} color={style.text.includes('green') ? '#16A34A' : style.text.includes('red') ? '#DC2626' : '#6B7280'} />
                      <Text className={`${style.text} font-bold text-[10px] ml-1`}>{record.status}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
