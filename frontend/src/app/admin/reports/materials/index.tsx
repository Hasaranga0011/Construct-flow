import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { api } from '../../../../services/api';
import { supabase } from '../../../../lib/supabase';

type Material = { id: string; current_stock?: number | null; minimum_threshold?: number | null };
type PurchaseOrder = { id: string; status?: string | null };
type MaterialReport = { total_materials?: number; data?: Material[] };

const statusOrder = ['Pending Delivery', 'Confirmed', 'Delivered', 'Cancelled', 'Rejected', 'Suggested'];

export default function AdminMaterialsReportsPage() {
	const [materials, setMaterials] = useState<Material[]>([]);
	const [orders, setOrders] = useState<PurchaseOrder[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	useEffect(() => {
		let isMounted = true;
		const loadReport = async () => {
			if (!isMounted) return;
			setLoading(true);
			setError(null);
			try {
				const report = await api.reports.materials() as MaterialReport;
				const { data: orderData, error: orderError } = await supabase
					.from('purchase_orders')
					.select('id, status')
					.order('created_at', { ascending: false });
				if (orderError) throw orderError;
				if (isMounted) {
					setMaterials(report.data || []);
					setOrders((orderData || []) as PurchaseOrder[]);
				}
			} catch (loadError: any) {
				if (isMounted) setError(loadError.message || 'Failed to load material reports.');
			} finally {
				if (isMounted) setLoading(false);
			}
		};
		loadReport();
		const polling = setInterval(() => {
			if (isMounted) setRefreshTrigger(value => value + 1);
		}, 30000);
		const channel = supabase
			.channel('admin-material-reports')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => {
				if (isMounted) setRefreshTrigger(value => value + 1);
			})
			.on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
				if (isMounted) setRefreshTrigger(value => value + 1);
			})
			.subscribe();
		return () => {
			isMounted = false;
			clearInterval(polling);
			supabase.removeChannel(channel);
		};
	}, [refreshTrigger]);

	const lowStockCount = materials.filter(material => Number(material.current_stock || 0) < Number(material.minimum_threshold || 0)).length;
	const statusCounts = useMemo(() => orders.reduce<Record<string, number>>((counts, order) => {
		const status = order.status || 'Unknown';
		counts[status] = (counts[status] || 0) + 1;
		return counts;
	}, {}), [orders]);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Material Reports" showAction={false} />
			<ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
				{loading ? (
					<View className="gap-4"><View className="flex-row gap-4"><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /></View><View className="h-64 bg-gray-100 rounded-2xl animate-pulse" /></View>
				) : error ? (
					<View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center"><Text className="text-red-700 text-center">{error}</Text><Pressable onPress={() => setRefreshTrigger(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text className="text-white font-bold">Retry</Text></Pressable></View>
				) : materials.length === 0 && orders.length === 0 ? (
					<View className="bg-white border border-gray-100 rounded-2xl p-10 items-center"><Ionicons name="cube-outline" size={48} color="#D1D5DB" /><Text className="text-gray-700 font-bold mt-4">No material report data</Text><Text className="text-gray-500 text-center mt-2">Material and purchase-order activity will appear after records are created.</Text></View>
				) : (
					<>
						<Text className="text-2xl font-bold text-brand-text mb-2">Material Performance</Text>
						<Text className="text-gray-500 mb-6">Inventory health and purchase-order delivery status.</Text>
						<View className="flex-row flex-wrap gap-4 mb-6">
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Total materials</Text><Text className="text-3xl font-bold text-brand-text mt-2">{materials.length}</Text></View>
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Low stock</Text><Text className="text-3xl font-bold text-brand-danger mt-2">{lowStockCount}</Text></View>
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Pending orders</Text><Text className="text-3xl font-bold text-brand-orange mt-2">{statusCounts['Pending Delivery'] || 0}</Text></View>
						</View>
						<View className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm"><Text className="text-lg font-bold text-brand-text mb-5">Delivery status</Text>{statusOrder.map(status => <View key={status} className="flex-row justify-between items-center py-3 border-b border-gray-100 last:border-b-0"><Text className="text-gray-600">{status}</Text><Text className="text-brand-text font-bold">{statusCounts[status] || 0}</Text></View>)}{statusCounts.Unknown && <View className="flex-row justify-between items-center py-3"><Text className="text-gray-600">Unknown</Text><Text className="text-brand-text font-bold">{statusCounts.Unknown}</Text></View>}</View>
					</>
				)}
			</ScrollView>
		</View>
	);
}
