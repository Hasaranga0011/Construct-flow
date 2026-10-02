import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../services/api';
import { useRouter } from 'expo-router';

type ReportState = { total: number; data: any[] };

export default function AdminReportsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ReportState>({ total: 0, data: [] });
  const [materials, setMaterials] = useState<ReportState>({ total: 0, data: [] });
  const [payroll, setPayroll] = useState<ReportState>({ total: 0, data: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadReports = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const [projectReport, materialReport, payrollReport] = await Promise.all([
          api.reports.projects(),
          api.reports.materials(),
          api.reports.payroll(),
        ]);
        if (isMounted) {
          setProjects(projectReport);
          setMaterials(materialReport);
          setPayroll(payrollReport);
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load reports.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadReports();
    return () => { isMounted = false; };
  }, [retryKey]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Admin Reports" showAction={false} />
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-bold text-brand-text mb-2">Operational Reports</Text>
        <Text className="text-gray-500 mb-6">Live summaries from projects, materials, and payroll.</Text>
        {loading ? (
          <View className="gap-4"><View className="bg-gray-100 rounded-2xl h-28 animate-pulse" /><View className="bg-gray-100 rounded-2xl h-28 animate-pulse" /><View className="bg-gray-100 rounded-2xl h-28 animate-pulse" /></View>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center"><Text className="text-red-700 text-center">{error}</Text><Pressable onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text className="text-white font-bold">Retry</Text></Pressable></View>
        ) : (
          <View className="gap-4">
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-orange-50 items-center justify-center mr-4">
                    <Ionicons name="business-outline" size={22} color="#F97316" />
                  </View>
                  <View>
                    <Text className="text-gray-500 text-xs font-semibold uppercase">Projects</Text>
                    <Text className="text-3xl font-bold text-brand-text mt-1">{projects.total}</Text>
                  </View>
                </View>
                <Pressable onPress={() => router.push('/admin/reports/projects')} className="bg-brand-orange px-4 py-2 rounded-lg">
                  <Text className="text-white font-semibold">View Report</Text>
                </Pressable>
              </View>
              {projects.data.length === 0 && <Text className="text-gray-400 mt-4">No project records available.</Text>}
            </View>

            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-blue-50 items-center justify-center mr-4">
                    <Ionicons name="cube-outline" size={22} color="#3B82F6" />
                  </View>
                  <View>
                    <Text className="text-gray-500 text-xs font-semibold uppercase">Materials</Text>
                    <Text className="text-3xl font-bold text-brand-text mt-1">{materials.total}</Text>
                  </View>
                </View>
                <Pressable onPress={() => router.push('/admin/reports/materials')} className="bg-brand-orange px-4 py-2 rounded-lg">
                  <Text className="text-white font-semibold">View Report</Text>
                </Pressable>
              </View>
              {materials.data.length === 0 && <Text className="text-gray-400 mt-4">No material records available.</Text>}
            </View>

            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-green-50 items-center justify-center mr-4">
                    <Ionicons name="cash-outline" size={22} color="#22C55E" />
                  </View>
                  <View>
                    <Text className="text-gray-500 text-xs font-semibold uppercase">Salary slips</Text>
                    <Text className="text-3xl font-bold text-brand-text mt-1">{payroll.total}</Text>
                  </View>
                </View>
                <Pressable onPress={() => router.push('/admin/reports/payroll')} className="bg-brand-orange px-4 py-2 rounded-lg">
                  <Text className="text-white font-semibold">View Report</Text>
                </Pressable>
              </View>
              {payroll.data.length === 0 && <Text className="text-gray-400 mt-4">No payroll records available.</Text>}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
