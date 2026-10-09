import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Switch, Animated, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { LogoutConfirmationModal } from '../common/LogoutConfirmationModal';

const roleConfig: Record<string, { color: string; label: string }> = {
  admin: { color: '#F97316', label: 'Administrator' },
  'Super Admin': { color: '#F97316', label: 'Super Admin' },
  pm: { color: '#3B82F6', label: 'Project Manager' },
  'Project Manager': { color: '#3B82F6', label: 'Project Manager' },
  site_manager: { color: '#10B981', label: 'Site Manager' },
  'Site Manager': { color: '#10B981', label: 'Site Manager' },
  client: { color: '#8B5CF6', label: 'Client' },
  Client: { color: '#8B5CF6', label: 'Client' },
  supplier: { color: '#F59E0B', label: 'Supplier' },
  Supplier: { color: '#F59E0B', label: 'Supplier' },
  worker: { color: '#06B6D4', label: 'Worker' },
  Worker: { color: '#06B6D4', label: 'Worker' },
};

export default function SettingsScreen({ profileHref, showNotificationPreferences = true }: { profileHref?: string; showNotificationPreferences?: boolean }) {
  const { user, role, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const [prefs, setPrefs] = useState({
    email_notifs: true,
    sms_alerts: false,
    low_stock_alerts: true,
    project_updates: true,
    report_emails: false,
  });

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastColors = { success: '#10B981', error: '#EF4444', info: '#3B82F6' };

  const showToast = (msg: string, type: 'success' | 'error' | 'info') => {
    setToast({ msg, type });
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    supabase.from('profiles').select('full_name, email, avatar_url').eq('id', user.id).single()
      .then(({ data }) => { if (data && isMounted) setProfile(data); });

    const channel = supabase
      .channel(`settings_screen:${user.id}:${Math.random()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${user.id}`
      }, (payload) => {
        if (isMounted) setProfile((prev: any) => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [user]);

  const rc = roleConfig[role || 'admin'] || roleConfig.admin;
  const initials = (profile?.full_name || user?.user_metadata?.full_name || user?.email || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  const handlePasswordReset = async () => {
    const email = profile?.email || user?.email;
    if (!email || passwordLoading) return;
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, typeof window !== 'undefined' ? { redirectTo: `${window.location.origin}/reset-password` } : undefined);
      if (error) throw error;
      showToast(`Reset link sent to ${email}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to send reset email', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const completeSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login' as any);
    } catch { setSigningOut(false); }
  };

  const handleSignOut = () => {
    setLogoutModalVisible(true);
  };

  // Shared Card primitive style
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="mb-6">
      <Text maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 px-2">
        {title}
      </Text>
      <View className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 overflow-hidden shadow-sm">
        {children}
      </View>
    </View>
  );

  const ToggleRow = ({ icon, iconBg, iconColor, title, subtitle, value, onToggle }: any) => (
    <View className="flex-row items-center px-4 py-4 border-b border-gray-100 dark:border-slate-700">
      <View className="w-10 h-10 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: isDark ? '#334155' : iconBg }}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View className="flex-1 min-w-0 pr-4">
        <Text maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{title}</Text>
        <Text maxFontSizeMultiplier={1.3} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E2E8F0', true: rc.color + '80' }}
        thumbColor={value ? rc.color : '#CBD5E1'}
        ios_backgroundColor="#E2E8F0"
      />
    </View>
  );

  const ActionRow = ({ icon, iconBg, iconColor, title, subtitle, onPress, loading = false }: any) => (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-4 border-b border-gray-100 dark:border-slate-700 active:bg-slate-50 dark:active:bg-slate-700 transition-colors"
      style={{ minHeight: 48 }}
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: isDark ? '#334155' : iconBg }}>
        {loading ? <ActivityIndicator size="small" color={iconColor} /> : <Ionicons name={icon} size={18} color={iconColor} />}
      </View>
      <View className="flex-1 min-w-0 pr-4">
        <Text maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{title}</Text>
        {subtitle && <Text maxFontSizeMultiplier={1.3} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
    </Pressable>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <LogoutConfirmationModal
        visible={logoutModalVisible}
        isDark={isDark}
        onCancel={() => setLogoutModalVisible(false)}
        onConfirm={() => { setLogoutModalVisible(false); void completeSignOut(); }}
      />
      {/* Toast */}
      {toast && (
        <Animated.View style={{ opacity: toastOpacity, position: 'absolute', bottom: 32, alignSelf: 'center', zIndex: 999 }}>
          <View className="flex-row items-center gap-2.5 px-5 py-3.5 rounded-2xl shadow-xl" style={{ backgroundColor: toastColors[toast.type] }}>
            <Ionicons
              name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'alert-circle' : 'information-circle'}
              size={18} color="white"
            />
            <Text maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">{toast.msg}</Text>
          </View>
        </Animated.View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className="flex-1">
        <View className="w-full max-w-3xl mx-auto px-4 md:px-8 pt-8 pb-16">

          {/* Account Hero */}
          <LinearGradient
            colors={['#0F172A', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            className="rounded-3xl mb-8 overflow-hidden shadow-md"
          >
            <View style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: rc.color + '15', pointerEvents: 'none' }} />
            <View className="p-6 md:p-8 flex-row items-center flex-wrap gap-4">
              <View className="w-16 h-16 rounded-full items-center justify-center border-2 overflow-hidden flex-shrink-0"
                style={{ backgroundColor: rc.color + '25', borderColor: rc.color + '50' }}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <Text maxFontSizeMultiplier={1.3} className="text-xl font-extrabold" style={{ color: rc.color }}>{initials}</Text>
                )}
              </View>
              <View className="flex-1 min-w-[200px]">
                <Text maxFontSizeMultiplier={1.3} className="text-white text-xl font-extrabold" numberOfLines={1}>{profile?.full_name || user?.user_metadata?.full_name || 'Your Name'}</Text>
                <Text maxFontSizeMultiplier={1.3} className="text-slate-400 text-sm mt-0.5" numberOfLines={1}>{profile?.email || user?.email}</Text>
                <View className="self-start mt-2.5 rounded-lg px-3 py-1 border"
                  style={{ backgroundColor: rc.color + '25', borderColor: rc.color + '50' }}>
                  <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold" style={{ color: rc.color }}>{rc.label}</Text>
                </View>
              </View>
              {profileHref && (
                <Pressable
                  onPress={() => router.push(profileHref as any)}
                  className="bg-white/10 rounded-xl px-4 py-2.5 border border-white/20 active:bg-white/20 transition-colors w-full md:w-auto items-center"
                  style={{ minHeight: 44 }}
                >
                  <Text maxFontSizeMultiplier={1.3} className="text-white text-sm font-semibold">Edit Profile</Text>
                </Pressable>
              )}
            </View>
          </LinearGradient>

          {/* Appearance */}
          <Section title="Appearance">
            <View className="flex-row items-center px-4 py-4">
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color={isDark ? '#818CF8' : '#F59E0B'} />
              </View>
              <View className="flex-1 min-w-0 pr-4">
                <Text maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-slate-900 dark:text-white" numberOfLines={1}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                  {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => { toggleTheme(); showToast(isDark ? 'Switched to Light Mode' : 'Switched to Dark Mode', 'info'); }}
                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                thumbColor={isDark ? '#6366F1' : '#CBD5E1'}
                ios_backgroundColor="#E2E8F0"
              />
            </View>
          </Section>

          {/* Notifications */}
          {showNotificationPreferences && <Section title="Notifications">
            <ToggleRow icon="mail-outline" iconBg="#EFF6FF" iconColor="#3B82F6"
              title="Email Notifications" subtitle="Receive updates via email"
              value={prefs.email_notifs} onToggle={() => { setPrefs(p => ({ ...p, email_notifs: !p.email_notifs })); showToast('Preference updated', 'info'); }} />
            <ToggleRow icon="phone-portrait-outline" iconBg="#F0FDF4" iconColor="#22C55E"
              title="SMS Alerts" subtitle="Urgent text messages to your phone"
              value={prefs.sms_alerts} onToggle={() => { setPrefs(p => ({ ...p, sms_alerts: !p.sms_alerts })); showToast('Preference updated', 'info'); }} />
            <ToggleRow icon="warning-outline" iconBg="#FFFBEB" iconColor="#F59E0B"
              title="Low Stock Alerts" subtitle="Notify when materials run low"
              value={prefs.low_stock_alerts} onToggle={() => { setPrefs(p => ({ ...p, low_stock_alerts: !p.low_stock_alerts })); showToast('Preference updated', 'info'); }} />
            <ToggleRow icon="construct-outline" iconBg="#FFF7ED" iconColor="#F97316"
              title="Project Updates" subtitle="Status changes and milestone alerts"
              value={prefs.project_updates} onToggle={() => { setPrefs(p => ({ ...p, project_updates: !p.project_updates })); showToast('Preference updated', 'info'); }} />
            <ToggleRow icon="document-text-outline" iconBg="#F5F3FF" iconColor="#8B5CF6"
              title="Weekly Reports" subtitle="Auto-send summary every Monday"
              value={prefs.report_emails} onToggle={() => { setPrefs(p => ({ ...p, report_emails: !p.report_emails })); showToast('Preference updated', 'info'); }} />
          </Section>}

          {/* Security */}
          <Section title="Security">
            {profileHref && (
              <ActionRow icon="person-outline" iconBg="#EFF6FF" iconColor="#3B82F6"
                title="Edit Profile" subtitle="Update name, photo, contact"
                onPress={() => router.push(profileHref as any)} />
            )}
            <ActionRow icon="key-outline" iconBg="#F5F3FF" iconColor="#8B5CF6"
              title="Change Password" subtitle="Send a password reset link to your email"
              onPress={handlePasswordReset} loading={passwordLoading} />
          </Section>

          {/* About */}
          <Section title="About">
            {[
              { label: 'App Version', value: '1.0.0' },
              { label: 'Environment', value: 'Production' },
              { label: 'Theme', value: isDark ? 'Dark' : 'Light' },
              { label: 'Role', value: rc.label },
            ].map(({ label, value }, i, arr) => (
              <View key={label} className={`flex-row justify-between items-center px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100 dark:border-slate-700' : ''}`}>
                <Text maxFontSizeMultiplier={1.3} className="text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>{label}</Text>
                <Text maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{value}</Text>
              </View>
            ))}
          </Section>

          {/* Sign Out */}
          <Section title="Danger Zone">
            <Pressable
              onPress={handleSignOut}
              className="flex-row items-center justify-center gap-2.5 py-4 active:bg-red-50 dark:active:bg-red-900/20 transition-colors"
              style={{ minHeight: 48 }}
            >
              {signingOut ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="log-out-outline" size={20} color="#EF4444" />}
              <Text maxFontSizeMultiplier={1.3} className="text-red-500 font-bold text-base">
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </Text>
            </Pressable>
          </Section>

        </View>
      </ScrollView>
    </View>
  );
}
