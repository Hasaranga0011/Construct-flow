import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

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
  const { user, role, isApproved } = useAuth();
  const userId = user?.id;
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const version = useRef(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!userId || !isApproved) return;
    const request = ++version.current;
    try {
      const rows = await api.getFresh('/notifications/') as AppNotification[];
      if (activeUser.current === userId && version.current === request) setNotifications(rows);
    } catch (error) {
      console.warn('Unable to load notifications', error);
    } finally {
      if (activeUser.current === userId && version.current === request) setLoading(false);
    }
  }, [userId, isApproved]);

  useEffect(() => {
    const generation = version;
    setNotifications([]);
    setLoading(!!userId && isApproved);
    if (!userId || !isApproved) return;
    void load();
    // Read flags belong to receipts, so shared events only trigger an authoritative refresh.
    const channel = supabase.channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => { void load(); })
      .subscribe();
    const interval = setInterval(() => { void load(); }, 45000);
    return () => {
      generation.current++;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [load, userId, role, isApproved]);

  const saveRead = async (ids: string[]) => {
    if (!userId || !ids.length) return;
    version.current++;
    const previous = new Map(notifications.map(row => [row.id, row.is_read]));
    setNotifications(rows => rows.map(row => ids.includes(row.id) ? { ...row, is_read: true } : row));
    try {
      await api.patch('/notifications/mark-read', { ids });
    } catch (error) {
      if (activeUser.current === userId) {
        setNotifications(rows => rows.map(row => ids.includes(row.id) ? { ...row, is_read: previous.get(row.id) ?? false } : row));
        Alert.alert('Unable to save read status', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      if (activeUser.current === userId) await load();
    }
  };
  return <NotificationContext.Provider value={{
    notifications, loading, unreadCount: notifications.filter(row => !row.is_read).length,
    markAsRead: id => saveRead([id]),
    markAllAsRead: () => saveRead(notifications.filter(row => !row.is_read).map(row => row.id)),
  }}>{children}</NotificationContext.Provider>;
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications requires NotificationProvider');
  return context;
}
