import { supabase } from '../lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

const apiCache = new Map<string, { data: any, timestamp: number, promise?: Promise<any> }>();
const CACHE_TTL = 60000; // 60 seconds

async function executeFetch(endpoint: string, options: RequestInit) {
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
    let errMsg = 'API request failed';
    if (errorData.detail) {
       errMsg = typeof errorData.detail === 'string' 
         ? errorData.detail 
         : JSON.stringify(errorData.detail);
    } else if (errorData.message) {
       errMsg = errorData.message;
    }
    throw new Error(errMsg);
  }

  return response.json();
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();

  // On mutation (POST, PATCH, DELETE, PUT), clear the entire cache to ensure fresh data
  if (method !== 'GET') {
    apiCache.clear();
    return executeFetch(endpoint, options);
  }

  // Handle GET requests with cache
  const cached = apiCache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (cached.data) {
      return cached.data; // Return instantly, no buffering
    }
    if (cached.promise) {
      return cached.promise; // Wait for the in-flight request
    }
  }

  // No valid cache, fetch fresh
  const promise = executeFetch(endpoint, options).then(data => {
    apiCache.set(endpoint, { data, timestamp: Date.now() });
    return data;
  }).catch(err => {
    apiCache.delete(endpoint);
    throw err;
  });

  apiCache.set(endpoint, { data: null, timestamp: Date.now(), promise });
  return promise;
}

