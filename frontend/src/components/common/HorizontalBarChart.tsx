import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';

export interface HorizontalBarChartData {
  id: string;
  label: string;
  value: number; // percentage
  color: string;
  tooltipTitle?: string;
  tooltipSubtitle?: string;
}

interface HorizontalBarChartProps {
  data: HorizontalBarChartData[];
  title: string;
  subtitle?: string;
  emptyMessage?: string;
  onRowPress?: (item: HorizontalBarChartData) => void;
  maxValue?: number; 
  showReferenceLine?: boolean;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  title,
  subtitle,
  emptyMessage = 'No data available.',
  onRowPress,
  maxValue,
  showReferenceLine = false,
}) => {
  const { isMobile } = useResponsive();
  const [showAll, setShowAll] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  if (!data || data.length === 0) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 items-center justify-center py-12">
        <Ionicons name="bar-chart-outline" size={48} color="#D1D5DB" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-2 text-center px-4">
          {emptyMessage}
        </Text>
      </View>
    );
  }

  const dataMax = Math.max(...data.map((d) => d.value));
  const domainMax = maxValue !== undefined ? maxValue : Math.max(100, dataMax);

  const top8 = data.slice(0, 8);
  const displayedData = showAll ? data : top8;
  const hasMore = data.length > 8;

  const labelWidth = isMobile ? 120 : 160;

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <View className="flex-row flex-wrap justify-between items-start mb-6 gap-2">
        <View className="flex-1 pr-4 min-w-[200px]">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">
            {title}
          </Text>
          {subtitle && (
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">
              {subtitle}
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-3 mt-1">
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-sm bg-brand-success mr-1" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">{'<70%'}</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-sm bg-brand-warning mr-1" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">70-99%</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-sm bg-brand-danger mr-1" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">≥100%</Text>
          </View>
        </View>
      </View>

      <View style={{ maxHeight: showAll ? 400 : undefined }} className={showAll ? 'overflow-hidden' : ''}>
        <ScrollView 
          showsVerticalScrollIndicator={true} 
          scrollEnabled={showAll}
          nestedScrollEnabled={true}
        >
          <View className="relative">
            {showReferenceLine && domainMax > 100 && (
              <View 
                style={{ 
                  position: 'absolute', 
                  left: labelWidth + ((100 / domainMax) * 100) + '%',
                  marginLeft: -(100 / domainMax) * labelWidth,
                  top: 0, 
                  bottom: 0, 
                  width: 1, 
                  backgroundColor: '#E5E7EB',
                  zIndex: 0 
                }} 
              >
                <View style={{ position: 'absolute', top: -16, left: -14, backgroundColor: '#fff', paddingHorizontal: 2 }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400 font-bold">100%</Text>
                </View>
              </View>
            )}

            {displayedData.map((item, index) => {
              const barWidthPercent = Math.min(100, (item.value / domainMax) * 100);
              const showTooltip = activeTooltip === item.id;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (onRowPress) onRowPress(item);
                  }}
                  onHoverIn={Platform.OS === 'web' ? () => setActiveTooltip(item.id) : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setActiveTooltip(null) : undefined}
                  // @ts-ignore
                  onPressIn={Platform.OS !== 'web' ? () => setActiveTooltip(item.id) : undefined}
                  onPressOut={Platform.OS !== 'web' ? () => setActiveTooltip(null) : undefined}
                  style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', marginBottom: 8, zIndex: showTooltip ? 10 : 1 }}
                >
                  <View style={{ width: labelWidth, paddingRight: 8, justifyContent: 'center' }}>
                    <Text 
                      numberOfLines={1} 
                      ellipsizeMode="tail" 
                      style={{ flexShrink: 1, minWidth: 0 }} 
                      maxFontSizeMultiplier={1.3} 
                      className="text-xs text-gray-700 font-medium"
                    >
                      {item.label}
                    </Text>
                  </View>

                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' }}>
                    <View style={{ position: 'absolute', left: 0, right: 0, height: 24, backgroundColor: '#F3F4F6', borderRadius: 4 }} />
                    
                    <View 
                      style={{ 
                        width: `${barWidthPercent}%`, 
                        height: 24, 
                        backgroundColor: item.color, 
                        borderRadius: 4,
                        minWidth: item.value > 0 ? 4 : 0 
                      }} 
                    />
                    
                    <Text 
                      style={{ flexShrink: 1, minWidth: 0, marginLeft: 6 }} 
                      maxFontSizeMultiplier={1.3} 
                      className="text-[11px] font-bold text-gray-600"
                    >
                      {item.value}%
                    </Text>

                    {showTooltip && (item.tooltipTitle || item.tooltipSubtitle) && (
                      <View 
                        style={{ 
                          position: 'absolute', 
                          top: -42, 
                          left: '10%',
                          backgroundColor: '#111827', 
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 6,
                          minWidth: 150,
                          zIndex: 50
                        }}
                      >
                        {item.tooltipTitle && (
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[12px] font-bold mb-0.5">
                            {item.tooltipTitle}
                          </Text>
                        )}
                        {item.tooltipSubtitle && (
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-[11px]">
                            {item.tooltipSubtitle}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {hasMore && (
        <View className="mt-2 pt-4 border-t border-gray-100 flex-row justify-center">
          <Pressable 
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}
            onPress={() => setShowAll(!showAll)}
          >
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">
              {showAll ? 'Show less' : `Show all (${data.length})`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};
