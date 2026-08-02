import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

type QRScannerProps = {
  onScan: (data: string) => void;
  onClose: () => void;
};

export const QRScanner = ({ onScan, onClose }: QRScannerProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

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
        <Text className="text-white text-center mb-6 text-lg font-bold">
          We need your permission to show the camera
        </Text>
        <Pressable 
          onPress={requestPermission}
          className="bg-brand-orange px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-bold">Grant Permission</Text>
        </Pressable>
        <Pressable onPress={onClose} className="mt-8">
          <Text className="text-gray-400 font-semibold">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarcodeScanned = ({ type, data }: { type: string, data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        <View className="flex-1">
          {/* Overlay mask */}
          <View className="flex-row items-center justify-between p-6 pt-12 bg-black/40">
            <Text className="text-white font-bold text-xl">ස්කෑන් කරන්න (Scan QR)</Text>
            <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-white/20 items-center justify-center">
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>
          
          <View className="flex-1 items-center justify-center">
            {/* Viewfinder frame */}
            <View className="w-64 h-64 border-2 border-brand-orange rounded-3xl items-center justify-center relative">
              <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-orange rounded-tl-3xl" />
              <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-orange rounded-tr-3xl" />
              <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-orange rounded-bl-3xl" />
              <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-orange rounded-br-3xl" />
              <View className="absolute w-full h-[2px] bg-brand-orange/50 top-1/2 shadow-lg shadow-brand-orange/50" />
            </View>
            <Text className="text-white text-center mt-8 px-8 opacity-80">
              Point your camera at the Site QR Code to check in or out.
            </Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
};
