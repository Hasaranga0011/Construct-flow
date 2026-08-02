import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar, NavItem } from '../../components/common/Sidebar';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const WORKER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Attendance', href: '/attendance', IconFamily: Ionicons, iconName: 'calendar' },
  { label: 'Payroll', href: '/payroll', IconFamily: FontAwesome5, iconName: 'money-check-alt' },
  { label: 'Profile', href: '/profile', IconFamily: Ionicons, iconName: 'person' },
];

export default function WorkerLayout() {
  return (
    <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
      <Sidebar navItems={WORKER_NAV_ITEMS} basePath="/worker" />
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
    </View>
  );
}
