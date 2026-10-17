import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/apiUrl';
import { decode } from 'base64-arraybuffer';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Uploads a single ImagePickerAsset to Supabase Storage (bucket: project-images)
 * with graceful fallback to backend media endpoint and base64.
 */
export async function uploadProjectAsset(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const fileName = `covers/proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  // 1. Direct Supabase Storage upload
  try {
    let fileBody: any;
    if (Platform.OS === 'web') {
      if (asset.file) {
        fileBody = asset.file;
      } else {
        const response = await fetch(asset.uri);
        fileBody = await response.blob();
      }
    } else if (asset.base64) {
      fileBody = decode(asset.base64);
    } else {
      const response = await fetch(asset.uri);
      fileBody = await response.blob();
    }

    const { error: uploadError } = await supabase.storage
      .from('project-images')
      .upload(fileName, fileBody, {
        contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('project-images')
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
  } catch (sbErr) {
    console.warn('Supabase storage direct upload failed, trying backend media upload:', sbErr);
  }

  // 2. Fallback to backend /media/upload endpoint
  try {
    const formData = new FormData();
    const uploadName = `project-${Date.now()}.${ext}`;
    if (Platform.OS === 'web') {
      const blob = asset.file || await (await fetch(asset.uri)).blob();
      formData.append('file', blob, uploadName);
    } else {
      formData.append('file', {
        uri: asset.uri,
        name: uploadName,
        type: contentType,
      } as any);
    }
    formData.append('project_id', 'new_project');

    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    const res = await fetch(`${getApiUrl()}/media/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.url) {
        if (data.url.startsWith('http')) return data.url;
        return `${getApiUrl()}${data.url.startsWith('/') ? '' : '/'}${data.url}`;
      }
    }
  } catch (beErr) {
    console.warn('Backend media upload failed:', beErr);
  }

  // 3. Fallback to base64 data URL
  if (asset.base64) {
    return `data:${contentType};base64,${asset.base64}`;
  }
  return asset.uri;
}

/**
 * Launches the device photo library to pick and upload up to `remainingSlots` images.
 * Enforces maximum count (e.g. 5 images).
 */
export async function pickAndUploadProjectPhotos(
  currentCount: number,
  maxCount: number = 5,
  onProgress?: (index: number, total: number) => void
): Promise<string[]> {
  const remaining = maxCount - currentCount;
  if (remaining <= 0) {
    throw new Error(`You have already uploaded the maximum of ${maxCount} images.`);
  }

  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access photos is required to upload project images.');
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  const selectedAssets = result.assets.slice(0, remaining);
  const uploadedUrls: string[] = [];

  for (let i = 0; i < selectedAssets.length; i++) {
    const asset = selectedAssets[i];
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      console.warn(`Skipping asset ${asset.fileName || i} because it exceeds 10MB limit.`);
      continue;
    }
    if (onProgress) {
      onProgress(i + 1, selectedAssets.length);
    }
    try {
      const url = await uploadProjectAsset(asset);
      if (url) uploadedUrls.push(url);
    } catch (err) {
      console.warn(`Failed to upload photo asset index ${i}:`, err);
    }
  }

  return uploadedUrls;
}
