import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { ClientAccountsPanel } from '../../components/client/ClientAccountsPanel';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function PMClientPortalScreen() {
  const [stats, setStats] = useState({
    activeClients: 0,
    sharedProjects: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        
        const pmId = sessionData.session.user.id;
        if (isMounted) setCurrentUserId(pmId);

        // Fetch counts for this PM
        const { data: projects } = await supabase.from('projects').select('client_id').eq('pm_id', pmId).eq('status', 'active');
        
        let clientIds = new Set<string>();
        if (projects) {
          projects.forEach(p => {
            if (p.client_id) clientIds.add(p.client_id);
          });
        }

        if (isMounted) {
          setStats({
            activeClients: clientIds.size,
            sharedProjects: projects?.length || 0,
          });
        }
      } catch (error) {
        console.warn('Failed to load client stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, []);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Client Updates (Your Projects)" 
        showAction={false}
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View className="flex-row justify-start space-x-6 mb-6 -mx-2">
            <View className="w-1/3">
              <StatCard 
                label="Your Active Clients" 
                value={stats.activeClients.toString()} 
                indicatorText="" 
                icon={<FontAwesome5 name="user-friends" size={16} color="#9CA3AF" />}
              />
            </View>
            <View className="w-1/3">
              <StatCard 
                label="Your Shared Projects" 
                value={stats.sharedProjects.toString()} 
                indicatorText="" 
                icon={<FontAwesome5 name="folder-open" size={16} color="#9CA3AF" />}
              />
            </View>
          </View>

          {/* Main Content Layout */}
          <View className="flex-row">
            {/* Main Content Area (Client Accounts) */}
            <View className="flex-1">
              <ClientAccountsPanel searchQuery={searchQuery} pmId={currentUserId} />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
