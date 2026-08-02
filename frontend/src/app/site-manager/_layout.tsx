import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar, NavItem } from '../../components/common/Sidebar';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const SM_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'My Team', href: '/team', IconFamily: FontAwesome5, iconName: 'users' },
  { label: 'Attendance', href: '/attendance', IconFamily: Ionicons, iconName: 'calendar' },
  { label: 'Materials', href: '/materials', IconFamily: FontAwesome5, iconName: 'box' },
  { label: 'Issues', href: '/issues', IconFamily: Ionicons, iconName: 'warning' },
  { label: 'Notifications', href: '/notifications', badge: 1, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile', href: '/profile', IconFamily: Ionicons, iconName: 'person-circle-outline' },
  { label: 'Settings', href: '/settings', IconFamily: Ionicons, iconName: 'settings-sharp' },
];

export default function SMLayout() {
  return (
    <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
      <Sidebar navItems={SM_NAV_ITEMS} basePath="/site-manager" />
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
    </View>
  );
}
