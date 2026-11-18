/* Controlled QA identity only. Generates/redeems a recovery link, never changes a password. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const dotenv=require('dotenv');
const root=path.resolve(__dirname,'../..');
function clean(error){return String(error?.message||error).replace(/https?:\/\/[^\s]+/g,'[redacted URL]').slice(0,500);}
(async()=>{
 const config=dotenv.parse(fs.readFileSync(path.join(root,'backend/.env'))),state=JSON.parse(fs.readFileSync(path.join(root,'.validation-db/live-ui-state.json'),'utf8'));
 const qa=state.accounts.worker,base=config.SUPABASE_URL.replace(/\/$/,''),key=config.SUPABASE_SERVICE_ROLE_KEY;
 const response=await fetch(base+'/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',email:qa.email,redirect_to:'http://localhost:8082/reset-password'})});
 assert(response.ok,'QA link generation failed: '+response.status);const generated=await response.json();
 const browser=await chromium.launch({channel:'chrome',headless:true});const result={errors:[],failedRequests:[]};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  if(process.env.RECOVERY_STALE_PORTAL)await context.addInitScript(portal=>localStorage.setItem('login_portal',portal),process.env.RECOVERY_STALE_PORTAL);
  page.on('pageerror',error=>result.errors.push(clean(error)));
  page.on('response',response=>{if(response.status()>=400&&/\/auth\/v1\/|\/rest\/v1\//.test(response.url()))result.failedRequests.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.goto(generated.action_link,{waitUntil:'domcontentloaded',timeout:120000});
  const field=page.getByPlaceholder('At least 8 characters');await field.waitFor({timeout:90000});
  await page.waitForFunction(()=>{const field=document.querySelector('input[placeholder="At least 8 characters"]');return field&&!field.readOnly;},null,{timeout:30000}).catch(()=>{});
  result.pathname=new URL(page.url()).pathname;result.origin=new URL(page.url()).origin;
  result.passwordEditable=await field.isEditable();
  result.body=(await page.locator('body').innerText()).slice(-1600);
  result.session=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'));let session;try{session=JSON.parse(localStorage.getItem(key)||'null');}catch{}return{stored:!!session,hasAccessToken:!!session?.access_token,hashParameterNames:[...new URLSearchParams(location.hash.slice(1)).keys()]};});
  fs.writeFileSync(path.join(root,'.validation-db/live-recovery-browser-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(clean(error));process.exitCode=1;});
