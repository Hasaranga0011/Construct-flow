import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { sessionStorage } from './sessionStorage';

import { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseUrl.trim()) {
  throw new Error(
    'Missing required environment variable: EXPO_PUBLIC_SUPABASE_URL. ' +
    'Please configure EXPO_PUBLIC_SUPABASE_URL in your .env or EAS environment variables.'
  );
}

if (!supabaseAnonKey || !supabaseAnonKey.trim()) {
  throw new Error(
    'Missing required environment variable: EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Please configure EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env or EAS environment variables.'
  );
}

const isWebServer = Platform.OS === 'web' && typeof window === 'undefined';

// Keep the same client API during SSR, without browser session work.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: !isWebServer,
    persistSession: !isWebServer,
    detectSessionInUrl: Platform.OS === 'web' && !isWebServer,
  },
});
