import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

const LOCATIONS = ['Colombo', 'Kandy', 'Galle', 'Other'];
const TYPES = ['Residential', 'Commercial', 'Industrial'];
const QUALITIES = ['Standard', 'Premium', 'Luxury'];

const OptionPill = ({ label, selected, onPress }: { label: string, selected: boolean, onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className={`px-4 py-2 rounded-full border mr-2 mb-2 ${selected ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}
  >
    <Text className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
  </Pressable>
);

export default function AdminAiEstimatorPage() {
  const [squareFootage, setSquareFootage] = useState('');
  const [location, setLocation] = useState('Colombo');
  const [projectType, setProjectType] = useState('Residential');
  const [qualityTier, setQualityTier] = useState('Standard');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);

  const loadData = async () => {
    const { data } = await supabase
      .from('estimations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);
    setHistory(data || []);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
      const res = await fetch(`${apiUrl}/ai/insights`);
      if (res.ok) setInsights(await res.json());
    } catch { /* Backend may not be running */ }
  };

  useEffect(() => { loadData(); }, []);

  const handleEstimate = async () => {
    if (!squareFootage || isNaN(Number(squareFootage))) {
      Alert.alert('Input Required', 'Please enter a valid square footage.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`${apiUrl}/ai/predict-cost`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          square_footage: Number(squareFootage),
          location,
          project_type: projectType,
          quality_tier: qualityTier,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      setResult(data);

      await supabase.from('estimations').insert({
        project_name: `${projectType} — ${location}`,
        estimated_cost: data.estimated_cost,
        confidence_score: data.confidence_score,
        status: 'Generated',
      });

      loadData();
    } catch (err: any) {
      Alert.alert('Error', `Could not get estimate: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    `LKR ${Math.round(amount).toLocaleString('en-LK')}`;

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="AI Cost Estimator" showAction={false} />

      <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>

        {/* ML Model Insights Banner */}
        {insights && (
          <View className="flex-row gap-4 mb-8">
            {[
              { label: 'Active Model', value: insights.active_model, icon: 'cpu-outline' },
              { label: 'Model Accuracy', value: insights.accuracy_score, icon: 'trending-up-outline' },
              { label: 'Training Data', value: `${insights.total_training_samples?.toLocaleString()} records`, icon: 'server-outline' },
            ].map(item => (
              <View key={item.label} className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-row items-center">
                <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
                  <Ionicons name={item.icon as any} size={20} color="#3B82F6" />
                </View>
                <View>
                  <Text className="text-gray-400 text-xs font-semibold">{item.label}</Text>
                  <Text className="text-gray-800 font-bold text-sm mt-0.5">{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="flex-row gap-8">
          {/* Left: Form */}
          <View className="flex-[1.2]">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
              <Text className="text-xl font-bold text-gray-800 mb-6">New Cost Estimation</Text>

              <View className="mb-5">
                <Text className="text-sm font-bold text-gray-700 mb-2">Total Area (sq. ft.)</Text>
                <TextInput
                  value={squareFootage}
                  onChangeText={setSquareFootage}
                  placeholder="e.g. 5000"
                  keyboardType="numeric"
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50 text-lg font-semibold"
                />
              </View>

              <View className="mb-5">
                <Text className="text-sm font-bold text-gray-700 mb-3">Location</Text>
                <View className="flex-row flex-wrap">
                  {LOCATIONS.map(loc => <OptionPill key={loc} label={loc} selected={location === loc} onPress={() => setLocation(loc)} />)}
                </View>
              </View>

              <View className="mb-5">
                <Text className="text-sm font-bold text-gray-700 mb-3">Project Type</Text>
                <View className="flex-row flex-wrap">
                  {TYPES.map(t => <OptionPill key={t} label={t} selected={projectType === t} onPress={() => setProjectType(t)} />)}
                </View>
              </View>

              <View className="mb-8">
                <Text className="text-sm font-bold text-gray-700 mb-3">Quality Tier</Text>
                <View className="flex-row flex-wrap">
                  {QUALITIES.map(q => <OptionPill key={q} label={q} selected={qualityTier === q} onPress={() => setQualityTier(q)} />)}
                </View>
              </View>

              <Pressable
                onPress={handleEstimate}
                disabled={loading}
                className={`py-4 rounded-xl items-center flex-row justify-center ${loading ? 'bg-orange-300' : 'bg-brand-orange'}`}
              >
                {loading ? <ActivityIndicator color="white" /> : (
                  <><Ionicons name="flash" size={18} color="white" /><Text className="text-white font-bold text-base ml-2">Generate Estimate</Text></>
                )}
              </Pressable>
            </View>

            {result && (
              <View className="bg-brand-orange rounded-2xl p-8 shadow-md">
                <Text className="text-white text-sm font-semibold opacity-80 mb-1">Estimated Project Cost</Text>
                <Text className="text-white text-4xl font-bold mb-4">{formatCurrency(result.estimated_cost)}</Text>
                <View className="flex-row justify-between">
                  <View><Text className="text-white opacity-70 text-xs">Confidence</Text><Text className="text-white font-bold mt-1 text-lg">{result.confidence_score}%</Text></View>
                  <View><Text className="text-white opacity-70 text-xs">Location</Text><Text className="text-white font-bold mt-1">{result.features_used?.location}</Text></View>
                  <View><Text className="text-white opacity-70 text-xs">Type</Text><Text className="text-white font-bold mt-1">{result.features_used?.type}</Text></View>
                  <View><Text className="text-white opacity-70 text-xs">Quality</Text><Text className="text-white font-bold mt-1">{result.features_used?.quality}</Text></View>
                </View>
              </View>
            )}
          </View>

          {/* Right: History + Feature Importance */}
          <View className="flex-[0.8]">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
              <View className="p-5 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-800">Estimation History</Text>
              </View>
              {history.length === 0 ? (
                <View className="p-8 items-center">
                  <Ionicons name="document-outline" size={40} color="#E5E7EB" />
                  <Text className="text-gray-400 mt-3 text-sm">No estimations yet.</Text>
                </View>
              ) : (
                history.map((item, i) => (
                  <View key={item.id} className={`p-4 ${i < history.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <Text className="font-bold text-gray-800 text-sm">{item.project_name}</Text>
                    <Text className="text-brand-orange font-bold mt-0.5">{formatCurrency(item.estimated_cost)}</Text>
                    <Text className="text-gray-400 text-xs mt-0.5">Confidence: {item.confidence_score}% • {new Date(item.created_at).toLocaleDateString()}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Feature Importance from ML Model */}
            {insights?.feature_importance && (
              <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <Text className="font-bold text-gray-800 mb-4">Feature Importance</Text>
                {insights.feature_importance.map((feat: any) => (
                  <View key={feat.name} className="mb-3">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-gray-600 text-sm">{feat.name}</Text>
                      <Text className="text-gray-800 font-bold text-sm">{feat.value}%</Text>
                    </View>
                    <View className="w-full h-2 bg-gray-100 rounded-full">
                      <View className="h-full bg-brand-orange rounded-full" style={{ width: `${feat.value}%` }} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
