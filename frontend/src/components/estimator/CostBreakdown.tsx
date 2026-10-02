import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

/**
 * CostBreakdown
 *
 * Shows the most recent estimation from the `estimations` table,
 * along with per-prediction feature contributions returned by
 * /api/ai/predict-cost (stored on the estimation record) and
 * a real confidence score.
 *
 * Props:
 *   refreshTrigger  — increment to re-fetch after a new estimate is created
 *   featureContributions — optional array from the predict-cost response
 *   confidence       — optional 0-100 confidence from the predict-cost response
 */

type FeatureContrib = { name: string; value: number };

const SEGMENT_COLORS = [
  '#F97316', // brand-orange
  '#0F1117', // brand-dark
  '#EF4444', // brand-danger
  '#6B7280', // gray-500
  '#3B82F6', // blue
];

export const CostBreakdown = ({
  refreshTrigger = 0,
  featureContributions,
  confidence,
}: {
  refreshTrigger?: number;
  featureContributions?: FeatureContrib[];
  confidence?: number | null;
}) => {
  const [latestEstimate, setLatestEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchLatest = async () => {
      try {
        const { data, error } = await supabase
          .from('estimations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (isMounted) setLatestEstimate(data?.[0] || null);
      } catch (err) {
        console.warn('Failed to load latest estimate', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchLatest();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1_000_000) return `Rs. ${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `Rs. ${(amount / 1_000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  const cost = latestEstimate?.estimated_cost || 0;
  // Prefer prop (freshest prediction) over stored value
  const confidenceVal = confidence ?? latestEstimate?.confidence_score ?? null;

  // Feature contributions: prefer live prop, fall back to parsed JSON from project_name if available
  let parsedContribs: FeatureContrib[] | null = null;
  let explanation = "Illustrative split — generate a new estimate to see model-specific contributions";
  
  try {
    if (latestEstimate?.project_name) {
      const parsed = JSON.parse(latestEstimate.project_name);
      if (parsed.contributions) {
        parsedContribs = parsed.contributions;
      }
    }
  } catch (e) {
    // Not valid JSON, keep as null
  }
  
  const contribs: FeatureContrib[] = featureContributions || parsedContribs || [];

  if (contribs.length > 0) {
    explanation = `${contribs[0]?.name} weighted highest due to project size and quality tier`;
  }

  if (loading) {
    return (
      <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 items-center justify-center min-h-[300px]">
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

  if (!latestEstimate) {
    return (
      <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 items-center justify-center min-h-[300px]">
        <Ionicons name="calculator-outline" size={40} color="#E5E7EB" />
        <Text className="text-gray-400 mt-3 text-sm text-center">
          No estimates generated yet.{'\n'}Use the AI Estimator to create one.
        </Text>
      </View>
    );
  }

  const confidenceLabel =
    confidenceVal == null
      ? 'Not validated'
      : confidenceVal >= 75
      ? 'High'
      : confidenceVal >= 50
      ? 'Medium'
      : 'Low';

  const confidenceBg =
    confidenceVal == null
      ? 'bg-gray-100'
      : confidenceVal >= 75
      ? 'bg-green-50'
      : confidenceVal >= 50
      ? 'bg-yellow-50'
      : 'bg-red-50';

  const confidenceText =
    confidenceVal == null
      ? 'text-gray-500'
      : confidenceVal >= 75
      ? 'text-brand-success'
      : confidenceVal >= 50
      ? 'text-yellow-700'
      : 'text-brand-danger';

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-lg font-bold text-brand-text">
          {contribs.length > 0 ? 'Feature Contributions' : 'Cost Breakdown'}
        </Text>
        <Pressable className="flex-row items-center border border-gray-200 px-3 py-1.5 rounded-full">
          <Ionicons name="time-outline" size={14} color="#6B7280" />
          <Text className="text-gray-600 text-xs font-semibold ml-1.5">Live Estimate</Text>
        </Pressable>
      </View>

      {contribs.length > 0 ? (
        <Text className="text-gray-400 text-xs mb-4">
          Which factors drove this specific prediction, ranked by contribution
        </Text>
      ) : (
        <Text className="text-gray-400 text-xs mb-4">
          Latest model estimate from saved history
        </Text>
      )}

      {/* Total Cost + Confidence */}
      <View className="flex-row items-center mb-6">
        <View className="flex-1">
          <Text className="text-gray-500 text-xs font-semibold uppercase mb-1">
            Estimated Total Cost
          </Text>
          <Text className="text-3xl font-bold text-brand-orange">
            {formatCurrency(cost)}
          </Text>
          <Text className="text-gray-400 text-[10px] mt-1">
            This is an estimate — confirm with a quantity surveyor.
          </Text>
        </View>

        <View className={`px-3 py-2 rounded-xl ${confidenceBg} ml-4 items-center`}>
          <Text className="text-gray-400 text-[10px] uppercase mb-0.5">Confidence</Text>
          <Text className={`font-bold text-sm ${confidenceText}`}>
            {confidenceVal != null ? `${Math.round(confidenceVal)}%` : '—'}
          </Text>
          <Text className={`text-[10px] font-semibold ${confidenceText}`}>
            {confidenceLabel}
          </Text>
        </View>
      </View>

      {/* Feature bar chart */}
      {contribs.length > 0 ? (
        <View className="border-t border-gray-100 pt-4">
          {contribs.slice(0, 5).map((feat, i) => (
            <View key={feat.name} className="mb-3">
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-gray-700">{feat.name}</Text>
                <Text className="text-sm font-bold text-brand-text">{feat.value}%</Text>
              </View>
              <View className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <View
                  style={{
                    width: `${feat.value}%`,
                    height: '100%',
                    backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>
          ))}
          <Text className="text-gray-400 text-[10px] mt-2">
            Contribution percentages reflect this prediction's feature weights from the trained RandomForest.
          </Text>
        </View>
      ) : (
        /* Legacy static legend when no contribution data is available */
        <View className="flex-row flex-wrap justify-between pt-4 border-t border-gray-100">
          {[
            { label: 'Materials', pct: '42%', color: '#6B7280' },
            { label: 'Labour',    pct: '26%', color: '#0F1117' },
            { label: 'Equipment', pct: '16%', color: '#EF4444' },
            { label: 'Overhead',  pct: '16%', color: '#000' },
          ].map(item => (
            <View key={item.label} className="flex-row items-center w-[48%] mb-2">
              <View className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: item.color }} />
              <Text className="text-xs text-gray-600 flex-1">{item.label}</Text>
              <Text className="text-xs font-bold text-brand-text">{item.pct}</Text>
            </View>
          ))}
          <Text className="text-gray-400 text-[10px] mt-2 w-full">
            Illustrative split — generate a new estimate to see model-specific contributions.
          </Text>
        </View>
      )}
    </View>
  );
};
