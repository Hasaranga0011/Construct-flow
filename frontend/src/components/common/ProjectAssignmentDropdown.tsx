import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnchoredOverlay } from './AnchoredOverlay';

type AssignmentUser = { id: string; full_name?: string | null; email?: string | null };
interface ProjectAssignmentDropdownProps {
  label: string; users: AssignmentUser[]; selectedIds: string[]; multiple?: boolean;
  onChange: (ids: string[]) => void;
}
export const ProjectAssignmentDropdown = ({ label, users, selectedIds, multiple = false, onChange }: ProjectAssignmentDropdownProps) => {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  const selectedUsers = users.filter(user => selectedIds.includes(user.id));
  const toggleUser = (id: string) => {
    onChange(multiple ? selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] : selectedIds.includes(id) ? [] : [id]);
    if (!multiple) setOpen(false);
  };
  return <View className="mb-4 min-w-0">
    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">{label}</Text>
    <View ref={anchor} collapsable={false}>
      <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} className="min-h-[48px] flex-row items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`flex-1 min-w-0 pr-2 ${selectedUsers.length ? 'text-gray-800' : 'text-gray-500'}`}>
          {selectedUsers.length ? selectedUsers.map(user => user.full_name || user.email).join(', ') : `Select ${label.toLowerCase()}`}
        </Text><Ionicons name="chevron-down" size={18} color="#6B7280" />
      </Pressable>
    </View>
    <AnchoredOverlay anchor={anchor} visible={open} onClose={() => setOpen(false)}>
      <View className="flex-row items-center px-4 border-b border-gray-100">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 min-w-0 font-bold text-gray-800">{label}</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel={`Close ${label}`} onPress={() => setOpen(false)} className="min-h-[44px] min-w-[44px] items-center justify-center"><Ionicons name="close" size={22} color="#6B7280" /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {users.length ? users.map(user => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.includes(user.id) }} onPress={() => toggleUser(user.id)} className={`min-h-[44px] flex-row items-center px-4 py-3 border-b border-gray-100 ${selectedIds.includes(user.id) ? 'bg-orange-50' : ''}`}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 min-w-0 pr-2 text-gray-700">{user.full_name || user.email}</Text>
          {selectedIds.includes(user.id) && <Ionicons name="checkmark" size={18} color="#F97316" />}
        </Pressable>) : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="p-4 text-gray-500">No users available</Text>}
      </ScrollView>
      {multiple && <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setOpen(false)} className="min-h-[44px] items-center justify-center bg-brand-orange px-4 py-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-white">Done</Text></Pressable>}
    </AnchoredOverlay>
  </View>;
};
