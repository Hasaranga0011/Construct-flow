import { ModalViewport } from '@/components/common/ModalViewport';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ChatWidget } from '../../../components/shared/ChatWidget';
import { sendSystemNotification } from '../../../utils/notifications';
import { api } from '../../../services/api';
import { Modal, TextInput } from 'react-native';

const SuggestModal = ({ visible, order, onClose, onSubmit }: any) => {
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (order) {
      setQty((order.suggested_quantity || order.quantity_ordered)?.toString() || '');
      setDate(order.suggested_date || order.expected_date || '');
      setPrice(order.suggested_price ? order.suggested_price.toString() : (order.unit_price ? order.unit_price.toString() : ''));
      setNotes('');
    }
  }, [order]);

  if (!visible || !order) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-md max-h-full">
          <Text className="text-xl font-bold text-brand-text mb-4">Counter-Offer</Text>
          <Text className="text-gray-500 mb-4 text-sm">Propose a different quantity, date, or price.</Text>

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

          <Text className="font-semibold text-gray-700 mb-1">Suggested Unit Price (LKR)</Text>
          <TextInput 
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
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
              onPress={() => onSubmit(order.id, parseFloat(qty), date, parseFloat(price), notes)} 
              className="bg-brand-warning px-6 py-2 rounded-lg"
            >
              <Text className="text-white font-bold">Submit Counter</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ModalViewport>
    </Modal>
  );
};

export default function AdminMaterialsOrdersIdPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState('');
  useEffect(() => { supabase.auth.getSession().then(({data}) => setCurrentUserId(data.session?.user.id || '')); }, []);

  const fetchOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          project:projects(name, location)
        `)
        .eq('id', id)
        .single();
        
      if (error) throw error;

      let orderData = data;
      if (!orderData.project && orderData.project_id) {
        try {
           const extra = await api.projects.bulkNames([orderData.project_id]);
           if (extra && extra.length > 0) {
             orderData.project = extra[0];
           }
        } catch (e) {
           console.warn("Failed to fetch project via bulkNames", e);
        }
      }

      setOrder(orderData);
      if (orderData.unit_price) setUnitPrice(orderData.unit_price.toString());
      else setUnitPrice('');
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to fetch order details';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleUpdateStatus = async (newStatus: 'Confirmed' | 'Rejected' | 'Delivered' | 'Received') => {
    // Platform-safe confirm dialog
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Are you sure you want to mark this order as ${newStatus}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Confirm Action',
            `Are you sure you want to mark this order as ${newStatus}?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Yes', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmed) return;

    setActionLoading(true);
    try {
      if (!id) throw new Error('Order id is required');
      if (newStatus === 'Confirmed') {
         if (!unitPrice || parseFloat(unitPrice) <= 0) {
            const msg = 'Please enter a valid unit price before confirming.';
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Error', msg);
            setActionLoading(false);
            return;
         }
         await api.purchaseOrders.approve(id, { unit_price: parseFloat(unitPrice) });
      }
      if (newStatus === 'Rejected') await api.purchaseOrders.reject(id);
      if (newStatus === 'Delivered') await api.purchaseOrders.deliver(id);
      if (newStatus === 'Received') await api.purchaseOrders.receive(id);

      if (Platform.OS === 'web') window.alert(`Order marked as ${newStatus}!`);
      else Alert.alert('Success', `Order marked as ${newStatus}!`);

      // Refresh data
      fetchOrder();
    } catch (err: any) {
      const msg = err.message || 'Failed to update status';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuggestSubmit = async (orderId: string, qty: number, date: string, price: number, notes: string) => {
    try {
      setActionLoading(true);
      setSuggestModalVisible(false);
      await api.purchaseOrders.suggest(orderId, {
        suggested_quantity: qty,
        suggested_date: date,
        suggested_price: price,
        supplier_notes: notes
      });
      fetchOrder();
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to submit suggestion';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setActionLoading(false);
    }
  };


  if (loading) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 bg-brand-light">
        <TopNav title="Order Not Found" showAction={false} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">The requested order could not be found.</Text>
          <Pressable onPress={() => router.back()} className="mt-4 bg-brand-orange px-6 py-2 rounded-lg">
            <Text className="text-white font-bold">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return 'bg-green-100 text-green-700 border-green-200';
      case 'Pending Delivery': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Confirmed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Rejected': case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const isCompleted = order.status === 'Received' || order.status === 'Rejected' || order.status === 'Cancelled';

  // Parse negotiation log
  let negotiationLog: any[] = [];
  try {
    if (order.supplier_notes) {
      const parsed = JSON.parse(order.supplier_notes);
      if (Array.isArray(parsed)) {
        negotiationLog = parsed;
      }
    }
  } catch (e) {}

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={`Order ${order.po_number}`} showAction={false} />
      
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[700px] w-full mx-auto">
          
          <Pressable onPress={() => router.back()} className="flex-row items-center mb-6 self-start">
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text className="text-gray-500 font-semibold ml-2">Back to Orders</Text>
          </Pressable>

          {/* Main Details Card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
            <View className="flex-row justify-between items-start mb-8 pb-6 border-b border-gray-100">
              <View>
                <Text className="text-3xl font-bold text-gray-800 mb-2">{order.po_number}</Text>
                <Text className="text-gray-500 flex-row items-center">
                  <Ionicons name="calendar-outline" size={14} /> Created on {format(new Date(order.created_at), 'MMM dd, yyyy')}
                </Text>
              </View>
              <View className={`px-4 py-2 rounded-lg border ${getStatusColor(order.status)}`}>
                <Text className="font-bold uppercase tracking-wide text-xs">{order.status}</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap mb-8">
              <View className="w-1/2 mb-6">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Supplier</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                    <FontAwesome5 name="truck" size={12} color="#3B82F6" />
                  </View>
                  <Text className="text-gray-800 font-medium text-base">{order.supplier_name || 'Unknown'}</Text>
                </View>
              </View>

              <View className="w-1/2 mb-6 pr-4" style={{ minWidth: 0 }}>
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Site</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center mr-3">
                    <FontAwesome5 name="hard-hat" size={12} color="#10B981" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text className="text-gray-800 font-medium text-base" style={{ flexShrink: 1 }}>{order.project?.name || 'Unknown Project'}</Text>
                    {order.project?.location ? (
                      <Text className="text-xs text-gray-500 mt-0.5" style={{ flexShrink: 1 }} numberOfLines={3}>{order.project.location}</Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <View className="w-1/2">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Expected Delivery</Text>
                <Text className="text-gray-800 font-medium text-base">
                  {order.expected_date ? format(new Date(order.expected_date), 'MMM dd, yyyy') : 'TBD'}
                </Text>
              </View>

              <View className="w-1/2">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Cost</Text>
                <Text className="text-brand-orange font-bold text-xl">
                  Rs. {(order.total_price || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Items Ordered Section */}
            <View className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <Text className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Items Ordered</Text>
              <View className="flex-row justify-between items-center py-3 border-b border-gray-200 mb-2">
                <Text className="text-gray-800 font-medium flex-1">{order.items}</Text>
                <Text className="text-gray-500 w-24 text-right">Qty: {order.quantity_ordered}</Text>
                
                {order.status === 'Pending Delivery' ? (
                  <View className="w-32 flex-row items-center justify-end">
                    <Text className="text-gray-500 mr-2 font-bold">Rs.</Text>
                    <TextInput
                      className="border border-gray-300 rounded-lg bg-white p-2 w-24 text-right text-brand-text font-bold"
                      keyboardType="numeric"
                      value={unitPrice}
                      onChangeText={setUnitPrice}
                      placeholder="0.00"
                    />
                  </View>
                ) : (
                  <Text className="text-gray-800 font-bold w-32 text-right">Rs. {(order.unit_price || 0).toLocaleString()}</Text>
                )}
              </View>
              <View className="flex-row justify-between items-center pt-2">
                <Text className="text-gray-500 font-bold">Total</Text>
                <Text className="text-brand-orange font-bold text-lg">
                  Rs. {order.status === 'Pending Delivery' ? ((parseFloat(unitPrice) || 0) * (order.quantity_ordered || 0)).toLocaleString() : (order.total_price || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            {negotiationLog.length > 0 && (
              <View className="mt-8">
                <Text className="text-lg font-bold text-gray-800 mb-4">Negotiation History</Text>
                <View className="border-l-2 border-gray-200 ml-3 pl-4">
                  {negotiationLog.map((event, idx) => (
                    <View key={idx} className="mb-4 relative">
                      <View className={`absolute -left-6 w-4 h-4 rounded-full ${event.role === 'supplier' ? 'bg-blue-500' : 'bg-green-500'} border-4 border-white`} />
                      <Text className="text-xs text-gray-400 mb-1">{event.timestamp ? format(new Date(event.timestamp), 'MMM dd, yyyy h:mm a') : ''} • {event.role === 'supplier' ? 'You' : 'Admin/PM'}</Text>
                      <View className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <Text className="font-bold text-gray-700 capitalize mb-1">{event.action}</Text>
                        {event.quantity && <Text className="text-sm text-gray-600">Qty: {event.quantity}</Text>}
                        {event.suggested_quantity && <Text className="text-sm text-gray-600">Qty: {event.suggested_quantity}</Text>}
                        {event.unit_price && <Text className="text-sm text-gray-600">Price: Rs. {event.unit_price}</Text>}
                        {event.suggested_price && <Text className="text-sm text-gray-600">Price: Rs. {event.suggested_price}</Text>}
                        {event.date && <Text className="text-sm text-gray-600">Date: {event.date}</Text>}
                        {event.suggested_date && <Text className="text-sm text-gray-600">Date: {event.suggested_date}</Text>}
                        {event.note && <Text className="text-sm text-gray-500 italic mt-2">"{event.note}"</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

          </View>

          {/* Action Buttons Section */}
          {!isCompleted && (
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex-row justify-between items-center">
              <View className="flex-1 mr-4">
                <Text className="text-lg font-bold text-gray-800 mb-1">Update Order Status</Text>
                <Text className="text-gray-500 text-sm">Review the details above before confirming or rejecting this order.</Text>
              </View>
              
              <View className="flex-row gap-3">
                {order.status === 'Pending Delivery' ? <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Rejected')}
                  className="bg-red-50 border border-red-200 px-6 py-3 rounded-lg mr-3"
                >
                  <Text className="text-red-600 font-bold">Reject</Text>
                </Pressable> : null}
                
                {order.status === 'Confirmed' ? <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Delivered')}
                  className="bg-brand-orange shadow-sm px-6 py-3 rounded-lg flex-row items-center"
                >
                  {actionLoading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                  <Text className="text-white font-bold">Mark Delivered</Text>
                </Pressable> : order.status === 'Pending Delivery' ? (
                  <>
                    <Pressable
                      disabled={actionLoading}
                      onPress={() => setSuggestModalVisible(true)}
                      className="bg-yellow-500 shadow-sm px-6 py-3 rounded-lg flex-row items-center mr-3"
                    >
                      <Text className="text-white font-bold">Counter Admin</Text>
                    </Pressable>
                    <Pressable
                      disabled={actionLoading}
                      onPress={() => handleUpdateStatus('Confirmed')}
                      className="bg-brand-orange shadow-sm px-6 py-3 rounded-lg flex-row items-center"
                    >
                      {actionLoading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                      <Text className="text-white font-bold">Confirm Order</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          )}

        </View>
      </ScrollView>

      <SuggestModal 
        visible={suggestModalVisible}
        order={order}
        onClose={() => setSuggestModalVisible(false)}
        onSubmit={handleSuggestSubmit}
      />
    </View>
  );
}
