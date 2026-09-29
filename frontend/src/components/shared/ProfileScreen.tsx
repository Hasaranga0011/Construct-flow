import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Animated, Platform, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useTheme } from '../../context/ThemeContext';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  company_name: string | null;
  contact_number: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

const roleConfig: Record<string, { color: string; bg: string; label: string }> = {
  admin: { color: '#F97316', bg: '#FFF7ED', label: 'Administrator' },
  'Super Admin': { color: '#F97316', bg: '#FFF7ED', label: 'Super Admin' },
  pm: { color: '#3B82F6', bg: '#EFF6FF', label: 'Project Manager' },
  'Project Manager': { color: '#3B82F6', bg: '#EFF6FF', label: 'Project Manager' },
  site_manager: { color: '#10B981', bg: '#ECFDF5', label: 'Site Manager' },
  'Site Manager': { color: '#10B981', bg: '#ECFDF5', label: 'Site Manager' },
  client: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Client' },
  Client: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Client' },
  supplier: { color: '#F59E0B', bg: '#FFFBEB', label: 'Supplier' },
  Supplier: { color: '#F59E0B', bg: '#FFFBEB', label: 'Supplier' },
  worker: { color: '#06B6D4', bg: '#ECFEFF', label: 'Worker' },
  Worker: { color: '#06B6D4', bg: '#ECFEFF', label: 'Worker' },
};

