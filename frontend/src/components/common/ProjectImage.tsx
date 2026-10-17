import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, ViewStyle, ImageResizeMode } from 'react-native';
import { getProjectImageUrl } from '../../utils/projectImages';
import { Ionicons } from '@expo/vector-icons';

interface ProjectImageProps {
  project?: {
    id?: string | null;
    name?: string | null;
    image_url?: string | null;
    images?: any;
  } | null;
  imageUrl?: string | null;
  projectName?: string | null;
  style?: ViewStyle | ViewStyle[];
  className?: string;
  resizeMode?: ImageResizeMode;
  showBadge?: boolean;
  badgeText?: string;
  badgeVariant?: 'active' | 'completed' | 'planning' | 'default';
  fallbackIconSize?: number;
}

export const ProjectImage: React.FC<ProjectImageProps> = ({
  project,
  imageUrl,
  projectName,
  style,
  className = 'w-full h-full',
  resizeMode = 'cover',
  showBadge = false,
  badgeText,
  badgeVariant = 'default',
  fallbackIconSize = 24,
}) => {
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);

  const resolvedUrl =
    imageUrl ||
    getProjectImageUrl({
      id: project?.id,
      name: projectName || project?.name,
      image_url: project?.image_url,
    });

  const getBadgeColors = () => {
    switch (badgeVariant) {
      case 'active':
        return { bg: 'bg-emerald-500', text: 'text-white' };
      case 'completed':
        return { bg: 'bg-blue-500', text: 'text-white' };
      case 'planning':
        return { bg: 'bg-amber-500', text: 'text-white' };
      default:
        return { bg: 'bg-gray-800/80', text: 'text-white' };
    }
  };

  const badgeStyle = getBadgeColors();

  return (
    <View className={`relative overflow-hidden bg-gray-100 ${className}`} style={style}>
      {!hasError && resolvedUrl ? (
        <Image
          source={{ uri: resolvedUrl, cache: 'force-cache' }}
          className="w-full h-full"
          resizeMode={resizeMode}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setHasError(true);
            setLoading(false);
          }}
        />
      ) : (
        <View className="w-full h-full bg-slate-200 items-center justify-center">
          <Ionicons name="business" size={fallbackIconSize} color="#94A3B8" />
          {projectName ? (
            <Text
              numberOfLines={1}
              className="text-[10px] font-bold text-slate-500 mt-1 uppercase px-1"
            >
              {projectName.charAt(0)}
            </Text>
          ) : null}
        </View>
      )}

      {showBadge && badgeText && (
        <View
          className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-full shadow-sm ${badgeStyle.bg}`}
        >
          <Text className={`text-[10px] font-extrabold uppercase tracking-wider ${badgeStyle.text}`}>
            {badgeText}
          </Text>
        </View>
      )}
    </View>
  );
};
