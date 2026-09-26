import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type StatsRefetcher = () => void | Promise<void>;

/**
 * useRealtimeStats
 *
 * Subscribes to Supabase Realtime INSERT/UPDATE/DELETE events on:
 *   - `attendance`    → Workers On Site (admin, site/site-manager dashboards)
 *   - `labour`        → Workers On Site (PM, site dashboards that query labour.status)
 *   - `materials`     → Low Stock Alerts
 *   - `site_materials`→ Low Stock Alerts (site-manager, when includeSiteMaterials=true)
 *
 * Calls `onRefetch` whenever a change is detected so the dashboard
 * re-queries the latest numbers instantly.
 *
 * @param onRefetch            Function that re-fetches dashboard stats
 * @param includeSiteMaterials Pass true for site-manager dashboards
 */
export function useRealtimeStats(
  onRefetch: StatsRefetcher,
  includeSiteMaterials = false
) {
  const refetchRef = useRef(onRefetch);
  // Keep the ref current without re-subscribing on every render
  useEffect(() => { refetchRef.current = onRefetch; }, [onRefetch]);

  useEffect(() => {
    const trigger = () => refetchRef.current();

    // attendance → Workers On Site (admin / site / site-manager dashboards)
    const attendanceChannel = supabase
      .channel('realtime-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, trigger)
      .subscribe();

    // labour → Workers On Site (PM / site dashboards that query labour.status = 'Present')
    const labourChannel = supabase
      .channel('realtime-labour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labour' }, trigger)
      .subscribe();

    // materials → Low Stock Alerts
    const materialsChannel = supabase
      .channel('realtime-materials')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, trigger)
      .subscribe();

    // site_materials → Low Stock Alerts (site-manager only)
    let siteMaterialsChannel: ReturnType<typeof supabase.channel> | null = null;
    if (includeSiteMaterials) {
      siteMaterialsChannel = supabase
        .channel('realtime-site-materials')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'site_materials' }, trigger)
        .subscribe();
    }

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(labourChannel);
      supabase.removeChannel(materialsChannel);
      if (siteMaterialsChannel) supabase.removeChannel(siteMaterialsChannel);
    };
  }, [includeSiteMaterials]);
}
