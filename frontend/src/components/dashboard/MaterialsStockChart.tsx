import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { NativeDataChart } from '../common/NativeDataChart';
import { Ionicons } from '@expo/vector-icons';

export const MaterialsStockChart = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const { data: matData, error } = await supabase
        .from('materials')
        .select('current_stock, minimum_threshold');

      if (error) throw error;
      
      let healthy = 0;
      let lowStock = 0;
      let outOfStock = 0;

      (matData || []).forEach(m => {
        const qty = m.current_stock || 0;
        const threshold = m.minimum_threshold || 1;
        if (qty === 0) {
          outOfStock++;
        } else if (qty < threshold) {
          lowStock++;
        } else {
          healthy++;
        }
      });

      setData([
        { name: 'Healthy', value: healthy, fill: '#10B981', status: 'healthy' }, // brand-success
        { name: 'Low Stock', value: lowStock, fill: '#F59E0B', status: 'low' }, // brand-warning
        { name: 'Out of Stock', value: outOfStock, fill: '#EF4444', status: 'out' } // brand-danger
      ].filter(d => d.value > 0)); // Don't show empty slices

    } catch (err) {
      console.warn('MaterialsStockChart failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('msc-materials')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <ActivityIndicator color="#F97316" size="large" />
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <Ionicons name="pie-chart-outline" size={48} color="#D1D5DB" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2">No material data available.</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Materials Stock Health</Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mb-2">Global inventory status across all items</Text>

      <View className="flex-1 min-h-[200px]">
        {/* @ts-ignore */}
        <NativeDataChart data={data} labelKey="name" series={[{ key: 'value', label: 'Materials', color: '#F97316' }]} />
      </View>
    </View>
  );
};
