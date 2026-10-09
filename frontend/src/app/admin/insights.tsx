import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { TopNav } from '@/components/common/TopNav';
import { useResponsive } from '../../hooks/useResponsive';
import { useRouter } from 'expo-router';

export default function MLInsightsDashboard() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { isMobile } = useResponsive();
  const router = useRouter();

  // What-If Simulator state
  const [simSqft, setSimSqft] = useState('2000');
  const [simQuality, setSimQuality] = useState('Standard');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<number | null>(null);
  const [retraining, setRetraining] = useState(false);

  const runSimulator = async () => {
    setSimulating(true);
    try {
      const res = await api.post('/ai/predict-cost', {
        square_footage: Number(simSqft) || 2000,
        num_floors: 1,
        location: 'Colombo',
        project_type: 'Residential',
        quality_tier: simQuality,
        site_condition: 'Level',
        structure_type: 'Concrete Frame',
        finishing_flooring: 'Tile',
        finishing_sanitary: 'Standard',
        finishing_electrical: 'Standard',
        target_timeline: 'Normal'
      });
      setSimResult(res.estimated_cost);
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message || 'Error running simulator');
      else Alert.alert('Error', e.message || 'Error running simulator');
    }
    setSimulating(false);
  };

  const handleRetrain = async () => {
    const confirmMessage = "Retrain the cost model now? This may take a minute.";
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMessage)) return;
    } else {
      await new Promise<void>((resolve, reject) => {
        Alert.alert('Retrain Model', confirmMessage, [
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('Cancelled')) },
          { text: 'Retrain', onPress: resolve }
        ]);
      }).catch(() => { /* do nothing */ });
    }

    setRetraining(true);
    try {
      const res = await api.post('/ai/retrain', {});
      if (Platform.OS === 'web') window.alert(res.message || 'Model retraining completed successfully.');
      else Alert.alert('Success', res.message || 'Model retraining completed successfully.');
      
      // refresh insights after retraining
      const data = await api.get('/ai/insights');
      setInsights(data);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message || 'Error retraining model.');
      else Alert.alert('Error', err.message || 'Error retraining model.');
    } finally {
      setRetraining(false);
    }
  };

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const data = await api.get('/ai/insights');
        setInsights(data);
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-4 text-brand-text dark:text-white font-semibold">Loading ML Insights...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center p-8">
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-4 text-brand-text dark:text-white font-bold text-lg text-center">Failed to load insights</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2 text-gray-500 dark:text-gray-400 text-center">{errorMsg}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-4 text-gray-400 dark:text-gray-500 text-xs text-center">Ensure the Python FastAPI backend is running.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <TopNav title="AI Analytics & Insights" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className={isMobile ? "p-4" : "p-8"}>
        <View className={`mb-8 flex-row ${isMobile ? 'flex-col gap-4' : 'justify-between items-start'}`}>
          <View className="flex-1 min-w-0">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-brand-text dark:text-white mb-2">ML Insights</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 leading-normal">
              Live model analytics from your project and construction data. Cost predictions and delay risks are machine-learning estimates — not financial commitments.
            </Text>
          </View>
          <Pressable style={{ minHeight: 44, minWidth: isMobile ? '100%' : 44 }}
            className={`bg-brand-orange px-4 py-2 rounded-lg flex-row items-center justify-center flex-shrink-0 ${isMobile ? '' : 'ml-4 self-start'}`}
            onPress={handleRetrain}
            disabled={retraining}
          >
            {retraining ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh-outline" size={16} color="#fff" />}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold ml-2">Retrain Model</Text>
          </Pressable>
        </View>

        {/* Model Performance Overview */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 24 }}>
          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-blue-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="server-outline" size={24} color="#3B82F6" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Active Model</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold text-base mt-1">{insights?.active_model}</Text>
            </View>
          </View>

          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-green-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="analytics-outline" size={24} color="#10B981" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold text-sm">R² Score (Cost Model)</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold text-base mt-1">
                {insights?.accuracy_score != null && insights.accuracy_score !== 'Not validated'
                  ? `${insights.accuracy_score} / 1.0`
                  : 'Not validated'}
              </Text>
            </View>
          </View>

          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-purple-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="documents-outline" size={24} color="#8B5CF6" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Training Samples</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold text-base mt-1">
                {insights?.total_training_samples?.toLocaleString() ?? '—'}
              </Text>
            </View>
          </View>

          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-orange-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="calendar-outline" size={24} color="#F97316" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Last Trained</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold text-base mt-1">
                {insights?.model_info?.cost_model?.trained_at
                  ? new Date(insights.model_info.cost_model.trained_at).toLocaleDateString()
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
          {/* Feature importance data from the insights endpoint */}
          <View style={{ flex: isMobile ? undefined : 3, width: isMobile ? '100%' : undefined, backgroundColor: '#fff', borderRadius: 16, padding: isMobile ? 16 : 28, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-1">Cost Driver Analysis</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-6">
              Global feature importance from the RandomForest cost model — how much each input variable influenced the training set&apos;s cost predictions overall.
            </Text>

            <View className="gap-5">
              {insights?.feature_importance?.length > 0 ? insights.feature_importance.map((feature: any, index: number) => (
                <View key={index}>
                  <View className="flex-row justify-between mb-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-700 dark:text-gray-300">{feature.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-orange">{feature.value}%</Text>
                  </View>
                  <View className="w-full bg-gray-100 dark:bg-gray-800 h-3 rounded-full overflow-hidden">
                    <View className="bg-brand-orange h-full rounded-full" style={{ width: `${feature.value}%` }} />
                  </View>
                </View>
              )) : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 dark:text-gray-500 italic">No feature importance data. Run the training pipeline first.</Text>}
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 dark:text-gray-500 mt-6 italic">
              Trained on {insights?.total_training_samples?.toLocaleString() ?? 'unknown'} records · Last updated {insights?.model_info?.cost_model?.trained_at ? new Date(insights.model_info.cost_model.trained_at).toLocaleDateString() : 'unknown'}
            </Text>
          </View>

          {/* Delay Risk per Project */}
          <View style={{ flex: isMobile ? undefined : 2, width: isMobile ? '100%' : undefined, gap: 16 }}>
            <View className="bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-1">Delay Risk by Project</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-4">
                Risk % computed from overdue milestones + late purchase orders for each project.
              </Text>
              {(insights?.projects?.length ?? 0) === 0 ? (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">No active projects to assess.</Text>
              ) : (
                insights.projects.slice(0, 5).map((proj: any) => {
                  const risk = proj.delay_risk ?? 0;
                  const color = risk > 70 ? '#EF4444' : risk > 40 ? '#F97316' : '#22C55E';
                  return (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={proj.project_id}
                      className="mb-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg"
                      onPress={() => router.push(`/admin/projects/${proj.project_id}`)}
                    >
                      <View className="flex-row justify-between mb-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1 mr-2">
                          {proj.project_name}
                        </Text>
                        <Text maxFontSizeMultiplier={1.3} className="text-sm font-bold" style={[{ flexShrink: 1, minWidth: 0 }, { color }]}>{risk}%</Text>
                      </View>
                      <View className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                        <View style={{ width: `${Math.min(risk, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
                      </View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                        {proj.recommendation}
                      </Text>
                      <View className="flex-row items-center mt-2 flex-wrap gap-2">
                        {proj.milestone_overdue_count > 0 && <View className="bg-red-100 px-2 py-1 rounded text-xs"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-[10px] font-bold uppercase">{proj.milestone_overdue_count} Milestones Overdue</Text></View>}
                        {proj.late_po_count > 0 && <View className="bg-orange-100 px-2 py-1 rounded text-xs"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-700 text-[10px] font-bold uppercase">{proj.late_po_count} Late POs</Text></View>}
                        {proj.is_over_budget && <View className="bg-purple-100 px-2 py-1 rounded text-xs"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-purple-700 text-[10px] font-bold uppercase">Over Budget</Text></View>}
                        {proj.attendance_gap > 0 && <View className="bg-yellow-100 px-2 py-1 rounded text-xs"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-700 text-[10px] font-bold uppercase">Low Attendance</Text></View>}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>

            <View className="bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-4">Project Health Overview</Text>
              <View className="gap-4">
                <View className="flex-row justify-between items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold">Total Projects</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text dark:text-white text-lg">{insights?.project_health?.total || 0}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold">Active In-Progress</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-blue-500 text-lg">{insights?.project_health?.active || 0}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-semibold">Completed</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-green-500 text-lg">{insights?.project_health?.completed || 0}</Text>
                </View>
                {(insights?.project_health?.trending_over_budget || 0) > 0 && (
                  <View className="flex-row justify-between items-center bg-red-50 p-2 rounded-lg mt-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 font-semibold text-xs">Trending Over Budget</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-red-700 text-sm">{insights.project_health.trending_over_budget}</Text>
                  </View>
                )}
                <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mb-2">Budget Compliance</Text>
                  <View className="flex-row items-end">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-black text-brand-text dark:text-white leading-none">{insights?.project_health?.on_budget_percent || 0}%</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-400 font-semibold ml-2 mb-1">On Budget</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-white dark:bg-[#1E293B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-2">Market Trends (Avg Cost / SqFt)</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-6">Real benchmarks calculated from completed projects, grouped by location and type.</Text>

            <View className="flex-row flex-wrap gap-4">
              {!insights?.market_trends?.length ? (
                 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 italic">Need at least 1 completed project with valid cost and sqft data to show market trends. Currently have 0.</Text>
              ) : (
                insights.market_trends.map((trend: any, index: number) => (
                  <View key={index} className="flex-1 min-w-[150px] p-4 rounded-xl bg-gray-50 dark:bg-[#0F172A] border border-gray-100 dark:border-gray-800">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-500 dark:text-gray-400 mb-1">{trend.location} — {trend.project_type}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-black text-brand-text dark:text-white text-lg mb-2">
                      LKR {trend.avg_cost_per_sqft.toLocaleString(undefined, {maximumFractionDigits: 0})} / sqft
                    </Text>
                    <View className="bg-blue-100 self-start px-2 py-1 rounded">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 text-[10px] font-bold uppercase">Based on {trend.sample_size} Project{trend.sample_size > 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
        </View>

        {/* What-If Simulator */}
        <View className="bg-white dark:bg-[#1E293B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-12">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-2">Cost Simulator (What-If Analysis)</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-6">Adjust parameters to see how the model&apos;s cost prediction shifts in real time.</Text>

            <View className="flex-row flex-wrap items-end gap-4">
              <View className="flex-1 min-w-[200px]">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Square Footage</Text>
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  value={simSqft}
                  onChangeText={setSimSqft}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-brand-text"
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1 min-w-[200px]">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Quality Tier</Text>
                <View className="flex-row bg-gray-50 rounded-lg border border-gray-200 p-1">
                  {['Standard', 'Premium', 'Luxury'].map(q => (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={q}
                      onPress={() => setSimQuality(q)}
                      className={`flex-1 items-center py-2 rounded-md ${simQuality === q ? 'bg-white shadow-sm' : ''}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-bold ${simQuality === q ? 'text-brand-orange' : 'text-gray-500'}`}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={runSimulator}
                disabled={simulating}
                className={`bg-brand-orange px-8 py-3 rounded-lg h-[46px] justify-center ${simulating ? 'opacity-50' : ''}`}
              >
                {simulating ? <ActivityIndicator color="#fff" /> : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Simulate</Text>}
              </Pressable>
            </View>

            {simResult !== null && (
              <View className="mt-6 p-6 bg-orange-50 border border-orange-100 rounded-xl flex-row items-center justify-between">
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-semibold mb-1">Simulated Total Cost</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-black text-brand-text">LKR {simResult.toLocaleString(undefined, {maximumFractionDigits:0})}</Text>
                </View>
                <Ionicons name="calculator-outline" size={32} color="#F97316" className="opacity-50" />
              </View>
            )}
        </View>

      </ScrollView>
    </View>
  );
}
