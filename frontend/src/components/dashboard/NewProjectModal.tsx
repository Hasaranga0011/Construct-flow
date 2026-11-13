import { DateField } from '../common/DateField';
import { getApiUrl } from '../../lib/apiUrl';
import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { InteractiveMap, InteractiveMapRef, MapLocation } from '../common/InteractiveMap';
import { toast } from '../../lib/toast';
import { ProjectAssignmentDropdown } from '../common/ProjectAssignmentDropdown';
import { PROJECT_IMAGE_PRESETS } from '../../utils/projectImages';
import { ProjectImageUploader } from '../common/ProjectImageUploader';
import * as DocumentPicker from 'expo-document-picker';
import { formatMoney } from '../../utils/format';

type NewProjectModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const defaultCenter: MapLocation = {
  lat: 7.8731, // Default to Sri Lanka
  lng: 80.7718
};

export const NewProjectModal = ({ visible, onClose, onSuccess }: NewProjectModalProps) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [pmId, setPmId] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedSiteManagers, setSelectedSiteManagers] = useState<string[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [isTest, setIsTest] = useState(false);
  const [images, setImages] = useState<string[]>([PROJECT_IMAGE_PRESETS[0].url]);

  // Smart BOQ ingestion state
  const [boqData, setBoqData] = useState<any>(null);
  const [boqFileName, setBoqFileName] = useState<string>('');
  const [parsingBoq, setParsingBoq] = useState<boolean>(false);
  const [showBoqDetails, setShowBoqDetails] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Milestones State
  const [milestones, setMilestones] = useState<{ title: string, description: string, due_date: string }[]>([]);

  const addMilestone = () => setMilestones([...milestones, { title: '', description: '', due_date: '' }]);

  const updateMilestone = (index: number, field: string, value: string) => {
    const newMilestones = [...milestones];
    newMilestones[index] = { ...newMilestones[index], [field]: value };
    setMilestones(newMilestones);
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  // Map state
  const mapRef = useRef<InteractiveMapRef>(null);
  const [markerPos, setMarkerPos] = useState<MapLocation | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [pmData, clientData, smData, workerData, supplierData, adminData] = await Promise.all([
          supabase.from('profiles').select('*').in('role', ['pm', 'Project Manager', 'project_manager']),
          supabase.from('profiles').select('*').in('role', ['client', 'Client']),
          supabase.from('profiles').select('*').in('role', ['site_manager', 'Site Manager', 'site manager']),
          supabase.from('profiles').select('*').in('role', ['worker', 'Worker']),
          supabase.from('profiles').select('*').in('role', ['supplier', 'Supplier']),
          supabase.from('profiles').select('*').in('role', ['admin', 'Admin', 'super_admin', 'Super Admin']),
        ]);

        setPms(pmData.data || []);
        setClients(clientData.data || []);
        setSiteManagers(smData.data || []);
        setAvailableWorkers(workerData.data || []);
        setSuppliers(supplierData.data || []);
        setAdmins(adminData.data || []);
      } catch (err) {
        console.error('Failed to fetch users for project assignments', err);
      }
    };

    if (visible) fetchUsers();
  }, [visible]);

  const [isSearchingMap, setIsSearchingMap] = useState(false);

  const handleSearchMap = async () => {
    if (!mapSearchQuery || !mapSearchQuery.trim()) return;
    const query = mapSearchQuery.trim();
    setIsSearchingMap(true);
    setErrorMsg('');

    try {
      let foundResults: { lat: number; lon: number; display_name: string }[] = [];

      // 1. Primary: ConstructFlow backend geocoding route
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${getApiUrl()}/projects/geocode?q=${encodeURIComponent(query)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            foundResults = data.map((item: any) => ({
              lat: typeof item.lat === 'number' ? item.lat : parseFloat(item.lat),
              lon: typeof item.lon === 'number' ? item.lon : parseFloat(item.lon),
              display_name: item.display_name || '',
            }));
          }
        }
      } catch (backendErr) {
        console.warn('Backend geocode request failed, falling back to direct client search:', backendErr);
      }

      // 2. Client-side fallback: Photon (free Komoot OSM with typo tolerance)
      if (!foundResults || foundResults.length === 0) {
        try {
          const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
          if (photonRes.ok) {
            const photonData = await photonRes.json();
            const features = photonData?.features || [];
            if (features.length > 0) {
              foundResults = features.map((f: any) => {
                const props = f.properties || {};
                const coords = f.geometry?.coordinates || [0, 0];
                const parts = [props.name, props.street, props.district, props.city, props.state, props.country].filter(Boolean);
                const uniqueParts = parts.filter((val: string, idx: number) => parts.indexOf(val) === idx);
                return {
                  lat: coords[1],
                  lon: coords[0],
                  display_name: uniqueParts.join(', ') || props.name || 'Selected Location',
                };
              });
            }
          }
        } catch (photonErr) {
          console.warn('Photon geocode fallback error:', photonErr);
        }
      }

      // 3. Fallback: Nominatim OpenStreetMap with progressive retries
      if (!foundResults || foundResults.length === 0) {
        let queryParts = query.split(/\s+/);
        while (queryParts.length > 0) {
          const subQuery = queryParts.join(' ');
          try {
            const osmRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(subQuery)}&format=json&limit=5&countrycodes=lk`,
              { headers: { 'User-Agent': 'ConstructFlow/1.0' } }
            );
            if (osmRes.ok) {
              const text = await osmRes.text();
              if (text.startsWith('[') || text.startsWith('{')) {
                const osmData = JSON.parse(text);
                if (Array.isArray(osmData) && osmData.length > 0) {
                  foundResults = osmData.map((item: any) => ({
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    display_name: item.display_name || '',
                  }));
                  break;
                }
              }
            }
          } catch {
            // Drop trailing word and retry
          }
          queryParts.pop();
        }
      }

      if (foundResults && foundResults.length > 0) {
        const topResult = foundResults[0];
        const loc = { lat: topResult.lat, lng: topResult.lon };
        setMarkerPos(loc);
        setLocation(topResult.display_name);

        mapRef.current?.flyTo(loc.lat, loc.lng, 15);

        setMapSearchResults(foundResults);
        setErrorMsg('');
      } else {
        setMapSearchResults([]);
        setErrorMsg('Location not found. Try searching a nearby city, street, or landmark.');
      }
    } catch (e: any) {
      console.warn('Map search error:', e);
      setErrorMsg('Failed to search map. Please click on the map to pin a location directly.');
    } finally {
      setIsSearchingMap(false);
    }
  };

  const handleLocationSelect = useCallback(async ({ lat, lng }: MapLocation) => {
    setMarkerPos({ lat, lng });

    // 1. Try backend reverse geocoding
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${getApiUrl()}/projects/reverse-geocode?lat=${lat}&lng=${lng}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          setLocation(data.display_name);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // 2. Client-side Photon reverse geocoding
    try {
      const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
      if (pRes.ok) {
        const pData = await pRes.json();
        const f = pData?.features?.[0];
        if (f) {
          const props = f.properties || {};
          const parts = [props.name, props.street, props.district, props.city, props.state, props.country].filter(Boolean);
          const uniqueParts = parts.filter((val: string, idx: number) => parts.indexOf(val) === idx);
          if (uniqueParts.length > 0) {
            setLocation(uniqueParts.join(', '));
            return;
          }
        }
      }
    } catch {
      // Fallback
    }

    // 3. Fallback to client-side Nominatim reverse geocode
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
        headers: { 'User-Agent': 'ConstructFlow/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          setLocation(data.display_name);
          return;
        }
      }
    } catch {
      // Keep fallback
    }

    setLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
  }, []);

  // BOQ Handlers
  const handleParseBoq = async (fileObj?: any, csvText?: string, filename: string = 'boq.csv') => {
    setParsingBoq(true);
    setErrorMsg('');
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

      // Seed milestones if empty
      if (milestones.length === 0 && Array.isArray(data.milestones) && data.milestones.length > 0) {
        const seeded = data.milestones.map((m: any) => ({
          title: m.title || '',
          description: m.description || '',
          due_date: endDate || ''
        }));
        setMilestones(seeded);
      }

      toast.success(`BOQ parsed: ${data.items_count} items. Total: ${formatMoney(data.total_budget)}`);
    } catch (err: any) {
      const readable = err?.message || 'Unable to parse BOQ';
      setErrorMsg(readable);
      toast.error(readable);
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
      toast.error(err.message || 'Failed to pick file');
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
      toast.error(err.message || 'Failed to load sample BOQ');
    } finally {
      setParsingBoq(false);
    }
  };

  const handleClearBoq = () => {
    setBoqData(null);
    setBoqFileName('');
    setShowBoqDetails(false);
  };

  const handleCreate = async () => {
    if (!name || !location || !startDate || !endDate) {
      setErrorMsg('Please fill in all required fields (Name, Location, Start and End dates)');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      setErrorMsg('Dates must be in YYYY-MM-DD format');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      let resolvedClientId = clientId;
      if (clientEmail.trim()) {
        const cleanEmail = clientEmail.trim();
        const { data: existingClient, error: clientLookupError } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (clientLookupError) throw clientLookupError;
        if (existingClient && existingClient.id) {
          resolvedClientId = existingClient.id;
          setClientId(existingClient.id);
        }
      }

      const validMilestones = milestones.filter(m => m.title && m.due_date);
      const computedBudget = Number(totalBudget) || (boqData?.total_budget ? Number(boqData.total_budget) : 0);

      const payload = {
        name,
        location,
        address: location,
        status: 'active',
        image_url: images[0] || null,
        images: images,
        start_date: startDate,
        end_date: endDate,
        client_id: resolvedClientId || null,
        pm_id: pmId || null,
        site_managers: selectedSiteManagers,
        workers: selectedWorkers,
        suppliers: selectedSuppliers,
        admins: selectedAdmins,
        milestones: validMilestones,
        total_budget: computedBudget,
        is_test: isTest,
        latitude: markerPos?.lat ?? null,
        longitude: markerPos?.lng ?? null,
        boq_data: boqData || null,
      };

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (__DEV__) {
        console.log('[DEBUG POST /projects Request]:', payload);
      }

      const response = await fetch(`${getApiUrl()}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let detailMsg = 'Failed to create project';
        try {
          const errData = await response.json();
          if (__DEV__) {
            console.log('[DEBUG POST /projects Error Response]:', response.status, errData);
          }
          if (typeof errData.detail === 'string') {
            detailMsg = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            detailMsg = errData.detail.map((d: any) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ');
          } else if (errData.message) {
            detailMsg = errData.message;
          }
        } catch {
          detailMsg = await response.text();
        }
        throw new Error(detailMsg || `Error ${response.status}`);
      }

      const newProject = await response.json();
      if (__DEV__) {
        console.log('[DEBUG POST /projects Success]:', newProject);
      }

      // Best-effort optional client email dispatch in background
      if (clientEmail.trim()) {
        fetch(`${getApiUrl()}/notifications/email/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            to: clientEmail.trim(),
            subject: `New project started: ${name}`,
            html_body: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #F97316; padding: 24px; border-radius: 12px 12px 0 0;">
                  <h1 style="color: white; margin: 0;">ConstructFlow</h1>
                </div>
                <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
                  <h2 style="color: #1F2937;">New project started</h2>
                  <p style="color: #6B7280;">A new project has been started for you:</p>
                  <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Project:</strong> ${name}</p>
                    <p style="margin: 4px 0;"><strong>Location:</strong> ${location}</p>
                  </div>
                  <p style="color: #6B7280;">Please log in to the client portal to track milestones and project updates.</p>
                </div>
              </div>
            `,
          }),
        }).catch((err) => console.warn('Background email send failed:', err));
      }

      toast.success('Project created successfully!');

      setName('');
      setLocation('');
      setStartDate('');
      setEndDate('');
      setClientEmail('');
      setTotalBudget('');
      setIsTest(false);
      setImages([PROJECT_IMAGE_PRESETS[0].url]);
      setMarkerPos(null);
      setMapSearchResults([]);
      setMilestones([]);
      setPmId('');
      setClientId('');
      setSelectedSiteManagers([]);
      setSelectedWorkers([]);
      setSelectedSuppliers([]);
      setSelectedAdmins([]);
      setBoqData(null);
      setBoqFileName('');
      setShowBoqDetails(false);

      onSuccess();
      onClose();
    } catch (e: any) {
      const readable = typeof e === 'object' && e !== null ? (e.message || String(e)) : String(e);
      setErrorMsg(readable || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-4xl lg:max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">

          {/* Sticky Header */}
          <View className="flex-row justify-between items-center px-6 py-4 border-b border-gray-100 bg-brand-light flex-shrink-0">
            <View className="flex-row items-center gap-2.5">
              <View className="w-9 h-9 rounded-xl bg-orange-100 items-center justify-center">
                <Ionicons name="business" size={20} color="#EA580C" />
              </View>
              <View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">
                  Create New Project
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">
                  Configure site, timeline, budget, BOQ and team assignments
                </Text>
              </View>
            </View>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={22} color="#6B7280" />
            </Pressable>
          </View>

          {/* Scrollable Body */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24, paddingBottom: 28 }}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
          >
            {errorMsg ? (
              <View className="bg-red-50 p-3.5 rounded-xl border border-red-200 mb-6 flex-row items-center">
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-xs font-medium ml-2 flex-1">
                  {errorMsg}
                </Text>
              </View>
            ) : null}

            <View className="flex-col md:flex-row gap-6">
              {/* Left Column: Core Details, BOQ, Images & Schedule */}
              <View className="w-full md:flex-1 pr-0 md:pr-4 md:border-r border-gray-100 min-w-0">
                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1.5">
                    Project Name *
                  </Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="e.g. Marina Tower, Colombo 03"
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      if (/test|demo|sample/i.test(t)) {
                        setIsTest(true);
                      }
                    }}
                  />
                </View>

                {/* Project Photos & Cover (Up to 5 images) */}
                <ProjectImageUploader
                  images={images}
                  onChangeImages={setImages}
                  maxImages={5}
                  projectName={name || 'New Project'}
                />

                {/* Test Project Toggle */}
                <Pressable
                  onPress={() => setIsTest(!isTest)}
                  className={`p-3 rounded-xl border mb-4 flex-row items-center justify-between ${
                    isTest ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <View className="flex-1 pr-3">
                    <View className="flex-row items-center mb-0.5">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">
                        Mark as Test Project
                      </Text>
                      {isTest && (
                        <View className="ml-2 bg-amber-200 px-1.5 py-0.5 rounded">
                          <Text className="text-[10px] font-bold text-amber-800">EXCLUDED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">
                      Excludes from live dashboards, delay alerts & ML training
                    </Text>
                  </View>
                  <View className={`w-5 h-5 rounded items-center justify-center border ${
                    isTest ? 'bg-amber-600 border-amber-600' : 'bg-white border-gray-300'
                  }`}>
                    {isTest && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </Pressable>

                {/* Smart BOQ & Budget Allocation Section */}
                <View className="mb-4 bg-orange-50/60 border border-orange-200/80 rounded-2xl p-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <View className="w-7 h-7 rounded-lg bg-orange-100 items-center justify-center mr-2">
                        <Ionicons name="calculator-outline" size={16} color="#EA580C" />
                      </View>
                      <View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">
                          Bill of Quantities (BOQ) & Budget
                        </Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">
                          Ingest Excel/CSV for automatic budget & CIDA rates validation
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Total Budget Input */}
                  <View className="mb-3">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-gray-700 mb-1">
                      Total Project Budget (LKR)
                    </Text>
                    <TextInput
                      maxFontSizeMultiplier={1.3}
                      style={{ minHeight: 40 }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-brand-text font-semibold focus:border-brand-orange"
                      placeholder="e.g. 25000000"
                      keyboardType="numeric"
                      value={totalBudget}
                      onChangeText={setTotalBudget}
                    />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500 mt-1">
                      {totalBudget && !isNaN(Number(totalBudget))
                        ? `Formatted: ${formatMoney(Number(totalBudget))}`
                        : 'Auto-calculated when a BOQ document is uploaded.'}
                    </Text>
                  </View>

                  {!boqData ? (
                    <View className="bg-white border border-dashed border-gray-300 rounded-xl p-3 items-center">
                      <Ionicons name="cloud-upload-outline" size={24} color="#9CA3AF" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mt-1">
                        Attach Project BOQ Document
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400 text-center mb-2.5">
                        Supports Excel (.xlsx) and CSV with items, quantities & rates
                      </Text>

                      {parsingBoq ? (
                        <View className="flex-row items-center py-1">
                          <ActivityIndicator color="#EA580C" size="small" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-orange-600 ml-2">
                            Parsing items & cross-checking CIDA rates...
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row flex-wrap gap-2 justify-center">
                          <Pressable
                            style={{ minHeight: 36 }}
                            onPress={handlePickBoqFile}
                            className="bg-brand-orange hover:bg-orange-600 px-3 py-1.5 rounded-lg flex-row items-center transition-colors"
                          >
                            <Ionicons name="document-attach-outline" size={14} color="#fff" />
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-white ml-1.5">
                              Upload File (.xlsx, .csv)
                            </Text>
                          </Pressable>

                          <Pressable
                            style={{ minHeight: 36 }}
                            onPress={handleLoadSampleBoq}
                            className="bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3 py-1.5 rounded-lg flex-row items-center transition-colors"
                          >
                            <Ionicons name="sparkles" size={13} color="#4B5563" />
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 ml-1.5">
                              Sample CIDA BOQ
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View className="bg-white border border-green-200 rounded-xl p-3 shadow-sm">
                      <View className="flex-row items-center justify-between pb-2 border-b border-gray-100">
                        <View className="flex-row items-center flex-1 pr-2">
                          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                          <View className="ml-2 flex-1">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-900" numberOfLines={1}>
                              {boqFileName || 'Uploaded BOQ'}
                            </Text>
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">
                              {boqData.items_count} items analyzed • Feasibility: {boqData.feasibility_score}%
                            </Text>
                          </View>
                        </View>
                        <Pressable style={{ minHeight: 32, minWidth: 32 }} onPress={handleClearBoq} className="p-1 rounded hover:bg-red-50">
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </Pressable>
                      </View>

                      <View className="flex-row items-center justify-between mt-2 pt-1">
                        <Pressable
                          onPress={() => setShowBoqDetails(!showBoqDetails)}
                          className="flex-row items-center"
                        >
                          <Ionicons name={showBoqDetails ? 'chevron-up' : 'chevron-down'} size={14} color="#EA580C" />
                          <Text className="text-[11px] font-semibold text-brand-orange ml-1">
                            {showBoqDetails ? 'Hide Breakdown' : 'View Stages & Rates'}
                          </Text>
                        </Pressable>
                        <Text className="text-xs font-bold text-gray-800">
                          {formatMoney(boqData.total_budget || 0)}
                        </Text>
                      </View>

                      {showBoqDetails && (
                        <View className="mt-2.5 pt-2 border-t border-gray-100">
                          {boqData.stage_budgets && (
                            <View className="mb-2">
                              <Text className="text-[10px] font-bold text-gray-600 mb-1">Stage Breakdown:</Text>
                              {Object.entries(boqData.stage_budgets).map(([stage, amount]: any) => (
                                <View key={stage} className="flex-row justify-between py-0.5">
                                  <Text className="text-[10px] text-gray-600">{stage}</Text>
                                  <Text className="text-[10px] font-semibold text-gray-800">{formatMoney(Number(amount))}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          {boqData.rate_warnings && boqData.rate_warnings.length > 0 && (
                            <View className="bg-amber-50 rounded p-2 mt-1 border border-amber-200">
                              <Text className="text-[10px] font-bold text-amber-800 mb-0.5">
                                CIDA Rate Warnings ({boqData.rate_warnings.length}):
                              </Text>
                              {boqData.rate_warnings.slice(0, 3).map((w: any, idx: number) => (
                                <Text key={idx} className="text-[9px] text-amber-700">
                                  • {w.description}: Rs. {w.boq_rate} (CIDA bench: Rs. {w.benchmark_rate})
                                </Text>
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Dates: 2-column layout */}
                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1.5">
                      Start Date *
                    </Text>
                    <DateField label="Start date" mode="date" value={startDate} onChange={setStartDate} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1.5">
                      End Date *
                    </Text>
                    <DateField label="End date" mode="date" value={endDate} onChange={setEndDate} />
                  </View>
                </View>

                {/* Client Selection & Notification */}
                <ProjectAssignmentDropdown
                  label="Assign Client"
                  users={clients}
                  selectedIds={clientId ? [clientId] : []}
                  onChange={(ids) => {
                    setClientId(ids[0] || '');
                    const selectedClient = clients.find((user) => user.id === (ids[0] || ''));
                    if (selectedClient?.email) setClientEmail(selectedClient.email);
                  }}
                />

                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1">
                    Client Email (for notification)
                  </Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 40, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="client@example.com"
                    keyboardType="email-address"
                    value={clientEmail}
                    onChangeText={setClientEmail}
                  />
                </View>
              </View>

              {/* Right Column: Location, Map & Team Assignments */}
              <View className="w-full md:flex-1 pl-0 md:pl-4 mt-4 md:mt-0 min-w-0">
                <View className="mb-3">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1.5">
                    Selected Location Address *
                  </Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 40, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Exact address will appear here"
                    value={location}
                    onChangeText={setLocation}
                  />
                </View>

                <View className="mb-2">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1">
                    Search Location & Pin Site
                  </Text>
                  <View className="flex-row gap-2">
                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 40, minWidth: 44 }}
                      className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="Type city or place name..."
                      value={mapSearchQuery}
                      onChangeText={setMapSearchQuery}
                      onSubmitEditing={handleSearchMap}
                      returnKeyType="search"
                    />
                    <Pressable style={{ minHeight: 40, minWidth: 44 }}
                      onPress={handleSearchMap}
                      disabled={isSearchingMap}
                      className="bg-blue-600 px-3.5 items-center justify-center rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      {isSearchingMap ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Ionicons name="search" size={18} color="white" />
                      )}
                    </Pressable>
                  </View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-400 mt-1 mb-2">
                    Type a city or click anywhere on the map to pin the construction site.
                  </Text>

                  {mapSearchResults.length > 1 && (
                    <View className="mb-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                        Alternative Matches
                      </Text>
                      {mapSearchResults.slice(1).map((result, idx) => (
                        <Pressable style={{ minHeight: 36, minWidth: 44 }}
                          key={idx}
                          onPress={() => {
                            const loc = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
                            setMarkerPos(loc);
                            setLocation(result.display_name);
                            mapRef.current?.flyTo(loc.lat, loc.lng, 14);
                            setMapSearchResults([]);
                          }}
                          className={`px-3 py-2 ${idx !== mapSearchResults.length - 2 ? 'border-b border-gray-100' : ''}`}
                        >
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-700">
                            {result.display_name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {/* Map */}
                <View className="mb-4 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                  <InteractiveMap
                    ref={mapRef}
                    markerPos={markerPos}
                    onLocationSelect={handleLocationSelect}
                    defaultCenter={defaultCenter}
                    height={230}
                    interactive={true}
                    showControls={true}
                    showCurrentLocationButton={true}
                    showLayerToggle={true}
                  />
                </View>

                {/* Team Assignment Dropdowns */}
                <ProjectAssignmentDropdown
                  label="Assign Project Manager"
                  users={pms}
                  selectedIds={pmId ? [pmId] : []}
                  onChange={(ids) => setPmId(ids[0] || '')}
                />

                <ProjectAssignmentDropdown
                  label="Assign Site Managers"
                  users={siteManagers}
                  multiple
                  selectedIds={selectedSiteManagers}
                  onChange={setSelectedSiteManagers}
                />

                <ProjectAssignmentDropdown
                  label="Assign Workers"
                  users={availableWorkers}
                  multiple
                  selectedIds={selectedWorkers}
                  onChange={setSelectedWorkers}
                />

                <ProjectAssignmentDropdown
                  label="Assign Suppliers"
                  users={suppliers}
                  multiple
                  selectedIds={selectedSuppliers}
                  onChange={setSelectedSuppliers}
                />

                <ProjectAssignmentDropdown
                  label="Assign Administrators"
                  users={admins}
                  multiple
                  selectedIds={selectedAdmins}
                  onChange={setSelectedAdmins}
                />
              </View>
            </View>

            {/* Milestones Section */}
            <View className="mt-6 border-t border-gray-100 pt-5">
              <View className="flex-row flex-wrap gap-3 justify-between items-center mb-3">
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-800">
                    Project Milestones
                  </Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400">
                    Key project stages and delivery checkpoints
                  </Text>
                </View>
                <Pressable style={{ minHeight: 38, minWidth: 44 }} onPress={addMilestone} className="flex-row items-center bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                  <Ionicons name="add" size={16} color="#374151" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-semibold ml-1 text-xs">
                    Add Milestone
                  </Text>
                </Pressable>
              </View>

              {milestones.length === 0 ? (
                <View className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-xs">
                    No milestones added yet. Uploading a BOQ will automatically seed milestones, or you can add them manually.
                  </Text>
                </View>
              ) : (
                milestones.map((ms, index) => (
                  <View key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 mb-3">
                    <View className="flex-row justify-between mb-2">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700">
                        Milestone {index + 1}
                      </Text>
                      <Pressable style={{ minHeight: 32, minWidth: 32 }} onPress={() => removeMilestone(index)}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </Pressable>
                    </View>

                    <View className="flex-col sm:flex-row gap-3 mb-2">
                      <View className="flex-[2]">
                        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 40, minWidth: 44 }}
                          placeholder="Title (e.g. Substructure & Foundation)"
                          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs"
                          value={ms.title}
                          onChangeText={(t) => updateMilestone(index, 'title', t)}
                        />
                      </View>
                      <View className="flex-1">
                        <DateField label="Milestone due date" mode="date" value={ms.due_date} onChange={(value) => updateMilestone(index, 'due_date', value)} />
                      </View>
                    </View>

                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 40, minWidth: 44 }}
                      placeholder="Description (Optional)"
                      className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs"
                      value={ms.description}
                      onChangeText={(t) => updateMilestone(index, 'description', t)}
                    />
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {/* Sticky Modal Action Footer */}
          <View className="flex-shrink-0 border-t border-gray-100 bg-gray-50 px-6 py-4 flex-row items-center justify-between gap-3">
            <View className="flex-row items-center">
              {boqData ? (
                <View className="flex-row items-center bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <Text className="text-xs font-semibold text-green-700 ml-1.5">
                    BOQ Attached ({formatMoney(boqData.total_budget || 0)})
                  </Text>
                </View>
              ) : (
                <Text className="text-xs text-gray-400 hidden sm:flex">
                  * Required fields must be filled to create project
                </Text>
              )}
            </View>

            <View className="flex-row items-center gap-3">
              <Pressable
                style={{ minHeight: 44, minWidth: 90 }}
                onPress={onClose}
                disabled={loading}
                className="bg-white border border-gray-300 px-5 py-2.5 rounded-xl items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-sm">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={{ minHeight: 44, minWidth: 140 }}
                onPress={handleCreate}
                disabled={loading}
                className={`bg-brand-orange px-6 py-2.5 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">
                    Create Project
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

        </View>
      </ModalViewport>
    </Modal>
  );
};
