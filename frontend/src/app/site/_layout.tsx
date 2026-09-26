import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const SITE_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Labour Check-in', href: '/labour', IconFamily: FontAwesome5, iconName: 'users' },
  { label: 'Material Usage', href: '/materials', IconFamily: FontAwesome5, iconName: 'box' },
  { label: 'Site Photos', href: '/photos', IconFamily: Ionicons, iconName: 'image' },
  { label: 'Report Issues', href: '/issues', IconFamily: MaterialIcons, iconName: 'report-problem' },
  { label: 'Settings', href: '/settings', IconFamily: Ionicons, iconName: 'settings-sharp' },
];

export default function SiteLayout() {
  const { width } = useWindowDimensions();
  const isMobile = width < 1024;
  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light">
      {!isMobile && <Sidebar navItems={SITE_NAV_ITEMS} basePath="/site" />}
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
      {isMobile && <Sidebar navItems={SITE_NAV_ITEMS} basePath="/site" />}
    </View>
    </SidebarProvider>
  );
}
