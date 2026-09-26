import { supabase } from '../lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'API request failed');
  }

  return response.json();
}

export const api = {
  projects: {
    getAll: () => fetchWithAuth('/projects/'),
    create: (data: any) => fetchWithAuth('/projects/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    createMilestone: (projectId: string, data: any) => fetchWithAuth(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) }),
    updateMilestone: (projectId: string, milestoneId: string, data: any) => fetchWithAuth(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    financials: (projectId: string) => fetchWithAuth(`/projects/${projectId}/financials`),
  },
  materials: {
    getAll: (projectId?: string) => fetchWithAuth(`/materials/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/materials/', { method: 'POST', body: JSON.stringify(data) }),
    checkStock: () => fetchWithAuth('/materials/check-stock', { method: 'POST' }),
  },
  labour: {
    getAll: (projectId?: string) => fetchWithAuth(`/labour/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/labour/', { method: 'POST', body: JSON.stringify(data) }),
    getPayroll: () => fetchWithAuth('/labour/payroll'),
    scan: (data: { qr_code: string; site_id: string }) => fetchWithAuth('/labour/scan', { method: 'POST', body: JSON.stringify(data) }),
    generateSalary: (data: { start_date: string; end_date: string; site_id: string }) => fetchWithAuth('/labour/salary/generate', { method: 'POST', body: JSON.stringify(data) }),
  },
  clients: {
    getAll: (projectId?: string) => fetchWithAuth(`/clients/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/clients/', { method: 'POST', body: JSON.stringify(data) }),
    invite: (data: any) => fetchWithAuth('/clients/invite', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchWithAuth(`/clients/${id}`, { method: 'DELETE' }),
  },
  estimations: {
    generate: (data: any) => fetchWithAuth('/estimations/', { method: 'POST', body: JSON.stringify(data) }),
    getAll: () => fetchWithAuth('/estimations/'),
    predict: (data: any) => fetchWithAuth('/estimations/predict', { method: 'POST', body: JSON.stringify(data) }),
  },
  purchaseOrders: {
    create: (data: any) => fetchWithAuth('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: string) => fetchWithAuth(`/purchase-orders/${id}/approve`, { method: 'PATCH' }),
    reject: (id: string) => fetchWithAuth(`/purchase-orders/${id}/reject`, { method: 'PATCH' }),
    suggest: (id: string, data: any) => fetchWithAuth(`/purchase-orders/${id}/suggest`, { method: 'PATCH', body: JSON.stringify(data) }),
    deliver: (id: string) => fetchWithAuth(`/purchase-orders/${id}/deliver`, { method: 'PATCH' }),
    receive: (id: string) => fetchWithAuth(`/purchase-orders/${id}/receive`, { method: 'PATCH' }),
    checkLate: () => fetchWithAuth(`/purchase-orders/check-late`, { method: 'POST' }),
    uploadInvoice: (id: string, url: string) => fetchWithAuth(`/purchase-orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({ invoice_url: url }) })
  },
  reports: {
    projects: () => fetchWithAuth('/reports/projects'),
    materials: () => fetchWithAuth('/reports/materials'),
    payroll: () => fetchWithAuth('/reports/payroll'),
  },
  messages: {
    /** Send a message. Provide sender_role and receiver_role for multichannel routing. */
    send: (data: {
      project_id: string;
      sender_id: string;
      receiver_id: string;
      content: string;
      sender_role?: string;
      receiver_role?: string;
    }) => fetchWithAuth('/messages/', { method: 'POST', body: JSON.stringify(data) }),
    getByProject: (projectId: string, channel?: { senderRole?: string; receiverRole?: string }) =>
      fetchWithAuth(`/messages/${projectId}${channel ? `?sender_role=${channel.senderRole || ''}&receiver_role=${channel.receiverRole || ''}` : ''}`),
  },
  siteReports: {
    create: (data: any) => fetchWithAuth('/site-reports/', { method: 'POST', body: JSON.stringify(data) }),
    getByProject: (projectId: string) => fetchWithAuth(`/site-reports/${projectId}`),
  },
  notifications: {
    sendEmail: (data: any) => fetchWithAuth('/notifications/email/send', { method: 'POST', body: JSON.stringify(data) }),
    emailHealth: () => fetchWithAuth('/notifications/email/health'),
  }
};
