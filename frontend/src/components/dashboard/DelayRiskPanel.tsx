import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

const RiskRow = ({
  project,
  percentage,
  message,
  colorClass,
}: {
  project: string;
  percentage: number;
  message: string;
  colorClass: string;
}) => (
  <View className="mb-4">
    <View className="flex-row justify-between items-center mb-1">
      <Text className="text-brand-text font-semibold text-sm flex-1 mr-2" numberOfLines={1}>
        {project}
      </Text>
      <Text className={`font-bold ${colorClass}`}>{percentage}%</Text>
    </View>

    <View className="w-full h-2 bg-gray-100 rounded-full mb-1">
      <View
        className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </View>

    <Text className="text-gray-500 text-xs">{message}</Text>
  </View>
);

export const DelayRiskPanel = ({ pmId }: { pmId?: string }) => {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string>('');

  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const loadRisks = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const params = pmId ? `?pm_id=${pmId}` : '';
        const res = await fetch(`${apiUrl}/ai/insights${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `API ${res.status}`);
        }
        const data = await res.json();

        if (isMounted) {
          // Use real per-project delay risks from the backend
          const projectRisks: any[] = data.projects || [];
          const sorted = [...projectRisks].sort(
            (a: any, b: any) => b.delay_risk - a.delay_risk
          );
          setRisks(sorted.slice(0, 3));

          // Build a one-line model note
          const trained = data.model_info?.delay_model?.trained_at
            ? new Date(data.model_info.delay_model.trained_at).toLocaleDateString()
            : null;
          const n = data.model_info?.delay_model?.dataset_size;
          if (trained) {
            setModelNote(`Trained on ${n ? n.toLocaleString() + ' records · ' : ''}${trained}`);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          if (err.name === 'AbortError') {
            setError('Request timed out. Server may be busy.');
          } else {
            setError(err.message || 'Insights unavailable');
          }
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) setLoading(false);
      }
    };

    loadRisks();
    return () => { 
      isMounted = false; 
      controller.abort();
    };
  }, [pmId, retryKey]);

  const getRiskColor = (score: number) => {
    if (score > 70) return 'text-brand-danger';
    if (score > 40) return 'text-brand-warning';
    return 'text-brand-success';
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 min-h-[300px] flex-1">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-lg font-bold text-brand-text">AI Delay Risk</Text>
        <View className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
          <Text className="text-brand-danger text-xs font-bold">!</Text>
        </View>
      </View>

      {modelNote ? (
        <Text className="text-gray-400 text-[10px] mb-5">
          Model: {modelNote} · Risk computed from live milestone & order data
        </Text>
      ) : (
        <View className="mb-5" />
      )}

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-brand-danger text-sm text-center mb-2">{error}</Text>
            <Text className="text-gray-400 text-xs text-center mb-4">
              Ensure the backend is running and models are trained.
            </Text>
            <Text 
              className="text-brand-orange font-bold text-xs" 
              onPress={() => setRetryKey(k => k + 1)}
            >
              Retry
            </Text>
          </View>
        ) : risks.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-gray-400">No active risk assessments.</Text>
          </View>
        ) : (
          risks.map((risk, idx) => (
            <RiskRow
              key={idx}
              project={risk.project_name || 'Unknown Project'}
              percentage={risk.delay_risk || 0}
              message={risk.recommendation || 'On track'}
              colorClass={getRiskColor(risk.delay_risk || 0)}
            />
          ))
        )}
      </View>
    </View>
  );
};
