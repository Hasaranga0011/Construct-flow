import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, MaterialIcons, Ionicons, Entypo } from '@expo/vector-icons';

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Projects',     href: '/projects',     IconFamily: FontAwesome5,  iconName: 'building' },
  { label: 'Users',        href: '/users',        IconFamily: FontAwesome5,  iconName: 'user-friends' },
  { label: 'Materials',    href: '/materials',    IconFamily: FontAwesome5,  iconName: 'box' },
  { label: 'Labour',       href: '/labour',       IconFamily: FontAwesome5,  iconName: 'users' },
  { label: 'Client Portal',href: '/client',       IconFamily: FontAwesome5,  iconName: 'globe' },
  { label: 'Suppliers',    href: '/suppliers',    IconFamily: FontAwesome5,  iconName: 'truck' },
  { label: 'AI Estimator', href: '/estimator',    IconFamily: FontAwesome5,  iconName: 'calculator' },
  { label: 'Notifications',href: '/notifications',badge: 4, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'ML Insights',  href: '/insights',     IconFamily: Entypo,        iconName: 'line-graph' },
  { label: 'Reports',      href: '/reports',      IconFamily: FontAwesome5,  iconName: 'chart-bar' },
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
