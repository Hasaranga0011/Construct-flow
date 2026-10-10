import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { MobileSidebar as Sidebar, NavItem } from '../../components/common/MobileSidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import { useAuth } from '../../context/AuthContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Text, Pressable } from 'react-native';

const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',  IconFamily: FontAwesome5, iconName: 'chart-bar' },
  { label: 'My Deliveries',   href: '/deliveries', IconFamily: FontAwesome5, iconName: 'truck-loading' },
  { label: 'Messages',     href: '/messages',   IconFamily: Ionicons,     iconName: 'chatbubbles' },
  { label: 'My Profile',   href: '/profile',    IconFamily: Ionicons,     iconName: 'person-circle-outline' },
  { label: 'Settings',     href: '/settings',   IconFamily: Ionicons,     iconName: 'settings-sharp' },
];

export default function SupplierLayout() {
  const { width } = useWindowDimensions();
  const { isApproved, signOut } = useAuth();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  if (!isApproved) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center p-6">
        <View className="bg-white rounded-2xl p-8 shadow-sm max-w-md w-full items-center">
          <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
            <FontAwesome5 name="hourglass-half" size={24} color="#F97316" />
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800 mb-2 text-center">Account Pending Approval</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center mb-8 leading-relaxed">
            Your supplier account is currently under review by our administration team. You will be notified once your account is approved and ready to accept orders.
          </Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={signOut} className="bg-gray-100 py-3 px-6 rounded-lg w-full">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-center">Sign Out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SidebarProvider>
      <View className="flex-1 flex-row bg-brand-light dark:bg-[#0F172A]">
        {isDesktop && <Sidebar navItems={SUPPLIER_NAV_ITEMS} basePath="/supplier" />}
        <View className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <Slot />
        </View>
        {!isDesktop && <Sidebar navItems={SUPPLIER_NAV_ITEMS} basePath="/supplier" />}
      </View>
    </SidebarProvider>
  );
}
