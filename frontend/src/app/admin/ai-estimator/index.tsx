import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';
import { useApi } from '@/hooks/useApi';

const LOCATIONS = ['Colombo', 'Kandy', 'Galle', 'Other'];
const TYPES = ['Residential', 'Commercial', 'Industrial'];
const QUALITIES = ['Standard', 'Premium', 'Luxury'];

const formatCurrency = (amount: number) =>
  `LKR ${Math.round(amount).toLocaleString('en-LK')}`;

const OptionPill = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={[{
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: selected ? '#F97316' : '#fff',
      borderColor: selected ? '#F97316' : '#D1D5DB',
    }, { minHeight: 44, minWidth: 44 }]}
  >
    <Text maxFontSizeMultiplier={1.3}
      style={[{ flexShrink: 1, minWidth: 0 }, {
        fontWeight: '600',
        fontSize: 14,
        color: selected ? '#fff' : '#4B5563',
      }]}
    >
      {label}
    </Text>
  </Pressable>
);

export default function AdminAiEstimatorPage() {
  const { isMobile } = useResponsive();
  const [squareFootage, setSquareFootage] = useState('');
  const [location, setLocation] = useState('Colombo');
  const [projectType, setProjectType] = useState('Residential');
  const [qualityTier, setQualityTier] = useState('Standard');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { request: apiRequest, loading: apiLoading, error: apiError } = useApi();
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
      const { data: { session } } = await supabase.auth.getSession();
      const insightsData = await apiRequest('/ai/insights', {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      setInsights(insightsData);
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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const data = await apiRequest('/ai/predict-cost', {
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

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <TopNav title="AI Cost Estimator" showAction={false} />
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="px-6 py-3 text-sm text-amber-800 bg-amber-50">Prototype estimates use synthetic data. Accuracy is not validated; confirm costs before budgeting.</Text>

      <ScrollView keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 48 }}
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Project Estimates</Text>
        </View>
        {/* ML Model Insights Banner */}
        {insights && (
          <View
            style={{
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {[
              { label: 'Active Model', value: insights.active_model, icon: 'cpu-outline' },
              {
                label: 'R² Score',
                value: insights.accuracy_score != null && insights.accuracy_score !== 'Not validated'
                  ? `${insights.accuracy_score}`
                  : 'Not validated',
                icon: 'trending-up-outline',
              },
              {
                label: 'Training Data',
                value: insights.total_training_samples
                  ? `${insights.total_training_samples.toLocaleString()} records`
                  : 'No data',
                icon: 'server-outline',
              },
              {
                label: 'Last Trained',
                value: insights.model_info?.cost_model?.trained_at
                  ? new Date(insights.model_info.cost_model.trained_at).toLocaleDateString()
                  : '—',
                icon: 'calendar-outline',
              },
            ].map(item => (
              <View
                key={item.label}
                style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#F3F4F6',
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: isMobile ? 8 : 0,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    backgroundColor: '#EFF6FF',
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="#3B82F6" />
                </View>
                <View>
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 11, fontWeight: '600' }]}>{item.label}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#1F2937', fontWeight: 'bold', fontSize: 14, marginTop: 2 }]}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Main Two-Column Layout */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 24 }}>

          {/* LEFT: Form */}
          <View style={{ flex: isMobile ? undefined : 1.2, width: isMobile ? '100%' : undefined }}>

            {/* Estimation Form Card */}
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
                padding: isMobile ? 16 : 28,
                marginBottom: 16,
              }}
            >
              <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 20 }]}>
                New Cost Estimation
              </Text>

              {/* Area Input */}
              <View style={{ marginBottom: 18 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }]}>
                  Total Area (sq. ft.)
                </Text>
                <TextInput maxFontSizeMultiplier={1.3}
                  value={squareFootage}
                  onChangeText={setSquareFootage}
                  placeholder="e.g. 5000"
                  keyboardType="numeric"
                  style={[{
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: '#F9FAFB',
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#111827',
                  }, { minHeight: 44, minWidth: 44 }]}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Location */}
              <View style={{ marginBottom: 18 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }]}>
                  Location
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {LOCATIONS.map(loc => (
                    <OptionPill key={loc} label={loc} selected={location === loc} onPress={() => setLocation(loc)} />
                  ))}
                </View>
              </View>

              {/* Project Type */}
              <View style={{ marginBottom: 18 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }]}>
                  Project Type
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {TYPES.map(t => (
                    <OptionPill key={t} label={t} selected={projectType === t} onPress={() => setProjectType(t)} />
                  ))}
                </View>
              </View>

              {/* Quality Tier */}
              <View style={{ marginBottom: 24 }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }]}>
                  Quality Tier
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {QUALITIES.map(q => (
                    <OptionPill key={q} label={q} selected={qualityTier === q} onPress={() => setQualityTier(q)} />
                  ))}
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                onPress={handleEstimate}
                disabled={loading}
                style={[{
                  backgroundColor: loading ? '#FDBA74' : '#F97316',
                  borderRadius: 12,
                  paddingVertical: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }, { minHeight: 44, minWidth: 44 }]}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="white" />
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontWeight: 'bold', fontSize: 15 }]}>Generate Estimate</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Result Card */}
            {result && (
              <View
                style={{
                  backgroundColor: '#F97316',
                  borderRadius: 16,
                  padding: isMobile ? 20 : 28,
                }}
              >
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 }]}>
                  Estimated Project Cost
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontSize: isMobile ? 28 : 36, fontWeight: 'bold', marginBottom: 4 }]}>
                  {formatCurrency(result.estimated_cost)}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 16 }]}>
                  Estimate only — not a financial commitment. Confirm with a quantity surveyor.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  {[
                    { label: 'Confidence', value: result.confidence_score != null ? `${Math.round(result.confidence_score)}%` : 'N/A' },
                    { label: 'Location', value: result.features_used?.location },
                    { label: 'Type', value: result.features_used?.type },
                    { label: 'Quality', value: result.features_used?.quality },
                    { label: 'Model', value: result.model_source || 'RandomForest' },
                    { label: 'Trained', value: result.model_trained_on ? new Date(result.model_trained_on).toLocaleDateString() : '—' },
                  ].map(stat => (
                    <View key={stat.label} style={{ minWidth: '40%' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(255,255,255,0.7)', fontSize: 11 }]}>{stat.label}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontWeight: 'bold', fontSize: 14, marginTop: 2 }]}>{stat.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Per-prediction feature contributions */}
                {result.feature_contributions?.length > 0 && (
                  <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' }}>
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 12 }]}>
                      Top Feature Contributions
                    </Text>
                    {result.feature_contributions.slice(0, 4).map((fc: any) => (
                      <View key={fc.name} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(255,255,255,0.9)', fontSize: 12 }]}>{fc.name}</Text>
                          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontWeight: 'bold', fontSize: 12 }]}>{fc.value}%</Text>
                        </View>
                        <View style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ width: `${fc.value}%`, height: '100%', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 3 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* RIGHT: History + Feature Importance */}
          <View style={{ flex: isMobile ? undefined : 0.8, width: isMobile ? '100%' : undefined }}>

            {/* Estimation History */}
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 16, fontWeight: 'bold', color: '#1F2937' }]}>Estimation History</Text>
              </View>
              {history.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Ionicons name="document-outline" size={40} color="#E5E7EB" />
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', marginTop: 12, fontSize: 14 }]}>No estimations yet.</Text>
                </View>
              ) : (
                history.map((item, i) => (
                  <View
                    key={item.id}
                    style={{
                      padding: 16,
                      borderBottomWidth: i < history.length - 1 ? 1 : 0,
                      borderBottomColor: '#F9FAFB',
                    }}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontWeight: 'bold', color: '#1F2937', fontSize: 14 }]}>
                      {item.project_name}
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316', fontWeight: 'bold', marginTop: 2 }]}>
                      {formatCurrency(item.estimated_cost)}
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 11, marginTop: 2 }]}>
                      Confidence: {item.confidence_score == null ? 'Not validated' : `${item.confidence_score}%`} · {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Feature Importance */}
            {insights?.feature_importance && (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#F3F4F6',
                  padding: 20,
                }}
              >
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontWeight: 'bold', color: '#1F2937', marginBottom: 16, fontSize: 15 }]}>
                  Feature Importance
                </Text>
                {insights.feature_importance.map((feat: any) => (
                  <View key={feat.name} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#4B5563', fontSize: 13 }]}>{feat.name}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#1F2937', fontWeight: 'bold', fontSize: 13 }]}>{feat.value}%</Text>
                    </View>
                    <View style={{ width: '100%', height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ width: `${feat.value}%`, height: '100%', backgroundColor: '#F97316', borderRadius: 4 }} />
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
