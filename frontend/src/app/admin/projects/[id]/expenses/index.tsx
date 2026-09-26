import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function AdminExpensesIndexPage() {
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects/${projectId}/expenses`, {
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
    <View className="flex-1 bg-brand-dark">
      <TopNav title={project ? `${project.name} Expenses` : 'Project Expenses'} showBackButton />
      
      <ScrollView className="flex-1 p-6">
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-2xl font-bold text-white mb-1">Expenses Log</Text>
            <Text className="text-gray-400">Total Logged: Rs. {totalSpent.toLocaleString()}</Text>
          </View>
          <Pressable 
            onPress={() => router.push(`/admin/projects/${projectId}/expenses/create`)}
            className="bg-brand-orange px-4 py-2.5 rounded-xl flex-row items-center"
          >
            <Ionicons name="add" size={20} color="white" className="mr-2" />
            <Text className="text-white font-bold">Add Expense</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#F97316" className="mt-10" />
        ) : expenses.length === 0 ? (
          <View className="bg-white/5 rounded-2xl p-10 items-center justify-center mt-4 border border-white/10">
            <Ionicons name="receipt-outline" size={48} color="#9CA3AF" className="mb-4" />
            <Text className="text-white font-bold text-lg mb-2">No expenses logged yet</Text>
            <Text className="text-gray-400 text-center">Track your project costs by adding individual expenses here.</Text>
          </View>
        ) : (
          <View className="space-y-4">
            {expenses.map((expense) => (
              <View key={expense.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1">
                    <Text className="font-bold text-lg text-gray-900">{expense.title}</Text>
                    <Text className="text-gray-500 text-xs mt-1">
                      {new Date(expense.expense_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View className="bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                    <Text className="text-red-600 font-bold">
                      Rs. {Number(expense.amount).toLocaleString()}
                    </Text>
                  </View>
                </View>
                {expense.description ? (
                  <Text className="text-gray-600 text-sm mt-2">{expense.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
