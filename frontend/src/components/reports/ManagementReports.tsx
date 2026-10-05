import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { TopNav } from '../common/TopNav';
import { api } from '../../services/api';
import { deliverReport } from './reportDelivery';
import { ExportFormat, ReportDocument, ExportSection, typedSection } from './reportDocument';
import { amount, csv, dateKey, grouped, lateOrder, localDay, ManagementReport, money, monthKey, numeric, openOrder, orderValue, overBudget, overdueProject, overtime, paidPay, pendingPay, projectFlags, ReportRow, shortage, siteId, stock, stockFlag, sumKnown, text, threshold } from './metrics';

type Kind = 'overview' | 'projects' | 'materials' | 'payroll';
const titles: Record<Kind, string> = { overview: 'Management Reports', projects: 'Project Performance', materials: 'Inventory & Procurement', payroll: 'Payroll & Workforce Cost' };
const descriptions: Record<Kind, string> = {
  overview: 'Portfolio health, operational exposure and the decisions that need attention.',
  projects: 'Identify budget pressure, delayed delivery and accountable project managers.',
  materials: 'Prioritize replenishment and follow up on outstanding purchase orders.',
  payroll: 'Understand generated payroll, payment obligations and labour cost allocation.',
};
const cardStyle = { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 20, marginBottom: 16 };
function Button({ label, onPress, active = false, disabled = false }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: active ? '#F97316' : '#fff', borderWidth: 1, borderColor: active ? '#F97316' : '#D1D5DB', opacity: disabled ? 0.5 : 1 }}><Text style={{ color: active ? '#fff' : '#374151', fontWeight: '600' }}>{label}</Text></Pressable>;
}
function ExportActions({ report, busy, onExport }: { report: ReportDocument; busy: boolean; onExport: (report: ReportDocument, format: ExportFormat) => void }) {
  return <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
    {(['print', 'pdf', 'excel'] as ExportFormat[]).map(format => <Pressable key={format} accessibilityRole="button" accessibilityLabel={`${format === 'print' ? 'Print' : format === 'pdf' ? 'Download PDF' : 'Download Excel'}: ${report.title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => onExport(report, format)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: format === 'print' ? '#fff' : '#FFF0E5', borderWidth: 1, borderColor: '#FED7AA', opacity: busy ? 0.5 : 1 }}><Text style={{ color: '#9A3412', fontWeight: '600' }}>{format === 'print' ? 'Print' : format === 'pdf' ? 'PDF' : 'Excel (.xlsx)'}</Text></Pressable>)}
  </View>;
}
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <View style={cardStyle}><Text className="text-lg font-bold text-brand-text mb-2">{title}</Text>{note && <Text className="text-gray-500 text-sm mb-4">{note}</Text>}{children}</View>;
}
function KPI({ title, value, note, alert = false }: { title: string; value: string | number; note: string; alert?: boolean }) {
  return <View style={{ ...cardStyle, flexGrow: 1, flexBasis: 220, marginBottom: 0 }}><Text className="text-xs font-semibold uppercase text-gray-500">{title}</Text><Text style={{ fontSize: 26, fontWeight: '700', color: alert ? '#B45309' : '#111827', marginVertical: 10 }}>{value}</Text><Text className="text-sm text-gray-500">{note}</Text></View>;
}
function Bars({ rows, currency = false }: { rows: [string, number][]; currency?: boolean }) {
  const max = Math.max(1, ...rows.map(row => row[1]));
  return rows.length ? <View style={{ gap: 14 }}>{rows.map(([label, value]) => <View key={label}><View className="flex-row justify-between mb-2" style={{ gap: 12 }}><Text className="text-gray-600 flex-1">{label}</Text><Text className="text-brand-text font-semibold">{currency ? money(value) : value}</Text></View><View style={{ height: 7, borderRadius: 4, backgroundColor: '#FFF0E5' }}><View style={{ width: `${Math.max(0, value / max * 100)}%`, height: 7, backgroundColor: '#F97316', borderRadius: 4 }} /></View></View>)}</View> : <Text className="text-gray-500">No recorded data for this view.</Text>;
}
function Table({ headers, rows, links = [] }: { headers: string[]; rows: string[][]; links?: (string | undefined)[] }) {
  const router = useRouter();
  const [limit, setLimit] = useState(25);
  useEffect(() => setLimit(25), [rows]);
  if (!rows.length) return <Text className="text-gray-500 py-4">No records match these filters.</Text>;
  const widths = headers.map((_, index) => index === 0 ? 240 : 170);
  return <><ScrollView horizontal showsHorizontalScrollIndicator><View>
    <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 8 }}>{headers.map((header, index) => <Text key={header} style={{ width: widths[index], padding: 12, color: '#4B5563', fontWeight: '700', fontSize: 12 }}>{header}</Text>)}</View>
    {rows.slice(0, limit).map((row, index) => <View key={index} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F3F4F6' }}>{row.map((value, col) => <View key={col} style={{ width: widths[col], padding: 12, justifyContent: 'center' }}>{col === 0 && links[index] ? <Pressable accessibilityRole="link" onPress={() => router.push(links[index] as Href)}><Text style={{ color: '#C2410C', fontWeight: '600' }}>{value} →</Text></Pressable> : <Text style={{ color: '#374151', fontSize: 13 }}>{value}</Text>}</View>)}</View>)}
  </View></ScrollView><View className="flex-row flex-wrap items-center justify-between mt-4" style={{ gap: 12 }}><Text className="text-gray-500 text-sm">Showing {Math.min(limit, rows.length)} of {rows.length} records · Scroll sideways for more columns</Text>{limit < rows.length && <Button label="Show 25 more" onPress={() => setLimit(n => n + 25)} />}</View></>;
}

export default function ManagementReports({ kind }: { kind: Kind }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<ManagementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [month, setMonth] = useState(localDay().slice(0, 7));
  const [exportMessage, setExportMessage] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const handleExport = async (report: ReportDocument, format: ExportFormat) => {
    if (exportBusy) return;
    setExportBusy(true); setExportMessage('Preparing report...');
    try { setExportMessage(await deliverReport({ ...report, exportedAt: new Date().toISOString() }, format)); }
    catch (e) { setExportMessage(e instanceof Error ? e.message : 'Report export failed. Please retry.'); }
    finally { setExportBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    api.reports.management().then((result: ManagementReport) => { if (alive) setData(result); })
      .catch((e: Error) => { if (alive) { setError(e.message || 'Unable to load reports.'); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);
  const projects = data?.projects ?? [], materials = data?.materials ?? [], orders = data?.orders ?? [], slips = data?.payroll ?? [];
  const names = Object.fromEntries((data?.people ?? []).map(p => [p.id, p.full_name || p.id]));
  const projectNames = Object.fromEntries(projects.map(p => [p.id, text(p.name)]));
  const projectName = (row: ReportRow) => projectNames[siteId(row)] || (siteId(row) ? `Project ${siteId(row)}` : 'Unassigned project');
  const workerName = (row: ReportRow) => names[text(row.worker_id, '')] || text(row.worker_id, 'Unassigned worker');
  const today = localDay();
  const monthSlips = slips.filter(row => month === 'all' || monthKey(row.period_start) === month);
  const months = [...new Set([localDay().slice(0, 7), ...slips.map(row => monthKey(row.period_start)).filter((m): m is string => !!m)])].sort().reverse();
  const scope = month === 'all' ? 'All periods' : month;
  const matches = (...values: unknown[]) => values.map(value => text(value, '')).join(' ').toLowerCase().includes(search.trim().toLowerCase());
  const projectRows = projects.filter(p => matches(p.name, p.location, names[text(p.pm_id, '')]) && (filter === 'All' || (filter === 'Over budget' ? overBudget(p) : filter === 'Overdue' ? overdueProject(p, today) : projectFlags(p, today).length > 0))).sort((a, b) => projectFlags(b, today).length - projectFlags(a, today).length || text(a.name).localeCompare(text(b.name)));
  const materialRows = materials.filter(m => matches(m.name, m.unit) && (filter === 'All' || (filter === 'Replenish' ? ['Out of stock', 'Low stock'].includes(stockFlag(m)) : stockFlag(m).startsWith('Missing'))));
  const orderRows = orders.filter(o => matches(o.po_number, o.supplier_name, projectName(o))).sort((a, b) => Number(lateOrder(b, today)) - Number(lateOrder(a, today)));
  const payrollRows = monthSlips.filter(p => matches(workerName(p), projectName(p), p.id) && (filter === 'All' || (filter === 'Paid' ? paidPay(p) : filter === 'Pending' ? pendingPay(p) : !paidPay(p) && !pendingPay(p))));
  const budget = sumKnown(projects, p => numeric(p.total_budget));
  const spent = sumKnown(projects, p => numeric(p.spent_cost));
  const comparable = projects.filter(p => numeric(p.total_budget) !== null && numeric(p.spent_cost) !== null);
  const remaining = sumKnown(comparable, p => numeric(p.total_budget)! - numeric(p.spent_cost)!);
  const over = projects.filter(overBudget), late = projects.filter(p => overdueProject(p, today));
  const low = materials.filter(m => ['Out of stock', 'Low stock'].includes(stockFlag(m)));
  const pending = monthSlips.filter(pendingPay), paid = monthSlips.filter(paidPay);
  const openOrders = orders.filter(openOrder), lateOrders = orders.filter(o => lateOrder(o, today));
  const missing = projects.filter(p => numeric(p.total_budget) === null || numeric(p.spent_cost) === null || !dateKey(p.end_date)).length + materials.filter(m => stock(m) === null || threshold(m) === null).length + slips.filter(p => amount(p) === null || !dateKey(p.period_start)).length;
  const projectHeaders = ['Project', 'Manager', 'Status / progress', 'Budget', 'Recorded spend', 'Budget remaining', 'Planned finish', 'Review flags'];
  const projectCells = projectRows.map(p => { const b = numeric(p.total_budget), s = numeric(p.spent_cost), progress = numeric(p.completion_percentage); return [text(p.name), names[text(p.pm_id, '')] || text(p.pm_id, 'Unassigned'), `${text(p.status)} / ${progress === null ? 'No progress data' : `${progress}%`}`, money(b), money(s), money(b === null || s === null ? null : b - s), dateKey(p.end_date) || 'Not recorded', projectFlags(p, today).join(', ') || 'No rule-based flags']; });
  const materialHeaders = ['Material', 'Unit', 'On hand', 'Minimum', 'Shortfall to minimum', 'Stock health'];
  const materialCells = materialRows.map(m => [text(m.name), text(m.unit), text(stock(m)), text(threshold(m)), text(shortage(m)), stockFlag(m)]);
  const orderHeaders = ['Purchase order', 'Supplier', 'Project', 'Status', 'Order value', 'Expected delivery', 'Follow-up'];
  const orderCells = orderRows.map(o => [text(o.po_number, o.id), text(o.supplier_name), projectName(o), text(o.status), money(orderValue(o)), dateKey(o.expected_date) || 'Not recorded', lateOrder(o, today) ? 'Overdue delivery — contact supplier' : openOrder(o) ? 'Track delivery' : 'Review status']);
  const payrollHeaders = ['Worker', 'Project', 'Period start', 'Period end', 'Days', 'Overtime hours', 'Generated amount', 'Payment status'];
  const payrollCells = payrollRows.map(p => [workerName(p), projectName(p), dateKey(p.period_start) || 'Not recorded', dateKey(p.period_end) || 'Not recorded', text(numeric(p.total_days)), text(overtime(p)), money(amount(p)), text(p.status)]);
  const exportRows = async (name: string, headers: string[], rows: string[][]) => {
    try {
      const content = csv(['Report', 'Data retrieved at', 'Filters', ...headers], rows.map(row => [name, data?.generated_at || '', `Period: ${kind === 'payroll' || kind === 'overview' ? scope : 'Current snapshot'}; ${filter}; search: ${search}`, ...row]));
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a'); link.href = url; link.download = `${name}-${today}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ title: name, message: content });
      setExportMessage('Report export ready.');
    } catch { setExportMessage('Export failed. Please try again.'); }
  };
  const filters = kind === 'projects' ? ['All', 'Over budget', 'Overdue', 'Needs review'] : kind === 'materials' ? ['All', 'Replenish', 'Missing data'] : ['All', 'Paid', 'Pending', 'Other status'];
  const previousMonth = month !== 'all' ? localDay(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).slice(0, 7) : null;
  const previousSlips = slips.filter(s => monthKey(s.period_start) === previousMonth);
  const previousTotal = sumKnown(previousSlips, amount), selectedTotal = sumKnown(monthSlips, amount);
  const completeAmounts = monthSlips.every(p => amount(p) !== null) && previousSlips.every(p => amount(p) !== null);
  const delta = completeAmounts && monthSlips.length > 0 && previousSlips.length && previousTotal !== null && previousTotal > 0 && selectedTotal !== null ? ((selectedTotal - previousTotal) / previousTotal * 100).toFixed(1) : null;
  const payrollGroups = grouped(payrollRows, p => siteId(p) || 'unassigned', amount).map(([id, value]): [string, number] => [projectNames[id] ? `${projectNames[id]} / ${id.slice(0, 6)}` : (id === 'unassigned' ? 'Unassigned project' : `Project ${id}`), value]);
  const detailScope = `Period: ${kind === 'payroll' || kind === 'overview' ? scope + ' (salary-slip period start)' : 'Current snapshot'}; detail filter: ${filter}; search: ${search || 'None'}. Summary indicators retain the portfolio/period scope shown on screen.`;
  const makeDocument = (title: string, sections: ExportSection[], customScope = detailScope): ReportDocument => ({ title, sections, scope: customScope, retrievedAt: data?.generated_at || '', exportedAt: new Date().toISOString() });
  const summary = (title: string, rows: string[][], note?: string): ExportSection => ({ title, headers: ['Indicator', 'Value'], rows, note });
  const executiveSection = summary('Executive summary', [
    ['Projects', String(projects.length)], ['Portfolio budget', money(budget)], ['Recorded project spend', money(spent)],
    ['Over-budget projects', String(over.length)], ['Overdue projects', String(late.length)], ['Materials requiring replenishment', String(low.length)],
    ['Overdue open orders', String(lateOrders.length)], ['Pending payroll - ' + scope, money(sumKnown(pending, amount))], ['Records missing key data', String(missing)],
  ], 'Project spend, purchase orders and payroll may overlap and must not be added together. Missing values are excluded, not assumed zero. No salary slips does not prove no wages are owed.');
  const projectSection = typedSection('Project decision register', projectHeaders, projectCells, [], [3, 4, 5], 'Filtered projects. Budget remaining is budget minus recorded spend, not a forecast. Overdue excludes completed and cancelled projects.');
  const inventorySection = typedSection('Inventory replenishment register', materialHeaders, materialCells, [2, 3, 4], [], 'Filtered inventory. Shortfall is to the recorded minimum, not a demand forecast. Different units must not be added together.');
  const procurementSection = typedSection('Purchase order follow-up', orderHeaders, orderCells, [], [4], 'Search-filtered purchase orders. Inventory health filters do not restrict this register. Open order value is not necessarily unpaid.');
  const payrollSection = typedSection('Salary-slip register', payrollHeaders, payrollCells, [4, 5], [6], 'Filtered salary slips. Payment status is recorded status, not proof of bank payment. Blank amounts are not recorded.');
  const documents = {
    executive: makeDocument('Executive summary', [executiveSection]),
    projects: makeDocument('Project decision register', [projectSection]),
    inventory: makeDocument('Inventory replenishment register', [inventorySection]),
    procurement: makeDocument('Purchase order follow-up', [procurementSection], `Current snapshot; search: ${search || 'None'}. Stock-health filter does not apply to purchase orders.`),
    payroll: makeDocument('Salary-slip register', [payrollSection]),
  };
  const sections: Record<Kind, ExportSection[]> = {
    overview: [executiveSection,
      { title: 'Management action agenda', headers: ['Priority', 'Evidence and action'], rows: [
        ['Project costs and delivery', `${over.length} over budget; ${late.length} overdue. Confirm cost controls and revised delivery dates with project managers.`],
        ['Materials and suppliers', `${low.length} materials need replenishment; ${lateOrders.length} late open orders. Confirm site demand and supplier delivery dates.`],
        ['Payroll funding', `${money(sumKnown(pending, amount))} pending in ${scope}. Confirm approvals and payment evidence before releasing funds.`],
      ] }, { title: 'Portfolio status', headers: ['Status', 'Projects'], rows: grouped(projects, p => text(p.status)) }],
    projects: [summary('Portfolio indicators', [['Total budget', money(budget)], ['Recorded spend', money(spent)], ['Budget remaining', money(comparable.length ? remaining : null)], ['Comparable projects', String(comparable.length)], ['Overdue projects', String(late.length)], ['Over-budget projects', String(over.length)]], 'Portfolio-wide totals; missing cost values are excluded. The decision register below follows the selected filters.'), projectSection],
    materials: [summary('Inventory and procurement indicators', [['Material lines', String(materials.length)], ['Need replenishment', String(low.length)], ['Open order value', money(sumKnown(openOrders, orderValue))], ['Late deliveries', String(lateOrders.length)]], 'Portfolio-wide indicators. Open order value does not establish an unpaid liability.'), inventorySection, procurementSection,
      { title: 'Procurement status', headers: ['Status', 'Orders'], rows: grouped(orders, o => text(o.status)) }],
    payroll: [summary('Payroll period indicators', [['Period', scope], ['Generated payroll', money(selectedTotal)], ['Marked paid', money(sumKnown(paid, amount))], ['Pending payment', money(sumKnown(pending, amount))], ['Overtime hours', text(sumKnown(monthSlips, overtime))], ['Undated slips across all periods', String(slips.filter(p => !monthKey(p.period_start)).length)], ['Missing amounts in period', String(monthSlips.filter(p => amount(p) === null).length)], ['Other payment statuses in period', String(monthSlips.filter(p => !paidPay(p) && !pendingPay(p)).length)], ['Change from previous month', delta === null || month === 'all' ? 'Insufficient comparable data / all periods selected' : `${delta}% compared with ${previousMonth}`]], 'Period totals precede detail search/status filters. Salary slips are assigned by period start. Partial months may not be comparable.'), payrollSection,
      { title: 'Cost allocation by project', note: 'Filtered salary-slip amounts; missing amounts excluded.', headers: ['Project', 'Generated amount'], rows: payrollGroups, currencyColumns: [1] },
      { title: 'Monthly generated payroll', note: 'Latest six recorded months across all records, independent of selected detail filters. Missing amounts and undated records excluded.', headers: ['Month', 'Generated amount'], rows: grouped(slips.filter(p => !!monthKey(p.period_start)), p => monthKey(p.period_start)!, amount).sort((a, b) => a[0].localeCompare(b[0])).slice(-6), currencyColumns: [1] }],
  };
  const fullDocument = makeDocument(titles[kind], sections[kind]);
  return <View className="flex-1 bg-brand-light">{width >= 1024 && <TopNav title={titles[kind]} showAction={false} />}<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
    <View className="flex-row flex-wrap justify-between items-start mb-5" style={{ gap: 16 }}><View style={{ flex: 1, minWidth: 200 }}><Text className="text-2xl font-bold text-brand-text">{titles[kind]}</Text><Text className="text-gray-500 mt-2">{descriptions[kind]}</Text>{data && <Text className="text-xs text-gray-400 mt-2">Data retrieved {new Date(data.generated_at).toLocaleString()} · Currency LKR</Text>}</View><Button label={loading ? 'Refreshing…' : 'Refresh data'} disabled={loading} onPress={() => setRefresh(n => n + 1)} /></View>
    <View className="flex-row flex-wrap mb-5" style={{ gap: 8 }}>{(['overview', 'projects', 'materials', 'payroll'] as Kind[]).map(tab => <Button key={tab} label={tab === 'overview' ? 'Executive overview' : titles[tab]} active={kind === tab} onPress={() => router.push(`/admin/reports${tab === 'overview' ? '' : '/' + tab}` as Href)} />)}</View>
    {loading ? <View style={cardStyle}><ActivityIndicator color="#F97316" /><Text className="text-gray-500 text-center mt-3">Loading report data…</Text></View> : error ? <Section title="Report unavailable" note={error}><Button label="Retry" onPress={() => setRefresh(n => n + 1)} /></Section> : data && <>
      <Section title="Print or save this report" note="Includes summary indicators and all matching detail rows, including rows beyond the on-screen page. Filters and retrieval time are included."><ExportActions report={fullDocument} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} />{!!exportMessage && <Text accessibilityRole="alert" className="text-gray-600">{exportMessage}</Text>}</Section>
      {(kind === 'payroll' || kind === 'overview') && <Section title="Payroll reporting period" note="Salary slips are assigned by period start. Undated records appear only under All periods. Project and stock indicators are current snapshots."><ScrollView horizontal><View className="flex-row" style={{ gap: 8 }}><Button label="All periods" active={month === 'all'} onPress={() => setMonth('all')} />{months.map(m => <Button key={m} label={m} active={month === m} onPress={() => setMonth(m)} />)}</View></ScrollView></Section>}
      {kind === 'overview' ? <>
        <View className="flex-row flex-wrap mb-5" style={{ gap: 12 }}><KPI title="Portfolio budget" value={money(budget)} note={`${projects.length} projects · recorded budgets`} /><KPI title="Recorded project spend" value={money(spent)} note="Project cost records; not a reconciled ledger" /><KPI title="Projects over budget" value={over.length} note={`${late.length} unfinished projects past planned finish`} alert={over.length > 0 || late.length > 0} /><KPI title="Replenishment priorities" value={low.length} note={`${lateOrders.length} overdue open purchase orders`} alert={low.length > 0} /><KPI title="Pending payroll" value={money(sumKnown(pending, amount))} note={`${pending.length} pending slips · ${scope}`} alert={pending.length > 0} /></View>
        <Section title="Management action agenda" note="Flags highlight records requiring review. Open the detailed reports to inspect supporting data.">
          {[['Review project cost and recovery plans', `${over.length} over-budget projects; ${late.length} overdue. Confirm revised delivery dates and cost controls with project managers.`, 'projects'], ['Prioritize materials and supplier follow-up', `${low.length} materials need replenishment; ${lateOrders.length} open orders are overdue. Check site demand before raising purchase orders.`, 'materials'], ['Review payroll funding and payment status', `${money(sumKnown(pending, amount))} recorded pending in ${scope}. Confirm approvals and payment evidence before releasing funds.`, 'payroll']].map(([title, detail, route]) => <Pressable key={route} accessibilityRole="link" onPress={() => router.push(`/admin/reports/${route}` as Href)} style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' }}><Text className="font-bold text-brand-text">{title} →</Text><Text className="text-gray-500 mt-2">{detail}</Text></Pressable>)}
        </Section>
        <Section title="Portfolio status"><Bars rows={grouped(projects, p => text(p.status))} /></Section>
        <Section title="Management summary export" note="Export the current overview with its reporting period and retrieval timestamp."><><ExportActions report={documents.executive} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} /><Button label="Export executive summary (CSV)" onPress={() => void exportRows('executive-summary', ['Indicator', 'Value', 'Scope'], [['Projects', String(projects.length), 'Current portfolio'], ['Recorded budget', money(budget), 'Current portfolio'], ['Recorded project spend', money(spent), 'Current portfolio'], ['Over-budget projects', String(over.length), 'Current portfolio'], ['Overdue projects', String(late.length), 'Current portfolio'], ['Materials requiring replenishment', String(low.length), 'Current inventory'], ['Overdue open orders', String(lateOrders.length), 'Current procurement'], ['Pending payroll', money(sumKnown(pending, amount)), scope], ['Records missing key data', String(missing), 'All records']])} /></></Section>
        <Section title="Data confidence" note="Missing values are excluded from monetary totals, never assumed to be zero. Recorded project spend, purchase orders and salary slips may overlap and must not be added together."><Text className="text-gray-600">{missing} records have missing key cost, schedule, stock or payroll-period data. Review the detailed reports before making funding decisions.</Text><Text className="text-gray-500 mt-2">No payroll slips in the selected period means no generated payroll records; it does not prove there are no wages owed.</Text></Section>
      </> : <>
        <Section title="Filter report" note={kind === 'materials' ? 'Stock filters apply to inventory. Search applies to inventory and purchase orders; the procurement summary remains portfolio-wide.' : 'Summary indicators show the reporting scope; the filters below narrow the detailed records.'}><TextInput accessibilityLabel="Search report records" placeholder={kind === 'payroll' ? 'Search worker or project' : kind === 'projects' ? 'Search project, location or manager' : 'Search material, purchase order or supplier'} value={search} onChangeText={setSearch} style={{ borderWidth: 1, borderColor: '#D1D5DB', padding: 12, borderRadius: 8, marginBottom: 12, color: '#111827' }} /><View className="flex-row flex-wrap" style={{ gap: 8 }}>{filters.map(f => <Button key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />)}</View></Section>
        {kind === 'projects' && <>
          <View className="flex-row flex-wrap mb-5" style={{ gap: 12 }}><KPI title="Total budget" value={money(budget)} note={`${projects.length} projects`} /><KPI title="Recorded spend" value={money(spent)} note={`${projects.filter(p => numeric(p.spent_cost) === null).length} missing spend values`} /><KPI title="Budget remaining" value={money(comparable.length ? remaining : null)} note={`Budget minus spend · ${comparable.length} comparable projects`} /><KPI title="Overdue / over budget" value={`${late.length} / ${over.length}`} note="Overdue excludes completed and cancelled projects" alert={!!(late.length + over.length)} /></View>
          <Section title="Largest recorded project costs" note="Top 10 by recorded spend. Budget remaining is not a forecast of final cost."><Bars rows={[...projects].filter(p => numeric(p.spent_cost) !== null).sort((a, b) => numeric(b.spent_cost)! - numeric(a.spent_cost)!).slice(0, 10).map(p => [`${text(p.name)} · ${p.id.slice(0, 6)}`, numeric(p.spent_cost)!])} currency /></Section>
          <Section title="Project decision register" note="Review flags include missing costs, missing finish dates and unassigned managers. Select a project to open its record."><View className="mb-4"><ExportActions report={documents.projects} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} /><Button label="Export filtered projects (CSV)" disabled={!projectCells.length} onPress={() => void exportRows('project-report', projectHeaders, projectCells)} /></View><Table headers={projectHeaders} rows={projectCells} links={projectRows.map(p => `/admin/projects/${p.id}`)} /></Section>
        </>}
        {kind === 'materials' && <>
          <View className="flex-row flex-wrap mb-5" style={{ gap: 12 }}><KPI title="Material lines" value={materials.length} note="Different units are not added together" /><KPI title="Need replenishment" value={low.length} note={`${materials.filter(m => stockFlag(m) === 'Out of stock').length} out of stock`} alert={low.length > 0} /><KPI title="Open order value" value={money(sumKnown(openOrders, orderValue))} note={`${openOrders.length} open orders · not necessarily unpaid`} /><KPI title="Late deliveries" value={lateOrders.length} note="Open orders past their expected delivery date" alert={lateOrders.length > 0} /></View>
          <Section title="Procurement status"><Bars rows={grouped(orders, o => text(o.status))} /></Section>
          <Section title="Inventory replenishment register" note="Shortfall = maximum of zero and minimum minus on-hand quantity. This is a stock threshold signal, not a demand forecast."><View className="mb-4"><ExportActions report={documents.inventory} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} /><Button label="Export filtered inventory (CSV)" disabled={!materialCells.length} onPress={() => void exportRows('inventory-report', materialHeaders, materialCells)} /></View><Table headers={materialHeaders} rows={materialCells} /></Section>
          <Section title="Purchase order follow-up" note={`${openOrders.filter(o => orderValue(o) === null).length} open orders have no recorded value; these are excluded from totals. Late deliveries are listed first.`}><View className="mb-4"><ExportActions report={documents.procurement} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} /><Button label="Export purchase orders (CSV)" disabled={!orderCells.length} onPress={() => void exportRows('procurement-report', orderHeaders, orderCells)} /></View><Table headers={orderHeaders} rows={orderCells} links={orderRows.map(o => `/admin/materials/orders/${o.id}`)} /></Section>
        </>}
        {kind === 'payroll' && <>
          <View className="flex-row flex-wrap mb-5" style={{ gap: 12 }}><KPI title="Generated payroll" value={money(selectedTotal)} note={`${monthSlips.length} slips · ${scope}`} /><KPI title="Marked paid" value={money(sumKnown(paid, amount))} note={`${new Set(paid.map(p => p.worker_id).filter(Boolean)).size} workers marked paid`} /><KPI title="Pending payment" value={money(sumKnown(pending, amount))} note={`${pending.length} pending slips`} alert={pending.length > 0} /><KPI title="Overtime hours" value={text(sumKnown(monthSlips, overtime))} note={`${monthSlips.filter(p => overtime(p) === null).length} slips missing overtime data`} /></View>
          <Section title="Period comparison" note="Generated payroll is compared by salary-slip period start; partial months and incomplete payroll runs may not be comparable."><Text className="text-gray-600">{month === 'all' ? 'Select a month to compare it with the previous month.' : delta === null ? `Insufficient comparable payroll amounts for ${previousMonth}; no percentage change is shown.` : `${Number(delta) >= 0 ? '+' : ''}${delta}% compared with ${previousMonth} (${money(previousTotal)}).`}</Text><Text className="text-gray-500 mt-2">{slips.filter(p => !monthKey(p.period_start)).length} undated slips · {monthSlips.filter(p => amount(p) === null).length} missing amounts · {monthSlips.filter(p => !paidPay(p) && !pendingPay(p)).length} slips with other or unknown payment status.</Text></Section>
          <Section title="Monthly generated payroll" note="Latest six recorded months; missing amounts and undated slips excluded. No bar means no recorded amount, not confirmed zero liability."><Bars rows={grouped(slips.filter(p => !!monthKey(p.period_start)), p => monthKey(p.period_start)!, amount).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)} currency /></Section>
          <Section title="Cost allocation by project" note="Uses the filtered salary slips below; unassigned costs remain visible."><Bars rows={payrollGroups} currency /></Section>
          <Section title="Salary-slip register" note="Payment status comes from recorded salary slips; generated totals are not proof of bank payments."><View className="mb-4"><ExportActions report={documents.payroll} busy={exportBusy} onExport={(report, format) => void handleExport(report, format)} /><Button label="Export filtered payroll (CSV)" disabled={!payrollCells.length} onPress={() => void exportRows('payroll-report', payrollHeaders, payrollCells)} /></View><Table headers={payrollHeaders} rows={payrollCells} /></Section>
        </>}
      </>}
      {!!exportMessage && <Text accessibilityRole="alert" className="text-gray-600 mb-4">{exportMessage}</Text>}
    </>}
  </ScrollView></View>;
}
