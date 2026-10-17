import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SRI_LANKA_DISTRICTS, District, filterDistricts, normalizeDistrict } from '@/constants/districts';
import { supabase } from '../../lib/supabase';

interface LocationPickerProps {
  district: string;
  town?: string;
  latitude?: number | null;
  longitude?: number | null;
  projectId?: string;
  onLocationChange: (loc: {
    district: string;
    town: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => void;
  locationNote?: string | null;
}

export function LocationPicker({
  district,
  town = '',
  latitude = null,
  longitude = null,
  projectId,
  onLocationChange,
  locationNote,
}: LocationPickerProps) {
  const [districtModalVisible, setDistrictModalVisible] = useState(false);
  const [districtSearch, setDistrictSearch] = useState('');
  const [currentTown, setCurrentTown] = useState(town);
  const [osmSearching, setOsmSearching] = useState(false);
  const [osmResults, setOsmResults] = useState<any[]>([]);
  const [osmQuery, setOsmQuery] = useState('');
  const [osmModalVisible, setOsmModalVisible] = useState(false);
  const [projectPrefilling, setProjectPrefilling] = useState(false);

  useEffect(() => {
    setCurrentTown(town);
  }, [town]);

  const filteredDistricts = filterDistricts(districtSearch);

  const handleSelectDistrict = (selectedDistrict: District) => {
    onLocationChange({
      district: selectedDistrict,
      town: currentTown,
      latitude,
      longitude,
    });
    setDistrictModalVisible(false);
    setDistrictSearch('');
  };

  const handleTownChange = (newTown: string) => {
    setCurrentTown(newTown);
    onLocationChange({
      district,
      town: newTown,
      latitude,
      longitude,
    });
  };

  const handleUseProjectLocation = async () => {
    setProjectPrefilling(true);
    try {
      let query = supabase.from('projects').select('id, name, location').order('created_at', { ascending: false });
      if (projectId) {
        query = query.eq('id', projectId);
      }
      const { data, error } = await query.limit(1);
      if (error || !data || data.length === 0) {
        alert('No project location found.');
        return;
      }
      const rawLocation = data[0].location || '';
      // Try to deduce district from string
      let matchedDistrict: District | null = null;
      for (const d of SRI_LANKA_DISTRICTS) {
        if (rawLocation.toLowerCase().includes(d.toLowerCase())) {
          matchedDistrict = d;
          break;
        }
      }

      const assignedDistrict = matchedDistrict || 'Colombo';
      let deducedTown = currentTown;
      if (rawLocation && matchedDistrict) {
        deducedTown = rawLocation.replace(new RegExp(matchedDistrict, 'gi'), '').replace(/[,\-]/g, ' ').trim();
      }

      onLocationChange({
        district: assignedDistrict,
        town: deducedTown || currentTown,
        latitude,
        longitude,
      });
    } catch (e) {
      console.error('Failed to prefill project location', e);
    } finally {
      setProjectPrefilling(false);
    }
  };

  // OSM Search with multi-layer fallback (Backend -> Photon -> Nominatim)
  const handleOsmSearch = async () => {
    if (!osmQuery.trim()) return;
    const query = osmQuery.trim();
    setOsmSearching(true);
    setOsmResults([]);
    try {
      let foundResults: any[] = [];

      // 1. Try Backend geocode endpoint
      try {
        const { getApiUrl } = await import('../../lib/apiUrl');
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const bRes = await fetch(`${getApiUrl()}/projects/geocode?q=${encodeURIComponent(query)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (bRes.ok) {
          const bData = await bRes.json();
          if (Array.isArray(bData) && bData.length > 0) {
            foundResults = bData;
          }
        }
      } catch {
        // Fallback
      }

      // 2. Try Photon Komoot API with typo tolerance
      if (foundResults.length === 0) {
        try {
          const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const feats = pData?.features || [];
            if (feats.length > 0) {
              foundResults = feats.map((f: any) => {
                const props = f.properties || {};
                const coords = f.geometry?.coordinates || [0, 0];
                const parts = [props.name, props.street, props.district, props.city, props.state, props.country].filter(Boolean);
                const uniqueParts = parts.filter((v: string, i: number) => parts.indexOf(v) === i);
                return {
                  lat: coords[1],
                  lon: coords[0],
                  display_name: uniqueParts.join(', ') || props.name || 'Selected Location',
                };
              });
            }
          }
        } catch {
          // Fallback
        }
      }

      // 3. Fallback: Nominatim progressive search with safe JSON parsing
      if (foundResults.length === 0) {
        let queryParts = query.split(/\s+/);
        while (queryParts.length > 0) {
          const currentQuery = queryParts.join(' ');
          try {
            const osmRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentQuery)}&format=json&limit=5&countrycodes=lk`,
              {
                headers: { 'User-Agent': 'ConstructFlow-Estimator/1.0' },
              }
            );
            if (osmRes.ok) {
              const text = await osmRes.text();
              if (text.startsWith('[') || text.startsWith('{')) {
                const osmData = JSON.parse(text);
                if (Array.isArray(osmData) && osmData.length > 0) {
                  foundResults = osmData;
                  break;
                }
              }
            }
          } catch {
            // Ignore and retry with shorter query
          }
          queryParts.pop(); // progressive retry: drop trailing word
        }
      }

      setOsmResults(foundResults);
    } catch (e) {
      console.warn('OSM search error:', e);
    } finally {
      setOsmSearching(false);
    }
  };

