import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Button, Card, EmptyState, ErrorState, FormField, FormModal, InlineNotice, LoadingState } from '@/components/ui';
import { formatMoney } from '@/utils/format';

type RecordRow={id:string;project_name?:string;description?:string;amount?:number;status?:string;verified?:boolean;verified_by?:string|null;source?:string;evidence_note?:string;imported_by?:string};
export function VerificationQueue({kind,projectId}:{kind:'historical'|'payments';projectId?:string}) {
  const {role,user}=useAuth();
  const permitted=kind==='historical'?role==='admin':role==='admin'||role==='pm';
  const load=useCallback(async()=>{
    if(!permitted||(kind==='payments'&&!projectId))return [];
    const data=await api.getFresh(kind==='historical'?'/ai/historical-projects':`/workflow/payments?project_id=${encodeURIComponent(projectId!)}`) as RecordRow[];
    return data.filter(row=>kind==='historical'?(row.source!=='sample'&&(!row.verified||!row.verified_by)):['Pending','Overdue'].includes(row.status||''));
  },[kind,projectId,permitted]);
  const resource=useAsyncData(load);
  const [selected,setSelected]=useState<RecordRow|null>(null);
  const [evidence,setEvidence]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  if(!permitted)return null;
  const verify=async()=>{
    if(busy)return;
    if(!selected||evidence.trim().length<10){setError('Enter the source reference and completed verification checks (at least 10 characters).');return;}
    setBusy(true);setError('');
    try{
      await api.post(kind==='historical'?`/ai/historical-projects/${selected.id}/verify`:`/workflow/payments/${selected.id}/verify`,kind==='historical'?{evidence_note:evidence.trim()}:{amount:selected.amount,evidence:evidence.trim()});
      setSelected(null);setEvidence('');setMessage('Verification recorded.');resource.retry();
    }catch(e){setError(e instanceof Error?e.message:'Unable to record verification.');}
    finally{setBusy(false);}
  };
  return <Card>
    <View className="flex-row flex-wrap gap-3 justify-between items-center mb-4"><View className="flex-1 min-w-0"><Text className="font-bold text-xl text-brand-text dark:text-white">{kind==='historical'?'Historical BOQ evidence review':'Payment verification'}</Text><Text className="text-sm text-slate-500 mt-2">{kind==='historical'?'A different administrator checks the source evidence before this data can be used for model training.':'Check the full scheduled amount against bank evidence before marking a payment paid.'}</Text></View><Button label="Refresh pending reviews" variant="ghost" onPress={resource.retry} disabled={resource.loading}/></View>
    <InlineNotice message={message} tone="success"/>{!selected&&<InlineNotice message={error}/>}
    {resource.loading&&!resource.data?<LoadingState/>:resource.error?<ErrorState message={resource.error} onRetry={resource.retry}/>:!resource.data?.length?<EmptyState title="No pending reviews" message="New records awaiting evidence checks will appear here." icon="checkmark-done-outline"/>:resource.data.map(row=>{
      const own=kind==='historical'&&!!row.imported_by&&[user?.id,user?.email].includes(row.imported_by);
      return <View key={row.id} className="py-4 border-b border-slate-100 dark:border-slate-800"><Text className="font-semibold text-brand-text dark:text-white">{row.project_name||row.description}</Text>{row.amount!=null&&<Text className="text-sm text-slate-600 mt-1">{formatMoney(row.amount)}</Text>}<View className="mt-3 self-start">{own?<Text className="text-sm text-slate-500">Awaiting a different administrator’s review</Text>:<Button label="Review evidence" variant="secondary" size="compact" onPress={()=>{setSelected(row);setEvidence(row.evidence_note||'');setError('');}}/>}</View></View>;
    })}
    <FormModal visible={!!selected} title={kind==='historical'?'Review source evidence':'Verify payment evidence'} onClose={()=>setSelected(null)} onSubmit={()=>void verify()} submitLabel="Confirm verification" busy={busy}>
      <InlineNotice message={error}/><Text className="font-semibold text-brand-text dark:text-white mb-4">{selected?.project_name||selected?.description}</Text><FormField label="Verification evidence" value={evidence} onChangeText={setEvidence} multiline style={{minHeight:120}} maxLength={2000} placeholder="Document reference, reviewer checks or bank transaction reference"/>
    </FormModal>
  </Card>;
}
