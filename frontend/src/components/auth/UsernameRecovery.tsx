import React, { useEffect, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { api } from '@/services/api';
import { Button, FormField, InlineNotice } from '@/components/ui';
export function UsernameRecovery({userId}:{userId:string}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;api.getFresh(`/admin/users/${userId}/username`).then(data=>{if(active)setUsername(data.username||'');}).catch(()=>{});return()=>{active=false;};},[userId]);
 if(!username)return null;
 const reset=async()=>{setBusy(true);setMessage('');try{const result=await api.post(`/admin/users/${userId}/username-password`,{password,identity_confirmed:confirmed});setPassword('');setConfirmed(false);setMessage(result.message);}catch(e){setMessage(e instanceof Error?e.message:'Recovery failed');}finally{setBusy(false);}};
 return <View className="border border-slate-200 rounded-xl p-4 mb-5"><Text className="font-bold text-lg mb-2">Username account: {username}</Text><Text className="text-sm text-slate-500 mb-4">This account has no email inbox. Verify the owner using their contact details before resetting access.</Text>
  <View className="flex-row items-center gap-3 mb-3"><Switch accessibilityLabel="Account owner identity verified" value={confirmed} onValueChange={setConfirmed}/><Text className="flex-1">I verified the account owner</Text></View>
  <FormField label="New password (at least 12 characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="off"/>
  <Button label="Reset username account password" disabled={!confirmed||password.length<12} loading={busy} onPress={()=>void reset()}/><InlineNotice message={message}/>
 </View>;
}
