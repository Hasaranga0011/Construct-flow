import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { SearchInput } from '../../../components/common/SearchInput';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

type SupplierSummary = {
	id: string;
	company_name?: string | null;
	email?: string | null;
	orderCount: number;
	orderValue: number;
};

export default function PMSuppliersPage() {
	const router = useRouter();
	const [loadError, setLoadError] = useState('');
	const [retry, setRetry] = useState(0);
	const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');

	useEffect(() => {
		let mounted = true;

		const loadSuppliers = async () => {
			try {
                setLoading(true);
                setLoadError('');
				const { data: sessionData } = await supabase.auth.getSession();
				const pmId = sessionData.session?.user.id;
				if (!pmId) throw new Error('Please sign in again.');

				const { data: projects, error: projectError } = await supabase
					.from('projects')
					.select('id')
					.eq('pm_id', pmId);
				if (projectError) throw projectError;
                const projectIds = (projects || []).map(project => project.id);
				if (projectIds.length === 0) {
					if (mounted) setSuppliers([]);
					return;
				}

				const { data: orders, error: orderError } = await supabase
					.from('purchase_orders')
					.select('supplier_id, total_price')
					.in('project_id', projectIds);
				if (orderError) throw orderError;
                const orderRows = orders || [];
				const supplierIds = [...new Set(orderRows.map(order => order.supplier_id).filter(Boolean))];

				if (supplierIds.length === 0) {
					if (mounted) setSuppliers([]);
					return;
				}

				const { data: supplierRows, error: supplierError } = await supabase
					.from('profiles')
					.select('id, full_name, email')
					.in('id', supplierIds);

				if (supplierError) throw supplierError;
                const summaries = (supplierRows || []).map(supplier => {
					const supplierOrders = orderRows.filter(order => order.supplier_id === supplier.id);
					return {
						id: supplier.id,
						company_name: supplier.full_name,
						email: supplier.email,
						orderCount: supplierOrders.length,
						orderValue: supplierOrders.reduce((total, order) => total + Number(order.total_price || 0), 0),
					};
				});

				if (mounted) setSuppliers(summaries);
			} catch (error: any) {
                if (mounted) setLoadError(error.message || 'Unable to load suppliers');
            } finally {
				if (mounted) setLoading(false);
			}
		};

		loadSuppliers();
		return () => { mounted = false; };
	}, [retry]);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Suppliers for Your Projects" showAction={false} />
			<ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
				<View className="flex-col md:flex-row justify-between items-start md:items-center mb-2 z-50 gap-4">
					<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Project Suppliers</Text>
					<View className="w-full md:w-64">
						<SearchInput 
							placeholder="Search suppliers..." 
							value={search} 
							onChangeText={setSearch} 
							items={suppliers} 
							entityLabel="suppliers" 
							config={{
								table: 'profiles',
								searchColumn: 'company_name',
								secondaryColumn: 'email',
								titleColumn: 'company_name',
								subtitleColumn: 'email'
							}}
						/>
					</View>
				</View>
				<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-6">Supplier activity is limited to purchase orders for projects you manage.</Text>
				{loadError ? <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetry(v => v + 1)}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600">{loadError} ? Tap to retry</Text></Pressable> : loading ? <ActivityIndicator color="#F97316" /> : suppliers.filter(s => (s.company_name || '').toLowerCase().includes(search.toLowerCase()) || (s.email || '').toLowerCase().includes(search.toLowerCase())).length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">No suppliers match your search.</Text>
					</View>
				) : suppliers.filter(s => (s.company_name || '').toLowerCase().includes(search.toLowerCase()) || (s.email || '').toLowerCase().includes(search.toLowerCase())).map(supplier => (
					<Pressable key={supplier.id} onPress={() => router.push(`/pm/suppliers/${supplier.id}` as any)} className="bg-white rounded-xl border border-gray-100 p-5 mb-4 shadow-sm">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">{supplier.company_name || 'Supplier'}</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">{supplier.email || 'Contact details unavailable'}</Text>
						<View className="flex-row flex-wrap gap-4 mt-4">
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Orders: <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{supplier.orderCount}</Text></Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Order value: <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">Rs. {supplier.orderValue.toLocaleString()}</Text></Text>
						</View>
					</Pressable>
				))}
			</ScrollView>
		</View>
	);
}
