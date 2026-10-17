import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { AutoFitText } from '../common/AutoFitText';

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
  let parsedRange: string | null = null;
  let parsedQuantities: any = null;
  let explanation = "Illustrative split — generate a new estimate to see model-specific contributions";
  
  try {
    if (latestEstimate?.project_name) {
      const parsed = JSON.parse(latestEstimate.project_name);
      if (parsed.contributions) {
        parsedContribs = parsed.contributions;
      }
      if (parsed.estimated_range_display) {
        parsedRange = parsed.estimated_range_display;
      }
      if (parsed.physical_quantities) {
        parsedQuantities = parsed.physical_quantities;
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
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-3 text-sm text-center">
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
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">
          {contribs.length > 0 ? 'Feature Contributions' : 'Cost Breakdown'}
        </Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-row items-center border border-gray-200 px-3 py-1.5 rounded-full">
          <Ionicons name="time-outline" size={14} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-semibold ml-1.5">Live Estimate</Text>
        </Pressable>
      </View>

      {contribs.length > 0 ? (
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-4">
          Which factors drove this specific prediction, ranked by contribution
        </Text>
      ) : (
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-4">
          Latest model estimate from saved history
        </Text>
      )}

      {/* Total Cost + Confidence */}
      <View className="flex-row flex-wrap items-center mb-4" style={{ gap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold uppercase mb-1">
            Estimated Total Cost
          </Text>
          <AutoFitText value={formatCurrency(cost)} maxFontSize={30} minFontSize={18} className="font-bold text-brand-orange" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] mt-1">
            Hybrid model — confirm with quantity surveyor.
          </Text>
        </View>

        <View className={`px-3 py-2 rounded-xl ${confidenceBg} items-center`}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] uppercase mb-0.5">Confidence</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-sm ${confidenceText}`}>
            {confidenceVal != null ? `${Math.round(confidenceVal)}%` : '—'}
          </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-semibold ${confidenceText}`}>
            {confidenceLabel}
          </Text>
        </View>
      </View>

      {/* Prediction Range */}
      {parsedRange && (
        <View className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-orange-800 uppercase mb-0.5">
            Prediction Range (±15% Uncertainty)
          </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-orange-950">
            {parsedRange}
          </Text>
        </View>
      )}

      {/* Physical Quantities Preview */}
      {parsedQuantities && (
        <View className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-gray-500 uppercase mb-2">
            Bottom-Up Material Quantities
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-white px-2 py-1 rounded border border-gray-200">
              <Text className="text-[10px] text-gray-400">Cement</Text>
              <Text className="text-xs font-bold text-brand-text">{Number(parsedQuantities.cement_bags || 0).toLocaleString()} bags</Text>
            </View>
            <View className="bg-white px-2 py-1 rounded border border-gray-200">
              <Text className="text-[10px] text-gray-400">Steel</Text>
              <Text className="text-xs font-bold text-brand-text">{Number(parsedQuantities.steel_kg || 0).toLocaleString()} kg</Text>
            </View>
            <View className="bg-white px-2 py-1 rounded border border-gray-200">
              <Text className="text-[10px] text-gray-400">Labour</Text>
              <Text className="text-xs font-bold text-brand-text">{Number(parsedQuantities.labour_worker_days || 0).toLocaleString()} days</Text>
            </View>
          </View>
        </View>
      )}

      {/* Feature bar chart */}
      {contribs.length > 0 ? (
        <View className="border-t border-gray-100 pt-4">
          {contribs.slice(0, 5).map((feat, i) => (
            <View key={feat.name} className="mb-3">
              <View className="flex-row justify-between mb-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-700">{feat.name}</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-brand-text">{feat.value}%</Text>
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
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] mt-2">
            Contribution percentages reflect this prediction&apos;s feature weights from the trained RandomForest.
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
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 flex-1">{item.label}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-text">{item.pct}</Text>
            </View>
          ))}
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] mt-2 w-full">
            Illustrative split — generate a new estimate to see model-specific contributions.
          </Text>
        </View>
      )}
    </View>
  );
};
