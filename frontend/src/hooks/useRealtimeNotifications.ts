import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { buildNotificationFilter, isNotificationForUser } from '../utils/notifications';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  target_role: string | null;
  target_user_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const useRealtimeNotifications = () => {
  const { user, role } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    let isMounted = true;
    setNotifications([]);
    setLoading(!!user);

    const loadNotifications = async () => {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .or(buildNotificationFilter(user.id, role))
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          if (error.code === '42P01') {
            console.warn('Notifications table not found.');
          } else {
            console.error('Failed to load notifications', error);
          }
          return;
        }
        if (isMounted) setNotifications(data || []);
      } catch (e) {
        console.error('Failed to load notifications', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadNotifications();

    const channel = supabase
      .channel(`public:notifications:${Math.random()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          if (!isMounted) return;
          const newNotif = payload.new as AppNotification;
          // Check if it belongs to this user
          if (user && isNotificationForUser(newNotif, user.id, role)) {
            setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          if (!isMounted) return;
          const updatedNotif = payload.new as AppNotification;
          setNotifications((prev) =>
            prev.flatMap((n) => n.id !== updatedNotif.id ? [n]
              : user && isNotificationForUser(updatedNotif, user.id, role) ? [updatedNotif] : [])
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => {
          if (!isMounted) return;
          setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (error) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
        throw error;
      }
    } catch (e) {
      console.error('Error marking as read', e);
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      // Find IDs of unread notifications we just optimistically updated
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length > 0) {
        const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
        if (error) {
          setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: false } : n));
          throw error;
        }
      }
    } catch (e) {
      console.error('Error marking all as read', e);
    }
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead };
};
