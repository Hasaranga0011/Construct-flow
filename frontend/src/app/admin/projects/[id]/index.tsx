import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../../hooks/useResponsive';

export default function AdminProjectDetailsPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [supplierStats, setSupplierStats] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    console.log("AdminProjectDetailsPage mounted with ID:", id);
    const fetchProject = async () => {
      try {
        if (!id) {
            console.error("ID is undefined!");
            if (isMounted) setLoading(false);
            return;
        }
        
        const { data: projData, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .single();
          
        if (projError) {
          console.error("Supabase Error:", projError);
          throw projError;
        }

        if (projData.pm_id) {
            const { data: pmData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.pm_id).single();
            projData.pm = pmData;
        }
        
        if (projData.client_id) {
            const { data: clientData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.client_id).single();
            projData.client = clientData;
        }

        const { data: roleData, error: roleError } = await supabase
          .from('project_role_assignments')
          .select('user_id, role, profiles (full_name, email, role)')
          .eq('project_id', id);
          
        if (roleError) console.error("Error fetching assignments:", roleError);
        
        if (isMounted) {
            setProject(projData);
            if (roleData) {
              const otherStaff = roleData.filter((a: any) => a.role !== 'pm' && a.role !== 'client' && a.role !== 'supplier');
              setAssignments(otherStaff);

              const supplierIds = roleData.filter((a: any) => a.role === 'supplier').map((a:any) => a.user_id);
              if (supplierIds.length > 0) {
                 // Fetch POs to compute stats
                 const { data: poData } = await supabase.from('purchase_orders').select('*').eq('project_id', id);
                 const pos = poData || [];

                 const stats = supplierIds.map((sid: string) => {
                    const supName = roleData.find((a:any) => a.user_id === sid)?.profiles?.full_name || 'Unknown Supplier';
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
        console.error('Error fetching project details', err);
        alert(`Error fetching project details: ${err.message || JSON.stringify(err)} | ID: ${id}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchProject();

    const channel = supabase
      .channel('project_roles_' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_role_assignments', filter: `project_id=eq.${id}` }, () => {
        fetchProject();
      })
      .subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleDeleteProject = async () => {
    Alert.alert(
      "Delete Project",
      "Are you sure you want to delete this project? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          setLoading(true);
          try {
            const { error } = await supabase.from('projects').delete().eq('id', id);
            if (error) throw error;
            Alert.alert("Success", "Project deleted successfully");
            router.replace('/admin/projects' as any);
          } catch (err: any) {
            console.error("Failed to delete project", err);
            Alert.alert("Error", err.message || "Failed to delete project");
            setLoading(false);
          }
        }}
      ]
    );
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={project ? project.name : "Project Details"} showAction={false} />
      
      <ScrollView className="flex-1 p-6">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : !project ? (
          <View className="py-20 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
            <Text className="text-gray-400 text-lg font-medium">Project not found.</Text>
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">
            
            {/* Header Card */}
            <View className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6 relative overflow-hidden">
              <View className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full" />
              
              <View className="flex-row justify-between items-start mb-6">
                <View className="flex-1 pr-6">
                  <Text className="text-3xl font-black text-gray-800 mb-2">{project.name}</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <Text className="text-gray-500 ml-1">{project.location}</Text>
                  </View>
                </View>
                
                <View className={`px-4 py-2 rounded-lg ${project.status === 'active' ? 'bg-[#DCFCE7]' : 'bg-gray-100'}`}>
                  <Text className={`font-bold uppercase tracking-wider ${project.status === 'active' ? 'text-brand-success' : 'text-gray-600'}`}>
                    {project.status}
                  </Text>
                </View>
              </View>
              
              {/* Stats Row */}
              <View style={isMobile ? { flexDirection: 'column', gap: 16, paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' } : { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Total Budget</Text>
                  <Text className="text-xl font-bold text-gray-800">
                    Rs. {project.total_budget?.toLocaleString() || 'N/A'}
                  </Text>
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Spent Cost</Text>
                  <Text className="text-xl font-bold text-brand-orange">
                    Rs. {project.spent_cost?.toLocaleString() || '0'}
                  </Text>
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Target End</Text>
                  <Text className="text-lg font-medium text-gray-800">
                    {new Date(project.end_date).toDateString()}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={isMobile ? { flexDirection: 'column', gap: 24 } : { flexDirection: 'row', gap: 24 }}>
              {/* Personnel Details */}
              <View style={isMobile ? { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' } : { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Assigned Personnel</Text>
                
                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-blue-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={20} color="#3B82F6" />
                  </View>
                  <View>
                    <Text className="text-xs text-gray-400 font-bold uppercase">Project Manager</Text>
                    <Text className="text-gray-800 font-medium">{project.pm?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>
                
                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-purple-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="person" size={20} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text className="text-xs text-gray-400 font-bold uppercase">Client</Text>
                    <Text className="text-gray-800 font-medium">{project.client?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                {assignments.length > 0 && (
                  <View className="mt-4 pt-4 border-t border-gray-100">
                    <Text className="text-xs text-gray-400 font-bold uppercase mb-3">Other Assigned Staff</Text>
                    {assignments.map((a: any, i: number) => (
                      <View key={i} className="flex-row items-center mb-3">
                        <View className="w-8 h-8 bg-gray-50 rounded-full items-center justify-center mr-3 border border-gray-200">
                           <Text className="text-gray-500 font-bold text-xs">{a.profiles?.full_name?.charAt(0) || 'U'}</Text>
                        </View>
                        <View>
                          <Text className="text-gray-800 text-sm font-medium">{a.profiles?.full_name || 'Unknown User'}</Text>
                          <Text className="text-xs text-gray-400 capitalize">{a.role.replace('_', ' ')}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Quick Actions */}
              <View className="flex-1 w-full md:w-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                 <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Quick Actions</Text>
                 
                 <TouchableOpacity 
                    onPress={() => router.push(`/admin/projects/${project.id}/milestones`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="flag" size={20} color="#F97316" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800">Manage Milestones</Text>
                      <Text className="text-xs text-gray-500">Track project phases & media</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    onPress={() => router.push(`/admin/projects/${project.id}/expenses`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="cash-outline" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800">Manage Expenses</Text>
                      <Text className="text-xs text-gray-500">Track spent costs dynamically</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    onPress={() => router.push(`/admin/projects/${project.id}/edit`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl border border-gray-200"
                 >
                    <Ionicons name="settings" size={20} color="#3B82F6" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800">Edit Project</Text>
                      <Text className="text-xs text-gray-500">Update budget & details</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    onPress={handleDeleteProject}
                    className="flex-row items-center p-3 bg-red-50 rounded-xl border border-red-200 mt-2"
                 >
                    <Ionicons name="trash" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-red-700">Delete Project</Text>
                      <Text className="text-xs text-red-500">Permanently remove this project</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                 </TouchableOpacity>
              </View>
            </View>

            {/* Assigned Suppliers Section */}
            <View className="mt-8">
               <View className="flex-row justify-between items-center mb-4">
                 <Text className="text-xl font-bold text-gray-800">Assigned Suppliers</Text>
                 <TouchableOpacity onPress={() => router.push(`/admin/projects/${project.id}/edit`)}>
                   <Text className="text-brand-orange font-bold text-sm">Manage</Text>
                 </TouchableOpacity>
               </View>

               {supplierStats.length === 0 ? (
                 <View className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 items-center justify-center">
                   <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
                   <Text className="text-gray-500 font-medium mb-4 text-center">No suppliers assigned yet.</Text>
                   <TouchableOpacity onPress={() => router.push(`/admin/projects/${project.id}/edit`)} className="bg-gray-100 px-6 py-2 rounded-lg">
                     <Text className="text-gray-700 font-bold">Add Supplier</Text>
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
                             <Text className="font-bold text-gray-800" numberOfLines={1}>{stat.name}</Text>
                             <Text className="text-xs text-gray-400">Supplier</Text>
                           </View>
                         </View>
                         
                         <View className="flex-row justify-between mb-2">
                           <Text className="text-sm text-gray-500">Open Orders:</Text>
                           <Text className="text-sm font-bold text-gray-800">{stat.openCount}</Text>
                         </View>
                         <View className="flex-row justify-between mb-2">
                           <Text className="text-sm text-gray-500">Countered/Rejected:</Text>
                           <Text className="text-sm font-bold text-orange-600">{stat.counteredCount}</Text>
                         </View>
                         <View className="flex-row justify-between mb-4">
                           <Text className="text-sm text-gray-500">Last Delivery:</Text>
                           <Text className="text-sm font-medium text-gray-800">{stat.lastDelivery}</Text>
                         </View>

                         <TouchableOpacity 
                           onPress={() => router.push(`/admin/materials/orders?supplier_id=${stat.id}&project_id=${project.id}`)}
                           className="mt-auto bg-gray-50 py-2 rounded-lg items-center border border-gray-200"
                         >
                           <Text className="text-gray-700 font-bold text-sm">View Orders</Text>
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
    </View>
  );
}
