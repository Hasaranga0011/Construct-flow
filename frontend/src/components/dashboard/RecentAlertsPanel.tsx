import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

const AlertItem = ({ title, subtext, iconColor }: { title: string, subtext: string, iconColor: string }) => {
  return (
    <View className="flex-row items-start mb-4">
      {/* Icon Placeholder */}
      <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5 ${iconColor.replace('text-', 'bg-').replace('-500', '-100')}`}>
         <View className={`w-3 h-3 rounded-sm ${iconColor.replace('text-', 'bg-')}`} />
      </View>
      
      {/* Content */}
      <View className="flex-1">
        <Text className="text-brand-text font-bold text-sm mb-0.5">{title}</Text>
        <Text className="text-gray-500 text-xs">{subtext}</Text>
      </View>
    </View>
  );
};

export const RecentAlertsPanel = ({ pmId }: { pmId?: string }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    let currentUserId: string | null = null;

    const setup = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      currentUserId = sessionData?.session?.user?.id || null;
      loadAlerts(sessionData);
    };

    const loadAlerts = async (sessionData: any) => {
      try {
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        let query = supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(4);
          
        if (pmId) {
          query = query.or(`target_user_id.eq.${pmId},target_role.eq.pm`);
        } else {
          // If no pmId, assume admin dashboard
          // Since we don't have role here natively, we hardcode super_admin aliases or just fetch it
          query = query.or(`target_user_id.eq.${currentUserId},and(target_user_id.is.null,or(target_role.eq.All,target_role.eq.super_admin))`);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        if (isMounted) setAlerts(data || []);
      } catch (error) {
        console.warn('Failed to load alerts:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    setup();

    // Supabase Realtime subscribe
    const channel = supabase
      .channel('dashboard_alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications'
      }, (payload) => {
        if (isMounted) {
          const targetUser = payload.new.target_user_id;
          const targetRole = payload.new.target_role;
          
          const isForMe = pmId 
            ? (targetUser === pmId || targetRole === 'pm')
            : (targetUser === currentUserId || targetRole === 'super_admin');
            
          if (isForMe) {
            setAlerts(prev => [payload.new, ...prev].slice(0, 4));
          }
        }
      })
      .subscribe();
    
    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
    };
  }, []);

  const getIconColor = (type: string) => {
    switch(type) {
      case 'Alert': return 'text-brand-orange';
      case 'Warning': return 'text-brand-danger'; // fallback if warning
      case 'Success': return 'text-brand-success';
      case 'Info':
      default: return 'text-blue-500';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr${diffInHours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-lg font-bold text-brand-text">Recent Alerts</Text>
        {alerts.filter(a => a.is_unread).length > 0 && (
          <View className="bg-brand-orange px-2 py-1 rounded-full">
            <Text className="text-white text-[10px] font-bold">{alerts.filter(a => a.is_unread).length} new</Text>
          </View>
        )}
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : alerts.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-gray-400">No new alerts.</Text>
          </View>
        ) : (
          alerts.map(a => (
            <AlertItem 
              key={a.id}
              title={a.title} 
              subtext={getTimeAgo(a.created_at)} 
              iconColor={getIconColor(a.type)} 
            />
          ))
        )}
      </View>

      <Pressable 
        className="mt-auto pt-4 border-t border-gray-50 items-center"
        onPress={() => router.push('/admin/notifications')}
      >
        <Text className="text-brand-orange text-sm font-semibold">View all notifications →</Text>
      </Pressable>
    </View>
  );
};
