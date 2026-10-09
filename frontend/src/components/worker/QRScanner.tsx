import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type QRScannerProps = {
  onScan: (data: string) => void | Promise<void>;
  onClose: () => void;
};

export const QRScanner = ({ onScan, onClose }: QRScannerProps) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const frameSize = Math.min(256, width - 48, height * 0.4);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
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
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center mb-6 text-lg font-bold">
          We need your permission to show the camera
        </Text>
        {Platform.OS === 'web' && (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-400 text-center mb-6 text-sm px-4">
            Note: Camera access on Web requires HTTPS or a secure localhost context. If clicking &apos;Grant&apos; does nothing, check your browser permissions.
          </Text>
        )}
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          onPress={async () => {
            try {
              await requestPermission();
            } catch {
              if (Platform.OS === 'web') window.alert("Browser blocked camera access.");
            }
          }}
          className="bg-brand-orange px-6 py-3 rounded-xl"
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Grant Permission</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="mt-8">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-semibold">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (cameraError) return <View className="flex-1 bg-black items-center justify-center p-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center">{cameraError}</Text><Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setCameraError('')} className="p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-400">Retry camera</Text></Pressable><Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white">Close scanner</Text></Pressable></View>;

  const handleBarcodeScanned = async ({ data }: { type: string, data: string }) => {
    if (processing.current || scanned) return;
    processing.current = true;
    setScanned(true);
    try { await onScan(data); }
    finally { processing.current = false; }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        onMountError={event => setCameraError(event.message || 'Unable to start camera. Check camera permissions.')}
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: Math.max(16, insets.bottom) }}>
          {/* Overlay mask */}
          <View className="flex-row items-center justify-between p-4 bg-black/40">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xl">Scan worker QR</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="w-11 h-11 rounded-full bg-white/20 items-center justify-center">
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            {/* Viewfinder frame */}
            <View style={{ width: frameSize, height: frameSize }} className="border-2 border-brand-orange rounded-3xl items-center justify-center relative">
              <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-orange rounded-tl-3xl" />
              <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-orange rounded-tr-3xl" />
              <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-orange rounded-bl-3xl" />
              <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-orange rounded-br-3xl" />
              <View className="absolute w-full h-[2px] bg-brand-orange/50 top-1/2 shadow-lg shadow-brand-orange/50" />
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center mt-8 px-8 opacity-80">
              Point your camera at the QR code.
            </Text>
            {scanned && <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => { if (!processing.current) setScanned(false); }} className="bg-brand-orange rounded-xl px-6 py-3 mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Scan again</Text></Pressable>}
          </View>
        </ScrollView>
      </CameraView>
    </View>
  );
};
