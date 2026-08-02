import React from 'react';
import ProfileScreen from '../../components/shared/ProfileScreen';
import { TopNav } from '@/components/common/TopNav';
import { View } from 'react-native';

export default function WorkerProfilePage() {
  return (
    <View className="flex-1 bg-brand-light dark:bg-brand-dark">
      <TopNav title="My Profile" showAction={false} />
      <ProfileScreen />
    </View>
  );
}
