import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function ClientFinancialsScreen() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .order('due_date', { ascending: false });

        if (error && error.code !== '42P01') throw error;
        setInvoices(data || []);
      } catch (e) {
        setInvoices([
          { id: 'INV-004', amount: 1500000, description: 'Milestone 4: Roofing Completion', due_date: '2023-11-15', status: 'Unpaid' },
          { id: 'INV-003', amount: 2000000, description: 'Milestone 3: Ground Floor Slabs', due_date: '2023-10-01', status: 'Paid', paid_date: '2023-09-28' },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const handlePay = (id: string) => {
    Alert.alert("Payment Portal", "Simulating secure payment gateway...");
  };

  const formatCurr = (val: number) => `Rs. ${val.toLocaleString()}`;

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Financials & Invoices" showAction={false} />
      
      <ScrollView className="flex-1 p-8">
        <View className="bg-white/80 rounded-3xl shadow-premium border border-white backdrop-blur-md overflow-hidden p-6">
          <Text className="text-xl font-bold text-brand-text mb-6">Payment Schedule</Text>
          
          {loading ? <ActivityIndicator color="#F97316" /> : invoices.map(inv => (
            <View key={inv.id} className="flex-row items-center justify-between p-6 bg-gray-50 rounded-2xl mb-4 border border-gray-100 hover:bg-gray-100 transition-colors">
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <Text className="font-extrabold text-brand-text text-lg mr-3">{inv.id}</Text>
                  <View className={`px-2.5 py-1 rounded-md ${inv.status === 'Paid' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-xs font-bold ${inv.status === 'Paid' ? 'text-green-700' : 'text-red-700'}`}>{inv.status}</Text>
                  </View>
                </View>
                <Text className="text-gray-600 font-semibold">{inv.description}</Text>
                <Text className="text-sm text-gray-400 mt-2">Due: {new Date(inv.due_date).toLocaleDateString()}</Text>
              </View>

              <View className="items-end">
                <Text className="text-2xl font-extrabold text-brand-text mb-3">{formatCurr(inv.amount)}</Text>
                {inv.status === 'Unpaid' ? (
                  <Pressable onPress={() => handlePay(inv.id)} className="bg-brand-primary px-8 py-3 rounded-full hover:-translate-y-1 shadow-md transition-all">
                    <Text className="text-white font-bold tracking-wide">Pay Now</Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center">
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text className="text-green-600 font-bold ml-1">Paid on {inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : 'N/A'}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
