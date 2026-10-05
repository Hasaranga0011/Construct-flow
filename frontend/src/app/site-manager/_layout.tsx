import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { TopNav } from '../../components/common/TopNav';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const SM_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Attendance',   href: '/attendance',   IconFamily: Ionicons,      iconName: 'calendar' },
  { label: 'Reports',      href: '/reports',      IconFamily: Ionicons,      iconName: 'document-text' },
  { label: 'Materials',    href: '/materials',    IconFamily: FontAwesome5,  iconName: 'box' },
  { label: 'Milestones',   href: '/milestones',   IconFamily: Ionicons,      iconName: 'flag' },
  { label: 'Issues',       href: '/issues',       IconFamily: Ionicons,      iconName: 'warning' },
  { label: 'Team',         href: '/team',         IconFamily: FontAwesome5,  iconName: 'user-friends' },
  { label: 'Notifications',href: '/notifications',badge: 1, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile',      href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function SMLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={SM_NAV_ITEMS} basePath="/site-manager" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {!isDesktop && <TopNav shell />}
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={SM_NAV_ITEMS} basePath="/site-manager" />}
      </View>
    </SidebarProvider>
  );
}
