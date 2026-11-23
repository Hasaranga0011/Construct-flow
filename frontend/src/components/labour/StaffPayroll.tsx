import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { TopNav } from '@/components/common/TopNav';
import { DateField } from '@/components/common/DateField';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button, Card, FormField, InlineNotice, Select } from '@/components/ui';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrencyExact as money } from '@/utils/format';
import { SalaryPaymentAction } from './SalaryPaymentAction';
import { payrollMonthStart } from '@/utils/payrollDate';

type Person={id:string;full_name:string;role:string;monthly_salary:number|null;projects?:{id:string;name:string}[]};
type Slip={id:string;worker_id:string;project_id:string;period_start:string;period_end:string;basic_pay:number;deductions:number;total_amount?:number;total_pay?:number;status:string;deduction_details?:{amount:number;reason:string}[]};
const roleLabel=(role:string)=>role==='pm'?'Project Manager':'Site Manager';
const initialMonth=payrollMonthStart;
function cents(value:string):number|null {
 if(!/^\d+(\.\d{1,2})?$/.test(value.trim()))return null;
 const amount=Math.round(Number(value)*100);return Number.isSafeInteger(amount)?amount:null;
}
const monthLabel=(value:string)=>new Date(value.slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
function SummaryLine({label,value,strong=false}:{label:string;value:string;strong?:boolean}) {
 return <View className="flex-row justify-between gap-3 py-2"><Text className="text-sm text-slate-500 flex-shrink">{label}</Text><Text className={strong?'font-bold text-lg text-brand-text flex-shrink text-right':'font-semibold text-sm text-brand-text flex-shrink text-right'}>{value}</Text></View>;
}
export default function StaffPayroll(){
 const {role}=useAuth(),admin=role==='super_admin'||role==='admin',wide=useWindowDimensions().width>=1200;
 const [people,setPeople]=useState<Person[]>([]),[slips,setSlips]=useState<Slip[]>([]);
 const [employee,setEmployee]=useState(''),[project,setProject]=useState(''),[rate,setRate]=useState(''),[month,setMonth]=useState(initialMonth),[deduction,setDeduction]=useState(''),[reason,setReason]=useState('');
 const [loading,setLoading]=useState(true),[peopleError,setPeopleError]=useState(''),[slipsError,setSlipsError]=useState('');
 const [peopleLoading,setPeopleLoading]=useState(true);
 const [historyLoading,setHistoryLoading]=useState(true);
 const [action,setAction]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const generation=useRef(0),busy=useRef(false);
 const selected=people.find(row=>row.id===employee),projects=selected?.projects||[];
 const savedCents=selected?.monthly_salary!=null?Math.round(Number(selected.monthly_salary)*100):0;
 const draftCents=cents(rate),deductionCents=deduction.trim()?cents(deduction):0;
 const unsaved=!!selected&&draftCents!==savedCents;
 const validDeduction=deductionCents!==null&&deductionCents<=savedCents&&(deductionCents===0||!!reason.trim());
 const duplicate=slips.some(slip=>slip.worker_id===employee&&slip.period_start<=month&&slip.period_end>=month);
 const load=useCallback(async()=>{
  const request=++generation.current;setLoading(true);setPeopleLoading(true);setHistoryLoading(true);
  await Promise.allSettled([
   api.getFresh('/labour/staff/payroll').then(rows=>{
    if(request===generation.current){setSlips(rows);setSlipsError('');}
   }).catch(e=>{if(request===generation.current)setSlipsError(e instanceof Error?e.message:'Unable to load payslips.');})
    .finally(()=>{if(request===generation.current)setHistoryLoading(false);}),
   (admin?api.getFresh('/labour/staff/people'):Promise.resolve([])).then(rows=>{
    if(request===generation.current){setPeople(rows);setPeopleError('');}
   }).catch(e=>{if(request===generation.current)setPeopleError(e instanceof Error?e.message:'Unable to load employees.');})
    .finally(()=>{if(request===generation.current)setPeopleLoading(false);}),
  ]);
  if(request===generation.current)setLoading(false);
 },[admin]);
 useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));
 useEffect(()=>{setRate(selected?.monthly_salary!=null?String(selected.monthly_salary):'');},[employee,selected?.monthly_salary]);
 const changeEmployee=(id:string)=>{setEmployee(id);setProject('');setDeduction('');setReason('');setError('');setNotice('');};
 const perform=async(kind:string,operation:()=>Promise<void>)=>{
  if(busy.current)return;busy.current=true;setAction(kind);setError('');setNotice('');
  try{await operation();await load();}catch(e){setError(e instanceof Error?e.message:'Salary action failed.');}finally{busy.current=false;setAction('');}
 };
 const saveRate=()=>perform('save',async()=>{
  if(!selected||draftCents===null||draftCents<=0)throw new Error('Choose an employee and enter a positive salary with up to two decimal places.');
  await api.post('/labour/staff/compensation',{user_id:employee,monthly_salary:draftCents/100});setNotice('Monthly salary saved. Existing payslips stay unchanged.');
 });
 const generate=()=>perform('generate',async()=>{
  if(!selected||!projects.some(row=>row.id===project)||!savedCents||unsaved||!validDeduction||duplicate||slipsError||peopleError)throw new Error('Review the saved salary, assigned project, deductions and existing payslips before generating.');
  await api.post('/labour/staff/salary',{user_id:employee,project_id:project,month:month.slice(0,7),deduction:(deductionCents||0)/100,reason:reason.trim()});
  setNotice('Monthly payslip generated successfully.');setDeduction('');setReason('');
 });
 const visibleSlips=admin&&employee?slips.filter(slip=>slip.worker_id===employee):slips;
 return <View className="flex-1 bg-brand-light"><TopNav title={admin?'Staff Salaries':'My Salary'} showAction={false}/>
 <ScrollView contentContainerStyle={{padding:16,paddingBottom:48}}><View className="w-full max-w-[1120px] self-center min-w-0">
  <View className="flex-row items-start justify-between gap-3 mb-5"><View className="flex-1 min-w-0"><Text className="text-2xl font-bold text-brand-text">{admin?'Monthly staff payroll':'Your monthly salary'}</Text><Text className="text-slate-500 text-sm mt-2 leading-5">{admin?'Set fixed salaries for Project Managers and Site Managers, then review each payslip before generation.':'View your issued payslips, deductions and payment status.'}</Text></View><Button label="Refresh" variant="secondary" disabled={loading||!!action} onPress={()=>void load()}/></View>
  <InlineNotice message={error}/><InlineNotice message={notice} tone="success"/>
  {admin&&<View className={wide?'flex-row items-start gap-5':'gap-1'}>
   <View className="flex-1 min-w-0"><Card>
    <View className="flex-row items-center gap-3 mb-4"><View className="bg-orange-50 p-3 rounded-xl"><Ionicons name="people-outline" size={22} color="#EA580C"/></View><View className="flex-1"><Text className="text-lg font-bold text-brand-text">Employee & salary</Text><Text className="text-xs text-slate-500 mt-1">1. Choose an employee and save their monthly rate</Text></View></View>
    {peopleLoading&&<View className="flex-row gap-2 items-center mb-3"><ActivityIndicator color="#EA580C"/><Text className="text-slate-500">Loading staff…</Text></View>}
    <InlineNotice message={peopleError?'Employees could not be loaded. '+peopleError:''}/>
    {!peopleLoading&&!peopleError&&!people.length&&<InlineNotice tone="info" message="No approved Project Managers or Site Managers are available. Check their approval and role in Users, then refresh."/>}
    <Text className="text-sm font-semibold text-slate-700 mb-2">Employee</Text>
    <View className="mb-4"><Select value={employee} onValueChange={changeEmployee} disabled={peopleLoading||!!action||!!peopleError||!people.length} placeholder="Choose Project Manager or Site Manager" options={people.map(row=>({value:row.id,label:(row.full_name || 'Unnamed employee')+' · '+roleLabel(row.role)}))}/></View>
    {!!selected&&<View className="bg-slate-50 rounded-xl border border-slate-200 p-3 mb-4"><Text className="font-semibold text-brand-text">{selected.full_name}</Text><Text className="text-sm text-slate-500 mt-1">{roleLabel(selected.role)} · {projects.length} assigned project{projects.length===1?'':'s'}</Text></View>}
    <FormField label="Fixed monthly salary (LKR)" placeholder="e.g. 75000.00" value={rate} onChangeText={setRate} editable={!!selected&&!action&&!peopleLoading} keyboardType="decimal-pad" helperText="Save this rate before generating a payslip. Changes apply to future payslips." error={rate.trim()&&(draftCents===null||draftCents<=0)?'Enter a positive amount with up to two decimal places.':undefined}/>
    <View className="self-start max-w-full"><Button label="Save monthly salary" loading={action==='save'} disabled={!!action||peopleLoading||!selected||draftCents===null||draftCents<=0||!unsaved||!!peopleError} onPress={()=>void saveRate()}/></View>
   </Card><Card>
    <View className="flex-row items-center gap-3 mb-4"><View className="bg-orange-50 p-3 rounded-xl"><Ionicons name="document-text-outline" size={22} color="#EA580C"/></View><View className="flex-1"><Text className="text-lg font-bold text-brand-text">Payslip details</Text><Text className="text-xs text-slate-500 mt-1">2. Select the month, project and any deductions</Text></View></View>
    <Text className="text-sm font-semibold text-slate-700 mb-2">Assigned project</Text>
    <View className="mb-4"><Select value={project} onValueChange={setProject} disabled={!selected||!projects.length||!!action||peopleLoading||!!peopleError} placeholder="Select employee's assigned project" options={projects.map(row=>({value:row.id,label:row.name}))}/></View>
    {!!selected&&!projects.length&&<InlineNotice tone="info" message="This employee has no assigned project. Assign a project in Users or Projects, then refresh."/>}
    <Text className="text-sm font-semibold text-slate-700 mb-2">Salary month</Text><DateField label="Salary month" disabled={!!action} value={month} onChange={value=>{if(value)setMonth(value.slice(0,7)+'-01');}}/>
    <Text className="text-xs text-slate-500 mt-2 mb-5">One full-calendar-month salary per employee, across all projects.</Text>
    <FormField label="Deduction amount (LKR)" placeholder="0.00" value={deduction} onChangeText={setDeduction} editable={!action} keyboardType="decimal-pad" error={deduction.trim()&&(deductionCents===null||deductionCents>savedCents)?'Use up to two decimals; deductions cannot exceed the saved salary.':undefined}/>
    <FormField label="Deduction reason" placeholder="e.g. Salary advance already paid" value={reason} onChangeText={setReason} editable={!action} maxLength={500} helperText="Required when a deduction is entered. This reason appears on the payslip."/>
   </Card></View>
   <View className={wide?'w-80 min-w-0':'w-full min-w-0'}><Card>
    <Text className="text-lg font-bold text-brand-text">Payslip preview</Text><Text className="text-sm text-slate-500 mt-1 mb-4">{monthLabel(month)}</Text>
    <View className="pb-3 mb-3 border-b border-slate-100"><Text className="font-semibold text-brand-text">{selected?.full_name||'Choose an employee'}</Text><Text className="text-sm text-slate-500 mt-1">{projects.find(row=>row.id===project)?.name||'Select their assigned project'}</Text></View>
    <SummaryLine label="Saved gross salary" value={savedCents>0?money(savedCents/100):'Not set'}/><SummaryLine label="Deductions" value={money((deductionCents||0)/100)}/>
    <View className="border-t border-slate-200 mt-2 pt-2"><SummaryLine strong label="Net salary" value={savedCents>0&&validDeduction?money((savedCents-(deductionCents||0))/100):'—'}/></View>
    <View className="mt-4"><InlineNotice tone="info" message={duplicate?'A payslip already exists for this employee and month. Review it below.':unsaved?'Save the monthly salary before generating a payslip.':selected&&!savedCents?'Set and save a monthly salary to continue.':''}/>
     <Button label="Generate monthly payslip" loading={action==='generate'} disabled={loading||!!action||!selected||!project||!savedCents||unsaved||!validDeduction||duplicate||!!peopleError||!!slipsError} onPress={()=>void generate()}/>
    </View><Text className="text-xs text-slate-500 leading-5 mt-3">Generating creates a payslip. Record payment separately after the employee has been paid.</Text>
   </Card></View>
  </View>}
  <View className="mt-2 mb-4"><Text className="text-xl font-bold text-brand-text">Payslip history</Text><Text className="text-sm text-slate-500 mt-1">{admin&&selected?selected.full_name:'Monthly salary records'} · {visibleSlips.length} payslip{visibleSlips.length===1?'':'s'}</Text></View>
  {historyLoading&&<View className="flex-row items-center gap-2 mb-4"><ActivityIndicator color="#EA580C"/><Text className="text-slate-500">Loading payslip history…</Text></View>}
  <InlineNotice message={slipsError?'Payslip history could not be loaded. '+slipsError:''}/>
  {!!slipsError&&<View className="self-start mb-4"><Button label="Retry loading salaries" variant="secondary" onPress={()=>void load()} disabled={loading||!!action}/></View>}
  {!loading&&!slipsError&&!visibleSlips.length&&<Card><View className="items-center py-6"><Ionicons name="documents-outline" size={32} color="#94A3B8"/><Text className="font-semibold text-brand-text mt-3">No monthly payslips yet</Text><Text className="text-sm text-slate-500 mt-2 text-center">{admin?'Generated payslips will appear here with their payment status.':'Your administrator will generate your monthly payslip.'}</Text></View></Card>}
  {visibleSlips.map(slip=><Card key={slip.id}><View className="flex-row flex-wrap justify-between gap-3 mb-3"><View className="flex-1 min-w-0"><Text className="font-bold text-lg text-brand-text">{people.find(row=>row.id===slip.worker_id)?.full_name||'Monthly salary'}</Text><Text className="text-slate-500 text-sm mt-1">{monthLabel(slip.period_start)} · {slip.period_start} to {slip.period_end}</Text></View><StatusBadge status={slip.status}/></View>
   <SummaryLine label="Gross salary" value={money(Number(slip.basic_pay||0))}/><SummaryLine label="Deductions" value={money(Number(slip.deductions||0))}/>
   {(slip.deduction_details||[]).map((row,index)=><Text key={index} className="text-sm text-slate-500 mt-2">{row.reason}: {money(Number(row.amount))}</Text>)}
   <View className="border-t border-slate-100 mt-3 pt-2"><SummaryLine strong label="Net salary" value={money(Number(slip.total_amount??slip.total_pay??0))}/></View>
   {admin&&<SalaryPaymentAction slip={slip} onPaid={()=>void load()}/>}
  </Card>)}
 </View></ScrollView></View>;
}
