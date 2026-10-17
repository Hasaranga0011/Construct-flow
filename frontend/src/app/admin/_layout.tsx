import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    IconFamily: Icon, iconName: 'dashboard' },
  { label: 'Projects',     href: '/projects',     IconFamily: Icon,  iconName: 'building' },
  { label: 'Users',        href: '/users',        IconFamily: Icon,  iconName: 'user-friends' },
  { label: 'Materials',    href: '/materials',    IconFamily: Icon,  iconName: 'box' },
  { label: 'Labour',       href: '/labour',       IconFamily: Icon,  iconName: 'users' },
  { label: 'Client Portal',href: '/client',       IconFamily: Icon,  iconName: 'globe' },
  { label: 'Messages',     href: '/messages',     IconFamily: Ionicons,      iconName: 'chatbubbles' },
  { label: 'Suppliers',    href: '/suppliers',    IconFamily: Icon,  iconName: 'truck' },
  { label: 'AI Estimator', href: '/estimator',    IconFamily: Icon,  iconName: 'calculator' },
  { label: 'Notifications',href: '/notifications',badge: 4, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'ML Insights',  href: '/insights',     IconFamily: Icon,        iconName: 'line-graph' },
  { label: 'Reports',      href: '/reports',      IconFamily: Icon,  iconName: 'chart-bar' },
  { label: 'Profile',      href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={ADMIN_NAV_ITEMS} basePath="/admin" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={ADMIN_NAV_ITEMS} basePath="/admin" />}
      </View>
    </SidebarProvider>
  );
}
