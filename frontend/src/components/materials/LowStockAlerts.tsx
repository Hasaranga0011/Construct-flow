import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const AlertRow = ({ material, project, remaining }: { material: string, project: string, remaining: string }) => {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
      <View>
        <Text className="text-brand-text font-bold text-sm mb-0.5">{material}</Text>
        <Text className="text-gray-500 text-xs">{project}</Text>
      </View>
      <Text className="text-brand-orange font-bold text-sm">{remaining}</Text>
    </View>
  );
};

export const LowStockAlerts = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadAlerts = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('material_requests')
          .select(`
            id, item_name, unit,
            projects(name),
            materials(global_stock_quantity, low_stock_threshold)
          `)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        
        let lowStock = [];
        if (data) {
          lowStock = data.filter((req: any) => {
            const m = Array.isArray(req.materials) ? req.materials[0] : req.materials;
            if (!m) return false;
            return (m.global_stock_quantity || 0) < (m.low_stock_threshold || 1);
          }).slice(0, 5);
        }

        if (isMounted) setAlerts(lowStock);
      } catch (error) {
        console.warn('Failed to load low stock alerts:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadAlerts();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="flex-row items-center mb-4">
        <Ionicons name="warning" size={24} color="#F97316" className="mr-2" />
        <Text className="text-lg font-bold text-brand-text">Low Stock Alerts</Text>
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="py-4 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : alerts.length === 0 ? (
          <View className="py-4 items-center">
            <Text className="text-gray-400 text-sm">No low stock items.</Text>
          </View>
        ) : (
          alerts.map(a => {
            const projectName = a.projects?.name || 'Unknown';
            const m = Array.isArray(a.materials) ? a.materials[0] : a.materials;
            const remaining = m ? `${m.global_stock_quantity} ${a.unit || ''}` : '0';

            return (
              <AlertRow 
                key={a.id} 
                material={a.item_name} 
                project={projectName} 
                remaining={remaining} 
              />
            );
          })
        )}
      </View>
    </View>
  );
};
