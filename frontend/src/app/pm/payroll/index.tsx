import { DateField } from '@/components/common/DateField';
import { payrollToday, payrollMonthStart } from '@/utils/payrollDate';
import { SalaryPaymentAction } from '@/components/labour/SalaryPaymentAction';
import { PayrollGenerationNotice, payrollFailure } from '@/components/labour/PayrollGenerationNotice';
import { AttendancePeriodReview } from '@/components/labour/AttendancePeriodReview';
import { PayrollDeductions, PayrollDeduction, deductionPayload } from '@/components/labour/PayrollDeductions';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Modal, Alert } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { SearchInput } from '@/components/common/SearchInput';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { ModalViewport } from '@/components/common/ModalViewport';
import { managedPayroll, managedProjects } from '@/services/pmData';
import { formatMoney, formatCurrencyExact } from '@/utils/format';
import { AutoFitText } from '@/components/common/AutoFitText';
import { useResponsive } from '@/hooks/useResponsive';
import { getApiUrl } from '@/lib/apiUrl';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function PMPayrollPage() {
  const { isMobile } = useResponsive();
  const params = useLocalSearchParams<{project?:string}>();
  const requestedProject = String(params.project || "");
  const [slips, setSlips] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<any>(null);

  // Batch generation modal state
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deductions,setDeductions]=useState<PayrollDeduction[]>([]);
  const [generationFailure, setGenerationFailure] = useState<ReturnType<typeof payrollFailure> | null>(null);
  const [genProjectId, setGenProjectId] = useState(requestedProject);
  const [genStartDate, setGenStartDate] = useState(
    payrollMonthStart()
  );
  const [genEndDate, setGenEndDate] = useState(
    payrollToday()
  );

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const projectData = await managedProjects();
      const payrollData = await managedPayroll(projectData);
      setSlips(payrollData);
      setProjects(projectData);
      setGenProjectId(current => projectData.some(project=>project.id===current) ? current : projectData.find(project=>project.id===requestedProject)?.id || projectData[0]?.id || '');
    }
    catch (e: any) { setError(e.message || 'Unable to load payroll.'); }
    finally { setLoading(false); }
  }, [requestedProject]);
  useEffect(() => { setGenerationFailure(null); }, [genProjectId, genStartDate, genEndDate]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleGenerate = async () => {
    if (generating) return;
    if (!genProjectId || !genStartDate || !genEndDate) {
      Alert.alert('Required', 'Please select a project and specify the date range.');
      return;
    }

    setGenerating(true);
    setGenerationFailure(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated. Please sign in again.');

      const response = await fetch(`${getApiUrl()}/labour/salary/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          site_id: genProjectId,
          start_date: genStartDate,
          end_date: genEndDate,
          deductions: deductionPayload(deductions)
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        setGenerationFailure(payrollFailure(resData.detail));
        return;
      }

      setGenerateModalVisible(false);
      Alert.alert(
        'Payroll Batch Complete',
        resData.generated > 0
          ? `Generated ${resData.generated} salary slips successfully!`
          : 'Attendance checked. No pending slips needed for this period.'
      );
      load();
    } catch (err: any) {
      setGenerationFailure(payrollFailure(err.message));
    } finally {
      setGenerating(false);
    }
  };

  const amount = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? 'Not recorded' : formatCurrencyExact(Number(value));
  const pending = slips.filter(s => ['draft', 'approved', 'pending', 'generated'].includes(String(s.status).toLowerCase()));
  const pendingTotal = pending.reduce((sum, s) => sum + (Number.isFinite(Number(s.total_amount ?? s.total_pay)) ? Number(s.total_amount ?? s.total_pay) : 0), 0);
  const visible = slips.filter(s => (filter === 'All' || (filter === 'Unpaid' ? ['draft', 'approved', 'pending', 'generated'].includes(String(s.status).toLowerCase()) : String(s.status).toLowerCase() === filter.toLowerCase())) && `${s.worker?.full_name || ''} ${s.project?.name || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Project Payroll" actionLabel="Refresh" onActionPress={load} />
      <ScrollView className="flex-1 p-4 md:p-6" keyboardShouldPersistTaps="handled">
        {/* Header Action Banner */}
        <View className="bg-green-700 rounded-2xl p-4 md:p-6 shadow-sm mb-6 flex-col lg:flex-row gap-4 justify-between items-start overflow-hidden relative">
          <View className="z-10 flex-shrink min-w-0 w-full lg:w-auto">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-200 text-xs font-bold uppercase tracking-wider mb-1">
              Estimated Pending Liabilities
            </Text>
            <AutoFitText
              value={formatMoney(pendingTotal)}
              maxFontSize={32}
              minFontSize={20}
              className="font-extrabold text-white"
              containerStyle={{ marginBottom: 4 }}
            />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-100 text-xs">
              {pending.length} pending / generated slip{pending.length === 1 ? '' : 's'} across your projects
            </Text>
          </View>

          <Pressable
            style={{ minHeight: 44, minWidth: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Run Payroll Batch"
            onPress={() => setGenerateModalVisible(true)}
            className="bg-white max-w-full px-4 py-3 rounded-xl shadow flex-row items-center z-10 hover:bg-gray-50 active:bg-gray-100"
          >
            <Ionicons name="play-circle" size={22} color="#15803D" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-700 font-bold text-base ml-2">
              Run Payroll Batch
            </Text>
          </Pressable>
        </View>

        {/* Search & Filter Header */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 20, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-1">Salary Slips</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Generated payroll records for projects you manage.</Text>
          </View>
          <SearchInput
            placeholder="Search worker or project..."
            value={search}
            onChangeText={setSearch}
            items={slips}
            entityLabel="payroll"
            className={isMobile ? "w-full" : "w-80"}
            getLocalResults={(query) => slips.filter(s => `${s.worker?.full_name || ''} ${s.project?.name || ''}`.toLowerCase().includes(query.toLowerCase())).map(s => ({ id: s.id, title: s.worker?.full_name || 'Worker', subtitle: s.project?.name || '' }))}
          />
        </View>

        <View className="flex-row flex-wrap gap-2 mb-4">
          {['All', 'Unpaid', 'Paid'].map(status => (
            <Pressable
              style={{ minHeight: 40, minWidth: 44 }}
              key={status}
              onPress={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg border ${filter === status ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-200'}`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={filter === status ? 'text-white font-bold text-sm' : 'text-gray-700 text-sm'}>
                {status}
              </Text>
            </Pressable>
          ))}
        </View>

        {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 mb-4">{error}</Text>}

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator color="#F97316" size="large" />
          </View>
        ) : visible.length === 0 ? (
          <View className="py-16 items-center justify-center bg-white rounded-2xl border border-gray-100">
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-base font-medium mt-3">
              No salary slips match these filters.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {visible.map(s => {
              const total = s.total_amount ?? s.total_pay ?? 0;
              return (
                <View key={s.id} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg text-gray-900">
                        {s.worker?.full_name || 'Worker'}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-0.5">
                        {s.project?.name || 'Assigned Project'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-orange text-lg">
                        {amount(total)}
                      </Text>
                      <View className="bg-gray-100 px-2 py-0.5 rounded mt-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-600">
                          {s.status || 'Generated'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">
                      📅 {s.period_start} to {s.period_end}
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-blue-600 font-medium">
                      ⏱ {s.total_days ?? 0} Days worked
                    </Text>
                    {Number(s.overtime_hours ?? s.total_overtime_hours ?? 0) > 0 && (
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-indigo-600 font-medium">
                        ⚡ {Number(s.overtime_hours ?? s.total_overtime_hours).toFixed(1)}h OT
                      </Text>
                    )}
                  </View>

                  <Pressable
                    style={{ minHeight: 44, minWidth: 44 }}
                    accessibilityLabel={`View salary slip ${s.id}`}
                    onPress={() => setSelected(s)}
                    className="bg-gray-50 border border-gray-200 p-3 rounded-lg mt-4 items-center hover:bg-gray-100 active:bg-gray-200"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-700 text-sm">
                      View Slip Details
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Slip Detail Modal */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-lg">
            <View className="flex-row justify-between items-center mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-900">
                Salary Slip Details
              </Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setSelected(null)} className="p-1 items-center justify-center">
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <View className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-800">
                {selected?.worker?.full_name || 'Worker'}
              </Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 mt-1">
                {selected?.project?.name || 'Project'}
              </Text>
            </View>

            <View className="gap-2.5">
              <View className="flex-row justify-between py-1 border-b border-gray-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Period</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{selected?.period_start} to {selected?.period_end}</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-gray-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Daily Rate</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{amount(selected?.daily_rate || 3500)} / day</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-gray-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Days Worked</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{selected?.total_days ?? 0} days</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-gray-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Base Pay</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{amount(selected?.basic_pay ?? ((selected?.total_days || 0) * (selected?.daily_rate || 3500)))}</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-gray-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Overtime</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{Number(selected?.overtime_hours ?? selected?.total_overtime_hours ?? 0).toFixed(2)} hrs ({amount(selected?.overtime_pay ?? 0)})</Text>
              </View>
              <View className="py-2"><Text className="text-gray-600">Deductions: {amount(selected?.deductions??0)}</Text>{(selected?.deduction_details||[]).map((row:any,index:number)=><Text key={index} className="text-sm text-gray-500 mt-1">{row.reason}: {amount(row.amount)}</Text>)}</View>
              <View className="flex-row justify-between py-2 mt-2 bg-orange-50 px-3 rounded-lg border border-orange-100">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-base">Total Pay</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-extrabold text-lg">{amount(selected?.total_amount ?? selected?.total_pay)}</Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Status</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-gray-800 text-sm">{selected?.status || 'Generated'}</Text>
              </View>
            </View>

            {selected && <SalaryPaymentAction slip={selected} onPaid={() => { setSelected(null); void load(); }} />}

            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => setSelected(null)}
              className="bg-brand-orange rounded-xl p-3.5 mt-6 items-center"
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center font-bold text-base">
                Close
              </Text>
            </Pressable>
          </ScrollView>
        </ModalViewport>
      </Modal>

      {/* Batch Generation Modal */}
      <Modal visible={generateModalVisible} transparent animationType="fade" onRequestClose={() => setGenerateModalVisible(false)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-lg">
            <View className="flex-row justify-between items-center mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-900">
                Run Payroll Batch
              </Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setGenerateModalVisible(false)} className="p-1 items-center justify-center">
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mb-4">
              Automatically calculate days, overtime, and generate official salary slips for workers on your site.
            </Text>

            <View className="mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold mb-2 text-sm">Select Project</Text>
              {projects.length === 0 ? (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">No managed projects found.</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {projects.map(p => (
                    <Pressable
                      style={{ minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1, justifyContent: 'center' }}
                      key={p.id}
                      onPress={() => setGenProjectId(p.id)}
                      className={`px-3 py-2 rounded-lg border ${genProjectId === p.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${genProjectId === p.id ? 'text-white' : 'text-gray-700'}`}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24 }}>
              <View style={{ flex: isMobile ? undefined : 1, minWidth: 0 }}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold mb-1 text-sm">Start Date</Text>
                <DateField label="Start Date" value={genStartDate} onChange={setGenStartDate} />
              </View>
              <View style={{ flex: isMobile ? undefined : 1, minWidth: 0 }}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold mb-1 text-sm">End Date</Text>
                <DateField label="End Date" value={genEndDate} onChange={setGenEndDate} />
              </View>
            </View>

            <AttendancePeriodReview projectId={genProjectId} start={genStartDate} end={genEndDate} />
            <PayrollDeductions projectId={genProjectId} start={genStartDate} end={genEndDate} value={deductions} onChange={setDeductions}/>
            {generationFailure && <PayrollGenerationNotice {...generationFailure} onView={row => { setGenerateModalVisible(false); setFilter('All'); setSearch(''); if (row) setSelected(slips.find(slip => slip.id === row.id) || null); void load(); }} />}
            <View style={{ flexDirection: isMobile ? 'column-reverse' : 'row', gap: 12 }}>
              <Pressable
                style={{ minHeight: 48, minWidth: 0, flex: isMobile ? undefined : 1 }}
                onPress={() => setGenerateModalVisible(false)}
                className="bg-gray-100 rounded-xl p-3.5 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel payroll batch"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-sm">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={{ minHeight: 48, minWidth: 0, flex: isMobile ? undefined : 1 }}
                disabled={generating}
                accessibilityRole="button"
                accessibilityLabel="Generate Slips"
                onPress={handleGenerate}
                className="bg-brand-orange rounded-xl p-3.5 items-center justify-center flex-row"
              >
                {generating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">
                    Generate Slips
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </ModalViewport>
      </Modal>
    </View>
  );
}
