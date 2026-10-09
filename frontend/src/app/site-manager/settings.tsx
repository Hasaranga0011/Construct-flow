import React from 'react';
import SettingsScreen from '../../components/shared/SettingsScreen';
import { TopNav } from '@/components/common/TopNav';
import { View } from 'react-native';

export default function SMSettingsPage() {
  return (
    <View className="flex-1 bg-brand-light dark:bg-brand-dark">
      <TopNav title="Settings" showAction={false} />
      <SettingsScreen showNotificationPreferences={false} profileHref="/site-manager/profile" />
    </View>
  );
}
