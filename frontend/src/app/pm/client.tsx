import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { ClientAccountsPanel } from '../../components/client/ClientAccountsPanel';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function PMClientPortalScreen() {
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [stats, setStats] = useState({
    activeClients: 0,
    sharedProjects: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [clientProfiles, setClientProfiles] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        setLoading(true);
        setLoadError('');
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) throw new Error('Please sign in again.');

        const pmId = sessionData.session.user.id;
        if (isMounted) setCurrentUserId(pmId);

        // Fetch counts for this PM
        const { data: projects, error: projectError } = await supabase.from('projects').select('client_id').eq('pm_id', pmId);

        if (projectError) throw projectError;
        const clientIds = new Set<string>();
        if (projects) {
          projects.forEach(p => {
            if (p.client_id) clientIds.add(p.client_id);
          });
        }

        if (clientIds.size > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', Array.from(clientIds));
          if (isMounted) setClientProfiles(profiles || []);
        }

        if (isMounted) {
          setStats({
            activeClients: clientIds.size,
            sharedProjects: projects?.length || 0,
          });
        }
      } catch (error: any) {
        if (isMounted) setLoadError(error.message || 'Unable to load clients');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [retry]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav
        title="Client Updates (Your Projects)"
        showAction={false}
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
        searchItems={clientProfiles}
        searchEntityLabel="clients"
        searchConfig={{ titleColumn: 'full_name', subtitleColumn: 'email', searchColumn: 'full_name' }}
      />

      {loadError ? <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetry(v => v + 1)} className="p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600">{loadError} ? Tap to retry</Text></Pressable> : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View className="flex-row flex-wrap gap-4 mb-6">
            <View className="w-full md:flex-1">
              <StatCard
                label="Your Clients"
                value={stats.activeClients.toString()}
                indicatorText=""
                icon={<FontAwesome5 name="user-friends" size={16} color="#9CA3AF" />}
              />
            </View>
            <View className="w-full md:flex-1">
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
              {currentUserId && <ClientAccountsPanel searchQuery={searchQuery} pmId={currentUserId} />}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
