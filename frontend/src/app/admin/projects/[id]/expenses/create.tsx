import { DateField } from '@/components/common/DateField';
import { getApiUrl } from '../../../../../lib/apiUrl';
import { BoqItemSelect } from '@/components/projects/BoqItemSelect';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toast } from '../../../../../lib/toast';
import { useResponsive } from '@/hooks/useResponsive';

const EXPENSE_CATEGORIES = ['Material', 'Labour', 'Equipment', 'Other'] as const;

export default function AdminCreateExpensePage() {
  const { isMobile } = useResponsive();
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();

  const [category, setCategory] = useState<string>('Material');
  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [quantityUsed, setQuantityUsed] = useState<string>('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [boqItemId, setBoqItemId] = useState('');

  useEffect(() => {
    const pid = Array.isArray(projectId) ? projectId[0] : projectId;
    if (!pid) return;
    supabase
      .from('materials')
      .select('id, name, unit, unit_price, current_stock, quantity')
      .eq('project_id', pid)
      .order('name')
      .then(({ data }) => {
        if (data) setMaterials(data);
      });
  }, [projectId]);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId);

  const handleSelectMaterial = (mat: any) => {
    setSelectedMaterialId(mat.id);
    if (!form.title.trim()) {
      setForm(prev => ({ ...prev, title: `${mat.name} Usage` }));
    }
    const qtyNum = parseFloat(quantityUsed);
    const price = Number(mat.unit_price || 0);
    if (!isNaN(qtyNum) && qtyNum > 0 && price > 0) {
      setForm(prev => ({ ...prev, amount: '0' }));
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantityUsed(val);
    const qtyNum = parseFloat(val);
    const price = Number(selectedMaterial?.unit_price || 0);
    if (!isNaN(qtyNum) && qtyNum > 0 && price > 0) {
      setForm(prev => ({ ...prev, amount: '0' }));
    }
  };

  const handleSubmit = async () => {
    if (!form.title || !form.amount) {
      toast.error('Title and Amount are required');
      return;
    }

    const qtyNum = quantityUsed ? parseFloat(quantityUsed) : undefined;
    if (category === 'Material' && selectedMaterial && qtyNum && qtyNum > Number(selectedMaterial.current_stock || 0)) {
      toast.error(`Requested quantity (${qtyNum}) exceeds current stock (${selectedMaterial.current_stock || 0}). Stock will drop to 0.`);
    }

    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();

      const payload: any = {
        boq_item_id: boqItemId || undefined,
        project_id: Array.isArray(projectId) ? projectId[0] : projectId,
        title: form.title,
        description: form.description || null,
        amount: parseFloat(form.amount),
        expense_date: form.expense_date,
        category,
      };
      if (category === 'Material' && selectedMaterialId) {
        payload.material_id = selectedMaterialId;
        if (qtyNum && qtyNum > 0) {
          payload.quantity_used = qtyNum;
        }
      }

      const response = await fetch(`${getApiUrl()}/projects/${payload.project_id}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to create expense");
      }

      toast.success(
        payload.material_id && payload.quantity_used
          ? 'Expense logged & material stock deducted!'
          : 'Expense added successfully'
      );
      router.back();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <TopNav title="Add Expense" showBackButton />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'p-4' : 'p-6'}`}>
        <View className="bg-white dark:bg-[#1E293B] rounded-3xl p-6 shadow-sm mb-10 border border-gray-100 dark:border-gray-800 max-w-2xl w-full mx-auto">

          <BoqItemSelect expenseContext projectId={String(projectId || '')} value={boqItemId} onChange={id => setBoqItemId(id)} />
          {/* Expense Category Selector */}
          <View className="mb-5">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-gray-300 font-bold mb-2">
              Expense Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-xl border ${
                    category === cat
                      ? 'bg-brand-orange border-brand-orange'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <Text className={`text-xs font-bold ${category === cat ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Material Selection & Auto Stock Deduction */}
          {category === 'Material' && materials.length > 0 && (
            <View className="mb-5 bg-orange-50/70 dark:bg-gray-800/60 border border-orange-200 dark:border-gray-700 rounded-2xl p-4">
              <Text className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2">
                Select Project Material (Auto-deducts from Stock)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                <View className="flex-row gap-2">
                  {materials.map((mat) => {
                    const active = selectedMaterialId === mat.id;
                    return (
                      <Pressable
                        key={mat.id}
                        onPress={() => handleSelectMaterial(mat)}
                        className={`px-3 py-2 rounded-xl border ${
                          active
                            ? 'bg-brand-orange border-brand-orange'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                          {mat.name}
                        </Text>
                        <Text className={`text-[10px] ${active ? 'text-orange-100' : 'text-gray-500'}`}>
                          Stock: {mat.current_stock ?? 0} {mat.unit || 'units'} • Rs. {mat.unit_price || 0}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {selectedMaterial && (
                <View className="mt-1">
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Quantity Used ({selectedMaterial.unit || 'units'}) — Available: {selectedMaterial.current_stock ?? 0}
                  </Text>
                  <TextInput
                    maxFontSizeMultiplier={1.3}
                    style={{ minHeight: 42 }}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm text-gray-800 dark:text-white font-semibold"
                    placeholder={`e.g. 10 ${selectedMaterial.unit || ''}`}
                    keyboardType="numeric"
                    value={quantityUsed}
                    onChangeText={handleQuantityChange}
                  />
                </View>
              )}
            </View>
          )}

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-gray-300 font-bold mb-2">Expense Title *</Text>
            <View className="flex-row items-center bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
              <Ionicons name="pricetag-outline" size={20} color="#9CA3AF" className="mr-3" />
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 text-gray-800 dark:text-white font-medium"
                placeholder="e.g., Cement Bags, Site Equipment"
                placeholderTextColor="#9CA3AF"
                value={form.title}
                onChangeText={(t) => setForm({...form, title: t})}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-gray-300 font-bold mb-2">Amount (Rs.) *</Text>
            {category === 'Material' && !!selectedMaterialId && Number(quantityUsed) > 0 && <Text className="text-sm text-slate-500 mb-3">Stock usage is recorded at Rs. 0 additional expense: received goods are already included in project cost. Record transport or other additional charges separately.</Text>}
            <View className="flex-row items-center bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
              <Ionicons name="cash-outline" size={20} color="#EF4444" className="mr-3" />
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 text-gray-800 dark:text-white font-medium"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={form.amount}
                editable={!(category === 'Material' && !!selectedMaterialId && Number(quantityUsed) > 0)}
                onChangeText={(t) => setForm({...form, amount: t})}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-gray-300 font-bold mb-2">Expense Date *</Text>
            <View className="w-full">
              <DateField label="Expense Date" value={form.expense_date} onChange={(t) => setForm({...form, expense_date: t})} />
            </View>
          </View>

          <View className="mb-6">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-gray-300 font-bold mb-2">Description (Optional)</Text>
            <View className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-h-[100px]">
              <TextInput maxFontSizeMultiplier={1.3}
                className="flex-1 text-gray-800 dark:text-white font-medium text-left align-top"
                placeholder="Add any extra details about this expense..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={form.description}
                onChangeText={(t) => setForm({...form, description: t})}
              />
            </View>
          </View>

          <Pressable style={{ minHeight: 48 }}
            onPress={handleSubmit}
            disabled={loading}
            className={`py-4 rounded-xl items-center justify-center flex-row ${loading ? 'bg-orange-400' : 'bg-brand-orange'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="white" className="mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">
                  Save Expense
                </Text>
              </>
            )}
          </Pressable>

        </View>
      </ScrollView>
    </View>
  );
}
