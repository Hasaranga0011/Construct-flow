import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { InteractiveMap, InteractiveMapRef, MapProjectMarker } from '@/components/common/InteractiveMap';
import { SRI_LANKA_DISTRICTS } from '@/constants/districts';

type Project = {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  status?: string | null;
  total_budget?: number | null;
  spent_cost?: number | null;
  completion_percentage?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  colombo: { lat: 6.9271, lng: 79.8612 },
  gampaha: { lat: 7.0840, lng: 80.0098 },
  kalutara: { lat: 6.5854, lng: 79.9607 },
  kandy: { lat: 7.2906, lng: 80.6337 },
  matale: { lat: 7.4675, lng: 80.6234 },
  'nuwara eliya': { lat: 6.9497, lng: 80.7891 },
  galle: { lat: 6.0535, lng: 80.2210 },
  matara: { lat: 5.9549, lng: 80.5550 },
  hambantota: { lat: 6.1429, lng: 81.1212 },
  jaffna: { lat: 9.6615, lng: 80.0255 },
  kilinochchi: { lat: 9.3803, lng: 80.3770 },
  mannar: { lat: 8.9810, lng: 79.9044 },
  vavuniya: { lat: 8.7542, lng: 80.4982 },
  mullaitivu: { lat: 9.2671, lng: 80.8142 },
  batticaloa: { lat: 7.7310, lng: 81.6747 },
  ampara: { lat: 7.2912, lng: 81.6724 },
  trincomalee: { lat: 8.5874, lng: 81.2152 },
  kurunegala: { lat: 7.4863, lng: 80.3623 },
  puttalam: { lat: 8.0408, lng: 79.8394 },
  anuradhapura: { lat: 8.3114, lng: 80.4037 },
  polonnaruwa: { lat: 7.9403, lng: 81.0188 },
  badulla: { lat: 6.9934, lng: 81.0550 },
  monaragala: { lat: 6.8728, lng: 81.3507 },
  ratnapura: { lat: 6.7056, lng: 80.3847 },
  kegalle: { lat: 7.2513, lng: 80.3464 },
};

function resolveProjectCoords(project: Project): { lat: number; lng: number } {
  if (
    typeof project.latitude === 'number' &&
    typeof project.longitude === 'number' &&
    !isNaN(project.latitude) &&
    !isNaN(project.longitude) &&
    project.latitude !== 0 &&
    project.longitude !== 0
  ) {
    return { lat: project.latitude, lng: project.longitude };
  }

  // Deduce from location string
  const text = `${project.location || ''} ${project.address || ''}`.toLowerCase();
  for (const district of SRI_LANKA_DISTRICTS) {
    const key = district.toLowerCase();
    if (text.includes(key) && DISTRICT_COORDS[key]) {
      return DISTRICT_COORDS[key];
    }
  }

  // Default to Colombo
  return { lat: 6.9271, lng: 79.8612 };
}

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;

