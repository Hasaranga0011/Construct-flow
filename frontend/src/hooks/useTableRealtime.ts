import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Subscribes to INSERT/UPDATE/DELETE on the given tables and returns a counter
 * (`tick`) that increments (debounced) on every change. Add `tick` to a data
 * effect's dependency list to refetch live. Also returns `lastUpdated`.
 */
export function useTableRealtime(tables: string[]) {
  const [tick, setTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(',');

  useEffect(() => {
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setTick(t => t + 1);
        setLastUpdated(new Date());
      }, 300);
    };

    const topic = `rt:${key}:${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(topic);
    key.split(',').forEach(table => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump);
    });
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [key]);

  return { tick, lastUpdated };
}
