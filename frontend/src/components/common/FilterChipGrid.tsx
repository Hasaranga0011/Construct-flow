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
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
      {options.map((option) => {
        const isSelected = selectedValue === option.id;
        return (
          <View key={option.id} className="w-1/2 sm:w-1/3 md:w-1/4 lg:w-[14.28%]" style={{ padding: 4 }}>
            <Pressable
              style={{ minHeight: 44 }}
              onPress={() => onSelect(option.id)}
              className={`w-full h-11 px-1 flex-row items-center justify-center rounded-xl border ${
                isSelected ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-200'
              }`}
            >
              <Text
                style={{ textAlign: 'center', flexShrink: 1 }}
                maxFontSizeMultiplier={1.3}
                numberOfLines={2}
                className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-brand-text'}`}
              >
                {option.label}
                {option.count !== undefined ? ` · ${option.count}` : ''}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};
