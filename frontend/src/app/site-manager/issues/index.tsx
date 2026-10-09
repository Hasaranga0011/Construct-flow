import { dataError, projectSites } from '@/services/siteData';
import { notify } from '@/utils/notify';
import { ModalViewport } from '@/components/common/ModalViewport';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { TopNav } from '@/components/common/TopNav';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';

export default function SMIssuesPage() {
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{id: string; name: string}[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const loadIssues = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);
      setLoadError('');
      if (assignedProjectIds.length === 0) { setIssues([]); setProjects([]); setActiveProjectId(null); return; }

      const { data: projectData, error: projectError } = await supabase.from('projects').select('id, name').in('id', assignedProjectIds);
      if (projectError) throw projectError;
      setProjects(projectData || []);
      const currentProjectId = assignedProjectIds.includes(activeProjectId || '') ? activeProjectId! : assignedProjectIds[0];
      if (currentProjectId !== activeProjectId) setActiveProjectId(currentProjectId);

      const linkedSites = await projectSites([currentProjectId]);
      const ids = linkedSites.map(s => s.id);
      setSiteIds(ids);
      if (!ids.length) { setIssues([]); return; }
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .in('site_id', ids)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues((data || []).map(issue => ({ ...issue, projects: (projectData || []).find(p => p.id === currentProjectId) })));
    } catch (error: any) {
      setLoadError(dataError(error));
    } finally {
      setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, activeProjectId]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

  const handleSubmitIssue = async () => {
    if (submitting) return;
    if (!title.trim() || !description.trim() || !activeProjectId || !siteIds.length) {
      notify('Validation Error', 'Enter the issue details and select a project with a linked site.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('issues').insert({
        site_id: siteIds[0],
        reported_by: user?.id,
        title: title.trim(),
        description: description.trim(),
        severity,
        status: 'Open'
      });

      if (error) throw error;

      notify('Success', 'Issue reported successfully!');
      setShowModal(false);
      setTitle('');
      setDescription('');
      setSeverity('Medium');
      loadIssues();
    } catch (error: any) {
      notify('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIssue = async (issueId: string) => {
    if (resolving) return;
    setResolving(issueId);
    try {
      const { error } = await supabase
        .from('issues')
        .update({ status: 'Resolved' })
        .eq('id', issueId).in('site_id', siteIds).select('id').single();

      if (error) throw error;
      notify('Success', 'Issue resolved successfully!');
      loadIssues();
    } catch (error: any) {
      notify('Error', error.message);
    } finally { setResolving(null); }
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
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Issues" actionLabel="Refresh" onActionPress={() => { loadIssues(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}
      <View><ScrollView keyboardShouldPersistTaps="handled" horizontal contentContainerStyle={{ padding: 16, gap: 12 }}>{projects.map(project => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={project.id} onPress={() => setActiveProjectId(project.id)} className={`px-4 py-2 rounded-xl ${activeProjectId === project.id ? 'bg-brand-orange' : 'bg-white'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={activeProjectId === project.id ? 'text-white font-bold' : 'text-gray-700'}>{project.name}</Text></Pressable>)}</ScrollView></View>

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <View className="flex-1 p-4">
          <View className="flex-row flex-wrap gap-4 justify-between items-center mb-5">
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-brand-text mb-2">Issue Reporting</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Track and manage site incidents and blockers.</Text>
            </View>
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => setShowModal(true)}
              className="flex-row items-center bg-brand-orange px-4 py-3 rounded-xl shadow-sm hover:bg-orange-600 transition-colors"
            >
              <Ionicons name="warning-outline" size={20} color="white" className="mr-2" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold ml-2">Report Issue</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {issues.length === 0 ? (
              <View className="bg-white p-10 rounded-2xl items-center justify-center border border-gray-100">
                <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-4 text-center">No active issues reported. Great job!</Text>
              </View>
            ) : (
              <View className="gap-4">
                {issues.map(issue => (
                  <View key={issue.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-col md:flex-row gap-4 justify-between">
                    <View className="flex-1 min-w-0">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-2">{issue.title}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mb-4">{issue.description}</Text>
                      <View className="flex-row flex-wrap items-center gap-3">
                        <View className="flex-row items-center max-w-full flex-shrink">
                          <MaterialIcons name="person" size={14} color="#9CA3AF" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 ml-1">{issue.reporter_name}</Text>
                        </View>
                        <View className="flex-row items-center max-w-full flex-shrink">
                          <MaterialIcons name="business" size={14} color="#9CA3AF" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 ml-1">{issue.projects?.name || 'Unknown Site'}</Text>
                        </View>
                      </View>
                    </View>
                    <View className="md:w-40 justify-center gap-3">
                      <View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Severity</Text>
                        <View className={`px-3 py-1 rounded-full border self-start ${getSeverityColors(issue.severity)}`}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-xs">{issue.severity}</Text>
                        </View>
                      </View>
                      <View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Status</Text>
                        <View className={`px-3 py-1 rounded-full border self-start ${getStatusColors(issue.status)}`}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-xs">{issue.status}</Text>
                        </View>
                      </View>

                      {issue.status !== 'Resolved' && (
                        <Pressable style={{ minHeight: 44, minWidth: 44 }}
                          disabled={resolving !== null}
                          onPress={() => handleResolveIssue(issue.id)}
                          className="mt-2 bg-brand-success px-3 py-2 rounded-lg items-center"
                        >
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Mark Resolved</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Report Issue Modal */}
      <Modal visible={showModal} transparent={true} animationType="fade" onRequestClose={() => setShowModal(false)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white w-full max-w-lg rounded-3xl shadow-xl max-h-full">
            <View className="flex-row justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Report New Issue</Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Issue Title</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text focus:border-brand-orange"
                placeholder="e.g. Water leak on 2nd floor"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Description</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="w-full border border-gray-300 rounded-xl p-4 text-brand-text focus:border-brand-orange h-32"
                placeholder="Provide detailed information..."
                multiline
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View className="mb-8">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Severity</Text>
              <View className="flex-row gap-2">
                {['Low', 'Medium', 'High'].map((s) => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={s}
                    onPress={() => setSeverity(s as any)}
                    className={`flex-1 py-3 rounded-lg border items-center ${severity === s ? 'border-brand-orange bg-orange-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold ${severity === s ? 'text-brand-orange' : 'text-gray-500'}`}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={handleSubmitIssue}
              disabled={submitting}
              className={`w-full py-4 rounded-xl items-center justify-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange hover:bg-orange-600 transition-colors'}`}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Submit Report</Text>
              )}
            </Pressable>
          </ScrollView>
        </ModalViewport>
      </Modal>

    </View>
  );
}
