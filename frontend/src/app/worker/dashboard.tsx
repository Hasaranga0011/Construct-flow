import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform, Linking, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '@/components/common/StatCard';
import { AnimatedCard } from '@/components/common/AnimatedCard';
import { RecentAlertsPanel } from '@/components/dashboard/RecentAlertsPanel';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getApiUrl } from '@/lib/apiUrl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { timeLabel, dateLabel, monthRange, todayKey } from '@/services/workerData';
import QRCode from 'react-native-qrcode-svg';

function QRModal({ profile, onClose }: { profile: any; onClose: () => void }) {
  if (!profile) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <View className="bg-white rounded-3xl p-8 items-center w-full max-w-sm shadow-2xl">
        <Text className="text-2xl font-bold text-slate-900 mb-2">{profile.full_name}</Text>
        <Text className="text-cyan-600 font-semibold mb-6">{profile.worker_code || 'Pending'}</Text>
        <View className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <QRCode value={profile.qr_code || profile.id || 'unknown'} size={200} />
        </View>
        <Text className="text-slate-500 text-sm text-center mt-6">Show this QR code to your Site Manager when arriving at or leaving the site.</Text>
        <Pressable onPress={onClose} className="mt-8 bg-slate-100 px-8 py-3 rounded-xl w-full items-center">
          <Text className="font-bold text-slate-700">Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function WorkerDashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { width } = useWindowDimensions();

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

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      
      let siteRes = null;
      if (token) {
        try {
          const res = await fetch(`${getApiUrl()}/labour/worker/site`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) siteRes = await res.json();
        } catch (e) {}
      }
      setSiteAssignment(siteRes);

      const { data: att } = await supabase.from('attendance')
        .select('*')
        .eq('worker_id', user.id)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: false });
      setAttendance(att || []);

      if (token) {
        try {
          const res = await fetch(`${getApiUrl()}/labour/worker/payroll?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) setPayroll(await res.json());
        } catch (e) {}
      }

      const { data: slips } = await supabase.from('salary_slips')
        .select('*')
        .eq('worker_id', user.id)
        .order('period_start', { ascending: false });
      setPayslips(slips || []);

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

  const daysPresent = attendance.filter(a => a.status === 'Present').length;
  const hoursWorked = attendance.reduce((acc, a) => acc + (a.hours_worked || 0), 0);
  const overtimeHours = attendance.reduce((acc, a) => acc + (a.overtime_hours || 0), 0);
  
  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const currentDay = month === todayStr.slice(0,7) ? new Date().getDate() : daysInMonth;

  const chartData = useMemo(() => {
    const days = monthRange(month);
    const endDay = parseInt(days.end.split('-')[2]);
    const data = [];
    for(let i=1; i<=endDay; i++) {
      const d = `${month}-${i.toString().padStart(2, '0')}`;
      const att = attendance.find(a => a.date === d);
      const hw = att?.hours_worked || 0;
      const ot = att?.overtime_hours || 0;
      data.push({
        label: i.toString(),
        regular: Math.max(0, hw - ot),
        overtime: ot
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
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="My Dashboard" 
        showAction={true}
        actionLabel="Show my QR"
        onActionPress={() => setQrVisible(true)}
      />
      {qrVisible && <QRModal profile={profile} onClose={() => setQrVisible(false)} />}
      
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Worker Dashboard</Text>
          </View>

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
              <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -8 }}>
                <AnimatedCard delay={150} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <Pressable onPress={() => router.push('/worker/attendance')} className="flex-1">
                    <StatCard label="Days Present" value={daysPresent.toString()} indicatorText={`of ${currentDay} working days`} indicatorType="success" fullWidth />
                  </Pressable>
                </AnimatedCard>
                <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <Pressable onPress={() => router.push('/worker/attendance')} className="flex-1">
                    <StatCard label="Hours Worked" value={hoursWorked.toFixed(1)} indicatorText="This month" indicatorType="neutral" fullWidth />
                  </Pressable>
                </AnimatedCard>
                <AnimatedCard delay={250} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <Pressable onPress={() => router.push('/worker/attendance')} className="flex-1">
                    <StatCard label="Overtime Hours" value={overtimeHours.toFixed(1)} indicatorText="This month" indicatorType="warning" fullWidth />
                  </Pressable>
                </AnimatedCard>
                <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
                  <Pressable onPress={() => router.push('/worker/payroll')} className="flex-1">
                    <StatCard label="Estimated Earnings" value={payroll ? money(payroll.total_pay) : '-'} indicatorText="Estimated" indicatorType="neutral" fullWidth />
                  </Pressable>
                </AnimatedCard>
              </View>

              <View className={`mb-6 gap-6 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                <View className={isMobile ? "w-full" : "flex-[2] w-full"}>
                  <AnimatedCard delay={350} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 min-h-[400px] h-full">
                  <View className="flex-row flex-wrap justify-between items-start md:items-center gap-4 mb-6">
                    <View className="flex-1 min-w-[200px]">
                      <Text className="text-lg font-bold text-brand-text mb-1">My Hours This Month</Text>
                      <Text className="text-xs text-slate-500">Regular hours and overtime per day</Text>
                    </View>
                    <View className="flex-row items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
                      <Pressable onPress={() => changeMonth(-1)} className="p-2"><Ionicons name="chevron-back" size={16} color="#64748b" /></Pressable>
                      <Text className="text-sm font-semibold text-slate-700 px-4">{new Date(month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</Text>
                      <Pressable onPress={() => changeMonth(1)} className="p-2"><Ionicons name="chevron-forward" size={16} color="#64748b" /></Pressable>
                    </View>
                  </View>

                  {attendance.length === 0 ? (
                    <View className="flex-1 justify-center items-center">
                      <Ionicons name="bar-chart-outline" size={48} color="#cbd5e1" />
                      <Text className="text-slate-400 font-medium mt-3">No attendance recorded this month</Text>
                    </View>
                  ) : (
                    <View className="flex-1 mt-4">
                      {Platform.OS === 'web' ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="regular" stackId="a" fill="#1e293b" radius={[0, 0, 4, 4]} name="Regular Hours" />
                            <Bar dataKey="overtime" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} name="Overtime" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <View className="flex-1 justify-center items-center bg-slate-50 rounded-lg border border-slate-100">
                          <Text className="text-slate-400">Chart rendering limited to web interface</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {Platform.OS === 'web' && attendance.length > 0 && (
                    <View className="flex-row justify-center items-center gap-6 mt-6">
                      <View className="flex-row items-center gap-2"><View className="w-3 h-3 rounded-sm bg-slate-900" /><Text className="text-xs text-slate-600 font-medium">Regular Hours</Text></View>
                      <View className="flex-row items-center gap-2"><View className="w-3 h-3 rounded-sm bg-brand-orange" /><Text className="text-xs text-slate-600 font-medium">Overtime</Text></View>
                    </View>
                  )}
                </AnimatedCard>
                </View>

                <View className={isMobile ? "w-full" : "flex-[1] w-full"}>
                  <AnimatedCard delay={400} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 min-h-[400px] h-full">
                  <View className="mb-6">
                    <Text className="text-lg font-bold text-brand-text">My Month at a Glance</Text>
                  </View>
                  
                  <View className="flex-1">
                    <View className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-slate-700 font-semibold text-sm">Attendance</Text>
                        <Text className="font-bold text-brand-success">{Math.round((daysPresent/Math.max(1, currentDay))*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-brand-success" style={{ width: `${Math.min((daysPresent/Math.max(1, currentDay))*100, 100)}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{daysPresent} days present vs {currentDay} working days</Text>
                    </View>

                    <View className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-slate-700 font-semibold text-sm">Hours</Text>
                        <Text className="font-bold text-brand-text">{Math.round((hoursWorked/(Math.max(1, currentDay)*8))*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min((hoursWorked/(Math.max(1, currentDay)*8))*100, 100)}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{hoursWorked.toFixed(1)} worked vs {currentDay*8} expected</Text>
                    </View>

                    <View className="mb-6">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-slate-700 font-semibold text-sm">Pay Period Progress</Text>
                        <Text className="font-bold text-cyan-600">{Math.round((currentDay/daysInMonth)*100)}%</Text>
                      </View>
                      <View className="h-2 bg-slate-100 rounded-full mb-1">
                        <View className="h-full rounded-full bg-cyan-500" style={{ width: `${(currentDay/daysInMonth)*100}%` }} />
                      </View>
                      <Text className="text-slate-500 text-xs">{currentDay} days elapsed of {daysInMonth}</Text>
                    </View>
                  </View>

                  <View className="mt-4 pt-4 border-t border-slate-100">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Latest Payslip</Text>
                    {latestPayslip ? (
                      <View className="flex-row justify-between items-center">
                        <View>
                          <Text className="font-bold text-slate-800">{dateLabel(latestPayslip.period_start)} - {dateLabel(latestPayslip.period_end)}</Text>
                          <Text className="text-brand-success font-bold text-sm mt-1">{money(latestPayslip.total_amount ?? latestPayslip.total_pay)}</Text>
                        </View>
                        <Pressable onPress={() => router.push('/worker/payroll')} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
                          <Text className="text-xs font-bold text-slate-700">View</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text className="text-slate-500 text-sm">No salary slips generated yet.</Text>
                    )}
                  </View>
                  </AnimatedCard>
                </View>
              </View>

              <View className={`pb-6 gap-6 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                <View className={isMobile ? "w-full" : "flex-[2] w-full"}>
                  <AnimatedCard delay={450} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 min-h-[300px] h-full">
                  <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-lg font-bold text-brand-text">Recent Check-Ins</Text>
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
                        <Text className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider">Date</Text>
                        <Text className="flex-[1.5] font-semibold text-slate-500 text-xs uppercase tracking-wider">Times</Text>
                        <Text className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Hours</Text>
                        <Text className="flex-1 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Status</Text>
                      </View>
                      {attendance.slice(0, 7).map(a => (
                        <View key={a.id} className="flex-row items-center border-b border-slate-50 py-3 last:border-0">
                          <Text className="flex-1 font-bold text-slate-700">{dateLabel(a.date)}</Text>
                          <Text className="flex-[1.5] text-slate-500">{timeLabel(a.check_in_time)} - {timeLabel(a.check_out_time)}</Text>
                          <View className="flex-1 items-end">
                            <Text className="font-medium text-slate-700">{a.hours_worked || 0}h</Text>
                            {a.overtime_hours > 0 && <Text className="text-xs text-brand-orange font-bold">+{a.overtime_hours}h OT</Text>}
                          </View>
                          <View className="flex-1 items-end">
                            <View className={`px-2 py-1 rounded-md ${a.status === 'Present' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200'} border`}>
                              <Text className={`text-xs font-bold ${a.status === 'Present' ? 'text-emerald-700' : 'text-slate-600'}`}>{a.status}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View className="gap-3">
                      {attendance.slice(0, 5).map(a => (
                        <View key={a.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                          <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-slate-800">{dateLabel(a.date)}</Text>
                            <Text className={`text-xs font-bold ${a.status === 'Present' ? 'text-emerald-600' : 'text-slate-500'}`}>{a.status}</Text>
                          </View>
                          <Text className="text-sm text-slate-600 mb-2">{timeLabel(a.check_in_time)} to {timeLabel(a.check_out_time)}</Text>
                          <Text className="text-sm font-medium text-slate-700">Hours: {a.hours_worked || 0} {a.overtime_hours > 0 && <Text className="text-brand-orange">(+{a.overtime_hours} OT)</Text>}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  </AnimatedCard>
                </View>

                <View className={`flex-col ${isMobile ? 'w-full' : 'flex-[1] w-full'}`} style={{ gap: 24 }}>
                  
                  <AnimatedCard delay={500} className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[300px] w-full">
                    <RecentAlertsPanel basePath="/worker" />
                  </AnimatedCard>

                  {siteAssignment && (
                    <AnimatedCard delay={550} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                      <Text className="text-lg font-bold text-brand-text mb-4">My Site</Text>
                      <Text className="font-bold text-slate-800 text-base">{siteAssignment.project.name}</Text>
                      <Text className="text-slate-500 text-sm mt-1 mb-4">{siteAssignment.site.address || 'Address not recorded'}</Text>
                      
                      {siteAssignment.site.address && (
                        <Pressable 
                          className="bg-slate-50 border border-slate-200 rounded-lg py-2 items-center mb-4"
                          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteAssignment.site.address)}`)}
                        >
                          <Text className="font-bold text-slate-700 text-sm">Open in Maps</Text>
                        </Pressable>
                      )}

                      {siteAssignment.manager && (
                        <View className="pt-4 border-t border-slate-100 mt-2">
                          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Site Manager</Text>
                          <Text className="font-semibold text-slate-700 mb-3">{siteAssignment.manager.full_name}</Text>
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
                    </AnimatedCard>
                  )}

                </View>
              </View>
            </>
          )}

      </ScrollView>
    </View>
  );
}
