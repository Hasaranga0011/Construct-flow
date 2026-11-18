import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { api } from '@/services/api';
import { Button, InlineNotice } from '@/components/ui';
import { StatusBadge } from '@/components/common/StatusBadge';

type AttendanceRow = { id:string;worker_name:string;date:string;hours_worked:number|null;overtime_hours:number|null;check_in_time:string|null;check_out_time:string|null };
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
  const approve=async()=>{
    if(busy||loadedScope!==scope||!rows?.length||openCount)return;
    const requested=scope;setBusy(true);setMessage('');setSuccess(false);
    try{
      await api.post('/workflow/attendance/review',{project_id:projectId,start_date:start,end_date:end});
      if(activeScope.current===requested){setSuccess(true);setMessage('Attendance approved. You can now generate salary slips.');setRows(null);}
    }catch(e){if(activeScope.current===requested)setMessage(e instanceof Error?e.message:'Attendance approval failed.');}
    finally{setBusy(false);}
  };
  return <View className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 bg-slate-50 dark:bg-slate-900">
    <Text className="font-bold text-lg text-brand-text dark:text-white mb-1">Verify attendance before payroll</Text>
    <Text className="text-sm text-slate-600 dark:text-slate-300 mb-4">Review working hours, overtime and check-outs for the selected project and pay period.</Text>
    <View className="self-start mb-3"><Button label="Load attendance for review" variant="secondary" loading={busy} disabled={!projectId} onPress={()=>void preview()}/></View>
    {rows&&loadedScope===scope&&<>
      {openCount>0&&<InlineNotice message={`${openCount} attendance record(s) need a check-out before approval.`}/>}
      <ScrollView style={{maxHeight:280}} nestedScrollEnabled>{rows.map(row=><View key={row.id} className="py-3 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row flex-wrap justify-between gap-2"><Text className="font-semibold text-brand-text dark:text-white flex-1">{row.worker_name}</Text><StatusBadge status={row.check_in_time&&!row.check_out_time?'Check-out missing':'Closed'}/></View>
        <Text className="text-sm text-slate-500 mt-1">{row.date} · {row.hours_worked??'Not recorded'} hours · {row.overtime_hours??0} overtime</Text>
      </View>)}</ScrollView>
      {rows.length?<View className="mt-4"><Button label="I have reviewed these records — approve attendance" onPress={()=>void approve()} disabled={busy||openCount>0}/></View>:<Text className="text-sm text-slate-500 my-3">No attendance in this period.</Text>}
    </>}
    <InlineNotice message={message} tone={success?'success':'error'}/>
  </View>;
}
