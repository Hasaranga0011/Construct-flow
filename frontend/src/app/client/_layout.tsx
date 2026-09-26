import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { TopNav } from '../../components/common/TopNav';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const CLIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     href: '/dashboard',    IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Project',       href: '/project',      IconFamily: FontAwesome5,  iconName: 'building' },
  { label: 'Media & Gallery',href: '/media',       IconFamily: Ionicons,      iconName: 'images' },
  { label: 'Messages',      href: '/messages',     IconFamily: Ionicons,      iconName: 'chatbubble' },
  { label: 'Invoices',      href: '/invoices',     IconFamily: FontAwesome5,  iconName: 'file-invoice-dollar' },
  { label: 'Documents',     href: '/documents',    IconFamily: FontAwesome5,  iconName: 'file-alt' },
  { label: 'Notifications', href: '/notifications',badge: 1, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile',       href: '/profile',      IconFamily: Ionicons,      iconName: 'person-circle-outline' },
  { label: 'Settings',      href: '/settings',     IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function ClientLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={CLIENT_NAV_ITEMS} basePath="/client" />}
        <View className="flex-1 overflow-hidden">
          {!isDesktop && <TopNav />}
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={CLIENT_NAV_ITEMS} basePath="/client" />}
      </View>
    </SidebarProvider>
  );
}
