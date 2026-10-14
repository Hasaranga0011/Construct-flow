import { firstRelation } from '@/utils/relations';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { notify, confirmAction } from '@/utils/notify';
import { DeleteProjectModal } from '@/components/common/DeleteProjectModal';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../../hooks/useResponsive';
import { roleLabel } from '../../../../utils/roles';
import { getApiUrl } from '../../../../lib/apiUrl';
import { AutoFitText } from '@/components/common/AutoFitText';

export default function AdminProjectDetailsPage() {
  const { id } = useLocalSearchParams();
  const projectId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [supplierStats, setSupplierStats] = useState<any[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    console.log("AdminProjectDetailsPage mounted with ID:", id);
    const fetchProject = async () => {
      try {
        const projectId = Array.isArray(id) ? id[0] : id;
        if (!projectId) {
            console.error("ID is undefined!");
            if (isMounted) setLoading(false);
            return;
        }

        const { data: projData, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId as string)
          .single();

        if (projError) {
          if (projError.code === 'PGRST116') {
            if (isMounted) setProject(null);
            return;
          }
          console.error("Supabase Error:", projError);
          throw projError;
        }

        if (projData.pm_id) {
            const { data: pmData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.pm_id).single();
            (projData as any).pm = pmData;
        }

        if (projData.client_id) {
            const { data: clientData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.client_id).single();
            (projData as any).client = clientData;
        }

        const { data: roleData, error: roleError } = (await supabase
          .from('project_role_assignments')
          .select('user_id, role, profiles (full_name, email, role)')
          .eq('project_id', projectId as string)) as any;

        if (roleError) console.error("Error fetching assignments:", roleError);

        if (isMounted) {
            setProject(projData);
            if (roleData) {
              const normalizedRoles = (roleData as any[]).map((assignment: any) => ({ ...assignment, profiles: firstRelation(assignment.profiles) }));
              const otherStaff = normalizedRoles.filter((a: any) => a.role !== 'pm' && a.role !== 'client' && a.role !== 'supplier');
              setAssignments(otherStaff);

              const supplierIds = normalizedRoles.filter((a: any) => a.role === 'supplier').map((a:any) => a.user_id);
              if (supplierIds.length > 0) {
                 // Fetch POs to compute stats
                 const { data: poData } = await supabase.from('purchase_orders').select('*').eq('project_id', projectId as string);
                 const pos = poData || [];

                 const stats = supplierIds.map((sid: string) => {
                    const supName = normalizedRoles.find((a:any) => a.user_id === sid)?.profiles?.full_name || 'Unknown Supplier';
                    const supOrders = pos.filter((p:any) => p.supplier_id === sid);
                    const openOrders = supOrders.filter((p:any) => ['Pending Delivery', 'Confirmed', 'Suggested'].includes(p.status));
                    const deliveredOrders = supOrders.filter((p:any) => ['Delivered', 'Received'].includes(p.status));
                    const counteredOrders = supOrders.filter((p:any) => ['Suggested', 'Rejected'].includes(p.status));

                    const lastDelivery = deliveredOrders.length > 0
                        ? new Date(Math.max(...deliveredOrders.map((o:any) => new Date(o.updated_at).getTime())))
                        : null;

                    return {
                       id: sid,
                       name: supName,
                       openCount: openOrders.length,
                       counteredCount: counteredOrders.length,
                       lastDelivery: lastDelivery ? lastDelivery.toDateString() : 'Never'
                    };
                 });
                 setSupplierStats(stats);
              } else {
                 setSupplierStats([]);
              }
            }
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (err?.code === 'PGRST116' || err?.message?.includes('JSON object')) {
          return;
        }
        console.error('Error fetching project details', err);
        notify('Error', `Error fetching project details: ${err.message || JSON.stringify(err)}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProject();

    const channel = supabase
      .channel('project_roles_' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_role_assignments', filter: `project_id=eq.${id}` }, () => {
        if (isMounted) fetchProject();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleArchiveProject = async (skipConfirm = false) => {
    if (!project) return;
    if (!skipConfirm) {
      const confirmed = await confirmAction(
        'Archive Project',
        `Archive "${project.name}"?\n\nThe project will be hidden from active lists and dashboards, but retained for finance, audit, and reports.`,
        false
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const targetId = project?.id || projectId;
      if (!targetId) {
        throw new Error('Project ID is missing');
      }
      const targetUrl = `${getApiUrl()}/projects/${targetId}?archive_only=true`;
      if (__DEV__) {
        console.log('[DEBUG DELETE (Archive) /projects Request]:', targetUrl);
      }

      const res = await fetch(targetUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        let errText = 'Failed to archive project';
        try {
          const errData = await res.json();
          errText = errData.detail || errData.message || JSON.stringify(errData);
        } catch {
          errText = await res.text();
        }
        throw new Error(errText);
      }

      notify('Success', `Project "${project.name}" has been archived successfully.`);
      setProject(prev => prev ? { ...prev, status: 'archived' } : null);
      router.replace('/admin/projects' as any);
    } catch (err: any) {
      console.error('Failed to archive project:', err);
      notify('Error', err.message || 'Failed to archive project');
      setLoading(false);
    }
  };

  const handleRestoreProject = async () => {
    if (!project) return;
    const confirmed = await confirmAction(
      'Restore Project',
      `Restore "${project.name}" to active status?\n\nThe project will return to active dashboards and project lists.`,
      false
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const targetId = project?.id || projectId;
      if (!targetId) {
        throw new Error('Project ID is missing');
      }

      let res = await fetch(`${getApiUrl()}/projects/${targetId}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        res = await fetch(`${getApiUrl()}/projects/${targetId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'active' })
        });
      }

      if (!res.ok) {
        let errText = 'Failed to restore project';
        try {
          const errData = await res.json();
          errText = errData.detail || errData.message || JSON.stringify(errData);
        } catch {
          errText = await res.text();
        }
        throw new Error(errText);
      }

      setProject(prev => prev ? { ...prev, status: 'active' } : null);
      notify('Success', `Project "${project.name}" has been restored to active status.`);
    } catch (err: any) {
      console.error('Failed to restore project:', err);
      notify('Error', err.message || 'Failed to restore project');
    } finally {
      setLoading(false);
    }
  };

  const executeDeleteProject = async () => {
    if (!project) return;
    setDeleting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const targetId = project?.id || projectId;
      if (!targetId) {
        throw new Error('Project ID is missing');
      }
      const targetUrl = `${getApiUrl()}/projects/${targetId}?archive_only=false`;
      if (__DEV__) {
        console.log('[DEBUG DELETE (Permanent) /projects Request]:', targetUrl);
      }

      const response = await fetch(targetUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 409) {
        let depMessage = 'This project has financial or operational history. Archive it instead.';
        try {
          const errData = await response.json();
          depMessage = errData.detail || depMessage;
        } catch {}

        setDeleteModalVisible(false);
        setDeleting(false);

        const shouldArchive = await confirmAction('Archive Instead?', `${depMessage}\n\nWould you like to archive it instead?`, false);
        if (shouldArchive) {
          await handleArchiveProject(true);
        }
        return;
      }

      if (!response.ok) {
        let errMessage = 'Failed to delete project';
        try {
          const errData = await response.json();
          errMessage = errData.detail || errData.message || JSON.stringify(errData);
        } catch {
          errMessage = await response.text();
        }
        throw new Error(errMessage);
      }

      setDeleteModalVisible(false);
      notify('Success', `Project "${project.name}" deleted successfully.`);
      router.replace('/admin/projects' as any);
    } catch (err: any) {
      console.error('Failed to delete project:', err);
      notify('Error', err.message || 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteProject = () => {
    if (!project) return;
    setDeleteModalVisible(true);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={project ? project.name : "Project Details"} showAction={false} />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : !project ? (
          <View className="py-20 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">Project not found.</Text>
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">

            {/* Header Card */}
            <View className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 md:p-8 mb-6 relative overflow-hidden">
              <View className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full" />

              <View className="flex-row flex-wrap gap-3 justify-between items-start mb-6">
                <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl md:text-3xl font-black text-gray-800 mb-2">{project.name}</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 ml-1">{project.location}</Text>
                  </View>
                </View>

                <View className={`px-4 py-2 rounded-lg ${project.status === 'active' ? 'bg-[#DCFCE7]' : String(project.status || '').toLowerCase() === 'archived' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold uppercase tracking-wider ${project.status === 'active' ? 'text-brand-success' : String(project.status || '').toLowerCase() === 'archived' ? 'text-amber-800' : 'text-gray-600'}`}>
                    {project.status}
                  </Text>
                </View>
              </View>

              {String(project.status || '').toLowerCase() === 'archived' && (
                <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Ionicons name="archive" size={20} color="#D97706" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-amber-900 font-bold text-sm">Archived Project</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-amber-700 text-xs">This project is archived and hidden from active views. Historical records remain accessible.</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={{ minHeight: 40, minWidth: 40 }}
                    onPress={handleRestoreProject}
                    className="bg-emerald-600 px-4 py-2 rounded-xl flex-row items-center"
                  >
                    <Ionicons name="arrow-undo-outline" size={16} color="#FFFFFF" className="mr-1.5" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Restore</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Stats Row */}
              <View style={isMobile ? { flexDirection: 'column', gap: 16, paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' } : { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Total Budget</Text>
                  <AutoFitText value={`Rs. ${project.total_budget?.toLocaleString() || 'N/A'}`} maxFontSize={20} minFontSize={14} className="font-bold text-gray-800" />
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Spent Cost</Text>
                  <AutoFitText value={`Rs. ${project.spent_cost?.toLocaleString() || '0'}`} maxFontSize={20} minFontSize={14} className="font-bold text-brand-orange" />
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Target End</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-medium text-gray-800">
                    {new Date(project.end_date).toDateString()}
                  </Text>
                </View>
              </View>
            </View>

            <View style={isMobile ? { flexDirection: 'column', gap: 24 } : { flexDirection: 'row', gap: 24 }}>
              {/* Personnel Details */}
              <View style={isMobile ? { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' } : { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Assigned Personnel</Text>

                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-blue-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={20} color="#3B82F6" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Project Manager</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.pm?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-purple-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="person" size={20} color="#8B5CF6" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Client</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.client?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                {assignments.length > 0 && (
                  <View className="mt-4 pt-4 border-t border-gray-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase mb-3">Other Assigned Staff</Text>
                    {assignments.map((a: any, i: number) => (
                      <View key={i} className="flex-row items-center mb-3">
                        <View className="w-8 h-8 bg-gray-50 rounded-full items-center justify-center mr-3 border border-gray-200">
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-bold text-xs">{a.profiles?.full_name?.charAt(0) || 'U'}</Text>
                        </View>
                        <View>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 text-sm font-medium">{a.profiles?.full_name || 'Unknown User'}</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 capitalize">{roleLabel(a.role)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Quick Actions */}
              <View className="flex-1 w-full md:w-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Quick Actions</Text>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/admin/projects/${project.id}/milestones`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="flag" size={20} color="#F97316" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">Manage Milestones</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Track project phases & media</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/admin/projects/${project.id}/expenses`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="cash-outline" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">Manage Expenses</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Track spent costs dynamically</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/admin/projects/${project.id}/edit`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl border border-gray-200"
                 >
                    <Ionicons name="settings" size={20} color="#3B82F6" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">Edit Project</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Update budget & details</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 {String(project.status || '').toLowerCase() === 'archived' ? (
                   <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                      onPress={handleRestoreProject}
                      className="flex-row items-center p-3 bg-emerald-50 rounded-xl border border-emerald-200 mt-2"
                   >
                      <Ionicons name="arrow-undo-outline" size={20} color="#059669" className="mr-3" />
                      <View className="flex-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-emerald-800">Restore Project</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-emerald-600">Return to active dashboard & lists</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#059669" />
                   </TouchableOpacity>
                 ) : (
                   <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => handleArchiveProject(false)}
                      className="flex-row items-center p-3 bg-amber-50 rounded-xl border border-amber-200 mt-2"
                   >
                      <Ionicons name="archive-outline" size={20} color="#D97706" className="mr-3" />
                      <View className="flex-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-amber-800">Archive Project</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-amber-600">Hide from active views, keep history</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#D97706" />
                   </TouchableOpacity>
                 )}

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={handleDeleteProject}
                    className="flex-row items-center p-3 bg-red-50 rounded-xl border border-red-200 mt-2"
                 >
                    <Ionicons name="trash" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-red-700">Delete Project</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-red-500">Permanently remove if no history</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                 </TouchableOpacity>
              </View>
            </View>

            {/* Assigned Suppliers Section */}
            <View className="mt-8">
               <View className="flex-row justify-between items-center mb-4">
                 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800">Assigned Suppliers</Text>
                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(`/admin/projects/${project.id}/edit`)}>
                   <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">Manage</Text>
                 </TouchableOpacity>
               </View>

               {supplierStats.length === 0 ? (
                 <View className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 items-center justify-center">
                   <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
                   <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-medium mb-4 text-center">No suppliers assigned yet.</Text>
                   <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(`/admin/projects/${project.id}/edit`)} className="bg-gray-100 px-6 py-2 rounded-lg">
                     <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold">Add Supplier</Text>
                   </TouchableOpacity>
                 </View>
               ) : (
                 <View className="flex-row flex-wrap" style={{ marginHorizontal: -8 }}>
                   {supplierStats.map(stat => (
                     <View key={stat.id} style={isMobile ? { width: '100%', padding: 8 } : { width: '33.33%', padding: 8 }}>
                       <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-full">
                         <View className="flex-row items-center mb-4">
                           <View className="w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3">
                             <Ionicons name="business" size={18} color="#3B82F6" />
                           </View>
                           <View className="flex-1">
                             <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">{stat.name}</Text>
                             <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400">Supplier</Text>
                           </View>
                         </View>

                         <View className="flex-row justify-between mb-2">
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500">Open Orders:</Text>
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-800">{stat.openCount}</Text>
                         </View>
                         <View className="flex-row justify-between mb-2">
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500">Countered/Rejected:</Text>
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-orange-600">{stat.counteredCount}</Text>
                         </View>
                         <View className="flex-row justify-between mb-4">
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500">Last Delivery:</Text>
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-medium text-gray-800">{stat.lastDelivery}</Text>
                         </View>

                         <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                           onPress={() => router.push(`/admin/materials/orders?supplier_id=${stat.id}&project_id=${project.id}`)}
                           className="mt-auto bg-gray-50 py-2 rounded-lg items-center border border-gray-200"
                         >
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-sm">View Orders</Text>
                         </TouchableOpacity>
                       </View>
                     </View>
                   ))}
                 </View>
               )}
            </View>

          </View>
        )}
      </ScrollView>

      {project && (
        <DeleteProjectModal
          visible={deleteModalVisible}
          projectName={project.name || ''}
          loading={deleting}
          onCancel={() => setDeleteModalVisible(false)}
          onConfirm={executeDeleteProject}
        />
      )}
    </View>
  );
}
