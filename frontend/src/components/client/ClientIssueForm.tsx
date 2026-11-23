import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Button, Card, EmptyState, ErrorState, FormField, InlineNotice, LoadingState, Select } from '@/components/ui';
import { StatusBadge } from '@/components/common/StatusBadge';

export function ClientIssueForm() {
  const {user}=useAuth();
  const userId=user?.id;
  const [projectId,setProjectId]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [category,setCategory]=useState('Quality');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const load=useCallback(async(signal:AbortSignal)=>{
    if(!userId)return {projects:[],sites:[],issues:[]};
    const projectResult=await supabase.from('projects').select('id,name').eq('client_id',userId).abortSignal(signal);
    if(projectResult.error)throw projectResult.error;
    const projects=projectResult.data||[];
    const ids=projects.map(project=>project.id).filter((id):id is string=>!!id);
    if(!ids.length)return {projects,sites:[],issues:[]};
    const siteResult=await supabase.from('sites').select('id,project_id').in('project_id',ids).abortSignal(signal);
    if(siteResult.error)throw siteResult.error;
    const sites=siteResult.data||[];
    const siteIds=sites.map(site=>site.id).filter((id):id is string=>!!id);
    const issueResult=siteIds.length?await supabase.from('issues').select('id,site_id,title,description,severity,status,created_at').in('site_id',siteIds).eq('reported_by',userId).order('created_at',{ascending:false}).abortSignal(signal):{data:[],error:null};
    if(issueResult.error)throw issueResult.error;
    return {projects,sites,issues:issueResult.data||[]};
  },[userId]);
  const resource=useAsyncData(load);
  const projects=resource.data?.projects||[];
  const active=projects.some(project=>project.id===projectId)?projectId:projects[0]?.id||'';
  const submit=async()=>{
    if(busy)return;
    const site=resource.data?.sites.find(row=>row.project_id===active);
    if(!active||!site||!title.trim()||!description.trim()){setError('Choose an active project site and complete the issue title and description.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const result=await supabase.from('issues').insert({site_id:site.id,reported_by:userId,title:title.trim(),description:`[${category}] ${description.trim()}`,severity:category==='Safety'?'High':'Medium',status:'Open'});
      if(result.error)throw result.error;
      setTitle('');setDescription('');setMessage('Your concern has been added to the project’s issue register.');resource.retry();
    }catch(e){setError(e instanceof Error?e.message:'Unable to submit this issue.');}
    finally{setBusy(false);}
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:48}}><View className="w-full max-w-5xl mx-auto">
    <InlineNotice message={message} tone="success"/><InlineNotice message={error}/>
    {resource.loading&&!resource.data?<LoadingState/>:resource.error?<ErrorState message={resource.error} onRetry={resource.retry}/>:!projects.length?<EmptyState title="No project assigned" message="Your project team can help once a project has been assigned to you."/>:<>
      <Card><Text className="text-xl font-bold text-brand-text dark:text-white mb-2">Raise a project concern</Text><Text className="text-sm text-slate-500 mb-5">Track concerns and their resolution with your project team.</Text>
        <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Project</Text><View className="mb-4"><Select value={active} onValueChange={setProjectId} options={projects.map(project=>({value:project.id!,label:project.name||'Project'}))}/></View>
        <FormField label="Issue title" value={title} onChangeText={setTitle} placeholder="Concern about recent progress" maxLength={200}/>
        <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Category</Text><View className="mb-4"><Select value={category} onValueChange={setCategory} options={['Quality','Delay','Safety','Payment','Other'].map(value=>({value,label:value}))}/></View>
        <FormField label="Issue description" value={description} onChangeText={setDescription} placeholder="Describe the issue in detail" multiline style={{minHeight:128}} maxLength={5000}/>
        <Button label="Submit issue" onPress={()=>void submit()} loading={busy}/>
      </Card>
      <Card><Text className="text-xl font-bold text-brand-text dark:text-white mb-4">Your submitted concerns</Text>
        {!resource.data?.issues.length?<EmptyState title="No concerns submitted" message="Your submitted concerns and their latest status appear here." icon="chatbubble-ellipses-outline"/>:resource.data.issues.map(issue=><View key={issue.id} className="py-4 border-b border-slate-100 dark:border-slate-800"><View className="flex-row flex-wrap justify-between gap-3"><Text className="font-semibold text-brand-text dark:text-white flex-1">{issue.title}</Text><StatusBadge status={issue.status}/></View><Text className="text-sm text-slate-500 mt-2">{issue.created_at?.slice(0,10)||'Date not recorded'}</Text></View>)}
      </Card>
    </>}
  </View></ScrollView>;
}
