const ROLE_ALIASES: Record<string, string[]> = {
  admin: ['admin', 'super_admin', 'Super Admin', 'Admin'],
  pm: ['pm', 'project_manager', 'Project Manager', 'Manager'],
  site_manager: ['site_manager', 'Site Manager'],
  client: ['client', 'Client'],
  worker: ['worker', 'Worker'],
  supplier: ['supplier', 'Supplier'],
};

export const getNotificationRoleAliases = (role?: string | null) => {
  if (!role) return [];
  const aliases = ROLE_ALIASES[role] || Object.values(ROLE_ALIASES).find(values => values.includes(role)) || [];
  return [...new Set(aliases)];
};

export const buildNotificationFilter = (userId: string, role?: string | null) => {
  const roleFilters = getNotificationRoleAliases(role).map((value) => `target_role.eq.${value}`);
  return `target_user_id.eq.${userId},and(target_user_id.is.null,or(${['target_role.eq.All', ...roleFilters].join(',')}))`;
};

export const isNotificationForUser = (
  notification: { target_role?: string | null; target_user_id?: string | null },
  userId: string,
  role?: string | null,
) => notification.target_user_id === userId
  || (notification.target_user_id == null
    && (notification.target_role === 'All'
      || getNotificationRoleAliases(role).includes(notification.target_role || '')));

import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  if (Platform.OS === 'web') return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(':')[0] || '10.0.2.2';
  return process.env.EXPO_PUBLIC_API_URL || `http://${localhost}:8000`;
};

export const sendSystemNotification = async (
  title: string,
  message: string,
  target_role: string = 'Admin',
  target_user_id: string | null = null,
  link: string | null = null,
  type: string = 'general',
  project_id: string | null = null
) => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    
    if (!token) {
      console.warn('Cannot send notification: no token');
      return;
    }

    const payload = {
      title,
      message,
      target_role,
      target_user_id,
      link,
      type,
      project_id
    };

    const API_URL = getApiUrl();
    const response = await fetch(`${API_URL}/notifications/system`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn('Failed to send notification via API:', await response.text());
    }
  } catch (error) {
    console.warn('Failed to send notification', error);
  }
};