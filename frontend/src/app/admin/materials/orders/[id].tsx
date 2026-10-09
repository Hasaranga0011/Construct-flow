import { notify, confirmAction } from '@/utils/notify';
import { positiveQuantity, validReportDate } from '@/utils/siteWorkflow';
import { firstRelation } from '@/utils/relations';
import { ModalViewport } from '@/components/common/ModalViewport';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { api } from '../../../../services/api';
import { OrderItemRow } from '@/components/materials/OrderItemRow';
import { useResponsive } from '@/hooks/useResponsive';

const displayDate = (value: string | null | undefined, pattern = 'MMM dd, yyyy') => value && Number.isFinite(new Date(value).getTime()) ? format(new Date(value), pattern) : 'Not recorded';

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
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-4">Counter-Offer</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4 text-sm">Propose a different quantity, date, or price to the supplier.</Text>

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700 mb-1">Suggested Quantity</Text>
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
          />

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700 mb-1">Suggested Date (YYYY-MM-DD)</Text>
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            value={date}
            onChangeText={setDate}
          />

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700 mb-1">Suggested Unit Price (LKR)</Text>
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="border border-gray-300 rounded-lg p-3 mb-4 text-brand-text"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700 mb-1">Notes to Supplier</Text>
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="border border-gray-300 rounded-lg p-3 mb-6 text-brand-text h-20"
            multiline
            value={notes}
            onChangeText={setNotes}
          />

          <View className="flex-row justify-end space-x-3">
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="px-4 py-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-bold">Cancel</Text>
            </Pressable>
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => onSubmit(order.id, parseFloat(qty), date, parseFloat(price), notes)}
              className="bg-brand-warning px-6 py-2 rounded-lg"
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Submit Counter</Text>
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
  const isPM = usePathname().startsWith('/pm/');
  const { isMobile } = useResponsive();
  const [loadError, setLoadError] = useState('');

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  const fetchOrder = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in again.');
      let projectQuery = supabase.from('projects').select('id, name');
      if (isPM) projectQuery = projectQuery.eq('pm_id', session.user.id);
      const available = await projectQuery;
      if (available.error) throw available.error;
      setProjects(available.data || []);
      let query = supabase.from('purchase_orders').select('*, project:projects(name)').eq('id', id);
      if (isPM) query = query.in('project_id', (available.data || []).map(p => p.id));
      const { data, error } = await query.single();
      if (error) throw error;
      setOrder({ ...data, project: firstRelation(data.project) });
    } catch (err: any) {
      setOrder(null); setLoadError(err.message || 'Unable to load order details.');
    } finally { setLoading(false); }
  }, [id, isPM]);
  useEffect(() => { void fetchOrder(); }, [fetchOrder]);

  const handleUpdateStatus = async (newStatus: 'Confirmed' | 'Rejected' | 'Delivered' | 'Received') => {
    if (actionLoading || !await confirmAction('Confirm Action', `Mark this order as ${newStatus}?`)) return;
    setActionLoading(true);
    try {
      if (!id) throw new Error('Order id is required');
      if (newStatus === 'Confirmed') await api.purchaseOrders.approve(id, {});
      if (newStatus === 'Rejected') await api.purchaseOrders.reject(id);
      if (newStatus === 'Delivered') await api.purchaseOrders.deliver(id);
      if (newStatus === 'Received') await api.purchaseOrders.receive(id);

      notify('Success', `Order marked as ${newStatus}!`);

      // Refresh data
      fetchOrder();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuggestSubmit = async (orderId: string, qty: number, date: string, price: number, notes: string) => {
    if (actionLoading) return;
    if (!positiveQuantity(String(qty)) || !validReportDate(date) || !Number.isFinite(price) || price < 0) { notify('Invalid offer', 'Enter a positive quantity, valid date and non-negative unit price.'); return; }
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
    } catch (e: any) {
      notify('Error', e.message || 'Failed to submit suggestion');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignProject = async (projectId: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase.from('purchase_orders').update({ project_id: projectId }).eq('id', id);
      if (error) throw error;
      setAssignModalVisible(false);
      fetchOrder();
      notify('Success', 'Project assigned successfully.');
    } catch (e: any) {
      notify('Error', e.message || 'Failed to assign project');
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
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">{loadError || 'The requested order could not be found.'}</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={fetchOrder} className="p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>Retry</Text></Pressable>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.back()} className="mt-4 bg-brand-orange px-6 py-2 rounded-lg">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Go Back</Text>
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
  } catch {}

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={`Order ${order.po_number}`} showAction={false} />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-4 md:p-6'}`} showsVerticalScrollIndicator={false}>
        <View className="max-w-[700px] w-full mx-auto">

          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.back()} className="flex-row items-center mb-6 self-start">
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Orders</Text>
          </Pressable>

          {/* Main Details Card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8 mb-6">
            <View className="flex-row flex-wrap gap-3 justify-between items-start mb-8 pb-6 border-b border-gray-100">
              <View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-gray-800 mb-2">{order.po_number}</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 flex-row items-center">
                  <Ionicons name="calendar-outline" size={14} /> Created on {displayDate(order.created_at)}
                </Text>
              </View>
              <View className={`px-4 py-2 rounded-lg border ${getStatusColor(order.status)}`}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold uppercase tracking-wide text-xs">{order.status}</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap mb-8">
              <View className="w-full md:w-1/2 mb-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Supplier</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                    <FontAwesome5 name="truck" size={12} color="#3B82F6" />
                  </View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium text-base">{order.supplier_name || 'Unknown'}</Text>
                </View>
              </View>

              <View className="w-full md:w-1/2 mb-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Site</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center mr-3">
                    <FontAwesome5 name="hard-hat" size={12} color="#10B981" />
                  </View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium text-base mr-2">{order.project?.name || 'Unassigned'}</Text>
                  {!order.project && (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setAssignModalVisible(true)} className="bg-gray-200 px-3 py-1 rounded-full">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-700 font-bold">Assign</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <View className="w-full md:w-1/2 mb-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Expected Delivery</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium text-base">
                  {displayDate(order.expected_date)}
                </Text>
              </View>

              <View className="w-full md:w-1/2 mb-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Cost</Text>
                {(!order.total_price || order.total_price === 0) && (order.status === 'Pending' || order.status === 'Suggested') ? (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm mt-1">Awaiting supplier price</Text>
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xl">
                    Rs. {(order.total_price || 0).toLocaleString()}
                  </Text>
                )}
              </View>
            </View>

            {/* Items Ordered Section */}
            <View className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Items Ordered</Text>
              <OrderItemRow 
                itemName={order.items}
                quantity={order.quantity_ordered}
                unitPrice={order.unit_price}
                totalPrice={order.total_price}
                status={order.status}
              />
            </View>

            {negotiationLog.length > 0 && (
              <View className="mt-8">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4">Negotiation History</Text>
                <View className="border-l-2 border-gray-200 ml-3 pl-4">
                  {negotiationLog.map((event, idx) => (
                    <View key={idx} className="mb-4 relative">
                      <View className={`absolute -left-6 w-4 h-4 rounded-full ${event.role === 'supplier' ? 'bg-blue-500' : 'bg-green-500'} border-4 border-white`} />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 mb-1">{displayDate(event.timestamp, 'MMM dd, yyyy h:mm a')} • {event.role === 'supplier' ? 'Supplier' : 'You'}</Text>
                      <View className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-700 capitalize mb-1">{event.action}</Text>
                        {event.quantity && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Qty: {event.quantity}</Text>}
                        {event.suggested_quantity && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Qty: {event.suggested_quantity}</Text>}
                        {event.unit_price && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Price: Rs. {event.unit_price}</Text>}
                        {event.suggested_price && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Price: Rs. {event.suggested_price}</Text>}
                        {event.date && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Date: {event.date}</Text>}
                        {event.suggested_date && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-600">Date: {event.suggested_date}</Text>}
                        {event.note && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 italic mt-2">&quot;{event.note}&quot;</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

          </View>

          {/* Action Buttons Section */}
          {!isCompleted && order.status !== 'Pending Delivery' && (
            <View className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 flex-col ${isMobile ? 'gap-6' : 'md:flex-row md:justify-between md:items-center'}`}>
              <View className={isMobile ? "w-full" : "flex-1 mr-4"}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-1">Update Order Status</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">
                  {order.status === 'Pending' ? 'Cancel this order if it is no longer required.' : 'Review the details above before acting on this order.'}
                </Text>
              </View>

              <View className={isMobile ? "flex-col w-full gap-3" : "flex-row gap-3"}>
                {order.status === 'Pending' && (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    disabled={actionLoading}
                    onPress={() => handleUpdateStatus('Cancelled')}
                    className={`bg-red-50 border border-red-200 px-6 py-3 rounded-lg items-center justify-center ${isMobile ? 'w-full' : ''}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-bold text-center">Cancel Order</Text>
                  </Pressable>
                )}
                
                {order.status === 'Delivered' && (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    disabled={actionLoading}
                    onPress={() => handleUpdateStatus('Received')}
                    className={`bg-brand-success px-6 py-3 rounded-lg items-center justify-center ${isMobile ? 'w-full' : ''}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">Confirm Receipt</Text>
                  </Pressable>
                )}
                
                {order.status === 'Suggested' && (
                  <>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      disabled={actionLoading}
                      onPress={() => handleUpdateStatus('Rejected')}
                      className={`bg-red-50 border border-red-200 px-6 py-3 rounded-lg flex-row items-center justify-center ${isMobile ? 'w-full' : ''}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-bold text-center">Decline</Text>
                    </Pressable>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      disabled={actionLoading}
                      onPress={() => setSuggestModalVisible(true)}
                      className={`bg-yellow-500 shadow-sm px-6 py-3 rounded-lg flex-row items-center justify-center ${isMobile ? 'w-full' : ''}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">Counter back</Text>
                    </Pressable>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      disabled={actionLoading}
                      onPress={() => handleUpdateStatus('Confirmed')}
                      className={`bg-brand-success shadow-sm px-6 py-3 rounded-lg flex-row items-center justify-center ${isMobile ? 'w-full' : ''}`}
                    >
                      {actionLoading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">Accept counter-offer</Text>
                    </Pressable>
                  </>
                )}
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

      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-md max-h-full">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-4">Assign Project</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4">Select a project for this unassigned order:</Text>
            <ScrollView keyboardShouldPersistTaps="handled" className="max-h-60 mb-4">
              {projects.map(p => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={p.id}
                  onPress={() => handleAssignProject(p.id)}
                  className="py-3 border-b border-gray-100"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setAssignModalVisible(false)} className="self-end px-4 py-2 bg-gray-200 rounded-lg">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold">Cancel</Text>
            </Pressable>
          </ScrollView>
        </ModalViewport>
      </Modal>
    </View>
  );
}
