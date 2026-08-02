import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar, NavItem } from '../../components/common/Sidebar';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: FontAwesome5, iconName: 'chart-bar' },
  { label: 'Orders Portal', href: '/orders', IconFamily: FontAwesome5, iconName: 'truck' },
  { label: 'Invoices', href: '/invoices', IconFamily: FontAwesome5, iconName: 'file-invoice-dollar' },
  { label: 'My Profile', href: '/profile', IconFamily: Ionicons, iconName: 'person-circle-outline' },
  { label: 'Settings', href: '/settings', IconFamily: Ionicons, iconName: 'settings-sharp' },
];

export default function SupplierLayout() {
  return (
    <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
      <Sidebar navItems={SUPPLIER_NAV_ITEMS} basePath="/supplier" />
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
    </View>
  );
}
