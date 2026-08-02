import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';

export default function AdminProjectsCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    address: '',
    status: 'Planning',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0],
    pm_id: '',
    client_id: '',
    site_managers: [] as string[],
    workers: [] as string[],
    latitude: '',
    longitude: ''
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchUsers = async () => {
      try {
        const { data: pmData } = await supabase.from('profiles').select('*').eq('role', 'pm');
        const { data: clientData } = await supabase.from('profiles').select('*').eq('role', 'client');
        const { data: smData } = await supabase.from('profiles').select('*').eq('role', 'site_manager');
        const { data: workerData } = await supabase.from('profiles').select('*').eq('role', 'worker');
        
        if (isMounted) {
          if (pmData) setPms(pmData);
          if (clientData) setClients(clientData);
          if (smData) setSiteManagers(smData);
          if (workerData) setAvailableWorkers(workerData);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    
    fetchUsers();
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async () => {
    if (!formData.name || !formData.location || !formData.start_date || !formData.end_date) {
      alert('Please fill out all required fields');
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        location: formData.location,
        address: formData.address || null,
        status: formData.status,
        start_date: formData.start_date,
        end_date: formData.end_date,
        pm_id: formData.pm_id || null,
        client_id: formData.client_id || null,
        site_managers: formData.site_managers,
        workers: formData.workers,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to create project');
      }
      
      alert('Project created successfully!');
      router.push('/admin/dashboard');
    } catch (err: any) {
      alert(err.message || 'Error creating project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Create New Project" showAction={false} />
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-3xl mx-auto w-full">
          
          <Text className="text-xl font-bold text-gray-800 mb-6">Project Details</Text>
          
          {/* Form Fields */}
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Project Name *</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Skyline Towers"
              value={formData.name}
              onChangeText={(t) => setFormData({...formData, name: t})}
            />
          </View>
          
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Short Location *</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Colombo 03"
              value={formData.location}
              onChangeText={(t) => setFormData({...formData, location: t})}
            />
          </View>
          
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Full Address</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. 123 Galle Rd, Colombo"
              value={formData.address}
              onChangeText={(t) => setFormData({...formData, address: t})}
            />
          </View>

          <View className="flex-row space-x-4 mb-4">
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">Start Date (YYYY-MM-DD) *</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                placeholder="2025-01-01"
                value={formData.start_date}
                onChangeText={(t) => setFormData({...formData, start_date: t})}
              />
            </View>
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">End Date (YYYY-MM-DD) *</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                placeholder="2026-01-01"
                value={formData.end_date}
                onChangeText={(t) => setFormData({...formData, end_date: t})}
              />
            </View>
          </View>

          <Text className="text-xl font-bold text-gray-800 mb-6 mt-4">Assignments</Text>
          
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

          <TouchableOpacity 
            onPress={handleSubmit}
            disabled={loading}
            className="bg-brand-orange py-4 rounded-xl items-center flex-row justify-center"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Create Project</Text>}
          </TouchableOpacity>
          
        </View>
      </ScrollView>
    </View>
  );
}
