import { notify } from '@/utils/notify';
import { positiveQuantity, validReportDate } from '@/utils/siteWorkflow';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { ModalViewport } from '@/components/common/ModalViewport';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { sendSystemNotification } from '../../../../utils/notifications';
import { ProjectAssignmentDropdown } from '../../../../components/common/ProjectAssignmentDropdown';

export default function AdminMaterialsOrdersCreatePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Data arrays
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [projectStockMap, setProjectStockMap] = useState<Record<string, { current_stock: number; minimum_threshold: number; unit: string }>>({});
  const [assignments, setAssignments] = useState<any[]>([]);

  // Selected values
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [materialQuery, setMaterialQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>('Units');

  // Form Inputs
  const [quantity, setQuantity] = useState('');
  const [expectedDate, setExpectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Dropdown states
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const [showMaterialDrop, setShowMaterialDrop] = useState(false);
  const [showUnitDrop, setShowUnitDrop] = useState(false);

  // New Material Modal
  const [showNewMatModal, setShowNewMatModal] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('Units');
  const [newMatCategory, setNewMatCategory] = useState('General');
  const [creatingMaterial, setCreatingMaterial] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user.id;
        const { data: currentProfile } = currentUserId
          ? await supabase.from('profiles').select('role').eq('id', currentUserId).maybeSingle()
          : { data: null };

        // Fetch Suppliers
        const { data: supData, error: supErr } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', 'supplier')
          .order('full_name');
        if (supErr) throw supErr;

        // Fetch Projects
        let projectQuery = supabase
          .from('projects')
          .select('id, name')
          .order('name');
        if (currentProfile?.role === 'pm' && currentUserId) {
          projectQuery = projectQuery.eq('pm_id', currentUserId);
        }
        const { data: projData, error: projErr } = await projectQuery;
        if (projErr) throw projErr;

        // Fetch Catalog via API or distinct materials
        let catalogItems: any[] = [];
        try {
          const catRes = await fetch(`${supabase.supabaseUrl ? '' : ''}/api/materials/catalog`);
          // Or query directly from Supabase:
          const { data: catData } = await supabase.from('material_catalog').select('*').order('name');
          if (catData && catData.length > 0) {
            catalogItems = catData;
          }
        } catch {}

        if (catalogItems.length === 0) {
          // Fallback to distinct existing materials
          const { data: matData } = await supabase.from('materials').select('id, name, unit, category').order('name');
          const distinctMap = new Map();
          (matData || []).forEach(m => {
            const key = (m.name || '').trim();
            if (key && !distinctMap.has(key)) {
              distinctMap.set(key, { id: m.id, name: key, unit: m.unit || 'Units', category: m.category || 'General' });
            }
          });
          catalogItems = Array.from(distinctMap.values());
        }

        // Fetch Assignments
        const { data: assignData } = await supabase
          .from('project_role_assignments')
          .select('project_id, user_id')
          .eq('role', 'supplier');

        if (isMounted) {
          setSuppliers(supData || []);
          setProjects(projData || []);
          setCatalog(catalogItems);
          setAssignments(assignData || []);
        }
      } catch (err: any) {
        if (isMounted) {
          notify('Error loading data', err.message);
        }
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  // When selectedProject changes, load that project's stock rows
  useEffect(() => {
    if (!selectedProject) {
      setProjectStockMap({});
      return;
    }

    const loadProjectStock = async () => {
      const { data } = await supabase
        .from('materials')
        .select('name, catalog_id, current_stock, minimum_threshold, unit')
        .eq('project_id', selectedProject.id);

      const map: Record<string, { current_stock: number; minimum_threshold: number; unit: string }> = {};
      (data || []).forEach(row => {
        if (row.name) {
          map[row.name.trim().toLowerCase()] = {
            current_stock: row.current_stock || 0,
            minimum_threshold: row.minimum_threshold || 10,
            unit: row.unit || 'Units',
          };
        }
        if (row.catalog_id) {
          map[row.catalog_id] = {
            current_stock: row.current_stock || 0,
            minimum_threshold: row.minimum_threshold || 10,
            unit: row.unit || 'Units',
          };
        }
      });
      setProjectStockMap(map);
    };

    loadProjectStock();
  }, [selectedProject]);

  const handleCreateCatalogMaterial = async () => {
    if (!newMatName.trim()) {
      notify('Validation', 'Material name is required.');
      return;
    }
    setCreatingMaterial(true);
    try {
      let createdItem: any = null;
      // Try insert into material_catalog
      const { data, error } = await supabase
        .from('material_catalog')
        .insert([{
          name: newMatName.trim(),
          unit: newMatUnit.trim(),
          category: newMatCategory.trim()
        }])
        .select()
        .single();

      if (!error && data) {
        createdItem = data;
      } else {
        // Fallback: insert into materials table
        const { data: fallbackData, error: fbError } = await supabase
          .from('materials')
          .insert([{
            name: newMatName.trim(),
            project_id: selectedProject?.id,
            unit: newMatUnit.trim(),
            category: newMatCategory.trim(),
            current_stock: 0,
            minimum_threshold: 10
          }])
          .select()
          .single();
        if (fbError) throw fbError;
        createdItem = fallbackData;
      }

      setCatalog(prev => [...prev, createdItem].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedMaterial(createdItem);
      setMaterialQuery(createdItem.name);
      setSelectedUnit(createdItem.unit || 'Units');
      setShowNewMatModal(false);
      setShowMaterialDrop(false);
      setNewMatName('');
      notify('Success', `"${createdItem.name}" added to material catalog.`);
    } catch (err: any) {
      notify('Error', err.message || 'Failed to create material in catalog.');
    } finally {
      setCreatingMaterial(false);
    }
  };

  const handleAssignSuppliers = async (newSupplierIds: string[]) => {
    if (!selectedProject || newSupplierIds.length === 0) return;
    try {
      setLoading(true);
      const inserts = newSupplierIds.map(id => ({
        project_id: selectedProject.id,
        user_id: id,
        role: 'supplier'
      }));
      const { error } = await supabase.from('project_role_assignments').insert(inserts);
      if (error) throw error;

      const newAssignments = [...assignments, ...inserts];
      setAssignments(newAssignments);
      notify('Success', 'Suppliers assigned to project!');
    } catch (err: any) {
      notify('Error', err.message || 'Failed to assign suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!selectedSupplier || !selectedProject || !selectedMaterial || !positiveQuantity(quantity) || !validReportDate(expectedDate)) {
      notify('Validation Error', 'Select an assigned supplier, project, and catalog material, enter a positive quantity and a valid delivery date (YYYY-MM-DD).');
      return;
    }

    setLoading(true);
    try {
      // Generate a random PO Number
      const poNumber = `PO-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      const q = Number(quantity);

      // Construct items string
      const itemsString = selectedMaterial
        ? `${q} ${selectedUnit} of ${selectedMaterial.name}`
        : `${q} ${selectedUnit} of Material`;

      const orderData: any = {
        project_id: selectedProject.id,
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.full_name,
        quantity_ordered: q,
        unit_price: 0,
        total_price: 0,
        po_number: poNumber,
        items: itemsString,
        expected_date: expectedDate,
        status: 'Pending Delivery'
      };

      if (selectedMaterial) {
        orderData.material_id = selectedMaterial.id;
      }

      const { error } = await supabase.from('purchase_orders').insert([orderData]);
      if (error) throw error;

      // Dispatch notification
      await sendSystemNotification(
        'Purchase Order Created',
        `PO #${orderData.po_number} was created for ${selectedMaterial ? selectedMaterial.name : 'materials'}.`,
        'Supplier',
        orderData.supplier_id
      );

      if (Platform.OS === 'web') window.alert('Order created successfully!');
      else Alert.alert('Success', 'Order created successfully!');

      router.back();

    } catch (err: any) {
      const msg = err.message || 'Failed to create order.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Create New Order" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[600px] w-full mx-auto">

          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6">Order Details</Text>

            {/* Project Dropdown */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Assign to Project</Text>
            <View className="relative z-[60] mb-4">
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => { setShowProjectDrop(!showProjectDrop); setShowSupplierDrop(false); setShowMaterialDrop(false); }}
                className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={selectedProject ? "text-gray-800" : "text-gray-400"}>
                  {selectedProject ? selectedProject.name : 'Select project first...'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </Pressable>

              {showProjectDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-[60]">
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                    {projects.length === 0 ? (
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="p-4 text-gray-500">No projects found.</Text>
                    ) : (
                      projects.map(proj => (
                        <Pressable style={{ minHeight: 44, minWidth: 44 }}
                          key={proj.id}
                          onPress={() => { setSelectedProject(proj); setSelectedMaterial(null); setMaterialQuery(''); setSelectedSupplier(null); setShowProjectDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800">{proj.name}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Supplier Dropdown */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Select Supplier</Text>

            {!selectedProject ? (
              <View className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">Please select a project first</Text>
              </View>
            ) : (() => {
              const projectSupplierIds = assignments.filter(a => a.project_id === selectedProject.id).map(a => a.user_id);
              const availableSuppliers = suppliers.filter(s => projectSupplierIds.includes(s.id));

              if (availableSuppliers.length === 0) {
                return (
                  <View className="bg-orange-50 border border-orange-100 p-4 rounded-lg mb-4 z-[50]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-800 font-bold mb-2">No suppliers assigned</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-orange-700 mb-4">You must assign at least one supplier to {selectedProject.name} before ordering.</Text>
                    <ProjectAssignmentDropdown
                      label="Assign Suppliers Now"
                      users={suppliers}
                      multiple
                      selectedIds={[]}
                      onChange={handleAssignSuppliers}
                    />
                  </View>
                );
              }

              return (
                <View className="relative z-[50] mb-4">
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => { setShowSupplierDrop(!showSupplierDrop); setShowProjectDrop(false); setShowMaterialDrop(false); }}
                    className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={selectedSupplier ? "text-gray-800" : "text-gray-400"}>
                      {selectedSupplier ? selectedSupplier.full_name : 'Select an assigned supplier...'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
                  </Pressable>

                  {showSupplierDrop && (
                    <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-[50]">
                      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {availableSuppliers.map(sup => (
                          <Pressable style={{ minHeight: 44, minWidth: 44 }}
                            key={sup.id}
                            onPress={() => { setSelectedSupplier(sup); setShowSupplierDrop(false); }}
                            className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                          >
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{sup.full_name}</Text>
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">{sup.email || 'No email'}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Material Dropdown */}
            <View className="flex-row justify-between items-center mb-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase">Material (Catalog)</Text>
              <Pressable onPress={() => setShowNewMatModal(true)} className="flex-row items-center">
                <Ionicons name="add-circle" size={16} color="#F97316" className="mr-1" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-orange">Add New Material</Text>
              </Pressable>
            </View>

            <View className="relative z-40 mb-4">
              <View className="flex-row justify-between items-center border border-gray-200 rounded-lg bg-gray-50 pr-4">
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  className="flex-1 px-4 py-3 text-sm text-gray-800"
                  placeholder="Search material catalog..."
                  value={materialQuery}
                  onChangeText={(text) => {
                    setMaterialQuery(text);
                    setShowMaterialDrop(true);
                    setSelectedMaterial(null);
                  }}
                  onFocus={() => {
                     setShowMaterialDrop(true);
                     setShowSupplierDrop(false);
                     setShowProjectDrop(false);
                  }}
                />
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" onPress={() => { setShowMaterialDrop(!showMaterialDrop); setShowSupplierDrop(false); setShowProjectDrop(false); }} />
              </View>

              {showMaterialDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-xl max-h-64 z-40">
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                    {(() => {
                      const searchLower = materialQuery.toLowerCase().trim();
                      const filtered = catalog.filter(m => (m.name || '').toLowerCase().includes(searchLower));

                      if (filtered.length === 0) {
                        return (
                          <View className="p-4 items-center">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mb-3">No matching material found in catalog.</Text>
                            <Pressable
                              onPress={() => {
                                setNewMatName(materialQuery);
                                setShowNewMatModal(true);
                                setShowMaterialDrop(false);
                              }}
                              className="bg-orange-50 border border-orange-200 px-4 py-2 rounded-lg flex-row items-center"
                            >
                              <Ionicons name="add-circle-outline" size={18} color="#F97316" className="mr-2" />
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">Add &quot;{materialQuery}&quot; to Catalog</Text>
                            </Pressable>
                          </View>
                        );
                      }

                      // Sort: low-stock items in selected project first, then alphabetical
                      const sorted = [...filtered].sort((a, b) => {
                        const stockA = projectStockMap[a.id] || projectStockMap[(a.name || '').toLowerCase().trim()];
                        const stockB = projectStockMap[b.id] || projectStockMap[(b.name || '').toLowerCase().trim()];
                        const isLowA = stockA && stockA.current_stock < stockA.minimum_threshold ? 1 : 0;
                        const isLowB = stockB && stockB.current_stock < stockB.minimum_threshold ? 1 : 0;
                        if (isLowB !== isLowA) return isLowB - isLowA;
                        return (a.name || '').localeCompare(b.name || '');
                      });

                      // Group by category
                      const groups: Record<string, any[]> = {};
                      sorted.forEach(item => {
                        const cat = item.category || 'General';
                        if (!groups[cat]) groups[cat] = [];
                        groups[cat].push(item);
                      });

                      return Object.entries(groups).map(([cat, items]) => (
                        <View key={cat} className="mb-2">
                          <View className="bg-gray-100 px-4 py-1.5">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{cat}</Text>
                          </View>
                          {items.map(mat => {
                            const stockInfo = projectStockMap[mat.id] || projectStockMap[(mat.name || '').toLowerCase().trim()];
                            const hasStock = !!stockInfo;
                            const isLow = hasStock && stockInfo.current_stock < stockInfo.minimum_threshold;
                            const stockText = hasStock ? `${stockInfo.current_stock} in stock` : 'Not stocked yet';

                            return (
                              <Pressable
                                style={{ minHeight: 44, minWidth: 44 }}
                                key={mat.id || mat.name}
                                onPress={() => {
                                  setSelectedMaterial(mat);
                                  setMaterialQuery(mat.name);
                                  setSelectedUnit(mat.unit || 'Units');
                                  setShowMaterialDrop(false);
                                }}
                                className="px-4 py-2.5 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
                              >
                                <View className="flex-1 mr-2">
                                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium text-sm">{mat.name}</Text>
                                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400">Unit: {mat.unit || 'Units'}</Text>
                                </View>
                                <View className="items-end">
                                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${isLow ? 'text-red-500' : hasStock ? 'text-green-600' : 'text-gray-400'}`}>
                                    {stockText}
                                  </Text>
                                  {isLow && (
                                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-red-400 font-bold">LOW STOCK</Text>
                                  )}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ));
                    })()}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Pricing & Quantities */}
            <View className="flex-row gap-4 mb-4 z-20">
              <View className="flex-[0.5]">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Quantity</Text>
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                  placeholder="e.g. 100"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                />
              </View>

              <View className="flex-[0.5]">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Unit</Text>
                <View className="relative">
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => { setShowUnitDrop(!showUnitDrop); setShowMaterialDrop(false); setShowSupplierDrop(false); setShowProjectDrop(false); }}
                    className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800">{selectedUnit}</Text>
                    <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
                  </Pressable>
                  {showUnitDrop && (
                    <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-50">
                      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {['Bags', 'Cubes', 'Tons', 'Liters', 'Units', 'Pieces'].map(u => (
                          <Pressable style={{ minHeight: 44, minWidth: 44 }}
                            key={u}
                            onPress={() => { setSelectedUnit(u); setShowUnitDrop(false); }}
                            className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                          >
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800">{u}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Expected Delivery Date</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-6 bg-gray-50 z-10"
              placeholder="YYYY-MM-DD"
              value={expectedDate}
              onChangeText={setExpectedDate}
            />

            {/* Submit */}
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={handleSubmit}
              disabled={loading}
              className="bg-brand-orange rounded-xl py-4 items-center shadow-sm z-10"
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Submit Order</Text>
              }
            </Pressable>

          </View>
        </View>
      </ScrollView>

      {/* Add New Material to Catalog Modal */}
      <Modal visible={showNewMatModal} transparent animationType="fade" onRequestClose={() => setShowNewMatModal(false)}>
        <ModalViewport>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ padding: 24 }}
            className="w-full max-w-md max-h-full rounded-2xl bg-white shadow-2xl border border-gray-100"
          >
            <View className="flex-row items-center mb-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-orange-100 mr-3">
                <Ionicons name="cube" size={20} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-900">Add Material to Catalog</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Available across all projects</Text>
              </View>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Material Name</Text>
            <TextInput
              maxFontSizeMultiplier={1.3}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50 mb-4"
              placeholder="e.g. River Sand (Cube)"
              value={newMatName}
              onChangeText={setNewMatName}
            />

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Default Unit</Text>
                <TextInput
                  maxFontSizeMultiplier={1.3}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                  placeholder="e.g. Bags, Cube, Tons"
                  value={newMatUnit}
                  onChangeText={setNewMatUnit}
                />
              </View>
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Category</Text>
                <TextInput
                  maxFontSizeMultiplier={1.3}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                  placeholder="e.g. Raw Material"
                  value={newMatCategory}
                  onChangeText={setNewMatCategory}
                />
              </View>
            </View>

            <View className="flex-row justify-end gap-3 mt-4">
              <Pressable
                onPress={() => setShowNewMatModal(false)}
                disabled={creatingMaterial}
                className="rounded-lg border border-gray-200 px-4 py-2.5"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateCatalogMaterial}
                disabled={creatingMaterial || !newMatName.trim()}
                className={`rounded-lg px-5 py-2.5 flex-row items-center justify-center ${
                  !newMatName.trim() || creatingMaterial ? 'bg-orange-300 opacity-60' : 'bg-brand-orange'
                }`}
              >
                {creatingMaterial && <ActivityIndicator size="small" color="white" className="mr-2" />}
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-white">Save to Catalog</Text>
              </Pressable>
            </View>
          </ScrollView>
        </ModalViewport>
      </Modal>
    </View>
  );
}
