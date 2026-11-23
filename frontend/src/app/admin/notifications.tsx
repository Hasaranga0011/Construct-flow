import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { TopNav } from '@/components/common/TopNav';
import { SearchInput } from '@/components/common/SearchInput';
import { ModalViewport } from '../../components/common/ModalViewport';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';
import { useNotifications, AppNotification } from '../../context/NotificationContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { notificationRoute } from '@/utils/notificationRoute';
import { api } from '@/services/api';

export default function NotificationsScreen() {
  const { notifications, loading, error, refresh, unreadCount, totalCount, markAsRead, markAllAsRead } = useNotifications();
  const router=useRouter();const {role,user}=useAuth();
  const [older,setOlder]=useState<AppNotification[]>([]),[olderLoading,setOlderLoading]=useState(false),[olderError,setOlderError]=useState(''),[exhausted,setExhausted]=useState(false);
  const paging=useRef(false),activeUser=useRef(user?.id);activeUser.current=user?.id;
  useEffect(()=>{setOlder([]);setOlderError('');setExhausted(false);setOlderLoading(false);},[user?.id]);
  const combined=[...notifications,...older.filter(row=>!notifications.some(latest=>latest.id===row.id))];
  const loadOlder=async()=>{
    if(paging.current)return;paging.current=true;setOlderLoading(true);setOlderError('');const owner=user?.id;
    try{
      const feed=await api.getFresh(`/notifications/feed?offset=${combined.length}`);
      if(owner!==activeUser.current)return;
      const rows=Array.isArray(feed)?feed:feed.items;
      if(!Array.isArray(rows))throw new Error('Older notifications could not be loaded.');
      setOlder(previous=>Array.from(new Map([...previous,...rows].map(row=>[row.id,row])).values()));
      if(!rows.length)setExhausted(true);
    }catch(e){if(owner===activeUser.current)setOlderError(e instanceof Error?e.message:'Older notifications could not be loaded.');}
    finally{paging.current=false;if(owner===activeUser.current)setOlderLoading(false);}
  };
  const readAll=async()=>{const owner=user?.id;if(await markAllAsRead()&&owner===activeUser.current)setOlder(rows=>rows.map(row=>({...row,is_read:true})));};
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);

  const visibleNotifications = combined.filter(n => {
    if (unreadOnly && n.is_read) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(n.title || '').toLowerCase().includes(q) && !(n.message || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const { isMobile } = useResponsive();

  const getIconProps = (action: string) => {
    if (action.toLowerCase().includes('download')) return { iconFamily: Icon, iconName: 'download', iconColor: '#3B82F6' };
    if (action.toLowerCase().includes('comment')) return { iconFamily: Icon, iconName: 'comment-alt', iconColor: '#10B981' };
    if (action.toLowerCase().includes('approval')) return { iconFamily: Ionicons, iconName: 'time', iconColor: '#F59E0B' };
    return { iconFamily: Icon, iconName: 'notifications', iconColor: '#F97316' };
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
      />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6 max-w-4xl mx-auto w-full'}`} showsVerticalScrollIndicator={false}>

        {/* Header Controls */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: 12, zIndex: 50, elevation: 50 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Notifications</Text>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12, width: isMobile ? '100%' : 'auto' }}>
            <SearchInput
              placeholder="Search notifications..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className={isMobile ? "w-full" : "w-80"}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications as read" disabled={loading||unreadCount===0} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }} className="mr-2" onPress={()=>void readAll()}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">Mark all as read</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel="Toggle unread notifications" onPress={() => setUnreadOnly(value => !value)} className="border border-gray-200 bg-white rounded-lg px-4 py-2 flex-row items-center">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-medium mr-2">{unreadOnly ? 'Unread' : 'All'}</Text>
                <Ionicons name="filter" size={14} color="#6B7280" />
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mb-12">
          {!!error&&<View className="p-4 mb-4 rounded-xl bg-red-50 border border-red-200"><Text className="text-red-700">{error}</Text><Pressable accessibilityRole="button" onPress={()=>void refresh()} className="min-h-[44px] justify-center self-start"><Text className="text-brand-orange font-semibold">Retry notifications</Text></Pressable></View>}
          {totalCount>50&&<Text className="text-slate-500 mb-3">Showing {combined.length} of {totalCount} updates. {unreadCount} unread in total.</Text>}
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
                <View key={n.id}>
                  <NotificationCard
                    title={n.title}
                    subtitle={`${n.message} · ${getTimeAgo(n.created_at)}`}
                    iconFamily={props.iconFamily}
                    iconName={props.iconName}
                    iconColor={props.iconColor}
                    isUnread={!n.is_read}
                    onActionPress={() => {
                      if (!n.is_read) { const owner=user?.id;void markAsRead(n.id).then(saved=>{if(saved&&owner===activeUser.current)setOlder(rows=>rows.map(row=>row.id===n.id?{...row,is_read:true}:row));}); }
                      if(n.link)router.push(notificationRoute(n.link,role) as any);else setSelectedNotification(n);
                    }}
                  />
                </View>
              );
            })
          )}
          {!!olderError&&<Text className="text-red-700 my-3">{olderError}</Text>}
          {!exhausted&&combined.length<totalCount&&<Pressable accessibilityRole="button" onPress={()=>void loadOlder()} disabled={olderLoading} className="min-h-[48px] p-3 rounded-xl border border-slate-200 bg-white items-center justify-center mt-3">{olderLoading?<ActivityIndicator color="#EA580C"/>:<Text className="font-semibold text-brand-orange">{olderError?'Retry older notifications':'Load older notifications'}</Text>}</Pressable>}
        </View>

      </ScrollView>

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <Modal visible={!!selectedNotification} transparent animationType="fade" onRequestClose={() => setSelectedNotification(null)}>
          <ModalViewport>
            <View className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden mt-4">
              <View className="flex-row justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text flex-1 pr-4">{selectedNotification.title}</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setSelectedNotification(null)} className="p-2 -m-2 rounded-full hover:bg-gray-200">
                  <Ionicons name="close" size={24} color="#6B7280" />
                </Pressable>
              </View>
              <View className="p-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-base leading-relaxed mb-6">{selectedNotification.message}</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mb-6">{new Date(selectedNotification.created_at).toLocaleString()}</Text>

                <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setSelectedNotification(null)} className="bg-gray-100 rounded-xl py-3 items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">Close</Text>
                </Pressable>
              </View>
            </View>
          </ModalViewport>
        </Modal>
      )}
    </View>
  );
}
