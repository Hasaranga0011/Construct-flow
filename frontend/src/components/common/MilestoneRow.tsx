import React from 'react';
import { View, Text, Pressable, Image, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBadge } from './StatusBadge';
import { useResponsive } from '../../hooks/useResponsive';

export const MilestoneRow = ({
  ms,
  isLast,
  onMarkComplete,
  showAction = true,
  disabled = false,
  children
}: {
  ms: any;
  isLast: boolean;
  onMarkComplete?: (id: string) => void;
  showAction?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) => {
  const { isMobile } = useResponsive();
  const rawProgress = ms.completion_percentage ?? (ms.status === 'Completed' ? 100 : ms.status === 'Pending' ? 0 : null);
  const progress = rawProgress == null || !Number.isFinite(Number(rawProgress)) ? null : Math.max(0,Math.min(100,Number(rawProgress)));
  const dateValue = ms.due_date || ms.planned_date;
  const targetDate = dateValue && !Number.isNaN(new Date(dateValue).getTime()) ? String(dateValue).slice(0,10) : 'Not scheduled';

  return (
    <View className="flex-row w-full relative">
      {/* Icon Column */}
      <View className="w-9 items-center mr-3 md:mr-4 shrink-0">
        <View className={`w-9 h-9 rounded-full items-center justify-center ${ms.status === 'Completed' ? 'bg-green-100' : 'bg-orange-100'}`}>
          <Ionicons name={ms.status === 'Completed' ? "checkmark" : "time"} size={18} color={ms.status === 'Completed' ? "#16A34A" : "#EA580C"} />
        </View>
        {!isLast && (
          <View className="w-0.5 flex-1 bg-gray-200 mt-2" />
        )}
      </View>

      {/* Content Column */}
      <View className={`flex-1 min-w-0 pb-6 md:pb-8 ${!isLast ? 'border-b border-gray-100 mb-6 md:mb-8' : ''}`}>
        <View className="flex-col md:flex-row md:justify-between md:items-start w-full">
          <View className="flex-1 min-w-0 pr-0 md:pr-4">
            {isMobile && (
              <View className="self-start mb-2">
                <StatusBadge status={ms.status} />
              </View>
            )}

            <Text style={{ flexShrink: 1, minWidth: 0, fontSize: 18, lineHeight: 24, fontWeight: '700' }} maxFontSizeMultiplier={1.3} className="text-gray-800 mb-1.5">
              {ms.title}
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 20 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-3">
              {ms.description}
            </Text>
          </View>

          {!isMobile && (
            <StatusBadge status={ms.status} />
          )}
        </View>

        <View className="flex-col md:flex-row md:items-center md:justify-between mt-2 bg-gray-50 p-3.5 md:p-4 rounded-xl border border-gray-100 gap-3 md:gap-0 w-full">
           <View className="flex-row items-center min-w-0 flex-shrink">
             <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2 shrink-0" />
             <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 truncate">
               Target date: {targetDate}
             </Text>
           </View>

           {ms.status !== 'Completed' && showAction && onMarkComplete && (
             <Pressable style={{ minHeight: 44, minWidth: 44 }}
               onPress={() => onMarkComplete(ms.id)}
               accessibilityRole="button"
               accessibilityState={{ disabled, busy: disabled }}
               disabled={disabled}
               className="bg-[#DCFCE7] border border-[#BBF7D0] min-h-[44px] justify-center items-center px-4 rounded-lg shadow-sm active:bg-[#BBF7D0] w-full md:w-auto"
             >
               <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[#15803D] text-sm font-bold">
                 Mark Complete
               </Text>
             </Pressable>
           )}
        </View>

        <View className="mt-4">
          <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{progress == null ? 'Progress not recorded' : `${progress}% complete`}</Text>
          {progress != null && <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:progress}} className="h-2 rounded-full bg-slate-100 overflow-hidden"><View className="h-2 rounded-full bg-orange-700" style={{width:`${progress}%`}} /></View>}
        </View>
        {children}

        {/* Media Display */}
        {ms.milestone_media && ms.milestone_media.length > 0 && (
          <View className="flex-row flex-wrap mt-4">
             {ms.milestone_media.map((media: any) => (
                <Pressable
                  style={{ minHeight: 44, minWidth: 44 }}
                  key={media.id}
                  accessibilityLabel="Open milestone photo"
                  onPress={() => media.url ? Linking.openURL(media.url) : null}
                  className="mr-3 mb-3"
                >
                  {media.url ? (
                    <Image source={{ uri: media.url }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                  ) : (
                    <View className="w-16 h-16 md:w-20 md:h-20 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex-1 items-center justify-center">
                       <Ionicons name="image" size={24} color="#D1D5DB" />
                    </View>
                  )}
                </Pressable>
             ))}
          </View>
        )}
      </View>
    </View>
  );
};
