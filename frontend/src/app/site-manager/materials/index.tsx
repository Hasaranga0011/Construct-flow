import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, TextInput } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function SMMaterialsPage() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'stock' | 'request'>('stock');
  const [siteStock, setSiteStock] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Form State
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('units');

  const fetchMaterialsData = async () => {
    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const userId = sessionData.session.user.id;
      setCurrentUserId(userId);

      // 1. Fetch SM's assigned sites and their parent projects
      const { data: smSites } = await supabase
        .from('site_manager_sites')
        .select('site_id, sites(name, project_id)')
        .eq('site_manager_id', userId);
        
      const parsedSites = smSites?.map(s => ({ 
        id: s.site_id, 
        name: s.sites?.name, 
        project_id: s.sites?.project_id 
      })) || [];
      
      setSites(parsedSites);

      if (parsedSites.length > 0) {
        const currentSite = activeSiteId || parsedSites[0].id;
        if (!activeSiteId) setActiveSiteId(currentSite);

        // 2. Fetch site stock
        const { data: stockData } = await supabase
          .from('site_materials')
          .select('*')
          .eq('site_id', currentSite)
          .order('last_updated', { ascending: false });
        
        setSiteStock(stockData || []);

        // 3. Fetch past requests by this user
        const { data: reqData } = await supabase
          .from('material_requests')
          .select('*, projects(name)')
          .eq('requested_by', userId)
          .order('created_at', { ascending: false });

        setMyRequests(reqData || []);
      }
    } catch (error: any) {
      console.error('Error fetching materials data', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterialsData();
  }, [activeSiteId, activeTab]);

  const handleSubmitRequest = async () => {
    if (!itemName || !quantity || !activeSiteId || !currentUserId) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    const activeSite = sites.find(s => s.id === activeSiteId);
    if (!activeSite?.project_id) {
      Alert.alert('Error', 'Could not determine the project for this site.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('material_requests')
        .insert({
          project_id: activeSite.project_id,
          requested_by: currentUserId,
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
      
      {sites.length > 0 && (
        <View className="bg-white px-6 pt-4 border-b border-gray-200">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {sites.map(site => (
              <Pressable 
                key={site.id}
                onPress={() => setActiveSiteId(site.id)}
                className={`mr-6 pb-3 border-b-2 ${activeSiteId === site.id ? 'border-brand-orange' : 'border-transparent'}`}
              >
                <Text className={`font-bold text-base ${activeSiteId === site.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                  {site.name}
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
          className={`pb-3 border-b-2 ${activeTab === 'request' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text className={`font-bold text-base ${activeTab === 'request' ? 'text-brand-text' : 'text-gray-500'}`}>Request Materials</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-8">
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" className="mt-10" />
        ) : sites.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
            <Text className="text-gray-400 text-lg font-medium text-center">You have no assigned sites.</Text>
          </View>
        ) : activeTab === 'stock' ? (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
            <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
              <Text className="flex-[2] text-xs font-bold text-gray-500 uppercase">Item Name</Text>
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Quantity</Text>
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Last Updated</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {siteStock.length === 0 ? (
                <View className="p-10 items-center justify-center">
                  <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                  <Text className="text-gray-400 mt-4">No stock recorded at this site yet.</Text>
                </View>
              ) : (
                siteStock.map(item => (
                  <View key={item.id} className="flex-row items-center py-4 px-6 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <View className="flex-[2]">
                      <Text className="font-bold text-brand-text">{item.item_name}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold ${item.quantity < 10 ? 'text-red-500' : 'text-brand-text'}`}>
                        {item.quantity} {item.unit}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-gray-500 text-xs">
                        {new Date(item.last_updated).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
              <Text className="text-xl font-bold text-gray-800 mb-6">New Material Request</Text>
              
              <View className="space-y-4">
                <View>
                  <Text className="text-sm font-bold text-gray-700 mb-2">Item Name</Text>
                  <TextInput
                    value={itemName}
                    onChangeText={setItemName}
                    placeholder="e.g. Portland Cement"
                    className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                  />
                </View>

                <View className="flex-row space-x-4 gap-4">
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
        )}
      </View>
    </View>
  );
}
