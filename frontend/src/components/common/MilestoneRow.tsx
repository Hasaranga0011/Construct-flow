import React from 'react';
import { View, Text, Pressable, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';

export const MilestoneRow = ({ 
  ms, 
  isLast, 
  onMarkComplete, 
  showAction = true,
  children
}: { 
  ms: any; 
  isLast: boolean; 
  onMarkComplete?: (id: string) => void; 
  showAction?: boolean; 
  children?: React.ReactNode;
}) => {
  const { isMobile } = useResponsive();

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
                <View className={`px-2.5 py-1 rounded-md ${ms.status === 'Completed' ? 'bg-[#DCFCE7]' : 'bg-orange-50'}`}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold uppercase tracking-wider ${ms.status === 'Completed' ? 'text-green-600' : 'text-orange-600'}`}>
                    {ms.status}
                  </Text>
                </View>
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
            <View className={`px-3 py-1.5 rounded-lg ml-2 shrink-0 ${ms.status === 'Completed' ? 'bg-[#DCFCE7]' : 'bg-orange-50'}`}>
               <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold uppercase tracking-wider ${ms.status === 'Completed' ? 'text-green-600' : 'text-orange-600'}`}>
                 {ms.status}
               </Text>
            </View>
          )}
        </View>

        <View className="flex-col md:flex-row md:items-center md:justify-between mt-2 bg-gray-50 p-3.5 md:p-4 rounded-xl border border-gray-100 gap-3 md:gap-0 w-full">
           <View className="flex-row items-center min-w-0 flex-shrink">
             <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2 shrink-0" />
             <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 truncate">
               Target Date: {new Date(ms.due_date).toDateString()}
             </Text>
           </View>

           {ms.status !== 'Completed' && showAction && onMarkComplete && (
             <Pressable style={{ minHeight: 44, minWidth: 44 }}
               onPress={() => onMarkComplete(ms.id)}
               className="bg-[#DCFCE7] border border-[#BBF7D0] min-h-[44px] justify-center items-center px-4 rounded-lg shadow-sm active:bg-[#BBF7D0] w-full md:w-auto"
             >
               <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[#15803D] text-sm font-bold">
                 Mark Complete
               </Text>
             </Pressable>
           )}
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
