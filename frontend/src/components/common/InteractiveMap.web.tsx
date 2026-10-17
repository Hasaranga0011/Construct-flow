import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  MapLocation,
  MapProjectMarker,
  generateLeafletHtml,
} from './mapHtml';

export type { MapLocation, MapProjectMarker };

export interface InteractiveMapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  setMarker: (lat: number, lng: number) => void;
  toggleLayer: () => void;
}

export interface InteractiveMapProps {
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
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [layerType, setLayerType] = useState<'street' | 'sat'>('street');
    const [isLocating, setIsLocating] = useState(false);

    // Generate initial static HTML; subsequent updates handled via postMessage
    const html = useMemo(
      () =>
        generateLeafletHtml({
          center: defaultCenter,
          zoom,
          markerPos,
          markers,
          interactive,
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    useImperativeHandle(ref, () => ({
      flyTo: (lat: number, lng: number, zoomLevel = 15) => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'flyTo', lat, lng, zoom: zoomLevel }),
          '*'
        );
      },
      setMarker: (lat: number, lng: number) => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'setMarker', lat, lng }),
          '*'
        );
      },
      toggleLayer: () => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'toggleLayer' }),
          '*'
        );
      },
    }));

    // Listen for messages from the Leaflet iframe
    useEffect(() => {
      const handleWindowMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || !data.type) return;

          if (data.type === 'mapLoaded') {
            setIsMapReady(true);
          } else if (data.type === 'locationSelect' && onLocationSelect) {
            onLocationSelect({ lat: data.lat, lng: data.lng });
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
    }, [onLocationSelect, onMarkerClick]);

    // Update marker when prop changes
    useEffect(() => {
      if (isMapReady && markerPos && typeof markerPos.lat === 'number' && typeof markerPos.lng === 'number') {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'setMarker', lat: markerPos.lat, lng: markerPos.lng }),
          '*'
        );
      }
    }, [isMapReady, markerPos, markerPos?.lat, markerPos?.lng]);

    // Update project markers list when prop changes
    useEffect(() => {
      if (isMapReady && markers) {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'setMarkers', markers }),
          '*'
        );
      }
    }, [isMapReady, markers]);

    const handleToggleLayer = () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'toggleLayer' }),
        '*'
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
            '*'
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
          '*'
        );
      } else {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'flyTo', lat: defaultCenter.lat, lng: defaultCenter.lng, zoom }),
          '*'
        );
      }
    };

    return (
      <View
        style={[
          styles.container,
          { height: typeof height === 'number' ? height : 260 },
          style,
        ]}
      >
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="ConstructFlow Interactive Map"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: '#F8FAFC',
          }}
        />

        {!isMapReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#F97316" />
            <Text style={styles.loadingText}>Loading interactive map...</Text>
          </View>
        )}

        {/* Floating Controls Overlay */}
        {showControls && isMapReady && (
          <View style={styles.floatingControls}>
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
