import React from 'react';
import { View, Text, Pressable } from 'react-native';

export type FilterOption = {
  id: string;
  label: string;
  count?: number;
};

interface FilterChipGridProps {
  options: FilterOption[];
  selectedValue: string;
  onSelect: (id: string) => void;
}

export const FilterChipGrid = ({ options, selectedValue, onSelect }: FilterChipGridProps) => {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {options.map((option) => {
        const isSelected = selectedValue === option.id;
        return (
          <Pressable
            key={option.id}
            style={{ minHeight: 44, paddingHorizontal: 16 }}
            onPress={() => onSelect(option.id)}
            className={`flex-row items-center justify-center rounded-xl border ${
              isSelected ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-200'
            }`}
          >
            <Text
              style={{ textAlign: 'center', flexShrink: 1 }}
              maxFontSizeMultiplier={1.3}
              className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-brand-text'}`}
            >
              {option.label}
              {option.count !== undefined ? ` · ${option.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
