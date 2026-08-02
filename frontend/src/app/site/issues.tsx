import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function SiteIssues() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<any[]>([]);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const loadIssues = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_issues')
        .select('*, projects(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, []);

  const handleSubmitIssue = async () => {
    if (!title || !description) {
      Alert.alert('Validation Error', 'Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    try {
      // Get the first project id to link to
      const { data: projectData } = await supabase.from('projects').select('id').limit(1).single();
      const projectId = projectData?.id;

      if (!projectId) {
        throw new Error("No active projects found to link this issue to.");
      }

      const { error } = await supabase.from('site_issues').insert({
        project_id: projectId,
        reporter_name: user?.user_metadata?.full_name || 'Site Manager',
        title,
        description,
        severity,
        status: 'Open'
      });

      if (error) throw error;
      
      Alert.alert('Success', 'Issue reported successfully!');
      setShowModal(false);
      setTitle('');
      setDescription('');
      setSeverity('Medium');
      loadIssues();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getSeverityColors = (sev: string) => {
    switch (sev) {
      case 'High': return 'bg-red-50 text-red-700 border-red-100';
      case 'Medium': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Low': return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  const getStatusColors = (status: string) => {
    switch (status) {
      case 'Resolved': return 'bg-green-50 text-green-700 border-green-100';
      case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Open': return 'bg-orange-50 text-orange-700 border-orange-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  return (
    <View className="flex-1 bg-brand-light p-8">
      <View className="flex-row justify-between items-center mb-8">
        <View>
          <Text className="text-3xl font-bold text-brand-text mb-2">Issue Reporting</Text>
          <Text className="text-gray-500">Track and manage site incidents and blockers.</Text>
        </View>
        <Pressable 
          onPress={() => setShowModal(true)}
          className="flex-row items-center bg-brand-orange px-4 py-3 rounded-xl shadow-sm hover:bg-orange-600 transition-colors"
        >
          <Ionicons name="warning-outline" size={20} color="white" className="mr-2" />
          <Text className="text-white font-bold ml-2">Report Issue</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {issues.length === 0 ? (
            <View className="bg-white p-10 rounded-2xl items-center justify-center border border-gray-100">
              <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
              <Text className="text-gray-500 mt-4 text-center">No active issues reported. Great job!</Text>
            </View>
          ) : (
            <View className="gap-4">
              {issues.map(issue => (
                <View key={issue.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-row justify-between">
                  <View className="flex-1 pr-6 border-r border-gray-100">
                    <Text className="text-lg font-bold text-brand-text mb-2">{issue.title}</Text>
                    <Text className="text-gray-500 text-sm mb-4">{issue.description}</Text>
                    <View className="flex-row items-center gap-3">
                      <View className="flex-row items-center">
                        <MaterialIcons name="person" size={14} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 ml-1">{issue.reporter_name}</Text>
                      </View>
                      <View className="flex-row items-center">
                        <MaterialIcons name="business" size={14} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 ml-1">{issue.projects?.name || 'Unknown Site'}</Text>
                      </View>
                    </View>
                  </View>
                  <View className="w-40 pl-6 justify-center gap-3">
                    <View>
                      <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Severity</Text>
                      <View className={`px-3 py-1 rounded-full border self-start ${getSeverityColors(issue.severity)}`}>
                        <Text className="font-bold text-xs">{issue.severity}</Text>
                      </View>
                    </View>
                    <View>
                      <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Status</Text>
                      <View className={`px-3 py-1 rounded-full border self-start ${getStatusColors(issue.status)}`}>
                        <Text className="font-bold text-xs">{issue.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Report Issue Modal */}
      <Modal visible={showModal} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <Text className="text-xl font-bold text-brand-text">Report New Issue</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Issue Title</Text>
              <TextInput 
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text focus:border-brand-orange"
                placeholder="e.g. Water leak on 2nd floor"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Description</Text>
              <TextInput 
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text focus:border-brand-orange h-32"
                placeholder="Provide detailed information..."
                multiline
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View className="mb-8">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Severity</Text>
              <View className="flex-row gap-2">
                {['Low', 'Medium', 'High'].map((s) => (
                  <Pressable 
                    key={s}
                    onPress={() => setSeverity(s as any)}
                    className={`flex-1 py-3 rounded-lg border items-center ${severity === s ? 'border-brand-orange bg-orange-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <Text className={`font-bold ${severity === s ? 'text-brand-orange' : 'text-gray-500'}`}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable 
              onPress={handleSubmitIssue}
              disabled={submitting}
              className={`w-full py-4 rounded-xl items-center justify-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange hover:bg-orange-600 transition-colors'}`}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-lg">Submit Report</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}