  const handleSelectOsmResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const name = item.display_name || '';

    let matched: District | null = null;
    for (const d of SRI_LANKA_DISTRICTS) {
      if (name.toLowerCase().includes(d.toLowerCase())) {
        matched = d;
        break;
      }
    }

    const newDistrict = matched || district || 'Colombo';
    const newTown = item.name || currentTown;

    onLocationChange({
      district: newDistrict,
      town: newTown,
      latitude: lat,
      longitude: lon,
    });
    setOsmModalVisible(false);
  };

  return (
    <View className="w-full">
      <View className="flex-row flex-wrap -mx-2">
        {/* District Selector (Searchable select) */}
        <View className="w-full md:w-1/2 px-2 mb-4">
          <View className="flex-row justify-between items-center mb-1.5">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-semibold">
              District <Text className="text-red-500">*</Text>
            </Text>
            <Pressable
              onPress={handleUseProjectLocation}
              disabled={projectPrefilling}
              className="flex-row items-center"
            >
              <Ionicons name="location-outline" size={13} color="#F97316" className="mr-1" />
              <Text maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-medium">
                {projectPrefilling ? 'Loading...' : 'Use project location'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="combobox"
            accessibilityLabel="Select district"
            style={{ minHeight: 46 }}
            onPress={() => setDistrictModalVisible(true)}
            className="border border-gray-200 bg-gray-50 rounded-lg px-3.5 py-2.5 flex-row justify-between items-center"
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ flexShrink: 1, minWidth: 0 }}
              className={`text-sm font-medium ${district ? 'text-brand-text' : 'text-gray-400'}`}
            >
              {district || 'Select district (all 25 Sri Lanka)'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#6B7280" />
          </Pressable>
        </View>

        {/* Town / Area Input */}
        <View className="w-full md:w-1/2 px-2 mb-4">
          <View className="flex-row justify-between items-center mb-1.5">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-semibold">
              Town / Area <Text className="text-gray-400 font-normal">(Optional)</Text>
            </Text>
            <Pressable
              onPress={() => setOsmModalVisible(true)}
              className="flex-row items-center"
            >
              <Ionicons name="search" size={12} color="#6B7280" className="mr-1" />
              <Text maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-medium">
                Map lookup
              </Text>
            </Pressable>
          </View>
          <View className="border border-gray-200 rounded-lg px-3.5 py-2 bg-white flex-row items-center">
            <TextInput
              maxFontSizeMultiplier={1.3}
              style={{ minHeight: 32, flex: 1 }}
              placeholder="e.g. Maharagama, Negombo, Kandy Town"
              placeholderTextColor="#9CA3AF"
              className="text-brand-text text-sm"
              value={currentTown}
              onChangeText={handleTownChange}
            />
            {latitude != null && longitude != null && (
              <Ionicons name="pin" size={16} color="#10B981" title="Coordinates pinned" />
            )}
          </View>
        </View>
      </View>

      {/* Location note banner when returned from model */}
      {!!locationNote && (
        <View className={`px-3 py-2 rounded-lg mb-3 flex-row items-center ${locationNote.includes('Limited data') ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          <Ionicons
            name={locationNote.includes('Limited data') ? 'information-circle' : 'checkmark-circle'}
            size={16}
            color={locationNote.includes('Limited data') ? '#D97706' : '#059669'}
            className="mr-2"
          />
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, minWidth: 0 }}
            className={`text-xs ${locationNote.includes('Limited data') ? 'text-amber-800' : 'text-emerald-800'}`}
          >
            {locationNote}
          </Text>
        </View>
      )}

      {/* Modal: District Searchable Select */}
      <Modal
        visible={districtModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDistrictModalVisible(false)}
      >
        <View className="flex-1 bg-black/40 justify-center items-center p-4">
          <View className="bg-white rounded-2xl w-full max-w-md max-h-[80%] p-4 shadow-xl">
            <View className="flex-row justify-between items-center mb-3">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-900">
                Select Sri Lankan District
              </Text>
              <Pressable
                onPress={() => setDistrictModalVisible(false)}
                style={{ minHeight: 36, minWidth: 36 }}
                className="items-center justify-center rounded-full hover:bg-gray-100"
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </Pressable>
            </View>

            <View className="flex-row items-center border border-gray-300 rounded-xl px-3 py-2 mb-3 bg-gray-50">
              <Ionicons name="search" size={16} color="#9CA3AF" className="mr-2" />
              <TextInput
                maxFontSizeMultiplier={1.3}
                style={{ flex: 1, minHeight: 28 }}
                placeholder="Search 25 districts..."
                placeholderTextColor="#9CA3AF"
                className="text-sm text-gray-900"
                value={districtSearch}
                onChangeText={setDistrictSearch}
                autoFocus
              />
              {!!districtSearch && (
                <Pressable onPress={() => setDistrictSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            <FlatList
              data={filteredDistricts}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isSelected = item.toLowerCase() === district.toLowerCase();
                return (
                  <Pressable
                    style={{ minHeight: 44 }}
                    onPress={() => handleSelectDistrict(item)}
                    className={`px-3 py-2.5 rounded-lg flex-row justify-between items-center ${isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{ flexShrink: 1, minWidth: 0 }}
                      className={`text-sm ${isSelected ? 'font-bold text-brand-orange' : 'text-gray-700'}`}
                    >
                      {item}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#F97316" />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">
                    No matching district found
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Modal: OpenStreetMap Search */}
      <Modal
        visible={osmModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOsmModalVisible(false)}
      >
        <View className="flex-1 bg-black/40 justify-center items-center p-4">
          <View className="bg-white rounded-2xl w-full max-w-md max-h-[80%] p-4 shadow-xl">
            <View className="flex-row justify-between items-center mb-3">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-900">
                OpenStreetMap Location Search
              </Text>
              <Pressable
                onPress={() => setOsmModalVisible(false)}
                style={{ minHeight: 36, minWidth: 36 }}
                className="items-center justify-center rounded-full hover:bg-gray-100"
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </Pressable>
            </View>

            <View className="flex-row items-center border border-gray-300 rounded-xl px-3 py-2 mb-3 bg-gray-50">
              <TextInput
                maxFontSizeMultiplier={1.3}
                style={{ flex: 1, minHeight: 28 }}
                placeholder="Search town, landmark or street..."
                placeholderTextColor="#9CA3AF"
                className="text-sm text-gray-900"
                value={osmQuery}
                onChangeText={setOsmQuery}
                onSubmitEditing={handleOsmSearch}
              />
              <Pressable
                onPress={handleOsmSearch}
                disabled={osmSearching}
                className="bg-brand-orange px-3 py-1.5 rounded-lg ml-2"
              >
                {osmSearching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Search</Text>
                )}
              </Pressable>
            </View>

            <FlatList
              data={osmResults}
              keyExtractor={item => String(item.place_id)}
              renderItem={({ item }) => (
                <Pressable
                  style={{ minHeight: 44 }}
                  onPress={() => handleSelectOsmResult(item)}
                  className="px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50"
                >
                  <Text maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, minWidth: 0 }} className="text-sm font-semibold text-gray-800">
                    {item.display_name.split(',')[0]}
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, minWidth: 0 }} className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                    {item.display_name}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">
                    {osmSearching ? 'Searching locations in Sri Lanka...' : 'Enter a town or address to look up coordinates'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
