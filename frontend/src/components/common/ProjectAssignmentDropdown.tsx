import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AssignmentUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

interface ProjectAssignmentDropdownProps {
  label: string;
  users: AssignmentUser[];
  selectedIds: string[];
  multiple?: boolean;
  onChange: (ids: string[]) => void;
}

export const ProjectAssignmentDropdown = ({
  label,
  users,
  selectedIds,
  multiple = false,
  onChange,
}: ProjectAssignmentDropdownProps) => {
  const [open, setOpen] = useState(false);
  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));
  const selectedLabel = selectedUsers.length
    ? selectedUsers.map((user) => user.full_name || user.email).join(', ')
    : `Select ${label.toLowerCase()}`;

  const toggleUser = (userId: string) => {
    if (multiple) {
      onChange(selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]);
      return;
    }
    onChange(selectedIds.includes(userId) ? [] : [userId]);
  };

  return (
    <View className="mb-4">
      <Text className="text-gray-700 font-medium mb-2">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="min-h-[48px] flex-row items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
      >
        <Text className={`flex-1 ${selectedUsers.length ? 'text-gray-800' : 'text-gray-500'}`} numberOfLines={2}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#6B7280" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-center bg-black/40 px-6" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[70%] w-full max-w-[600px] mx-auto rounded-2xl bg-white p-5 shadow-xl" onPress={(event) => event.stopPropagation()}>
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-800">{label}</Text>
              <Pressable onPress={() => setOpen(false)} className="p-1">
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView>
              {users.length ? users.map((user) => {
                const selected = selectedIds.includes(user.id);
                return (
                  <Pressable
                    key={user.id}
                    onPress={() => toggleUser(user.id)}
                    className={`mb-2 rounded-lg border px-4 py-3 ${selected ? 'border-brand-orange bg-brand-orange' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <Text className={`${selected ? 'font-semibold text-white' : 'text-gray-700'}`}>
                      {user.full_name || user.email}
                    </Text>
                  </Pressable>
                );
              }) : <Text className="py-4 text-gray-500">No users available</Text>}
            </ScrollView>
            <Pressable onPress={() => setOpen(false)} className="mt-3 items-center rounded-lg bg-brand-orange py-3"><Text className="font-semibold text-white">Done</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};
