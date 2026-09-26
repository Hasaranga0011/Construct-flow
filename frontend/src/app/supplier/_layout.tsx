import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { TopNav } from '../../components/common/TopNav';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',  IconFamily: FontAwesome5, iconName: 'chart-bar' },
  { label: 'Orders Portal',href: '/orders',     IconFamily: FontAwesome5, iconName: 'truck' },
  { label: 'Deliveries',   href: '/deliveries', IconFamily: FontAwesome5, iconName: 'truck-loading' },
  { label: 'My Profile',   href: '/profile',    IconFamily: Ionicons,     iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',   IconFamily: Ionicons,     iconName: 'settings-sharp' },
];

export default function SupplierLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={SUPPLIER_NAV_ITEMS} basePath="/supplier" />}
        <View className="flex-1 overflow-hidden">
          {!isDesktop && <TopNav />}
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={SUPPLIER_NAV_ITEMS} basePath="/supplier" />}
      </View>
    </SidebarProvider>
  );
}
