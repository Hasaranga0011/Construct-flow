import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, TextInput, Text } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { ClientAccountsPanel } from '../../components/client/ClientAccountsPanel';
import { RecentClientActivity } from '../../components/client/RecentClientActivity';
import { SharedDocuments } from '../../components/client/SharedDocuments';
import { InviteClientModal } from '../../components/client/InviteClientModal';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

import { useResponsive } from '../../hooks/useResponsive';

export default function ClientPortalScreen() {
  const [stats, setStats] = useState({
    activeClients: 0,
    sharedProjects: 0,
    pendingInvoices: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    // Setup Realtime subscriptions
    const subProfiles = supabase.channel('admin-client-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        setRefreshTrigger(prev => prev + 1);
      }).subscribe();
      
    const subProjects = supabase.channel('admin-client-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        setRefreshTrigger(prev => prev + 1);
      }).subscribe();
      
    const subInvoices = supabase.channel('admin-client-invoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        setRefreshTrigger(prev => prev + 1);
      }).subscribe();

    return () => {
      supabase.removeChannel(subProfiles);
      supabase.removeChannel(subProjects);
      supabase.removeChannel(subInvoices);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch counts
        const [clientsReq, projectsReq, invoicesReq] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).in('status', ['Unpaid', 'Overdue'])
        ]);

        if (isMounted) {
          setStats({
            activeClients: clientsReq.count || 0,
            sharedProjects: projectsReq.count || 0,
            pendingInvoices: invoicesReq.count || 0,
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
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12 }}>
            <Text className="text-2xl font-bold text-brand-text">All Clients</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search clients..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Top Stat Cards Row */}
          <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -8 }}>
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
              value={stats.pendingInvoices.toString()}
              indicatorText="Requires client sign-off" 
              indicatorType="warning"
              icon={<Ionicons name="time" size={16} color="#F97316" />}
            />
          </View>

          {/* Main Content Layout */}
          <View style={isMobile ? { flexDirection: 'column', gap: 16 } : { flexDirection: 'row' }}>
            {/* Main Content Area (Client Accounts) */}
            <View style={isMobile ? { width: '100%' } : { flex: 2, marginRight: 24 }}>
              <ClientAccountsPanel refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Activity & Documents) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1, flexDirection: 'column', gap: 24 }}>
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
