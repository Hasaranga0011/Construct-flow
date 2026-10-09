import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalViewport } from '../common/ModalViewport';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const Select = ({ value, onValueChange, options, placeholder = 'Select...', className = '', disabled }: SelectProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 220, height: 48 });

  const selectedOption = options.find(o => o.value === value);

  const measureAndOpen = () => {
    if (disabled) return;
    if (triggerRef.current) {
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

  // Close on web when clicking outside
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const handleWindowClick = (e: any) => setOpen(false);
    window.addEventListener('click', handleWindowClick, true);
    return () => window.removeEventListener('click', handleWindowClick, true);
  }, [open]);

  return (
    <>
      <View ref={triggerRef} className={`relative ${className}`}>
        <Pressable
          onPress={measureAndOpen}
          disabled={disabled}
          className={`flex-row items-center justify-between min-h-[48px] px-4 rounded-xl border bg-white dark:bg-[#1E293B] ${open ? 'border-brand-orange' : 'border-gray-300 dark:border-gray-700'} ${disabled ? 'opacity-60' : ''}`}
        >
          <Text maxFontSizeMultiplier={1.3} className="text-base text-gray-800 dark:text-gray-200" numberOfLines={1}>
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </Pressable>
      </View>

      {open && (
        <ModalViewport>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setOpen(false)} />
          <View style={{
            position: 'absolute',
            top: layout.y + layout.height + 4,
            left: layout.x,
            width: layout.width,
            maxHeight: 250,
            backgroundColor: 'white',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 10,
            overflow: 'hidden',
          }}>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {options.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSelect(opt.value)}
                  style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
                  className={`border-b border-gray-50 ${value === opt.value ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                >
                  <Text maxFontSizeMultiplier={1.3} className={`text-base ${value === opt.value ? 'text-brand-orange font-bold' : 'text-gray-800'}`}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </ModalViewport>
      )}
    </>
  );
};
