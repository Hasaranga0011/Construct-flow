import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { api } from '@/services/api';
import { Button, Card, EmptyState, FormField, FormModal, InlineNotice, LoadingState, Select } from '@/components/ui';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DateField } from '@/components/common/DateField';
import { validReportDate } from '@/utils/siteWorkflow';

type RequestRow = { id: string; project_id: string; item_name: string; quantity: number; unit: string; status: string; boq_rate?: number | null };
type Supplier = { id: string; full_name: string; project_id: string };
type ReviewData = { requests: RequestRow[]; suppliers: Supplier[]; projects: { id: string; name: string }[] };
export function MaterialRequestReview({projectId = '',onChanged}: {projectId?: string;onChanged?:()=>void}) {
  const [data,setData] = useState<ReviewData>({requests:[],suppliers:[],projects:[]});
  const [offset,setOffset] = useState(0);
  const [selected,setSelected] = useState<RequestRow|null>(null);
  const [supplier,setSupplier] = useState('');
  const [price,setPrice] = useState('');
  const [date,setDate] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async()=>{
    const version=++requestVersion.current;
    setLoading(true);setError('');
    try {
      const result=await api.getFresh(`/workflow/material-requests?offset=${offset}${projectId ? '&project_id='+encodeURIComponent(projectId) : ''}`);
      if(version===requestVersion.current)setData(result);
    }catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Could not load material requests.');}
    finally{if(version===requestVersion.current)setLoading(false);}
  },[offset,projectId]);
  useEffect(()=>{const generation=requestVersion;void load();return()=>{generation.current++;};},[load]);
  useEffect(()=>{setOffset(0);setSelected(null);},[projectId]);
  const review=async(approve:boolean)=>{
    if(!selected||busy)return;
    if(approve&&(!supplier||!price.trim()||!Number.isFinite(Number(price))||Number(price)<0||!validReportDate(date))){
      setError('Choose an assigned supplier and enter a unit price and valid delivery date.');return;
    }
    setBusy(true);setError('');setMessage('');
    try{
      await api.post(`/workflow/material-requests/${selected.id}/review`,{approve,supplier_id:approve?supplier:null,unit_price:approve?Number(price):0,expected_date:approve?date:null});
      setSelected(null);setMessage(approve?'Request approved and purchase order created.':'Request rejected.');
      await load();onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:'Unable to review this request.');}
    finally{setBusy(false);}
  };
  return <Card>
    <View className="flex-row flex-wrap gap-3 items-center justify-between mb-3"><View className="flex-1 min-w-0"><Text className="text-xl font-bold text-brand-text dark:text-white">Material requests</Text><Text className="text-sm text-slate-500 mt-1">Review site needs and create a supplier order in one step.</Text></View><Button label="Refresh" variant="ghost" size="compact" onPress={()=>void load()} disabled={loading||busy}/></View>
    <InlineNotice message={message} tone="success"/>{!selected&&<InlineNotice message={error}/>}
    {loading&&!data.requests.length?<LoadingState message="Loading requests…"/>:!data.requests.length&&!error?<EmptyState title="No material requests" message="Requests from your assigned sites will appear here." icon="cube-outline"/>:data.requests.map(row=><View key={row.id} className="border-b border-slate-100 dark:border-slate-800 py-4">
      <View className="flex-row flex-wrap items-start justify-between gap-3"><View className="flex-1 min-w-0"><Text className="font-semibold text-brand-text dark:text-white">{row.item_name}</Text><Text className="text-sm text-slate-500 mt-1">{row.quantity} {row.unit} · {data.projects.find(project=>project.id===row.project_id)?.name||'Project'}</Text></View><StatusBadge status={row.status}/></View>
      {row.status==='Pending Approval'&&<View className="mt-3 self-start"><Button label="Review request" variant="secondary" size="compact" disabled={busy} onPress={()=>{setSelected(row);setSupplier('');setPrice(row.boq_rate != null ? String(row.boq_rate) : '');setDate('');setError('');}}/></View>}
    </View>)}
    {(offset>0||data.requests.length>=100)&&<View className="flex-row justify-between gap-3 mt-3"><Button label="Previous" variant="ghost" disabled={offset===0||busy||loading} onPress={()=>setOffset(Math.max(0,offset-100))}/><Button label="Next" variant="ghost" disabled={data.requests.length<100||busy||loading} onPress={()=>setOffset(offset+100)}/></View>}
    <FormModal visible={!!selected} title={`Review ${selected?.item_name||'material request'}`} onClose={()=>setSelected(null)} onSubmit={()=>void review(true)} submitLabel="Approve and create order" busy={busy}>
      <InlineNotice message={error}/>
      <Text className="text-sm text-slate-600 dark:text-slate-300 mb-4">{selected?.quantity} {selected?.unit} requested for {data.projects.find(project=>project.id===selected?.project_id)?.name||'this project'}.</Text>
      <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Assigned supplier</Text>
      <View className="mb-4"><Select value={supplier} onValueChange={setSupplier} placeholder="Choose an assigned supplier" options={data.suppliers.filter(item=>item.project_id===selected?.project_id).map(item=>({value:item.id,label:item.full_name}))}/></View>
      {selected&&!data.suppliers.some(item=>item.project_id===selected.project_id)&&<InlineNotice tone="info" message="Assign an approved supplier to this project before approving its material request."/>}
      <FormField label="Unit price in LKR" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" helperText="The unit price is multiplied by the requested quantity."/>
      <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Expected delivery date</Text><DateField label="Expected delivery date" value={date} onChange={setDate}/>
      <View className="mt-5 self-start"><Button label="Reject request" variant="danger" disabled={busy} onPress={()=>void review(false)}/></View>
    </FormModal>
  </Card>;
}
