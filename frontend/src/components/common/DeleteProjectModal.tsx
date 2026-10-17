import { ModalViewport } from './ModalViewport';
import React, { useState, useEffect } from 'react';
import { Modal, Pressable, Text, View, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface DeleteProjectModalProps {
  visible: boolean;
  projectName: string;
  isDark?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteProjectModal = ({
  visible,
  projectName,
  isDark = false,
  loading = false,
  onCancel,
  onConfirm,
}: DeleteProjectModalProps) => {
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (visible) {
      setTypedName('');
    }
  }, [visible]);

  const isMatch = typedName.trim() === projectName.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <ModalViewport>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ padding: 24 }}
          className={`w-full max-w-md max-h-full rounded-2xl shadow-2xl ${isDark ? 'bg-[#1E293B]' : 'bg-white'}`}
        >
          {/* Header Icon & Title */}
          <View className="flex-row items-center mb-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-red-100 mr-3">
              <Ionicons name="trash" size={24} color="#EF4444" />
            </View>
            <View className="flex-1">
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}
              >
                Permanently Delete Project
              </Text>
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className="text-xs text-red-500 font-semibold"
              >
                This action cannot be undone
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text
            style={{ flexShrink: 1, minWidth: 0 }}
            maxFontSizeMultiplier={1.3}
            className={`text-sm leading-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
          >
            Permanently delete <Text className="font-bold">&quot;{projectName}&quot;</Text>? All project data, assignments, and local records will be deleted.
          </Text>

          {/* Confirmation Input Instructions */}
          <View className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100">
            <Text
              style={{ flexShrink: 1, minWidth: 0 }}
              maxFontSizeMultiplier={1.3}
              className="text-xs text-red-800"
            >
              To confirm, type the project name <Text className="font-bold underline">&quot;{projectName}&quot;</Text> below:
            </Text>
          </View>

          {/* Input Field */}
          <TextInput
            value={typedName}
            onChangeText={setTypedName}
            placeholder={projectName}
            placeholderTextColor={isDark ? '#64748B' : '#9CA3AF'}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            className={`mt-3 px-4 py-3 rounded-xl border font-medium text-sm ${
              isDark
                ? 'bg-gray-800 text-white border-gray-700 focus:border-red-500'
                : 'bg-gray-50 text-gray-900 border-gray-300 focus:border-red-500'
            }`}
          />

          {/* Action Buttons */}
          <View className="mt-6 flex-row flex-wrap justify-end gap-3">
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              disabled={loading}
              onPress={onCancel}
              className={`rounded-lg border px-5 py-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
            >
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
              >
                Cancel
              </Text>
            </Pressable>

            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              disabled={!isMatch || loading}
              onPress={onConfirm}
              className={`rounded-lg px-5 py-3 flex-row items-center justify-center ${
                isMatch && !loading ? 'bg-red-500' : 'bg-red-300 opacity-60'
              }`}
            >
              {loading && <ActivityIndicator size="small" color="#ffffff" className="mr-2" />}
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className="font-semibold text-white"
              >
                {loading ? 'Deleting...' : 'Delete Project'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </ModalViewport>
    </Modal>
  );
};
