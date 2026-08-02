import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar, NavItem } from '../../components/common/Sidebar';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const PM_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', IconFamily: MaterialIcons, iconName: 'dashboard' },
  { label: 'Team', href: '/team', IconFamily: FontAwesome5, iconName: 'users' },
  { label: 'Materials', href: '/materials', IconFamily: FontAwesome5, iconName: 'box' },
  { label: 'Labour', href: '/labour', IconFamily: FontAwesome5, iconName: 'hard-hat' },
  { label: 'Client Portal', href: '/client', IconFamily: FontAwesome5, iconName: 'globe' },
  { label: 'AI Estimator', href: '/estimator', IconFamily: FontAwesome5, iconName: 'calculator' },
  { label: 'Notifications', href: '/notifications', badge: 2, IconFamily: Ionicons, iconName: 'notifications' },
  { label: 'Profile', href: '/profile', IconFamily: Ionicons, iconName: 'person-circle-outline' },
  { label: 'Settings', href: '/settings', IconFamily: Ionicons, iconName: 'settings-sharp' },
];

export default function PMLayout() {
  return (
    <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
      <Sidebar navItems={PM_NAV_ITEMS} basePath="/pm" />
      <View className="flex-1 overflow-hidden">
        <Slot />
      </View>
    </View>
  );
}
