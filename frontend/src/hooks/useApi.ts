import { useState, useCallback, useRef, useEffect } from 'react';
import { getApiUrl } from '../lib/apiUrl';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T = any>() {
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: false, error: null });
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const request = useCallback(async (
    endpoint: string, 
    options: RequestInit = {}, 
    timeoutMs = 15000
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState(prev => ({ ...prev, loading: true, error: null }));

    const baseUrl = getApiUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Server error: ${response.status}`);
      }

      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : await response.blob();
      
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      let errorMessage = err.message || 'An unexpected error occurred.';
      if (err.name === 'AbortError') {
        errorMessage = 'Request timed out. Please check your connection and retry.';
      }
      
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw new Error(errorMessage);
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, request, reset };
}
