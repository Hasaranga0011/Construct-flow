import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';

export default function AdminPayrollGeneratePage() {
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    start_date: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    site_id: ''
  });

  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase.from('projects').select('id, name');
      if (data) setSites(data);
    };
    fetchSites();
  }, []);

  const handleGenerate = async () => {
    if (!formData.site_id || !formData.start_date || !formData.end_date) {
      Alert.alert('Error', 'Please fill out all fields');
      return;
    }
    
    setLoading(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/labour/salary/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`
        },
        body: JSON.stringify(formData)
      });
      
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.detail || 'Failed to generate payroll');
      }
      
      setResult(resData);
      Alert.alert('Success', `Generated ${resData.generated} salary slips successfully!`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Generate Payroll" showAction={false} />
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto w-full">
          <Text className="text-xl font-bold text-gray-800 mb-6">Bulk Salary Generation</Text>
          
          <View className="mb-6">
             <Text className="text-gray-700 font-medium mb-2">Select Site</Text>
             <View className="flex-row flex-wrap space-x-2">
               {sites.map(s => (
                  <TouchableOpacity 
                    key={s.id}
                    onPress={() => setFormData({...formData, site_id: s.id})}
                    className={`px-4 py-2 rounded-full mb-2 ${formData.site_id === s.id ? 'bg-brand-orange' : 'bg-gray-100'}`}
                  >
                    <Text className={formData.site_id === s.id ? 'text-white font-bold' : 'text-gray-700'}>{s.name}</Text>
                  </TouchableOpacity>
               ))}
             </View>
          </View>

          <View className="flex-row space-x-4 mb-8">
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">Start Date (YYYY-MM-DD)</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                value={formData.start_date}
                onChangeText={(t) => setFormData({...formData, start_date: t})}
              />
            </View>
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">End Date (YYYY-MM-DD)</Text>
              <TextInput 
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
                value={formData.end_date}
                onChangeText={(t) => setFormData({...formData, end_date: t})}
              />
            </View>
          </View>

          <TouchableOpacity 
            onPress={handleGenerate}
            disabled={loading}
            style={{ backgroundColor: loading ? '#FDBA74' : '#F97316', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 24, minHeight: 56 }}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Generate Salary Slips</Text>}

          </TouchableOpacity>
          
          {result && (
             <View className="bg-green-50 border border-green-200 p-4 rounded-xl items-center">
                <Text className="text-green-700 font-bold text-lg">Completed!</Text>
                <Text className="text-green-600">{result.generated} slips generated and saved to the database.</Text>
             </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