export default function ClientProjectMapPage() {
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const mapRef = useRef<InteractiveMapRef>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId || null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadProjects = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, location, address, status, total_budget, spent_cost, completion_percentage, start_date, end_date, latitude, longitude')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted) {
          const list = (data || []) as Project[];
          setProjects(list);
          setSelectedProjectId(prev => prev || (list.length > 0 ? list[0].id : null));
        }
      } catch (err) {
        console.error('Error loading projects for map:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProjects();

    const channel = supabase
      .channel(`client-map-projects:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${user.id}` },
        loadProjects
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Convert projects to map markers
  const markers: MapProjectMarker[] = useMemo(() => {
    return projects.map(p => {
      const coords = resolveProjectCoords(p);
      const isCompleted = p.status?.toLowerCase() === 'completed';
      return {
        id: p.id,
        lat: coords.lat,
        lng: coords.lng,
        title: p.name,
        location: p.address || p.location || 'Location not specified',
        status: p.status || 'Active',
        completion: p.completion_percentage ?? 0,
        color: isCompleted ? '#10B981' : '#F97316',
      };
    });
  }, [projects]);

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    const coords = resolveProjectCoords(project);
    mapRef.current?.flyTo(coords.lat, coords.lng, 15);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Project Map" showAction={false} />

      <View className="flex-1 p-4 md:p-6">
        {/* Header Row */}
        <View className="flex-row justify-between items-center mb-4 flex-wrap gap-2">
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">
              Interactive Project Map
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-0.5">
              Live geographic visualization of all your assigned construction sites.
            </Text>
          </View>

          <Link href="/client/project" asChild>
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              className="flex-row items-center bg-white border border-gray-200 px-4 py-2.5 rounded-xl shadow-sm hover:bg-gray-50"
            >
              <Ionicons name="list" size={18} color="#F97316" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm ml-2">
                List View
              </Text>
            </Pressable>
          </Link>
        </View>

        {loading ? (
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 items-center justify-center p-8">
            <ActivityIndicator size="large" color="#F97316" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-3 font-semibold">
              Loading interactive project locations...
            </Text>
          </View>
        ) : projects.length === 0 ? (
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 items-center justify-center p-12">
            <Ionicons name="map-outline" size={56} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold text-lg mt-4">
              No Projects Assigned
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center mt-2 max-w-md">
              Once an administrator or project manager assigns a construction site to your account, its location will appear here on the map.
            </Text>
          </View>
        ) : (
          <View className={`flex-1 ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
            {/* Map Container */}
            <View className={`flex-1 min-h-[300px] ${isMobile ? 'h-[340px]' : 'h-full'} bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm`}>
              <InteractiveMap
                ref={mapRef}
                markers={markers}
                height="100%"
                interactive={false}
                showControls={true}
                showLayerToggle={true}
                showCurrentLocationButton={true}
                onMarkerClick={(id) => {
                  const target = projects.find(p => p.id === id);
                  if (target) setSelectedProjectId(target.id);
                }}
              />
            </View>

            {/* Sidebar / Bottom List of Sites */}
            <View className={`${isMobile ? 'w-full' : 'w-80 lg:w-96'} flex-col gap-3`}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text text-base">
                Your Sites ({projects.length})
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
                style={{ flexShrink: 1 }}
                className={isMobile ? 'max-h-60' : 'flex-1'}
              >
                {projects.map(p => {
                  const isSelected = p.id === selectedProjectId;
                  const progress = Number(p.completion_percentage || 0);

                  return (
                    <Pressable
                      key={p.id}
                      style={{ minHeight: 44 }}
                      onPress={() => handleSelectProject(p)}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-orange-50/70 border-brand-orange shadow-sm'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text text-sm">
                            {p.name}
                          </Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                            {p.address || p.location || 'Location not specified'}
                          </Text>
                        </View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs">
                          {progress}%
                        </Text>
                      </View>

                      {/* Progress bar */}
                      <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3">
                        <View
                          className="h-full bg-brand-orange rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                      </View>

                      <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-gray-100">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[11px] font-semibold">
                          {p.status || 'Active'}
                        </Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-xs">
                          {formatCurrency(Number(p.total_budget || 0))}
                        </Text>
                      </View>

                      {/* Quick Action Links if selected */}
                      {isSelected && (
                        <View className="flex-row gap-2 mt-3 pt-2 border-t border-orange-100">
                          <Link href={`/client/project/milestones?projectId=${p.id}`} asChild>
                            <Pressable style={{ minHeight: 36 }} className="flex-1 bg-brand-orange py-2 rounded-lg items-center justify-center">
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs">
                                Milestones
                              </Text>
                            </Pressable>
                          </Link>
                          <Link href={`/client/project/${p.id}/reports`} asChild>
                            <Pressable style={{ minHeight: 36 }} className="flex-1 bg-white border border-gray-300 py-2 rounded-lg items-center justify-center">
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-xs">
                                Reports
                              </Text>
                            </Pressable>
                          </Link>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
