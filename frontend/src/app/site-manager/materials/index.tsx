import { RecordCard } from '@/components/common/RecordCard';
import { useResponsive } from '@/hooks/useResponsive';
import { api } from '@/services/api';
import { positiveQuantity } from '@/utils/siteWorkflow';
import { firstRelation } from '@/utils/relations';
import { notify } from '@/utils/notify';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { ModalViewport } from '@/components/common/ModalViewport';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

const COMMON_MATERIALS: Array<{ name: string; unit: string }> = [
  { name: 'Cement (50kg Bag)', unit: 'bags' },
  { name: 'River Sand', unit: 'cubes' },
  { name: 'Aggregate / Crushed Stone', unit: 'cubes' },
  { name: 'Steel Rebar', unit: 'kg' },
  { name: 'Concrete Blocks', unit: 'nos' },
  { name: 'Clay Bricks', unit: 'nos' },
  { name: 'Timber / Plywood', unit: 'sheets' },
  { name: 'PVC Pipes', unit: 'lengths' },
  { name: 'Emulsion Paint', unit: 'liters' },
  { name: 'Ceramic Tiles', unit: 'sq.ft' },
  { name: 'Electrical Wire', unit: 'rolls' },
  { name: 'Nails & Fasteners', unit: 'kg' },
];

