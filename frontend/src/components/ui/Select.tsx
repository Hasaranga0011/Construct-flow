import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';
import { dropdownLayout } from '@/utils/dropdownLayout';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const Select = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled
}: SelectProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 220, height: 48 });
  const [filterQuery, setFilterQuery] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const viewport = useVisibleViewport();

  const selectedOption = options.find(o => o.value === value);

  const measureAndOpen = () => {
    if (disabled) return;
    setFilterQuery('');
    if (triggerRef.current) {
      if (Platform.OS === 'web') {
        const node = triggerRef.current as any;
        if (node?.getBoundingClientRect) {
          const rect = node.getBoundingClientRect();
          setLayout({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          });
          setOpen(true);
          return;
        }
      }
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setLayout({ x, y, width, height });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  const handleSelect = (val: string) => {
    onValueChange(val);
    setOpen(false);
  };

  const filteredOptions = filterQuery
    ? options.filter(opt => opt.label.toLowerCase().includes(filterQuery.toLowerCase()))
    : options;

  // Compute clamped position so dropdown never overflows off-screen
  const menuLayout = dropdownLayout(layout, viewport, Math.max(1,filteredOptions.length), options.length > 6);

  return (
    <>
      <View ref={triggerRef} collapsable={false} className={`relative ${className}`}>
        <Pressable
          onPress={measureAndOpen}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={selectedOption?.label || placeholder}
          accessibilityState={{ expanded: open, disabled: !!disabled }}
          style={open ? { borderColor: '#F97316', borderWidth: 1.5 } : undefined}
          className={`flex-row items-center justify-between min-h-[48px] px-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1E293B] ${disabled ? 'opacity-60' : ''}`}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            className={`text-sm font-medium ${selectedOption?.value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}
            numberOfLines={1}
            style={{ flex: 1, marginRight: 8 }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#6B7280" />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
          onPress={() => setOpen(false)}
        >
          <View
            testID="select-options-menu"
            style={{
              position: 'absolute',
              ...menuLayout,
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 25,
              zIndex: 9999,
              overflow: 'hidden',
            }}
          >
            {options.length > 6 && (
              <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 8, minHeight: 44 }}>
                  <Ionicons name="search" size={14} color="#9CA3AF" style={{ marginRight: 6 }} />
                  <TextInput
                    value={filterQuery}
                    onChangeText={setFilterQuery}
                    accessibilityLabel="Search options"
                    placeholder="Search options…"
                    placeholderTextColor="#9CA3AF"
                    style={{ flex: 1, minWidth: 0, fontSize: 16, color: '#111827', minHeight: 44, outlineStyle: 'none' as any }}
                    autoFocus={windowWidth >= 768}
                  />
                  {filterQuery ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Clear options search" style={{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"}} onPress={() => setFilterQuery('')}>
                      <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {filteredOptions.length === 0 ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#9CA3AF' }}>No matching options</Text>
                </View>
              ) : (
                filteredOptions.slice(0, 100).map(opt => {
                  const isSelected = value === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{selected:isSelected}}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleSelect(opt.value);
                      }}
                      style={{
                        minHeight: 48,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isSelected ? '#FFF7ED' : 'transparent',
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={{
                          fontSize: 14,
                          lineHeight: 20,
                          fontWeight: isSelected ? '700' : '400',
                          color: isSelected ? '#EA580C' : '#1F2937',
                          flex: 1,
                          minWidth: 0,
                          marginRight: 8,
                        }}
                      >
                        {opt.label}
                      </Text>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={16} color="#EA580C" />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
              {filteredOptions.length > 100 && <Text style={{ padding: 14, fontSize: 12, color: '#64748B' }}>Showing the first 100 matches. Refine your search to find another item.</Text>}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};
