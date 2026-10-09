import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '../../services/api';

const AlertRow = ({ title, project, location, date }: { title: string, project: string, location?: string, date: string }) => {
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      <View className="w-11 h-11 rounded-full bg-red-100 items-center justify-center mr-3">
        <FontAwesome5 name="exclamation-triangle" size={14} color="#EF4444" />
      </View>
      <View className="flex-1 pr-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-danger font-bold text-sm mb-0.5">{title}</Text>
        <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3}
          onPress={() => {
            if (location) {
              import('react-native').then(({ Alert, Platform }) => {
                if (Platform.OS === 'web') window.alert(location);
                else Alert.alert('Project Location', location);
              });
            }
          }}
          className={`text-gray-500 text-xs ${location ? 'underline cursor-pointer hover:text-brand-orange' : ''}`}

        >
          {project}
        </Text>
      </View>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-400 text-xs font-bold">{date}</Text>
    </View>
  );
};

export const SupplierAlertsPanel = ({ orders, loading = false }: { orders: any[], loading?: boolean }) => {
  // Same definition as the "Late Deliveries" stat card (see isLateOrder in useSupplierOrders).
  const alerts = orders.slice(0, 5);

  useEffect(() => {
    // Ask the backend to generate overdue notifications once per mount; display data is live via props.
    api.purchaseOrders.checkLate().catch(() => {});
  }, []);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-red-100">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Late Deliveries</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">Orders past expected date</Text>
        </View>
        <View className="bg-red-100 px-2 py-1 rounded-full">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-danger font-bold text-xs">{alerts.length}</Text>
        </View>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#EF4444" />
        ) : alerts.length === 0 ? (
          <View className="py-4 items-center">
            <FontAwesome5 name="check-circle" size={24} color="#10B981" className="mb-2" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-600 font-semibold text-sm mt-2">All deliveries on track!</Text>
          </View>
        ) : (
          alerts.map(alert => (
            <AlertRow
              key={alert.id}
              title={`PO ${alert.po_number} Overdue`}
              project={alert.project_name || alert.projects?.name || 'Unknown Project'}
              location={alert.project_location || alert.projects?.location || ''}
              date={alert.expected_date}
            />
          ))
        )}
      </View>
    </View>
  );
};
