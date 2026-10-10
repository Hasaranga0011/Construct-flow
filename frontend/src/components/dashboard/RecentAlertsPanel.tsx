import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';
import { useNotifications } from '../../context/NotificationContext';

const AlertItem = ({ title, subtext, iconColor }: { title: string, subtext: string, iconColor: string }) => {
  return (
    <View className="flex-row items-start mb-4">
      {/* Icon Placeholder */}
      <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5 ${iconColor.replace('text-', 'bg-').replace('-500', '-100')}`}>
         <View className={`w-3 h-3 rounded-sm ${iconColor.replace('text-', 'bg-')}`} />
      </View>

      {/* Content */}
      <View className="flex-1">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm mb-0.5">{title}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{subtext}</Text>
      </View>
    </View>
  );
};

export const RecentAlertsPanel = ({ pmId, basePath }: { pmId?: string; basePath?: string }) => {
  const router = useRouter();
  const { isMobile } = useResponsive();
  
  // Directly use the shared real-time notification hook to ensure it always matches the bell icon perfectly.
  const { notifications, unreadCount, loading } = useNotifications();

  // Show only the 5 most recent alerts
  const alerts = notifications.slice(0, 5);

  const getIconColor = (type?: string) => {
    switch(type) {
      case 'Alert': return 'text-brand-orange';
      case 'Warning': return 'text-brand-danger'; // fallback if warning
      case 'Success': return 'text-brand-success';
      case 'Info':
      default: return 'text-blue-500';
    }
  };

  const getTimeAgo = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr${diffInHours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <View className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 ${isMobile ? '' : 'flex-1 min-h-[300px]'}`}>
      <View className="flex-row justify-between items-center mb-6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Recent Alerts</Text>
        {unreadCount > 0 && (
          <View className="bg-brand-orange px-2 py-1 rounded-full">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{unreadCount} new</Text>
          </View>
        )}
      </View>

      <View className={isMobile ? "mb-4" : "flex-1"}>
        {loading ? (
          <View className="py-4 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : alerts.length === 0 ? (
          <View className="py-4 items-center flex-row justify-center">
            <Ionicons name="notifications-off-outline" size={20} color="#9CA3AF" className="mr-2" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">No new alerts.</Text>
          </View>
        ) : (
          alerts.map(a => (
            <AlertItem
              key={a.id}
              title={a.title}
              subtext={getTimeAgo(a.created_at)}
              iconColor={getIconColor((a as any).type)}
            />
          ))
        )}
      </View>

      <Pressable style={{ minHeight: 44, minWidth: 44 }}
        className="pt-4 border-t border-gray-50 items-center justify-center"
        onPress={() => router.push(basePath ? `${basePath}/notifications` : pmId ? '/pm/notifications' : '/admin/notifications')}
      >
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">View all notifications &rarr;</Text>
      </Pressable>
    </View>
  );
};
