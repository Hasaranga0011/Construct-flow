import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { TopNav } from '../../components/common/TopNav';
import { SidebarProvider } from '../../context/SidebarContext';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const WORKER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',  IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Attendance', href: '/attendance', IconFamily: Ionicons,      iconName: 'calendar' },
  { label: 'Payroll',    href: '/payroll',    IconFamily: FontAwesome5,  iconName: 'money-check-alt' },
  { label: 'Profile',    href: '/profile',    IconFamily: Ionicons,      iconName: 'person' },
  { label: 'Settings',   href: '/settings',   IconFamily: Ionicons,      iconName: 'settings-sharp' },
];

export default function WorkerLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={WORKER_NAV_ITEMS} basePath="/worker" />}
        <View className="flex-1 overflow-hidden">
          {!isDesktop && <TopNav />}
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={WORKER_NAV_ITEMS} basePath="/worker" />}
      </View>
    </SidebarProvider>
  );
}
