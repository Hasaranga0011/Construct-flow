import { getApiUrl } from './apiUrl';
import { supabase } from './supabase';


async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`
  };
}

async function fetchWithTimeout(path: string, options: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(getApiUrl() + path, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `API error: ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection.');
    }
    throw err;
  }
}

export const api = {
  get: async (path: string) => {
    return fetchWithTimeout(path, { headers: await getAuthHeaders() });
  },
  post: async (path: string, body: any) => {
    return fetchWithTimeout(path, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  },
  patch: async (path: string, body: any) => {
    return fetchWithTimeout(path, { method: 'PATCH', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  },
  put: async (path: string, body: any) => {
    return fetchWithTimeout(path, { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  },
  delete: async (path: string) => {
    return fetchWithTimeout(path, { method: 'DELETE', headers: await getAuthHeaders() });
  }
};
