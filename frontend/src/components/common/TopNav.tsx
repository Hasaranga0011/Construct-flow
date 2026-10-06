import React, { useState } from 'react';
import { View, Pressable, Text, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../../context/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../context/AuthContext';

interface TopNavProps {
  shell?: boolean;
  title?: string;
  showAction?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  role?: string;
  showBackButton?: boolean;
  initialSearchQuery?: string;
  onSearch?: (value: string) => void;
}

export const TopNav = ({ shell = false, title = '', showAction = true, actionLabel = '+ New Project', onActionPress, role, showBackButton = false, initialSearchQuery = '', onSearch }: TopNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();
  const { setIsOpen } = useSidebar();
  const { isMobile, width } = useResponsive();
  
  const { unreadCount } = useRealtimeNotifications();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const currentPortal = role || pathname.split('/')[1] || 'admin';
  const portalRole = currentPortal === 'site' ? 'site-manager' : currentPortal;
  const notificationsHref = portalRole === 'site-manager'
    ? '/site-manager/notifications'
    : `/${portalRole}/notifications`;
  const getInitials = (email?: string) => email ? email.slice(0, 2).toUpperCase() : 'U';
  const { user, role: userRole } = useAuth();


  return (
    <View style={{ zIndex: 10 }}>
      <LinearGradient 
        colors={isDark ? ['#0F172A', '#0F172A'] : ['#ffffff', '#fcfcfc']}
        className={`flex-row items-center justify-between py-3 px-4 md:py-4 md:px-6 border-b relative ${isDark ? 'border-gray-800' : 'border-gray-100'}`}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View className="flex-row items-center flex-1 min-w-0 pr-2">
          {showBackButton && (
            <Pressable accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="mr-2 p-3">
              <Ionicons name="arrow-back" size={24} color={isDark ? '#fff' : '#111827'} />
            </Pressable>
          )}
          {isMobile && shell && (
            <Pressable accessibilityLabel="Open navigation menu" onPress={() => setIsOpen(true)} className="mr-4 p-2 -ml-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] items-center justify-center">
              <Ionicons name="menu" size={26} color={isDark ? "#ffffff" : "#111827"} />
            </Pressable>
          )}
          <Text className={`text-lg md:text-2xl font-bold flex-shrink min-w-0 ${isDark ? 'text-white' : 'text-brand-text'}`} numberOfLines={1}>{title}</Text>
        </View>
        
        <View className="flex-row items-center gap-2 md:gap-4 flex-shrink-0">
          {(!isMobile || shell) && <>
          {/* Bell Icon */}
          <Pressable 
            onPress={() => router.push(notificationsHref as any)}
            accessibilityLabel="Open notifications"
            className={`w-11 h-11 rounded-full border items-center justify-center relative transition-colors ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
          >
            <Ionicons name="notifications-outline" size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-orange rounded-full border border-white items-center justify-center">
                <Text className="text-[10px] text-white font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setAccountMenuOpen((isOpen) => !isOpen)}
            accessibilityLabel="Open account details"
            className="w-11 h-11 rounded-full bg-orange-100 items-center justify-center"
          >
            <Text className="text-brand-orange font-bold text-sm">{getInitials(user?.user_metadata?.full_name || user?.email)}</Text>
          </Pressable>

          </>}
          {/* Action Button */}
          {!isMobile && showAction && onActionPress && (
            <Pressable onPress={onActionPress}>
              <LinearGradient
                colors={['#F97316', '#EA580C']}
                className="px-3 md:px-4 py-2 rounded-lg shadow-sm max-w-[180px]"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text className="text-white text-xs md:text-sm font-semibold" numberOfLines={1}>{actionLabel}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {isMobile && showAction && onActionPress && <Pressable accessibilityRole="button" onPress={onActionPress} className="mx-4 mb-3 px-4 py-3 rounded-lg bg-brand-orange"><Text className="text-white font-semibold text-center">{actionLabel}</Text></Pressable>}
      {onSearch && (
        <TextInput accessibilityLabel="Search" placeholder="Search..." value={initialSearchQuery}
          onChangeText={onSearch} className={`mx-4 my-2 px-4 py-3 rounded-lg border ${isDark ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`} />
      )}
      {accountMenuOpen && (
        <View
          className={`absolute right-4 top-[64px] w-64 rounded-xl border p-4 shadow-lg ${isDark ? 'bg-[#111827] border-gray-700' : 'bg-white border-gray-200'}`}
          style={{ zIndex: 20, elevation: 8, width: Math.min(256, width - 32) }}
        >
          <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-brand-text'}`} numberOfLines={1}>
            {user?.user_metadata?.full_name || user?.email || 'User'}
          </Text>
          <Text className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {user?.email || ''}
          </Text>
          <Text className={`text-xs mt-1 ${isDark ? 'text-brand-orange' : 'text-brand-orange'}`}>
            {userRole || 'User'}
          </Text>
          <View className={`h-px my-3 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} />
          <Pressable
            onPress={() => { setAccountMenuOpen(false); router.push(`/${portalRole}/profile` as any); }}
            className={`py-2 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
          >
            <Text className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Profile</Text>
          </Pressable>
          <Pressable
            onPress={() => { setAccountMenuOpen(false); router.push(`/${portalRole}/settings` as any); }}
            className={`py-2 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
          >
            <Text className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Settings</Text>
          </Pressable>
        </View>
      )}

    </View>
  );
};
