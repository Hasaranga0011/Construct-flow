import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { buildNotificationFilter, isNotificationForUser } from '../utils/notifications';
import { getApiUrl } from '../lib/apiUrl';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  target_role: string | null;
  target_user_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, session } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Polling fallback in case realtime is not enabled on DB
  const loadNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(buildNotificationFilter(user.id, role))
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data);
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setNotifications([]);
    setLoading(!!user);

    if (user) {
      loadNotifications().then(() => {
        if (isMounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    if (!user) return;

    // Realtime subscription
    const channel = supabase
      .channel(`public:notifications:global`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          if (!isMounted) return;
          const newNotif = payload.new as AppNotification;
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

    // Fallback polling for missing realtime config on DB
    const interval = setInterval(() => {
      loadNotifications();
    }, 15000); // 15s

    return () => {
      isMounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      const response = await fetch(`${getApiUrl()}/notifications/mark-read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ ids: [id] })
      });
      if (!response.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
      }
    } catch (e) {
      console.error('Error marking as read', e);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length > 0) {
        const response = await fetch(`${getApiUrl()}/notifications/mark-read`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ ids: unreadIds })
        });
        if (!response.ok) {
          setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: false } : n));
        } else {
          Alert.alert('Success', 'All notifications marked as read.');
        }
      }
    } catch (e) {
      console.error('Error marking all as read', e);
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: false } : n));
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
