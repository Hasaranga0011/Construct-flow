import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type SupplierSummary = {
	id: string;
	company_name?: string | null;
	contact_person?: string | null;
	email?: string | null;
	orderCount: number;
	orderValue: number;
};

export default function PMSuppliersPage() {
	const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		const loadSuppliers = async () => {
			try {
				const { data: sessionData } = await supabase.auth.getSession();
				const pmId = sessionData.session?.user.id;
				if (!pmId) return;

				const { data: projects } = await supabase
					.from('projects')
					.select('id')
					.eq('pm_id', pmId);
				const projectIds = (projects || []).map(project => project.id);
				if (projectIds.length === 0) {
					if (mounted) setSuppliers([]);
					return;
				}

				const { data: orders } = await supabase
					.from('purchase_orders')
					.select('supplier_id, total_price')
					.in('project_id', projectIds);
				const orderRows = orders || [];
				const supplierIds = [...new Set(orderRows.map(order => order.supplier_id).filter(Boolean))];

				if (supplierIds.length === 0) {
					if (mounted) setSuppliers([]);
					return;
				}

				const { data: supplierRows } = await supabase
					.from('suppliers')
					.select('supplier_id, company_name, contact_person, email')
					.in('supplier_id', supplierIds);

				const summaries = (supplierRows || []).map(supplier => {
					const supplierOrders = orderRows.filter(order => order.supplier_id === supplier.supplier_id);
					return {
						id: supplier.supplier_id,
						company_name: supplier.company_name,
						contact_person: supplier.contact_person,
						email: supplier.email,
						orderCount: supplierOrders.length,
						orderValue: supplierOrders.reduce((total, order) => total + Number(order.total_price || 0), 0),
					};
				});

				if (mounted) setSuppliers(summaries);
			} finally {
				if (mounted) setLoading(false);
			}
		};

		loadSuppliers();
		return () => { mounted = false; };
	}, []);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Suppliers for Your Projects" showAction={false} />
			<ScrollView className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
				<Text className="text-2xl font-bold text-brand-text mb-2">Project Suppliers</Text>
				<Text className="text-gray-500 mb-6">Supplier activity is limited to purchase orders for projects you manage.</Text>
				{loading ? <ActivityIndicator color="#F97316" /> : suppliers.length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text className="text-gray-500">No suppliers are linked to your projects yet.</Text>
					</View>
				) : suppliers.map(supplier => (
					<View key={supplier.id} className="bg-white rounded-xl border border-gray-100 p-5 mb-4 shadow-sm">
						<Text className="text-lg font-bold text-brand-text">{supplier.company_name || 'Supplier'}</Text>
						<Text className="text-gray-500 mt-1">{supplier.contact_person || supplier.email || 'Contact details unavailable'}</Text>
						<View className="flex-row flex-wrap gap-4 mt-4">
							<Text className="text-gray-600">Orders: <Text className="font-bold text-brand-text">{supplier.orderCount}</Text></Text>
							<Text className="text-gray-600">Order value: <Text className="font-bold text-brand-text">Rs. {supplier.orderValue.toLocaleString()}</Text></Text>
						</View>
					</View>
				))}
			</ScrollView>
		</View>
	);
}
