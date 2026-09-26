import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`
  };
}

export const api = {
  get: async (path: string) => {
    const res = await fetch(BASE_URL + path, { 
      headers: await getAuthHeaders() 
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  post: async (path: string, body: any) => {
    const res = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  patch: async (path: string, body: any) => {
    const res = await fetch(BASE_URL + path, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  put: async (path: string, body: any) => {
    const res = await fetch(BASE_URL + path, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  delete: async (path: string) => {
    const res = await fetch(BASE_URL + path, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};
