import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from './api';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Upload an ImagePicker asset to free Supabase Storage via /api/media/upload.
 */
export async function uploadSitePhotoAsset(
  asset: ImagePicker.ImagePickerAsset,
  projectId: string,
  caption: string = ''
): Promise<string> {
  const type = asset.mimeType || 'image/jpeg';
  if (!ALLOWED_MIME_TYPES.includes(type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image.');
  }
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    throw new Error('Photo must be 10 MB or smaller.');
  }

  const form = new FormData();
  const ext = type.split('/')[1] || 'jpg';
  const name = asset.fileName || `site-photo-${Date.now()}.${ext}`;

  if (Platform.OS === 'web') {
    const blob = asset.file || await (await fetch(asset.uri)).blob();
    form.append('file', blob, name);
  } else {
    form.append('file', { uri: asset.uri, name, type } as unknown as Blob);
  }

  form.append('project_id', projectId);
  if (caption) form.append('caption', caption);

  const uploaded = await api.media.upload(form);
  if (!uploaded.url) {
    throw new Error('Upload did not return a photo URL. Please retry.');
  }
  return uploaded.url;
}

/**
 * Upload a raw Blob (e.g. captured from web live camera) to free Supabase Storage.
 */
export async function uploadSitePhotoBlob(
  blob: Blob,
  fileName: string,
  projectId: string,
  caption: string = ''
): Promise<string> {
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('Photo must be 10 MB or smaller.');
  }

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('project_id', projectId);
  if (caption) form.append('caption', caption);

  const uploaded = await api.media.upload(form);
  if (!uploaded.url) {
    throw new Error('Upload did not return a photo URL. Please retry.');
  }
  return uploaded.url;
}

/**
 * Pick an existing photo from the device storage / gallery and upload.
 */
export async function pickSitePhoto(projectId: string, caption: string = ''): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || !result.assets?.length) return null;
  return await uploadSitePhotoAsset(result.assets[0], projectId, caption);
}

/**
 * Take a real-time photo using the device camera and upload.
 */
export async function takeSitePhotoWithCamera(projectId: string, caption: string = ''): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission is required to capture photos.');
    }
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || !result.assets?.length) return null;
  return await uploadSitePhotoAsset(result.assets[0], projectId, caption);
}
