import React, { useState } from 'react';
import { View, Pressable, Text, TextInput, Platform, Modal, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { useNotifications } from '../../context/NotificationContext';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../../context/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { ModalViewport } from './ModalViewport';
import { useAuth } from '../../context/AuthContext';
import { SearchInput } from './SearchInput';
import { RoleAvatar } from './RoleAvatar';

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
  searchItems?: any[];
  searchEntityLabel?: string;
  searchConfig?: any;
}

export const TopNav = ({ title = '', showAction = true, actionLabel = '+ New Project', onActionPress, role, showBackButton = false, initialSearchQuery = '', onSearch, searchItems, searchEntityLabel = 'items', searchConfig }: TopNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();
  const { isOpen, toggleSidebar } = useSidebar();
  const { isMobile, width } = useResponsive();

  const { unreadCount } = useNotifications();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const currentPortal = role || pathname.split('/')[1] || 'admin';
  const portalRole = currentPortal === 'site' ? 'site-manager' : currentPortal;
  const notificationsHref = portalRole === 'site-manager'
    ? '/site-manager/notifications'
    : `/${portalRole}/notifications`;
  const getInitials = (email?: string) => email ? email.slice(0, 2).toUpperCase() : 'U';
  const { user, role: userRole, avatarUrl, fullName, signOut } = useAuth();


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
            <Pressable style={{ minHeight: 48, minWidth: 48 }} accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="mr-2 p-3">
              <Ionicons name="arrow-back" size={24} color={isDark ? '#fff' : '#111827'} />
            </Pressable>
          )}
          <Pressable
            style={{ minHeight: 44, minWidth: 44 }}
            accessibilityLabel={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            {...(Platform.OS === 'web' ? { title: isOpen ? "Collapse sidebar" : "Expand sidebar" } : {})}
            onPress={toggleSidebar}
            className="mr-2 p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 items-center justify-center cursor-pointer"
          >
            <Ionicons name="menu" size={26} color={isDark ? "#ffffff" : "#111827"} />
          </Pressable>
          <Text numberOfLines={2} ellipsizeMode="tail" style={{ flexShrink: 1, minWidth: 0 }} className={`text-lg md:text-2xl font-bold flex-shrink min-w-0 ${isDark ? 'text-white' : 'text-brand-text'}`} maxFontSizeMultiplier={1.3}>{title}</Text>
        </View>

        <View className="flex-row items-center gap-2 md:gap-4 flex-shrink-0">
          {/* Bell Icon */}
          <Pressable style={{ minHeight: 48, minWidth: 48 }}
            onPress={() => router.push(notificationsHref as any)}
            accessibilityLabel="Open notifications"
            className={`w-11 h-11 rounded-full border items-center justify-center relative transition-colors ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
          >
            <Ionicons name="notifications-outline" size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-orange rounded-full border border-white items-center justify-center">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-white font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable style={{ minHeight: 48, minWidth: 48 }}
            onPress={() => setAccountMenuOpen((isOpen) => !isOpen)}
            accessibilityLabel="Open account details"
            className="items-center justify-center cursor-pointer active:opacity-80"
          >
            <RoleAvatar
              avatarUrl={avatarUrl || (user?.user_metadata as any)?.avatar_url}
              role={userRole || role}
              name={fullName || (user?.user_metadata as any)?.full_name || user?.email}
              size="md"
            />
          </Pressable>

          {/* Action Button */}
          {!isMobile && showAction && onActionPress && (
            <Pressable style={{ minHeight: 48, minWidth: 48 }} onPress={onActionPress}>
              <LinearGradient
                colors={['#F97316', '#EA580C']}
                className="px-3 md:px-4 py-3 min-h-[44px] justify-center rounded-lg shadow-sm max-w-[180px]"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} className="text-white text-xs md:text-sm font-semibold" maxFontSizeMultiplier={1.3}>{actionLabel}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {isMobile && showAction && onActionPress && <Pressable style={{ minHeight: 48, minWidth: 48 }} accessibilityRole="button" onPress={onActionPress} className="mx-4 mb-3 px-4 py-3 rounded-lg bg-brand-orange"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-semibold text-center">{actionLabel}</Text></Pressable>}
      {onSearch && (
        <View className="mx-4 my-2 z-50 flex-row justify-end">
          <SearchInput 
            placeholder="Search..." 
            value={initialSearchQuery}
            onChangeText={onSearch} 
            items={searchItems}
            entityLabel={searchEntityLabel}
            config={searchConfig}
            className="w-full md:w-80"
          />
        </View>
      )}
      {accountMenuOpen && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setAccountMenuOpen(false)}>
        <ModalViewport>
        <View
          className={`w-full rounded-2xl border p-5 shadow-xl ${isDark ? 'bg-[#111827] border-gray-700' : 'bg-white border-gray-200'}`}
          style={{ zIndex: 20, elevation: 8, width: Math.min(280, width - 32) }}
        >
          <Pressable style={{ minHeight: 36, minWidth: 36 }} accessibilityLabel="Close account details" onPress={() => setAccountMenuOpen(false)} className="self-end items-center justify-center p-1 -mr-1 -mt-1"><Ionicons name="close" size={20} color={isDark ? '#fff' : '#6B7280'} /></Pressable>
          <ScrollView keyboardShouldPersistTaps="handled">
          <View className="items-center mb-3">
            <RoleAvatar
              avatarUrl={avatarUrl || (user?.user_metadata as any)?.avatar_url}
              role={userRole || role}
              name={fullName || (user?.user_metadata as any)?.full_name || user?.email}
              size="xl"
              showRoleBadge
            />
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} className={`text-base font-bold text-center ${isDark ? 'text-white' : 'text-brand-text'}`} maxFontSizeMultiplier={1.3}>
            {fullName || (user?.user_metadata as any)?.full_name || user?.email || 'User'}
          </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} className={`text-xs mt-1 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {user?.email || ''}
          </Text>
          <View className="self-center mt-2 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-950/40">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-orange uppercase">
              {userRole || 'User'}
            </Text>
          </View>
          <View className={`h-px my-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} />
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => { setAccountMenuOpen(false); router.push(`/${portalRole}/profile` as any); }}
            className={`min-h-[44px] flex-row items-center px-3 py-2 rounded-xl ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
          >
            <Ionicons name="person-outline" size={17} color={isDark ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 8 }} />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Profile</Text>
          </Pressable>
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => { setAccountMenuOpen(false); router.push(`/${portalRole}/settings` as any); }}
            className={`min-h-[44px] flex-row items-center px-3 py-2 rounded-xl ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
          >
            <Ionicons name="settings-outline" size={17} color={isDark ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 8 }} />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Settings</Text>
          </Pressable>
          <View className={`h-px my-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} />
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={async () => {
              setAccountMenuOpen(false);
              await signOut();
              router.replace('/');
            }}
            className="min-h-[44px] flex-row items-center px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 active:opacity-80"
          >
            <Ionicons name="log-out-outline" size={17} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-red-600">Sign Out</Text>
          </Pressable>
          </ScrollView>
        </View>
        </ModalViewport>
        </Modal>
      )}

    </View>
  );
};
