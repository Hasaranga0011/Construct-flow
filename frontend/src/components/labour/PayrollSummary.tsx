import { getApiUrl } from '../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

const PayrollRow = ({ name, role, total }: { name: string, role: string, total: number }) => (
  <View className="flex-row justify-between items-center py-2 border-b border-gray-50">
    <View className="w-2/3">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">{name}</Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs">{role}</Text>
    </View>
    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">
      {total >= 1000 ? `Rs. ${(total/1000).toFixed(1)}K` : `Rs. ${total.toFixed(0)}`}
    </Text>
  </View>
);

export const PayrollSummary = ({ refreshTrigger = 0, pmId }: { refreshTrigger?: number, pmId?: string }) => {
  const router = useRouter();
  const [data, setData] = useState<{name: string, role: string, total: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadPayroll = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const today = new Date().toISOString().split('T')[0];

        // Fetch attendance from backend API
        const response = await fetch(`${getApiUrl()}/labour/payroll`, {
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch payroll data');
        }

        const attendance = await response.json();

        if (attendance) {
          // Filter by pmId if provided (the backend could ideally do this, but doing it here for now)
          // The backend payroll response might need to include pm_id if we want to filter on frontend,
          // but since this is an admin dashboard, we can just show all for now or filter if the backend provides it.
          const payrolls = attendance.map((a: any) => {
            const dailyRate = a.daily_rate || 3500;
            const hourlyRate = dailyRate / 8;

            const hours = Number(a.total_hours) || 0;
            const baseHours = Math.min(hours, 8 * a.days_present);
            const overtimeHours = Math.max(0, hours - (8 * a.days_present));

            const basePay = baseHours * hourlyRate;
            const overtimePay = overtimeHours * hourlyRate * 1.5;
            const total = basePay + overtimePay;

            return {
              name: a.worker_name || 'Unknown',
              role: a.role || 'Worker',
              total
            };
          });

          if (isMounted) {
            const activePayrolls = payrolls.filter((p: any) => p.total > 0).sort((a: any, b: any) => b.total - a.total);
            setData(activePayrolls);
          }
        }
      } catch (error) {
        console.warn('Failed to load payroll data:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPayroll();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const totalAmount = data.reduce((sum, item) => sum + item.total, 0);

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `Rs. ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `Rs. ${(val / 1000).toFixed(1)}K`;
    return `Rs. ${val}`;
  };

  const handleApprove = () => {
    if (totalAmount === 0) {
      Alert.alert("No Payroll", "There are no workers checked in today to approve payroll for.");
    } else {
      router.push('/admin/payroll/generate');
    }
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Payroll Summary</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">Estimated daily wages by worker</Text>
      </View>

      <View className="mb-2 min-h-[100px]">
        {loading ? (
          <ActivityIndicator color="#F97316" className="mt-4" />
        ) : data.length === 0 || totalAmount === 0 ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-4 text-center">No active workers today.</Text>
        ) : (
          data.slice(0, 4).map((d, i) => (
            <PayrollRow key={i} name={d.name} role={d.role} total={d.total} />
          ))
        )}
      </View>

      <View className="flex-row justify-between items-center py-3 border-t border-gray-200 mb-4 mt-auto">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">Total Pending</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">{formatCurrency(totalAmount)}</Text>
      </View>

      <Pressable style={{ minHeight: 44, minWidth: 44 }}
        onPress={handleApprove}
        className="bg-brand-orange w-full py-3 rounded-lg items-center justify-center hover:bg-orange-600 transition-colors"
      >
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-semibold text-sm">Generate Salary Slips</Text>
      </Pressable>
    </View>
  );
};
