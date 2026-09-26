import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { ProjectAssignmentDropdown } from '../../../components/common/ProjectAssignmentDropdown';

export default function AdminProjectsCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  
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
    suppliers: [] as string[],
    admins: [] as string[],
    latitude: '',
    longitude: ''
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchUsers = async () => {
      try {
        const { data: pmData } = await supabase.from('profiles').select('*').in('role', ['pm', 'Project Manager', 'project_manager']);
        const { data: clientData } = await supabase.from('profiles').select('*').in('role', ['client', 'Client']);
        const { data: smData } = await supabase.from('profiles').select('*').in('role', ['site_manager', 'Site Manager', 'site manager']);
        const { data: workerData } = await supabase.from('profiles').select('*').in('role', ['worker', 'Worker']);
        const { data: supplierData } = await supabase.from('profiles').select('*').in('role', ['supplier', 'Supplier']);
        const { data: adminData } = await supabase.from('profiles').select('*').in('role', ['admin', 'Admin', 'super_admin', 'Super Admin']);
        
        if (isMounted) {
          if (pmData) setPms(pmData);
          if (clientData) setClients(clientData);
          if (smData) setSiteManagers(smData);
          if (workerData) setAvailableWorkers(workerData);
          if (supplierData) setSuppliers(supplierData);
          if (adminData) setAdmins(adminData);
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
        suppliers: formData.suppliers,
        admins: formData.admins,
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
      
      const newProject = await response.json();
      
      Alert.alert('Success', 'Project created successfully!');
      router.push(`/admin/projects/${newProject.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error creating project');
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
          <ProjectAssignmentDropdown label="Assign Administrators" users={admins} multiple selectedIds={formData.admins} onChange={(admins) => setFormData({ ...formData, admins })} />
          <ProjectAssignmentDropdown label="Assign Project Manager" users={pms} selectedIds={formData.pm_id ? [formData.pm_id] : []} onChange={(ids) => setFormData({ ...formData, pm_id: ids[0] || '' })} />
          <ProjectAssignmentDropdown label="Assign Client" users={clients} selectedIds={formData.client_id ? [formData.client_id] : []} onChange={(ids) => setFormData({ ...formData, client_id: ids[0] || '' })} />
          <ProjectAssignmentDropdown label="Assign Site Managers" users={siteManagers} multiple selectedIds={formData.site_managers} onChange={(site_managers) => setFormData({ ...formData, site_managers })} />
          <ProjectAssignmentDropdown label="Assign Workers" users={availableWorkers} multiple selectedIds={formData.workers} onChange={(workers) => setFormData({ ...formData, workers })} />
          <ProjectAssignmentDropdown label="Assign Suppliers" users={suppliers} multiple selectedIds={formData.suppliers} onChange={(suppliers) => setFormData({ ...formData, suppliers })} />

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
