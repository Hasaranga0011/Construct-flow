import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ModalViewport } from './ModalViewport';
import { uploadSitePhotoBlob, uploadSitePhotoAsset } from '@/services/sitePhoto';

type PhotoCaptureModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  projectId?: string;
  caption?: string;
  onPhotoUploaded?: (url: string) => void;
  onAssetPicked?: (asset: ImagePicker.ImagePickerAsset) => Promise<void> | void;
};

export const PhotoCaptureModal = ({
  visible,
  onClose,
  title = 'Add Photo',
  projectId,
  caption = '',
  onPhotoUploaded,
  onAssetPicked,
}: PhotoCaptureModalProps) => {
  const [mode, setMode] = useState<'menu' | 'web-camera' | 'preview'>('menu');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Web camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    if (!visible) {
      stopWebCamera();
      setMode('menu');
      setCapturedPreview(null);
      setCapturedBlob(null);
      setErrorMessage('');
      setLoading(false);
    }
  }, [visible]);

  const stopWebCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start web live camera
  const startWebCamera = async (facing: 'environment' | 'user' = facingMode) => {
    setErrorMessage('');
    stopWebCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by this browser. Use device file upload below.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode('web-camera');
    } catch (err: any) {
      stopWebCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access was blocked. Please grant camera permission in your browser or choose a photo from device.');
      } else {
        setErrorMessage(err.message || 'Unable to access camera. Please choose from device.');
      }
      setMode('menu');
    }
  };

  // Capture frame from web video
  const snapWebPhoto = () => {
    if (Platform.OS !== 'web' || !videoRef.current) return;
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      // Mirror if user front camera
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setErrorMessage('Failed to capture photo from camera.');
            return;
          }
          const previewUrl = URL.createObjectURL(blob);
          setCapturedPreview(previewUrl);
          setCapturedBlob(blob);
          stopWebCamera();
          setMode('preview');
        },
        'image/jpeg',
        0.85
      );
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to capture photo frame.');
    }
  };

  // Switch between front/back camera on web
  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    void startWebCamera(next);
  };

  // Launch native camera (or start web camera)
  const handleLaunchCamera = async () => {
    setErrorMessage('');
    if (Platform.OS === 'web') {
      await startWebCamera(facingMode);
    } else {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setErrorMessage('Camera permission is required to snap photos.');
          return;
        }
        setLoading(true);
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: true,
        });

        if (result.canceled || !result.assets?.length) {
          setLoading(false);
          return;
        }

        const asset = result.assets[0];
        if (onAssetPicked) {
          await onAssetPicked(asset);
          onClose();
        } else if (projectId && onPhotoUploaded) {
          const url = await uploadSitePhotoAsset(asset, projectId, caption);
          onPhotoUploaded(url);
          onClose();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Camera capture failed.');
      } finally {
        setLoading(false);
      }
    }
  };

  // Launch device gallery / file explorer
  const handlePickFromDevice = async () => {
    setErrorMessage('');
    try {
      setLoading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets?.length) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      if (onAssetPicked) {
        await onAssetPicked(asset);
        onClose();
      } else if (projectId && onPhotoUploaded) {
        const url = await uploadSitePhotoAsset(asset, projectId, caption);
        onPhotoUploaded(url);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'File selection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Upload the snapped photo preview
  const handleConfirmCapturedPhoto = async () => {
    if (!capturedBlob) return;
    setLoading(true);
    setErrorMessage('');
    try {
      if (projectId && onPhotoUploaded) {
        const filename = `camera-${Date.now()}.jpg`;
        const url = await uploadSitePhotoBlob(capturedBlob, filename, projectId, caption);
        onPhotoUploaded(url);
        onClose();
      } else if (onAssetPicked) {
        // Construct asset-like object for web
        const asset: any = {
          uri: capturedPreview || '',
          file: new File([capturedBlob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          fileName: `camera-${Date.now()}.jpg`,
          fileSize: capturedBlob.size,
        };
        await onAssetPicked(asset);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Upload failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <View className="flex-row items-center flex-1 min-w-0">
              <View className="w-9 h-9 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name="camera" size={20} color="#F97316" />
              </View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-900">{title}</Text>
            </View>
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => {
                stopWebCamera();
                onClose();
              }}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </Pressable>
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View className="bg-red-50 border border-red-200 p-3 rounded-xl mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginTop: 2 }} />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-xs ml-2 flex-1">{errorMessage}</Text>
            </View>
          ) : null}

          {/* Loading Indicator */}
          {loading ? (
            <View className="py-12 items-center justify-center">
              <ActivityIndicator size="large" color="#F97316" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm mt-3 font-medium">Processing & Uploading Photo...</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-1">Saving directly to free Supabase Storage</Text>
            </View>
          ) : mode === 'menu' ? (
            /* Mode 1: Choice Menu */
            <View className="space-y-3">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 mb-2">
                Choose how you want to add this photo. Both real-time camera capture and device upload are supported.
              </Text>

              {/* Option A: Take Live Photo (Camera) */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleLaunchCamera}
                className="flex-row items-center p-4 bg-orange-50 border border-orange-200 rounded-xl active:bg-orange-100"
              >
                <View className="w-12 h-12 rounded-xl bg-brand-orange items-center justify-center mr-4 shadow-sm">
                  <Ionicons name="camera" size={24} color="white" />
                </View>
                <View className="flex-1">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-900 font-bold text-base">Take Live Photo</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">Capture real-time photo with your device camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#F97316" />
              </Pressable>

              {/* Option B: Choose from Device (Gallery / Files) */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handlePickFromDevice}
                className="flex-row items-center p-4 bg-gray-50 border border-gray-200 rounded-xl active:bg-gray-100 mt-3"
              >
                <View className="w-12 h-12 rounded-xl bg-gray-800 items-center justify-center mr-4 shadow-sm">
                  <Ionicons name="images" size={24} color="white" />
                </View>
                <View className="flex-1">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-900 font-bold text-base">Choose from Device</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">Upload existing image from phone or computer files</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </Pressable>

              <View className="mt-4 pt-3 border-t border-gray-100 flex-row items-center justify-center">
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs ml-1.5">Free Supabase Cloud Storage (No Cloudinary limits)</Text>
              </View>
            </View>
          ) : mode === 'web-camera' ? (
            /* Mode 2: Web Live Camera Viewfinder */
            <View className="items-center">
              <View className="relative w-full rounded-xl overflow-hidden bg-black mb-4 items-center justify-center">
                {/* HTML Video Preview */}
                {Platform.OS === 'web' && (
                  <video
                    ref={videoRef as any}
                    playsInline
                    autoPlay
                    muted
                    style={{
                      width: '100%',
                      maxHeight: '45vh',
                      minHeight: 240,
                      objectFit: 'cover',
                      borderRadius: 12,
                      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                    }}
                  />
                )}

                {/* Viewfinder Overlay HUD */}
                <View className="absolute inset-4 border border-dashed border-white/40 rounded-lg pointer-events-none" />
                <View className="absolute top-3 left-3 bg-red-600 px-2 py-0.5 rounded-full flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold uppercase tracking-wider">Live Camera</Text>
                </View>

                {/* Flip camera button */}
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={toggleFacingMode}
                  className="absolute top-3 right-3 bg-black/60 p-2 rounded-full"
                >
                  <Ionicons name="camera-reverse" size={20} color="white" />
                </Pressable>
              </View>

              {/* Action Buttons */}
              <View className="flex-row items-center justify-between w-full space-x-3">
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => {
                    stopWebCamera();
                    setMode('menu');
                  }}
                  className="px-4 py-3 bg-gray-100 rounded-xl"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold text-sm">Back</Text>
                </Pressable>

                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={snapWebPhoto}
                  className="flex-1 flex-row items-center justify-center bg-brand-orange py-3.5 rounded-xl shadow-md active:bg-orange-600"
                >
                  <Ionicons name="camera" size={20} color="white" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base ml-2">Capture Photo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Mode 3: Captured Photo Preview */
            <View className="items-center">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 mb-2">Review your captured photo before uploading</Text>

              {capturedPreview && (
                <View className="w-full h-56 rounded-xl overflow-hidden bg-gray-100 mb-4 border border-gray-200">
                  <Image source={{ uri: capturedPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </View>
              )}

              <View className="flex-row items-center w-full space-x-3">
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => {
                    setCapturedPreview(null);
                    setCapturedBlob(null);
                    if (Platform.OS === 'web') {
                      void startWebCamera(facingMode);
                    } else {
                      setMode('menu');
                    }
                  }}
                  className="px-4 py-3 bg-gray-100 rounded-xl mr-2"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold text-sm">🔄 Retake</Text>
                </Pressable>

                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={handleConfirmCapturedPhoto}
                  disabled={loading}
                  className="flex-1 flex-row items-center justify-center bg-brand-orange py-3.5 rounded-xl shadow-md active:bg-orange-600"
                >
                  <Ionicons name="cloud-upload" size={18} color="white" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base ml-2">Use & Attach Photo</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </ModalViewport>
    </Modal>
  );
};
