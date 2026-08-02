import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Modal, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

const SuggestModal = ({ visible, order, onClose, onSubmit }: any) => {
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (order) {
      setQty(order.quantity_ordered?.toString() || '');
      setDate(order.expected_date || '');
      setNotes('');
    }
  }, [order]);

  if (!visible || !order) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/50 justify-center items-center p-4">
        <View className="bg-white rounded-2xl w-full max-w-md p-6">
          <Text className="text-xl font-bold text-brand-text mb-4">Counter-Offer Suggestion</Text>
          <Text className="text-gray-500 mb-4 text-sm">Propose a different quantity or delivery date for PO {order.po_number}.</Text>

          <Text className="font-semibold text-gray-700 mb-1">Suggested Quantity</Text>
          <TextInput 
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
          />

          <Text className="font-semibold text-gray-700 mb-1">Suggested Date (YYYY-MM-DD)</Text>
          <TextInput 
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            value={date}
            onChangeText={setDate}
          />

          <Text className="font-semibold text-gray-700 mb-1">Notes to Admin</Text>
          <TextInput 
            className="border border-gray-300 rounded-lg p-3 mb-6 text-brand-text h-20"
            multiline
            value={notes}
            onChangeText={setNotes}
          />

          <View className="flex-row justify-end space-x-3">
            <Pressable onPress={onClose} className="px-4 py-2">
              <Text className="text-gray-500 font-bold">Cancel</Text>
            </Pressable>
            <Pressable 
              onPress={() => onSubmit(order.id, parseFloat(qty), date, notes)} 
              className="bg-brand-warning px-6 py-2 rounded-lg"
            >
              <Text className="text-white font-bold">Submit Suggestion</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const OrderRow = ({ order, onApprove, onReject, onSuggestClick }: any) => {
  const projectName = order.projects?.name || 'Unknown Project';
  const isPending = order.status === 'Pending Delivery';
  const isConfirmed = order.status === 'Confirmed';
  const isRejected = order.status === 'Rejected';
  const isSuggested = order.status === 'Suggested';
  
  const getStatusColor = () => {
    if (isPending) return 'bg-orange-100 text-brand-warning';
    if (isConfirmed) return 'bg-blue-100 text-blue-600';
    if (isRejected) return 'bg-red-100 text-red-600';
    if (isSuggested) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-600';
  };

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      <View className="w-[15%] pr-2">
        <Text className="text-brand-text font-bold text-sm truncate" numberOfLines={1}>{order.po_number}</Text>
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{projectName}</Text>
      </View>

      <View className="w-[20%] pr-2">
        <Text className="text-brand-text text-sm" numberOfLines={2}>
          {order.items || `Material ID: ${order.material_id}`}
        </Text>
        {isSuggested && order.supplier_notes && (
          <Text className="text-yellow-600 text-xs italic mt-1" numberOfLines={1}>Note: {order.supplier_notes}</Text>
        )}
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text className="text-brand-text text-sm font-medium line-through text-gray-400">{order.quantity_ordered}</Text>
        ) : (
           <Text className="text-brand-text text-sm font-medium">{order.quantity_ordered}</Text>
        )}
        {isSuggested && (
           <Text className="text-yellow-700 text-sm font-bold">{order.suggested_quantity}</Text>
        )}
        <Text className="text-gray-400 text-xs truncate">Total: Rs. {order.total_price}</Text>
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text className="text-brand-text text-sm font-medium line-through text-gray-400">{order.expected_date}</Text>
        ) : (
           <Text className="text-brand-text text-sm font-medium">{order.expected_date}</Text>
        )}
        {isSuggested && (
           <Text className="text-yellow-700 text-sm font-bold">{order.suggested_date}</Text>
        )}
      </View>

      <View className="w-[12%]">
        <View className={`px-2 py-1 rounded self-start ${getStatusColor().split(' ')[0]}`}>
          <Text className={`text-xs font-semibold ${getStatusColor().split(' ')[1]}`}>
            {order.status}
          </Text>
        </View>
      </View>

      <View className="flex-1 flex-row justify-end pl-1">
        {isPending ? (
          <View className="flex-row items-center space-x-1.5">
            <Pressable onPress={() => onApprove(order.id)} className="bg-green-500 px-2 py-1.5 rounded shadow-sm">
              <Text className="text-white text-[11px] font-bold">Approve</Text>
            </Pressable>
            <Pressable onPress={() => onSuggestClick(order)} className="bg-yellow-500 px-2 py-1.5 rounded shadow-sm">
              <Text className="text-white text-[11px] font-bold">Suggest</Text>
            </Pressable>
            <Pressable onPress={() => onReject(order.id)} className="bg-red-500 px-2 py-1.5 rounded shadow-sm">
              <Text className="text-white text-[11px] font-bold">Reject</Text>
            </Pressable>
          </View>
        ) : (
          <Text className="text-gray-400 text-xs text-right pr-2">No Action</Text>
        )}
      </View>
    </View>
  );
};

export const SupplierOrdersTable = ({ refreshTrigger = 0, onOrderAction }: { refreshTrigger?: number, onOrderAction: () => void }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadOrders = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id, po_number, items, material_id, quantity_ordered, total_price, expected_date, status,
            suggested_quantity, suggested_date, supplier_notes,
            projects!inner(name)
          `)
          .in('status', ['Pending Delivery', 'Confirmed', 'Rejected', 'Suggested'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (isMounted) setOrders(data || []);
      } catch (error) {
        console.warn('Failed to load supplier orders:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadOrders();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleApprove = async (id: string) => {
    try {
      setLoading(true);
      await api.purchaseOrders.approve(id);
      onOrderAction();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to approve order');
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setLoading(true);
      await api.purchaseOrders.reject(id);
      onOrderAction();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to reject order');
      setLoading(false);
    }
  };

  const handleSuggestSubmit = async (id: string, qty: number, date: string, notes: string) => {
    try {
      setLoading(true);
      setSuggestModalVisible(false);
      await api.purchaseOrders.suggest(id, {
        suggested_quantity: qty,
        suggested_date: date,
        supplier_notes: notes
      });
      onOrderAction();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to submit suggestion');
      setLoading(false);
    }
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[500px]">
      <View className="mb-6">
        <Text className="text-lg font-bold text-brand-text mb-1">Incoming Purchase Orders</Text>
        <Text className="text-brand-text-muted text-xs">Manage and approve material requests</Text>
      </View>

      <View className="flex-row py-3 border-b border-gray-200 pr-2">
        <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">PO / Project</Text>
        <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Items</Text>
        <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Quantity / Cost</Text>
        <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Expected By</Text>
        <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
        <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : orders.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text className="text-gray-400">No active purchase orders found.</Text>
          </View>
        ) : (
          orders.map(order => (
            <OrderRow 
              key={order.id}
              order={order} 
              onApprove={handleApprove}
              onReject={handleReject}
              onSuggestClick={(o: any) => { setSelectedOrder(o); setSuggestModalVisible(true); }}
            />
          ))
        )}
      </ScrollView>

      <SuggestModal 
        visible={suggestModalVisible}
        order={selectedOrder}
        onClose={() => setSuggestModalVisible(false)}
        onSubmit={handleSuggestSubmit}
      />
    </View>
  );
};
