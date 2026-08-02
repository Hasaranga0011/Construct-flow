import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const ActivityRow = ({ 
  action, 
  project, 
  time, 
  iconFamily: IconFamily, 
  iconName, 
  iconColor 
}: { 
  action: string, 
  project: string, 
  time: string, 
  iconFamily: any, 
  iconName: string, 
  iconColor: string 
}) => {
  return (
    <View className="flex-row items-start mb-5">
      <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-gray-50 border border-gray-100">
        <IconFamily name={iconName} size={14} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-brand-text font-bold text-sm mb-0.5">{action}</Text>
        <Text className="text-gray-500 text-xs">{project} · {time}</Text>
      </View>
    </View>
  );
};

export const RecentClientActivity = () => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadActivities = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('client_activity')
          .select(`
            id, action, created_at,
            projects(name)
          `)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        
        if (isMounted) setActivities(data || []);
      } catch (error) {
        console.warn('Failed to load client activity:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadActivities();

    const channel = supabase
      .channel('client_activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_activity'
      }, (payload) => {
        if (isMounted) {
          // Simplistic logic since we don't have project name in payload easily without joining
          // We can just prepend it or refetch
          loadActivities(); 
        }
      })
      .subscribe();
    
    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
    };
  }, []);

  const getIconProps = (action: string) => {
    if (action.toLowerCase().includes('download')) return { iconFamily: FontAwesome5, iconName: 'download', iconColor: '#3B82F6' };
    if (action.toLowerCase().includes('comment')) return { iconFamily: FontAwesome5, iconName: 'comment-alt', iconColor: '#10B981' };
    if (action.toLowerCase().includes('approval')) return { iconFamily: Ionicons, iconName: 'time', iconColor: '#F59E0B' };
    return { iconFamily: MaterialIcons, iconName: 'share', iconColor: '#8B5CF6' };
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hrs ago`;
    return date.toLocaleDateString();
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6 min-h-[250px]">
      <View className="flex-row items-center mb-6">
        <Text className="text-lg font-bold text-brand-text mr-2">Recent Client Activity</Text>
        <FontAwesome5 name="chart-line" size={14} color="#9CA3AF" />
      </View>

      <View>
        {loading ? (
          <View className="py-4 items-center justify-center">
             <ActivityIndicator color="#F97316" />
          </View>
        ) : activities.length === 0 ? (
          <View className="py-4 items-center justify-center">
            <Text className="text-gray-400">No recent activity.</Text>
          </View>
        ) : (
          activities.map((a, i) => {
            const props = getIconProps(a.action || '');
            const pName = a.projects?.name || 'Unknown Project';
            return (
              <ActivityRow 
                key={a.id || i}
                action={a.action || 'Unknown Action'} 
                project={pName} 
                time={getTimeAgo(a.created_at)} 
                iconFamily={props.iconFamily} 
                iconName={props.iconName} 
                iconColor={props.iconColor} 
              />
            );
          })
        )}
      </View>
    </View>
  );
};
