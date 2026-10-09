import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Project = { id: string; name: string };
type InvoiceRow = { id: string; title: string; projectName: string; amount: number; date?: string | null; source: 'Purchase order' | 'Expense' };

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-GB');
};

export default function ClientinvoicesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadInvoices = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, name')
          .eq('client_id', user.id);
        if (projectError) throw projectError;

        const projects = (projectData || []) as Project[];
        const projectIds = projects.map(project => project.id);
        if (projectIds.length === 0) {
          if (isMounted) setRows([]);
          return;
        }

        const [orderResponse, expenseResponse] = await Promise.all([
          supabase.from('purchase_orders').select('id, po_number, project_id, total_price, actual_delivery, status').in('project_id', projectIds).eq('status', 'Delivered').order('actual_delivery', { ascending: false }),
          supabase.from('project_expenses').select('id, project_id, title, amount, expense_date').in('project_id', projectIds).order('expense_date', { ascending: false }),
        ]);

        if (orderResponse.error) throw orderResponse.error;
        if (expenseResponse.error) throw expenseResponse.error;

        const projectNames = projects.reduce<Record<string, string>>((result, project) => {
          result[project.id] = project.name;
          return result;
        }, {});

        const purchaseOrders: InvoiceRow[] = (orderResponse.data || []).map(order => ({
          id: order.id,
          title: order.po_number || 'Delivered purchase order',
          projectName: projectNames[order.project_id] || 'Project',
          amount: Number(order.total_price || 0),
          date: order.actual_delivery,
          source: 'Purchase order',
        }));

        const expenses: InvoiceRow[] = (expenseResponse.data || []).map(expense => ({
          id: expense.id,
          title: expense.title,
          projectName: projectNames[expense.project_id] || 'Project',
          amount: Number(expense.amount || 0),
          date: expense.expense_date,
          source: 'Expense',
        }));

        if (isMounted) setRows([...purchaseOrders, ...expenses]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load project financial records.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadInvoices();
    const channel = supabase
      .channel(`client-invoices:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, loadInvoices)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_expenses' }, loadInvoices)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, retryKey]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Client Invoices" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-2">Project Financial Records</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-6">Delivered orders and recorded project expenses.</Text>
        {loading ? (
          <View className="gap-3">
            {[1, 2, 3].map(item => <View key={item} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}
          </View>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-center">{error}</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center">
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold mt-4">No financial records yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center mt-2">Delivered purchase orders and approved project expenses will appear here.</Text>
          </View>
        ) : (
          rows.map(row => (
            <View key={`${row.source}-${row.id}`} className="bg-white rounded-2xl border border-gray-100 p-5 mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">{row.title}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-1">{row.projectName}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-2">{row.source} · {formatDate(row.date)}</Text>
                </View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-lg">{formatCurrency(row.amount)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
