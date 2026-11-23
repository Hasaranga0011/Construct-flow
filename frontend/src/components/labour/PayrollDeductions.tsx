import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { api } from '@/services/api';
import { Button, FormField, InlineNotice } from '@/components/ui';

export type PayrollDeduction = {worker_id:string;amount:number;reason:string};
export function deductionPayload(value:PayrollDeduction[]) {
  if(value.some(row=>!Number.isFinite(row.amount)||row.amount<0||Math.abs(row.amount*100-Math.round(row.amount*100))>0.00001||(row.amount>0&&!row.reason.trim())))throw new Error('Enter a valid deduction amount with up to two decimal places and a reason.');
  return value.filter(row=>row.amount>0).map(row=>({...row,reason:row.reason.trim()}));
}
export function PayrollDeductions({projectId,start,end,value,onChange}:{projectId:string;start:string;end:string;value:PayrollDeduction[];onChange:(value:PayrollDeduction[])=>void}) {
  const [workers,setWorkers]=useState<{id:string;name:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [amountText,setAmountText]=useState<Record<string,string>>({});
  const scope=`${projectId}:${start}:${end}`,active=useRef(scope);active.current=scope;
  useEffect(()=>{setWorkers([]);setAmountText({});setError('');onChange([]);},[scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const load=async()=>{
    const requested=scope;setBusy(true);setError('');
    try {
      const rows=await api.getFresh(`/workflow/attendance?${new URLSearchParams({project_id:projectId,start_date:start,end_date:end})}`);
      if(active.current===requested)setWorkers(Array.from(new Map<string,{id:string;name:string}>(rows.filter((row:any)=>row.status==='Present').map((row:any)=>{const id=row.worker_profile_id||row.worker_id;return [id,{id,name:row.worker_name||'Worker'}];})).values()));
    }catch(e){if(active.current===requested)setError(e instanceof Error?e.message:'Unable to load workers.');}
    finally{setBusy(false);}
  };
  const update=(id:string,patch:Partial<PayrollDeduction>)=>{
    const current=value.find(row=>row.worker_id===id)||{worker_id:id,amount:0,reason:''};
    onChange([...value.filter(row=>row.worker_id!==id),{...current,...patch}]);
  };
  return <View className="border border-slate-200 rounded-xl p-4 mb-5 min-w-0">
    <Text className="font-bold text-lg text-brand-text mb-2">Deductions before salary generation</Text>
    <Text className="text-sm text-slate-500 mb-3">Optional. Enter each deduction and its reason. Deductions cannot exceed gross pay or change an existing slip.</Text>
    <Button label="Load workers for deductions" variant="secondary" loading={busy} disabled={!projectId||!start||!end} onPress={()=>void load()}/>
    <InlineNotice message={error}/>
    <ScrollView style={{maxHeight:360}} nestedScrollEnabled>{workers.map(worker=>{
      const current=value.find(row=>row.worker_id===worker.id);
      return <View key={worker.id} className="mt-4 border-t border-slate-100 pt-3"><Text className="font-semibold mb-3">{worker.name}</Text>
        <FormField label="Deduction amount (LKR)" keyboardType="decimal-pad" value={amountText[worker.id]||''} onChangeText={text=>{setAmountText(previous=>({...previous,[worker.id]:text}));update(worker.id,{amount:text.trim()?Number(text):0});}}/>
        <FormField label="Deduction reason" value={current?.reason||''} onChangeText={reason=>update(worker.id,{reason})}/>
      </View>;
    })}</ScrollView>
  </View>;
}
