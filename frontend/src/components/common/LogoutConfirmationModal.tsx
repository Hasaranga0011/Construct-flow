import { ModalViewport } from './ModalViewport';
import React from 'react';
import { Modal, Pressable, Text, View, ScrollView } from 'react-native';

interface LogoutConfirmationModalProps {
  visible: boolean;
  isDark: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const LogoutConfirmationModal = ({
  visible,
  isDark,
  onCancel,
  onConfirm,
}: LogoutConfirmationModalProps) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <ModalViewport>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className={`w-full max-w-sm max-h-full rounded-2xl shadow-2xl ${isDark ? 'bg-[#1E293B]' : 'bg-white'}`}>
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-orange-100">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl">!</Text>
        </View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Log out?
        </Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`mt-2 text-sm leading-5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
          Are you sure you want to log out of your account?
        </Text>
        <View className="mt-6 flex-row flex-wrap justify-end gap-3">
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={onCancel}
            className={`rounded-lg border px-4 py-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
          >
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Cancel</Text>
          </Pressable>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onConfirm} className="rounded-lg bg-red-500 px-4 py-3">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-white">Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ModalViewport>
  </Modal>
);
