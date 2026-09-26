import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import { normalizeRole } from '../utils/auth';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const handleRoleRedirect = useCallback((userRole: string | null) => {
    if (!userRole) return;

    switch (userRole) {
      case 'admin':
        router.replace('/admin/dashboard');
        break;
      case 'pm':
        router.replace('/pm/dashboard');
        break;
      case 'site_manager':
        router.replace('/site-manager/dashboard');
        break;
      case 'client':
        router.replace('/client/dashboard');
        break;
      case 'worker':
        router.replace('/worker/dashboard');
        break;
      case 'supplier':
        router.replace('/supplier/dashboard');
        break;
      default:
        break;
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function getSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          if (mounted) setUser(session.user);
          
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
            
          if (data && mounted) {
            setProfile(data);
            setRole(normalizeRole(data.role));
          }
        }
      } catch (error) {
        console.warn('Auth check error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        if (mounted) setUser(session.user);
        
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
          
        if (data && mounted) {
          const normalizedRole = normalizeRole(data.role);
          setProfile(data);
          setRole(normalizedRole);
          handleRoleRedirect(normalizedRole);
        }
      } else {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setRole(null);
          router.replace('/login');
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleRoleRedirect, router]);

  return { user, profile, role, loading, handleRoleRedirect };
}
