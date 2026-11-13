import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { getApiUrl } from '../../../lib/apiUrl';
import { toast } from '../../../lib/toast';
import { confirmAction } from '../../../utils/notify';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SearchInput } from '@/components/common/SearchInput';
import { useResponsive } from '../../../hooks/useResponsive';
import { FilterChipGrid } from '@/components/common/FilterChipGrid';
import { roleLabel } from '../../../utils/roles';
import { RoleAvatar } from '@/components/common/RoleAvatar';

export default function AdminUsersList() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { isMobile } = useResponsive();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    // @ts-ignore
    const sub = supabase.channel('profiles-changes')
      // @ts-ignore
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 600);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(sub as any);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, is_approved, avatar_url, contact_number, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted) setUsers(data || []);
      } catch (err) {
        console.error('Error fetching users', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUsers();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleApproveUser = async (userId: string, fullName?: string) => {
    setApprovingId(userId);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`${getApiUrl()}/admin/users/${userId}/approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to approve user');
      }

      // Optimistic state update
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_approved: true } : u)));
      toast.success(`${fullName || 'User'} approved successfully!`);
    } catch (err: any) {
      toast.error(err.message || 'Could not approve user');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectUser = async (userId: string, fullName?: string) => {
    const confirmed = await confirmAction(
      'Reject Pending User',
      `Are you sure you want to reject and remove ${fullName || 'this user'}? This cannot be undone.`
    );
    if (!confirmed) return;

    setRejectingId(userId);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`${getApiUrl()}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to reject user');
      }

      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success(`${fullName || 'User'} rejected and removed.`);
    } catch (err: any) {
      toast.error(err.message || 'Could not reject user');
    } finally {
      setRejectingId(null);
    }
  };

  const pendingCount = useMemo(
    () => users.filter(u => u.is_approved === false).length,
    [users]
  );

  const roles = ['All', 'pending', 'admin', 'pm', 'site_manager', 'client', 'supplier', 'worker'];

  const formatRoleDisplay = (role: string) => {
    if (role === 'All') return 'All';
    if (role === 'pending') return pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending';
    return roleLabel(role);
  };

  const getRoleColor = (role: string) => {
    if (role === 'admin' || role === 'super_admin') return { bg: 'bg-red-50', text: 'text-red-700' };
    if (role === 'pm') return { bg: 'bg-purple-50', text: 'text-purple-700' };
    if (role === 'site_manager') return { bg: 'bg-blue-50', text: 'text-blue-700' };
    if (role === 'worker') return { bg: 'bg-orange-50', text: 'text-orange-700' };
    if (role === 'client') return { bg: 'bg-emerald-50', text: 'text-emerald-700' };
    if (role === 'supplier') return { bg: 'bg-pink-50', text: 'text-pink-700' };
    return { bg: 'bg-gray-100', text: 'text-gray-700' };
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(row => {
      if (roleFilter === 'pending') {
        if (row.is_approved !== false) return false;
      } else if (roleFilter !== 'All') {
        const r = String(row.role || '').toLowerCase();
        if (roleFilter === 'admin') {
          if (r !== 'admin' && r !== 'super_admin') return false;
        } else if (r !== roleFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        String(row.full_name || '').toLowerCase().includes(q) ||
        String(row.email || '').toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, search]);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col min-h-0 overflow-hidden">
        <TopNav title="Users Directory" actionLabel="+ New User" onActionPress={() => router.push('/admin/users/create')} />

        <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'px-8 py-6'}`} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'column', marginBottom: 20, gap: 16, zIndex: 50, elevation: 50 }}>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 0 }}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Users</Text>

              <SearchInput items={users} entityLabel="users"
                placeholder="Search users..."
                value={search}
                onChangeText={setSearch}
                className={isMobile ? "w-full" : "w-80"}
                config={{
                  table: 'profiles',
                  searchColumn: 'full_name',
                  secondaryColumn: 'email',
                  titleColumn: 'full_name',
                  subtitleColumn: 'email',
                  routePrefix: '/admin/users/'
                }}
              />
            </View>

            <FilterChipGrid
              options={roles.map(r => ({ id: r, label: formatRoleDisplay(r) }))}
              selectedValue={roleFilter}
              onSelect={setRoleFilter}
            />
          </View>

          {/* Pending Approvals Banner */}
          {pendingCount > 0 && roleFilter !== 'pending' && (
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-row items-center flex-1 min-w-[200px]">
                <View className="w-9 h-9 rounded-lg bg-amber-100 items-center justify-center mr-3">
                  <Ionicons name="time-outline" size={20} color="#D97706" />
                </View>
                <View className="flex-1">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-amber-900">
                    {pendingCount} {pendingCount === 1 ? 'user' : 'users'} awaiting approval
                  </Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-amber-700">
                    Review and approve pending accounts to grant portal access.
                  </Text>
                </View>
              </View>
              <Pressable
                style={{ minHeight: 38 }}
                onPress={() => setRoleFilter('pending')}
                className="bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg transition-colors"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">
                  View Pending ({pendingCount})
                </Text>
              </Pressable>
            </View>
          )}

          <View className={`bg-white shadow-sm border border-gray-100 min-h-[400px] ${isMobile ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-xl p-6'}`}>
            {!isMobile && (
              <View className="flex-row py-3 border-b border-gray-200 pr-2">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[28%] text-xs font-semibold text-gray-500 uppercase">User</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[18%] text-xs font-semibold text-gray-500 uppercase">Role</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[24%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
              </View>
            )}

            {loading ? (
              <View className="py-20 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : filteredRows.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">
                  {roleFilter === 'pending' ? 'No pending users awaiting approval.' : 'No users found.'}
                </Text>
              </View>
            ) : isMobile ? (
              filteredRows.map(u => {
                const colors = getRoleColor(u.role);
                const isPending = u.is_approved === false;
                const isApproving = approvingId === u.id;
                const isRejecting = rejectingId === u.id;
                const isBusy = isApproving || isRejecting;
                return (
                  <View key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm w-full overflow-hidden">
                    <View className="flex-row items-start flex-wrap mb-3 gap-y-2">
                      <View className="flex-row items-center flex-1 min-w-[200px] pr-2">
                        <RoleAvatar
                          size="md"
                          avatarUrl={u.avatar_url}
                          role={u.role}
                          name={u.full_name}
                          showRoleBadge
                          className="mr-3 shrink-0"
                        />
                        <View className="flex-1 min-w-0">
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">{u.full_name || 'Unnamed User'}</Text>
                          <Text numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-medium">{u.email}</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        {isPending && (
                          <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                            <Text className="text-[10px] font-bold uppercase text-amber-700">Pending</Text>
                          </View>
                        )}
                        <View className={`px-3 py-1 rounded-full ${colors.bg} shrink-0 self-start`}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold uppercase ${colors.text}`}>
                            {formatRoleDisplay(u.role)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-row items-center mb-4 pl-[52px]">
                      <Ionicons name="call-outline" size={14} color="#6B7280" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs ml-2 shrink-0">{u.contact_number || u.phone || 'No phone'}</Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {isPending && (
                        <>
                          <Pressable
                            style={{ minHeight: 44 }}
                            disabled={isBusy}
                            onPress={() => handleApproveUser(u.id, u.full_name)}
                            className="flex-1 min-w-[100px] bg-emerald-600 py-2.5 rounded-lg items-center justify-center flex-row"
                          >
                            {isApproving ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-sm font-bold ml-1.5">Approve</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            style={{ minHeight: 44 }}
                            disabled={isBusy}
                            onPress={() => handleRejectUser(u.id, u.full_name)}
                            className="flex-1 min-w-[100px] bg-red-50 border border-red-200 py-2.5 rounded-lg items-center justify-center flex-row"
                          >
                            {isRejecting ? (
                              <ActivityIndicator size="small" color="#DC2626" />
                            ) : (
                              <>
                                <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm font-bold ml-1.5">Reject</Text>
                              </>
                            )}
                          </Pressable>
                        </>
                      )}
                      <Pressable style={{ minHeight: 44, minWidth: 44 }}
                        // @ts-ignore
                        onPress={() => router.push(`/admin/users/${u.id}`)}
                        className="flex-1 min-w-[100px] bg-gray-50 border border-gray-200 py-2.5 rounded-lg items-center justify-center"
                      >
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-sm font-semibold">Edit User</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              filteredRows.map(u => {
                const isPending = u.is_approved === false;
                const isApproving = approvingId === u.id;
                const isRejecting = rejectingId === u.id;
                const isBusy = isApproving || isRejecting;
                return (
                  <View key={u.id} className="flex-row items-center py-4 border-b border-gray-100">
                    <View className="w-[28%] flex-row items-center pr-4">
                      <RoleAvatar
                        size="sm"
                        avatarUrl={u.avatar_url}
                        role={u.role}
                        name={u.full_name}
                        showRoleBadge
                        className="mr-3 shrink-0"
                      />
                      <View className="flex-1 min-w-0">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">{u.full_name || 'Unnamed User'}</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">ID: {u.id.slice(0, 8)}...</Text>
                      </View>
                    </View>

                    <View className="w-[18%] pr-2">
                      <View className={`px-2 py-1 rounded self-start ${getRoleColor(u.role).bg}`}>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${getRoleColor(u.role).text}`}>{formatRoleDisplay(u.role)}</Text>
                      </View>
                    </View>

                    <View className="w-[24%] pr-2">
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{u.email || u.contact_number || 'Database Linked'}</Text>
                    </View>

                    <View className="w-[12%]">
                      <View className={`px-2.5 py-0.5 rounded-full self-start ${isPending ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[11px] font-bold ${isPending ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {isPending ? 'Pending' : 'Active'}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-1 flex-row justify-end items-center gap-2 pl-1">
                      {isPending && (
                        <>
                          <Pressable
                            style={{ minHeight: 36 }}
                            disabled={isBusy}
                            onPress={() => handleApproveUser(u.id, u.full_name)}
                            className="bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md flex-row items-center transition-colors"
                          >
                            {isApproving ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold ml-1">Approve</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            style={{ minHeight: 36 }}
                            disabled={isBusy}
                            onPress={() => handleRejectUser(u.id, u.full_name)}
                            className="bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-md flex-row items-center transition-colors"
                          >
                            {isRejecting ? (
                              <ActivityIndicator size="small" color="#DC2626" />
                            ) : (
                              <>
                                <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-xs font-bold ml-1">Reject</Text>
                              </>
                            )}
                          </Pressable>
                        </>
                      )}
                      <Pressable style={{ minHeight: 36, minWidth: 44 }}
                        // @ts-ignore
                        onPress={() => router.push(`/admin/users/${u.id}`)}
                        className="bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 items-center justify-center"
                      >
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs font-semibold">Manage</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
