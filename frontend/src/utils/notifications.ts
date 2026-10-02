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

export const sendSystemNotification = async (
  title: string,
  message: string,
  target_role: string = 'Admin',
  target_user_id: string | null = null,
  link: string | null = null
) => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || '11111111-1111-1111-1111-111111111111';
    
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'general',
      title,
      message,
      target_role,
      target_user_id,
      link,
      is_read: false,
      sent_via: 'in_app'
    });
  } catch (error) {
    console.warn('Failed to send notification', error);
  }
};