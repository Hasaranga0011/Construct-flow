import React, { useState } from 'react';
import { View, Image, Text, ViewStyle } from 'react-native';
import { getRoleAvatarUrl } from '../../utils/projectImages';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface RoleAvatarProps {
  avatarUrl?: string | null;
  role?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
  style?: ViewStyle | ViewStyle[];
  showRoleBadge?: boolean;
  showBadge?: boolean;
}

export const RoleAvatar: React.FC<RoleAvatarProps> = ({
  avatarUrl,
  role,
  name,
  size = 'md',
  className = '',
  style,
  showRoleBadge = false,
  showBadge,
}) => {
  const displayBadge = showBadge !== undefined ? showBadge : showRoleBadge;
  const [hasError, setHasError] = useState(false);

  const resolvedUrl = getRoleAvatarUrl(role, avatarUrl, name);

  const getDimensions = () => {
    switch (size) {
      case 'xs':
        return { container: 'w-7 h-7', text: 'text-[10px]', badge: 'w-2 h-2 -bottom-0.5 -right-0.5' };
      case 'sm':
        return { container: 'w-9 h-9', text: 'text-xs', badge: 'w-2.5 h-2.5 bottom-0 right-0' };
      case 'md':
        return { container: 'w-11 h-11', text: 'text-sm', badge: 'w-3 h-3 bottom-0 right-0' };
      case 'lg':
        return { container: 'w-14 h-14', text: 'text-base', badge: 'w-3.5 h-3.5 bottom-0.5 right-0.5' };
      case 'xl':
        return { container: 'w-20 h-20', text: 'text-xl', badge: 'w-4 h-4 bottom-1 right-1' };
      case '2xl':
        return { container: 'w-24 h-24', text: 'text-2xl', badge: 'w-5 h-5 bottom-1 right-1' };
      default:
        return { container: 'w-11 h-11', text: 'text-sm', badge: 'w-3 h-3 bottom-0 right-0' };
    }
  };

  const dims = getDimensions();

  const getRoleBadgeColor = () => {
    const r = (role || '').toLowerCase();
    if (r.includes('admin')) return 'bg-red-500';
    if (r.includes('pm') || r.includes('project')) return 'bg-purple-500';
    if (r.includes('site')) return 'bg-blue-500';
    if (r.includes('worker')) return 'bg-orange-500';
    if (r.includes('client')) return 'bg-emerald-500';
    if (r.includes('suppl')) return 'bg-pink-500';
    return 'bg-gray-500';
  };

  const getInitials = () => {
    if (!name || name.trim().length === 0) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <View className="relative inline-flex items-center justify-center">
      <View
        className={`${dims.container} rounded-full overflow-hidden bg-orange-100 border border-orange-200/50 items-center justify-center ${className}`}
        style={style}
      >
        {!hasError && resolvedUrl ? (
          <Image
            source={{ uri: resolvedUrl, cache: 'force-cache' }}
            className="w-full h-full rounded-full"
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        ) : (
          <Text className={`font-bold text-brand-orange ${dims.text}`}>
            {getInitials()}
          </Text>
        )}
      </View>

      {displayBadge && (
        <View
          className={`absolute rounded-full border-2 border-white ${dims.badge} ${getRoleBadgeColor()}`}
        />
      )}
    </View>
  );
};
