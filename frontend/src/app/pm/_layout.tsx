import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { TopNav } from '../../components/common/TopNav';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const PM_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Projects',     href: '/projects',     IconFamily: FontAwesome5,  iconName: 'building' },
  { label: 'Materials',    href: '/materials',    IconFamily: FontAwesome5,  iconName: 'box' },
  { label: 'Labour',       href: '/labour',       IconFamily: FontAwesome5,  iconName: 'hard-hat' },
  { label: 'Payroll',      href: '/payroll',      IconFamily: FontAwesome5,  iconName: 'money-check-alt' },
  { label: 'Clients',      href: '/clients',      IconFamily: FontAwesome5,  iconName: 'users' },
  { label: 'Suppliers',    href: '/suppliers',    IconFamily: FontAwesome5,  iconName: 'truck' },
  { label: 'Team',         href: '/team',         IconFamily: FontAwesome5,  iconName: 'user-friends' },
  { label: 'Attendance',   href: '/attendance',   IconFamily: Ionicons,      iconName: 'calendar' },
  { label: 'AI Estimator', href: '/ai-estimator', IconFamily: FontAwesome5,  iconName: 'calculator' },
  { label: 'Notifications',href: '/notifications',badge: 2, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile',      href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function PMLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={PM_NAV_ITEMS} basePath="/pm" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {!isDesktop && <TopNav shell />}
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={PM_NAV_ITEMS} basePath="/pm" />}
      </View>
    </SidebarProvider>
  );
}
