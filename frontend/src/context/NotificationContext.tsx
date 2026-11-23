import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
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
  link?: string | null;
  source_table?: string | null;
  source_record?: string | null;
}
interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  totalCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
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
  const [unreadCount,setUnreadCount]=useState(0);
  const [totalCount,setTotalCount]=useState(0);
  const [error,setError]=useState('');
  const load = useCallback(async () => {
    if (!userId || !isApproved || activeUser.current!==userId) return;
    const request = ++version.current;
    try {
      const feed = await api.getFresh('/notifications/feed');
      const rows:AppNotification[] = Array.isArray(feed)?feed:feed.items;
      if (!Array.isArray(rows)) throw new Error('Notifications could not be loaded. Please retry.');
      if (activeUser.current === userId && version.current === request) {
        setNotifications(rows);setError('');
        setUnreadCount(Array.isArray(feed)?rows.filter(row=>!row.is_read).length:Number(feed.unread_count)||0);
        setTotalCount(Array.isArray(feed)?rows.length:Number(feed.total_count)||rows.length);
      }
    } catch (error) {
      if(activeUser.current===userId&&version.current===request)setError(error instanceof Error?error.message:'Unable to load notifications.');
    } finally {
      if (activeUser.current === userId && version.current === request) setLoading(false);
    }
  }, [userId, isApproved]);

  useEffect(() => {
    const generation = version;
    setNotifications([]);
    setUnreadCount(0);setTotalCount(0);setError('');
    setLoading(!!userId && isApproved);
    if (!userId || !isApproved) return;
    void load();
    let scheduled:ReturnType<typeof setTimeout>|undefined;
    const visible=()=>Platform.OS==='web'?typeof document==='undefined'||!document.hidden:AppState.currentState==='active';
    const schedule=()=>{if(scheduled)clearTimeout(scheduled);scheduled=setTimeout(()=>{if(visible())void load();},200);};
    // Read flags belong to receipts, so shared events only trigger an authoritative refresh.
    const channel = supabase.channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_receipts', filter:`user_id=eq.${userId}` }, schedule)
      .subscribe();
    const interval = setInterval(() => { if(visible())void load(); }, 30000);
    const foreground=()=>{if(visible())void load();};
    const appState=AppState.addEventListener('change',state=>{if(state==='active')void load();});
    if(Platform.OS==='web'&&typeof window!=='undefined')window.addEventListener('focus',foreground);
    if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',foreground);
    return () => {
      generation.current++;
      clearInterval(interval);
      if(scheduled)clearTimeout(scheduled);
      appState.remove();
      if(Platform.OS==='web'&&typeof window!=='undefined')window.removeEventListener('focus',foreground);
      if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',foreground);
      void supabase.removeChannel(channel);
    };
  }, [load, userId, role, isApproved]);

  const saveRead = async (ids: string[], all=false) => {
    if (!userId || (!all&&!ids.length)) return false;
    version.current++;
    const previous = new Map(notifications.map(row => [row.id, row.is_read]));
    const priorCount=unreadCount;
    setNotifications(rows => rows.map(row => all||ids.includes(row.id) ? { ...row, is_read: true } : row));
    setUnreadCount(count=>all?0:Math.max(0,count-notifications.filter(row=>ids.includes(row.id)&&!row.is_read).length));
    let saved=false;
    try {
      await api.patch('/notifications/mark-read', all?{all:true}:{ids});
      saved=true;
    } catch (error) {
      if (activeUser.current === userId) {
        setNotifications(rows => rows.map(row => ids.includes(row.id) ? { ...row, is_read: previous.get(row.id) ?? false } : row));
        setUnreadCount(priorCount);
        Alert.alert('Unable to save read status', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      if (activeUser.current === userId) await load();
    }
    return saved;
  };
  return <NotificationContext.Provider value={{
    notifications, loading, unreadCount,totalCount,error,refresh:load,
    markAsRead: id => saveRead([id]),
    markAllAsRead: () => saveRead(notifications.filter(row => !row.is_read).map(row => row.id),true),
  }}>{children}</NotificationContext.Provider>;
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications requires NotificationProvider');
  return context;
}
