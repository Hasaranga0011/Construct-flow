import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const DocumentRow = ({ filename, project, time }: { filename: string, project: string, time: string }) => {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
      <View className="flex-row items-center flex-1">
        <Ionicons name="document-text" size={16} color="#9CA3AF" className="mr-3" />
        <View className="flex-1 mr-2">
          <Text className="text-brand-text font-bold text-sm mb-0.5" numberOfLines={1}>
            {filename}
          </Text>
          <Text className="text-gray-500 text-xs">{project}</Text>
        </View>
      </View>
      <Text className="text-gray-400 text-xs ml-2">{time}</Text>
    </View>
  );
};

export const SharedDocuments = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [documents, setDocuments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    
    const loadDocuments = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('shared_documents')
          .select(`
            id, filename, created_at,
            projects(name)
          `)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        
        if (isMounted) setDocuments(data || []);
      } catch (error) {
        console.warn('Failed to load shared documents:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadDocuments();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold text-brand-text">Shared Documents</Text>
        <Text className="text-gray-500 text-xs font-medium">{documents.length} files</Text>
      </View>

      <View>
        {loading ? (
          <Text className="text-gray-500 text-sm mt-4 text-center">Loading...</Text>
        ) : documents.length === 0 ? (
          <Text className="text-gray-500 text-sm mt-4 text-center">No shared documents yet.</Text>
        ) : (
          documents.map(doc => (
            <DocumentRow 
              key={doc.id}
              filename={doc.filename} 
              project={doc.projects?.name || 'Unknown Project'} 
              time={getTimeAgo(doc.created_at)} 
            />
          ))
        )}
      </View>
    </View>
  );
};
