import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';

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

export default function PmAiEstimatorPage() {
  const { isMobile } = useResponsive();
  const [squareFootage, setSquareFootage] = useState('');
  const [location, setLocation] = useState('Colombo');
  const [projectType, setProjectType] = useState('Residential');
  const [qualityTier, setQualityTier] = useState('Standard');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from('estimations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    setHistory(data || []);
  };

  useEffect(() => {
    loadHistory();
  }, []);

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

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `API error: ${response.status}`);
      }
      const data = await response.json();
      setResult(data);

      // Save estimation to Supabase (store feature_contributions as JSON)
      await supabase.from('estimations').insert({
        project_name: `${projectType} in ${location}`,
        estimated_cost: data.estimated_cost,
        confidence_score: data.confidence_score,
        status: 'Generated',
      });

      loadHistory();
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
      <Text className="px-6 py-3 text-sm text-amber-800 bg-amber-50">Prototype estimates use synthetic data. Accuracy is not validated; confirm costs before budgeting.</Text>

      <ScrollView className="flex-1 p-4 md:p-6 lg:p-8" showsVerticalScrollIndicator={false}>
        <View className={`gap-6 lg:gap-8 ${isMobile ? 'flex-col' : 'flex-row'}`}>

          {/* Left: Form */}
          <View className="flex-[1.2]">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
              <View className="flex-row items-center mb-6">
                <View className="w-11 h-11 bg-orange-100 rounded-xl items-center justify-center mr-3">
                  <Ionicons name="calculator" size={20} color="#F97316" />
                </View>
                <View>
                  <Text className="text-xl font-bold text-gray-800">New Estimation</Text>
                  <Text className="text-gray-500 text-sm">Powered by RandomForest ML Model</Text>
                </View>
              </View>

              {/* Square Footage */}
              <View className="mb-6">
                <Text className="text-sm font-bold text-gray-700 mb-2">Total Area (sq. ft.)</Text>
                <TextInput
                  value={squareFootage}
                  onChangeText={setSquareFootage}
                  placeholder="e.g. 3500"
                  keyboardType="numeric"
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50 text-lg font-semibold"
                />
              </View>

              {/* Location */}
              <View className="mb-6">
                <Text className="text-sm font-bold text-gray-700 mb-3">Location</Text>
                <View className="flex-row flex-wrap">
                  {LOCATIONS.map(loc => (
                    <OptionPill key={loc} label={loc} selected={location === loc} onPress={() => setLocation(loc)} />
                  ))}
                </View>
              </View>

              {/* Project Type */}
              <View className="mb-6">
                <Text className="text-sm font-bold text-gray-700 mb-3">Project Type</Text>
                <View className="flex-row flex-wrap">
                  {TYPES.map(t => (
                    <OptionPill key={t} label={t} selected={projectType === t} onPress={() => setProjectType(t)} />
                  ))}
                </View>
              </View>

              {/* Quality Tier */}
              <View className="mb-8">
                <Text className="text-sm font-bold text-gray-700 mb-3">Quality Tier</Text>
                <View className="flex-row flex-wrap">
                  {QUALITIES.map(q => (
                    <OptionPill key={q} label={q} selected={qualityTier === q} onPress={() => setQualityTier(q)} />
                  ))}
                </View>
              </View>

              <Pressable
                onPress={handleEstimate}
                disabled={loading}
                className={`py-4 rounded-xl items-center flex-row justify-center ${loading ? 'bg-orange-300' : 'bg-brand-orange'}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="white" />
                    <Text className="text-white font-bold text-base ml-2">Generate Estimate</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Result Card */}
            {result && (
              <View className="bg-brand-orange rounded-2xl p-8 shadow-md">
                <Text className="text-white text-xs font-semibold mb-1 opacity-70 uppercase">Estimated Project Cost</Text>
                <Text className="text-white text-4xl font-bold mb-1">{formatCurrency(result.estimated_cost)}</Text>
                <Text className="text-white opacity-60 text-xs mb-4">
                  Estimate only — not a financial commitment. Confirm with a quantity surveyor.
                </Text>

                <View className="flex-row flex-wrap gap-4">
                  {[
                    { label: 'Confidence', value: result.confidence_score != null ? `${Math.round(result.confidence_score)}%` : 'N/A' },
                    { label: 'Area', value: `${result.features_used?.sq_ft} sq.ft` },
                    { label: 'Type', value: result.features_used?.type },
                    { label: 'Quality', value: result.features_used?.quality },
                    { label: 'Model', value: result.model_source || 'RandomForest' },
                    { label: 'Trained', value: result.model_trained_on ? new Date(result.model_trained_on).toLocaleDateString() : '—' },
                  ].map(stat => (
                    <View key={stat.label} style={{ minWidth: '44%' }}>
                      <Text className="text-white opacity-70 text-xs">{stat.label}</Text>
                      <Text className="text-white font-bold mt-0.5">{stat.value}</Text>
                    </View>
                  ))}
                </View>

                {result.feature_contributions?.length > 0 && (
                  <View className="mt-5 pt-4 border-t border-white border-opacity-30">
                    <Text className="text-white opacity-70 text-xs font-semibold uppercase mb-3">Top Feature Contributions</Text>
                    {result.feature_contributions.slice(0, 4).map((fc: any) => (
                      <View key={fc.name} className="mb-2">
                        <View className="flex-row justify-between mb-1">
                          <Text className="text-white text-xs opacity-90">{fc.name}</Text>
                          <Text className="text-white text-xs font-bold">{fc.value}%</Text>
                        </View>
                        <View className="w-full h-1.5 bg-white bg-opacity-20 rounded-full overflow-hidden">
                          <View style={{ width: `${fc.value}%`, height: '100%', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Right: History */}
          <View className="flex-[0.8]">
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <View className="p-6 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-800">Estimation History</Text>
              </View>
              {history.length === 0 ? (
                <View className="p-10 items-center">
                  <Ionicons name="document-outline" size={40} color="#E5E7EB" />
                  <Text className="text-gray-400 mt-3 text-sm text-center">No estimations generated yet.</Text>
                </View>
              ) : (
                history.map((item, i) => (
                  <View key={item.id} className={`p-5 ${i < history.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <Text className="font-bold text-gray-800 text-sm">{item.project_name}</Text>
                    <Text className="text-brand-orange font-bold mt-1">{formatCurrency(item.estimated_cost)}</Text>
                    <View className="flex-row justify-between mt-1">
                      <Text className="text-gray-400 text-xs">Confidence: {item.confidence_score == null ? 'Not validated' : `${item.confidence_score}%`}</Text>
                      <Text className="text-gray-400 text-xs">{new Date(item.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Model Info Card */}
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-6">
              <Text className="font-bold text-gray-800 mb-1">ML Model Info</Text>
              <Text className="text-gray-400 text-xs mb-4">
                Live metadata from the deployed model artifact
              </Text>
              <View>
                {[
                  { label: 'Algorithm', value: result?.model_source || 'RandomForestRegressor' },
                  { label: 'Training Samples', value: result?.training_samples ? result.training_samples.toLocaleString() : '—' },
                  { label: 'Features', value: 'Area, Workers, Materials, Labour, Completion' },
                  { label: 'Last Trained', value: result?.model_trained_on ? new Date(result.model_trained_on).toLocaleDateString() : '—' },
                ].map(item => (
                  <View key={item.label} className="flex-row justify-between py-2 border-b border-gray-50">
                    <Text className="text-gray-500 text-sm">{item.label}</Text>
                    <Text className="text-gray-800 font-semibold text-sm text-right flex-1 ml-4" numberOfLines={1}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
