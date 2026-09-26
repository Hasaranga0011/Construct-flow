import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Ionicons } from '@expo/vector-icons';

export const EditProjectModal = ({ visible, onClose, project, onProjectUpdated }: { visible: boolean, onClose: () => void, project: any, onProjectUpdated: () => void }) => {
  const [form, setForm] = useState({
    name: '',
    location: '',
    status: 'active',
    completion_percentage: '0',
    total_budget: '0'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        location: project.location || '',
        status: project.status || 'active',
        completion_percentage: (project.completion_percentage || 0).toString(),
        total_budget: (project.total_budget || 0).toString()
      });
    }
  }, [project]);

  const handleSubmit = async () => {
    if (!form.name || !form.location) {
      toast.error('Name and location are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: form.name,
          location: form.location,
          status: form.status,
          completion_percentage: Number(form.completion_percentage),
          total_budget: Number(form.total_budget)
        })
        .eq('id', project.id);

      if (error) throw error;
      toast.success('Project updated successfully!');
      onProjectUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-center items-center">
        <View className="bg-white rounded-2xl w-full max-w-md max-h-[90%] m-4 shadow-xl overflow-hidden">
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 py-4 border-b border-gray-100">
            <Text className="text-xl font-bold text-brand-text">Edit Project</Text>
            <Pressable onPress={onClose} className="p-2 -mr-2">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="p-6">
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-1">Project Name</Text>
              <TextInput
                value={form.name}
                onChangeText={txt => setForm({ ...form, name: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="Project Name"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-1">Location</Text>
              <TextInput
                value={form.location}
                onChangeText={txt => setForm({ ...form, location: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="Site Location"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>

            <View className="mb-4 flex-row gap-4">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-700 mb-1">Status</Text>
                {/* Simplified dropdown/picker for web/native */}
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={{
                    width: '100%', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB',
                    borderRadius: '8px', padding: '12px 16px', outline: 'none',
                    color: '#1A1A1A', fontSize: '14px'
                  }}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-700 mb-1">Completion %</Text>
                <TextInput
                  value={form.completion_percentage}
                  onChangeText={txt => setForm({ ...form, completion_percentage: txt })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                  placeholder="0"
                  keyboardType="numeric"
                  style={{ outlineStyle: 'none' } as any}
                />
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-sm font-semibold text-gray-700 mb-1">Total Budget (Rs.)</Text>
              <TextInput
                value={form.total_budget}
                onChangeText={txt => setForm({ ...form, total_budget: txt })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-brand-text outline-none focus:border-brand-orange transition-colors"
                placeholder="0"
                keyboardType="numeric"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="px-6 py-4 border-t border-gray-100 flex-row justify-end space-x-3 gap-3">
            <Pressable onPress={onClose} className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50" disabled={isSubmitting}>
              <Text className="text-gray-600 font-semibold">Cancel</Text>
            </Pressable>
            
            <Pressable 
              onPress={handleSubmit} 
              disabled={isSubmitting}
              className="bg-brand-orange px-6 py-2.5 rounded-lg shadow-sm flex-row justify-center items-center opacity-100"
              style={{ opacity: isSubmitting ? 0.7 : 1 }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-semibold">Save Changes</Text>
              )}
            </Pressable>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
