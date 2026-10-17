import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
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
    const webViewRef = useRef<WebView>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [layerType, setLayerType] = useState<'street' | 'sat'>('street');
    const [isLocating, setIsLocating] = useState(false);

    // Generate initial static HTML; subsequent updates handled via JS injection
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
        const js = `if (window.flyToLocation) { window.flyToLocation(${lat}, ${lng}, ${zoomLevel}); } true;`;
        webViewRef.current?.injectJavaScript(js);
      },
      setMarker: (lat: number, lng: number) => {
        const js = `if (window.setPin) { window.setPin(${lat}, ${lng}, true); } true;`;
        webViewRef.current?.injectJavaScript(js);
      },
      toggleLayer: () => {
        const js = `if (window.toggleLayer) { window.toggleLayer(); } true;`;
        webViewRef.current?.injectJavaScript(js);
      },
    }));

    // Update pin when markerPos coordinates change
    useEffect(() => {
      if (isMapReady && markerPos && typeof markerPos.lat === 'number' && typeof markerPos.lng === 'number') {
        const js = `if (window.setPin) { window.setPin(${markerPos.lat}, ${markerPos.lng}, false); } true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    }, [isMapReady, markerPos, markerPos?.lat, markerPos?.lng]);

    // Update project markers when markers prop changes
    useEffect(() => {
      if (isMapReady && markers) {
        const js = `if (window.setMarkers) { window.setMarkers(${JSON.stringify(markers)}); } true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    }, [isMapReady, markers]);

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapLoaded') {
          setIsMapReady(true);
        } else if (data.type === 'locationSelect' && onLocationSelect) {
          onLocationSelect({ lat: data.lat, lng: data.lng });
        } else if (data.type === 'markerClick' && onMarkerClick) {
          onMarkerClick(data.id);
        } else if (data.type === 'layerChanged') {
          setLayerType(data.layer);
        }
      } catch (err) {
        console.warn('Map message parse error:', err);
      }
    };

    const handleToggleLayer = () => {
      const js = `if (window.toggleLayer) { window.toggleLayer(); } true;`;
      webViewRef.current?.injectJavaScript(js);
      setLayerType(prev => (prev === 'street' ? 'sat' : 'street'));
    };

    const handleLocateMe = async () => {
      try {
        setIsLocating(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Access',
            'Please allow location permission to detect your current construction site.'
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const newPos = {
          lat: parseFloat(loc.coords.latitude.toFixed(6)),
          lng: parseFloat(loc.coords.longitude.toFixed(6)),
        };

        if (onLocationSelect) {
          onLocationSelect(newPos);
        }

        const js = `if (window.flyToLocation) { window.flyToLocation(${newPos.lat}, ${newPos.lng}, 16); } true;`;
        webViewRef.current?.injectJavaScript(js);
      } catch (err: any) {
        Alert.alert('GPS Location', err?.message || 'Unable to retrieve current location.');
      } finally {
        setIsLocating(false);
      }
    };

    const handleRecenter = () => {
      if (markerPos && markerPos.lat && markerPos.lng) {
        const js = `if (window.flyToLocation) { window.flyToLocation(${markerPos.lat}, ${markerPos.lng}, 15); } true;`;
        webViewRef.current?.injectJavaScript(js);
      } else {
        const js = `if (window.flyToLocation) { window.flyToLocation(${defaultCenter.lat}, ${defaultCenter.lng}, ${zoom}); } true;`;
        webViewRef.current?.injectJavaScript(js);
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
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={handleMessage}
          style={styles.webView}
          nestedScrollEnabled={true}
          scrollEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
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
  webView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
