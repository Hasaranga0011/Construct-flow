import { useNotifications as useSharedNotifications } from '../context/NotificationContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

export function useNotifications(_userId: string | null, _role: string | null) {
  const shared = useSharedNotifications();
  return { notifications: shared.notifications, badgeCount: shared.unreadCount, markAllRead: shared.markAllAsRead };
}

export function useAttendance() {
  const [attendance] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const sub = supabase.channel('attendance-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  const refresh = () => setRefreshTrigger(prev => prev + 1);
  return { attendance, refresh, refreshTrigger };
}

export function usePurchaseOrders(supplierId: string | null) {
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!supplierId) return;

    const sub = supabase.channel('po-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchase_orders', filter: `supplier_id=eq.${supplierId}` }, (payload) => {
        setOrders(prev => [payload.new, ...prev]);
        Alert.alert("New Order", `PO ${payload.new.po_number} received.`);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'purchase_orders', filter: `supplier_id=eq.${supplierId}` }, (payload) => {
        setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [supplierId]);

  const refresh = () => setRefreshTrigger(prev => prev + 1);
  return { orders, refresh, refreshTrigger };
}

export function useMilestones(projectId: string | null) {
  const [milestones, setMilestones] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    const sub = supabase.channel('milestone-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'milestones', filter: `project_id=eq.${projectId}` }, (payload) => {
        setMilestones(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [projectId]);

  const refresh = () => setRefreshTrigger(prev => prev + 1);
  return { milestones, refresh, refreshTrigger };
}

export function useSiteMedia(projectId: string | null) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    const sub = supabase.channel('photo-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `project_id=eq.${projectId}` }, (payload) => {
        setPhotos(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [projectId]);

  const refresh = () => setRefreshTrigger(prev => prev + 1);
  return { photos, refresh, refreshTrigger };
}
