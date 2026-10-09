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
import { useTableRealtime } from '../../hooks/useTableRealtime';
import { SearchInput } from '@/components/common/SearchInput';

export default function ClientPortalScreen() {
  const [stats, setStats] = useState({
    activeClients: 0,
    sharedProjects: 0,
    pendingInvoices: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchClients, setSearchClients] = useState<any[]>([]);
  const { isMobile } = useResponsive();
  
  const { tick, lastUpdated } = useTableRealtime(['profiles', 'projects', 'invoices', 'client_activity', 'shared_documents']);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch counts
        const [clientsReq, projectsReq, invoicesReq] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, role', { count: 'exact' }).eq('role', 'client'),
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).in('status', ['Unpaid', 'Overdue'])
        ]);

        if (isMounted) {
          setSearchClients(clientsReq.data || []);
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
  }, [tick]);

  const handleInvite = () => {
    setModalVisible(false);
    // tick will naturally update if profiles is updated
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
        <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Clients</Text>
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}</Text>
            </View>
            
            <SearchInput items={searchClients} entityLabel="clients" 
              placeholder="Search clients..." 
              value={searchQuery}
              onChangeText={setSearchQuery}
              className={isMobile ? "w-full" : "w-64"}
              config={{
                table: 'profiles',
                searchColumn: 'full_name',
                secondaryColumn: 'email',
                titleColumn: 'full_name',
                subtitleColumn: 'email',
                routePrefix: '/admin/users/',
                filterColumn: 'role',
                filterValue: 'client'
              }}
            />
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
              <ClientAccountsPanel refreshTrigger={tick} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Activity & Documents) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1, flexDirection: 'column', gap: 24 }}>
              <RecentClientActivity refreshTrigger={tick} />
              <SharedDocuments refreshTrigger={tick} />
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
