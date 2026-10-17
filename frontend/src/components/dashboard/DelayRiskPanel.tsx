import { getApiUrl } from '../../lib/apiUrl';
import { useApi } from '../../hooks/useApi';
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
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm flex-1 mr-2">
        {project}
      </Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold ${colorClass}`}>{percentage}%</Text>
    </View>

    <View className="w-full h-2 bg-gray-100 rounded-full mb-1">
      <View
        className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </View>

    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{message}</Text>
  </View>
);

export const DelayRiskPanel = ({ pmId }: { pmId?: string }) => {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string>('');

  const [retryKey, setRetryKey] = useState(0);

  const { request: apiRequest, loading: apiLoading, error: apiError } = useApi();

  useEffect(() => {
    let isMounted = true;

    const loadRisks = async () => {
      setLoading(true);
      setError(null);
      try {
        let { data: { session } } = await supabase.auth.getSession();
        let token = session?.access_token;

        if (!token) {
          // Wait briefly in case session is hydrating from storage
          await new Promise(resolve => setTimeout(resolve, 400));
          const retryRes = await supabase.auth.getSession();
          token = retryRes.data.session?.access_token;
        }

        if (!token) {
          if (isMounted) {
            setError('Please sign in to view AI risk assessments.');
          }
          return;
        }

        const params = pmId ? `?pm_id=${pmId}` : '';
        const data = await apiRequest(`/ai/insights${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 30000);

        if (isMounted && data) {
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
        if (!isMounted) return;
        try {
          let query = supabase
            .from('projects')
            .select('id, name, status, total_budget, spent_cost, start_date, end_date, completion_percentage');
          if (pmId) query = query.eq('pm_id', pmId);
          const { data: dbProjects } = await query;
          if (dbProjects && dbProjects.length > 0) {
            const mapped = dbProjects.map((p: any) => {
              const budget = Number(p.total_budget) || 0;
              const spent = Number(p.spent_cost) || 0;
              const completion = Number(p.completion_percentage) || 0;
              let score = 20;
              if (p.end_date && p.start_date) {
                const start = new Date(p.start_date).getTime();
                const end = new Date(p.end_date).getTime();
                const now = Date.now();
                if (end > start) {
                  const elapsedRatio = Math.max(0, Math.min(1, (now - start) / (end - start)));
                  const expected = elapsedRatio * 100;
                  if (expected - completion > 20) score += 45;
                  else if (expected - completion > 10) score += 20;
                }
              }
              if (budget > 0 && spent > budget) score += 25;
              return {
                project_id: p.id,
                project_name: p.name || 'Untitled Project',
                delay_risk: Math.min(95, Math.max(10, score)),
                recommendation: score > 60 ? 'Schedule lagging — expedite milestones' : 'On track with milestone schedule',
              };
            }).sort((a: any, b: any) => b.delay_risk - a.delay_risk);
            setRisks(mapped.slice(0, 3));
            setModelNote('Direct Supabase live tracking · Rule-based risk');
            setError(null);
            return;
          }
        } catch {
          // ignore
        }
        setError(err.message || 'Insights unavailable');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRisks();
    return () => {
      isMounted = false;
    };
  }, [pmId, retryKey]);

  const getRiskColor = (score: number) => {
    if (score > 70) return 'text-brand-danger';
    if (score > 40) return 'text-brand-warning';
    return 'text-brand-success';
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 min-h-[300px] w-full">
      <View className="flex-row justify-between items-center mb-1">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">AI Delay Risk</Text>
        <View className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-danger text-xs font-bold">!</Text>
        </View>
      </View>

      {modelNote ? (
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px] mb-5">
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
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-danger text-sm text-center mb-2">{error}</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs text-center mb-4">
              Ensure the backend is running and models are trained.
            </Text>
            <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3}
              className="text-brand-orange font-bold text-xs"
              onPress={() => setRetryKey(k => k + 1)}
            >
              Retry
            </Text>
          </View>
        ) : risks.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No active risk assessments.</Text>
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
