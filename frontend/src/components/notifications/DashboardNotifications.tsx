import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNotifications } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';
import { notificationRoute } from '@/utils/notificationRoute';

export function DashboardNotifications(){
 const {notifications,unreadCount,error,refresh,markAsRead}=useNotifications();
 const {role}=useAuth(),router=useRouter();
 const latest=notifications.filter(row=>!row.is_read).slice(0,3);
 if(!latest.length&&!error&&!unreadCount)return null;
 return <View className="mb-5 p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 min-w-0">
  <View className="flex-row items-center justify-between gap-3 mb-2"><View className="flex-row gap-2 items-center flex-1 min-w-0"><Ionicons name="notifications-outline" size={19} color="#EA580C"/><Text className="font-bold text-brand-text dark:text-white flex-shrink">Your updates{unreadCount>0?` · ${unreadCount} unread`:''}</Text></View><Pressable accessibilityRole="button" onPress={()=>router.push(notificationRoute(null,role) as any)} className="min-h-[44px] justify-center px-2"><Text className="text-brand-orange font-semibold text-sm">View all</Text></Pressable></View>
  {!!error&&<View><Text className="text-red-700 text-sm">Updates could not be loaded.</Text><Pressable accessibilityRole="button" onPress={()=>void refresh()} className="min-h-[44px] justify-center self-start"><Text className="text-brand-orange font-semibold">Retry notifications</Text></Pressable></View>}
  {!latest.length&&unreadCount>0&&<Text className="text-sm text-slate-500">Earlier updates are unread. Open View all to review your notification history.</Text>}
  {latest.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Open update: ${row.title}`} onPress={()=>{void markAsRead(row.id);router.push(notificationRoute(row.link,role) as any);}} className="py-3 border-t border-slate-100 dark:border-slate-800 min-h-[48px] flex-row items-start gap-3">
   <View className="w-2 h-2 rounded-full bg-brand-orange mt-2"/><View className="flex-1 min-w-0"><Text className="font-semibold text-sm text-brand-text dark:text-white">{row.title}</Text><Text numberOfLines={2} className="text-xs leading-5 text-slate-500 mt-1">{row.message}</Text></View><Ionicons name="chevron-forward" size={16} color="#94A3B8"/>
  </Pressable>)}
 </View>;
}
