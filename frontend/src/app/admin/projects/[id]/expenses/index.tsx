import { getApiUrl } from '../../../../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '@/hooks/useResponsive';

export default function AdminExpensesIndexPage() {
  const { isMobile } = useResponsive();
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);

  const fetchExpenses = async () => {
    try {
      setLoading(true);

      // Fetch project
      if (!project) {
        const { data: pData } = await supabase.from('projects').select('name, total_budget, spent_cost').eq('id', projectId).single();
        if (pData) setProject(pData);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${getApiUrl()}/projects/${projectId}/expenses`, {
        headers: {
          'Authorization': `Bearer ${sessionData.session?.access_token}`
        }
      });

      if (!response.ok) throw new Error("Failed to fetch expenses");
      const data = await response.json();
      setExpenses(data || []);
    } catch (err: any) {
      Alert.alert("Error fetching expenses", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchExpenses();
  }, [projectId]);

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <View className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <TopNav title={project ? `${project.name} Expenses` : 'Project Expenses'} showBackButton />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'p-4' : 'p-6'}`}>
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text dark:text-white mb-1">Expenses Log</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400">Total Logged: Rs. {totalSpent.toLocaleString()}</Text>
          </View>
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => router.push(`/admin/projects/${projectId}/expenses/create`)}
            className="bg-brand-orange px-4 py-2.5 rounded-xl flex-row items-center"
          >
            <Ionicons name="add" size={20} color="white" className="mr-2" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Add Expense</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#F97316" className="mt-10" />
        ) : expenses.length === 0 ? (
          <View className="bg-white dark:bg-[#1E293B] rounded-2xl p-10 items-center justify-center mt-4 border border-gray-100 dark:border-gray-800 shadow-sm">
            <Ionicons name="receipt-outline" size={48} color="#9CA3AF" className="mb-4" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold text-lg mb-2">No expenses logged yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-center">Track your project costs by adding individual expenses here.</Text>
          </View>
        ) : (
          <View className="flex-col gap-3 md:gap-4 pb-12">
            {expenses.map((expense) => (
              <View key={expense.id} className="bg-white dark:bg-[#1E293B] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg text-gray-900 dark:text-white">{expense.title}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                      {new Date(expense.expense_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View className="bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 shrink-0 ml-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-bold">
                      Rs. {Number(expense.amount).toLocaleString()}
                    </Text>
                  </View>
                </View>
                {expense.description ? (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 dark:text-gray-400 text-sm mt-1">{expense.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