export default function SMMaterialsPage() {
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'stock' | 'request' | 'deliveries'>('stock');
  const [projectStock, setProjectStock] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  // Form State
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('units');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [isCustomMaterial, setIsCustomMaterial] = useState(false);

  const materialOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ name: string; unit: string; stock?: number; inProject: boolean }> = [];
    for (const m of projectStock) {
      const name = String(m.name || '').trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      options.push({
        name,
        unit: m.unit || 'units',
        stock: m.current_stock ?? 0,
        inProject: true,
      });
    }
    for (const c of COMMON_MATERIALS) {
      if (seen.has(c.name.toLowerCase())) continue;
      seen.add(c.name.toLowerCase());
      options.push({ name: c.name, unit: c.unit, inProject: false });
    }
    return options;
  }, [projectStock]);

  const filteredMaterialOptions = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materialOptions;
    return materialOptions.filter(opt => opt.name.toLowerCase().includes(q));
  }, [materialOptions, materialSearch]);

  const fetchMaterialsData = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);
      setLoadError('');

      const { data: projectsData, error: projectsError } = assignedProjectIds.length
        ? await supabase.from('projects').select('id, name').in('id', assignedProjectIds)
        : { data: [], error: null };

      if (projectsError) throw projectsError;
      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      if (parsedProjects.length > 0) {
        const currentProject: string = (parsedProjects.some(p => p.id === activeProjectId) ? activeProjectId : parsedProjects[0].id) || '';
        if (currentProject && currentProject !== activeProjectId) setActiveProjectId(currentProject);

        // 2. Fetch materials for the active project
        const { data: stockData, error: stockError } = await supabase
          .from('materials')
          .select('*')
          .eq('project_id', currentProject)
          .order('created_at', { ascending: false });

        if (stockError) throw stockError;
        setProjectStock(stockData || []);

        // 3. Fetch past requests by this user
        const { data: reqData, error: reqError } = await supabase
          .from('material_requests')
          .select('*, projects(name)')
          .eq('requested_by', user.id)
          .eq('project_id', currentProject)
          .order('created_at', { ascending: false });

        if (reqError) throw reqError;
        setMyRequests((reqData || []).map(req => ({ ...req, projects: firstRelation(req.projects) })));

        // 4. Fetch incoming deliveries for this project
        const { data: delData, error: delError } = await supabase
          .from('purchase_orders')
          .select('*')
          .eq('project_id', currentProject)
          .eq('status', 'Delivered')
          .order('delivered_at', { ascending: false });

        if (delError) throw delError;
        setDeliveries((delData || []).map(del => ({ ...del, material: (stockData || []).find(m => m.id === del.material_id) })));
      } else {
        setActiveProjectId(null); setProjectStock([]); setMyRequests([]); setDeliveries([]);
      }
    } catch (error: any) {
      setLoadError(error.message || 'Unable to load materials.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, activeProjectId]);

  useEffect(() => { fetchMaterialsData(); }, [fetchMaterialsData]);

  const handleSubmitRequest = async () => {
    if (submitting) return;
    if (!itemName.trim() || !positiveQuantity(quantity) || !unit.trim() || !activeProjectId || !user?.id) {
      notify('Error', 'Enter an item, unit and a quantity greater than zero.');
      return;
    }

    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('material_requests')
        .insert({
          project_id: activeProjectId,
          requested_by: user.id,
          item_name: itemName.trim(),
          quantity: Number(quantity),
          unit: unit.trim(),
          status: 'Pending Approval'
        });

      if (error) throw error;

      notify('Success', 'Material request submitted to Project Manager!');
      setItemName('');
      setQuantity('');
      setIsCustomMaterial(false);
      setActiveTab('request');
      await fetchMaterialsData();
    } catch (error: any) {
      notify('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveDelivery = async (poId: string) => {
    if (receiving) return;
    setReceiving(poId);
    try {
      await api.purchaseOrders.receive(poId);
      notify('Success', 'Goods received and stock updated!');
      await fetchMaterialsData();
    } catch (e: any) {
      notify('Error', e.message);
    } finally { setReceiving(null); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending Approval': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-blue-100 text-blue-800';
      case 'Ordered': return 'bg-purple-100 text-purple-800';
      case 'Delivered': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Materials" actionLabel="Refresh" onActionPress={() => { fetchMaterialsData(); } } />
      {loadError || assignmentError ? <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => { refreshAssignments(); fetchMaterialsData(); }} className="bg-red-50 p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError} Tap to retry.</Text></Pressable> : null}

      {projects.length > 0 && (
        <View className="bg-white px-6 pt-4 border-b border-gray-200">
          <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {projects.map(project => (
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                key={project.id}
                onPress={() => setActiveProjectId(project.id)}
                className={`mr-6 pb-3 border-b-2 ${activeProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                  {project.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View><ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          onPress={() => setActiveTab('stock')}
          className={`pb-3 mr-8 border-b-2 ${activeTab === 'stock' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeTab === 'stock' ? 'text-brand-text' : 'text-gray-500'}`}>Current Stock</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          onPress={() => setActiveTab('request')}
          className={`pb-3 mr-8 border-b-2 ${activeTab === 'request' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeTab === 'request' ? 'text-brand-text' : 'text-gray-500'}`}>Request Materials</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          onPress={() => setActiveTab('deliveries')}
          className={`pb-3 border-b-2 ${activeTab === 'deliveries' ? 'border-brand-text' : 'border-transparent'}`}
        >
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeTab === 'deliveries' ? 'text-brand-text' : 'text-gray-500'}`}>Incoming Deliveries</Text>
        </Pressable>
      </ScrollView></View>

      <View className="flex-1 p-4">
        {loading || sitesLoading ? (
          <ActivityIndicator size="large" color="#F97316" style={{ marginTop: 40 }} />
        ) : assignedProjectIds.length === 0 ? (
          <NoAssignedSites />
        ) : activeTab === 'stock' ? (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
            <View className="hidden lg:flex flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[2] text-xs font-bold text-gray-500 uppercase">Item Name</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-bold text-gray-500 uppercase">Stock</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-bold text-gray-500 uppercase">Status</Text>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {projectStock.length === 0 ? (
                <View className="p-10 items-center justify-center">
                  <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4">No materials recorded for this project yet.</Text>
                </View>
              ) : (
                projectStock.map(item => {
                  const isLow = (item.current_stock || 0) < (item.minimum_threshold || 0);
                  if (isMobile) return <RecordCard key={item.id} title={item.name} fields={[{ label: 'Stock', value: `${item.current_stock ?? 0} ${item.unit || ''}` }, { label: 'Status', value: isLow ? 'Low stock' : 'In stock' }]} action={{ label: 'Request material', onPress: () => { setIsCustomMaterial(false); setItemName(item.name); setUnit(item.unit || ''); setActiveTab('request'); } }} />;
                  return (
                    <View key={item.id} className="flex-row items-center py-4 px-6 border-b border-gray-50">
                      <View className="flex-[2]">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{item.name}</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs">{item.unit}</Text>
                      </View>
                      <View className="flex-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold ${isLow ? 'text-red-500' : 'text-brand-text'}`}>
                          {item.current_stock ?? 0}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <View className={`self-start px-2 py-1 rounded ${isLow ? 'bg-red-100' : 'bg-green-100'}`}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${isLow ? 'text-red-700' : 'text-green-700'}`}>
                            {isLow ? 'Low Stock' : 'OK'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        ) : activeTab === 'request' ? (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1" keyboardShouldPersistTaps="handled">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6">New Material Request</Text>

              <View>
                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Material Item</Text>

                  <Pressable
                    style={{ minHeight: 48, minWidth: 44 }}
                    onPress={() => setMaterialDropdownOpen(true)}
                    className="border border-gray-200 rounded-xl px-4 py-3.5 bg-gray-50 flex-row items-center justify-between"
                  >
                    <Text
                      style={{ flexShrink: 1, minWidth: 0 }}
                      maxFontSizeMultiplier={1.3}
                      className={`text-sm font-medium ${itemName || isCustomMaterial ? 'text-gray-800' : 'text-gray-400'}`}
                    >
                      {isCustomMaterial ? (itemName ? `Other: ${itemName}` : 'Other (Custom Material)') : (itemName || 'Select a material...')}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#6B7280" />
                  </Pressable>

                  {isCustomMaterial && (
                    <TextInput
                      maxFontSizeMultiplier={1.3}
                      style={{ minHeight: 44, minWidth: 44 }}
                      value={itemName}
                      onChangeText={setItemName}
                      placeholder="Enter custom material name..."
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50 mt-3"
                    />
                  )}
                </View>

                <View className="flex-row gap-4 mb-4">
                  <View className="flex-[2]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Quantity</Text>
                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                      value={quantity}
                      onChangeText={setQuantity}
                      placeholder="e.g. 50"
                      keyboardType="numeric"
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                    />
                  </View>
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Unit</Text>
                    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                      value={unit}
                      onChangeText={setUnit}
                      placeholder="bags, tons..."
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                    />
                  </View>
                </View>

                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={handleSubmitRequest}
                  disabled={submitting}
                  className="bg-brand-orange py-4 rounded-xl mt-4 items-center"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">{submitting ? 'Submitting...' : 'Submit Request to PM'}</Text>
                </Pressable>
              </View>
            </View>

            {/* Request History */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 px-2">My Recent Requests</Text>
            {myRequests.length === 0 && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4">No requests for this project yet.</Text>}
            {myRequests.map(req => (
              <View key={req.id} className="bg-white p-4 rounded-xl border border-gray-200 mb-3 flex-row flex-wrap gap-3 items-center justify-between shadow-sm">
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">{req.item_name}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">{req.quantity} {req.unit} • {req.projects?.name}</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-md ${getStatusColor(req.status).split(' ')[0]}`}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${getStatusColor(req.status).split(' ')[1]}`}>{req.status}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1" keyboardShouldPersistTaps="handled">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-6">Incoming Deliveries</Text>
            {deliveries.length === 0 ? (
              <View className="p-10 items-center justify-center bg-white rounded-2xl border border-gray-100">
                <Ionicons name="checkmark-done-circle-outline" size={48} color="#D1D5DB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 font-medium">No pending deliveries for this project.</Text>
              </View>
            ) : (
              deliveries.map(del => (
                <View key={del.id} className="bg-white p-6 rounded-2xl border border-gray-200 mb-4 flex-row flex-wrap gap-4 items-center justify-between shadow-sm">
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg text-brand-text">{del.po_number}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-1">{del.material?.name || del.items || del.material_id} • {del.quantity_ordered} {del.material?.unit}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-1">Dispatched: {del.delivered_at ? new Date(del.delivered_at).toLocaleDateString() : 'Not recorded'}</Text>
                  </View>
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => handleReceiveDelivery(del.id)}
                    disabled={receiving !== null}
                    className="bg-brand-success px-4 py-2 rounded-lg"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{receiving === del.id ? 'Receiving...' : 'Confirm Receipt'}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
      <Modal
        visible={materialDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMaterialDropdownOpen(false)}
      >
        <ModalViewport>
          <View className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800">
                Select Material
              </Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setMaterialDropdownOpen(false)} className="items-center justify-center">
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            <View className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <TextInput
                maxFontSizeMultiplier={1.3}
                style={{ minHeight: 42 }}
                value={materialSearch}
                onChangeText={setMaterialSearch}
                placeholder="Search materials..."
                className="bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800"
              />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" className="px-3 py-2">
              {filteredMaterialOptions.map(opt => {
                const selected = !isCustomMaterial && itemName === opt.name;
                return (
                  <Pressable
                    key={opt.name}
                    style={{ minHeight: 48 }}
                    onPress={() => {
                      setIsCustomMaterial(false);
                      setItemName(opt.name);
                      setUnit(opt.unit || 'units');
                      setMaterialSearch('');
                      setMaterialDropdownOpen(false);
                    }}
                    className={`flex-row items-center justify-between px-3 py-3 rounded-xl mb-1 ${selected ? 'bg-orange-50 border border-brand-orange' : 'bg-white'}`}
                  >
                    <View className="flex-1 pr-3">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-sm ${selected ? 'text-brand-orange' : 'text-gray-800'}`}>
                        {opt.name}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 mt-0.5">
                        {opt.inProject ? `In project stock: ${opt.stock ?? 0} ${opt.unit}` : `Standard unit: ${opt.unit}`}
                      </Text>
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={20} color="#F97316" />}
                  </Pressable>
                );
              })}

              <Pressable
                style={{ minHeight: 48 }}
                onPress={() => {
                  setIsCustomMaterial(true);
                  setItemName('');
                  setMaterialSearch('');
                  setMaterialDropdownOpen(false);
                }}
                className={`flex-row items-center justify-between px-3 py-3 rounded-xl mt-1 mb-2 border ${isCustomMaterial ? 'bg-orange-50 border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="add-circle-outline" size={18} color="#F97316" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-sm text-gray-800">
                    Other (Enter custom material)
                  </Text>
                </View>
                {isCustomMaterial && <Ionicons name="checkmark-circle" size={20} color="#F97316" />}
              </Pressable>
            </ScrollView>
          </View>
        </ModalViewport>
      </Modal>
    </View>
  );
}
