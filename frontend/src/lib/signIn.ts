import { supabase } from './supabase';
import { getApiUrl } from './apiUrl';

export async function signInWithIdentifier(identifier:string,password:string) {
  const value=identifier.trim().toLowerCase();
  if(value.includes('@'))return supabase.auth.signInWithPassword({email:value,password});
  try {
    const response=await fetch(getApiUrl()+'/auth/username-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:value,password})});
    if(!response.ok)return {error:new Error(response.status===429?'Too many attempts. Try again later.':'Invalid username or password')};
    const session=await response.json();
    return supabase.auth.setSession(session);
  }catch{return {error:new Error('Sign-in service is unavailable. Try again later.')};}
}
