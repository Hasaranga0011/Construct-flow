import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { TopNav } from '@/components/common/TopNav';

export default function PMApprovalQueue() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'queue' | 'stock'>('queue');
  const [stockData, setStockData] = useState<any[]>([]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const pmId = sessionData.session.user.id;

      // 1. Fetch PM's projects directly (no pm_projects junction table)
      const { data: pmProjects } = await supabase.from('projects').select('id').eq('pm_id', pmId);
      const projectIds = pmProjects?.map(p => p.id) || [];

      if (projectIds.length === 0) {
        setRequests([]);
        setStockData([]);
        setLoading(false);
        return;
      }

      if (activeTab === 'queue') {
        let query = supabase
          .from('material_requests')
          .select('*, projects(name), profiles:requested_by(full_name)')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false });

        if (searchQuery) query = query.ilike('item_name', `%${searchQuery}%`);
        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        setRequests(data || []);
      } else {
        // Fetch materials for PM's projects
        let query = supabase
          .from('materials')
          .select('*, projects(name)')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false });
          
        if (searchQuery) query = query.ilike('item_name', `%${searchQuery}%`);
        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        setStockData(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [searchQuery, activeTab]);

  const handleApprove = async (req: any) => {
    setActioningId(req.id);
    try {
      await supabase.from('material_requests').update({ status: 'Approved' }).eq('id', req.id);
      
      // Notify Supplier
      await supabase.from('notifications').insert({
        project_id: req.project_id,
        target_role: 'Supplier',
        title: 'New Approved Order',
        message: `Project Manager approved ${req.quantity} ${req.unit} of ${req.item_name}. Ready for fulfillment.`,
      });

      // Notify Site Manager
      if (req.requested_by) {
        await supabase.from('notifications').insert({
          target_user_id: req.requested_by,
          title: 'Material Request Approved',
          message: `Your request for ${req.item_name} was approved!`,
        });
      }

      Alert.alert('Approved', 'Request has been forwarded to the Supplier.');
      loadRequests();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActioningId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedReqId || !rejectReason) {
      Alert.alert('Error', 'Please provide a reason for rejection.');
      return;
    }

    setActioningId(selectedReqId);
    try {
      const req = requests.find(r => r.id === selectedReqId);
      await supabase.from('material_requests').update({ status: 'Rejected', notes: rejectReason }).eq('id', selectedReqId);
      
      if (req?.requested_by) {
        await supabase.from('notifications').insert({
          target_user_id: req.requested_by,
          title: 'Material Request Rejected',
          message: `Your request for ${req.item_name} was rejected. Reason: ${rejectReason}`,
        });
      }

      setShowRejectModal(false);
      setRejectReason('');
      setSelectedReqId(null);
      loadRequests();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActioningId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending Approval': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-blue-100 text-blue-800';
      case 'Ordered': return 'bg-purple-100 text-purple-800';
      case 'Delivered': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Materials Management" 
        showAction={false} 
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* Tabs */}
      <View className="flex-row px-8 mt-6">
        <Pressable 
          onPress={() => setActiveTab('queue')}
          className={`pb-3 mr-8 border-b-2 ${activeTab === 'queue' ? 'border-brand-orange' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'queue' ? 'text-brand-orange' : 'text-gray-500'}`}>Approval Queue</Text>
        </Pressable>
        <Pressable 
          onPress={() => setActiveTab('stock')}
          className={`pb-3 border-b-2 ${activeTab === 'stock' ? 'border-brand-orange' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'stock' ? 'text-brand-orange' : 'text-gray-500'}`}>Site Stock</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-8">
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" className="mt-10" />
        ) : (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
            <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
              <Text className="w-1/5 text-xs font-bold text-gray-500 uppercase">Item</Text>
              <Text className="w-1/6 text-xs font-bold text-gray-500 uppercase">{activeTab === 'queue' ? 'Project' : 'Site'}</Text>
              <Text className="w-1/6 text-xs font-bold text-gray-500 uppercase">Quantity</Text>
              <Text className="w-1/6 text-xs font-bold text-gray-500 uppercase">{activeTab === 'queue' ? 'Status' : 'Last Updated'}</Text>
              {activeTab === 'queue' && <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase text-right">Actions</Text>}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {activeTab === 'queue' ? (
                requests.length === 0 ? (
                  <View className="p-10 items-center justify-center">
                    <Ionicons name="checkmark-done-circle-outline" size={48} color="#D1D5DB" />
                    <Text className="text-gray-400 mt-4">No pending requests to approve.</Text>
                  </View>
                ) : (
                  requests.map(req => (
                    <View key={req.id} className="flex-row items-center py-4 px-6 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <View className="w-1/5">
                        <Text className="font-bold text-brand-text">{req.item_name}</Text>
                        <Text className="text-xs text-gray-400 mt-1">By: {req.profiles?.full_name || 'Site Manager'}</Text>
                      </View>
                      <View className="w-1/6">
                        <Text className="text-gray-500 text-sm truncate">{req.projects?.name || 'Unknown'}</Text>
                      </View>
                      <View className="w-1/6">
                        <Text className="text-brand-text font-semibold">{req.quantity} {req.unit}</Text>
                      </View>
                      <View className="w-1/6">
                        <View className={`self-start px-2.5 py-1 rounded-md ${getStatusColor(req.status).split(' ')[0]}`}>
                          <Text className={`text-xs font-bold ${getStatusColor(req.status).split(' ')[1]}`}>{req.status}</Text>
                        </View>
                      </View>
                      <View className="w-1/4 flex-row justify-end space-x-2 gap-2">
                        {req.status === 'Pending Approval' ? (
                          <>
                            <Pressable 
                              onPress={() => {
                                setSelectedReqId(req.id);
                                setShowRejectModal(true);
                              }}
                              disabled={actioningId === req.id}
                              className="bg-white border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50"
                            >
                              <Text className="text-red-600 font-semibold text-xs">Reject</Text>
                            </Pressable>
                            <Pressable 
                              onPress={() => handleApprove(req)}
                              disabled={actioningId === req.id}
                              className="bg-brand-orange px-4 py-2 rounded-lg hover:bg-orange-600 flex-row items-center"
                            >
                              {actioningId === req.id ? (
                                <ActivityIndicator size="small" color="white" />
                              ) : (
                                <Text className="text-white font-semibold text-xs">Approve</Text>
                              )}
                            </Pressable>
                          </>
                        ) : (
                          <Text className="text-gray-400 text-xs italic">{req.notes || 'Processed'}</Text>
                        )}
                      </View>
                    </View>
                  ))
                )
              ) : (
                stockData.length === 0 ? (
                  <View className="p-10 items-center justify-center">
                    <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                    <Text className="text-gray-400 mt-4">No site stock data found.</Text>
                  </View>
                ) : (
                  stockData.map(stock => (
                    <View key={stock.id} className="flex-row items-center py-4 px-6 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <View className="w-1/5">
                        <Text className="font-bold text-brand-text">{stock.item_name}</Text>
                      </View>
                      <View className="w-1/6">
                        <Text className="text-gray-500 text-sm truncate">{stock.projects?.name || 'Unknown'}</Text>
                      </View>
                      <View className="w-1/6">
                        <Text className="text-brand-text font-semibold">{stock.global_stock_quantity ?? 0} {stock.unit}</Text>
                      </View>
                      <View className="w-1/6">
                        <Text className="text-gray-500 text-xs">
                          {stock.created_at ? new Date(stock.created_at).toLocaleDateString() : '—'}
                        </Text>
                      </View>
                    </View>
                  ))
                )
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <View className="p-4 border-b border-gray-100 flex-row justify-between items-center bg-gray-50">
              <Text className="text-lg font-bold text-red-600">Reject Request</Text>
              <Pressable onPress={() => !actioningId && setShowRejectModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <View className="p-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Reason for Rejection</Text>
              <TextInput
                className="border border-gray-200 rounded-xl p-3 text-brand-text bg-gray-50 mb-6"
                placeholder="E.g. Exceeds current budget."
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={3}
              />

              <Pressable 
                onPress={handleRejectConfirm}
                disabled={actioningId !== null || !rejectReason}
                className={`py-3 rounded-xl flex-row items-center justify-center ${actioningId !== null || !rejectReason ? 'bg-red-300' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {actioningId !== null ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-sm">Confirm Rejection</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
