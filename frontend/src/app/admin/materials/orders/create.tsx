import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function AdminMaterialsOrdersCreatePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Data arrays
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  // Selected values
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>('Units');

  // Form Inputs
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [expectedDate, setExpectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Dropdown states
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const [showMaterialDrop, setShowMaterialDrop] = useState(false);
  const [showUnitDrop, setShowUnitDrop] = useState(false);

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

        // Fetch Materials
        const { data: matData, error: matErr } = await supabase
          .from('materials')
          .select('id, name')
          .order('name');
        
        // If materials fetch fails (e.g. RLS or table doesn't exist), just ignore
        const validMaterials = matErr ? [] : (matData || []);

        if (isMounted) {
          setSuppliers(supData || []);
          setProjects(projData || []);
          setMaterials(validMaterials);
        }
      } catch (err: any) {
        if (isMounted && Platform.OS !== 'web') {
          Alert.alert('Error loading data', err.message);
        } else if (isMounted && Platform.OS === 'web') {
          console.error('Error loading data', err.message);
        }
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async () => {
    if (!selectedSupplier || !selectedProject || !quantity || !unitPrice) {
      const msg = 'Please select a supplier, project, quantity, and unit price.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    setLoading(true);
    try {
      // Generate a random PO Number
      const poNumber = `PO-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      
      const q = parseFloat(quantity);
      const u = parseFloat(unitPrice);
      const total = q * u;

      // Construct items string
      const itemsString = selectedMaterial 
        ? `${q} ${selectedUnit} of ${selectedMaterial.name}`
        : `${q} ${selectedUnit} of Material`;

      const orderData: any = {
        project_id: selectedProject.id,
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.full_name,
        quantity_ordered: q,
        unit_price: u,
        total_price: total,
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
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[600px] w-full mx-auto">

          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
            <Text className="text-xl font-bold text-gray-800 mb-6">Order Details</Text>

            {/* Supplier Dropdown */}
            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Select Supplier</Text>
            <View className="relative z-[60] mb-4">
              <Pressable 
                onPress={() => { setShowSupplierDrop(!showSupplierDrop); setShowProjectDrop(false); setShowMaterialDrop(false); }}
                className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
              >
                <Text className={selectedSupplier ? "text-gray-800" : "text-gray-400"}>
                  {selectedSupplier ? selectedSupplier.full_name : 'Select a supplier from database...'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </Pressable>
              
              {showSupplierDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-[60]">
                  <ScrollView nestedScrollEnabled={true}>
                    {suppliers.length === 0 ? (
                      <Text className="p-4 text-gray-500">No suppliers found.</Text>
                    ) : (
                      suppliers.map(sup => (
                        <Pressable 
                          key={sup.id} 
                          onPress={() => { setSelectedSupplier(sup); setShowSupplierDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800 font-medium">{sup.full_name}</Text>
                          <Text className="text-xs text-gray-500">{sup.email || 'No email'}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Project Dropdown */}
            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Assign to Project</Text>
            <View className="relative z-[50] mb-4">
              <Pressable 
                onPress={() => { setShowProjectDrop(!showProjectDrop); setShowSupplierDrop(false); setShowMaterialDrop(false); }}
                className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
              >
                <Text className={selectedProject ? "text-gray-800" : "text-gray-400"}>
                  {selectedProject ? selectedProject.name : 'Select project...'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </Pressable>
              
              {showProjectDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-[50]">
                  <ScrollView nestedScrollEnabled={true}>
                    {projects.length === 0 ? (
                      <Text className="p-4 text-gray-500">No projects found.</Text>
                    ) : (
                      projects.map(proj => (
                        <Pressable 
                          key={proj.id} 
                          onPress={() => { setSelectedProject(proj); setShowProjectDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800">{proj.name}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Material Dropdown */}
            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Material</Text>
            <View className="relative z-40 mb-4">
              <Pressable 
                onPress={() => { setShowMaterialDrop(!showMaterialDrop); setShowSupplierDrop(false); setShowProjectDrop(false); }}
                className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
              >
                <Text className={selectedMaterial ? "text-gray-800" : "text-gray-400"}>
                  {selectedMaterial ? selectedMaterial.name : 'Select material (optional)...'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </Pressable>
              
              {showMaterialDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-40">
                  <ScrollView nestedScrollEnabled={true}>
                    {materials.length === 0 ? (
                      <Text className="p-4 text-gray-500">No materials in database.</Text>
                    ) : (
                      materials.map(mat => (
                        <Pressable 
                          key={mat.id} 
                          onPress={() => { setSelectedMaterial(mat); setShowMaterialDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800">{mat.name}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Pricing & Quantities */}
            <View className="flex-row gap-4 mb-4 z-20">
              <View className="flex-[0.5]">
                <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Quantity</Text>
                <TextInput
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                  placeholder="e.g. 100"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                />
              </View>
              
              <View className="flex-[0.5]">
                <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Unit</Text>
                <View className="relative">
                  <Pressable 
                    onPress={() => { setShowUnitDrop(!showUnitDrop); setShowMaterialDrop(false); setShowSupplierDrop(false); setShowProjectDrop(false); }}
                    className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
                  >
                    <Text className="text-gray-800">{selectedUnit}</Text>
                    <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
                  </Pressable>
                  {showUnitDrop && (
                    <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-50">
                      <ScrollView nestedScrollEnabled={true}>
                        {['Bags', 'Cubes', 'Tons', 'Liters', 'Units', 'Pieces'].map(u => (
                          <Pressable 
                            key={u} 
                            onPress={() => { setSelectedUnit(u); setShowUnitDrop(false); }}
                            className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                          >
                            <Text className="text-gray-800">{u}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Unit Price (LKR)</Text>
                <TextInput
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                  placeholder="e.g. 15000"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Expected Delivery Date</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-6 bg-gray-50 z-10"
              placeholder="YYYY-MM-DD"
              value={expectedDate}
              onChangeText={setExpectedDate}
            />

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              className="bg-brand-orange rounded-xl py-4 items-center shadow-sm z-10"
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-bold text-base">Submit Order</Text>
              }
            </Pressable>

          </View>
        </View>
      </ScrollView>
    </View>
  );
}
