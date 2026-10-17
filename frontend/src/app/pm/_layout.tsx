import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';

const PM_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    IconFamily: Icon, iconName: 'dashboard' },
  { label: 'Projects',     href: '/projects',     IconFamily: Icon,  iconName: 'building' },
  { label: 'Materials',    href: '/materials',    IconFamily: Icon,  iconName: 'box' },
  { label: 'Labour',       href: '/labour',       IconFamily: Icon,  iconName: 'hard-hat' },
  { label: 'Payroll',      href: '/payroll',      IconFamily: Icon,  iconName: 'money-check-alt' },
  { label: 'Clients',      href: '/client',       IconFamily: Icon,  iconName: 'users' },
  { label: 'Messages',     href: '/messages',     IconFamily: Ionicons,      iconName: 'chatbubbles' },
  { label: 'Suppliers',    href: '/suppliers',    IconFamily: Icon,  iconName: 'truck' },
  { label: 'Team',         href: '/team',         IconFamily: Icon,  iconName: 'user-friends' },
  { label: 'AI Estimator', href: '/ai-estimator', IconFamily: Icon,  iconName: 'calculator' },
  { label: 'Notifications',href: '/notifications', IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile',      href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function PMLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={PM_NAV_ITEMS} basePath="/pm" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={PM_NAV_ITEMS} basePath="/pm" />}
      </View>
    </SidebarProvider>
  );
}
