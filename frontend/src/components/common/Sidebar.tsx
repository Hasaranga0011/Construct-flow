import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { FontAwesome5, MaterialIcons, Ionicons, Entypo } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSidebar } from '../../context/SidebarContext';
import { useWindowDimensions } from 'react-native';
import { LogoutConfirmationModal } from './LogoutConfirmationModal';
import { buildNotificationFilter } from '../../utils/notifications';
import { roleLabel } from '../../utils/roles';

export type NavItem = {
  label: string;
  href: string;
  IconFamily: any;
  iconName: string;
  badge?: number;
};

export const Sidebar = ({ navItems, basePath = '' }: { navItems: NavItem[], basePath?: string }) => {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const router = useRouter();
  const { isDark } = useTheme();
  const { isOpen, setIsOpen } = useSidebar();
  const { width } = useWindowDimensions();
  const isMobile = width < 1024;
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const completeLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const getInitials = (email?: string) => {
    return email ? email.substring(0, 2).toUpperCase() : 'U';
  };

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Initial fetch
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .or(buildNotificationFilter(user.id, role));
      if (count !== null) setUnreadCount(count);
    };
    fetchUnread();

    // Realtime subscription
    const channel = supabase
      .channel('sidebar_notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications'
      }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  if (isMobile && !isOpen) {
    return null;
  }

  return (
    <>
      {isMobile && isOpen && (
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          className="absolute inset-0 z-40 bg-black/50"
          onPress={() => setIsOpen(false)}
        />
      )}
      <View className={`w-[240px] h-full py-6 flex-col border-r ${isDark ? 'bg-[#0B0F19] border-gray-900' : 'bg-white border-gray-100'} ${isMobile ? 'absolute z-50 left-0' : 'relative'}`}>
      {/* Logo Area */}
      <View className="px-4 mb-8">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-xl ${isDark ? 'text-white' : 'text-brand-text'}`}>Construct<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Ai</Text></Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>AI Construction Platform</Text>
      </View>

      {/* Navigation */}
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 min-h-0 px-3" contentContainerStyle={{ paddingBottom: 12 }}>
        {navItems.map((item) => {
          // Normalise paths for matching
          const fullHref = item.href.startsWith(`${basePath}/`)
            ? item.href
            : `${basePath}${item.href}`;
          const isDashboard = item.href === '/dashboard';
          const isActive = isDashboard
            ? pathname === fullHref
            : pathname === fullHref || pathname.startsWith(`${fullHref}/`);
          const IconFamily = item.IconFamily;

          return (
            <Link key={item.label} href={fullHref as any} asChild onPress={() => setIsOpen(false)}>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} className={`flex-row items-center py-3 px-3 rounded-lg mb-1 ${isActive ? (isDark ? 'bg-gray-800' : 'bg-brand-orange bg-opacity-10') : 'hover:bg-gray-50 hover:bg-opacity-10'}`}>
                <IconFamily
                  name={item.iconName as any}
                  size={18}
                  color={isActive ? (isDark ? '#F97316' : '#EA580C') : (isDark ? '#9CA3AF' : '#6B7280')}
                  style={{ marginRight: 12 }}
                />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm flex-1 ${isActive ? (isDark ? 'text-white font-semibold' : 'text-brand-text font-semibold') : (isDark ? 'text-gray-300' : 'text-gray-600')}`}>
                  {item.label}
                </Text>
                {/* Dynamic badge for Notifications, fallback to item.badge for others if any */}
                {(item.label === 'Notifications' && unreadCount > 0) ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{unreadCount}</Text>
                  </View>
                ) : (item.badge && item.label !== 'Notifications') ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{item.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>

      {/* User Profile */}
      <View className="px-4 mt-4 flex-shrink-0">
        <View className={`flex-row items-center justify-between pt-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <View className="flex-row items-center flex-1">
            <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${isDark ? 'text-white' : 'text-brand-text'}`}>{getInitials(user?.user_metadata?.full_name || user?.email)}</Text>
            </View>
            <View className="flex-1 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-brand-text'}`}>{user?.user_metadata?.full_name || user?.email || 'User'}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{roleLabel(role || '') || 'Loading...'}</Text>
            </View>
          </View>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={handleLogout} className="p-2">
            <Ionicons name="log-out-outline" size={20} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
      </View>
      <LogoutConfirmationModal
        visible={logoutModalVisible}
        isDark={isDark}
        onCancel={() => setLogoutModalVisible(false)}
        onConfirm={() => { setLogoutModalVisible(false); void completeLogout(); }}
      />
    </>
  );
};
