import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Alert, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { TopNav } from '@/components/common/TopNav';
import { notify, confirmAction } from '@/utils/notify';
import { useResponsive } from '../../hooks/useResponsive';
import { useRouter } from 'expo-router';
import { AutoFitText } from '@/components/common/AutoFitText';

export default function MLInsightsDashboard() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { isMobile, isPhone, isTablet } = useResponsive();
  const router = useRouter();

  // What-If Simulator state
  const [simSqft, setSimSqft] = useState('2000');
  const [simQuality, setSimQuality] = useState('Standard');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<number | null>(null);
  const [retraining, setRetraining] = useState(false);

  // Historical BOQs Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [importing, setImporting] = useState(false);

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
      notify('Error', e.message || 'Error running simulator');
    }
    setSimulating(false);
  };

  const handleRetrain = async () => {
    const confirmMessage = "Retrain the cost model on real projects now?";
    const confirmed = await confirmAction('Retrain Model', confirmMessage, false);
    if (!confirmed) return;

    setRetraining(true);
    try {
      const res = await api.post('/ai/retrain', {});
      notify('Success', res.message || 'Model retraining completed successfully.');
      
      const data = await api.get('/ai/insights');
      setInsights(data);
    } catch (err: any) {
      notify('Error', err.message || 'Error retraining model.');
    } finally {
      setRetraining(false);
    }
  };

  const handleLoadTemplate = async () => {
    try {
      const res = await api.get('/ai/historical-template');
      if (res?.template) {
        setImportCsvText(res.template);
        if (!evidenceNote) {
          setEvidenceNote('CIDA Standard BOQ Benchmark 2024');
        }
        notify('Template Loaded', 'Sample historical project BOQs loaded into the input area.');
      }
    } catch (e: any) {
      notify('Error', e.message || 'Could not fetch template');
    }
  };

  const handleImportSubmit = async () => {
    if (!evidenceNote.trim()) {
      notify('Validation', 'A source note is required per import batch (e.g., QS firm, contractor, BOQ file reference).');
      return;
    }
    if (!importCsvText.trim()) {
      notify('Validation', 'Please paste CSV content or load the template.');
      return;
    }
    setImporting(true);
    try {
      const res = await api.post('/ai/import-historical-projects', {
        csv_content: importCsvText.trim(),
        evidence_note: evidenceNote.trim(),
      });
      notify('Success', `Imported ${res.inserted || 0} projects (${res.skipped_duplicates || 0} duplicates skipped). Model automatically calibrated!`);
      setShowImportModal(false);
      setImportCsvText('');
      setEvidenceNote('');
      
      const data = await api.get('/ai/insights');
      setInsights(data);
    } catch (e: any) {
      notify('Import Failed', e.message || 'CSV validation error. Verify 25 Sri Lankan districts and positive numbers.');
    } finally {
      setImporting(false);
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
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className={isPhone ? "p-3 pb-24" : isMobile ? "p-4 pb-20" : "p-8"}>
        <View className={`mb-6 md:mb-8 flex-row ${isMobile ? 'flex-col gap-3.5' : 'justify-between items-start'}`}>
          <View className="flex-1 min-w-0">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl sm:text-2xl md:text-3xl font-black text-brand-text dark:text-white mb-1.5">
              Cost Intelligence &amp; Analytics
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-xs md:text-sm leading-relaxed max-w-2xl">
              Real-world cost benchmarks, model accuracy tracking, and proactive project risk intelligence calibrated against verified completed projects.
            </Text>
          </View>
          <View className={`flex-row gap-2 ${isMobile ? 'w-full' : 'ml-4 self-start'}`}>
            <Pressable style={{ minHeight: 44 }}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2 rounded-xl flex-row items-center justify-center flex-1 shadow-sm"
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#F97316" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs sm:text-sm ml-2">Import BOQs</Text>
            </Pressable>

            <Pressable style={{ minHeight: 44 }}
              className="bg-brand-orange px-3.5 py-2 rounded-xl flex-row items-center justify-center flex-1 shadow-sm"
              onPress={handleRetrain}
              disabled={retraining}
            >
              {retraining ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh-outline" size={16} color="#fff" />}
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs sm:text-sm ml-2">Retrain</Text>
            </Pressable>
          </View>
        </View>

        {/* Model Performance Overview Cards (Responsive 1-col on phone, 2x2 on tablet, 4-col on desktop) */}
        <View style={{
          flexDirection: isPhone ? 'column' : 'row',
          flexWrap: isTablet ? 'wrap' : 'nowrap',
          gap: 12,
          marginBottom: 24,
          justifyContent: isTablet ? 'space-between' : undefined
        }}>
          {/* Card 1: Estimator Engine */}
          <View
            className="bg-white dark:bg-[#1E293B] p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 justify-between min-h-[135px]"
            style={{
              flex: isPhone || isTablet ? undefined : 1,
              width: isPhone ? '100%' : isTablet ? '48.5%' : undefined,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
                <Ionicons name="hardware-chip-outline" size={20} color="#3B82F6" />
              </View>
              <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 rounded-full border border-blue-200/50 dark:border-blue-800/50">
                <Text className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Engine</Text>
              </View>
            </View>
            <View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Cost Estimator</Text>
              <Text className="text-base font-bold text-brand-text dark:text-white" numberOfLines={1}>
                Hybrid AI + CIDA
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1" numberOfLines={1}>
                RandomForest · Material BOQ rates
              </Text>
            </View>
          </View>

          {/* Card 2: Estimation Accuracy / Benchmark */}
          <View
            className="bg-white dark:bg-[#1E293B] p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 justify-between min-h-[135px]"
            style={{
              flex: isPhone || isTablet ? undefined : 1,
              width: isPhone ? '100%' : isTablet ? '48.5%' : undefined,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${((insights?.real_projects_count ?? 0) >= 30) ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/30'}`}>
                <Ionicons name="analytics-outline" size={20} color={((insights?.real_projects_count ?? 0) >= 30) ? '#10B981' : '#F59E0B'} />
              </View>
              <View className={`px-2.5 py-0.5 rounded-full border ${((insights?.real_projects_count ?? 0) >= 30) ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700'}`}>
                <Text className={`text-[10px] font-bold ${((insights?.real_projects_count ?? 0) >= 30) ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'} uppercase tracking-wider`}>
                  {((insights?.real_projects_count ?? 0) >= 30) ? 'Validated' : 'Calibrating'}
                </Text>
              </View>
            </View>

            <View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                {(insights?.real_projects_count ?? 0) >= 30 ? 'Real Accuracy' : 'Benchmark Status'}
              </Text>

              {(insights?.real_projects_count ?? 0) < 30 ? (
                <View>
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text className="text-base font-bold text-amber-700 dark:text-amber-400">
                      Rate Baseline
                    </Text>
                    <View className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded text-[10px]">
                      <Text className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
                        {insights?.real_projects_count ?? 0}/30 Projects
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-1" numberOfLines={1}>
                    Baseline error: <Text className="font-bold text-brand-orange">{insights?.baseline_mape != null ? `${insights.baseline_mape}%` : '—'}</Text>
                    {insights?.validation_mape != null && ` · LOO: ${insights.validation_mape}%`}
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-xl font-bold text-brand-text dark:text-white">
                    {insights?.validation_mape}% MAPE
                  </Text>
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    5-Fold Cross Validation ({insights?.real_projects_count} projects)
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Card 3: Real Project Benchmarks */}
          <View
            className="bg-white dark:bg-[#1E293B] p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 justify-between min-h-[135px]"
            style={{
              flex: isPhone || isTablet ? undefined : 1,
              width: isPhone ? '100%' : isTablet ? '48.5%' : undefined,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 items-center justify-center">
                <Ionicons name="file-tray-full-outline" size={20} color="#8B5CF6" />
              </View>
              <View className="bg-purple-50 dark:bg-purple-900/30 px-2.5 py-0.5 rounded-full border border-purple-200/50 dark:border-purple-800/50">
                <Text className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Dataset</Text>
              </View>
            </View>
            <View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Real Benchmarks</Text>
              <Text className="text-2xl font-black text-brand-text dark:text-white">
                {insights?.verified_real_count ?? insights?.real_projects_count ?? 0}
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1" numberOfLines={1}>
                Audited completed accounts &amp; BOQs
              </Text>
            </View>
          </View>

          {/* Card 4: Last Calibration */}
          <View
            className="bg-white dark:bg-[#1E293B] p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 justify-between min-h-[135px]"
            style={{
              flex: isPhone || isTablet ? undefined : 1,
              width: isPhone ? '100%' : isTablet ? '48.5%' : undefined,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 items-center justify-center">
                <Ionicons name="sync-outline" size={20} color="#F97316" />
              </View>
              <View className="bg-orange-50 dark:bg-orange-900/30 px-2.5 py-0.5 rounded-full border border-orange-200/50 dark:border-orange-800/50">
                <Text className="text-[10px] font-bold text-brand-orange uppercase tracking-wider">Status</Text>
              </View>
            </View>
            <View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Last Calibration</Text>
              <Text className="text-base font-bold text-brand-text dark:text-white" numberOfLines={1}>
                {insights?.model_info?.cost_model?.trained_at
                  ? new Date(insights.model_info.cost_model.trained_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Up to Date'}
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1" numberOfLines={1}>
                Synced with live PO rates
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
          {/* Cost Driver Analysis (100% normalized across all 9 features) */}
          <View style={{ flex: isMobile ? undefined : 3, width: isMobile ? '100%' : undefined, backgroundColor: '#fff', borderRadius: 16, padding: isMobile ? 16 : 28, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <View className="flex-row justify-between items-center mb-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white">Cost Driver Analysis</Text>
              {(insights?.cost_driver_is_indicative || (insights?.real_projects_count ?? 0) < 30) && (
                <View className="bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-700">
                  <Text className="text-amber-800 dark:text-amber-300 font-bold text-[11px]">Indicative only (n &lt; 30)</Text>
                </View>
              )}
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-3">
              Relative contribution of architectural and site factors to unit construction cost (sums to 100%).
            </Text>
            <View className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl p-3 mb-5 flex-row items-center">
              <Ionicons name="information-circle-outline" size={18} color="#D97706" />
              <Text className="text-xs text-amber-900 dark:text-amber-200 ml-2.5 font-medium flex-1">
                Cost is modeled per square foot. Project type, finishes, and location determine unit rates, while floor area scales total volume.
              </Text>
            </View>

            <View className="gap-4">
              {insights?.feature_importance?.length > 0 ? insights.feature_importance.map((feature: any, index: number) => (
                <View key={feature.key || index}>
                  <View className="flex-row justify-between mb-1.5">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-xs md:text-sm text-gray-700 dark:text-gray-300">{feature.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-xs md:text-sm text-brand-orange">{Number(feature.value || 0).toFixed(1)}%</Text>
                  </View>
                  <View className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                    <View className="bg-brand-orange h-full rounded-full" style={{ width: `${Math.min(feature.value, 100)}%` }} />
                  </View>
                </View>
              )) : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 dark:text-gray-500 italic">No feature importance data. Run the training pipeline first.</Text>}
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 dark:text-gray-500 mt-6 italic">
              Calibrated on {insights?.verified_real_count ?? insights?.real_projects_count ?? 0} verified real projects · Last updated {insights?.model_info?.cost_model?.trained_at ? new Date(insights.model_info.cost_model.trained_at).toLocaleDateString() : 'unknown'}
            </Text>
          </View>

          {/* Delay Risk per Project */}
          <View style={{ flex: isMobile ? undefined : 2, width: isMobile ? '100%' : undefined, gap: 16 }}>
            <View className="bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-1">Project Delay Risk</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-4">
                Automated schedule &amp; budget health based on live milestones, supplier orders, and site attendance.
              </Text>
              {(insights?.projects?.length ?? 0) === 0 ? (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">No active projects to assess.</Text>
              ) : (
                insights.projects.slice(0, 5).map((proj: any) => {
                  const risk = proj.delay_risk ?? 0;
                  const color = risk > 70 ? '#EF4444' : risk > 40 ? '#F97316' : '#22C55E';
                  const statusLabel = risk > 70 ? 'High Risk' : risk > 40 ? 'Moderate' : 'On Track';
                  return (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={proj.project_id}
                      className="mb-4 bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/60"
                      onPress={() => router.push(`/admin/projects/${proj.project_id}`)}
                    >
                      <View className="flex-row justify-between items-center mb-1.5">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1 mr-2" numberOfLines={1}>
                          {proj.project_name}
                        </Text>
                        <View className="flex-row items-center gap-1.5">
                          <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold" style={{ color }}>{risk}%</Text>
                          <View className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${color}18` }}>
                            <Text className="text-[10px] font-bold" style={{ color }}>{statusLabel}</Text>
                          </View>
                        </View>
                      </View>
                      <View className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                        <View style={{ width: `${Math.min(risk, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
                      </View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                        {proj.recommendation}
                      </Text>
                      <View className="flex-row items-center mt-2 flex-wrap gap-1.5">
                        {proj.milestone_overdue_count > 0 && (
                          <View className="bg-red-50 dark:bg-red-950/30 border border-red-200/50 px-2 py-0.5 rounded-md">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 dark:text-red-300 text-[10px] font-bold">
                              {proj.milestone_overdue_count} Overdue Milestone{proj.milestone_overdue_count > 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                        {proj.late_po_count > 0 && (
                          <View className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 px-2 py-0.5 rounded-md">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-700 dark:text-orange-300 text-[10px] font-bold">
                              {proj.late_po_count} Late Order{proj.late_po_count > 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                        {proj.is_over_budget && (
                          <View className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 px-2 py-0.5 rounded-md">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                              Over Budget
                            </Text>
                          </View>
                        )}
                        {proj.attendance_gap > 0 && (
                          <View className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 px-2 py-0.5 rounded-md">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                              Low Attendance
                            </Text>
                          </View>
                        )}
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

        {/* Market Trends (Avg Cost / SqFt) - Gated to >= 3 completed projects per group */}
        <View className="bg-white dark:bg-[#1E293B] p-5 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-1.5">Market Cost Benchmarks (per Sq Ft)</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-6">
              Verified construction benchmarks calculated from completed projects by district and project type (requires at least 3 completed projects per group).
            </Text>

            {/* Qualifying Groups (sample_size >= 3) */}
            {insights?.market_trends?.length > 0 && (
              <View className="flex-row flex-wrap gap-4 mb-6">
                {insights.market_trends.map((trend: any, index: number) => (
                  <View key={index} className="flex-1 min-w-[200px] p-4 rounded-xl bg-gray-50 dark:bg-[#0F172A] border border-gray-100 dark:border-gray-800">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-600 dark:text-gray-300 mb-1">{trend.location} — {trend.project_type}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-black text-brand-text dark:text-white text-lg mb-2">
                      LKR {Number(trend.avg_cost_per_sqft || 0).toLocaleString(undefined, {maximumFractionDigits: 0})} / sqft
                    </Text>
                    <View className="bg-green-100 dark:bg-green-900/40 self-start px-2 py-1 rounded">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-800 dark:text-green-300 text-[10px] font-bold uppercase">
                        Verified Benchmark ({trend.sample_size} Projects)
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Pending Groups that need more projects (< 3) */}
            {insights?.pending_market_trends?.length > 0 && (
              <View className="mt-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                <Text className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                  Pending Groups (Need 3 projects per district &amp; type to qualify):
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {insights.pending_market_trends.map((pending: any, idx: number) => (
                    <View key={idx} className="bg-white dark:bg-gray-700/60 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 flex-row items-center">
                      <Ionicons name="time-outline" size={13} color="#F59E0B" className="mr-1.5" />
                      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        {pending.location} / {pending.project_type}: <Text className="font-bold text-amber-600 dark:text-amber-400">{pending.sample_size} of 3 needed</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!insights?.market_trends?.length && !insights?.pending_market_trends?.length && (
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">
                No completed project data available yet. Completed projects will appear here once grouped by district and type.
              </Text>
            )}
        </View>

        {/* Real Projects History: Estimate vs. Actual Variance */}
        <View className="bg-white dark:bg-[#1E293B] p-5 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
            <View className="flex-row justify-between items-start mb-2">
              <View className="flex-1 mr-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white">
                  Estimate vs. Actual Variance ({insights?.verified_real_count ?? insights?.real_projects_count ?? 0} verified real projects)
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-1">
                  Verified project actuals used to train and validate the log-scale cost estimator. Only real and imported BOQ records determine accuracy.
                </Text>
              </View>
              <Pressable
                className="bg-orange-50 dark:bg-orange-900/30 px-3 py-1.5 rounded-lg flex-row items-center border border-orange-200 dark:border-orange-800"
                onPress={() => setShowImportModal(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#F97316" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs ml-1.5">Import Past Projects</Text>
              </Pressable>
            </View>

            {/* Warning when summary is based on fewer than 10 projects */}
            {insights?.historical_summary_metrics?.warning && (
              <View className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex-row items-center">
                <Ionicons name="warning-outline" size={18} color="#D97706" />
                <Text className="text-amber-800 dark:text-amber-300 text-xs ml-2 font-medium flex-1">
                  ⚠️ {insights.historical_summary_metrics.warning}
                </Text>
              </View>
            )}

            {(!insights?.historical_projects || insights.historical_projects.length === 0) ? (
              <View className="p-8 items-center justify-center bg-gray-50 dark:bg-gray-800/40 rounded-xl mt-4">
                <Ionicons name="file-tray-outline" size={40} color="#9CA3AF" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-semibold mt-3 text-center">
                  No project records found yet
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-1 text-center max-w-md">
                  Import past contractor or QS BOQs using the CSV importer above, or mark in-progress projects as Completed.
                </Text>
                <Pressable
                  className="mt-4 bg-brand-orange px-4 py-2 rounded-lg flex-row items-center"
                  onPress={() => setShowImportModal(true)}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs ml-2">Import Sample BOQs</Text>
                </Pressable>
              </View>
            ) : (
              <View className="mt-4">
                {isMobile && (
                  <View className="flex-row items-center mb-2 px-1">
                    <Ionicons name="swap-horizontal" size={14} color="#F97316" />
                    <Text className="text-[11px] text-gray-500 dark:text-gray-400 ml-1.5 font-medium">
                      Swipe horizontally to inspect all project actuals &amp; variance
                    </Text>
                  </View>
                )}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={{ minWidth: 880 }}
                  style={{ width: '100%' }}
                >
                  <View className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden" style={{ minWidth: 880, width: '100%' }}>
                    <View className="bg-gray-50 dark:bg-gray-800/70 p-3 flex-row border-b border-gray-100 dark:border-gray-800">
                      <Text className="flex-[2] font-bold text-xs text-gray-500 uppercase">Project / District</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Area / Year</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Est. Rate</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Act. Rate</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Estimate</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Actual</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-right">Variance</Text>
                      <Text className="flex-1 font-bold text-xs text-gray-500 uppercase text-center">Provenance</Text>
                    </View>

                    {insights.historical_projects.map((proj: any, idx: number) => {
                      const est = proj.estimate_total_lkr || 0;
                      const act = proj.actual_total_lkr || 0;
                      const variancePct = proj.variance_pct ?? (est > 0 ? ((act - est) / est) * 100 : 0);
                      const isOver = variancePct > 0;
                      const varianceColor = Math.abs(variancePct) <= 10 ? '#10B981' : isOver ? '#EF4444' : '#3B82F6';
                      const isSample = proj.source === 'sample';

                      return (
                        <View key={proj.id || idx} className={`p-3 flex-row items-center border-b border-gray-100 dark:border-gray-800 ${isSample ? 'bg-gray-50/30 opacity-75' : idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-900/30' : 'bg-white dark:bg-[#1E293B]'}`}>
                          <View className="flex-[2] pr-2">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-sm text-brand-text dark:text-white" numberOfLines={1}>
                              {proj.project_name}
                            </Text>
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400">
                              {proj.district}{proj.town ? `, ${proj.town}` : ''} • {proj.project_type}
                            </Text>
                            {proj.evidence_note && (
                              <Text className="text-[10px] text-gray-400 italic mt-0.5" numberOfLines={1}>
                                Ref: {proj.evidence_note}
                              </Text>
                            )}
                          </View>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-right text-xs text-gray-600 dark:text-gray-300">
                            {Number(proj.floor_area_sqft || 0).toLocaleString()} sqft{'\n'}
                            <Text className="text-[10px] text-gray-400">{proj.cost_year || '—'}</Text>
                          </Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-right text-xs text-gray-600 dark:text-gray-300">
                            {proj.estimate_cost_per_sqft ? `LKR ${Number(proj.estimate_cost_per_sqft).toLocaleString(undefined, {maximumFractionDigits: 0})}` : '—'}
                          </Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-right text-xs font-semibold text-brand-text dark:text-white">
                            {proj.actual_cost_per_sqft ? `LKR ${Number(proj.actual_cost_per_sqft).toLocaleString(undefined, {maximumFractionDigits: 0})}` : '—'}
                          </Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-right text-xs text-gray-600 dark:text-gray-300 font-medium">
                            {est > 0 ? `${(est / 1_000_000).toFixed(2)}M` : '—'}
                          </Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-right text-xs font-bold text-brand-text dark:text-white">
                            {(act / 1_000_000).toFixed(2)}M
                          </Text>
                          <View className="flex-1 items-end">
                            {est > 0 ? (
                              <Text style={{ flexShrink: 1, minWidth: 0, color: varianceColor }} maxFontSizeMultiplier={1.3} className="text-xs font-bold">
                                {isOver ? '+' : ''}{Number(variancePct).toFixed(1)}%
                              </Text>
                            ) : (
                              <Text className="text-xs text-gray-400">—</Text>
                            )}
                          </View>
                          <View className="flex-1 items-center">
                            <View className={`px-2 py-0.5 rounded-full ${isSample ? 'bg-gray-100 dark:bg-gray-700' : proj.source === 'imported_boq' ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}`}>
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold ${isSample ? 'text-gray-600 dark:text-gray-300' : proj.source === 'imported_boq' ? 'text-blue-700 dark:text-blue-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                {isSample ? 'sample' : proj.source === 'imported_boq' ? 'imported BOQ' : 'real'}
                              </Text>
                            </View>
                            {proj.verified && !isSample && (
                              <View className="flex-row items-center mt-0.5">
                                <Ionicons name="checkmark-circle" size={10} color="#10B981" />
                                <Text className="text-[9px] text-green-600 dark:text-green-400 font-medium ml-0.5">verified</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {/* Summary Row */}
                    {insights?.historical_summary_metrics && (
                      <View className="bg-orange-50/60 dark:bg-orange-950/30 p-3.5 flex-row items-center border-t-2 border-brand-orange/40">
                        <View className="flex-[2] pr-2">
                          <Text className="font-black text-xs text-brand-text dark:text-white uppercase tracking-wider">
                            Summary Metrics
                          </Text>
                          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                            Verified real projects only ({insights.historical_summary_metrics.count} total)
                          </Text>
                        </View>
                        <Text className="flex-1 text-right text-xs font-bold text-gray-600 dark:text-gray-300">
                          {insights.historical_summary_metrics.count} Projects
                        </Text>
                        <Text className="flex-1 text-right text-xs text-gray-400">—</Text>
                        <Text className="flex-1 text-right text-xs text-gray-400">—</Text>
                        <Text className="flex-1 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                          Mean Var:
                        </Text>
                        <Text className="flex-1 text-right text-xs font-black text-brand-text dark:text-white">
                          {insights.historical_summary_metrics.mean_variance_pct > 0 ? '+' : ''}{insights.historical_summary_metrics.mean_variance_pct}%
                        </Text>
                        <View className="flex-1 items-end">
                          <Text className="text-xs font-black text-brand-orange">
                            |Var|: {insights.historical_summary_metrics.mean_abs_variance_pct}%
                          </Text>
                        </View>
                        <View className="flex-1 items-center">
                          <Text className="text-[10px] font-bold text-gray-400">Summary</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}
        </View>

        {/* What-If Simulator */}
        <View className="bg-white dark:bg-[#1E293B] p-5 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-12">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-white mb-2">Cost Simulator (What-If Analysis)</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-6">Adjust parameters to see how the model&apos;s cost prediction shifts in real time.</Text>

            <View className={isPhone ? "flex-col gap-3.5" : "flex-row flex-wrap items-end gap-4"}>
              <View className={isPhone ? "w-full" : "flex-1 min-w-[200px]"}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Square Footage</Text>
                <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                  value={simSqft}
                  onChangeText={setSimSqft}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-brand-text dark:text-white"
                  keyboardType="numeric"
                />
              </View>
              <View className={isPhone ? "w-full" : "flex-1 min-w-[200px]"}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Quality Tier</Text>
                <View className="flex-row bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
                  {['Standard', 'Premium', 'Luxury'].map(q => (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={q}
                      onPress={() => setSimQuality(q)}
                      className={`flex-1 items-center py-2 rounded-md ${simQuality === q ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-bold ${simQuality === q ? 'text-brand-orange' : 'text-gray-500'}`}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={runSimulator}
                disabled={simulating}
                className={`bg-brand-orange px-8 py-3 rounded-lg justify-center items-center ${isPhone ? 'w-full h-[48px]' : 'h-[46px]'} ${simulating ? 'opacity-50' : ''}`}
              >
                {simulating ? <ActivityIndicator color="#fff" /> : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Simulate</Text>}
              </Pressable>
            </View>

            {simResult !== null && (
              <View className="mt-6 p-4 md:p-6 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40 rounded-xl flex-row items-center justify-between" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 dark:text-gray-300 font-semibold mb-1">Simulated Total Cost</Text>
                  <AutoFitText value={`LKR ${simResult.toLocaleString(undefined, {maximumFractionDigits:0})}`} maxFontSize={30} minFontSize={18} className="font-black text-brand-text dark:text-white" />
                </View>
                <Ionicons name="calculator-outline" size={32} color="#F97316" className="opacity-50" />
              </View>
            )}
        </View>

      </ScrollView>

      {/* CSV Import Modal */}
      <Modal
        visible={showImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportModal(false)}
        statusBarTranslucent
      >
        <View className="flex-1 bg-black/60 justify-center items-center p-3 sm:p-4">
          <View className="bg-white dark:bg-[#1E293B] w-full max-w-2xl rounded-2xl p-5 md:p-6 shadow-2xl max-h-[92%] border border-gray-200 dark:border-gray-700">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center flex-1 pr-2">
                  <Ionicons name="cloud-upload" size={24} color="#F97316" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base sm:text-lg font-bold text-brand-text dark:text-white ml-2" numberOfLines={1}>
                    Import Historical Project BOQs
                  </Text>
                </View>
                <Pressable onPress={() => setShowImportModal(false)} className="p-2 -mr-2">
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </Pressable>
              </View>

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Paste CSV data with completed project BOQs. Validates against the 25 Sri Lankan districts, requires positive actuals, checks chronological dates, and skips duplicates automatically.
              </Text>

              <View className="mb-3">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Source Note / Provenance (QS Firm, Contractor, or BOQ File Reference) <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  value={evidenceNote}
                  onChangeText={setEvidenceNote}
                  placeholder="e.g., Audited Final Account from Maga Engineering / Arch-World QS firm"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-brand-text dark:text-white"
                />
              </View>

              <View className="flex-row gap-2 mb-3">
                <Pressable
                  className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-3 py-1.5 rounded-lg flex-row items-center"
                  onPress={handleLoadTemplate}
                >
                  <Ionicons name="document-text-outline" size={14} color="#F97316" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs ml-1.5">Load Sample BOQ Template</Text>
                </Pressable>

                {importCsvText.length > 0 && (
                  <Pressable
                    className="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg flex-row items-center"
                    onPress={() => setImportCsvText('')}
                  >
                    <Ionicons name="trash-outline" size={14} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold text-xs ml-1.5">Clear</Text>
                  </Pressable>
                )}
              </View>

              <TextInput
                multiline
                numberOfLines={10}
                value={importCsvText}
                onChangeText={setImportCsvText}
                placeholder="project_name,project_type,district,town,floor_area_sqft,floors,structure_type,quality_tier,site_condition,start_date,end_date,estimate_total_lkr,actual_total_lkr,actual_materials_lkr,actual_labour_lkr,actual_equipment_lkr,actual_overhead_lkr,cost_year,notes..."
                placeholderTextColor="#9CA3AF"
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs font-mono text-brand-text dark:text-white flex-1 mb-4 h-48"
                style={{ textAlignVertical: 'top' }}
              />

              <View className="flex-row justify-end gap-3 pt-2">
                <Pressable
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
                  onPress={() => setShowImportModal(false)}
                  disabled={importing}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 dark:text-gray-300 font-semibold text-sm">Cancel</Text>
                </Pressable>

                <Pressable
                  className={`bg-brand-orange px-5 py-2 rounded-lg flex-row items-center ${importing ? 'opacity-50' : ''}`}
                  onPress={handleImportSubmit}
                  disabled={importing}
                >
                  {importing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />}
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm ml-2">
                    {importing ? 'Validating & Importing...' : 'Validate & Import'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
