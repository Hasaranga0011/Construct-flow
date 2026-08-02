import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import toast from 'react-hot-toast';

type NewMaterialModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export const NewMaterialModal = ({ visible, onClose, onSuccess }: NewMaterialModalProps) => {
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [unit, setUnit] = useState('Bags');
  
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [dbSuppliers, setDbSuppliers] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch active projects and materials
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchData = async () => {
      setFetchingData(true);
      try {
        const [projectsReq, materialsReq, suppliersReq] = await Promise.all([
          supabase.from('projects').select('id, name').eq('status', 'active'),
          supabase.from('materials').select('id, name'),
          supabase.from('profiles').select('id, full_name').eq('role', 'supplier')
        ]);
        
        if (projectsReq.error) throw projectsReq.error;
        if (materialsReq.error) throw materialsReq.error;
        
        if (isMounted) {
          setProjects(projectsReq.data || []);
          setMaterials(materialsReq.data || []);
          setDbSuppliers(suppliersReq.data || []);
        }
      } catch (err) {
        console.warn('Could not load lookup data for order modal', err);
      } finally {
        if (isMounted) setFetchingData(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [visible]);

  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const handleCreate = async () => {
    if (!supplierName || (!materialId && !materialName) || !projectId || !quantity || !unitPrice || !expectedDate) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await api.purchaseOrders.create({
        supplier_id: supplierId,
        supplier_name: supplierName,
        material_id: materialId || materialName, // fallback to typed name
        project_id: projectId,
        quantity_ordered: Number(quantity),
        unit_price: Number(unitPrice),
        expected_date: expectedDate,
        total_price: totalPrice,
        unit: unit
      });

      // Reset form
      setSupplierId(null);
      setSupplierName('');
      setMaterialId(null);
      setMaterialName('');
      setProjectId(null);
      setQuantity('');
      setUnitPrice('');
      setExpectedDate('');
      
      toast.success('Order created!');
      onSuccess();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/50 items-center justify-center p-4">
        <View className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
          
          {/* Header */}
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text className="text-xl font-bold text-brand-text">New Purchase Order</Text>
            <Pressable onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="p-6 max-h-[70vh]">
            {errorMsg ? (
              <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
                <Text className="text-red-600 text-sm text-center">{errorMsg}</Text>
              </View>
            ) : null}

            {fetchingData ? (
              <View className="py-10 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : (
              <>
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Supplier</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-2">
                    {dbSuppliers.map(sup => (
                      <Pressable
                        key={sup.id}
                        onPress={() => { setSupplierId(sup.id); setSupplierName(sup.full_name); }}
                        className={`px-4 py-2 rounded-full border ${supplierId === sup.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <Text className={`text-sm font-semibold ${supplierId === sup.id ? 'text-white' : 'text-gray-600'}`}>
                          {sup.full_name}
                        </Text>
                      </Pressable>
                    ))}
                    {dbSuppliers.length === 0 && (
                       <Text className="text-gray-400 text-sm italic">No suppliers found. Run SQL mock script.</Text>
                    )}
                  </ScrollView>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Or type a custom supplier name..."
                    value={supplierName}
                    onChangeText={(val) => { setSupplierName(val); setSupplierId(null); }}
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Material</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-2">
                    {materials.map(m => (
                      <Pressable
                        key={m.id}
                        onPress={() => { setMaterialId(m.id); setMaterialName(m.name); }}
                        className={`px-4 py-2 rounded-full border ${materialId === m.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <Text className={`text-sm font-semibold ${materialId === m.id ? 'text-white' : 'text-gray-600'}`}>
                          {m.name}
                        </Text>
                      </Pressable>
                    ))}
                    {materials.length === 0 && (
                       <Text className="text-gray-400 text-sm italic">No materials found.</Text>
                    )}
                  </ScrollView>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Or type a custom material name..."
                    value={materialName}
                    onChangeText={(val) => { setMaterialName(val); setMaterialId(null); }}
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Assign to Project</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                    {projects.map(p => (
                      <Pressable
                        key={p.id}
                        onPress={() => setProjectId(p.id)}
                        className={`px-4 py-2 rounded-full border ${projectId === p.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <Text className={`text-sm font-semibold ${projectId === p.id ? 'text-white' : 'text-gray-600'}`}>
                          {p.name}
                        </Text>
                      </Pressable>
                    ))}
                    {projects.length === 0 && (
                       <Text className="text-gray-400 text-sm italic">No active projects found.</Text>
                    )}
                  </ScrollView>
                </View>

                <View className="flex-row gap-4 mb-4">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">Quantity</Text>
                    <TextInput
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="0"
                      keyboardType="numeric"
                      value={quantity}
                      onChangeText={setQuantity}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">Unit Price (Rs.)</Text>
                    <TextInput
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={unitPrice}
                      onChangeText={setUnitPrice}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Unit Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-2">
                    {['Cubes', 'Packets', 'Liters', 'Bags', 'Tons', 'Meters', 'Pieces'].map(u => (
                      <Pressable
                        key={u}
                        onPress={() => setUnit(u)}
                        className={`px-4 py-2 rounded-full border ${unit === u ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <Text className={`text-sm font-semibold ${unit === u ? 'text-white' : 'text-gray-600'}`}>
                          {u}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <TextInput
                    className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                    placeholder="Or type a custom unit..."
                    value={unit}
                    onChangeText={setUnit}
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">Expected Delivery Date</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <input 
                      type="date"
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors outline-none"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                    />
                  ) : (
                    <TextInput
                      className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                      placeholder="YYYY-MM-DD"
                      value={expectedDate}
                      onChangeText={setExpectedDate}
                    />
                  )}
                </View>

                <View className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <Text className="text-sm font-semibold text-gray-500 mb-1">Total Order Value</Text>
                  <Text className="text-2xl font-bold text-brand-text">
                    Rs. {totalPrice.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </>
            )}

            {/* Footer Buttons */}
            <View className="flex-row gap-4 pt-4 border-t border-gray-100 pb-2">
              <Pressable 
                onPress={onClose}
                disabled={loading}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Text className="text-gray-600 font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleCreate}
                disabled={loading || fetchingData}
                className={`flex-1 bg-brand-orange py-4 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading || fetchingData ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">Create Order</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
};
