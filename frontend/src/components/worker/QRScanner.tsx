import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, ScrollView, useWindowDimensions, TextInput } from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

type QRScannerProps = {
  onScan: (data: string) => void | Promise<void>;
  onClose: () => void;
};

export const QRScanner = ({ onScan, onClose }: QRScannerProps) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const frameSize = Math.min(260, width - 64, height * 0.35);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const processing = useRef(false);
  const [cameraError, setCameraError] = useState('');

  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-8">
        <Ionicons name="camera-outline" size={48} color="#F97316" style={{ marginBottom: 16 }} />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center mb-6 text-lg font-bold">
          Camera Permission Required
        </Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-center mb-8 text-sm">
          Please allow camera access to scan worker QR codes, or enter the worker code manually.
        </Text>
        <Pressable
          style={{ minHeight: 44, minWidth: 44 }}
          onPress={async () => {
            try {
              await requestPermission();
            } catch {
              if (Platform.OS === 'web') window.alert("Browser blocked camera access.");
            }
          }}
          className="bg-brand-orange px-6 py-3 rounded-xl mb-4 w-full max-w-xs items-center"
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Grant Permission</Text>
        </Pressable>
        <Pressable
          style={{ minHeight: 44, minWidth: 44 }}
          onPress={() => setShowManual(true)}
          className="bg-gray-800 border border-gray-700 px-6 py-3 rounded-xl mb-4 w-full max-w-xs items-center"
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-200 font-semibold">Enter Code Manually</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-semibold">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (cameraError) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-6">
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 12 }} />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center mb-4">{cameraError}</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setCameraError('')} className="bg-brand-orange px-6 py-3 rounded-xl mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry camera</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowManual(true)} className="bg-gray-800 px-6 py-3 rounded-xl mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white">Enter code manually</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">Close scanner</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { type: string, data: string }) => {
    if (processing.current || scanned) return;
    processing.current = true;
    setScanned(true);
    try {
      await onScan(data);
    } finally {
      processing.current = false;
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim() || processing.current) return;
    setSubmittingManual(true);
    processing.current = true;
    try {
      await onScan(manualCode.trim());
      setManualCode('');
      setShowManual(false);
    } finally {
      setSubmittingManual(false);
      processing.current = false;
    }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        onMountError={event => setCameraError(event.message || 'Unable to start camera. Check camera permissions.')}
        style={StyleSheet.absoluteFillObject}
        facing={facing}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Floating Overlay Controls */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: Math.max(20, insets.bottom) }}
        >
          {/* Header bar */}
          <View className="flex-row items-center justify-between p-4 bg-black/60">
            <View className="flex-row items-center gap-2">
              <Ionicons name="qr-code-outline" size={22} color="#F97316" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">
                Scan Worker QR
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setFacing(current => (current === 'back' ? 'front' : 'back'))}
                className="w-11 h-11 rounded-full bg-white/20 items-center justify-center"
              >
                <Ionicons name="camera-reverse-outline" size={22} color="white" />
              </Pressable>
              <Pressable
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={onClose}
                className="w-11 h-11 rounded-full bg-white/20 items-center justify-center"
              >
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>
          </View>

          {/* Viewfinder frame */}
          <View className="flex-1 items-center justify-center py-6">
            <View style={{ width: frameSize, height: frameSize }} className="border-2 border-brand-orange/80 rounded-3xl items-center justify-center relative">
              <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-orange rounded-tl-3xl" />
              <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-orange rounded-tr-3xl" />
              <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-orange rounded-bl-3xl" />
              <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-orange rounded-br-3xl" />
              <View className="absolute w-full h-[2px] bg-brand-orange/50 top-1/2 shadow-lg shadow-brand-orange/50" />
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center mt-6 px-8 text-sm opacity-90 font-medium">
              Point your camera at the worker QR code.
            </Text>

            {scanned && (
              <Pressable
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => {
                  if (!processing.current) setScanned(false);
                }}
                className="bg-brand-orange rounded-xl px-6 py-3 mt-4"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">
                  Scan again
                </Text>
              </Pressable>
            )}

            {/* Manual Entry Fallback Button */}
            {!showManual ? (
              <Pressable
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowManual(true)}
                className="mt-6 bg-black/50 border border-white/20 px-4 py-2 rounded-xl flex-row items-center gap-2"
              >
                <Ionicons name="keypad-outline" size={16} color="white" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-semibold">
                  Or enter worker code manually
                </Text>
              </Pressable>
            ) : (
              <View className="mt-4 mx-6 p-4 bg-black/85 border border-white/20 rounded-2xl w-full max-w-sm">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold mb-2">
                  Enter Worker Code or UUID:
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="e.g. worker UUID or code"
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                    onSubmitEditing={handleManualSubmit}
                  />
                  <Pressable
                    onPress={handleManualSubmit}
                    disabled={submittingManual || !manualCode.trim()}
                    className="bg-brand-orange px-4 py-2 rounded-xl items-center justify-center"
                  >
                    <Text className="text-white font-bold text-sm">
                      {submittingManual ? '...' : 'Go'}
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setShowManual(false)} className="mt-2 self-center p-1">
                  <Text className="text-gray-400 text-xs">Hide manual entry</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

