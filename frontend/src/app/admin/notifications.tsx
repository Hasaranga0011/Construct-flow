import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNotifications } from '../../context/NotificationContext';
import { useResponsive } from '../../hooks/useResponsive';

export default function NotificationsScreen() {
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  
  const visibleNotifications = notifications.filter(n => {
    if (unreadOnly && n.is_read) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(n.title || '').toLowerCase().includes(q) && !(n.message || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const { isMobile } = useResponsive();

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
      <TopNav 
        title="Notifications" 
        showAction={false} 
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      
      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6 max-w-4xl mx-auto w-full'}`} showsVerticalScrollIndicator={false}>
        
        {/* Header Controls */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Notifications</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', width: isMobile ? '100%' : undefined, justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} className="mr-6" onPress={markAllAsRead}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">Mark all as read</Text>
            </Pressable>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel="Toggle unread notifications" onPress={() => setUnreadOnly(value => !value)} className="border border-gray-200 bg-white rounded-lg px-4 py-2 flex-row items-center">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-medium mr-2">{unreadOnly ? 'Unread' : 'All'}</Text>
              <Ionicons name="filter" size={14} color="#6B7280" />
            </Pressable>
          </View>
        </View>

        <View className="mb-12">
          {loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : visibleNotifications.length === 0 ? (
            <View className="py-10 items-center">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No notifications.</Text>
            </View>
          ) : (
            visibleNotifications.map((n) => {
              const props = getIconProps(n.title || '');
              return (
                <Pressable style={{ minHeight: 44, minWidth: 44 }} key={n.id} onPress={() => !n.is_read && markAsRead(n.id)}>
                  <NotificationCard 
                    title={n.title}
                    subtitle={`${n.message} · ${getTimeAgo(n.created_at)}`}
                    iconFamily={props.iconFamily}
                    iconName={props.iconName}
                    iconColor={props.iconColor}
                    isUnread={!n.is_read}
                    onActionPress={() => {
                      if (!n.is_read) markAsRead(n.id);
                      Alert.alert(n.title, n.message, [{ text: 'Close', style: 'cancel' }]);
                    }}
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
