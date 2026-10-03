import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

const AlertRow = ({ title, project, date }: { title: string, project: string, date: string }) => {
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      <View className="w-11 h-11 rounded-full bg-red-100 items-center justify-center mr-3">
        <FontAwesome5 name="exclamation-triangle" size={14} color="#EF4444" />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-brand-danger font-bold text-sm mb-0.5" numberOfLines={1}>{title}</Text>
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{project}</Text>
      </View>
      <Text className="text-red-400 text-xs font-bold">{date}</Text>
    </View>
  );
};

export const SupplierAlertsPanel = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const checkLateOrders = async () => {
      try {
        // Trigger the backend to check and generate notifications if needed
        await api.purchaseOrders.checkLate();

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch orders that are late
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id, po_number, expected_date,
            projects!inner(name)
          `)
          .in('status', ['Pending Delivery', 'Confirmed'])
          .lt('expected_date', today)
          .order('expected_date', { ascending: true })
          .limit(5);

        if (error) throw error;
        
        if (isMounted) setAlerts(data || []);
      } catch (error) {
        console.warn('Failed to load supplier alerts:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    checkLateOrders();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-red-100">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-lg font-bold text-brand-text">Late Deliveries</Text>
          <Text className="text-brand-text-muted text-xs">Orders past expected date</Text>
        </View>
        <View className="bg-red-100 px-2 py-1 rounded-full">
          <Text className="text-brand-danger font-bold text-xs">{alerts.length}</Text>
        </View>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#EF4444" />
        ) : alerts.length === 0 ? (
          <View className="py-4 items-center">
            <FontAwesome5 name="check-circle" size={24} color="#10B981" className="mb-2" />
            <Text className="text-green-600 font-semibold text-sm mt-2">All deliveries on track!</Text>
          </View>
        ) : (
          alerts.map(alert => (
            <AlertRow 
              key={alert.id}
              title={`PO ${alert.po_number} Overdue`} 
              project={alert.projects?.name || 'Unknown Project'} 
              date={alert.expected_date} 
            />
          ))
        )}
      </View>
    </View>
  );
};
