import { getApiUrl } from '../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { sendSystemNotification } from '../../utils/notifications';
import { notify, confirmAction } from '@/utils/notify';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '@/components/ui';

const COLUMNS = { date: 112, cost: 120, status: 144, actions: 300 };
const EstimateRow = ({ id, projectName, date, cost, status, onApprove, onReject, compact }: {
  id:string; projectName:string; date:string; cost:string; status:string;
  onApprove:(id:string)=>void; onReject:(id:string)=>void; compact:boolean;
}) => {
  let title=projectName;
  let inputs:any=null;
  try { const parsed=JSON.parse(projectName); if(parsed.title){title=parsed.title;inputs=parsed.inputs;} } catch {}
  const context=inputs ? [inputs.type, inputs.sq_ft != null ? String(inputs.sq_ft)+' sq ft' : '', inputs.floors != null ? String(inputs.floors)+' floors' : '', inputs.site, inputs.timeline ? inputs.timeline+' schedule' : ''].filter(Boolean).join(' · ') : '';
  const [downloading,setDownloading]=useState(false);
  const download=async()=>{
    if(downloading)return;
    setDownloading(true);
    try {
      const { data:sessionData }=await supabase.auth.getSession();
      const token=sessionData.session?.access_token;
      if(!token)throw new Error('Please log in to view this PDF.');
      const response=await fetch(getApiUrl()+'/documents/estimation/'+id+'/pdf',{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)throw new Error('The estimate PDF could not be downloaded.');
      if(Platform.OS==='web'){
        const url=URL.createObjectURL(await response.blob());
        const link=document.createElement('a');link.href=url;link.download='Estimate_'+id.substring(0,8)+'.pdf';
        document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      } else {
        const {File,Paths}=await import('expo-file-system');const Sharing=await import('expo-sharing');
        if(!await Sharing.isAvailableAsync())throw new Error('File sharing is unavailable.');
        const file=new File(Paths.cache,'Estimate_'+id.substring(0,8)+'.pdf');file.write(new Uint8Array(await response.arrayBuffer()));
        await Sharing.shareAsync(file.uri,{mimeType:'application/pdf'});
      }
    } catch(error){notify('Estimate PDF',error instanceof Error?error.message:'The PDF could not be downloaded.');}
    finally{setDownloading(false);}
  };
  const actions=<View className="flex-row flex-wrap gap-2" style={compact?undefined:{width:COLUMNS.actions,flexShrink:0,justifyContent:'flex-end'}}>
    {status==='Pending'&&<>
      <Button label="Approve" size="compact" variant="success" onPress={()=>onApprove(id)} />
      <Button label="Reject" size="compact" variant="secondary" onPress={()=>onReject(id)} />
    </>}
    <Button label="View PDF" size="compact" variant="ghost" loading={downloading} onPress={download} />
  </View>;
  return <View testID="estimate-row" className="py-4 border-b border-slate-100 dark:border-slate-800">
    <View className={compact?"gap-3":"flex-row items-center"}>
      <View className="flex-1 min-w-0" style={compact?undefined:{paddingRight:16}}>
        <Text className="text-sm font-bold text-slate-900 dark:text-white">{title}</Text>
        {!!context&&<Text className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{context}</Text>}
      </View>
      <View className={compact?"flex-row flex-wrap items-center gap-x-4 gap-y-2":"flex-row items-center shrink-0"}>
        <Text numberOfLines={1} className="text-xs text-slate-500 dark:text-slate-400" style={compact?undefined:{width:COLUMNS.date,flexShrink:0}}>{date}</Text>
        <Text numberOfLines={1} className="text-sm font-bold text-slate-900 dark:text-white" style={compact?undefined:{width:COLUMNS.cost,flexShrink:0}}>{cost}</Text>
        <View style={compact?undefined:{width:COLUMNS.status,flexShrink:0,paddingRight:12}}><StatusBadge status={status}/></View>
      </View>
      {actions}
    </View>
  </View>;
};

export const RecentEstimates = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [estimations, setEstimations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadEstimates = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('estimations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        if (isMounted) setEstimations(data || []);
      } catch (error) {
        console.warn('Failed to load estimates:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadEstimates();

    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleApprove = async (id: string) => {
    try {
      setLoading(true);

      const estToApprove = estimations.find(e => e.id === id);
      if (!estToApprove) return;

      await api.patch('/estimations/' + id + '/review', { status: 'Approved' });

      setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Approved' } : e));

      let title = estToApprove.project_name;
      try { title = JSON.parse(estToApprove.project_name).title || title; } catch {}

      await sendSystemNotification(
        'Estimate Approved',
        `The estimate for ${title} was approved. Project creation and assignments remain a separate step.`,
        'Admin'
      );

      if (Platform.OS === 'web') {
        window.alert('Estimate Approved successfully.');
      } else {
        Alert.alert('Success', 'Estimate Approved successfully.');
      }
    } catch (err: any) {
      console.warn('Failed to approve', err);
      if (Platform.OS === 'web') {
        window.alert(`Error: ${err.message || 'Failed to approve estimate.'}`);
      } else {
        Alert.alert('Error', err.message || 'Failed to approve estimate.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    const estToReject = estimations.find(e => e.id === id);
    if (!estToReject) return;

    let title = estToReject.project_name;
    try { title = JSON.parse(estToReject.project_name).title || title; } catch {}

    const confirmReject = async () => {
      setLoading(true);
      try {
        await api.patch('/estimations/' + id + '/review', { status: 'Rejected' });
        setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Rejected' } : e));
        await sendSystemNotification(
          'Estimate Rejected',
          `The estimate for ${title} was rejected.`,
          'Admin'
        );
        notify('Success', 'Estimate Rejected successfully.');
      } catch (err: any) {
        console.warn('Failed to reject', err);
        notify('Error', err.message || 'Failed to reject estimate.');
      } finally {
        setLoading(false);
      }
    };

    confirmAction(
      'Reject Estimate',
      `Are you sure you want to reject the estimate for ${title}?`,
      true
    ).then((confirmed) => {
      if (confirmed) confirmReject();
    });
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  const [contentWidth,setContentWidth]=useState(0);
  const compact=contentWidth<900;
  const formatDate=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'Not recorded':date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  };

  return <View onLayout={event=>setContentWidth(Math.max(0,event.nativeEvent.layout.width-48))} className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-700 shadow-sm min-w-0">
    <View className="mb-4"><Text accessibilityRole="header" className="text-lg font-bold text-brand-text dark:text-white">Recent Estimates</Text><Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">Review the latest estimates and download their details.</Text></View>
    {!compact&&<View className="flex-row items-center py-3 border-b border-slate-200 dark:border-slate-700">
      <Text className="flex-1 min-w-0 text-xs font-semibold text-slate-500">Project</Text>
      <Text className="text-xs font-semibold text-slate-500" style={{width:COLUMNS.date,flexShrink:0}}>Date</Text>
      <Text className="text-xs font-semibold text-slate-500" style={{width:COLUMNS.cost,flexShrink:0}}>Estimated cost</Text>
      <Text className="text-xs font-semibold text-slate-500" style={{width:COLUMNS.status,flexShrink:0}}>Status</Text>
      <Text className="text-xs font-semibold text-slate-500 text-right" style={{width:COLUMNS.actions,flexShrink:0}}>Actions</Text>
    </View>}
    {loading?<View className="py-10 items-center"><ActivityIndicator color="#c2410c"/></View>:!estimations.length?<Text className="py-10 text-center text-slate-500">No estimations generated yet.</Text>:estimations.map(est=><EstimateRow key={est.id} id={est.id} projectName={est.project_name||'Untitled estimate'} date={formatDate(est.created_at)} cost={formatCurrency(est.estimated_cost)} status={est.status||'Pending'} onApprove={handleApprove} onReject={handleReject} compact={compact}/>)}
  </View>;
};
