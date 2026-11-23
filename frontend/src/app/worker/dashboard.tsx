import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader, TableSortControl } from '@/components/common/SortableHeader';
import { DashboardDetailLink } from '@/components/dashboard/DashboardDetailLink';
import { DashboardContent, DashboardHero, DashboardActions, DashboardSectionHeading } from '@/components/dashboard/DashboardLayout';
import { StatusBadge } from '@/components/common/StatusBadge';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform, Linking, useWindowDimensions, Modal, Alert } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { ModalViewport } from '@/components/common/ModalViewport';
import { Button } from '@/components/ui';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '@/components/common/StatCard';
import { AnimatedCard } from '@/components/common/AnimatedCard';
import { RecentAlertsPanel } from '@/components/dashboard/RecentAlertsPanel';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getApiUrl } from '@/lib/apiUrl';
import { WorkerAttendanceChart } from '@/components/worker/WorkerAttendanceChart';
import { timeLabel, dateLabel, monthRange, todayKey } from '@/services/workerData';
import { formatHoursMinutes, formatMinutes, getAttendanceStatus, calculateOvertimeMinutes, sumWorkedMinutes, sumOvertimeMinutes } from '@/utils/format';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function QRModal({ profile, onClose }: { profile: any; onClose: () => void }) {
  const svgRef = useRef<any>(null);

  const downloadQR = () => {
    if (!svgRef.current || !svgRef.current.toDataURL) {
      Alert.alert('Please wait', 'QR Code is still rendering, please try again in a moment.');
      return;
    }

    svgRef.current.toDataURL(async (data: string) => {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${data}`;
        a.download = `worker_qr_${(profile.worker_code || profile.id || 'code').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
        a.click();
      } else {
        try {
          const cleanBase64 = data.replace(/^data:image\/png;base64,/, '').trim();
          const safeName = (profile.worker_code || profile.id || 'code').replace(/[^a-zA-Z0-9_-]/g, '_');
          const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
          const fileUri = `${cacheDir}worker_qr_${safeName}.png`;

          await FileSystem.writeAsStringAsync(fileUri, cleanBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'image/png',
              dialogTitle: 'Download Worker QR Code',
              UTI: 'public.png',
            });
          } else {
            Alert.alert('Sharing not available', 'Unable to share or save files on this device.');
          }
        } catch (e: any) {
          console.error('[Download QR Error]', e);
          Alert.alert('Error', `Failed to save QR code: ${e?.message || 'Unknown error'}`);
        }
      }
    });
  };

  if (!profile) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport><ScrollView accessibilityViewIsModal style={{ flexShrink:1, flexGrow:0, minHeight:0 }} contentContainerStyle={{ padding:20, alignItems:'center' }} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
        <Text accessibilityRole="header" className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">{profile.full_name}</Text>
        <Text className="text-cyan-600 font-semibold mb-6">{profile.worker_code || 'Pending'}</Text>
        <View className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <QRCode value={profile.qr_code || profile.id || 'unknown'} size={180} getRef={(c) => (svgRef.current = c)} />
        </View>
        <Text className="text-slate-500 text-sm text-center mt-6">Show this QR code to your Site Manager when arriving at or leaving the site.</Text>
        <View className="mt-6 gap-3 w-full"><Button label="Download QR" onPress={downloadQR} /><Button label="Close" variant="secondary" onPress={onClose} /></View>
      </ScrollView></ModalViewport>
    </Modal>
  );
}

