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

  const bgTheme = isDark ? '#0F172A' : '#F8F9FB';
  const cardTheme = isDark ? '#1E293B' : 'white';
  const textTheme = isDark ? 'white' : '#0F172A';
  const textSubTheme = isDark ? '#94A3B8' : '#64748B';
  const borderTheme = isDark ? '#334155' : '#F1F5F9';
  const inputBg = isDark ? '#0F172A' : '#F8F9FB';

  // Section wrapper
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: 16 }}>
      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 11, fontWeight: '700', color: textSubTheme, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 4 }]}>{title}</Text>
      <View style={{ backgroundColor: cardTheme, borderRadius: 20, borderWidth: 1, borderColor: borderTheme, overflow: 'hidden', shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 12 }}>
        {children}
      </View>
    </View>
  );

  const ToggleRow = ({ icon, iconBg, iconColor, title, subtitle, value, onToggle }: any) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderTheme }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#334155' : iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 14, fontWeight: '600', color: textTheme }]}>{title}</Text>
        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 12, color: textSubTheme, marginTop: 1 }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E2E8F0', true: rc.color + '50' }}
        thumbColor={value ? rc.color : '#CBD5E1'}
        ios_backgroundColor="#E2E8F0"
      />
    </View>
  );

  const ActionRow = ({ icon, iconBg, iconColor, title, subtitle, onPress, loading = false }: any) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [({
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: borderTheme,
        backgroundColor: pressed ? (isDark ? '#334155' : '#F8F9FB') : 'transparent',
      }), { minHeight: 44, minWidth: 44 }]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#334155' : iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        {loading ? <ActivityIndicator size="small" color={iconColor} /> : <Ionicons name={icon} size={17} color={iconColor} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 14, fontWeight: '600', color: textTheme }]}>{title}</Text>
        {subtitle && <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 12, color: textSubTheme, marginTop: 1 }]}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={textSubTheme} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bgTheme }}>
      <LogoutConfirmationModal
        visible={logoutModalVisible}
        isDark={isDark}
        onCancel={() => setLogoutModalVisible(false)}
        onConfirm={() => { setLogoutModalVisible(false); void completeSignOut(); }}
      />
      {/* Toast */}
      {toast && (
        <Animated.View style={{ opacity: toastOpacity, position: 'absolute', bottom: 32, alignSelf: 'center', zIndex: 999 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingVertical: 13, borderRadius: 18,
            backgroundColor: toastColors[toast.type],
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20
          }}>
            <Ionicons
              name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'alert-circle' : 'information-circle'}
              size={18} color="white"
            />
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'white', fontWeight: '700', fontSize: 13 }]}>{toast.msg}</Text>
          </View>
        </Animated.View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 580, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48 }}>

          {/* Account Hero */}
          <LinearGradient
            colors={['#0F172A', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, marginBottom: 20, overflow: 'hidden' }}
          >
            <View style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: rc.color + '15' }} />
            <View style={{ padding: 24, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 60, height: 60, borderRadius: 30,
                backgroundColor: rc.color + '25', borderWidth: 2, borderColor: rc.color + '50',
                alignItems: 'center', justifyContent: 'center', marginRight: 16,
                overflow: 'hidden',
              }}>
                {profile?.avatar_url ? (
                  <View style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden' }}>
                    <Image source={{ uri: profile.avatar_url }} style={{ width: 60, height: 60 }} resizeMode="cover" />
                  </View>
                ) : (
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: rc.color, fontSize: 22, fontWeight: '800' }]}>{initials}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'white', fontSize: 17, fontWeight: '800' }]}>{profile?.full_name || user?.user_metadata?.full_name || 'Your Name'}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#94A3B8', fontSize: 12, marginTop: 2 }]}>{profile?.email || user?.email}</Text>
                <View style={{
                  alignSelf: 'flex-start', marginTop: 8, borderRadius: 10,
                  backgroundColor: rc.color + '25', borderWidth: 1, borderColor: rc.color + '50',
                  paddingHorizontal: 10, paddingVertical: 3,
                }}>
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: rc.color, fontSize: 11, fontWeight: '700' }]}>{rc.label}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => profileHref ? router.push(profileHref as any) : null}
                style={[{ backgroundColor: '#ffffff15', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#ffffff20' }, { minHeight: 44, minWidth: 44 }]}
              >
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'white', fontSize: 12, fontWeight: '600' }]}>Edit Profile</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {/* Appearance */}
          <Section title="Appearance">
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={17} color={isDark ? '#818CF8' : '#F59E0B'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 14, fontWeight: '600', color: '#0F172A' }]}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 12, color: '#94A3B8', marginTop: 1 }]}>
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
              <View key={label} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 13,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: borderTheme,
              }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 14, color: textSubTheme }]}>{label}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 14, fontWeight: '600', color: textTheme }]}>{value}</Text>
              </View>
            ))}
          </Section>

          {/* Sign Out */}
          <Section title="Danger Zone">
            <Pressable
              onPress={handleSignOut}
              style={({ pressed }) => [({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                paddingVertical: 18, backgroundColor: pressed ? (isDark ? '#7F1D1D' : '#FEF2F2') : 'transparent',
              }), { minHeight: 44, minWidth: 44 }]}
            >
              {signingOut ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="log-out-outline" size={20} color="#EF4444" />}
              <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#EF4444', fontWeight: '700', fontSize: 15 }]}>
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </Text>
            </Pressable>
          </Section>

        </View>
      </ScrollView>
    </View>
  );
}
