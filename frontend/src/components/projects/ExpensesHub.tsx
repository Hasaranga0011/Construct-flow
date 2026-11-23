import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button, Card, LoadingState, InlineNotice } from '@/components/ui';

export default function ExpensesHub(){
 const {user}=useAuth(),router=useRouter(),portal=usePathname().split('/')[1];
 const [projects,setProjects]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;(async()=>{
  if(!user?.id){setProjects([]);setLoading(false);return;}
  setLoading(true);setError('');setProjects([]);
  try{
   let query=supabase.from('projects').select('id,name');
   if(portal==='pm')query=query.eq('pm_id',user?.id||'');
   else {
    const assignments=await supabase.from('site_manager_sites').select('project_id').eq('site_manager_id',user?.id||'');
    if(assignments.error)throw assignments.error;
    const ids=assignments.data?.map(row=>row.project_id)||[];
    if(!ids.length){if(active)setProjects([]);return;}
    query=query.in('id',ids);
   }
   const response=await query.order('name');if(response.error)throw response.error;
   if(active)setProjects(response.data||[]);
  }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load projects');}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false;};},[portal,user?.id,reload]);
 return <View className="flex-1 bg-brand-light"><TopNav title="Manage Expenses" showAction={false}/><ScrollView contentContainerStyle={{padding:16,gap:16}}>
  <Text className="text-sm text-slate-500">Select an assigned project to review expenses or record a BOQ-linked cost.</Text><InlineNotice message={error}/>
  {loading?<LoadingState/>:error?<Button label="Retry loading projects" onPress={()=>setReload(value=>value+1)}/>:projects.length?projects.map(project=><Card key={project.id}><Text className="font-bold text-lg mb-3">{project.name}</Text><Button label="Manage Expenses" onPress={()=>router.push(`/${portal}/projects/${project.id}/expenses` as any)}/></Card>):<Text>No projects assigned.</Text>}
 </ScrollView></View>;
}
