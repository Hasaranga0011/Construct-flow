import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../../lib/supabase';

type Material = { id: string; name?: string | null; item_name?: string | null; unit?: string | null; quantity?: number | string | null; current_stock?: number | null; min_quantity?: number | null; minimum_threshold?: number | null; unit_price?: number | null; project_id?: string | null };
type PurchaseOrder = { id: string; po_number?: string | null; status?: string | null; quantity_ordered?: number | null; total_price?: number | null; expected_date?: string | null };

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;

export default function AdminMaterialDetailPage() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [material, setMaterial] = useState<Material | null>(null);
	const [orders, setOrders] = useState<PurchaseOrder[]>([]);
	const [name, setName] = useState('');
	const [unit, setUnit] = useState('');
	const [quantity, setQuantity] = useState('');
	const [unitPrice, setUnitPrice] = useState('');
	const [editing, setEditing] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	useEffect(() => {
		if (!id) return;
		let isMounted = true;
		const loadDetail = async () => {
			if (!isMounted) return;
			setLoading(true);
			setError(null);
			try {
				const [materialResponse, orderResponse] = await Promise.all([
					supabase.from('materials').select('*').eq('id', id).single(),
					supabase.from('purchase_orders').select('id, po_number, status, quantity_ordered, total_price, expected_date').eq('material_id', id).order('created_at', { ascending: false }),
				]);
				if (materialResponse.error) throw materialResponse.error;
				if (orderResponse.error) throw orderResponse.error;
				if (isMounted) {
					const record = materialResponse.data as Material;
					setMaterial(record);
					setName(record.name || record.item_name || '');
					setUnit(record.unit || '');
					setQuantity(String(record.quantity ?? record.current_stock ?? ''));
					setUnitPrice(String(record.unit_price ?? ''));
					setOrders((orderResponse.data || []) as PurchaseOrder[]);
				}
			} catch (loadError: any) {
				if (isMounted) setError(loadError.message || 'Failed to load material details.');
			} finally {
				if (isMounted) setLoading(false);
			}
		};
		loadDetail();
		const channel = supabase.channel(`admin-material:${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'materials', filter: `id=eq.${id}` }, () => setRefreshTrigger(value => value + 1)).on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => setRefreshTrigger(value => value + 1)).subscribe();
		return () => { isMounted = false; supabase.removeChannel(channel); };
	}, [id, refreshTrigger]);

	const save = async () => {
		if (!id || !name.trim() || !unit.trim() || !Number.isFinite(Number(quantity)) || !Number.isFinite(Number(unitPrice))) {
			setError('Enter a name, unit, quantity, and valid unit price.');
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const { error: updateError } = await supabase.from('materials').update({ name: name.trim(), unit: unit.trim(), quantity: Number(quantity), unit_price: Number(unitPrice) }).eq('id', id);
			if (updateError) throw updateError;
			setEditing(false);
			setRefreshTrigger(value => value + 1);
		} catch (saveError: any) {
			setError(saveError.message || 'Failed to save material.');
		} finally {
			setSaving(false);
		}
	};

	return <View className="flex-1 bg-brand-light"><TopNav title={material?.name || material?.item_name || 'Material Detail'} showAction={false} /><ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>{loading ? <View className="flex-1 items-center py-16"><ActivityIndicator color="#F97316" /></View> : error && !material ? <View className="bg-red-50 border border-red-200 rounded-2xl p-6"><Text className="text-red-700">{error}</Text></View> : !material ? <View className="items-center py-16"><Ionicons name="cube-outline" size={48} color="#D1D5DB" /><Text className="text-gray-500 mt-4">Material not found.</Text></View> : <><View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6"><View className="flex-row justify-between items-center mb-5"><Text className="text-xl font-bold text-brand-text">Material details</Text><Pressable onPress={() => editing ? save() : setEditing(true)} disabled={saving} className="bg-brand-orange px-4 py-2 rounded-lg"><Text className="text-white font-bold">{saving ? 'Saving...' : editing ? 'Save' : 'Edit'}</Text></Pressable></View>{error && <Text className="text-red-600 mb-4">{error}</Text>}{editing ? <><TextInput value={name} onChangeText={setName} className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-3" placeholder="Material name" /><TextInput value={unit} onChangeText={setUnit} className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-3" placeholder="Unit" /><TextInput value={quantity} onChangeText={setQuantity} keyboardType="numeric" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-3" placeholder="Quantity" /><TextInput value={unitPrice} onChangeText={setUnitPrice} keyboardType="numeric" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text" placeholder="Unit price (LKR)" /></> : <View className="gap-3"><Text className="text-gray-600">Unit: <Text className="font-bold text-brand-text">{material.unit || 'Not set'}</Text></Text><Text className="text-gray-600">Quantity: <Text className="font-bold text-brand-text">{material.quantity ?? material.current_stock ?? 0}</Text></Text><Text className="text-gray-600">Unit price: <Text className="font-bold text-brand-text">{formatCurrency(Number(material.unit_price || 0))}</Text></Text><Text className="text-gray-600">Minimum quantity: <Text className="font-bold text-brand-text">{material.min_quantity ?? material.minimum_threshold ?? 0}</Text></Text></View>}</View><View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"><Text className="text-lg font-bold text-brand-text mb-5">Purchase orders</Text>{orders.length === 0 ? <Text className="text-gray-500">No purchase orders for this material.</Text> : orders.map(order => <View key={order.id} className="border-b border-gray-100 py-4 last:border-b-0"><View className="flex-row justify-between"><Text className="font-bold text-brand-text">{order.po_number || order.id}</Text><Text className="text-gray-500 text-xs">{order.status || 'Unknown'}</Text></View><Text className="text-gray-500 text-sm mt-2">Quantity {order.quantity_ordered || 0} · {formatCurrency(Number(order.total_price || 0))}</Text><Text className="text-gray-400 text-xs mt-1">Expected {order.expected_date ? new Date(order.expected_date).toLocaleDateString('en-GB') : 'Not set'}</Text></View>)}</View></>}</ScrollView></View>;
}
