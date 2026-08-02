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
  attendance: {
    checkIn: (workerId: string, siteId: string) => fetchWithAuth('/attendance/checkin', { method: 'POST', body: JSON.stringify({ worker_id: workerId, site_id: siteId }) }),
    checkOut: (workerId: string) => fetchWithAuth('/attendance/checkout', { method: 'POST', body: JSON.stringify({ worker_id: workerId }) }),
    getToday: (siteId?: string) => fetchWithAuth(`/attendance/today${siteId ? `?site_id=${siteId}` : ''}`),
    getWorkerHistory: (workerId: string) => fetchWithAuth(`/attendance/worker/${workerId}`)
  },
  workers: {
    getAll: () => fetchWithAuth('/workers'),
    create: (data: any) => fetchWithAuth('/workers', { method: 'POST', body: JSON.stringify(data) }),
    generateQR: (workerId: string) => fetchWithAuth(`/workers/${workerId}/qr`, { method: 'POST' })
  },
  estimations: {
    generate: (data: any) => fetchWithAuth('/estimations', { method: 'POST', body: JSON.stringify(data) }),
    getAll: () => fetchWithAuth('/estimations'),
    sendToClient: (id: string) => fetchWithAuth(`/estimations/${id}/send`, { method: 'POST' })
  },
  materials: {
    getAll: () => fetchWithAuth('/materials'),
    getLowStock: () => fetchWithAuth('/materials/low-stock'),
    createRequest: (data: any) => fetchWithAuth('/materials/requests', { method: 'POST', body: JSON.stringify(data) }),
    updateRequest: (id: string, status: string) => fetchWithAuth(`/materials/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  purchaseOrders: {
    getAll: () => fetchWithAuth('/purchase-orders'),
    create: (data: any) => fetchWithAuth('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: string) => fetchWithAuth(`/purchase-orders/${id}/approve`, { method: 'PATCH' }),
    reject: (id: string) => fetchWithAuth(`/purchase-orders/${id}/reject`, { method: 'PATCH' }),
    suggest: (id: string, data: any) => fetchWithAuth(`/purchase-orders/${id}/suggest`, { method: 'PATCH', body: JSON.stringify(data) }),
    deliver: (id: string) => fetchWithAuth(`/purchase-orders/${id}/deliver`, { method: 'PATCH' }),
    checkLate: () => fetchWithAuth(`/purchase-orders/check-late`, { method: 'POST' }),
    uploadInvoice: (id: string, url: string) => fetchWithAuth(`/purchase-orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({ invoice_url: url }) })
  },
  notifications: {
    getAll: () => fetchWithAuth('/notifications'),
    markAllRead: () => fetchWithAuth('/notifications/read-all', { method: 'PATCH' }),
    markRead: (id: string) => fetchWithAuth(`/notifications/${id}/read`, { method: 'PATCH' })
  },
  insights: {
    get: () => fetchWithAuth('/insights')
  },
  payroll: {
    getAll: () => fetchWithAuth('/payroll'),
    generate: (month: number, year: number) => fetchWithAuth('/payroll/generate', { method: 'POST', body: JSON.stringify({ month, year }) }),
    approve: (id: string) => fetchWithAuth(`/payroll/${id}/approve`, { method: 'PATCH' }),
    markPaid: (id: string) => fetchWithAuth(`/payroll/${id}/paid`, { method: 'PATCH' })
  }
};
