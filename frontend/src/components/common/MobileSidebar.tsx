import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, Platform, BackHandler, Animated, Easing, TouchableOpacity, useWindowDimensions, StyleSheet, ScrollView, Image, PanResponder } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';
import { useSidebar } from '../../context/SidebarContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LogoutConfirmationModal } from './LogoutConfirmationModal';
import { buildNotificationFilter } from '../../utils/notifications';

export type NavItem = {
  label: string;
  href: string;
  IconFamily: any;
  iconName: string;
  badge?: number;
};

// Modified for Expo Go mobile and desktop web slidable compatibility
export const MobileSidebar = ({ navItems, basePath = '' }: { navItems: NavItem[], basePath?: string }) => {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const router = useRouter();
  const { isDark } = useTheme();
  const { isOpen, setIsOpen } = useSidebar();
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 1024;

  // Mobile slide & fade animations
  const slideAnim = useRef(new Animated.Value(isMobile ? -300 : 0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const EXPANDED_WIDTH = 260;
  const COLLAPSED_WIDTH = 72;

  // Desktop smooth width animation between expanded (260px) and collapsed rail (72px)
  const desktopWidthAnim = useRef(new Animated.Value(isOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH)).current;

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Desktop transition
  useEffect(() => {
    if (isMobile) return;
    Animated.timing(desktopWidthAnim, {
      toValue: isOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isOpen, isMobile, desktopWidthAnim]);

  // Mobile slide drawer transition
  useEffect(() => {
    if (!isMobile) return;

    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [isOpen, isMobile, fadeAnim, slideAnim]);

  // Touch gesture PanResponder for slidable drawer on mobile/touch screens
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          slideAnim.setValue(Math.max(-300, gestureState.dx));
          fadeAnim.setValue(Math.max(0, 1 + gestureState.dx / 300));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 || gestureState.vx < -0.4) {
          Animated.parallel([
            Animated.timing(slideAnim, {
              toValue: -300,
              duration: 200,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            })
          ]).start(() => setIsOpen(false));
        } else {
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              friction: 8,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            })
          ]).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [pathname, isMobile, setIsOpen]);

  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setIsOpen(false); return true; });
    return () => subscription.remove();
  }, [isMobile, isOpen, setIsOpen]);

  const completeLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/team-login');
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

    const interval = setInterval(fetchUnread, 15000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [user, role]);

  const isCollapsed = !isMobile && !isOpen;

  const SidebarContent = () => (
    <View className={`w-full h-full py-5 flex-col border-r ${isMobile ? 'bg-slate-900 border-slate-800' : (isDark ? 'bg-[#0B0F19] border-gray-900' : 'bg-white border-gray-100')}`}>
      {/* Logo Area without marked close icon */}
      <View className={`${isCollapsed ? 'px-2 mb-6 items-center justify-center' : 'px-4 mb-6 flex-row items-center'}`}>
        <Pressable
          onPress={() => {
            if (isCollapsed) {
              setIsOpen(true);
            } else {
              router.push((basePath || '/') as any);
            }
          }}
          className={`${isCollapsed ? 'items-center justify-center' : 'flex-row items-center flex-1'} cursor-pointer`}
          accessibilityLabel="ConstructAi Home"
          {...(Platform.OS === 'web' && isCollapsed ? { title: 'Expand sidebar' } : {})}
        >
          <View
            className={`${isCollapsed ? '' : 'mr-3'} rounded-xl overflow-hidden shadow-sm flex-shrink-0`}
            style={{
              shadowColor: '#F97316',
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Image
              source={require('../../../assets/images/main-logo.png')}
              style={{ width: 40, height: 40, borderRadius: 10 }}
              resizeMode="contain"
            />
          </View>
          {!isCollapsed && (
            <View className="flex-1 min-w-0">
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className={`font-black text-lg tracking-tight ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`}
                numberOfLines={1}
              >
                Construct<Text maxFontSizeMultiplier={1.3} style={{ color: '#F97316' }}>Ai</Text>
              </Text>
              <Text
                style={{ flexShrink: 1, minWidth: 0 }}
                maxFontSizeMultiplier={1.3}
                className={`text-[10px] font-bold uppercase tracking-wider ${isMobile || isDark ? 'text-gray-400' : 'text-gray-500'}`}
                numberOfLines={1}
              >
                Construction OS
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Navigation */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        className={`flex-1 min-h-0 ${isCollapsed ? 'px-2 w-full' : 'px-3'}`}
        contentContainerStyle={{ paddingBottom: 12, alignItems: isCollapsed ? 'center' : undefined }}
      >
        {navItems.map((item) => {
          const fullHref = item.href.startsWith(`${basePath}/`)
            ? item.href
            : `${basePath}${item.href}`;
          const isDashboard = item.href === '/dashboard';
          const isActive = isDashboard
            ? pathname === fullHref || pathname === basePath
            : (pathname === fullHref || pathname.startsWith(`${fullHref}/`)) && !isDashboard;
          const IconFamily = item.IconFamily;
          const hasBadge = (item.label === 'Notifications' && unreadCount > 0) || (item.badge && item.label !== 'Notifications');
          const badgeCount = item.label === 'Notifications' ? unreadCount : item.badge;

          if (isCollapsed) {
            return (
              <Link key={item.label} href={fullHref as any} asChild onPress={() => isMobile && setIsOpen(false)}>
                <TouchableOpacity
                  style={{ width: 46, height: 46 }}
                  activeOpacity={0.7}
                  accessibilityLabel={item.label}
                  {...(Platform.OS === 'web' ? { title: item.label } : {})}
                  className={`items-center justify-center rounded-xl mb-2 relative self-center cursor-pointer ${
                    isActive
                      ? (isDark ? 'bg-brand-orange/20 border border-brand-orange/40' : 'bg-brand-orange/10 border border-brand-orange/30')
                      : (isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')
                  }`}
                >
                  <IconFamily
                    name={item.iconName as any}
                    size={21}
                    color={isActive ? '#F97316' : (isDark ? '#9CA3AF' : '#6B7280')}
                  />
                  {hasBadge ? (
                    <View className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-brand-orange rounded-full items-center justify-center border border-white dark:border-slate-900">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[9px] font-bold">
                        {badgeCount && badgeCount > 99 ? '99+' : badgeCount}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </Link>
            );
          }

          return (
            <Link key={item.label} href={fullHref as any} asChild onPress={() => isMobile && setIsOpen(false)}>
              <TouchableOpacity
                style={{ minHeight: 48, minWidth: 48 }}
                activeOpacity={0.7}
                className={`flex-row items-center py-3 px-3 rounded-lg mb-1 cursor-pointer ${
                  isActive
                    ? (isMobile || isDark ? 'bg-gray-800' : 'bg-brand-orange bg-opacity-10')
                    : (isMobile || isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50 hover:bg-opacity-10')
                }`}
              >
                <IconFamily
                  name={item.iconName as any}
                  size={18}
                  color={isActive ? '#F97316' : (isMobile || isDark ? '#9CA3AF' : '#6B7280')}
                  style={{ marginRight: 12 }}
                />
                <Text
                  style={{ flexShrink: 1, minWidth: 0 }}
                  maxFontSizeMultiplier={1.3}
                  className={`text-sm flex-1 ${
                    isActive
                      ? (isMobile || isDark ? 'text-white font-semibold' : 'text-brand-text font-semibold')
                      : (isMobile || isDark ? 'text-gray-300' : 'text-gray-600')
                  }`}
                >
                  {item.label}
                </Text>
                {hasBadge ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">
                      {badgeCount && badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </Link>
          );
        })}
      </ScrollView>

      {/* User Profile */}
      <View className={`${isCollapsed ? 'px-2 items-center' : 'px-4'} mt-4 flex-shrink-0`}>
        <View
          className={`${
            isCollapsed ? 'flex-col items-center pt-3' : 'flex-row items-center justify-between pt-4'
          } border-t ${isMobile || isDark ? 'border-gray-800' : 'border-gray-100'}`}
        >
          {isCollapsed ? (
            <>
              <View
                className={`w-9 h-9 rounded-full items-center justify-center ${
                  isDark ? 'bg-gray-800' : 'bg-gray-200'
                }`}
                {...(Platform.OS === 'web' ? { title: user?.user_metadata?.full_name || user?.email || 'User' } : {})}
              >
                <Text
                  style={{ flexShrink: 1, minWidth: 0 }}
                  maxFontSizeMultiplier={1.3}
                  className={`text-xs font-bold ${isDark ? 'text-white' : 'text-brand-text'}`}
                >
                  {getInitials(user?.user_metadata?.full_name || user?.email)}
                </Text>
              </View>
              <Pressable
                style={{ minHeight: 38, minWidth: 38 }}
                accessibilityLabel="Log out"
                {...(Platform.OS === 'web' ? { title: 'Log out' } : {})}
                onPress={handleLogout}
                className="mt-2 p-2 rounded-lg items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <Ionicons name="log-out-outline" size={20} color="#9CA3AF" />
              </Pressable>
            </>
          ) : (
            <>
              <View className="flex-row items-center flex-1">
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
                    isMobile || isDark ? 'bg-gray-800' : 'bg-gray-200'
                  }`}
                >
                  <Text
                    style={{ flexShrink: 1, minWidth: 0 }}
                    maxFontSizeMultiplier={1.3}
                    className={`text-xs font-bold ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`}
                  >
                    {getInitials(user?.user_metadata?.full_name || user?.email)}
                  </Text>
                </View>
                <View className="flex-1 pr-2">
                  <Text
                    style={{ flexShrink: 1, minWidth: 0 }}
                    maxFontSizeMultiplier={1.3}
                    className={`text-sm font-semibold truncate ${isMobile || isDark ? 'text-white' : 'text-brand-text'}`}
                    numberOfLines={1}
                  >
                    {user?.user_metadata?.full_name || user?.email || 'User'}
                  </Text>
                  <Text
                    style={{ flexShrink: 1, minWidth: 0 }}
                    maxFontSizeMultiplier={1.3}
                    className={`text-xs ${isMobile || isDark ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {role || 'Loading...'}
                  </Text>
                </View>
              </View>
              <Pressable
                style={{ minHeight: 48, minWidth: 48 }}
                accessibilityLabel="Log out"
                {...(Platform.OS === 'web' ? { title: 'Log out' } : {})}
                onPress={handleLogout}
                className="p-2 min-w-[44px] min-h-[44px] items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
              >
                <Ionicons name="log-out-outline" size={20} color="#9CA3AF" />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );

  if (!isMobile) {
    return (
      <>
        <Animated.View
          style={{
            width: desktopWidthAnim,
            overflow: 'hidden',
            height: '100%',
          }}
        >
          <SidebarContent />
        </Animated.View>
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
        <Animated.View
          {...panResponder.panHandlers}
          style={{ width: Math.min(260, width - 32), height: '100%', transform: [{ translateX: slideAnim }] }}
        >
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
