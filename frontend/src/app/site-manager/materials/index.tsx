import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, TextInput } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

export default function SMMaterialsPage() {
  const { user } = useAuth();
  const { assignedProjectIds, loading: sitesLoading } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'stock' | 'request' | 'deliveries'>('stock');
  const [projectStock, setProjectStock] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  // Form State
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('units');

  const fetchMaterialsData = async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);

      const { data: projectsData } = assignedProjectIds.length
        ? await supabase.from('projects').select('id, name').in('id', assignedProjectIds).eq('status', 'active')
        : { data: [] };
        
      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      if (parsedProjects.length > 0) {
        const currentProject = activeProjectId || parsedProjects[0].id;
        if (!activeProjectId) setActiveProjectId(currentProject);

        // 2. Fetch materials for the active project
        const { data: stockData } = await supabase
          .from('materials')
          .select('*')
          .eq('project_id', currentProject)
          .order('created_at', { ascending: false });
        
        setProjectStock(stockData || []);

        // 3. Fetch past requests by this user
        const { data: reqData } = await supabase
          .from('material_requests')
          .select('*, projects(name)')
          .eq('requested_by', user.id)
          .order('created_at', { ascending: false });

        setMyRequests(reqData || []);

        // 4. Fetch incoming deliveries for this project
        const { data: delData } = await supabase
          .from('purchase_orders')
          .select('*, materials(item_name, unit)')
          .eq('project_id', currentProject)
          .eq('status', 'Delivered')
          .order('actual_delivery', { ascending: false });
          
        setDeliveries(delData || []);
      }
    } catch (error: any) {
      console.error('Error fetching materials data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterialsData();
  }, [activeProjectId, activeTab, user?.id, sitesLoading, assignedProjectIds]);

  const handleSubmitRequest = async () => {
    if (!itemName || !quantity || !activeProjectId || !user?.id) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('material_requests')
        .insert({
          project_id: activeProjectId,
          requested_by: user.id,
          item_name: itemName,
          quantity: Number(quantity),
          unit: unit,
          status: 'Pending Approval'
        });

      if (error) throw error;
      
      Alert.alert('Success', 'Material request submitted to Project Manager!');
      setItemName('');
      setQuantity('');
      setActiveTab('stock');
      fetchMaterialsData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceiveDelivery = async (poId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api'}/purchase-orders/${poId}/receive`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!res.ok) throw new Error('Failed to receive delivery');
      Alert.alert('Success', 'Goods received and stock updated!');
      fetchMaterialsData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
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
      <TopNav title="Site Materials" />
      
      {projects.length > 0 && (
        <View className="bg-white px-6 pt-4 border-b border-gray-200">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {projects.map(project => (
              <Pressable 
                key={project.id}
                onPress={() => setActiveProjectId(project.id)}
                className={`mr-6 pb-3 border-b-2 ${activeProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
              >
                <Text className={`font-bold text-base ${activeProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                  {project.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View className="flex-row px-8 mt-6">
        <Pressable 
          onPress={() => setActiveTab('stock')}
          className={`pb-3 mr-8 border-b-2 ${activeTab === 'stock' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'stock' ? 'text-brand-text' : 'text-gray-500'}`}>Current Stock</Text>
        </Pressable>
        <Pressable 
          onPress={() => setActiveTab('request')}
          className={`pb-3 mr-8 border-b-2 ${activeTab === 'request' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'request' ? 'text-brand-text' : 'text-gray-500'}`}>Request Materials</Text>
        </Pressable>
        <Pressable 
          onPress={() => setActiveTab('deliveries')}
          className={`pb-3 border-b-2 ${activeTab === 'deliveries' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'deliveries' ? 'text-brand-text' : 'text-gray-500'}`}>Incoming Deliveries</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-8">
        {loading || sitesLoading ? (
          <ActivityIndicator size="large" color="#F97316" style={{ marginTop: 40 }} />
        ) : assignedProjectIds.length === 0 ? (
          <NoAssignedSites />
        ) : activeTab === 'stock' ? (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
            <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
              <Text className="flex-[2] text-xs font-bold text-gray-500 uppercase">Item Name</Text>
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Stock</Text>
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Status</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {projectStock.length === 0 ? (
                <View className="p-10 items-center justify-center">
                  <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                  <Text className="text-gray-400 mt-4">No materials recorded for this project yet.</Text>
                </View>
              ) : (
                projectStock.map(item => {
                  const isLow = (item.current_stock || 0) < (item.minimum_threshold || 0);
                  return (
                    <View key={item.id} className="flex-row items-center py-4 px-6 border-b border-gray-50">
                      <View className="flex-[2]">
                        <Text className="font-bold text-brand-text">{item.item_name}</Text>
                        <Text className="text-gray-400 text-xs">{item.unit}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className={`font-bold ${isLow ? 'text-red-500' : 'text-brand-text'}`}>
                          {item.current_stock ?? 0}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <View className={`self-start px-2 py-1 rounded ${isLow ? 'bg-red-100' : 'bg-green-100'}`}>
                          <Text className={`text-xs font-bold ${isLow ? 'text-red-700' : 'text-green-700'}`}>
                            {isLow ? 'Low Stock' : 'OK'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        ) : activeTab === 'request' ? (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
              <Text className="text-xl font-bold text-gray-800 mb-6">New Material Request</Text>
              
              <View>
                <View className="mb-4">
                  <Text className="text-sm font-bold text-gray-700 mb-2">Item Name</Text>
                  <TextInput
                    value={itemName}
                    onChangeText={setItemName}
                    placeholder="e.g. Portland Cement"
                    className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                  />
                </View>

                <View className="flex-row gap-4 mb-4">
                  <View className="flex-[2]">
                    <Text className="text-sm font-bold text-gray-700 mb-2">Quantity</Text>
                    <TextInput
                      value={quantity}
                      onChangeText={setQuantity}
                      placeholder="e.g. 50"
                      keyboardType="numeric"
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-700 mb-2">Unit</Text>
                    <TextInput
                      value={unit}
                      onChangeText={setUnit}
                      placeholder="bags, tons..."
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                    />
                  </View>
                </View>

                <Pressable 
                  onPress={handleSubmitRequest}
                  className="bg-brand-orange py-4 rounded-xl mt-4 items-center"
                >
                  <Text className="text-white font-bold text-base">Submit Request to PM</Text>
                </Pressable>
              </View>
            </View>

            {/* Request History */}
            <Text className="text-lg font-bold text-gray-800 mb-4 px-2">My Recent Requests</Text>
            {myRequests.slice(0, 5).map(req => (
              <View key={req.id} className="bg-white p-4 rounded-xl border border-gray-200 mb-3 flex-row items-center justify-between shadow-sm">
                <View>
                  <Text className="font-bold text-gray-800">{req.item_name}</Text>
                  <Text className="text-gray-500 text-xs mt-1">{req.quantity} {req.unit} • {req.projects?.name}</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-md ${getStatusColor(req.status).split(' ')[0]}`}>
                  <Text className={`text-xs font-bold ${getStatusColor(req.status).split(' ')[1]}`}>{req.status}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <Text className="text-xl font-bold text-brand-text mb-6">Incoming Deliveries</Text>
            {deliveries.length === 0 ? (
              <View className="p-10 items-center justify-center bg-white rounded-2xl border border-gray-100">
                <Ionicons name="checkmark-done-circle-outline" size={48} color="#D1D5DB" />
                <Text className="text-gray-400 mt-4 font-medium">No pending deliveries for this project.</Text>
              </View>
            ) : (
              deliveries.map(del => (
                <View key={del.id} className="bg-white p-6 rounded-2xl border border-gray-200 mb-4 flex-row items-center justify-between shadow-sm">
                  <View className="flex-1">
                    <Text className="font-bold text-lg text-brand-text">{del.po_number}</Text>
                    <Text className="text-gray-500 text-sm mt-1">{del.materials?.item_name} • {del.quantity_ordered} {del.materials?.unit}</Text>
                    <Text className="text-gray-400 text-xs mt-1">Dispatched: {del.actual_delivery}</Text>
                  </View>
                  <Pressable 
                    onPress={() => handleReceiveDelivery(del.id)}
                    className="bg-brand-success px-4 py-2 rounded-lg"
                  >
                    <Text className="text-white font-bold">Confirm Receipt</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
