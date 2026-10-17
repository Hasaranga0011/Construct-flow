import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';

const CLIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     href: '/dashboard',    IconFamily: Icon, iconName: 'dashboard' },
  { label: 'Project',       href: '/project',      IconFamily: Icon,  iconName: 'building' },
  { label: 'Project Map',   href: '/project/map',  IconFamily: Ionicons,      iconName: 'map-outline' },
  { label: 'Media & Gallery',href: '/media',       IconFamily: Ionicons,      iconName: 'images' },
  { label: 'Messages',      href: '/messages',     IconFamily: Ionicons,      iconName: 'chatbubble' },
  { label: 'Invoices',      href: '/invoices',     IconFamily: Icon,  iconName: 'file-invoice-dollar' },
  { label: 'Documents',     href: '/documents',    IconFamily: Icon,  iconName: 'file-alt' },
  { label: 'Notifications', href: '/notifications',badge: 1, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile',       href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',      href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function ClientLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={CLIENT_NAV_ITEMS} basePath="/client" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={CLIENT_NAV_ITEMS} basePath="/client" />}
      </View>
    </SidebarProvider>
  );
}
