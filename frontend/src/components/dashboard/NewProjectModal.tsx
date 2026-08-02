import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { GoogleMap, useLoadScript, Marker } from '@react-google-maps/api';
import toast from 'react-hot-toast';

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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Map state
  const [markerPos, setMarkerPos] = useState<google.maps.LatLngLiteral | null>(null);

  // Load Google Maps Script
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (mapInstance) {
          mapInstance.panTo({ lat: loc.lat, lng: loc.lng });
          mapInstance.setZoom(14);
        }
      } else if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
        console.warn('Google Maps API failed (Billing/Permissions). Falling back to free OpenStreetMap API...');
        
        // Fallback to Free OpenStreetMap (Nominatim) API
        const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(mapSearchQuery)}&format=json&limit=1`);
        const osmData = await osmRes.json();
        
        if (osmData && osmData.length > 0) {
          const loc = { lat: parseFloat(osmData[0].lat), lng: parseFloat(osmData[0].lon) };
          setMarkerPos(loc);
          setLocation(osmData[0].display_name);
          
          if (mapInstance) {
            mapInstance.panTo(loc);
            mapInstance.setZoom(14);
          }
          setErrorMsg(''); // Clear error if fallback succeeds
        } else {
          setErrorMsg('Location not found in OpenStreetMap Fallback either.');
        }
      } else {
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
      const { error, data: newProject } = await supabase.from('projects').insert([
        {
          name,
          location,
          start_date: startDate,
          end_date: endDate,
          status: 'active',
          completion_percentage: 0,
          total_budget: Number(totalBudget) || 0,
          client_id: null // Would normally look up client ID from email
        }
      ]).select('id').single();

      if (error) throw error;
      
      toast.success('Project created!');

      // Trigger Notification for Project Managers
      await supabase.from('notifications').insert({
        project_id: newProject.id,
        target_role: 'Project Manager',
        title: 'New Project Created',
        message: `Admin has created a new project: ${name}. Please review the details.`,
      });

      // Reset form
      setName('');
      setLocation('');
      setStartDate('');
      setEndDate('');
      setClientEmail('');
      setTotalBudget('');
      setMarkerPos(null);
      
      onSuccess();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/50 items-center justify-center p-4">
        <View className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden">
          
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text className="text-xl font-bold text-brand-text">Create New Project</Text>
            <Pressable onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="p-6 max-h-[85vh]">
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

            <View className="flex-row flex-wrap md:flex-nowrap">
              {/* Left Column: Form Fields */}
              <View className="flex-1 pr-0 md:pr-6 md:border-r border-gray-100 min-w-[250px]">
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Project Name</Text>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="e.g. Marina Tower"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

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
              <View className="flex-1 pl-0 md:pl-6 mt-6 md:mt-0 min-w-[250px]">
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
      </View>
    </Modal>
  );
};
