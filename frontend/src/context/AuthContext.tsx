import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizeRole } from '../utils/auth';
import { getApiUrl } from '../lib/apiUrl';
import { consumeLoginPortal, portalAccessError } from '../lib/loginPortal';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: string | null;
  avatarUrl: string | null;
  fullName: string | null;
  isLoading: boolean;
  isApproved: boolean;
  /** Set when an account was rejected by the Team/Partner login portal gate. */
  portalError: string | null;
  clearPortalError: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  avatarUrl: null,
  fullName: null,
  isLoading: true,
  isApproved: true,
  portalError: null,
  clearPortalError: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);
  const clearPortalError = () => setPortalError(null);

  const fetchProfileDetails = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_approved, avatar_url, full_name')
        .eq('id', userId)
        .single();
      if (profile) {
        if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
        if (profile.full_name) setFullName(profile.full_name);
        if (profile.role) setRole(normalizeRole(profile.role));
        if (profile.is_approved !== undefined && profile.is_approved !== null) setIsApproved(Boolean(profile.is_approved));
      }
    } catch (e) {
      console.warn('Error fetching profile details:', e);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfileDetails(user.id);
    }
  };

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
          setAvatarUrl(null);
          setFullName(null);
          setIsApproved(true);
          setIsLoading(false);
        }
        return;
      }

      const isSameUser = prevUserId === nextSession.user.id;
      // Only show loading screen if the user has actually changed.
      // This prevents the app from unmounting and losing local form state 
      // when Supabase triggers a session refresh on window refocus.
      if (!isSameUser) {
        setIsLoading(true);
      }
      prevUserId = nextSession.user.id;

      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const [pendingRole, hasLoginPortal] = await Promise.all([
        AsyncStorage.getItem('pending_google_role').catch(() => null),
        AsyncStorage.getItem('login_portal').catch(() => null),
      ]);

      if (pendingRole) {
        try {
           await fetch(`${getApiUrl()}/auth/google-role`, {
              method: 'POST',
              headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${nextSession.access_token}`
              },
              body: JSON.stringify({ role: pendingRole })
           });
           await AsyncStorage.removeItem('pending_google_role');
           // The backend only assigns this role to brand-new (pending) accounts;
           // the authoritative role is read from `profiles` below.
        } catch (e) {
          console.warn("Failed to sync google role", e);
        }
      }

      // Fast path: on token refresh/window refocus for the same user without a pending portal check,
      // skip redundant profile fetch so UI never stalls.
      if (isSameUser && !pendingRole && !hasLoginPortal) {
        if (mounted && requestId === roleRequest) setIsLoading(false);
        return;
      }

      try {
        const appMetaRole = (nextSession.user as any).app_metadata?.role;
        const userMetaRole = nextSession.user.user_metadata?.role;
        const metaRole = appMetaRole || userMetaRole;
        let resolvedRole = metaRole ? normalizeRole(metaRole) : null;
        let resolvedIsApproved = true;
        let resolvedAvatarUrl = (nextSession.user.user_metadata as any)?.avatar_url || null;
        let resolvedFullName = (nextSession.user.user_metadata as any)?.full_name || null;

        // Fast startup: if we already have a role from metadata and no portal gate or Google role sync is pending,
        // unblock the UI immediately and refresh the profile in the background.
        if (resolvedRole && !pendingRole && !hasLoginPortal) {
          if (mounted && requestId === roleRequest) {
            setRole(resolvedRole);
            setIsApproved(resolvedIsApproved);
            setAvatarUrl(resolvedAvatarUrl);
            setFullName(resolvedFullName);
            setIsLoading(false);
          }
          void fetchProfileDetails(nextSession.user.id);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, is_approved, avatar_url, full_name')
          .eq('id', nextSession.user.id)
          .single();
        if (!profileError && profile) {
          if (profile.role) resolvedRole = normalizeRole(profile.role);
          if (profile.is_approved !== undefined && profile.is_approved !== null) resolvedIsApproved = Boolean(profile.is_approved);
          if (profile.avatar_url) resolvedAvatarUrl = profile.avatar_url;
          if (profile.full_name) resolvedFullName = profile.full_name;
        }

        // Portal gate: Team Login only admits team roles, Partner Login only partner roles.
        const loginPortal = await consumeLoginPortal();
        const gateError = loginPortal ? portalAccessError(loginPortal, resolvedRole) : null;
        if (gateError) {
          if (mounted) {
            setPortalError(gateError);
            // Drop the session from state right away so the layout never routes to a dashboard.
            setSession(null);
            setUser(null);
            setRole(null);
          }
          // Signing out fires onAuthStateChange(null), which clears the session state.
          await supabase.auth.signOut();
          return;
        }

        if (mounted && requestId === roleRequest) {
            setRole(resolvedRole);
            setIsApproved(resolvedIsApproved);
            setAvatarUrl(resolvedAvatarUrl);
            setFullName(resolvedFullName);
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
    <AuthContext.Provider value={{ session, user, role, avatarUrl, fullName, isLoading, isApproved, portalError, clearPortalError, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
