import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { SearchInput } from '../../../components/common/SearchInput';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';
import { RoleAvatar } from '@/components/common/RoleAvatar';
import { StatCard } from '@/components/common/StatCard';
import { AnimatedCard } from '@/components/common/AnimatedCard';

type SupplierSummary = {
	id: string;
	company_name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
	contact_number?: string | null;
	supplier_type?: string | null;
	created_at?: string | null;
	orderCount: number;
	activeOrders: number;
	orderValue: number;
};

export default function PMSuppliersPage() {
	const router = useRouter();
	const { isMobile } = useResponsive();
	const [loadError, setLoadError] = useState('');
	const [retry, setRetry] = useState(0);
	const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

	const [stats, setStats] = useState({
		totalSuppliers: 0,
		activeOrders: 0,
		recentDeliveries: 0,
		totalProcurement: 0,
	});

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
					if (mounted) {
						setSuppliers([]);
						setStats({ totalSuppliers: 0, activeOrders: 0, recentDeliveries: 0, totalProcurement: 0 });
					}
					return;
				}

				const { data: orders, error: orderError } = await supabase
					.from('purchase_orders')
					.select('id, supplier_id, status, total_price, created_at')
					.in('project_id', projectIds);
				if (orderError) throw orderError;
				const orderRows = orders || [];
				const supplierIds = [...new Set(orderRows.map(order => order.supplier_id).filter(Boolean))];

				const activeStatuses = ['Pending Delivery', 'Suggested', 'Confirmed'];
				const activeOrders = orderRows.filter(o => !!o.status && activeStatuses.includes(o.status)).length;
				const recentDeliveries = orderRows.filter(o => o.status === 'Delivered' && !!o.created_at && new Date(o.created_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)).length;
				const totalProcurement = orderRows.filter(o => o.status === 'Delivered').reduce((total, order) => total + Number(order.total_price || 0), 0);

				if (supplierIds.length === 0) {
					if (mounted) {
						setSuppliers([]);
						setStats({ totalSuppliers: 0, activeOrders, recentDeliveries, totalProcurement });
					}
					return;
				}

				const { data: supplierRows, error: supplierError } = await supabase
					.from('profiles')
					.select('id, full_name, email, avatar_url, company_name, supplier_type, contact_number, created_at')
					.in('id', supplierIds);

				if (supplierError) throw supplierError;
				const summaries: SupplierSummary[] = (supplierRows || []).map(supplier => {
					const supplierOrders = orderRows.filter(order => order.supplier_id === supplier.id);
					return {
						id: supplier.id || '',
						company_name: supplier.full_name || supplier.company_name,
						email: supplier.email,
						avatar_url: supplier.avatar_url,
						contact_number: supplier.contact_number,
						supplier_type: supplier.supplier_type,
						created_at: supplier.created_at,
						orderCount: supplierOrders.length,
						activeOrders: supplierOrders.filter(o => !!o.status && activeStatuses.includes(o.status)).length,
						orderValue: supplierOrders.filter(o => o.status === 'Delivered').reduce((total, order) => total + Number(order.total_price || 0), 0),
					};
				});

				if (mounted) {
					setSuppliers(summaries);
					setStats({
						totalSuppliers: supplierIds.length,
						activeOrders,
						recentDeliveries,
						totalProcurement,
					});
				}
			} catch (error: any) {
				if (mounted) setLoadError(error.message || 'Unable to load suppliers');
			} finally {
				if (mounted) setLoading(false);
			}
		};

		loadSuppliers();
		return () => { mounted = false; };
	}, [retry]);

	const filteredSuppliers = suppliers.filter(s =>
		(s.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
		(s.email || '').toLowerCase().includes(search.toLowerCase())
	);

	return (
		<View className="flex-1 bg-gray-50">
			<TopNav title="Suppliers for Your Projects" showAction={false} />
			<ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>

				{/* Top Stat Cards Row */}
				<View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
					<AnimatedCard delay={100} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
						<StatCard 
							label="Project Suppliers" 
							value={stats.totalSuppliers.toString()} 
							indicatorText="Assigned vendors" 
							indicatorType="neutral" 
							colorScheme="blue"
							icon={<Ionicons name="business" size={20} color="#2563EB" />}
							fullWidth
						/>
					</AnimatedCard>
					<AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
						<StatCard 
							label="Active Orders" 
							value={stats.activeOrders.toString()} 
							indicatorText={stats.activeOrders > 0 ? "Pending fulfillment" : "All orders fulfilled"} 
							indicatorType={stats.activeOrders > 0 ? "warning" : "success"}
							colorScheme="amber"
							icon={<Ionicons name="cart" size={20} color="#D97706" />}
							fullWidth
						/>
					</AnimatedCard>
					<AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
						<StatCard 
							label="Weekly Deliveries" 
							value={stats.recentDeliveries.toString()} 
							indicatorText="Past 7 days" 
							indicatorType="success" 
							colorScheme="emerald"
							icon={<Icon name="truck-check" size={20} color="#059669" />}
							fullWidth
						/>
					</AnimatedCard>
					<AnimatedCard delay={400} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
						<StatCard 
							label="Total Procurement" 
							value={formatMoney(stats.totalProcurement)} 
							indicatorText="Project purchases" 
							indicatorType="neutral" 
							colorScheme="purple"
							icon={<Ionicons name="wallet-outline" size={20} color="#7C3AED" />}
							fullWidth
						/>
					</AnimatedCard>
				</View>

				{/* Header and Controls */}
				<View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
					<View>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Project Suppliers</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">Supplier activity for purchase orders in projects you manage</Text>
					</View>

					<View className="flex-row items-center gap-3 w-full md:w-auto">
						<SearchInput 
							placeholder="Search suppliers..." 
							value={search} 
							onChangeText={setSearch} 
							items={suppliers} 
							entityLabel="suppliers" 
							className={isMobile ? "flex-1" : "w-80"}
							config={{
								table: 'profiles',
								searchColumn: 'company_name',
								secondaryColumn: 'email',
								titleColumn: 'company_name',
								subtitleColumn: 'email'
							}}
						/>

						{!isMobile && (
							<View className="flex-row bg-gray-100 p-1 rounded-xl border border-gray-200">
								<Pressable
									onPress={() => setViewMode('grid')}
									className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
								>
									<Ionicons name="grid-outline" size={18} color={viewMode === 'grid' ? '#F97316' : '#6B7280'} />
								</Pressable>
								<Pressable
									onPress={() => setViewMode('table')}
									className={`p-2 rounded-lg ${viewMode === 'table' ? 'bg-white shadow-sm' : ''}`}
								>
									<Ionicons name="list-outline" size={18} color={viewMode === 'table' ? '#F97316' : '#6B7280'} />
								</Pressable>
							</View>
						)}
					</View>
				</View>

				{loadError ? (
					<Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetry(v => v + 1)} className="bg-red-50 p-4 rounded-xl border border-red-200 mb-6">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-semibold text-center">{loadError} — Tap to retry</Text>
					</Pressable>
				) : loading ? (
					<View className="bg-white rounded-2xl shadow-sm border border-gray-100 py-24 items-center justify-center">
						<ActivityIndicator size="large" color="#F97316" />
					</View>
				) : filteredSuppliers.length === 0 ? (
					<View className="bg-white rounded-2xl shadow-sm border border-gray-100 py-24 items-center justify-center">
						<Ionicons name="business-outline" size={56} color="#D1D5DB" className="mb-4" />
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-lg font-semibold">No suppliers found</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-1">No purchase order suppliers found for your assigned projects</Text>
					</View>
				) : (viewMode === 'grid' || isMobile) ? (
					/* Colorful Supplier Boxes / Cards Grid */
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
						{filteredSuppliers.map(supplier => (
							<View key={supplier.id} style={isMobile ? { width: '100%', padding: 8 } : { width: '33.33%', padding: 8 }}>
								<View className="bg-white rounded-2xl border border-gray-200/90 hover:border-orange-200 p-5 shadow-sm hover:shadow-md transition-all flex-col justify-between h-full">
									{/* Top Supplier Profile Row */}
									<View className="flex-row items-start justify-between mb-3">
										<View className="flex-row items-center flex-1 mr-2">
											<RoleAvatar
												size="md"
												avatarUrl={supplier.avatar_url}
												role="supplier"
												name={supplier.company_name}
												showRoleBadge
												className="mr-3"
											/>
											<View className="flex-1 min-w-0">
												<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-brand-text">
													{supplier.company_name || 'Supplier'}
												</Text>
												<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-400">
													{supplier.created_at ? `Partner since ${format(new Date(supplier.created_at), 'MMM yyyy')}` : 'Project Vendor'}
												</Text>
											</View>
										</View>
										<View className="bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full">
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-pink-700 font-bold text-[10px] uppercase">
												{supplier.supplier_type || 'Supplier'}
											</Text>
										</View>
									</View>

									{/* Contact Info */}
									<View className="mb-4 pt-2 border-t border-gray-100 gap-1.5">
										<View className="flex-row items-center">
											<Ionicons name="mail-outline" size={14} color="#6B7280" />
											<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 ml-2">
												{supplier.email || 'Contact details unavailable'}
											</Text>
										</View>
										{supplier.contact_number && (
											<View className="flex-row items-center">
												<Ionicons name="call-outline" size={14} color="#6B7280" />
												<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 ml-2">
													{supplier.contact_number}
												</Text>
											</View>
										)}
									</View>

									{/* 3 Colorful Metric Boxes */}
									<View className="flex-row gap-2 mb-4">
										<View className="flex-1 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 items-center">
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-amber-800">
												{supplier.activeOrders}
											</Text>
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-amber-700 uppercase">
												Active
											</Text>
										</View>

										<View className="flex-1 bg-blue-50 border border-blue-200/80 rounded-xl p-2.5 items-center">
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-blue-800">
												{supplier.orderCount}
											</Text>
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-blue-700 uppercase">
												Orders
											</Text>
										</View>

										<View className="flex-1 bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 items-center">
											<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-extrabold text-emerald-800">
												{formatMoney(supplier.orderValue)}
											</Text>
											<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-emerald-700 uppercase">
												Delivered
											</Text>
										</View>
									</View>

									{/* Action Button */}
									<Pressable
										onPress={() => router.push(`/pm/suppliers/${supplier.id}` as any)}
										style={{ minHeight: 40 }}
										className="bg-brand-orange hover:bg-orange-600 active:bg-orange-700 rounded-xl py-2.5 px-4 flex-row items-center justify-center shadow-sm"
									>
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold mr-1.5">
											View Supplier Activity
										</Text>
										<Ionicons name="arrow-forward" size={14} color="white" />
									</Pressable>
								</View>
							</View>
						))}
					</View>
				) : (
					/* Enriched Colorful Table View */
					<View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
						<View className="flex-row py-3 border-b border-gray-200 pr-2">
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Supplier</Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Active Orders</Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Total Orders</Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[10%] text-xs font-semibold text-gray-500 uppercase text-right">Order Value</Text>
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
						</View>

						{filteredSuppliers.map(supplier => (
							<View key={supplier.id} className="flex-row items-center py-4 border-b border-gray-50 hover:bg-orange-50/20 transition-colors">
								<View className="w-[30%] pr-2 flex-row items-center">
									<RoleAvatar
										size="md"
										avatarUrl={supplier.avatar_url}
										role="supplier"
										name={supplier.company_name}
										showRoleBadge
										className="mr-3 shrink-0"
									/>
									<View className="min-w-0 flex-1">
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{supplier.company_name || 'Supplier'}</Text>
										<View className="flex-row items-center gap-1.5 mt-0.5">
											<View className="bg-pink-50 border border-pink-200 px-1.5 py-0.2 rounded">
												<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-pink-700 font-semibold text-[9px] uppercase">{supplier.supplier_type || 'Supplier'}</Text>
											</View>
										</View>
									</View>
								</View>

								<View className="w-[20%] pr-2">
									<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-xs truncate">{supplier.email || 'No email'}</Text>
									{supplier.contact_number && (
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[11px] truncate">{supplier.contact_number}</Text>
									)}
								</View>

								<View className="w-[15%] flex-row justify-center">
									<View className={`px-2.5 py-1 rounded-full border ${supplier.activeOrders > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-200'}`}>
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${supplier.activeOrders > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
											{supplier.activeOrders} Active
										</Text>
									</View>
								</View>

								<View className="w-[15%] flex-row justify-center">
									<View className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-blue-700">
											{supplier.orderCount} Orders
										</Text>
									</View>
								</View>

								<View className="w-[10%]">
									<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-emerald-700 font-bold text-right text-sm">
										{formatMoney(supplier.orderValue)}
									</Text>
								</View>

								<View className="flex-1 flex-row justify-end pl-1">
									<Pressable style={{ minHeight: 36, minWidth: 44 }}
										onPress={() => router.push(`/pm/suppliers/${supplier.id}` as any)}
										className="bg-brand-orange hover:bg-orange-600 px-4 py-1.5 rounded-lg shadow-sm"
									>
										<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Details</Text>
									</Pressable>
								</View>
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	);
}
