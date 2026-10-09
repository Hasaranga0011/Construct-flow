import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';


const AlertRow = ({ material, project, remaining }: { material: string, project: string, remaining: string }) => {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
      <View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm mb-0.5">{material}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{project}</Text>
      </View>
      <View className="items-end">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">{remaining}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">In stock</Text>
      </View>
    </View>
  );
};

export const LowStockAlerts = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('materials')
        .select(`
          id, name, unit, current_stock, minimum_threshold,
          projects!inner(name, status)
        `)
        .eq('projects.status', 'active');

      if (error) throw error;
      
      let lowStock: any[] = [];
      if (data) {
        lowStock = data.filter((m: any) => {
          return (m.current_stock || 0) < (m.minimum_threshold || 1);
        }).sort((a: any, b: any) => {
          const pctA = (a.current_stock || 0) / (a.minimum_threshold || 1);
          const pctB = (b.current_stock || 0) / (b.minimum_threshold || 1);
          return pctA - pctB; // lowest percentage first
        }).slice(0, 5);
      }

      setAlerts(lowStock);
    } catch (error) {
      console.warn('Failed to load low stock alerts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts, refreshTrigger]);

  // Realtime: refresh list whenever materials rows change
  useRealtimeStats(loadAlerts);


  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="flex-row items-center mb-4">
        <Ionicons name="warning" size={24} color="#F97316" className="mr-2" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Low Stock Alerts</Text>
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="py-4 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : alerts.length === 0 ? (
          <View className="py-4 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">No low stock items.</Text>
          </View>
        ) : (
            alerts.map(m => {
            const projectName = m.projects?.name || 'Unknown';
            const remaining = `${m.current_stock || 0} ${m.unit || ''}`;

            return (
              <AlertRow 
                key={m.id} 
                material={m.name} 
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
