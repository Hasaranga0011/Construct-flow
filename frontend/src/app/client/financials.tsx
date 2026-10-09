import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function ClientFinancialsScreen() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('client_payment_schedule')
          .select('*')
          .order('due_date', { ascending: true });

        if (error) throw error;
        if (isMounted) setSchedules(data || []);
      } catch (e) {
        console.warn('Failed to fetch payment schedules', e);
        if (isMounted) setSchedules([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchSchedules();

    const channel = supabase
      .channel('client-payment-schedule')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_payment_schedule' }, fetchSchedules)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const formatCurr = (val: number) => `Rs. ${val.toLocaleString()}`;

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Financials & Invoices" showAction={false} />
      
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-8">
        <View className="bg-white/80 rounded-3xl shadow-premium border border-white backdrop-blur-md overflow-hidden p-6">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-6">Payment Schedule</Text>
          
          {loading ? <ActivityIndicator color="#F97316" /> : schedules.length === 0 ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No payment schedules found.</Text> : schedules.map(item => (
            <View key={item.id} className="flex-row items-center justify-between p-6 bg-gray-50 rounded-2xl mb-4 border border-gray-100 hover:bg-gray-100 transition-colors">
              <View className="flex-1 pr-4">
                <View className="flex-row items-center mb-2">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-extrabold text-brand-text text-lg mr-3">{item.description}</Text>
                  <View className={`px-2.5 py-1 rounded-md ${item.status === 'Paid' ? 'bg-green-100' : item.status === 'Overdue' ? 'bg-red-100' : 'bg-orange-100'}`}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${item.status === 'Paid' ? 'text-green-700' : item.status === 'Overdue' ? 'text-red-700' : 'text-orange-700'}`}>{item.status}</Text>
                  </View>
                </View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-400 mt-2">Due: {new Date(item.due_date).toLocaleDateString()}</Text>
              </View>

              <View className="items-end">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-extrabold text-brand-text mb-3">{formatCurr(item.amount)}</Text>
                {item.status === 'Pending' || item.status === 'Overdue' ? (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`${item.status === 'Overdue' ? 'text-red-600' : 'text-orange-600'} text-xs font-semibold`}>Payment pending</Text>
                ) : item.status === 'Paid' ? (
                  <View className="flex-row items-center">
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-600 font-bold ml-1">Paid on {item.paid_at ? new Date(item.paid_at).toLocaleDateString() : 'N/A'}</Text>
                  </View>
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold">Waived</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
