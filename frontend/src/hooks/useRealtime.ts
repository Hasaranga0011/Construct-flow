import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

export function useNotifications(userId: string | null, role: string | null) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    if (!userId || !role) return;

    // Initial fetch
    supabase
      .from('notifications')
      .select('*')
      .or(`user_id.eq.${userId},target_role.eq.All,target_role.eq.${role}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setNotifications(data);
          setBadgeCount(data.filter(n => !n.is_read).length);
        }
      });

    // Subscriptions
    const userSub = supabase.channel('user-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, handleNewNotification)
      .subscribe();

    const roleSub = supabase.channel('role-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_role=eq.${role}` }, handleNewNotification)
      .subscribe();

    const allSub = supabase.channel('all-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_role=eq.All` }, handleNewNotification)
      .subscribe();

    function handleNewNotification(payload: any) {
      setNotifications(prev => [payload.new, ...prev]);
      setBadgeCount(prev => prev + 1);
      Alert.alert(payload.new.title, payload.new.message);
    }

    return () => {
      supabase.removeChannel(userSub);
      supabase.removeChannel(roleSub);
      supabase.removeChannel(allSub);
    };
  }, [userId, role]);

  const markAllRead = async () => {
    // Optimistic UI
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setBadgeCount(0);
  };

  return { notifications, badgeCount, markAllRead };
}

export function useAttendance() {
  const [attendance, setAttendance] = useState<any[]>([]);
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
