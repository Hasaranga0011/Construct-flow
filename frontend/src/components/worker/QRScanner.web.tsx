import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import jsQR from 'jsqr';
import Ionicons from '@expo/vector-icons/Ionicons';

type Props = { onScan: (data: string) => void | Promise<void>; onClose: () => void };

export function QRScanner({ onScan, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  const stop = () => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  };

  const submit = async (data: string) => {
    if (busy.current) return;
    busy.current = true;
    setScanned(true);
    try {
      await callback.current(data);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Unable to process this QR code.');
    } finally {
      busy.current = false;
    }
  };

  const start = async () => {
    setError('');
    stop();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS or localhost. You can upload a QR image or enter code below.');
      }
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach(t => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setScanned(false);
      setRunning(true);
    } catch (e) {
      stop();
      setRunning(false);
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then retry, or upload/enter code.'
          : e instanceof Error
          ? e.message
          : 'Camera unavailable. Try uploading an image or entering code below.'
      );
    }
  };

  useEffect(() => {
    mounted.current = true;
    // Auto-start camera on mount
    void start();
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!running || scanned) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const interval = setInterval(() => {
      const frame = video.current;
      if (!context || !frame?.videoWidth || busy.current) return;
      canvas.width = Math.min(frame.videoWidth, 960);
      canvas.height = Math.round((frame.videoHeight * canvas.width) / frame.videoWidth);
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (code?.data) void submit(code.data);
    }, 250);
    return () => clearInterval(interval);
  }, [running, scanned]);

  const upload = async (file?: File) => {
    if (!file || busy.current) return;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const picture = new window.Image();
      picture.src = url;
      await picture.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(picture.width, picture.height));
      canvas.width = Math.round(picture.width * scale);
      canvas.height = Math.round(picture.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image decoding is unavailable.');
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (!code?.data) throw new Error('No QR code found in this image. Try another image or enter the code manually.');
      await submit(code.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read this image.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) return;
    setSubmittingManual(true);
    setError('');
    try {
      await submit(manualCode.trim());
      setManualCode('');
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: '#111827' }}
      contentContainerStyle={{ padding: 20, alignItems: 'center' }}
    >
      <View style={{ width: '100%', maxWidth: 640, gap: 16 }}>
        <View className="flex-row justify-between items-center border-b border-gray-800 pb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="qr-code-outline" size={24} color="#F97316" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xl font-bold">
              Scan Worker QR Code
            </Text>
          </View>
          <Pressable
            style={{ minHeight: 44, minWidth: 44 }}
            accessibilityLabel="Close QR scanner"
            onPress={onClose}
            className="p-2"
          >
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </Pressable>
        </View>

        <video
          ref={video}
          muted
          playsInline
          aria-label="QR camera preview"
          style={{
            width: '100%',
            maxHeight: '45vh',
            minHeight: 220,
            background: '#000',
            borderRadius: 12,
            objectFit: 'cover',
          }}
        />

        {!!error && (
          <View className="bg-red-900/40 border border-red-700/50 p-3 rounded-xl flex-row items-center gap-2">
            <Ionicons name="alert-circle" size={18} color="#F87171" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} accessibilityRole="alert" className="text-red-200 text-xs flex-1">
              {error}
            </Text>
          </View>
        )}

        <View className="flex-row flex-wrap gap-3">
          {!running && (
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              onPress={start}
              className="bg-brand-orange flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center gap-2"
            >
              <Ionicons name="camera-outline" size={18} color="white" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">
                Start camera
              </Text>
            </Pressable>
          )}
          {scanned && (
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => {
                if (!busy.current) setScanned(false);
              }}
              className="bg-brand-orange flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center gap-2"
            >
              <Ionicons name="refresh-outline" size={18} color="white" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">
                Scan another worker
              </Text>
            </Pressable>
          )}
        </View>

        {/* QR image upload fallback */}
        <View className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-xs font-semibold mb-2">
            Option 1: Upload QR image from device
          </Text>
          <input
            aria-label="Upload worker QR image"
            type="file"
            accept="image/*"
            style={{ color: '#fff', maxWidth: '100%' }}
            onChange={e => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </View>

        {/* Manual Code Input fallback */}
        <View className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-xs font-semibold mb-2">
            Option 2: Enter worker code or QR ID manually
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="e.g. worker UUID or code (W-0012)"
              placeholderTextColor="#9CA3AF"
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              onSubmitEditing={handleManualSubmit}
            />
            <Pressable
              onPress={handleManualSubmit}
              disabled={submittingManual || !manualCode.trim()}
              className="bg-brand-orange px-4 py-2 rounded-lg items-center justify-center"
            >
              <Text className="text-white font-bold text-sm">Submit</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
