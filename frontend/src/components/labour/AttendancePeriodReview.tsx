import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { api } from '@/services/api';
import { Button, InlineNotice, FormField } from '@/components/ui';
import { DateField } from '@/components/common/DateField';
import { StatusBadge } from '@/components/common/StatusBadge';

type AttendanceRow = { id:string;worker_name:string;site_name?:string;date:string;hours_worked:number|null;overtime_hours:number|null;check_in_time:string|null;check_out_time:string|null;checkout_correction_reason?:string };
function MissingCheckoutForm({row,onSave,busy}:{row:AttendanceRow;onSave:(date:string,time:string,reason:string)=>void;busy:boolean}) {
  const [date,setDate]=useState(row.date),[time,setTime]=useState(''),[reason,setReason]=useState('');
  return <View className="gap-3 mt-3 p-3 bg-white rounded-xl border border-orange-200">
    <Text className="text-sm text-slate-600">Enter the actual check-out in Sri Lanka time. Hours and overtime will be recalculated; a reason is recorded for audit.</Text>
    <Text className="text-sm text-slate-500">Check-in: {row.check_in_time ? new Date(row.check_in_time).toLocaleString('en-GB',{timeZone:'Asia/Colombo'}) : 'Not recorded'}</Text>
    <DateField label="Actual check-out date" disabled={busy} value={date} onChange={setDate}/>
    <DateField label="Actual check-out time (Sri Lanka)" disabled={busy} mode="time" value={time} onChange={setTime}/>
    <FormField label="Reason for missing check-out" editable={!busy} value={reason} onChangeText={setReason}/>
    <Button label="Save actual check-out" disabled={busy||!date||!time||reason.trim().length<5} onPress={()=>onSave(date,time,reason)}/>
  </View>;
}
export function AttendancePeriodReview({projectId,start,end}:{projectId:string;start:string;end:string}) {
  const [rows,setRows]=useState<AttendanceRow[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [success,setSuccess]=useState(false);
  const [loadedScope,setLoadedScope]=useState('');
  const scope=`${projectId}:${start}:${end}`;
  const activeScope=useRef(scope);activeScope.current=scope;
  useEffect(()=>{setRows(null);setLoadedScope('');setMessage('');},[scope]);
  const preview=async()=>{
    const requested=scope;setBusy(true);setMessage('');setSuccess(false);
    try{
      const data=await api.getFresh(`/workflow/attendance?${new URLSearchParams({project_id:projectId,start_date:start,end_date:end})}`);
      if(activeScope.current===requested){setRows(data);setLoadedScope(requested);}
    }catch(e){if(activeScope.current===requested)setMessage(e instanceof Error?e.message:'Unable to load attendance.');}
    finally{setBusy(false);}
  };
  const openCount=(rows||[]).filter(row=>row.check_in_time&&!row.check_out_time).length;
  const resolve=async(row:AttendanceRow,date:string,time:string,reason:string)=>{
    if(busy)return;
    const requested=scope;setBusy(true);setSuccess(false);setMessage('');
    try {
      await api.post(`/workflow/attendance/${row.id}/resolve-checkout`,{check_out_time:`${date}T${time}:00+05:30`,reason});
      if(activeScope.current===requested){setRows(null);setLoadedScope('');setMessage('Check-out saved. Load attendance again to verify the recalculated hours before approving.');setSuccess(true);}
    }catch(e){if(activeScope.current===requested)setMessage(e instanceof Error?e.message:'Unable to correct check-out');}
    finally{setBusy(false);}
  };
  const approve=async()=>{
    if(busy||loadedScope!==scope||!rows?.length||openCount)return;
    const requested=scope;setBusy(true);setMessage('');setSuccess(false);
    try{
      await api.post('/workflow/attendance/review',{project_id:projectId,start_date:start,end_date:end});
      if(activeScope.current===requested){setSuccess(true);setMessage('Attendance approved. You can now generate salary slips.');setRows(null);}
    }catch(e){if(activeScope.current===requested)setMessage(e instanceof Error?e.message:'Attendance approval failed.');}
    finally{setBusy(false);}
  };
  return <View style={{ minWidth: 0, width: '100%' }} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 bg-slate-50 dark:bg-slate-900">
    <Text className="font-bold text-lg text-brand-text dark:text-white mb-1">Verify attendance before payroll</Text>
    <Text className="text-sm text-slate-600 dark:text-slate-300 mb-4">Review working hours, overtime and check-outs for the selected project and pay period.</Text>
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', minWidth: 0 }} className="mb-3"><Button label="Load attendance for review" variant="secondary" loading={busy} disabled={!projectId} onPress={()=>void preview()}/></View>
    {rows&&loadedScope===scope&&<>
      {openCount>0&&<InlineNotice message={`${openCount} attendance record(s) need a check-out before approval.`}/>}
      <ScrollView style={{maxHeight:280}} nestedScrollEnabled>{rows.map(row=><View key={row.id} className="py-3 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row flex-wrap justify-between gap-2"><Text className="font-semibold text-brand-text dark:text-white flex-1">{row.worker_name}</Text><StatusBadge status={row.check_in_time&&!row.check_out_time?'Check-out missing':'Closed'}/></View>
        <Text className="text-sm text-slate-500 mt-1">{row.date} · {row.hours_worked??'Not recorded'} hours · {row.overtime_hours??0} overtime</Text>
        <Text className="text-sm text-slate-600 mt-1">Site: {row.site_name || 'Site address not recorded'}</Text>
        {!!row.checkout_correction_reason&&<Text className="text-sm text-slate-500 mt-1">Check-out correction: {row.checkout_correction_reason}</Text>}
        {!!row.check_in_time&&!row.check_out_time&&<MissingCheckoutForm row={row} busy={busy} onSave={(date,time,reason)=>void resolve(row,date,time,reason)}/>}
      </View>)}</ScrollView>
      {rows.length?<View className="mt-4"><Button label="I have reviewed these records — approve attendance" onPress={()=>void approve()} disabled={busy||openCount>0}/></View>:<Text className="text-sm text-slate-500 my-3">No attendance in this period.</Text>}
    </>}
    <InlineNotice message={message} tone={success?'success':'error'}/>
  </View>;
}
