import { getApiUrl } from '../../../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { ProjectAssignmentDropdown } from '../../../../components/common/ProjectAssignmentDropdown';

export default function AdminProjectEditPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pms, setPms] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [siteManagers, setSiteManagers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    address: '',
    total_budget: '',
    status: 'Planning',
    pm_id: '',
    client_id: '',
    site_managers: [] as string[],
    workers: [] as string[]
    , suppliers: [] as string[]
    , admins: [] as string[]
  });

  const projectId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projRes, pmData, clientData, smData, workerData, supplierData, adminData, pmProjRes, roleAssignmentsRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('profiles').select('*').in('role', ['pm', 'Project Manager', 'project_manager']),
          supabase.from('profiles').select('*').in('role', ['client', 'Client']),
          supabase.from('profiles').select('*').in('role', ['site_manager', 'Site Manager', 'site manager']),
          supabase.from('profiles').select('*').in('role', ['worker', 'Worker']),
          supabase.from('profiles').select('*').in('role', ['supplier', 'Supplier']),
          supabase.from('profiles').select('*').in('role', ['admin', 'Admin', 'super_admin', 'Super Admin']),
          supabase.from('pm_projects').select('pm_id').eq('project_id', projectId),
          supabase.from('project_role_assignments').select('user_id, role').eq('project_id', projectId)
        ]);

        if (projRes.error) throw projRes.error;
        const data = projRes.data;
        const assignmentByRole: Record<string, string[]> = { admin: [], site_manager: [], worker: [], supplier: [] };
        for (const assignment of roleAssignmentsRes.data || []) {
          const role = assignment.role;
          if (!assignmentByRole[role]) assignmentByRole[role] = [];
          assignmentByRole[role].push(assignment.user_id);
        }

        if (pmData.data) setPms(pmData.data);
        if (clientData.data) setClients(clientData.data);
        if (smData.data) setSiteManagers(smData.data);
        if (workerData.data) setAvailableWorkers(workerData.data);
        if (supplierData.data) setSuppliers(supplierData.data);
        if (adminData.data) setAdmins(adminData.data);

        setFormData({
          name: data.name || '',
          location: data.location || '',
          address: data.address || '',
          total_budget: data.total_budget ? data.total_budget.toString() : '',
          status: data.status || 'Planning',
          pm_id: pmProjRes.data?.[0]?.pm_id || '',
          client_id: data.client_id || '',
          site_managers: assignmentByRole.site_manager || [],
          workers: assignmentByRole.worker || [],
          suppliers: assignmentByRole.supplier || [],
          admins: assignmentByRole.admin || []
        });
      } catch (err: any) {
        Alert.alert("Error", err.message);
      } finally {
        setLoading(false);
      }
    };

    if (projectId) fetchData();
  }, [projectId]);

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert("Error", "Project name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        location: formData.location,
        address: formData.address,
        total_budget: formData.total_budget ? parseFloat(formData.total_budget) : null,
        status: formData.status,
        pm_id: formData.pm_id || null,
        client_id: formData.client_id || null,
        site_managers: formData.site_managers,
        workers: formData.workers
        , suppliers: formData.suppliers
        , admins: formData.admins
      };

      const response = await fetch(`${getApiUrl()}/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to update project');
      }

      Alert.alert('Success', "Project updated successfully!");
      router.push(`/admin/projects/${projectId}`);
    } catch (err: any) {
      Alert.alert('Error', `Error saving project: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-brand-light">
      <TopNav title="Edit Project" showAction={false} />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6">
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" />
        ) : (
          <View className="max-w-2xl mx-auto w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800 mb-6">Update Project Details</Text>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 mb-1">Project Name</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                value={formData.name}
                onChangeText={(t) => setFormData({...formData, name: t})}
                placeholder="Enter project name"
              />
            </View>

            <View className="flex-row space-x-4 mb-4">
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 mb-1">Location</Text>
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                  value={formData.location}
                  onChangeText={(t) => setFormData({...formData, location: t})}
                  placeholder="e.g., Colombo"
                />
              </View>
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 mb-1">Budget (Rs.)</Text>
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                  value={formData.total_budget}
                  onChangeText={(t) => setFormData({...formData, total_budget: t})}
                  placeholder="e.g., 5000000"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 mb-1">Address</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                value={formData.address}
                onChangeText={(t) => setFormData({...formData, address: t})}
                placeholder="Full site address"
                multiline
              />
            </View>

            <View className="mb-8">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-600 mb-2">Status</Text>
              <View className="flex-row flex-wrap">
                {['Planning', 'Active', 'Completed', 'On Hold'].map(status => (
                  <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    key={status}
                    onPress={() => setFormData({...formData, status})}
                    className={`px-4 py-2 rounded-full mr-2 mb-2 ${formData.status === status ? 'bg-blue-600' : 'bg-gray-100'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={formData.status === status ? 'text-white font-bold' : 'text-gray-600'}>{status}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6 mt-4 border-t border-gray-100 pt-6">Assignments</Text>
            <ProjectAssignmentDropdown label="Assign Administrators" users={admins} multiple selectedIds={formData.admins} onChange={(admins) => setFormData({ ...formData, admins })} />
            <ProjectAssignmentDropdown label="Assign Project Manager" users={pms} selectedIds={formData.pm_id ? [formData.pm_id] : []} onChange={(ids) => setFormData({ ...formData, pm_id: ids[0] || '' })} />
            <ProjectAssignmentDropdown label="Assign Client" users={clients} selectedIds={formData.client_id ? [formData.client_id] : []} onChange={(ids) => setFormData({ ...formData, client_id: ids[0] || '' })} />
            <ProjectAssignmentDropdown label="Assign Site Managers" users={siteManagers} multiple selectedIds={formData.site_managers} onChange={(site_managers) => setFormData({ ...formData, site_managers })} />
            <ProjectAssignmentDropdown label="Assign Workers" users={availableWorkers} multiple selectedIds={formData.workers} onChange={(workers) => setFormData({ ...formData, workers })} />
            <ProjectAssignmentDropdown label="Assign Suppliers" users={suppliers} multiple selectedIds={formData.suppliers} onChange={(suppliers) => setFormData({ ...formData, suppliers })} />

            <View className="flex-row space-x-4 mt-4">
              <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => router.push(`/admin/projects/${projectId}`)}
                className="flex-1 py-4 bg-gray-100 rounded-xl items-center"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleSave}
                disabled={saving}
                className="flex-1 py-4 bg-brand-orange rounded-xl items-center flex-row justify-center shadow-sm"
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Save Changes</Text>}
              </TouchableOpacity>
            </View>

          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