export default function ProfileScreen() {
  const { user, role } = useAuth();
  const { isDark } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const [form, setForm] = useState({
    full_name: '',
    contact_number: '',
    bio: '',
    company_name: '',
  });

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (data && isMounted) {
        setProfile(data);
        setForm({
          full_name: data.full_name || '',
          contact_number: data.contact_number || '',
          bio: data.bio || '',
          company_name: data.company_name || '',
        });
      }
      if (isMounted) setLoading(false);
    };

    fetchProfile();

    const channel = supabase
      .channel(`profile_screen:${user.id}:${Math.random()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${user.id}`
      }, (payload) => {
        if (isMounted) setProfile(payload.new as Profile);
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const handlePickAvatar = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        showToast('Permission to access photos is required.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64 || !user) return;

      setUploadingAvatar(true);

      // Decode base64 and upload
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/avatar.${fileExt}`;
      const contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(asset.base64), {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // cache bust

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
      showToast('Profile photo updated!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Upload failed.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update(form).eq('id', user.id);
      if (error) throw error;
      setProfile(prev => prev ? { ...prev, ...form } : null);
      setEditMode(false);
      showToast('Profile saved!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const rc = roleConfig[role || 'admin'] || roleConfig.admin;
  const displayName = profile?.full_name || form.full_name || user?.user_metadata?.full_name || 'Your Name';
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8F9FB', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={{ color: isDark ? '#64748B' : '#94A3B8', marginTop: 12, fontSize: 14 }}>Loading profile...</Text>
      </View>
    );
  }

  const bgTheme = isDark ? '#0F172A' : '#F8F9FB';
  const cardTheme = isDark ? '#1E293B' : 'white';
  const textTheme = isDark ? 'white' : '#0F172A';
  const textSubTheme = isDark ? '#94A3B8' : '#64748B';
  const borderTheme = isDark ? '#334155' : '#F1F5F9';
  const inputBg = isDark ? '#0F172A' : '#F8F9FB';

  return (
    <View style={{ flex: 1, backgroundColor: bgTheme }}>
      {/* Toast */}
      {toast && (
        <Animated.View style={{
          opacity: toastOpacity, position: 'absolute', bottom: 32,
          alignSelf: 'center', zIndex: 999
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingVertical: 13, borderRadius: 18,
            backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20,
          }}>
            <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color="white" />
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{toast.msg}</Text>
          </View>
        </Animated.View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 580, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 }}>

          {/* Hero Card */}
          <View style={{ backgroundColor: cardTheme, borderRadius: 28, overflow: 'hidden', marginBottom: 20, shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.06, shadowRadius: 20, borderWidth: 1, borderColor: borderTheme }}>
            <LinearGradient
              colors={['#0F172A', '#1E293B', '#334155']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ paddingTop: 44, paddingBottom: 60, alignItems: 'center', position: 'relative', overflow: 'hidden' }}
            >
              {/* Decorative circles */}
              <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: rc.color + '18' }} />
              <View style={{ position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: '#ffffff08' }} />

              {/* Avatar */}
              <Pressable onPress={handlePickAvatar} style={{ position: 'relative', marginBottom: 16 }}>
                <View style={{
                  width: 96, height: 96, borderRadius: 48,
                  borderWidth: 3, borderColor: rc.color + '70',
                  overflow: 'hidden', backgroundColor: rc.bg,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: rc.color, shadowOpacity: 0.4, shadowRadius: 16,
                }}>
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={{ width: 96, height: 96 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 34, fontWeight: '800', color: rc.color }}>{initials}</Text>
                  )}
                </View>
                {/* Upload indicator */}
                <View style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: rc.color, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#1E293B',
                }}>
                  {uploadingAvatar
                    ? <ActivityIndicator size="small" color="white" />
                    : <Ionicons name="camera" size={13} color="white" />
                  }
                </View>
              </Pressable>

              <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 12 }}>Tap photo to change</Text>
              <Text style={{ color: 'white', fontSize: 22, fontWeight: '800' }}>{displayName}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>{profile?.email || user?.email}</Text>
              <View style={{
                backgroundColor: rc.color + '25', borderColor: rc.color + '60', borderWidth: 1,
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 12
              }}>
                <Text style={{ color: rc.color, fontSize: 12, fontWeight: '700' }}>{rc.label}</Text>
              </View>
            </LinearGradient>

            {/* Stats Strip */}
            <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }}>
              {[
                { label: 'Role', value: rc.label.split(' ')[0], icon: 'shield-checkmark-outline' },
                { label: 'Joined', value: memberSince, icon: 'calendar-outline' },
                { label: 'Status', value: 'Active', icon: 'radio-button-on-outline' },
              ].map((s, i, arr) => (
                <View key={s.label} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 18,
                  borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: borderTheme
                }}>
                  <Ionicons name={s.icon as any} size={16} color={rc.color} />
                  <Text style={{ color: textSubTheme, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{s.label}</Text>
                  <Text style={{ color: textTheme, fontWeight: '700', fontSize: 12, marginTop: 2 }}>{s.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Info Card */}
          <View style={{ backgroundColor: cardTheme, borderRadius: 24, padding: 24, marginBottom: 20, shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 16, borderWidth: 1, borderColor: borderTheme }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: textTheme }}>Personal Information</Text>
                <Text style={{ fontSize: 12, color: textSubTheme, marginTop: 2 }}>
                  {editMode ? 'Editing — tap Save when done' : 'Tap Edit to update your details'}
                </Text>
              </View>
              {!editMode ? (
                <Pressable
                  onPress={() => setEditMode(true)}
                  style={{ backgroundColor: rc.bg, borderColor: rc.color + '40', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Ionicons name="pencil" size={13} color={rc.color} />
                  <Text style={{ color: rc.color, fontWeight: '700', fontSize: 13 }}>Edit</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => { setEditMode(false); setForm({ full_name: profile?.full_name || '', contact_number: profile?.contact_number || '', bio: profile?.bio || '', company_name: profile?.company_name || '' }); }}
                    style={{ backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: '#64748B', fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSave}
                    style={{ backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {saving ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="checkmark" size={14} color="white" />}
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{saving ? 'Saving...' : 'Save'}</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {[
              { label: 'Full Name', field: 'full_name', icon: 'person-outline', placeholder: 'Enter your full name' },
              { label: 'Phone Number', field: 'contact_number', icon: 'call-outline', placeholder: '+94 77 000 0000' },
              { label: 'Organization', field: 'company_name', icon: 'business-outline', placeholder: 'Company or firm name' },
            ].map(({ label, field, icon, placeholder }) => (
              <View key={field} style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: textSubTheme, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: editMode ? (isDark ? '#334155' : '#FAFBFF') : inputBg,
                  borderWidth: 1.5, borderColor: editMode ? rc.color + '50' : borderTheme,
                  borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
                }}>
                  <Ionicons name={icon as any} size={16} color={editMode ? rc.color : textSubTheme} />
                  <TextInput
                    style={{ flex: 1, marginLeft: 10, fontSize: 14, color: textTheme, fontWeight: '500', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                    value={form[field as keyof typeof form]}
                    onChangeText={v => setForm(p => ({ ...p, [field]: v }))}
                    placeholder={placeholder}
                    placeholderTextColor={textSubTheme}
                    editable={editMode}
                  />
                </View>
              </View>
            ))}

            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: textSubTheme, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Bio</Text>
              <View style={{
                backgroundColor: editMode ? (isDark ? '#334155' : '#FAFBFF') : inputBg,
                borderWidth: 1.5, borderColor: editMode ? rc.color + '50' : borderTheme,
                borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
              }}>
                <TextInput
                  style={{ fontSize: 14, color: textTheme, minHeight: 80, textAlignVertical: 'top', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  value={form.bio}
                  onChangeText={v => setForm(p => ({ ...p, bio: v }))}
                  placeholder="A short bio about yourself..."
                  placeholderTextColor={textSubTheme}
                  editable={editMode}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </View>

          {/* Account Details Card */}
          <View style={{ backgroundColor: cardTheme, borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 16, borderWidth: 1, borderColor: borderTheme }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: textTheme, marginBottom: 20 }}>Account Details</Text>
            {[
              { label: 'Email Address', value: profile?.email || user?.email || '—', icon: 'mail-outline', note: 'Read-only' },
              { label: 'User ID', value: (user?.id || '').slice(0, 18) + '...', icon: 'finger-print-outline', note: undefined },
              { label: 'Member Since', value: memberSince, icon: 'calendar-outline', note: undefined },
            ].map(({ label, value, icon, note }) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderTheme }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Ionicons name={icon as any} size={17} color={textSubTheme} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: textSubTheme, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                  <Text style={{ fontSize: 13, color: textTheme, fontWeight: '600', marginTop: 2 }}>{value}</Text>
                </View>
                {note && (
                  <View style={{ backgroundColor: borderTheme, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, color: textSubTheme, fontWeight: '600' }}>{note}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
