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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refetchRef.current();
      }, 600);
    };

    const subId = Math.random().toString(36).slice(2, 8);

    // Multiplex all stat table listeners onto a single WebSocket channel
    let channel = supabase
      .channel(`realtime-stats-${subId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_labour' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, trigger);

    if (includeSiteMaterials) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'site_materials' }, trigger);
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [includeSiteMaterials]);
}
