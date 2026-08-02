import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar, NavItem } from '../../components/common/Sidebar';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const CLIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Media & Gallery', href: '/media', IconFamily: Ionicons, iconName: 'images' },
  { label: 'Invoices', href: '/invoices', IconFamily: FontAwesome5, iconName: 'file-invoice-dollar' },
  { label: 'Notifications', href: '/notifications', badge: 1, IconFamily: Ionicons, iconName: 'notifications' },
];

export default function ClientLayout() {
  return (
    <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
      <Sidebar navItems={CLIENT_NAV_ITEMS} basePath="/client" />
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
    </View>
  );
}
