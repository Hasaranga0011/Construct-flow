import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

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
    <View className="flex-1 items-center justify-center bg-black/50 px-6">
      <View className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl ${isDark ? 'bg-[#1E293B]' : 'bg-white'}`}>
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-orange-100">
          <Text className="text-2xl">!</Text>
        </View>
        <Text className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Log out?
        </Text>
        <Text className={`mt-2 text-sm leading-5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
          Are you sure you want to log out of your account?
        </Text>
        <View className="mt-6 flex-row justify-end gap-3">
          <Pressable
            onPress={onCancel}
            className={`rounded-lg border px-4 py-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
          >
            <Text className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Cancel</Text>
          </Pressable>
          <Pressable onPress={onConfirm} className="rounded-lg bg-red-500 px-4 py-3">
            <Text className="font-semibold text-white">Log out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);
