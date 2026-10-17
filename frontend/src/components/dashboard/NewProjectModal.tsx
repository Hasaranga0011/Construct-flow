import { DateField } from '../common/DateField';
import { getApiUrl } from '../../lib/apiUrl';
import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, Image } from 'react-native';
import { supabase } from '../../lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { InteractiveMap, InteractiveMapRef, MapLocation } from '../common/InteractiveMap';
import { toast } from '../../lib/toast';
import { ProjectAssignmentDropdown } from '../common/ProjectAssignmentDropdown';
import { PROJECT_IMAGE_PRESETS } from '../../utils/projectImages';
import { ProjectImage } from '../common/ProjectImage';
import { ProjectImageUploader } from '../common/ProjectImageUploader';

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

  const handleCreate = async () => {
    if (!name || !location || !startDate || !endDate) {
      setErrorMsg('Please fill in all fields');
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
        total_budget: Number(totalBudget) || 0,
        is_test: isTest,
        latitude: markerPos?.lat ?? null,
        longitude: markerPos?.lng ?? null,
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

      // Best-effort optional client email dispatch in background (never blocks success)
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
        <View className="bg-white max-h-full w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden">

          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Create New Project</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>
            {errorMsg ? (
              <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-sm text-center">{errorMsg}</Text>
              </View>
            ) : null}

            <View className="flex-col md:flex-row">
              {/* Left Column: Form Fields */}
              <View className="w-full md:w-auto md:flex-1 pr-0 md:pr-6 md:border-r border-gray-100 min-w-0">
                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Project Name</Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="e.g. Marina Tower"
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      if (/test|demo|sample/i.test(t)) {
                        setIsTest(true);
                      }
                    }}
                  />
                </View>

                {/* Project Images Uploader (Up to 5 images) */}
                <ProjectImageUploader
                  images={images}
                  onChangeImages={setImages}
                  maxImages={5}
                  projectName={name || 'New Project'}
                />

                {/* Test Project Toggle */}
                <Pressable
                  onPress={() => setIsTest(!isTest)}
                  className={`p-3.5 rounded-xl border mb-5 flex-row items-center justify-between ${
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

                <ProjectAssignmentDropdown
                  label="Assign Project Manager"
                  users={pms}
                  selectedIds={pmId ? [pmId] : []}
                  onChange={(ids) => setPmId(ids[0] || '')}
                />

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

                <ProjectAssignmentDropdown
                  label="Assign Administrators"
                  users={admins}
                  multiple
                  selectedIds={selectedAdmins}
                  onChange={setSelectedAdmins}
                />

                <View className="mb-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Start Date</Text>
                  <DateField label="Start date" mode="date" value={startDate} onChange={setStartDate} />
                </View>

                <View className="mb-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">End Date</Text>
                  <DateField label="End date" mode="date" value={endDate} onChange={setEndDate} />
                </View>
                <View className="mb-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Total Budget (Rs.)</Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="e.g. 5000000"
                    keyboardType="numeric"
                    value={totalBudget}
                    onChangeText={setTotalBudget}
                  />
                </View>

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

                <View className="mb-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Client Email</Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="client@example.com"
                    keyboardType="email-address"
                    value={clientEmail}
                    onChangeText={setClientEmail}
                  />
                </View>
              </View>

              {/* Right Column: Location & Interactive Map */}
              <View className="w-full md:w-auto md:flex-1 pl-0 md:pl-6 mt-6 md:mt-0 min-w-0">
                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Selected Location Address</Text>
                  <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Exact address will appear here"
                    value={location}
                    onChangeText={setLocation}
                  />
                </View>

                <View className="mb-2">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Search Map</Text>
                  <View className="flex-row gap-2">
                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                      className="flex-1 border border-gray-300 rounded-xl p-3 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="Type city or place name..."
                      value={mapSearchQuery}
                      onChangeText={setMapSearchQuery}
                      onSubmitEditing={handleSearchMap}
                      returnKeyType="search"
                    />
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={handleSearchMap}
                      disabled={isSearchingMap}
                      className="bg-blue-500 px-4 items-center justify-center rounded-xl hover:bg-blue-600 transition-colors"
                    >
                      {isSearchingMap ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Ionicons name="search" size={20} color="white" />
                      )}
                    </Pressable>
                  </View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 mt-2">Search for a place and click the button to set it as the location.</Text>

                  {mapSearchResults.length > 1 && (
                    <View className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 bg-gray-50 px-4 py-2 border-b border-gray-200">Alternative Matches</Text>
                      {mapSearchResults.slice(1).map((result, idx) => (
                        <Pressable style={{ minHeight: 44, minWidth: 44 }}
                          key={idx}
                          onPress={() => {
                            const loc = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
                            setMarkerPos(loc);
                            setLocation(result.display_name);
                            mapRef.current?.flyTo(loc.lat, loc.lng, 14);
                            // Clear alternatives after selecting one
                            setMapSearchResults([]);
                          }}
                          className={`px-4 py-3 ${idx !== mapSearchResults.length - 2 ? 'border-b border-gray-100' : ''}`}
                        >
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-700">{result.display_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                <View className="mt-2">
                  <InteractiveMap
                    ref={mapRef}
                    markerPos={markerPos}
                    onLocationSelect={handleLocationSelect}
                    defaultCenter={defaultCenter}
                    height={260}
                    interactive={true}
                    showControls={true}
                    showCurrentLocationButton={true}
                    showLayerToggle={true}
                  />
                </View>
              </View>
            </View>

            {/* Milestones Section */}
            <View className="mt-8 border-t border-gray-100 pt-6">
              <View className="flex-row flex-wrap gap-3 justify-between items-center mb-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800">Project Milestones</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={addMilestone} className="flex-row items-center bg-gray-100 px-3 py-1.5 rounded-lg">
                  <Ionicons name="add" size={16} color="#4B5563" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold ml-1 text-sm">Add</Text>
                </Pressable>
              </View>

              {milestones.length === 0 ? (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">No milestones added yet. You can add them later.</Text>
              ) : (
                milestones.map((ms, index) => (
                  <View key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                    <View className="flex-row justify-between mb-3">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700">Milestone {index + 1}</Text>
                      <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => removeMilestone(index)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </Pressable>
                    </View>

                    <View className="flex-col sm:flex-row gap-4 mb-3">
                      <View className="flex-[2]">
                        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                          placeholder="Title (e.g. Foundation)"
                          className="bg-white border border-gray-300 rounded-lg p-3 text-sm"
                          value={ms.title}
                          onChangeText={(t) => updateMilestone(index, 'title', t)}
                        />
                      </View>
                      <View className="flex-1">
                        <DateField label="Milestone due date" mode="date" value={ms.due_date} onChange={(value) => updateMilestone(index, 'due_date', value)} />
                      </View>
                    </View>

                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                      placeholder="Description (Optional)"
                      className="bg-white border border-gray-300 rounded-lg p-3 text-sm"
                      value={ms.description}
                      onChangeText={(t) => updateMilestone(index, 'description', t)}
                    />
                  </View>
                ))
              )}
            </View>

            <View className="flex-row gap-4 pt-6 border-t border-gray-100 mt-6">
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={onClose}
                disabled={loading}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleCreate}
                disabled={loading}
                className={`flex-1 bg-brand-orange py-4 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Create Project</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </ModalViewport>
    </Modal>
  );
};
