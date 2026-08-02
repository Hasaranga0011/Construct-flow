import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
const isWebServer = Platform.OS === 'web' && typeof window === 'undefined';

// Safe storage adapter that won't crash during SSR
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(key, value);
      return;
    }
    AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(key);
      return;
    }
    AsyncStorage.removeItem(key);
  },
};

const createServerSafeSupabaseStub = () => {
  const emptyResponse = async () => ({ data: null, error: null });

  const createQueryStub = (): any => {
    const query: any = {};

    return new Proxy(query, {
      get(_target, property) {
        if (property === 'then') return undefined;
        if (property === 'catch' || property === 'finally') return undefined;
        if (property === 'select' || property === 'from') return createQueryStub;
        if (property === 'single' || property === 'maybeSingle') return emptyResponse;
        if (typeof property === 'string') {
          return (..._args: any[]) => createQueryStub();
        }
        return undefined;
      },
    });
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: emptyResponse,
      signInWithOAuth: emptyResponse,
      signUp: emptyResponse,
      resetPasswordForEmail: emptyResponse,
    },
    from: createQueryStub,
    channel: () => ({
      on: () => ({
        subscribe: () => ({ unsubscribe: () => {} })
      })
    }),
    removeChannel: emptyResponse,
    storage: {
      from: () => ({
        upload: emptyResponse,
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: emptyResponse,
      }),
    },
  };
};

export const supabase = isWebServer
  ? createServerSafeSupabaseStub()
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
