import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';
import { DelayRiskAssessment } from './DelayRiskAssessment';

export const DelayRiskPanel = ({ pmId }: { pmId?: string }) => {
  const { user, session } = useAuth();
  const { request } = useApi();
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRisks([]); setLoading(true); setError('');
    if (!user?.id || !session?.access_token) { setLoading(false); return; }
    void request(`/ai/insights${pmId ? `?pm_id=${encodeURIComponent(pmId)}` : ''}`, { headers: { Authorization: `Bearer ${session.access_token}` } }, 30000)
      .then(data => { if (active) setRisks([...(data.projects || [])].sort((a, b) => (b.delay_risk ?? -1) - (a.delay_risk ?? -1)).slice(0, 4)); })
      .catch(e => { if (active) setError(e.message || 'Risk assessment is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, session?.access_token, pmId, request, retry]);
  return <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 dark:border-slate-700 min-h-[300px] w-full">
    <Text className="text-lg font-bold text-brand-text dark:text-slate-100">Project Delay Risk</Text>
    <Text className="text-xs text-slate-500 leading-5 mt-1 mb-5">Verified trained model predictions · no formula fallback</Text>
    {loading ? <ActivityIndicator color="#F97316" /> : error ? <View style={{ gap: 12 }}><Text className="text-sm text-red-600">{error}</Text><Button label="Retry risk assessment" variant="secondary" onPress={() => setRetry(value => value + 1)} /></View> : !risks.length ? <Text className="text-sm text-slate-500">No active projects to assess.</Text> : risks.map(risk => <View key={risk.project_id} style={{ marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 10 }}>
      <Text className="text-sm font-semibold text-brand-text dark:text-slate-100">{risk.project_name}</Text>
      <DelayRiskAssessment risk={risk} compact />
    </View>)}
  </View>;
};
