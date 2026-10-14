import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizeRole } from '../utils/auth';
import { getApiUrl } from '../lib/apiUrl';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: string | null;
  isLoading: boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  isLoading: true,
  isApproved: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let roleRequest = 0;
    let receivedAuthEvent = false;
    let prevUserId: string | null = null;

    const resolveSession = async (nextSession: Session | null) => {
      const requestId = ++roleRequest;

      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        prevUserId = null;
        if (mounted && requestId === roleRequest) {
          setRole(null);
          setIsApproved(true);
          setIsLoading(false);
        }
        return;
      }

      // Only show loading screen if the user has actually changed.
      // This prevents the app from unmounting and losing local form state 
      // when Supabase triggers a session refresh on window refocus.
      if (prevUserId !== nextSession.user.id) {
        setIsLoading(true);
      }
      prevUserId = nextSession.user.id;

      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const pendingRole = await AsyncStorage.getItem('pending_google_role');
        if (pendingRole) {
           await fetch(`${getApiUrl()}/auth/google-role`, {
              method: 'POST',
              headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${nextSession.access_token}`
              },
              body: JSON.stringify({ role: pendingRole })
           });
           await AsyncStorage.removeItem('pending_google_role');
           // Also update user metadata locally to reflect immediately
           nextSession.user.user_metadata = nextSession.user.user_metadata || {};
           nextSession.user.user_metadata.role = pendingRole;
        }
      } catch (e) {
        console.warn("Failed to sync google role", e);
      }

      try {
        const appMetaRole = (nextSession.user as any).app_metadata?.role;
        const userMetaRole = nextSession.user.user_metadata?.role;
        const metaRole = appMetaRole || userMetaRole;
        let resolvedRole = metaRole ? normalizeRole(metaRole) : null;
        let resolvedIsApproved = true;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, is_approved')
          .eq('id', nextSession.user.id)
          .single();
        if (!profileError && profile) {
          if (profile.role) resolvedRole = normalizeRole(profile.role);
          if (profile.is_approved !== undefined) resolvedIsApproved = profile.is_approved;
        }

        if (mounted && requestId === roleRequest) {
            setRole(resolvedRole);
            setIsApproved(resolvedIsApproved);
        }
      } catch (error) {
        console.error('Error fetching role:', error);
        if (mounted && requestId === roleRequest) {
            setRole(null);
            setIsApproved(true);
        }
      } finally {
        if (mounted && requestId === roleRequest) setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      // Release the auth lock before querying the database.
      setTimeout(() => { if (mounted) void resolveSession(nextSession); }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!receivedAuthEvent) void resolveSession(currentSession);
    }).catch((error) => {
      console.error('Could not restore session:', error);
      if (mounted && !receivedAuthEvent) void resolveSession(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, isLoading, isApproved, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
