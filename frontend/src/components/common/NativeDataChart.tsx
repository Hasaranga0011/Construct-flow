import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';

type Series = { key: string; label: string; color: string };
type ChartProps = {
  data: Record<string, unknown>[];
  labelKey: string;
  series: Series[];
  onSelect?: (row: Record<string, unknown>) => void;
};

const numericValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// Native rows preserve labels, values and drill-down without browser SVG/chart APIs.
export function NativeDataChart({ data, labelKey, series, onSelect }: ChartProps) {
  const maximum = data.reduce((max, row) => series.reduce(
    (current, item) => Math.max(current, numericValue(row[item.key])), max,
  ), 1);

  return (
    <ScrollView nestedScrollEnabled style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 16, paddingVertical: 8 }}>
      {data.map((row, index) => (
        <Pressable key={String(row.id ?? index)} accessibilityRole={onSelect ? 'button' : undefined}
          disabled={!onSelect} onPress={() => onSelect?.(row)}>
          <Text style={{ fontWeight: '600', color: '#334155', marginBottom: 6 }}>
            {String(row[labelKey] ?? index + 1)}
          </Text>
          {series.map(item => {
            const value = numericValue(row[item.key]);
            return (
              <View key={item.key} style={{ marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ flexGrow: 1, flexShrink: 1, color: '#64748B' }}>{item.label}</Text>
                  <Text style={{ flexShrink: 1, color: '#334155' }}>{value.toLocaleString()}</Text>
                </View>
                <View style={{ backgroundColor: '#F1F5F9', height: 8, marginTop: 4, borderRadius: 4 }}>
                  <View style={{ width: `${Math.max(0, Math.min(100, value / maximum * 100))}%`,
                    height: 8, backgroundColor: String(row.fill || item.color), borderRadius: 4 }} />
                </View>
              </View>
            );
          })}
        </Pressable>
      ))}
    </ScrollView>
  );
}