export const api = {
  // ----------------------------------------------------------------
  // Projects
  // ----------------------------------------------------------------
  projects: {
    getAll: () => fetchWithAuth('/projects/'),
    create: (data: any) => fetchWithAuth('/projects/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    bulkNames: (ids: string[]) => fetchWithAuth('/projects/bulk-names', { method: 'POST', body: JSON.stringify({ ids }) }),
    createMilestone: (projectId: string, data: any) => fetchWithAuth(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) }),
    updateMilestone: (projectId: string, milestoneId: string, data: any) => fetchWithAuth(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteMilestone: (projectId: string, milestoneId: string) => fetchWithAuth(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' }),
    /** Real financial model: committed, actual spend, remaining. */
    financials: (projectId: string) => fetchWithAuth(`/projects/${projectId}/financials`),
    expenses: (projectId: string) => fetchWithAuth(`/projects/${projectId}/expenses`),
    addExpense: (projectId: string, data: any) => fetchWithAuth(`/projects/${projectId}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------------
  // Materials
  // ----------------------------------------------------------------
  materials: {
    getAll: (projectId?: string) => fetchWithAuth(`/materials/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/materials/', { method: 'POST', body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------------
  // Labour / Attendance
  // ----------------------------------------------------------------
  labour: {
    /** Returns records from the canonical `labour` table (manual attendance). */
    getAll: (projectId?: string) => fetchWithAuth(`/labour/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/labour/', { method: 'POST', body: JSON.stringify(data) }),
    getPayroll: () => fetchWithAuth('/labour/payroll'),
    /** QR scan check-in / check-out via the `attendance` table. */
    scan: (data: { qr_code: string; site_id: string }) => fetchWithAuth('/labour/scan', { method: 'POST', body: JSON.stringify(data) }),
    generateSalary: (data: { start_date: string; end_date: string; site_id: string }) => fetchWithAuth('/labour/salary/generate', { method: 'POST', body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------------
  // AI / ML Cost Estimator  (replaces the removed estimations.predict)
  // ----------------------------------------------------------------
  ai: {
    /** Main cost prediction — loads the persisted RandomForest model. */
    predictCost: (data: {
      square_footage: number;
      location: string;
      project_type: string;
      quality_tier: string;
    }) => fetchWithAuth('/ai/predict-cost', { method: 'POST', body: JSON.stringify(data) }),
    /** Dashboard insights: feature importance, delay risk, project health. */
    insights: (pmId?: string) => fetchWithAuth(`/ai/insights${pmId ? `?pm_id=${pmId}` : ''}`),
    /** Model provenance: training date, dataset size, metrics. */
    modelInfo: () => fetchWithAuth('/ai/model-info'),
  },

  // ----------------------------------------------------------------
  // Estimations  (saved estimation records, NOT cost prediction)
  // ----------------------------------------------------------------
  estimations: {
    /** Save a completed estimate to the `estimations` history table. */
    save: (data: any) => fetchWithAuth('/estimations/', { method: 'POST', body: JSON.stringify(data) }),
    getAll: () => fetchWithAuth('/estimations/'),
  },

  // ----------------------------------------------------------------
  // Clients
  // ----------------------------------------------------------------
  clients: {
    getAll: (projectId?: string) => fetchWithAuth(`/clients/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/clients/', { method: 'POST', body: JSON.stringify(data) }),
    invite: (data: any) => fetchWithAuth('/clients/invite', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchWithAuth(`/clients/${id}`, { method: 'DELETE' }),
  },

  // ----------------------------------------------------------------
  // Purchase Orders
  // ----------------------------------------------------------------
  purchaseOrders: {
    getAll: (projectId?: string) => fetchWithAuth(`/purchase-orders${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    create: (data: any) => fetchWithAuth('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: string, data: any) => fetchWithAuth(`/purchase-orders/${id}/approve`, { method: 'PATCH', body: JSON.stringify(data) }),
    reject: (id: string) => fetchWithAuth(`/purchase-orders/${id}/reject`, { method: 'PATCH' }),
    suggest: (id: string, data: any) => fetchWithAuth(`/purchase-orders/${id}/suggest`, { method: 'PATCH', body: JSON.stringify(data) }),
    deliver: (id: string) => fetchWithAuth(`/purchase-orders/${id}/deliver`, { method: 'PATCH' }),
    receive: (id: string) => fetchWithAuth(`/purchase-orders/${id}/receive`, { method: 'PATCH' }),
    checkLate: () => fetchWithAuth(`/purchase-orders/check-late`, { method: 'POST' }),
    uploadInvoice: (id: string, url: string) => fetchWithAuth(`/purchase-orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({ invoice_url: url }) }),
  },

  // ----------------------------------------------------------------
  // Reports
  // ----------------------------------------------------------------
  reports: {
    projects: () => fetchWithAuth('/reports/projects'),
    materials: () => fetchWithAuth('/reports/materials'),
    payroll: () => fetchWithAuth('/reports/payroll'),
  },

  // ----------------------------------------------------------------
  // Messages (multichannel: client↔pm, client↔admin, client↔site_manager)
  // ----------------------------------------------------------------
  messages: {
    send: (data: {
      project_id: string;
      sender_id: string;
      receiver_id: string;
      content: string;
      sender_role?: string;
      receiver_role?: string;
    }) => fetchWithAuth('/messages/', { method: 'POST', body: JSON.stringify(data) }),
    getByProject: (
      projectId: string,
      channel?: { senderRole?: string; receiverRole?: string }
    ) => fetchWithAuth(
      `/messages/${projectId}${channel ? `?sender_role=${channel.senderRole || ''}&receiver_role=${channel.receiverRole || ''}` : ''}`
    ),
    markRead: (messageId: string) => fetchWithAuth(`/messages/${messageId}/read`, { method: 'PATCH' }),
  },

  // ----------------------------------------------------------------
  // Site Reports (site manager daily submissions)
  // ----------------------------------------------------------------
  siteReports: {
    create: (data: any) => fetchWithAuth('/site-reports/', { method: 'POST', body: JSON.stringify(data) }),
    getByProject: (projectId: string) => fetchWithAuth(`/site-reports/${projectId}`),
  },

  // ----------------------------------------------------------------
  // Notifications
  // ----------------------------------------------------------------
  notifications: {
    sendEmail: (data: any) => fetchWithAuth('/notifications/email/send', { method: 'POST', body: JSON.stringify(data) }),
    emailHealth: () => fetchWithAuth('/notifications/email/health'),
  },

  // ----------------------------------------------------------------
  // Admin — user management (approve suppliers, role changes, create users)
  // ----------------------------------------------------------------
  admin: {
    getUsers: () => fetchWithAuth('/admin/users'),
    updateRole: (userId: string, role: string) => fetchWithAuth(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    approveSupplier: (userId: string) => fetchWithAuth(`/admin/users/${userId}/approve`, { method: 'PATCH' }),
    createUser: (data: { email: string; password: string; full_name: string; role: string }) =>
      fetchWithAuth('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------------
  // Media / documents
  // ----------------------------------------------------------------
  media: {
    upload: (formData: FormData) => {
      // Note: do NOT set Content-Type here; browser sets it with boundary for multipart
      return supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token;
        return fetch(`${API_URL}/media/upload`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
        }).then(r => {
          if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Upload failed'); });
          return r.json();
        });
      });
    },
  },

  /** Raw fetch with auth — use when the above wrappers don't fit a specific call. */
  get: (path: string) => fetchWithAuth(path),
  post: (path: string, data: any) => fetchWithAuth(path, { method: 'POST', body: JSON.stringify(data) }),
};
