import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { ProjectAssignmentDropdown } from '../../../components/common/ProjectAssignmentDropdown';
import { InteractiveMap, InteractiveMapRef, MapLocation } from '@/components/common/InteractiveMap';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_IMAGE_PRESETS } from '../../../utils/projectImages';
import { ProjectImage } from '../../../components/common/ProjectImage';
import { ProjectImageUploader } from '../../../components/common/ProjectImageUploader';

export default function AdminProjectsCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  const [images, setImages] = useState<string[]>([]);
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
    longitude: '',
    is_test: false
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

  const mapRef = React.useRef<InteractiveMapRef>(null);

  const handleLocationSelect = async ({ lat, lng }: MapLocation) => {
    setFormData(prev => ({
      ...prev,
      latitude: String(lat),
      longitude: String(lng),
    }));

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${getApiUrl()}/projects/reverse-geocode?lat=${lat}&lng=${lng}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          setFormData(prev => ({
            ...prev,
            address: data.display_name,
            location: prev.location || data.display_name.split(',')[0],
          }));
          return;
        }
      }
    } catch {}

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
        headers: { 'User-Agent': 'ConstructFlow/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          setFormData(prev => ({
            ...prev,
            address: data.display_name,
            location: prev.location || data.display_name.split(',')[0],
          }));
          return;
        }
      }
    } catch {}
  };

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
        image_url: images[0] || null,
        images: images,
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
        is_test: formData.is_test,
      };

      const response = await fetch(`${getApiUrl()}/projects`, {
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
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-3xl mx-auto w-full">

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6">Project Details</Text>

          {/* Form Fields */}
          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Project Name *</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Skyline Towers"
              value={formData.name}
              onChangeText={(t) => {
                const isAutoTest = /test|demo|sample/i.test(t);
                setFormData(prev => ({
                  ...prev,
                  name: t,
                  is_test: prev.is_test || isAutoTest
                }));
              }}
            />
          </View>

          {/* Project Images Uploader (Up to 5 images) */}
          <ProjectImageUploader
            images={images}
            onChangeImages={setImages}
            maxImages={5}
            projectName={formData.name || 'New Project'}
          />

          {/* Test Project Toggle */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFormData(prev => ({ ...prev, is_test: !prev.is_test }))}
            className={`p-4 rounded-xl border mb-5 flex-row items-center justify-between ${
              formData.is_test ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <View className="flex-1 pr-3">
              <View className="flex-row items-center mb-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-800">
                  Mark as Test / Demo Project
                </Text>
                {formData.is_test && (
                  <View className="ml-2 bg-amber-500/20 px-2 py-0.5 rounded">
                    <Text className="text-[10px] font-bold text-amber-800">EXCLUDED</Text>
                  </View>
                )}
              </View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">
                Excluded from live company stats, Delay Risk alerts, and AI cost estimation training data.
              </Text>
            </View>
            <View className={`w-6 h-6 rounded-md items-center justify-center border ${
              formData.is_test ? 'bg-amber-600 border-amber-600' : 'bg-white border-gray-300'
            }`}>
              {formData.is_test && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
          </TouchableOpacity>

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Short Location *</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Colombo 03"
              value={formData.location}
              onChangeText={(t) => setFormData({...formData, location: t})}
            />
          </View>

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Full Address</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. 123 Galle Rd, Colombo"
              value={formData.address}
              onChangeText={(t) => setFormData({...formData, address: t})}
            />
          </View>

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-1">Interactive Site Map</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-2">Tap to pin exact site location or use GPS button.</Text>
            <InteractiveMap
              ref={mapRef}
              markerPos={
                formData.latitude && formData.longitude
                  ? { lat: parseFloat(formData.latitude), lng: parseFloat(formData.longitude) }
                  : null
              }
              onLocationSelect={handleLocationSelect}
              height={220}
              interactive={true}
              showControls={true}
              showCurrentLocationButton={true}
              showLayerToggle={true}
            />
          </View>

          <View className="flex-row space-x-4 mb-4">
            <View className="flex-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Start Date (YYYY-MM-DD) *</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                placeholder="2025-01-01"
                value={formData.start_date}
                onChangeText={(t) => setFormData({...formData, start_date: t})}
              />
            </View>
            <View className="flex-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">End Date (YYYY-MM-DD) *</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                placeholder="2026-01-01"
                value={formData.end_date}
                onChangeText={(t) => setFormData({...formData, end_date: t})}
              />
            </View>
          </View>

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6 mt-4">Assignments</Text>
          <ProjectAssignmentDropdown label="Assign Administrators" users={admins} multiple selectedIds={formData.admins} onChange={(admins) => setFormData({ ...formData, admins })} />
          <ProjectAssignmentDropdown label="Assign Project Manager" users={pms} selectedIds={formData.pm_id ? [formData.pm_id] : []} onChange={(ids) => setFormData({ ...formData, pm_id: ids[0] || '' })} />
          <ProjectAssignmentDropdown label="Assign Client" users={clients} selectedIds={formData.client_id ? [formData.client_id] : []} onChange={(ids) => setFormData({ ...formData, client_id: ids[0] || '' })} />
          <ProjectAssignmentDropdown label="Assign Site Managers" users={siteManagers} multiple selectedIds={formData.site_managers} onChange={(site_managers) => setFormData({ ...formData, site_managers })} />
          <ProjectAssignmentDropdown label="Assign Workers" users={availableWorkers} multiple selectedIds={formData.workers} onChange={(workers) => setFormData({ ...formData, workers })} />
          <ProjectAssignmentDropdown label="Assign Suppliers" users={suppliers} multiple selectedIds={formData.suppliers} onChange={(suppliers) => setFormData({ ...formData, suppliers })} />

          <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
            onPress={handleSubmit}
            disabled={loading}
            className="bg-brand-orange py-4 rounded-xl items-center flex-row justify-center"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Create Project</Text>}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </View>
  );
}
