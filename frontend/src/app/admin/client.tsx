import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { ClientAccountsPanel } from '../../components/client/ClientAccountsPanel';
import { RecentClientActivity } from '../../components/client/RecentClientActivity';
import { SharedDocuments } from '../../components/client/SharedDocuments';
import { InviteClientModal } from '../../components/client/InviteClientModal';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function ClientPortalScreen() {
  const [stats, setStats] = useState({
    activeClients: 0,
    sharedProjects: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch counts
        const [clientsReq, projectsReq] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active')
        ]);

        if (isMounted) {
          setStats({
            activeClients: clientsReq.count || 0,
            sharedProjects: projectsReq.count || 0,
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
  }, [refreshTrigger]);

  const handleInvite = () => {
    setModalVisible(false);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Client Updates" 
        actionLabel="+ Invite Client" 
        onActionPress={() => setModalVisible(true)} 
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
          <View className="flex-row justify-between mb-6 -mx-2">
            <StatCard 
              label="Active Clients" 
              value={stats.activeClients.toString()} 
              indicatorText="" 
              icon={<FontAwesome5 name="user-friends" size={16} color="#9CA3AF" />}
            />
            <StatCard 
              label="Shared Projects" 
              value={stats.sharedProjects.toString()} 
              indicatorText="" 
              icon={<FontAwesome5 name="folder-open" size={16} color="#9CA3AF" />}
            />
            <StatCard 
              label="Pending Invoices" 
              value="0" // Mocked
              indicatorText="Requires client sign-off" 
              indicatorType="warning"
              icon={<Ionicons name="time" size={16} color="#F97316" />}
            />
          </View>

          {/* Main Content Layout */}
          <View className="flex-row">
            {/* Main Content Area (Client Accounts) */}
            <View className="flex-[2] mr-6">
              <ClientAccountsPanel refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Activity & Documents) */}
            <View className="flex-[1] flex-col">
              <RecentClientActivity />
              <SharedDocuments />
            </View>
          </View>
        </ScrollView>
      )}

      <InviteClientModal 
        visible={isModalVisible} 
        onClose={() => setModalVisible(false)} 
        onSuccess={handleInvite} 
      />
    </View>
  );
}
