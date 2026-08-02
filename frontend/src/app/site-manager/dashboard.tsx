import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function SiteManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    assignedSites: 0,
    workersPresent: 0,
    pendingMaterials: 0,
    activeIssues: 0,
  });

  const loadStats = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const userId = sessionData.session.user.id;

      // 1. Fetch sites assigned to this Site Manager
      const { data: assignments } = await supabase
        .from('site_manager_sites')
        .select('site_id')
        .eq('site_manager_id', userId);

      const siteIds = assignments?.map(a => a.site_id) || [];
      
      let workersPresent = 0;
      let pendingMaterials = 0;
      let activeIssues = 0;

      if (siteIds.length > 0) {
        // Fetch workers present today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const attendanceReq = await supabase
          .from('attendance')
          .select('id', { count: 'exact' })
          .in('site_id', siteIds)
          .eq('status', 'Present')
          .gte('date', startOfDay.toISOString());

        workersPresent = attendanceReq.count || 0;

        // Fetch pending material requests for these sites
        // Note: material_requests are linked to projects, not sites in the current schema. 
        // We might need to join sites -> projects -> material_requests OR site_materials.
        // For now, since material_requests doesn't have site_id directly in the current schema, 
        // we count alerts from site_materials low stock if applicable, or we use a custom query.
        // Let's count site_materials running low (quantity < 10) for this SM's sites
        const materialsReq = await supabase
          .from('site_materials')
          .select('id', { count: 'exact' })
          .in('site_id', siteIds)
          .lt('quantity', 10);

        pendingMaterials = materialsReq.count || 0;

        // Fetch active issues
        const issuesReq = await supabase
          .from('issues')
          .select('id', { count: 'exact' })
          .in('site_id', siteIds)
          .eq('status', 'Open');

        activeIssues = issuesReq.count || 0;
      }

      setStats({
        assignedSites: siteIds.length,
        workersPresent,
        pendingMaterials,
        activeIssues,
      });

    } catch (error) {
      console.error('Failed to load SM dashboard stats', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Manager Dashboard" showAction={false} />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          
          <View className="flex-row justify-between mb-6 -mx-2">
            <AnimatedCard delay={100} style={{ flex: 1 }}>
              <StatCard 
                label="Assigned Sites" 
                value={stats.assignedSites.toString()} 
                indicatorText="Currently managing" 
              />
            </AnimatedCard>
            
            <AnimatedCard delay={200} style={{ flex: 1 }}>
              <StatCard 
                label="Workers Present" 
                value={stats.workersPresent.toString()} 
                indicatorText="Checked in today" 
                indicatorType="success"
              />
            </AnimatedCard>
            
            <AnimatedCard delay={300} style={{ flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.pendingMaterials.toString()} 
                indicatorText="Items < 10 units" 
                indicatorType={stats.pendingMaterials > 0 ? "danger" : "success"}
              />
            </AnimatedCard>
            
            <AnimatedCard delay={400} style={{ flex: 1 }}>
              <StatCard 
                label="Active Issues" 
                value={stats.activeIssues.toString()} 
                indicatorText="Requires attention"
                indicatorType={stats.activeIssues > 0 ? "danger" : "success"}
              />
            </AnimatedCard>
          </View>

          <View className="flex-1 items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
            <Ionicons name="construct-outline" size={64} color="#D1D5DB" className="mb-4" />
            <Text className="text-gray-400 text-lg font-medium">Detailed widgets coming soon...</Text>
          </View>

        </ScrollView>
      )}
    </View>
  );
}
