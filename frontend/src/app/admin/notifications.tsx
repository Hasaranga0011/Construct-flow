import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';

export default function NotificationsScreen() {
  const { notifications, loading, markAsRead, markAllAsRead } = useRealtimeNotifications();

  const getIconProps = (action: string) => {
    if (action.toLowerCase().includes('download')) return { iconFamily: FontAwesome5, iconName: 'download', iconColor: '#3B82F6' };
    if (action.toLowerCase().includes('comment')) return { iconFamily: FontAwesome5, iconName: 'comment-alt', iconColor: '#10B981' };
    if (action.toLowerCase().includes('approval')) return { iconFamily: Ionicons, iconName: 'time', iconColor: '#F59E0B' };
    return { iconFamily: MaterialIcons, iconName: 'notifications', iconColor: '#F97316' };
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hrs ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return `Yesterday`;
    return `${diffInDays} days ago`;
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Notifications" showAction={false} />
      
      <ScrollView className="flex-1 px-8 py-6 max-w-4xl mx-auto w-full" showsVerticalScrollIndicator={false}>
        
        {/* Header Controls */}
        <View className="flex-row justify-between items-end mb-8">
          <View>
            <Text className="text-gray-500 text-sm mt-1">Stay updated on project alerts and activity</Text>
          </View>
          <View className="flex-row items-center">
            <Pressable className="mr-6" onPress={markAllAsRead}>
              <Text className="text-brand-orange text-sm font-semibold">Mark all as read</Text>
            </Pressable>
            <View className="border border-gray-200 bg-white rounded-lg px-4 py-2 flex-row items-center">
              <Text className="text-brand-text text-sm font-medium mr-2">All</Text>
              <Ionicons name="chevron-down" size={14} color="#6B7280" />
            </View>
          </View>
        </View>

        <View className="mb-12">
          {loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : notifications.length === 0 ? (
            <View className="py-10 items-center">
              <Text className="text-gray-400">No notifications.</Text>
            </View>
          ) : (
            notifications.map((n) => {
              const props = getIconProps(n.action || n.title || '');
              return (
                <Pressable key={n.id} onPress={() => !n.is_read && markAsRead(n.id)}>
                  <NotificationCard 
                    title={n.title}
                    subtitle={`${n.message} · ${getTimeAgo(n.created_at)}`}
                    iconFamily={props.iconFamily}
                    iconName={props.iconName}
                    iconColor={props.iconColor}
                    isUnread={!n.is_read}
                  />
                </Pressable>
              );
            })
          )}
        </View>
        
      </ScrollView>
    </View>
  );
}