export default function WorkerDashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { width } = useWindowDimensions();

  const tableSort = useTableSort({"Date":r=>r.date,"Times":r=>r.check_in_time,"Hours":r=>r.hours_worked,"Status":r=>getAttendanceStatus(r)});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [qrVisible, setQrVisible] = useState(false);

  const [profile, setProfile] = useState<any>(null);
  const [siteAssignment, setSiteAssignment] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const range = monthRange(month);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const fetchJson = async (url: string) => {
        if (!token) return null;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          clearTimeout(timer);
          return res.ok ? await res.json() : null;
        } catch {
          return null;
        }
      };

      const [profRes, siteRes, attRes, payrollRes, slipsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, avatar_url, contact_number, qr_code').eq('id', user.id).single(),
        fetchJson(`${getApiUrl()}/labour/worker/site`),
        supabase.from('attendance')
          .select('*')
          .eq('worker_id', user.id)
          .gte('date', range.start)
          .lte('date', range.end)
          .order('date', { ascending: false }),
        fetchJson(`${getApiUrl()}/labour/worker/payroll?month=${month}`),
        supabase.from('salary_slips')
          .select('*')
          .eq('worker_id', user.id)
          .order('period_start', { ascending: false }),
      ]);

      setProfile(profRes.data || null);
      setSiteAssignment(siteRes);
      setAttendance(attRes.data || []);
      if (payrollRes) setPayroll(payrollRes);
      setPayslips(slipsRes.data || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, month]);

  useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`worker-dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `worker_id=eq.${user.id}` }, () => setRefreshTrigger(t => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_slips', filter: `worker_id=eq.${user.id}` }, () => setRefreshTrigger(t => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_workers', filter: `worker_id=eq.${user.id}` }, () => setRefreshTrigger(t => t + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const money = (val: number | null | undefined) =>
    val == null ? '-' : `Rs. ${Number(val).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  const todayStr = todayKey();
  const todayAtt = attendance.find(a => a.date === todayStr);

  let statusBadge = null;
  if (todayAtt) {
    if (todayAtt.status === 'On Leave') {
      statusBadge = <View className="bg-purple-100 px-3 py-1 rounded-full"><Text className="text-purple-700 text-xs font-bold">On leave</Text></View>;
    } else if (todayAtt.check_out_time) {
      statusBadge = <View className="bg-slate-100 px-3 py-1 rounded-full"><Text className="text-slate-600 text-xs font-bold">Checked out {timeLabel(todayAtt.check_out_time)}</Text></View>;
    } else if (todayAtt.check_in_time) {
      statusBadge = <View className="bg-emerald-100 px-3 py-1 rounded-full"><Text className="text-emerald-700 text-xs font-bold">Checked in {timeLabel(todayAtt.check_in_time)}</Text></View>;
    }
  }
  if (!statusBadge) {
    statusBadge = <View className="bg-amber-100 px-3 py-1 rounded-full"><Text className="text-amber-700 text-xs font-bold">Not checked in</Text></View>;
  }

  const daysPresent = new Set(
    attendance
      .filter(a => getAttendanceStatus(a) === 'Present')
      .map(a => a.date)
  ).size;
  const totalWorkedMinutes = sumWorkedMinutes(attendance);
  const totalOvertimeMinutes = sumOvertimeMinutes(attendance);
  const hoursWorked = totalWorkedMinutes / 60;

  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const currentDay = month === todayStr.slice(0,7) ? new Date().getDate() : daysInMonth;

  const chartData = useMemo(() => {
    const days = monthRange(month);
    const endDay = parseInt(days.end.split('-')[2]);
    const data = [];
    for(let i=1; i<=endDay; i++) {
      const d = `${month}-${i.toString().padStart(2, '0')}`;
      const dayRecords = attendance.filter(a => a.date === d);
      const workedMins = sumWorkedMinutes(dayRecords);
      const otMins = sumOvertimeMinutes(dayRecords);
      const regMins = Math.max(0, workedMins - otMins);
      data.push({
        label: i.toString(),
        regular: Math.round((regMins / 60) * 100) / 100,
        overtime: Math.round((otMins / 60) * 100) / 100
      });
    }
    return data;
  }, [attendance, month]);

  const changeMonth = (offset: number) => {
    let [y, m] = month.split('-').map(Number);
    m += offset;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  const latestPayslip = payslips.length > 0 ? payslips[0] : null;

  return (
    <View className="flex-1 bg-brand-light dark:bg-slate-950">
      <TopNav
        title="My Dashboard"
        showAction={true}
        actionLabel="Show my QR"
        onActionPress={() => setQrVisible(true)}
      />
      <View className="px-4 pt-3"><TableSortControl sort={tableSort}/></View>
      {qrVisible && <QRModal profile={profile} onClose={() => setQrVisible(false)} />}

      <DashboardContent>
          <DashboardHero eyebrow="Worker workspace" title="Work summary" description="Your assigned site, attendance and recent salary records." icon="briefcase-outline" />
          {loading && attendance.length === 0 ? (
            <ActivityIndicator color="#F97316" size="large" className="mt-8" />
          ) : error ? (
            <View className="bg-red-50 p-6 rounded-xl border border-red-100 items-center">
              <Text className="text-red-600 mb-4">{error}</Text>
              <Pressable onPress={loadData} className="bg-red-600 px-6 py-2 rounded-lg">
                <Text className="text-white font-bold">Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
                <AnimatedCard delay={150} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <StatCard onPress={() => router.push('/worker/attendance')}  label="Days Present" value={daysPresent.toString()} indicatorText="Recorded this month" indicatorType="success" colorScheme="emerald" fullWidth />
                </AnimatedCard>
                <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <StatCard onPress={() => router.push('/worker/attendance')}  label="Hours Worked" value={formatMinutes(totalWorkedMinutes)} indicatorText="This month" indicatorType="neutral" colorScheme="blue" fullWidth />
                </AnimatedCard>
                <AnimatedCard delay={250} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <StatCard onPress={() => router.push('/worker/attendance')}  label="Overtime Hours" value={formatMinutes(totalOvertimeMinutes)} indicatorText="This month" indicatorType="warning" colorScheme="amber" fullWidth />
                </AnimatedCard>
                <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <StatCard onPress={() => router.push('/worker/payroll')}  label={payroll?.summary_kind === 'recorded_slips' ? "Recorded pay" : "Estimated earnings"} value={payroll ? money(payroll.total_pay) : '-'} indicatorText={payroll?.summary_kind === 'recorded_slips' ? "From recorded payslips" : "Attendance estimate"} indicatorType="neutral" colorScheme="purple" fullWidth />
                </AnimatedCard>
              </View>

              <DashboardActions actions={[
                { label:'My attendance', description:'Review your check-ins and hours', icon:'calendar-outline', onPress:()=>router.push('/worker/attendance') },
                { label:'My payslips', description:'View your recorded salary details', icon:'wallet-outline', onPress:()=>router.push('/worker/payroll') },
                { label:'Messages', description:'Stay connected with your team', icon:'chatbubbles-outline', onPress:()=>router.push('/worker/messages') },
              ]} />
              <View className={`mb-6 gap-6 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                <View className={isMobile ? "w-full" : "flex-[2] min-w-0"}>
                  <DashboardDetailLink href="/worker/attendance" label="hours and attendance" interactive><AnimatedCard delay={350} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 min-h-[400px] h-full">
                  <View className="flex-row flex-wrap justify-between items-start md:items-center gap-4 mb-6">
                    <View className="flex-1 min-w-[200px]">
                      <Text className="text-lg font-bold text-brand-text dark:text-slate-100 mb-1">My Hours This Month</Text>
                      <Text className="text-xs text-slate-500">Regular hours and overtime per day</Text>
                    </View>
                    <View className="flex-row items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
                      <Pressable onPress={() => changeMonth(-1)} className="p-2"><Ionicons name="chevron-back" size={16} color="#64748b" /></Pressable>
                      <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4">{new Date(month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</Text>
                      <Pressable onPress={() => changeMonth(1)} className="p-2"><Ionicons name="chevron-forward" size={16} color="#64748b" /></Pressable>
                    </View>
                  </View>

                  {attendance.length === 0 ? (
                    <View className="flex-1 justify-center items-center">
                      <Ionicons name="bar-chart-outline" size={48} color="#cbd5e1" />
                      <Text className="text-slate-400 font-medium mt-3">No attendance recorded this month</Text>
                    </View>
                  ) : (
                    <WorkerAttendanceChart chartData={chartData} />
                  )}
                  {attendance.length > 0 && (
                    <View className="flex-row justify-center items-center gap-6 mt-6">
                      <View className="flex-row items-center gap-2"><View className="w-3 h-3 rounded-sm bg-slate-900" /><Text className="text-xs text-slate-600 font-medium">Regular Hours</Text></View>
                      <View className="flex-row items-center gap-2"><View className="w-3 h-3 rounded-sm bg-brand-orange" /><Text className="text-xs text-slate-600 font-medium">Overtime</Text></View>
                    </View>
                  )}
                </AnimatedCard></DashboardDetailLink>
                </View>

                <View className={isMobile ? "w-full" : "flex-[1] min-w-0"}>
                  <DashboardDetailLink href="/worker/payroll" label="monthly pay summary" interactive><AnimatedCard delay={400} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 min-h-[400px] h-full">
                  <DashboardSectionHeading title="My month at a glance" description="Attendance, hours and your current pay period." icon="calendar-outline" />

                  <View className="flex-1">
                    <Pressable accessibilityRole="link" accessibilityLabel="Open attendance summary details" onPress={() => router.push('/worker/attendance')}  className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm">Attendance</Text>
                        <Text className="font-bold text-brand-success">{Math.round((daysPresent/Math.max(1, currentDay))*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-brand-success" style={{ width: `${Math.min((daysPresent/Math.max(1, currentDay))*100, 100)}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{daysPresent} recorded days this month</Text>
                    </Pressable>

                    <Pressable accessibilityRole="link" accessibilityLabel="Open hours summary details" onPress={() => router.push('/worker/attendance')}  className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <SortableHeader sort={tableSort} column="Hours" className="text-slate-700 dark:text-slate-200 font-semibold text-sm">Hours</SortableHeader>
                        <Text className="font-bold text-brand-text dark:text-slate-100">{Math.round((hoursWorked/(Math.max(1, currentDay)*8))*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min((hoursWorked/(Math.max(1, currentDay)*8))*100, 100)}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{formatMinutes(totalWorkedMinutes)} worked vs {currentDay*8}h 0m expected</Text>
                    </Pressable>

                    <Pressable accessibilityRole="link" accessibilityLabel="Open pay period details" onPress={() => router.push('/worker/payroll')}  className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm">Pay Period Progress</Text>
                        <Text className="font-bold text-cyan-600">{Math.round((currentDay/daysInMonth)*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-cyan-500" style={{ width: `${(currentDay/daysInMonth)*100}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{currentDay} days elapsed of {daysInMonth}</Text>
                    </Pressable>
                  </View>

                  <View className="mt-4 pt-4 border-t border-slate-100">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Latest Payslip</Text>
                    {latestPayslip ? (
                      <View className="flex-row justify-between items-center">
                        <View>
                          <Text className="font-bold text-slate-800 dark:text-slate-100">{dateLabel(latestPayslip.period_start)} - {dateLabel(latestPayslip.period_end)}</Text>
                          <Text className="text-brand-success font-bold text-sm mt-1">{money(latestPayslip.total_amount ?? latestPayslip.total_pay)}</Text>
                        </View>
                        <Pressable onPress={() => router.push('/worker/payroll')} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 px-3 py-2 rounded-lg">
                          <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">View</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text className="text-slate-500 text-sm">No salary slips generated yet.</Text>
                    )}
                  </View>
                  </AnimatedCard></DashboardDetailLink>
                </View>
              </View>

              <View className={`pb-6 gap-6 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                <View className={isMobile ? "w-full" : "flex-[2] min-w-0"}>
                  <AnimatedCard delay={450} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 min-h-[300px] h-full">
                  <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-lg font-bold text-brand-text dark:text-slate-100">Recent Check-Ins</Text>
                    <Pressable onPress={() => router.push('/worker/attendance')}>
                      <Text className="text-brand-orange font-bold text-sm">View all →</Text>
                    </Pressable>
                  </View>
                  {attendance.length === 0 ? (
                    <View className="flex-1 justify-center items-center py-8">
                      <Text className="text-slate-400">No recent check-ins.</Text>
                    </View>
                  ) : width >= 768 ? (
                    <View>
                      <View className="flex-row border-b border-slate-100 pb-3 mb-3">
                        <SortableHeader sort={tableSort} column="Date" className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider">Date</SortableHeader>
                        <SortableHeader sort={tableSort} column="Times" className="flex-[1.5] font-semibold text-slate-500 text-xs uppercase tracking-wider">Times</SortableHeader>
                        <SortableHeader sort={tableSort} column="Hours" className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Hours</SortableHeader>
                        <SortableHeader sort={tableSort} column="Status" className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Status</SortableHeader>
                      </View>
                      {tableSort.sort(attendance).slice(0, 7).map(a => {
                        const status = getAttendanceStatus(a);
                        const otMins = calculateOvertimeMinutes(a.overtime_hours, a.hours_worked, a.check_in_time, a.check_out_time);
                        const hoursLabel = a.check_in_time && !a.check_out_time && a.hours_worked == null
                          ? 'In progress'
                          : formatHoursMinutes(a.hours_worked, a.check_in_time, a.check_out_time);
                        return (
                        <View key={a.id} className="flex-row items-center border-b border-slate-50 py-3 last:border-0">
                          <Text className="flex-1 font-bold text-slate-700 dark:text-slate-200">{dateLabel(a.date)}</Text>
                          <Text className="flex-[1.5] text-slate-500">{timeLabel(a.check_in_time)} - {timeLabel(a.check_out_time)}</Text>
                          <View className="flex-1 items-end">
                            <Text className="font-medium text-slate-700 dark:text-slate-200">{hoursLabel}</Text>
                            {otMins > 0 && <Text className="text-xs text-brand-orange font-bold">+{formatMinutes(otMins)} OT</Text>}
                          </View>
                          <View className="flex-1 items-end">
                            <View className="shrink-0"><StatusBadge status={status}/></View>
                          </View>
                        </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View className="gap-3">
                      {tableSort.sort(attendance).slice(0, 5).map(a => {
                        const status = getAttendanceStatus(a);
                        const otMins = calculateOvertimeMinutes(a.overtime_hours, a.hours_worked, a.check_in_time, a.check_out_time);
                        const hoursLabel = a.check_in_time && !a.check_out_time && a.hours_worked == null
                          ? 'In progress'
                          : formatHoursMinutes(a.hours_worked, a.check_in_time, a.check_out_time);
                        return (
                        <View key={a.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                          <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-slate-800 dark:text-slate-100">{dateLabel(a.date)}</Text>
                            <View className="shrink-0"><StatusBadge status={status}/></View>
                          </View>
                          <Text className="text-sm text-slate-600 mb-2">{timeLabel(a.check_in_time)} to {timeLabel(a.check_out_time)}</Text>
                          <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">Hours: {hoursLabel} {otMins > 0 && <Text className="text-brand-orange">(+{formatMinutes(otMins)} OT)</Text>}</Text>
                        </View>
                        );
                      })}
                    </View>
                  )}
                  </AnimatedCard>
                </View>

                <View className={`flex-col ${isMobile ? 'w-full' : 'flex-[1] w-full'}`} style={{ gap: 24 }}>

                  <DashboardDetailLink href="/worker/notifications" label="notifications" interactive><AnimatedCard delay={500} className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[300px] w-full">
                    <RecentAlertsPanel basePath="/worker" />
                  </AnimatedCard></DashboardDetailLink>

                  {siteAssignment && (
                    <DashboardDetailLink href="/worker/site" label="assigned site" interactive><AnimatedCard delay={550} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6">
                      <Text className="text-lg font-bold text-brand-text dark:text-slate-100 mb-4">My Site</Text>
                      <Text className="font-bold text-slate-800 dark:text-slate-100 text-base">{siteAssignment.project.name}</Text>
                      <Text className="text-slate-500 text-sm mt-1 mb-4">{siteAssignment.site.address || 'Address not recorded'}</Text>

                      {siteAssignment.site.address && (
                        <Pressable
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 rounded-lg py-2 items-center mb-4"
                          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteAssignment.site.address)}`)}
                        >
                          <Text className="font-bold text-slate-700 dark:text-slate-200 text-sm">Open in Maps</Text>
                        </Pressable>
                      )}

                      {siteAssignment.manager && (
                        <View className="pt-4 border-t border-slate-100 mt-2">
                          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Site Manager</Text>
                          <Text className="font-semibold text-slate-700 dark:text-slate-200 mb-3">{siteAssignment.manager.full_name}</Text>
                          {siteAssignment.manager.contact_number && (
                            <View className="flex-row gap-2">
                              <Pressable
                                className="flex-1 bg-brand-orange py-2 rounded-lg items-center"
                                onPress={() => Linking.openURL(`tel:${siteAssignment.manager.contact_number.replace(/[^+0-9]/g, "").replace(/^0/, "+94")}`)}
                              >
                                <Text className="text-white font-bold text-sm">Call</Text>
                              </Pressable>
                              <Pressable
                                className="flex-1 bg-green-500 py-2 rounded-lg items-center"
                                onPress={() => Linking.openURL(`https://wa.me/${siteAssignment.manager.contact_number.replace(/[^+0-9]/g, "").replace(/^0/, "+94").replace("+", "")}`)}
                              >
                                <Text className="text-white font-bold text-sm">WhatsApp</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      )}
                    </AnimatedCard></DashboardDetailLink>
                  )}

                </View>
              </View>
            </>
          )}

      </DashboardContent>
    </View>
  );
}
