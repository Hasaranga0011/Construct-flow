import { ModalViewport } from './ModalViewport';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Switch, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useNotifications } from '../../context/NotificationContext';

export const NotificationPanel = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings'>('inbox');
  const [pushEnabled, setPushEnabled] = useState(false);

  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();

  // Initialize Push Token listener (already handled in root layout, but we need it to trigger permission requests)
  const { expoPushToken, requestToken } = usePushNotifications(user?.id || null);

  useEffect(() => {
    if (visible && user) {
      checkPushStatus();
    }
  }, [visible, user]);

  const checkPushStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('profiles').select('expo_push_token').eq('id', user.id).single();
      setPushEnabled(!!(data as any)?.expo_push_token);
    } catch (e) {}
  };

  const togglePush = async (val: boolean) => {
    setPushEnabled(val);
    if (!user) return;

    if (val) {
      // User turned on push notifications
      if (Platform.OS === 'web') {
        alert('Push notifications require a physical iOS or Android device.');
        setPushEnabled(false);
        return;
      }

      const token = await requestToken();
      if (token) {
        await supabase.from('profiles').update({ expo_push_token: token } as any).eq('id', user.id);
      } else {
        setPushEnabled(false); // Revert if permission denied
      }
    } else {
      // User turned off
      await supabase.from('profiles').update({ expo_push_token: null } as any).eq('id', user.id);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden mt-2">

          <View className="flex-row justify-between items-center p-4 border-b border-gray-100 bg-brand-light">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Notifications</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <View className="flex-row justify-between border-b border-gray-100 px-4 items-center">
            <View className="flex-row">
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setActiveTab('inbox')} className={`py-3 mr-6 ${activeTab === 'inbox' ? 'border-b-2 border-brand-orange' : ''}`}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold ${activeTab === 'inbox' ? 'text-brand-orange' : 'text-gray-400'}`}>Inbox</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setActiveTab('settings')} className={`py-3 ${activeTab === 'settings' ? 'border-b-2 border-brand-orange' : ''}`}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold ${activeTab === 'settings' ? 'text-brand-orange' : 'text-gray-400'}`}>Settings</Text>
              </Pressable>
            </View>
            {activeTab === 'inbox' && notifications.some(n => !n.is_read) && (
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={markAllAsRead}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-semibold">Mark all read</Text>
              </Pressable>
            )}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} className="max-h-96 bg-gray-50">
            {activeTab === 'inbox' ? (
              loading ? (
                <ActivityIndicator color="#F97316" className="mt-8" />
              ) : notifications.length === 0 ? (
                <View className="items-center justify-center p-8 mt-4">
                  <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2">No new notifications</Text>
                </View>
              ) : (
                notifications.map(n => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={n.id}
                    onPress={() => {
                      if (!n.is_read) markAsRead(n.id);
                      Alert.alert(n.title, n.message, [{ text: 'Close', style: 'cancel' }]);
                    }}
                    className={`p-4 border-b border-gray-100 flex-row ${n.is_read ? 'bg-white opacity-60' : 'bg-orange-50/50'}`}
                  >
                    <View className="flex-1">
                      <View className="flex-row justify-between items-start mb-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm ${n.is_read ? 'font-semibold text-gray-700' : 'font-bold text-brand-text'}`}>{n.title}</Text>
                        {!n.is_read && <View className="w-2 h-2 bg-brand-orange rounded-full mt-1.5" />}
                      </View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 leading-relaxed">{n.message}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 mt-2">{new Date(n.created_at).toLocaleString()}</Text>
                    </View>
                  </Pressable>
                ))
              )
            ) : (
              <View className="p-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-4">Device Preferences</Text>
                <View className="flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-100">
                  <View className="flex-1 pr-4">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text mb-1">Push Notifications</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Receive alerts on your device for critical project updates and activities.</Text>
                  </View>
                  <Switch
                    value={pushEnabled}
                    onValueChange={togglePush}
                    trackColor={{ false: '#D1D5DB', true: '#FDBA74' }}
                    thumbColor={pushEnabled ? '#F97316' : '#9CA3AF'}
                  />
                </View>
              </View>
            )}
          </ScrollView>

        </View>
      </ModalViewport>
    </Modal>
  );
};
