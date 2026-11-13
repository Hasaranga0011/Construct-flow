import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { ProjectAssignmentDropdown } from '../../../components/common/ProjectAssignmentDropdown';
import { InteractiveMap, InteractiveMapRef, MapLocation } from '@/components/common/InteractiveMap';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PROJECT_IMAGE_PRESETS } from '../../../utils/projectImages';
import { ProjectImage } from '../../../components/common/ProjectImage';
import { ProjectImageUploader } from '../../../components/common/ProjectImageUploader';
import * as DocumentPicker from 'expo-document-picker';
import { formatMoney } from '../../../utils/format';

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
  const [totalBudget, setTotalBudget] = useState('');
  const [boqData, setBoqData] = useState<any | null>(null);
  const [boqFileName, setBoqFileName] = useState('');
  const [parsingBoq, setParsingBoq] = useState(false);
  const [showBoqDetails, setShowBoqDetails] = useState(false);

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
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url')
          .order('full_name');

        if (isMounted && allProfiles) {
          const norm = (r?: string | null) => String(r || '').trim().toLowerCase().replace(/\s+/g, '_');
          setPms(allProfiles.filter(u => ['pm', 'project_manager', 'manager'].includes(norm(u.role))));
          setClients(allProfiles.filter(u => norm(u.role) === 'client'));
          setSiteManagers(allProfiles.filter(u => ['site_manager', 'sitemanager'].includes(norm(u.role))));
          setAvailableWorkers(allProfiles.filter(u => norm(u.role) === 'worker'));
          setSuppliers(allProfiles.filter(u => norm(u.role) === 'supplier'));
          setAdmins(allProfiles.filter(u => ['admin', 'super_admin', 'superadmin'].includes(norm(u.role))));
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

  const handleParseBoq = async (fileObj?: any, csvText?: string, filename: string = 'boq.csv') => {
    setParsingBoq(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Authentication required.');

      const formDataUpload = new FormData();
      if (fileObj) {
        if (Platform.OS === 'web') {
          formDataUpload.append('file', fileObj);
        } else {
          formDataUpload.append('file', {
            uri: fileObj.uri,
            name: fileObj.name || filename,
            type: fileObj.type || 'text/csv'
          } as any);
        }
      } else if (csvText) {
        formDataUpload.append('csv_data', csvText);
      }

      const res = await fetch(`${getApiUrl()}/projects/parse-boq`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataUpload
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to parse BOQ file');
      }

      setBoqData(data);
      setBoqFileName(filename);
      if (data.total_budget) {
        setTotalBudget(String(data.total_budget));
      }
      Alert.alert(
        'BOQ Processed Successfully',
        `Extracted ${data.items_count} items across ${data.milestones?.length || 0} milestones. Calculated Budget: ${formatMoney(data.total_budget)}`
      );
    } catch (err: any) {
      Alert.alert('BOQ Parsing Error', err.message || 'Unable to parse BOQ');
    } finally {
      setParsingBoq(false);
    }
  };

  const handlePickBoqFile = async () => {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            handleParseBoq(file, undefined, file.name);
          }
        };
        input.click();
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            'text/csv',
            'text/comma-separated-values',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            '*/*'
          ],
          copyToCacheDirectory: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          handleParseBoq(asset, undefined, asset.name);
        }
      }
    } catch (err: any) {
      Alert.alert('File Error', err.message || 'Failed to pick file');
    }
  };

  const handleLoadSampleBoq = async () => {
    setParsingBoq(true);
    try {
      const res = await fetch(`${getApiUrl()}/projects/boq-template`);
      if (!res.ok) throw new Error('Failed to fetch sample BOQ template');
      const data = await res.json();
      if (data.template) {
        await handleParseBoq(undefined, data.template, 'Sample_CIDA_Construction_BOQ.csv');
      }
    } catch (err: any) {
      Alert.alert('Template Error', err.message || 'Failed to load sample BOQ');
    } finally {
      setParsingBoq(false);
    }
  };

  const handleClearBoq = () => {
    setBoqData(null);
    setBoqFileName('');
    setTotalBudget('');
    setShowBoqDetails(false);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.location || !formData.start_date || !formData.end_date) {
      Alert.alert('Validation Error', 'Please fill out all required fields (*)');
      return;
    }

    setLoading(true);
    try {
      const parsedBudget = totalBudget ? parseFloat(totalBudget) : (boqData?.total_budget || 0);

      const payload = {
        name: formData.name,
        location: formData.location,
        address: formData.address || null,
        status: formData.status,
        total_budget: isNaN(parsedBudget) ? 0 : parsedBudget,
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
        boq_data: boqData || null,
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

          {/* BOQ & Budget Baseline Section */}
          <View className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-lg bg-orange-100 items-center justify-center mr-3">
                  <Ionicons name="calculator-outline" size={20} color="#EA580C" />
                </View>
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-800">
                    Bill of Quantities (BOQ) & Budget
                  </Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">
                    Upload an Excel/CSV BOQ to auto-calculate budget and establish material baselines
                  </Text>
                </View>
              </View>
            </View>

            {/* Total Budget Input */}
            <View className="mt-3 mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-700 mb-1">
                Total Project Budget (LKR)
              </Text>
              <TextInput
                maxFontSizeMultiplier={1.3}
                style={{ minHeight: 44 }}
                keyboardType="numeric"
                className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 font-semibold"
                placeholder="e.g. 25000000"
                value={totalBudget}
                onChangeText={setTotalBudget}
              />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-400 mt-1">
                {totalBudget && !isNaN(Number(totalBudget))
                  ? `Formatted: ${formatMoney(Number(totalBudget))}`
                  : 'Enter manually or upload a BOQ file below to auto-calculate.'}
              </Text>
            </View>

            {/* If no BOQ loaded yet */}
            {!boqData && (
              <View className="bg-white border border-dashed border-gray-300 rounded-xl p-4 items-center">
                <Ionicons name="cloud-upload-outline" size={32} color="#9CA3AF" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mt-2">
                  Upload Project BOQ Document
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 text-center mt-0.5 mb-3">
                  Supports Excel (.xlsx, .xls) and CSV with items, quantities, and rates
                </Text>

                {parsingBoq ? (
                  <View className="flex-row items-center py-2">
                    <ActivityIndicator color="#EA580C" size="small" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-orange-600 ml-2">
                      Parsing BOQ & verifying CIDA rates...
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-2 justify-center">
                    <TouchableOpacity
                      style={{ minHeight: 40 }}
                      onPress={handlePickBoqFile}
                      className="bg-brand-orange px-4 py-2 rounded-lg flex-row items-center"
                    >
                      <Ionicons name="document-attach-outline" size={16} color="#fff" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-white ml-1.5">
                        Choose File (.xlsx, .csv)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ minHeight: 40 }}
                      onPress={handleLoadSampleBoq}
                      className="bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3.5 py-2 rounded-lg flex-row items-center"
                    >
                      <Ionicons name="sparkles" size={15} color="#4B5563" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 ml-1.5">
                        Load Sample CIDA BOQ
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* If BOQ successfully loaded & parsed */}
            {boqData && (
              <View className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
                <View className="flex-row items-center justify-between pb-3 border-b border-gray-100">
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="w-8 h-8 rounded-lg bg-green-100 items-center justify-center mr-2.5">
                      <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                    </View>
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-900" numberOfLines={1}>
                        {boqFileName || 'Uploaded BOQ'}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">
                        {boqData.items_count} Line Items Analyzed
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-emerald-700">
                        {boqData.feasibility_score}% Feasibility Score
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ minHeight: 32, minWidth: 32 }}
                      onPress={handleClearBoq}
                      className="p-1.5 rounded-lg hover:bg-red-50"
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Metrics Breakdown */}
                <View className="flex-row flex-wrap gap-3 py-3 border-b border-gray-100">
                  <View className="flex-1 min-w-[130px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-gray-400 uppercase">
                      Calculated Budget
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-orange-600 mt-0.5">
                      {formatMoney(boqData.total_budget)}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-[130px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-gray-400 uppercase">
                      Project Milestones
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-gray-800 mt-0.5">
                      {boqData.milestones?.length || 0} Stages
                    </Text>
                  </View>
                  <View className="flex-1 min-w-[130px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-gray-400 uppercase">
                      Core Materials
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-blue-600 mt-0.5">
                      {boqData.materials?.length || 0} Baselines
                    </Text>
                  </View>
                </View>

                {/* Extracted Milestones List */}
                <View className="mt-3">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-700 mb-1.5">
                    Auto-Generated Milestones (Work Breakdown):
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {boqData.milestones?.map((m: any, idx: number) => (
                      <View key={idx} className="bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg flex-row items-center">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-gray-800">
                          {m.title}
                        </Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500 ml-1.5 font-bold">
                          {formatMoney(m.allocated_budget)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Extracted Materials Baseline */}
                {boqData.materials && boqData.materials.length > 0 && (
                  <View className="mt-3">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-700 mb-1.5">
                      Material Consumption Baselines:
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {boqData.materials.map((mat: any, idx: number) => (
                        <View key={idx} className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-blue-900">
                            {mat.name}: <Text className="font-bold">{mat.allocated_quantity} {mat.unit}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Rate Warnings */}
                {boqData.rate_warnings && boqData.rate_warnings.length > 0 && (
                  <View className="mt-3 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="warning-outline" size={14} color="#D97706" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-amber-800 ml-1">
                        CIDA Market Benchmark Variances ({boqData.rate_warnings.length}):
                      </Text>
                    </View>
                    {boqData.rate_warnings.slice(0, 3).map((w: any, idx: number) => (
                      <Text key={idx} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-amber-700">
                        • {w.message}
                      </Text>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={{ minHeight: 32 }}
                  onPress={() => setShowBoqDetails(!showBoqDetails)}
                  className="mt-3 py-1 flex-row items-center justify-center border-t border-gray-100"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-orange mr-1">
                    {showBoqDetails ? 'Hide Itemized Breakdown' : `View All ${boqData.items_count} Items`}
                  </Text>
                  <Ionicons name={showBoqDetails ? "chevron-up" : "chevron-down"} size={14} color="#EA580C" />
                </TouchableOpacity>

                {showBoqDetails && boqData.items && (
                  <View className="mt-2 max-h-48 overflow-scroll border-t border-gray-100 pt-2">
                    {boqData.items.slice(0, 20).map((it: any, i: number) => (
                      <View key={i} className="flex-row justify-between py-1 border-b border-gray-50">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-700 flex-1 pr-2" numberOfLines={1}>
                          {it.description}
                        </Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-gray-900">
                          {formatMoney(it.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
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
