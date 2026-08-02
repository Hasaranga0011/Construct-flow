import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { TopNav } from '@/components/common/TopNav';

export default function SiteMaterials() {
  const { user } = useAuth();
  
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Request Modal State
  const [showModal, setShowModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user's requests
      let query = supabase
        .from('material_requests')
        .select('*, projects(name)')
        .eq('requested_by', user?.id)
        .order('created_at', { ascending: false });
        
      if (searchQuery) {
        query = query.ilike('item_name', `%${searchQuery}%`);
      }

      const { data: reqData } = await query;
      setRequests(reqData || []);

      // Load active projects for dropdown
      const { data: projData } = await supabase.from('projects').select('id, name').eq('status', 'active');
      if (projData) {
        setProjects(projData);
        if (projData.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projData[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user, searchQuery]);

  const handleSubmitRequest = async () => {
    if (!itemName || !quantity || !selectedProjectId) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Insert request
      const { error } = await supabase.from('material_requests').insert({
        project_id: selectedProjectId,
        requested_by: user?.id,
        item_name: itemName,
        quantity: parseFloat(quantity),
        unit: unit,
        status: 'Pending Approval'
      });

      if (error) throw error;

      // 2. Trigger notification to PM
      await supabase.from('notifications').insert({
        project_id: selectedProjectId,
        target_role: 'Project Manager',
        title: 'New Material Request',
        message: `Site Manager requested ${quantity} ${unit} of ${itemName}. Pending your approval.`,
      });

      Alert.alert('Success', 'Material request submitted to Project Manager.');
      setShowModal(false);
      setItemName('');
      setQuantity('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
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
        title="Material Requests" 
        actionLabel="+ Request Material" 
        onActionPress={() => setShowModal(true)} 
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      <View className="flex-1 p-8">
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" className="mt-10" />
        ) : (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
            <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
              <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase">Item</Text>
              <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase">Project</Text>
              <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase">Quantity</Text>
              <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase text-right">Status</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {requests.length === 0 ? (
                <View className="p-10 items-center justify-center">
                  <Ionicons name="cart-outline" size={48} color="#D1D5DB" />
                  <Text className="text-gray-400 mt-4">No material requests found.</Text>
                </View>
              ) : (
                requests.map(req => (
                  <View key={req.id} className="flex-row items-center py-4 px-6 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <View className="w-1/4">
                      <Text className="font-bold text-brand-text">{req.item_name}</Text>
                      <Text className="text-xs text-gray-400 mt-1">{new Date(req.created_at).toLocaleDateString()}</Text>
                    </View>
                    <View className="w-1/4">
                      <Text className="text-gray-500 text-sm">{req.projects?.name || 'Unknown'}</Text>
                    </View>
                    <View className="w-1/4">
                      <Text className="text-brand-text font-semibold">{req.quantity} {req.unit}</Text>
                    </View>
                    <View className="w-1/4 flex-row justify-end">
                      <View className={`px-3 py-1 rounded-full ${getStatusColor(req.status).split(' ')[0]}`}>
                        <Text className={`text-xs font-bold ${getStatusColor(req.status).split(' ')[1]}`}>{req.status}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* New Request Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-brand-light">
              <Text className="text-xl font-bold text-brand-text">Request Material</Text>
              <Pressable onPress={() => !submitting && setShowModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <View className="p-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Target Project</Text>
              <View className="border border-gray-200 rounded-xl mb-4 overflow-hidden max-h-32">
                <ScrollView nestedScrollEnabled>
                  {projects.map(p => (
                    <Pressable 
                      key={p.id}
                      onPress={() => setSelectedProjectId(p.id)}
                      className={`p-3 border-b border-gray-100 ${selectedProjectId === p.id ? 'bg-orange-50' : 'bg-white'}`}
                    >
                      <Text className={selectedProjectId === p.id ? 'text-brand-orange font-bold' : 'text-gray-600'}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <Text className="text-sm font-semibold text-gray-700 mb-2">Item Name</Text>
              <TextInput
                className="border border-gray-200 rounded-xl p-3 text-brand-text bg-gray-50 mb-4"
                placeholder="e.g. Steel Rebar 12mm"
                value={itemName}
                onChangeText={setItemName}
              />

              <View className="flex-row gap-4 mb-6">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Quantity</Text>
                  <TextInput
                    className="border border-gray-200 rounded-xl p-3 text-brand-text bg-gray-50"
                    placeholder="0"
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Unit</Text>
                  <TextInput
                    className="border border-gray-200 rounded-xl p-3 text-brand-text bg-gray-50"
                    placeholder="Bags, Tons, Liters..."
                    value={unit}
                    onChangeText={setUnit}
                  />
                </View>
              </View>

              <Pressable 
                onPress={handleSubmitRequest}
                disabled={submitting}
                className={`py-3 rounded-xl flex-row items-center justify-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange hover:bg-orange-600'}`}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Submit Request</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
