import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, Platform, BackHandler, Animated, Easing, TouchableOpacity, useWindowDimensions, StyleSheet, ScrollView } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';
import { useSidebar } from '../../context/SidebarContext';
import { Ionicons } from '@expo/vector-icons';
import { LogoutConfirmationModal } from './LogoutConfirmationModal';
import { buildNotificationFilter } from '../../utils/notifications';

export type NavItem = {
  label: string;
  href: string;
  IconFamily: any;
  iconName: string;
  badge?: number;
};

// Modified for Expo Go mobile compatibility
export const MobileSidebar = ({ navItems, basePath = '' }: { navItems: NavItem[], basePath?: string }) => {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const router = useRouter();
  const { isDark } = useTheme();
  const { isOpen, setIsOpen } = useSidebar();
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 1024;

  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;

    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [isOpen, isMobile, fadeAnim, slideAnim]);

  useEffect(() => { setIsOpen(false); }, [pathname, isMobile, setIsOpen]);
  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setIsOpen(false); return true; });
    return () => subscription.remove();
  }, [isMobile, isOpen, setIsOpen]);

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
    let isMounted = true;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .or(buildNotificationFilter(user.id, role));
      if (count !== null && isMounted) setUnreadCount(count);
    };
    fetchUnread();

    // Quick polling fallback if realtime fails
    const interval = setInterval(fetchUnread, 15000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [user, role]);

  const SidebarContent = () => (
    <View className={`w-[260px] max-w-full h-full py-6 flex-col border-r ${isMobile ? 'bg-slate-900 border-slate-800' : (isDark ? 'bg-[#0B0F19] border-gray-900' : 'bg-white border-gray-100')}`}>
      {/* Logo Area */}
      <View className="px-4 mb-8">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-xl ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`}>Construct<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Ai</Text></Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs mt-1 ${isMobile || isDark ? 'text-gray-400' : 'text-gray-500'}`}>AI Construction Platform</Text>
      </View>

      {/* Navigation */}
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 min-h-0 px-3" contentContainerStyle={{ paddingBottom: 12 }}>
        {navItems.map((item) => {
          const fullHref = item.href.startsWith(`${basePath}/`)
            ? item.href
            : `${basePath}${item.href}`;
          const isDashboard = item.href === '/dashboard';
          const isActive = isDashboard
            // Dashboard: exact match only — never highlight for sub-routes
            ? pathname === fullHref || pathname === basePath
            // Other items: exact OR any sub-route, but never bleed into dashboard
            : (pathname === fullHref || pathname.startsWith(`${fullHref}/`)) && !isDashboard;
          const IconFamily = item.IconFamily;

          return (
            <Link key={item.label} href={fullHref as any} asChild onPress={() => isMobile && setIsOpen(false)}>
              <TouchableOpacity style={{ minHeight: 48, minWidth: 48 }} activeOpacity={0.7} className={`flex-row items-center py-3 px-3 rounded-lg mb-1 ${isActive ? (isMobile || isDark ? 'bg-gray-800' : 'bg-brand-orange bg-opacity-10') : (isMobile || isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50 hover:bg-opacity-10')}`}>
                <IconFamily
                  name={item.iconName as any}
                  size={18}
                  color={isActive ? '#F97316' : (isMobile || isDark ? '#9CA3AF' : '#6B7280')}
                  style={{ marginRight: 12 }}
                />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm flex-1 ${isActive ? (isMobile || isDark ? 'text-white font-semibold' : 'text-brand-text font-semibold') : (isMobile || isDark ? 'text-gray-300' : 'text-gray-600')}`}>
                  {item.label}
                </Text>
                {(item.label === 'Notifications' && unreadCount > 0) ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{unreadCount}</Text>
                  </View>
                ) : (item.badge && item.label !== 'Notifications') ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{item.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </Link>
          );
        })}
      </ScrollView>

      {/* User Profile */}
      <View className="px-4 mt-4 flex-shrink-0">
        <View className={`flex-row items-center justify-between pt-4 border-t ${isMobile || isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <View className="flex-row items-center flex-1">
            <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isMobile || isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`}>{getInitials(user?.user_metadata?.full_name || user?.email)}</Text>
            </View>
            <View className="flex-1 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold truncate ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`} numberOfLines={1}>{user?.user_metadata?.full_name || user?.email || 'User'}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs ${isMobile || isDark ? 'text-gray-400' : 'text-gray-500'}`}>{role || 'Loading...'}</Text>
            </View>
          </View>
          <Pressable style={{ minHeight: 48, minWidth: 48 }} accessibilityLabel="Log out" onPress={handleLogout} className="p-2 min-w-[44px] min-h-[44px] items-center justify-center">
            <Ionicons name="log-out-outline" size={20} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (!isMobile) {
    return (
      <>
        <SidebarContent />
        <LogoutConfirmationModal
          visible={logoutModalVisible}
          isDark={isDark}
          onCancel={() => setLogoutModalVisible(false)}
          onConfirm={() => { setLogoutModalVisible(false); void completeLogout(); }}
        />
      </>
    );
  }

  return (
    <>
      <View accessibilityElementsHidden={!isOpen} importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'} style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'} className="z-50">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <TouchableOpacity accessibilityLabel="Close navigation menu"
          onPress={() => setIsOpen(false)}
          activeOpacity={1}
          style={[{ position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)' }, { minHeight: 48, minWidth: 48 }]}
        />
      </Animated.View>
      <Animated.View style={{ width: Math.min(260, width - 32), height: '100%', transform: [{ translateX: slideAnim }] }}>
        <SidebarContent />
      </Animated.View>
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
