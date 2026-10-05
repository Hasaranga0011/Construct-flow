import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { GoogleMap, useLoadScript, Marker } from './ProjectMap';
import { toast } from '../../lib/toast';
import { ProjectAssignmentDropdown } from '../common/ProjectAssignmentDropdown';

type NewProjectModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const mapContainerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '12px',
  marginTop: '8px',
};

const defaultCenter = {
  lat: 7.8731, // Default to Sri Lanka
  lng: 80.7718
};

// Replace with the user's actual API key in production via process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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
  const [markerPos, setMarkerPos] = useState<google.maps.LatLngLiteral | null>(null);

  // Load Google Maps Script
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Store map instance to manually pan
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  const handleSearchMap = async () => {
    if (!mapSearchQuery || !GOOGLE_MAPS_API_KEY) return;
    
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(mapSearchQuery)}&key=${GOOGLE_MAPS_API_KEY}`);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const result = data.results[0];
        const loc = result.geometry.location;
        
        setMarkerPos({ lat: loc.lat, lng: loc.lng });
        setLocation(result.formatted_address);
        setMapSearchResults([]);
        if (mapInstance) {
          mapInstance.panTo({ lat: loc.lat, lng: loc.lng });
          mapInstance.setZoom(14);
        }
      } else if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
        console.warn('Google Maps API failed (Billing/Permissions). Falling back to free OpenStreetMap API...');
        
        // Fallback to Free OpenStreetMap (Nominatim) API with progressive retries
        let queryParts = mapSearchQuery.trim().split(/\s+/);
        let foundResults: any[] = [];
        
        while (queryParts.length > 0) {
          const currentQuery = queryParts.join(' ');
          const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentQuery)}&format=json&limit=5&countrycodes=lk`);
          const osmData = await osmRes.json();
          
          if (osmData && osmData.length > 0) {
            foundResults = osmData;
            break;
          }
          // Drop the last word and retry
          queryParts.pop();
        }
        
        if (foundResults.length > 0) {
          // Auto-pin the first result
          const topResult = foundResults[0];
          const loc = { lat: parseFloat(topResult.lat), lng: parseFloat(topResult.lon) };
          setMarkerPos(loc);
          setLocation(topResult.display_name);
          
          if (mapInstance) {
            mapInstance.panTo(loc);
            mapInstance.setZoom(14);
          }
          
          // Show the rest as alternatives if there are more than 1
          setMapSearchResults(foundResults);
          setErrorMsg(''); // Clear error if fallback succeeds
        } else {
          setMapSearchResults([]);
          setErrorMsg('Location not found in OpenStreetMap Fallback after trying variations.');
        }
      } else {
        setMapSearchResults([]);
        setErrorMsg('Location not found (Status: ' + data.status + ').');
      }
    } catch (e) {
      console.warn('Failed to forward geocode search query', e);
      setErrorMsg('Failed to search map. Check console for details.');
    }
  };

  const onMapClick = useCallback(async (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
    if (!e.latLng) return;
    
    if ('placeId' in e) {
      e.stop();
    }

    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarkerPos({ lat, lng });

    // Reverse Geocoding
    if (GOOGLE_MAPS_API_KEY) {
      try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`);
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          setLocation(data.results[0].formatted_address);
        } else {
          // Fallback to OpenStreetMap Reverse Geocoding
          const osmRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const osmData = await osmRes.json();
          if (osmData && osmData.display_name) {
            setLocation(osmData.display_name);
          } else {
            setLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
          }
        }
      } catch (err) {
        setLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
      }
    } else {
      setLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
    }
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
        if (existingClient) {
          resolvedClientId = existingClient.id;
          setClientId(existingClient.id);
        }
      }

      const payload = {
        name,
        location,
        address: location,
        status: 'active',
        start_date: startDate,
        end_date: endDate,
        client_id: resolvedClientId || null,
        pm_id: pmId || null,
        site_managers: selectedSiteManagers,
        workers: selectedWorkers,
        suppliers: selectedSuppliers,
        admins: selectedAdmins,
        total_budget: Number(totalBudget) || 0,
        latitude: markerPos?.lat ?? null,
        longitude: markerPos?.lng ?? null,
      };

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create project');
      }

      const newProject = await response.json();

      const validMilestones = milestones.filter(m => m.title && m.due_date);
      if (validMilestones.length > 0) {
        const msInserts = validMilestones.map(ms => ({
          project_id: newProject.id,
          title: ms.title,
          description: ms.description,
          due_date: ms.due_date,
          planned_date: ms.due_date,
          status: 'Pending'
        }));
        await supabase.from('milestones').insert(msInserts);
      }

      const notifications: { project_id: string; target_role?: string; target_user_id?: string; title: string; message: string; type: string; is_read: boolean; }[] = [
        {
          project_id: newProject.id,
          target_role: 'Project Manager',
          title: 'New Project Created',
          message: `Admin has created a new project: ${name}. Please review the details.`,
          type: 'info',
          is_read: false,
        },
      ];

      if (resolvedClientId) {
        notifications.push({
          project_id: newProject.id,
          target_user_id: resolvedClientId,
          title: 'New Project Assigned',
          message: `You have been assigned as the client for ${name}.`,
          type: 'info',
          is_read: false,
        });
      }

      if (clientEmail.trim()) {
        await fetch(`${process.env.EXPO_PUBLIC_API_URL}/notifications/email/send`, {
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
        });
      }

      selectedSiteManagers.forEach((id: string) => {
        notifications.push({
          project_id: newProject.id,
          target_user_id: id,
          title: 'New Project Assignment',
          message: `You have been assigned as a Site Manager for ${name}.`,
          type: 'info',
          is_read: false,
        });
      });

      selectedWorkers.forEach((id: string) => {
        notifications.push({
          project_id: newProject.id,
          target_user_id: id,
          title: 'New Project Assignment',
          message: `You have been assigned as a Worker for ${name}.`,
          type: 'info',
          is_read: false,
        });
      });

      selectedSuppliers.forEach((id: string) => {
        notifications.push({
          project_id: newProject.id,
          target_user_id: id,
          title: 'New Project Assignment',
          message: `You have been assigned as a Supplier for ${name}.`,
          type: 'info',
          is_read: false,
        });
      });

      selectedAdmins.forEach((id: string) => {
        notifications.push({
          project_id: newProject.id,
          target_user_id: id,
          title: 'New Project Assignment',
          message: `You have been assigned as an Admin for ${name}.`,
          type: 'info',
          is_read: false,
        });
      });

      await supabase.from('notifications').insert(notifications);

      toast.success('Project created!');

      setName('');
      setLocation('');
      setStartDate('');
      setEndDate('');
      setClientEmail('');
      setTotalBudget('');
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
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden">
          
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text className="text-xl font-bold text-brand-text">Create New Project</Text>
            <Pressable onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>
            {errorMsg ? (
              <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
                <Text className="text-red-600 text-sm text-center">{errorMsg}</Text>
              </View>
            ) : null}

            {!GOOGLE_MAPS_API_KEY && Platform.OS === 'web' && (
               <View className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-6">
                 <Text className="text-yellow-700 text-sm text-center font-semibold">
                   ⚠️ Google Maps API Key is missing. The map will load in development mode and address translation is disabled.
                 </Text>
               </View>
            )}

            <View className="flex-col md:flex-row">
              {/* Left Column: Form Fields */}
              <View className="w-full md:w-auto md:flex-1 pr-0 md:pr-6 md:border-r border-gray-100 min-w-0">
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Project Name</Text>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="e.g. Marina Tower"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

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
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Start Date</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <input 
                      type="date"
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors outline-none"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  ) : (
                    <TextInput
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="YYYY-MM-DD"
                      value={startDate}
                      onChangeText={setStartDate}
                    />
                  )}
                </View>

                <View className="mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">End Date</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <input 
                      type="date"
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors outline-none"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  ) : (
                    <TextInput
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="YYYY-MM-DD"
                      value={endDate}
                      onChangeText={setEndDate}
                    />
                  )}
                </View>
                <View className="mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Total Budget (Rs.)</Text>
                  <TextInput
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
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Client Email</Text>
                  <TextInput
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
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Selected Location Address</Text>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Exact address will appear here"
                    value={location}
                    onChangeText={setLocation}
                  />
                </View>

                <View className="mb-2">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Search Map</Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 border border-gray-300 rounded-xl p-3 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="Type city or place name..."
                      value={mapSearchQuery}
                      onChangeText={setMapSearchQuery}
                    />
                    <Pressable
                      onPress={handleSearchMap}
                      className="bg-blue-500 px-4 items-center justify-center rounded-xl hover:bg-blue-600 transition-colors"
                    >
                      <Ionicons name="search" size={20} color="white" />
                    </Pressable>
                  </View>
                  <Text className="text-xs text-gray-400 mt-2">Search for a place and click the button to set it as the location.</Text>
                  
                  {mapSearchResults.length > 1 && (
                    <View className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <Text className="text-xs font-semibold text-gray-500 bg-gray-50 px-4 py-2 border-b border-gray-200">Alternative Matches</Text>
                      {mapSearchResults.slice(1).map((result, idx) => (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            const loc = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
                            setMarkerPos(loc);
                            setLocation(result.display_name);
                            if (mapInstance) {
                              mapInstance.panTo(loc);
                              mapInstance.setZoom(14);
                            }
                            // Clear alternatives after selecting one
                            setMapSearchResults([]);
                          }}
                          className={`px-4 py-3 ${idx !== mapSearchResults.length - 2 ? 'border-b border-gray-100' : ''}`}
                        >
                          <Text className="text-sm text-gray-700" numberOfLines={2}>{result.display_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {Platform.OS === 'web' ? (
                  loadError ? (
                    <View className="h-[250px] bg-red-50 rounded-xl mt-2 items-center justify-center border border-red-200">
                      <Text className="text-red-500">Error loading maps</Text>
                    </View>
                  ) : !isLoaded ? (
                    <View className="h-[250px] bg-gray-50 rounded-xl mt-2 items-center justify-center border border-gray-200">
                      <ActivityIndicator color="#F97316" />
                    </View>
                  ) : (
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      zoom={7}
                      center={markerPos || defaultCenter}
                      onClick={onMapClick}
                      onLoad={setMapInstance}
                      options={{
                        disableDefaultUI: true,
                        zoomControl: true,
                        clickableIcons: false,
                      }}
                    >
                      {markerPos && <Marker position={markerPos} />}
                    </GoogleMap>
                  )
                ) : (
                  <View className="h-[250px] bg-gray-50 rounded-xl mt-2 items-center justify-center border border-gray-200">
                    <Ionicons name="map-outline" size={32} color="#9CA3AF" />
                    <Text className="text-gray-400 mt-2 text-sm text-center px-4">Interactive map is only available on web version.</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Milestones Section */}
            <View className="mt-8 border-t border-gray-100 pt-6">
              <View className="flex-row flex-wrap gap-3 justify-between items-center mb-4">
                <Text className="text-lg font-bold text-gray-800">Project Milestones</Text>
                <Pressable onPress={addMilestone} className="flex-row items-center bg-gray-100 px-3 py-1.5 rounded-lg">
                  <Ionicons name="add" size={16} color="#4B5563" />
                  <Text className="text-gray-700 font-semibold ml-1 text-sm">Add</Text>
                </Pressable>
              </View>

              {milestones.length === 0 ? (
                <Text className="text-gray-400 italic text-sm">No milestones added yet. You can add them later.</Text>
              ) : (
                milestones.map((ms, index) => (
                  <View key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                    <View className="flex-row justify-between mb-3">
                      <Text className="font-semibold text-gray-700">Milestone {index + 1}</Text>
                      <Pressable onPress={() => removeMilestone(index)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </Pressable>
                    </View>
                    
                    <View className="flex-col sm:flex-row gap-4 mb-3">
                      <View className="flex-[2]">
                        <TextInput 
                          placeholder="Title (e.g. Foundation)" 
                          className="bg-white border border-gray-300 rounded-lg p-3 text-sm"
                          value={ms.title}
                          onChangeText={(t) => updateMilestone(index, 'title', t)}
                        />
                      </View>
                      <View className="flex-1">
                        {Platform.OS === 'web' ? (
                          // @ts-ignore
                          <input 
                            type="date"
                            className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm outline-none"
                            value={ms.due_date}
                            onChange={(e) => updateMilestone(index, 'due_date', e.target.value)}
                          />
                        ) : (
                          <TextInput 
                            placeholder="YYYY-MM-DD" 
                            className="bg-white border border-gray-300 rounded-lg p-3 text-sm"
                            value={ms.due_date}
                            onChangeText={(t) => updateMilestone(index, 'due_date', t)}
                          />
                        )}
                      </View>
                    </View>
                    
                    <TextInput 
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
              <Pressable 
                onPress={onClose}
                disabled={loading}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Text className="text-gray-600 font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleCreate}
                disabled={loading}
                className={`flex-1 bg-brand-orange py-4 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">Create Project</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </ModalViewport>
    </Modal>
  );
};
