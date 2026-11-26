import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

export function DelayRiskAssessment({ risk, compact = false }: { risk: any; compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact);
  const ml = risk.method === 'verified_ml';
  const value = typeof risk.delay_risk === 'number' && Number.isFinite(risk.delay_risk) ? risk.delay_risk : null;
  const level = value === null ? risk.assessment_status === 'model_not_ready' ? 'Model not ready' : 'Insufficient data' : value >= 60 ? 'High' : value >= 30 ? 'Moderate' : 'Low';
  const color = value === null ? '#64748B' : value >= 60 ? '#DC2626' : value >= 30 ? '#C2410C' : '#15803D';
  return <View style={{ gap: 10, minWidth: 0 }} testID="delay-risk-assessment">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color }}>{value === null ? '—' : `${value.toFixed(1).replace(/\.0$/, '')}%`}</Text>
      <Text style={{ color, fontSize: 12, fontWeight: '600', backgroundColor: `${color}12`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>{level}</Text>
    </View>
    {value !== null && <View style={{ height: 6, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' }}><View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 6, backgroundColor: color }} /></View>}
    <Text className="text-xs text-slate-500 dark:text-slate-400 leading-5">{risk.recommendation || 'Insufficient data to assess delay risk'}</Text>
    {!!risk.missing_components?.length && <Text className="text-xs text-amber-700 leading-5">Missing: {risk.missing_components.join(', ')}. {ml ? 'All model predictors must be recorded before inference.' : 'Available component weights are redistributed.'}</Text>}
    {!!risk.components?.length && <>
      {compact && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 44, justifyContent: 'center' }}><Text className="text-xs font-semibold text-orange-700">{expanded ? 'Hide score breakdown' : 'Show score breakdown'}</Text></Pressable>}
      {expanded && <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 }}>
        {risk.components.map((part: any) => <View key={part.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text className="text-xs font-semibold text-slate-700 dark:text-slate-200" style={{ flex: 1 }}>{part.label}</Text><Text className="text-xs text-slate-600 dark:text-slate-400">{part.score == null ? 'Not available' : `${Number(part.score).toFixed(1)}/100`}</Text></View>
          <Text className="text-xs text-slate-500 leading-5">{part.score == null ? part.reason : ml ? `${part.reason}${part.model_importance == null ? '' : ` · Global model importance ${Number(part.model_importance).toFixed(1)}%`}` : `Weight ${Number(part.effective_weight).toFixed(1)}% · Contribution ${Number(part.contribution).toFixed(1)} points`}</Text>
        </View>)}
        <Text className="text-xs text-slate-500 leading-5">{ml ? `Verified trained model · ${risk.training_projects ?? 0} training projects. Feature importance is global, not a per-prediction explanation. No rule score is substituted when the model is unavailable. Model probabilities have not been calibrated.` : 'Q16 weights: labour 33%, procurement 25%, schedule 21% (split equally), cost 21%. Rule-based index, not a calibrated probability.'} Attendance uses the current roster and seven completed Monday–Saturday days; incomplete logs and missing history can affect inputs.</Text>
      </View>}
    </>}
  </View>;
}
