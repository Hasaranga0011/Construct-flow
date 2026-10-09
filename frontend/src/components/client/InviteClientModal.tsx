import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '../../lib/toast';
import { notify } from '../../utils/notify';

type InviteClientModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export const InviteClientModal = ({ visible, onClose, onSuccess }: InviteClientModalProps) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [accessLevel, setAccessLevel] = useState('Full Access');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [fetchingProjects, setFetchingProjects] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch active projects
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchProjects = async () => {
      setFetchingProjects(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active');

        if (error) throw error;
        if (isMounted) setProjects(data || []);
      } catch (err) {
        console.warn('Could not load projects for invite client modal', err);
      } finally {
        if (isMounted) setFetchingProjects(false);
      }
    };
    fetchProjects();
    return () => { isMounted = false; };
  }, [visible]);

  const handleInvite = async () => {
    if (!email || !name || !projectId) {
      setErrorMsg('Email, name, and project are required.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await api.post('/clients/invite', {
        email,
        name,
        company,
        access_level: accessLevel,
        project_id: projectId
      });

      // Reset form
      setEmail('');
      setName('');
      setCompany('');
      setAccessLevel('Full Access');
      setProjectId(null);

      notify('Success', `Client ${name || email} added successfully.`);
      onSuccess();
    } catch (e: any) {
      notify('Error', e.message || e.detail || 'Failed to invite client.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">

          {/* Header */}
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Invite Client</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>


            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Client Email *</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                placeholder="client@example.com"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Client Name *</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                placeholder="John Doe"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Company (Optional)</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                placeholder="Acme Corp"
                value={company}
                onChangeText={setCompany}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Access Level</Text>
              <View className="flex-row gap-2">
                {['Full Access', 'Read Only'].map(s => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={s}
                    onPress={() => setAccessLevel(s)}
                    className={`flex-1 py-3 rounded-xl border items-center justify-center ${accessLevel === s ? 'bg-brand-dark border-brand-dark' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${accessLevel === s ? 'text-white' : 'text-gray-600'}`}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="mb-8">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Assign to Project *</Text>
              {fetchingProjects ? (
                <ActivityIndicator color="#F97316" className="self-start py-2" />
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                  {projects.map(p => (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={p.id}
                      onPress={() => setProjectId(p.id)}
                      className={`px-4 py-2 rounded-full border ${projectId === p.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${projectId === p.id ? 'text-white' : 'text-gray-600'}`}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                  {projects.length === 0 && (
                     <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm italic">No active projects found.</Text>
                  )}
                </ScrollView>
              )}
            </View>

            {/* Footer Buttons */}
            <View className="flex-row gap-4 pt-4 border-t border-gray-100 pb-2">
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={onClose}
                disabled={loading}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleInvite}
                disabled={loading || fetchingProjects}
                className={`flex-1 bg-brand-orange py-4 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading || fetchingProjects ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Send Invite</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </ModalViewport>
    </Modal>
  );
};
