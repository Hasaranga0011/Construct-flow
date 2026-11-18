import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MapLocation, MapProjectMarker } from './mapHtml';
import { getApiUrl } from '@/lib/apiUrl';
import { useMapConfiguration } from '@/hooks/useMapProvider';

export type { MapLocation, MapProjectMarker };

export interface InteractiveMapRef {
  previewLocation: (lat: number, lng: number, zoom?: number) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  setMarker: (lat: number, lng: number) => void;
  toggleLayer: () => void;
}

export interface InteractiveMapProps {
  provider?: 'google' | 'openstreetmap';
  markerPos?: MapLocation | null;
  onLocationSelect?: (loc: MapLocation) => void;
  onMarkerClick?: (markerId: string) => void;
  defaultCenter?: MapLocation;
  zoom?: number;
  height?: number | string;
  markers?: MapProjectMarker[];
  interactive?: boolean;
  showControls?: boolean;
  showCurrentLocationButton?: boolean;
  showLayerToggle?: boolean;
  style?: any;
}

const DEFAULT_CENTER: MapLocation = { lat: 7.8731, lng: 80.7718 };

export const InteractiveMap = forwardRef<InteractiveMapRef, InteractiveMapProps>(
  (
    {
      provider: requestedProvider,
      markerPos,
      onLocationSelect,
      onMarkerClick,
      defaultCenter = DEFAULT_CENTER,
      zoom = 7,
      height = 260,
      markers = [],
      interactive = true,
      showControls = true,
      showCurrentLocationButton = true,
      showLayerToggle = true,
      style,
    },
    ref
  ) => {
    const configuration = useMapConfiguration();
    const provider = requestedProvider || configuration.provider;
    const geoapify = provider !== 'google' && configuration.search_provider === 'geoapify';
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const ready = useRef(false);
    const pendingNavigation = useRef<{ type: 'previewLocation' | 'flyTo' | 'setMarker'; lat: number; lng: number; zoom?: number } | null>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [frameAttempt, setFrameAttempt] = useState(0);
    const [searchFocused, setSearchFocused] = useState(false);
    const [layerType, setLayerType] = useState<'street' | 'sat'>('street');
    const [isLocating, setIsLocating] = useState(false);

    // The API-origin frame has a real Referer while remaining isolated from
    // frontend tokens/storage. Never grant same-origin access to an app-origin frame.
    const frameUrl = useMemo(() => `${getApiUrl()}/maps/frame?${provider === 'google' ? 'provider=google&' : ''}v=site-precision-2`, [provider]);
    const frameOrigin = useMemo(() => new URL(frameUrl).origin, [frameUrl]);
    const isolated = typeof window !== 'undefined' && frameOrigin !== window.location.origin;
    const [mapUnavailable, setMapUnavailable] = useState(!isolated);
    useEffect(() => { ready.current = false; setIsMapReady(false); setSearchFocused(false); setMapUnavailable(!isolated); }, [frameUrl, isolated]);
    const initialConfig = useRef({ center: defaultCenter, zoom, markerPos, markers, interactive });
    const initializeFrame = () => {
      if (isolated) iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'initialize', config: initialConfig.current }), frameOrigin);
    };
    const navigate = (command: NonNullable<typeof pendingNavigation.current>) => {
      if (!ready.current) { pendingNavigation.current = command; return; }
      pendingNavigation.current = null;
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(command), frameOrigin);
    };

    useImperativeHandle(ref, () => ({
      previewLocation: (lat: number, lng: number, zoomLevel = 13) => {
        navigate({ type: 'previewLocation', lat, lng, zoom: zoomLevel });
      },
      flyTo: (lat: number, lng: number, zoomLevel = 15) => {
        navigate({ type: 'flyTo', lat, lng, zoom: zoomLevel });
      },
      setMarker: (lat: number, lng: number) => {
        navigate({ type: 'setMarker', lat, lng });
      },
      toggleLayer: () => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'toggleLayer' }),
          frameOrigin
        );
      },
    }));

    // Listen for messages from the Leaflet iframe
    useEffect(() => {
      const handleWindowMessage = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow || event.origin !== frameOrigin) return;
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || !data.type) return;

          if (data.type === 'mapFrameReady') {
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'initialize', config: initialConfig.current }), frameOrigin);
          } else if (data.type === 'placeSearchFocus') {
            setSearchFocused(data.focused === true);
          } else if (data.type === 'mapUnavailable') {
            ready.current = false;
            setIsMapReady(false);
            setMapUnavailable(true);
          } else if (data.type === 'mapLoaded') {
            ready.current = true;
            setIsMapReady(true);
            setMapUnavailable(false);
          } else if (data.type === 'locationSelect' && onLocationSelect) {
            onLocationSelect({ lat: data.lat, lng: data.lng, ...(typeof data.address === 'string' ? { address: data.address } : {}) });
          } else if (data.type === 'markerClick' && onMarkerClick) {
            onMarkerClick(data.id);
          } else if (data.type === 'layerChanged') {
            setLayerType(data.layer);
          }
        } catch {
          // Ignore unrelated window messages
        }
      };

      window.addEventListener('message', handleWindowMessage);
      return () => window.removeEventListener('message', handleWindowMessage);
    }, [onLocationSelect, onMarkerClick, frameOrigin]);

    useEffect(() => {
      if (isMapReady) return;
      const timer = setTimeout(() => setMapUnavailable(true), 15000);
      return () => clearTimeout(timer);
    }, [isMapReady, frameAttempt]);

    // Update marker when prop changes
    useEffect(() => {
      if (isMapReady && markerPos && typeof markerPos.lat === 'number' && typeof markerPos.lng === 'number') {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'setMarker', lat: markerPos.lat, lng: markerPos.lng }),
          frameOrigin
        );
      }
    }, [isMapReady, markerPos, markerPos?.lat, markerPos?.lng, frameOrigin]);

    // Update project markers list when prop changes
    useEffect(() => {
      if (isMapReady && markers) {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'setMarkers', markers }),
          frameOrigin
        );
      }
    }, [isMapReady, markers, frameOrigin]);

    // Apply the last requested navigation after initial pin/project-marker effects.
    useEffect(() => {
      if (isMapReady && pendingNavigation.current) {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify(pendingNavigation.current), frameOrigin);
        pendingNavigation.current = null;
      }
    }, [isMapReady, frameOrigin]);

    const handleToggleLayer = () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'toggleLayer' }),
        frameOrigin
      );
      setLayerType(prev => (prev === 'street' ? 'sat' : 'street'));
    };

    const handleLocateMe = () => {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        position => {
          setIsLocating(false);
          const newPos = {
            lat: parseFloat(position.coords.latitude.toFixed(6)),
            lng: parseFloat(position.coords.longitude.toFixed(6)),
          };
          if (onLocationSelect) {
            onLocationSelect(newPos);
          }
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ type: 'flyTo', lat: newPos.lat, lng: newPos.lng, zoom: 16 }),
            frameOrigin
          );
        },
        error => {
          setIsLocating(false);
          alert('Could not retrieve current location: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    const handleRecenter = () => {
      if (markerPos && markerPos.lat && markerPos.lng) {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'flyTo', lat: markerPos.lat, lng: markerPos.lng, zoom: 15 }),
          frameOrigin
        );
      } else {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'flyTo', lat: defaultCenter.lat, lng: defaultCenter.lng, zoom }),
          frameOrigin
        );
      }
    };

    return (
      <View
        style={[
          styles.container,
          { height: provider === 'google' && interactive ? Math.max(400, typeof height === 'number' ? height : 400) : typeof height === 'number' ? height : 260 },
          style,
        ]}
      >
        <iframe
          key={frameAttempt}
          ref={iframeRef}
          src={isolated ? frameUrl : undefined}
          onLoad={initializeFrame}
          onError={() => setMapUnavailable(true)}
          referrerPolicy="origin"
          sandbox={provider === 'google' ? 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox' : 'allow-scripts allow-same-origin'}
          title="ConstructFlow Interactive Map"
          style={{
            width: '100%',
            height: geoapify ? 'calc(100% - 24px)' : '100%',
            border: 'none',
            display: 'block',
            backgroundColor: '#F8FAFC',
          }}
        />

        {geoapify && <View style={{ height: 24, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#fff' }}><Pressable accessibilityRole="link" accessibilityLabel="Powered by Geoapify" onPress={() => { void Linking.openURL('https://www.geoapify.com/').catch(() => {}); }}><Text style={{ fontSize: 10, color: '#475569' }}>Powered by Geoapify</Text></Pressable></View>}

        {!isMapReady && (
          <View style={styles.loadingOverlay}>
            {!mapUnavailable && <ActivityIndicator size="small" color="#F97316" />}
            <Text style={styles.loadingText}>{mapUnavailable ? provider === 'google' ? 'Google Maps unavailable. You can still enter the site address manually.' : 'Map unavailable. You can still enter or search the site address.' : 'Loading interactive map...'}</Text>
            {mapUnavailable && <Pressable accessibilityRole="button" accessibilityLabel="Reload map" onPress={() => {
              ready.current = false;
              initialConfig.current = { center: markerPos || defaultCenter, zoom: markerPos ? 15 : zoom, markerPos, markers, interactive };
              setIsMapReady(false); setMapUnavailable(false); setFrameAttempt(value => value + 1);
            }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' }}><Text style={{ color: '#c2410c', fontWeight: '600' }}>Reload map</Text></Pressable>}
          </View>
        )}

        {/* Floating Controls Overlay */}
        {showControls && isMapReady && !searchFocused && (
          <View style={[styles.floatingControls, provider === 'google' && interactive ? { top: 80 } : null]}>
            {showLayerToggle && (
              <Pressable
                accessibilityLabel="Toggle satellite view"
                style={styles.controlButton}
                onPress={handleToggleLayer}
              >
                <Ionicons
                  name={layerType === 'street' ? 'earth-outline' : 'map-outline'}
                  size={18}
                  color="#1E293B"
                />
              </Pressable>
            )}

            {showCurrentLocationButton && (
              <Pressable
                accessibilityLabel="Use current GPS location"
                style={styles.controlButton}
                onPress={handleLocateMe}
                disabled={isLocating}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color="#F97316" />
                ) : (
                  <Ionicons name="locate" size={18} color="#F97316" />
                )}
              </Pressable>
            )}

            <Pressable
              accessibilityLabel="Re-center map"
              style={styles.controlButton}
              onPress={handleRecenter}
            >
              <Ionicons name="scan-outline" size={18} color="#475569" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }
);

InteractiveMap.displayName = 'InteractiveMap';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  floatingControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    flexDirection: 'column',
    gap: 6,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
});
