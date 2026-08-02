import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';

export default function AdminProjectEditPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    address: '',
    total_budget: '',
    status: 'Planning',
    pm_id: '',
    client_id: '',
    site_managers: [] as string[],
    workers: [] as string[]
  });

  const projectId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projRes, pmData, clientData, smData, workerData, pmProjRes, smSitesRes, workersRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('profiles').select('*').eq('role', 'pm'),
          supabase.from('profiles').select('*').eq('role', 'client'),
          supabase.from('profiles').select('*').eq('role', 'site_manager'),
          supabase.from('profiles').select('*').eq('role', 'worker'),
          supabase.from('pm_projects').select('pm_id').eq('project_id', projectId),
          supabase.from('site_manager_sites').select('site_manager_id').eq('project_id', projectId),
          supabase.from('site_workers').select('worker_id').eq('project_id', projectId)
        ]);
          
        if (projRes.error) throw projRes.error;
        const data = projRes.data;
        
        if (pmData.data) setPms(pmData.data);
        if (clientData.data) setClients(clientData.data);
        if (smData.data) setSiteManagers(smData.data);
        if (workerData.data) setAvailableWorkers(workerData.data);
        
        setFormData({
          name: data.name || '',
          location: data.location || '',
          address: data.address || '',
          total_budget: data.total_budget ? data.total_budget.toString() : '',
          status: data.status || 'Planning',
          pm_id: pmProjRes.data?.[0]?.pm_id || '',
          client_id: data.client_id || '',
          site_managers: smSitesRes.data?.map((s: any) => s.site_manager_id) || [],
          workers: workersRes.data?.map((w: any) => w.worker_id) || []
        });
      } catch (err: any) {
        Alert.alert("Error", err.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (projectId) fetchData();
  }, [projectId]);

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert("Error", "Project name is required");
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        location: formData.location,
        address: formData.address,
        total_budget: formData.total_budget ? parseFloat(formData.total_budget) : null,
        status: formData.status,
        pm_id: formData.pm_id || null,
        client_id: formData.client_id || null,
        site_managers: formData.site_managers,
        workers: formData.workers
      };
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to update project');
      }
      
      alert("Project updated successfully!");
      router.push(`/admin/projects/${projectId}`);
    } catch (err: any) {
      alert(`Error saving project: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-brand-light">
      <TopNav title="Edit Project" showAction={false} />
      
      <ScrollView className="flex-1 p-6">
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" />
        ) : (
          <View className="max-w-2xl mx-auto w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <Text className="text-2xl font-bold text-gray-800 mb-6">Update Project Details</Text>
            
            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-600 mb-1">Project Name</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                value={formData.name}
                onChangeText={(t) => setFormData({...formData, name: t})}
                placeholder="Enter project name"
              />
            </View>
            
            <View className="flex-row space-x-4 mb-4">
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-600 mb-1">Location</Text>
                <TextInput 
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                  value={formData.location}
                  onChangeText={(t) => setFormData({...formData, location: t})}
                  placeholder="e.g., Colombo"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-600 mb-1">Budget (Rs.)</Text>
                <TextInput 
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                  value={formData.total_budget}
                  onChangeText={(t) => setFormData({...formData, total_budget: t})}
                  placeholder="e.g., 5000000"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-600 mb-1">Address</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                value={formData.address}
                onChangeText={(t) => setFormData({...formData, address: t})}
                placeholder="Full site address"
                multiline
              />
            </View>
            
            <View className="mb-8">
              <Text className="text-sm font-bold text-gray-600 mb-2">Status</Text>
              <View className="flex-row flex-wrap">
                {['Planning', 'Active', 'Completed', 'On Hold'].map(status => (
                  <TouchableOpacity 
                    key={status}
                    onPress={() => setFormData({...formData, status})}
                    className={`px-4 py-2 rounded-full mr-2 mb-2 ${formData.status === status ? 'bg-brand-blue' : 'bg-gray-100'}`}
                  >
                    <Text className={formData.status === status ? 'text-white font-bold' : 'text-gray-600'}>{status}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text className="text-xl font-bold text-gray-800 mb-6 mt-4 border-t border-gray-100 pt-6">Assignments</Text>
          
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Assign Project Manager</Text>
              <View className="flex-row flex-wrap space-x-2">
                {pms.map(pm => (
                  <TouchableOpacity 
                    key={pm.id}
                    onPress={() => setFormData({...formData, pm_id: pm.id})}
                    className={`px-4 py-2 rounded-full mb-2 ${formData.pm_id === pm.id ? 'bg-brand-orange' : 'bg-gray-100'}`}
                  >
                    <Text className={formData.pm_id === pm.id ? 'text-white' : 'text-gray-700'}>
                      {pm.full_name || pm.email}
                    </Text>
                  </TouchableOpacity>
                ))}
                {pms.length === 0 && <Text className="text-gray-500 italic">No PMs available</Text>}
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Assign Client</Text>
              <View className="flex-row flex-wrap space-x-2">
                {clients.map(client => (
                  <TouchableOpacity 
                    key={client.id}
                    onPress={() => setFormData({...formData, client_id: client.id})}
                    className={`px-4 py-2 rounded-full mb-2 ${formData.client_id === client.id ? 'bg-brand-blue' : 'bg-gray-100'}`}
                  >
                    <Text className={formData.client_id === client.id ? 'text-white' : 'text-gray-700'}>
                      {client.full_name || client.email}
                    </Text>
                  </TouchableOpacity>
                ))}
                {clients.length === 0 && <Text className="text-gray-500 italic">No Clients available</Text>}
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Assign Site Managers (Multiple)</Text>
              <View className="flex-row flex-wrap space-x-2">
                {siteManagers.map(sm => {
                  const isSelected = formData.site_managers.includes(sm.id);
                  return (
                    <TouchableOpacity 
                      key={sm.id}
                      onPress={() => {
                        if (isSelected) {
                          setFormData({...formData, site_managers: formData.site_managers.filter(id => id !== sm.id)});
                        } else {
                          setFormData({...formData, site_managers: [...formData.site_managers, sm.id]});
                        }
                      }}
                      className={`px-4 py-2 rounded-full mb-2 ${isSelected ? 'bg-emerald-500' : 'bg-gray-100'}`}
                    >
                      <Text className={isSelected ? 'text-white' : 'text-gray-700'}>
                        {sm.full_name || sm.email}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {siteManagers.length === 0 && <Text className="text-gray-500 italic">No Site Managers available</Text>}
              </View>
            </View>

            <View className="mb-8">
              <Text className="text-gray-700 font-medium mb-2">Assign Workers (Multiple)</Text>
              <View className="flex-row flex-wrap space-x-2">
                {availableWorkers.map(w => {
                  const isSelected = formData.workers.includes(w.id);
                  return (
                    <TouchableOpacity 
                      key={w.id}
                      onPress={() => {
                        if (isSelected) {
                          setFormData({...formData, workers: formData.workers.filter(id => id !== w.id)});
                        } else {
                          setFormData({...formData, workers: [...formData.workers, w.id]});
                        }
                      }}
                      className={`px-4 py-2 rounded-full mb-2 ${isSelected ? 'bg-indigo-500' : 'bg-gray-100'}`}
                    >
                      <Text className={isSelected ? 'text-white' : 'text-gray-700'}>
                        {w.full_name || w.email}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {availableWorkers.length === 0 && <Text className="text-gray-500 italic">No Workers available</Text>}
              </View>
            </View>

            <View className="flex-row space-x-4 mt-4">
              <TouchableOpacity 
                onPress={() => router.push(`/admin/projects/${projectId}`)}
                className="flex-1 py-4 bg-gray-100 rounded-xl items-center"
              >
                <Text className="text-gray-600 font-bold">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={handleSave}
                disabled={saving}
                className="flex-1 py-4 bg-brand-orange rounded-xl items-center flex-row justify-center shadow-sm"
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold">Save Changes</Text>}
              </TouchableOpacity>
            </View>
            
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
