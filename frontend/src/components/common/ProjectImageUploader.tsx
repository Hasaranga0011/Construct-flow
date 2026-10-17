import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_IMAGE_PRESETS, ProjectImagePreset } from '../../utils/projectImages';
import { pickAndUploadProjectPhotos } from '../../services/projectPhoto';

export interface ProjectImageUploaderProps {
  images: string[];
  onChangeImages: (images: string[]) => void;
  maxImages?: number;
  primaryIndex?: number;
  onSetPrimaryIndex?: (index: number) => void;
  projectName?: string;
}

export const ProjectImageUploader: React.FC<ProjectImageUploaderProps> = ({
  images = [],
  onChangeImages,
  maxImages = 5,
  primaryIndex = 0,
  onSetPrimaryIndex,
  projectName = 'Project',
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const activeIndex = Math.min(primaryIndex, Math.max(0, images.length - 1));
  const coverImage = images[activeIndex] || null;

  const handlePickImages = async () => {
    if (images.length >= maxImages) {
      Alert.alert('Maximum Reached', `You can upload up to ${maxImages} images for a project.`);
      return;
    }

    setUploading(true);
    setUploadProgress(null);
    try {
      const newUrls = await pickAndUploadProjectPhotos(
        images.length,
        maxImages,
        (current, total) => setUploadProgress({ current, total })
      );

      if (newUrls.length > 0) {
        const combined = [...images, ...newUrls].slice(0, maxImages);
        onChangeImages(combined);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Failed to upload images.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updated = images.filter((_, i) => i !== indexToRemove);
    onChangeImages(updated);
    if (onSetPrimaryIndex) {
      if (indexToRemove === activeIndex) {
        onSetPrimaryIndex(0);
      } else if (indexToRemove < activeIndex) {
        onSetPrimaryIndex(activeIndex - 1);
      }
    }
  };

  const handleSetPrimary = (index: number) => {
    if (onSetPrimaryIndex) {
      onSetPrimaryIndex(index);
    } else {
      // Reorder array so primary is at index 0
      const selected = images[index];
      const rest = images.filter((_, i) => i !== index);
      onChangeImages([selected, ...rest]);
    }
  };

  const handleAddPreset = (preset: ProjectImagePreset) => {
    if (images.length >= maxImages) {
      Alert.alert('Maximum Reached', `You can only add up to ${maxImages} images.`);
      return;
    }
    if (images.includes(preset.url)) {
      Alert.alert('Already Added', 'This image is already in your gallery.');
      return;
    }
    onChangeImages([...images, preset.url]);
  };

  const handleAddCustomUrl = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    if (images.length >= maxImages) {
      Alert.alert('Maximum Reached', `You can only add up to ${maxImages} images.`);
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a valid HTTP/HTTPS image URL.');
      return;
    }
    onChangeImages([...images, trimmed]);
    setCustomUrl('');
    setShowUrlInput(false);
  };

  return (
    <View className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
      {/* Header with counter */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-lg bg-orange-100 items-center justify-center">
            <Ionicons name="images-outline" size={18} color="#EA580C" />
          </View>
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-900 font-bold text-sm">
              Project Photos & Cover
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">
              Upload up to 5 photos from your device
            </Text>
          </View>
        </View>

        <View className={`px-2.5 py-1 rounded-full border ${images.length >= maxImages ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${images.length >= maxImages ? 'text-amber-700' : 'text-gray-700'}`}>
            {images.length} / {maxImages}
          </Text>
        </View>
      </View>

      {/* Main Cover Preview Banner */}
      {coverImage ? (
        <View className="relative w-full rounded-xl overflow-hidden mb-4 border border-slate-200" style={{ height: 160 }}>
          <Image source={{ uri: coverImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <View className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          
          <View className="absolute top-3 left-3 bg-brand-orange px-2.5 py-1 rounded-full flex-row items-center gap-1 shadow-sm">
            <Ionicons name="star" size={12} color="#FFFFFF" />
            <Text className="text-[10px] font-extrabold text-white uppercase tracking-wider">
              Primary Cover Photo
            </Text>
          </View>

          <View className="absolute bottom-3 left-3 right-3 flex-row justify-between items-end">
            <View className="flex-1 mr-2">
              <Text numberOfLines={1} className="text-white font-bold text-sm shadow-sm">
                {projectName}
              </Text>
              <Text className="text-gray-200 text-[11px]">
                Shown on cards, proposals, and headers
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handlePickImages}
          disabled={uploading}
          activeOpacity={0.8}
          className="w-full border-2 border-dashed border-slate-300 hover:border-brand-orange rounded-xl p-6 items-center justify-center bg-white mb-4"
        >
          <View className="w-12 h-12 rounded-full bg-orange-50 items-center justify-center mb-2">
            <Ionicons name="cloud-upload-outline" size={24} color="#EA580C" />
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-800 mb-0.5">
            Upload Project Photos
          </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 text-center">
            Tap to select up to 5 photos from your device (JPEG, PNG, WebP)
          </Text>
        </TouchableOpacity>
      )}

      {/* Thumbnails Row / Grid */}
      <View className="flex-row flex-wrap gap-2.5 mb-3">
        {images.map((url, idx) => {
          const isCover = idx === activeIndex;
          return (
            <View
              key={`${url}-${idx}`}
              className={`relative rounded-xl overflow-hidden border-2 bg-slate-100 ${isCover ? 'border-brand-orange ring-2 ring-orange-400/30' : 'border-slate-200'}`}
              style={{ width: 88, height: 72 }}
            >
              <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />

              {/* Cover Indicator / Button */}
              {isCover ? (
                <View className="absolute top-1 left-1 bg-brand-orange/90 rounded-full px-1.5 py-0.5 flex-row items-center gap-0.5">
                  <Ionicons name="star" size={9} color="#fff" />
                  <Text className="text-[8px] font-bold text-white uppercase">Cover</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => handleSetPrimary(idx)}
                  className="absolute bottom-1 left-1 bg-black/60 hover:bg-black/80 rounded px-1.5 py-0.5"
                >
                  <Text className="text-[8px] font-semibold text-white">Set Cover</Text>
                </TouchableOpacity>
              )}

              {/* Remove Button */}
              <TouchableOpacity
                onPress={() => handleRemoveImage(idx)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 items-center justify-center"
              >
                <Ionicons name="close" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Upload More Card */}
        {images.length < maxImages && (
          <TouchableOpacity
            onPress={handlePickImages}
            disabled={uploading}
            className="rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-orange bg-white items-center justify-center p-2"
            style={{ width: 88, height: 72 }}
          >
            {uploading ? (
              <View className="items-center">
                <ActivityIndicator size="small" color="#EA580C" />
                {uploadProgress && (
                  <Text className="text-[9px] text-gray-500 font-bold mt-1">
                    {uploadProgress.current}/{uploadProgress.total}
                  </Text>
                )}
              </View>
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#EA580C" />
                <Text numberOfLines={1} className="text-[10px] font-bold text-gray-700 mt-1">
                  + Add Photo
                </Text>
                <Text className="text-[8px] text-gray-400">
                  {maxImages - images.length} left
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons Row */}
      <View className="flex-row flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
        <View className="flex-row items-center gap-2">
          {images.length < maxImages && (
            <TouchableOpacity
              onPress={handlePickImages}
              disabled={uploading}
              className="bg-brand-orange/10 hover:bg-brand-orange/20 px-3 py-1.5 rounded-lg flex-row items-center gap-1.5"
            >
              <Ionicons name="cloud-upload" size={14} color="#EA580C" />
              <Text className="text-xs font-bold text-brand-orange">
                {uploading ? 'Uploading...' : 'Upload Photos'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setShowPresets(!showPresets)}
            className="bg-white border border-slate-200 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg flex-row items-center gap-1"
          >
            <Ionicons name="sparkles-outline" size={13} color="#64748B" />
            <Text className="text-xs font-medium text-gray-700">
              {showPresets ? 'Hide Presets' : 'Choose Preset'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowUrlInput(!showUrlInput)}
            className="bg-white border border-slate-200 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg flex-row items-center gap-1"
          >
            <Ionicons name="link-outline" size={13} color="#64748B" />
            <Text className="text-xs font-medium text-gray-700">URL</Text>
          </TouchableOpacity>
        </View>

        {images.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeImages([])}
            className="px-2 py-1 rounded"
          >
            <Text className="text-xs text-red-600 font-medium">Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Custom URL Input Bar */}
      {showUrlInput && (
        <View className="mt-3 flex-row items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
          <TextInput
            maxFontSizeMultiplier={1.3}
            style={{ flex: 1, minHeight: 34 }}
            className="text-xs text-gray-800 px-2"
            placeholder="Paste public image URL (https://...)"
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={handleAddCustomUrl}
            className="bg-brand-orange px-3 py-1.5 rounded-lg"
          >
            <Text className="text-xs font-bold text-white">Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Preset Chooser Drawer */}
      {showPresets && (
        <View className="mt-3 pt-3 border-t border-slate-200">
          <Text className="text-xs font-bold text-gray-700 mb-2">
            Click to add curated architectural style:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row pb-1">
            {PROJECT_IMAGE_PRESETS.map(preset => {
              const isAdded = images.includes(preset.url);
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => handleAddPreset(preset)}
                  disabled={isAdded || images.length >= maxImages}
                  className={`rounded-lg overflow-hidden border-2 mr-2 ${isAdded ? 'border-emerald-500 opacity-60' : 'border-slate-200 hover:border-brand-orange'}`}
                  style={{ width: 84, height: 58 }}
                >
                  <Image source={{ uri: preset.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                    <Text numberOfLines={1} className="text-[8px] font-bold text-white text-center">
                      {isAdded ? '✓ Added' : preset.category}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
