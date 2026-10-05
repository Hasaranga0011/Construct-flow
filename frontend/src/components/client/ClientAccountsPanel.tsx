import { ModalViewport } from '../common/ModalViewport';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { api } from '../../lib/api';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

import { useResponsive } from '../../hooks/useResponsive';

const ClientCard = ({ 
  initials, 
  colorClass, 
  projectName, 
  accessLevel, 
  companyName,
  clientName,
  email,
  onViewDetails
}: { 
  initials: string, 
  colorClass: string, 
  projectName: string, 
  accessLevel: string, 
  companyName: string,
  clientName: string,
  email: string,
  onViewDetails: () => void
}) => {
  const { isMobile } = useResponsive();

  if (isMobile) {
    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E5E7EB', padding: 12, marginBottom: 12, width: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <View className={`w-12 h-12 rounded-full items-center justify-center ${colorClass}`}>
            <Text className="text-white font-bold text-sm">{initials}</Text>
          </View>
          
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 }}>{clientName}</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 2 }}>{companyName || 'Independent'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={14} color="#6B7280" />
              <Text style={{ fontSize: 13, color: '#6B7280' }}>Project: {projectName}</Text>
            </View>
          </View>
          
          <View style={{ backgroundColor: accessLevel === 'Full Access' ? '#DCFCE7' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: accessLevel === 'Full Access' ? '#065F46' : '#6B7280', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>
              {accessLevel}
            </Text>
          </View>
        </View>

        <Pressable 
          onPress={onViewDetails}
          style={{ width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
        >
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>Send Update</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Avatar */}
      <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${colorClass}`}>
        <Text className="text-white font-bold text-sm">{initials}</Text>
      </View>

      {/* Details */}
      <View className="flex-1">
        <View className="flex-row items-center mb-1">
          <Text className="text-brand-text font-bold text-sm mr-2">{clientName}</Text>
          <View className={`px-2 py-0.5 rounded ${accessLevel === 'Full Access' ? 'bg-[#DCFCE7]' : 'bg-gray-100'}`}>
            <Text className={`text-[10px] font-semibold ${accessLevel === 'Full Access' ? 'text-brand-success' : 'text-gray-500'}`}>
              {accessLevel}
            </Text>
          </View>
        </View>
        {email ? <Text className="text-gray-500 text-xs mb-0.5">{email}</Text> : null}
        <Text className="text-gray-500 text-xs mb-0.5">Company: {companyName}</Text>
        <Text className="text-gray-500 text-xs">Project: {projectName}</Text>
      </View>

      {/* Action */}
      <Pressable onPress={onViewDetails}>
        <Text className="text-brand-orange text-sm font-semibold">View Details</Text>
      </Pressable>
    </View>
  );
};

const ClientDetailsModal = ({ client, visible, onClose, onUpdate }: { client: any, visible: boolean, onClose: () => void, onUpdate: () => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client) {
      setEditName(client.full_name || '');
      setEditCompany(client.company_name || '');
      setIsEditing(false);
    }
  }, [client, visible]);

  if (!client) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put(`/clients/${client.id}`, { name: editName, company: editCompany });
      onUpdate();
      onClose();
    } catch (e: any) {
      if (typeof window !== 'undefined') {
        window.alert(e.message || 'Failed to update client');
      } else {
        Alert.alert('Error', e.message || 'Failed to update client');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert('Delete Client', 'Are you sure you want to delete this client profile? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          await api.delete(`/clients/${client.id}`);
          onUpdate();
          onClose();
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to delete client');
        } finally {
          setLoading(false);
        }
      } },
    ]);
  };
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text className="text-xl font-bold text-brand-text">Client Details</Text>
            <Pressable onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>
            <View className="items-center mb-6">
              <View className="w-20 h-20 rounded-full bg-blue-500 items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">{client.full_name?.substring(0, 2).toUpperCase()}</Text>
              </View>
              {isEditing ? (
                <TextInput 
                  value={editName}
                  onChangeText={setEditName}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-base text-brand-text w-full mb-2"
                  placeholder="Full Name"
                />
              ) : (
                <Text className="text-xl font-bold text-brand-text">{client.full_name}</Text>
              )}
              <Text className="text-gray-500">{client.email}</Text>
            </View>
            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-500 mb-1">Company Name</Text>
              {isEditing ? (
                <TextInput 
                  value={editCompany}
                  onChangeText={setEditCompany}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-base text-brand-text w-full"
                  placeholder="Company Name"
                />
              ) : (
                <Text className="text-base text-brand-text">{client.company_name || 'N/A'}</Text>
              )}
            </View>
            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-500 mb-1">Role</Text>
              <Text className="text-base text-brand-text uppercase">{client.role}</Text>
            </View>
            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-500 mb-1">Member Since</Text>
              <Text className="text-base text-brand-text">{new Date(client.created_at).toLocaleDateString()}</Text>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View className="p-6 border-t border-gray-100 flex-row flex-wrap justify-end gap-3 bg-gray-50">
            {isEditing ? (
              <>
                <Pressable onPress={() => setIsEditing(false)} className="px-4 py-2 rounded-lg bg-gray-200">
                  <Text className="text-gray-700 font-semibold">Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSave} disabled={loading} className={`px-4 py-2 rounded-lg ${loading ? 'bg-blue-300' : 'bg-blue-600'}`}>
                  <Text className="text-white font-semibold">{loading ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={handleDelete} disabled={loading} className="px-4 py-2 rounded-lg bg-red-100">
                  <Text className="text-red-600 font-semibold">{loading ? '...' : 'Delete'}</Text>
                </Pressable>
                <Pressable onPress={() => setIsEditing(true)} className="px-4 py-2 rounded-lg bg-blue-100">
                  <Text className="text-blue-600 font-semibold">Edit</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ModalViewport>
    </Modal>
  );
};

export const ClientAccountsPanel = ({ refreshTrigger = 0, searchQuery = '', pmId }: { refreshTrigger?: number, searchQuery?: string, pmId?: string }) => {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const loadClients = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        // Ideally, if pmId is passed, we join on projects where pm_id = pmId and project.client_id = profile.id
        // Since we don't have a direct link in the profiles table, we first find the client IDs.
        let allowedClientIds: string[] = [];
        if (pmId) {
          const { data: projects } = await supabase.from('projects').select('client_id').eq('pm_id', pmId);
          if (projects) {
            allowedClientIds = projects.map(p => p.client_id).filter(Boolean);
          }
        }

        let query = supabase
          .from('profiles')
          .select('*')
          .eq('role', 'client')
          .order('created_at', { ascending: false });

        if (pmId) {
          if (allowedClientIds.length > 0) {
            query = query.in('id', allowedClientIds);
          } else {
            // If the PM has no projects with clients, return empty
            if (isMounted) setClients([]);
            if (isMounted) setLoading(false);
            return;
          }
        }

        if (searchQuery) {
          query = query.ilike('email', `%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (data && data.length > 0) {
          const clientIds = data.map(c => c.id);
          const { data: clientProjects } = await supabase
            .from('projects')
            .select('name, client_id')
            .in('client_id', clientIds);
            
          const clientsWithProjects = data.map(client => {
            const myProjects = (clientProjects || []).filter((p: any) => p.client_id === client.id);
            let projectName = 'N/A';
            if (myProjects.length === 1) projectName = myProjects[0].name;
            else if (myProjects.length > 1) projectName = 'Multiple Projects';
            
            return {
              ...client,
              projectName
            };
          });
          if (isMounted) setClients(clientsWithProjects);
        } else {
          if (isMounted) setClients([]);
        }
      } catch (error) {
        console.warn('Failed to load clients:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadClients();
    return () => { isMounted = false; };
  }, [refreshTrigger, localRefreshTrigger, searchQuery]);

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (index: number) => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500'];
    return colors[index % colors.length];
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[400px]">
      <View className="flex-row flex-wrap gap-3 justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Client Accounts</Text>
          <Text className="text-brand-text-muted text-xs">Manage access and project sharing</Text>
        </View>
        <Pressable>
          <Text className="text-brand-orange text-sm font-semibold">View all</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {clients.length === 0 ? (
            <View className="py-10 items-center">
              <Text className="text-gray-400">No clients invited yet.</Text>
            </View>
          ) : (
            clients.map((client, i) => {
              const colorClass = getAvatarColor(i);
              
              return (
                <ClientCard 
                  key={client.id}
                  initials={client.full_name?.substring(0, 2).toUpperCase() || 'NA'}
                  colorClass={colorClass}
                  projectName={client.projectName || 'N/A'}
                  accessLevel="Full Access"
                  companyName={client.company_name || 'N/A'}
                  clientName={client.full_name || 'Unknown'}
                  email={client.email}
                  onViewDetails={() => setSelectedClient(client)}
                />
              );
            })
          )}
        </ScrollView>
      )}
      <ClientDetailsModal 
        client={selectedClient} 
        visible={!!selectedClient} 
        onClose={() => setSelectedClient(null)} 
        onUpdate={() => setLocalRefreshTrigger(prev => prev + 1)} // we also need a local state trigger to re-fetch
      />
    </View>
  );
};
