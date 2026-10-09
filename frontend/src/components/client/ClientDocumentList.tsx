import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type DocumentRecord = { id: string; name?: string | null; file_name?: string | null; category?: string | null; status?: string | null; created_at?: string | null; project_id?: string | null; url?: string | null };

export const ClientDocumentList = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadDocuments = async () => {
      try {
        setError(null);
        const { data: projects, error: projectError } = await supabase.from('projects').select('id').eq('client_id', user.id);
        if (projectError) throw projectError;
        const projectIds = (projects || []).map(project => project.id);
        if (projectIds.length === 0) {
          if (isMounted) setDocuments([]);
          return;
        }
        const { data, error: documentError } = await supabase.from('shared_documents').select('id, name, file_name, category, status, created_at, project_id, url').in('project_id', projectIds).order('created_at', { ascending: false });
        if (documentError) throw documentError;
        if (isMounted) setDocuments((data || []) as DocumentRecord[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load project documents.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDocuments();
    const channel = supabase.channel(`client-documents:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'shared_documents' }, () => { if (isMounted) setRefreshKey(value => value + 1); }).subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [user, refreshKey]);

  return (
    <View className="flex-1 bg-white rounded-xl border border-gray-100 p-4 md:p-6">
      <View className="mb-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Project Documents</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Files shared for your assigned projects</Text></View>
      {loading ? <View className="py-12 items-center"><ActivityIndicator color="#F97316" /></View> : error ? <View className="items-center py-10"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-center">{error}</Text><Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRefreshKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text></Pressable></View> : documents.length === 0 ? <View className="items-center py-12"><Ionicons name="documents-outline" size={44} color="#D1D5DB" /><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-3">No documents have been shared yet.</Text></View> : (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {documents.map(document => <View key={document.id} className="py-4 flex-row items-center border-b border-gray-50"><View className="w-12 h-12 rounded-lg bg-gray-50 items-center justify-center mr-4 border border-gray-100"><MaterialCommunityIcons name="file-document-outline" size={26} color="#6B7280" /></View><View className="flex-1"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{document.name || document.file_name || 'Project document'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">{document.category || 'General'} · {document.created_at ? new Date(document.created_at).toLocaleDateString('en-GB') : 'Date not set'}</Text></View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase">{document.status || 'Shared'}</Text></View>)}
        </ScrollView>
      )}
    </View>
  );
};
