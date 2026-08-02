import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { FontAwesome5, MaterialIcons, Ionicons, Entypo } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
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
        .or(`user_id.eq.${user.id},target_role.eq.All`);
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
  }, [user]);

  return (
    <View className={`w-[240px] h-full py-6 flex-col border-r ${isDark ? 'bg-[#0B0F19] border-gray-900' : 'bg-white border-gray-100'}`}>
      {/* Logo Area */}
      <View className="px-4 mb-8">
        <Text className={`font-bold text-xl ${isDark ? 'text-white' : 'text-brand-text'}`}>Construct<Text style={{ color: '#F97316' }}>Ai</Text></Text>
        <Text className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>AI Construction Platform</Text>
      </View>

      {/* Navigation */}
      <View className="flex-1 px-3">
        {navItems.map((item) => {
          // Normalise paths for matching
          const fullHref = `${basePath}${item.href}`;
          const isActive = pathname === fullHref || (pathname === basePath && item.href === '/dashboard');
          const IconFamily = item.IconFamily;
          
          return (
            <Link key={item.label} href={fullHref as any} asChild>
              <Pressable className={`flex-row items-center py-3 px-3 rounded-lg mb-1 ${isActive ? (isDark ? 'bg-gray-800' : 'bg-brand-orange bg-opacity-10') : 'hover:bg-gray-50 hover:bg-opacity-10'}`}>
                <IconFamily 
                  name={item.iconName as any} 
                  size={18} 
                  color={isActive ? (isDark ? '#F97316' : '#EA580C') : (isDark ? '#9CA3AF' : '#6B7280')} 
                  style={{ marginRight: 12 }}
                />
                <Text className={`text-sm flex-1 ${isActive ? (isDark ? 'text-white font-semibold' : 'text-brand-text font-semibold') : (isDark ? 'text-gray-300' : 'text-gray-600')}`}>
                  {item.label}
                </Text>
                {/* Dynamic badge for Notifications, fallback to item.badge for others if any */}
                {(item.label === 'Notifications' && unreadCount > 0) ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">{unreadCount}</Text>
                  </View>
                ) : (item.badge && item.label !== 'Notifications') ? (
                  <View className="bg-brand-orange w-5 h-5 rounded-full items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">{item.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            </Link>
          );
        })}
      </View>

      {/* User Profile */}
      <View className="px-4 mt-auto">
        <View className={`flex-row items-center justify-between pt-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <View className="flex-row items-center flex-1">
            <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-brand-text'}`}>{getInitials(user?.email)}</Text>
            </View>
            <View className="flex-1 pr-2">
              <Text className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-brand-text'}`} numberOfLines={1}>{user?.email || 'User'}</Text>
              <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{role || 'Loading...'}</Text>
            </View>
          </View>
          <Pressable onPress={handleLogout} className="p-2">
            <Ionicons name="log-out-outline" size={20} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};
