import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Ionicons } from '@expo/vector-icons';
import { getApiUrl } from '../../lib/apiUrl';

import { ProjectImageUploader } from '../common/ProjectImageUploader';

export const EditProjectModal = ({ visible, onClose, project, onProjectUpdated }: { visible: boolean, onClose: () => void, project: any, onProjectUpdated: () => void }) => {
  const [form, setForm] = useState({
    name: '',
    location: '',
    status: 'active',
    total_budget: '0'
  });
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        location: project.location || '',
        status: project.status || 'active',
        total_budget: (project.total_budget || 0).toString()
      });
      const initialImages = Array.isArray(project.images) && project.images.length > 0
        ? project.images
        : (project.image_url ? [project.image_url] : []);
      setImages(initialImages);
    }
  }, [project]);

  const handleSubmit = async () => {
    if (!form.name?.trim() || !form.location?.trim()) {
      toast.error('Name and location are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        status: form.status,
        total_budget: Number(form.total_budget) || 0,
        image_url: images[0] || null,
        images: images
      };

      if (__DEV__) {
        console.log('[DEBUG PATCH /projects (Modal)]:', payload);
      }

      const res = await fetch(`${getApiUrl()}/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errText = 'Failed to update project';
        try {
          const errData = await res.json();
          if (typeof errData.detail === 'string') {
            errText = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            errText = errData.detail.map((d: any) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ');
          } else if (errData.message) {
            errText = errData.message;
          }
        } catch {
          errText = await res.text();
        }
        throw new Error(errText || `HTTP ${res.status}`);
      }

      toast.success('Project updated successfully!');
      onProjectUpdated();
      onClose();
    } catch (err: any) {
      const readable = typeof err === 'object' && err !== null ? (err.message || String(err)) : String(err);
      toast.error(readable || 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white rounded-2xl w-full max-w-xl max-h-full shadow-xl overflow-hidden">
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 py-4 border-b border-gray-100">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Edit Project</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2 -mr-2">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>
            {/* Project Photos & Cover Uploader */}
            <ProjectImageUploader
              images={images}
              onChangeImages={setImages}
              maxImages={5}
              projectName={form.name || project?.name || 'Project'}
            />

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1">Project Name</Text>
              <TextInput maxFontSizeMultiplier={1.3}
                value={form.name}
                onChangeText={txt => setForm({ ...form, name: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="Project Name"
                style={[{ outlineStyle: 'none' } as any, { minHeight: 44, minWidth: 44 }]}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1">Location</Text>
              <TextInput maxFontSizeMultiplier={1.3}
                value={form.location}
                onChangeText={txt => setForm({ ...form, location: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="Site Location"
                style={[{ outlineStyle: 'none' } as any, { minHeight: 44, minWidth: 44 }]}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1">Status</Text>
              {/* Simplified dropdown/picker for web/native */}
              <View className="flex-row flex-wrap gap-2">{['active', 'completed', 'on_hold'].map(option => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={option} accessibilityRole="radio" accessibilityState={{ checked: form.status === option }} onPress={() => setForm({ ...form, status: option })} className={`px-4 py-3 border rounded-lg ${form.status === option ? 'bg-orange-50 border-orange-500' : 'border-gray-200'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>{option.replace('_', ' ')}</Text></Pressable>)}</View>
            </View>

            <View className="mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-1">Total Budget (Rs.)</Text>
              <TextInput maxFontSizeMultiplier={1.3}
                value={form.total_budget}
                onChangeText={txt => setForm({ ...form, total_budget: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="0"
                keyboardType="numeric"
                style={[{ outlineStyle: 'none' } as any, { minHeight: 44, minWidth: 44 }]}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="px-6 py-4 border-t border-gray-100 flex-row flex-wrap justify-end gap-3">
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50" disabled={isSubmitting}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-semibold">Cancel</Text>
            </Pressable>
            
            <Pressable 
              onPress={handleSubmit} 
              disabled={isSubmitting}
              className="bg-brand-orange px-6 py-2.5 rounded-lg shadow-sm flex-row justify-center items-center opacity-100"
              style={[{ opacity: isSubmitting ? 0.7 : 1 }, { minHeight: 44, minWidth: 44 }]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-semibold">Save Changes</Text>
              )}
            </Pressable>
          </View>

        </View>
      </ModalViewport>
    </Modal>
  );
};
