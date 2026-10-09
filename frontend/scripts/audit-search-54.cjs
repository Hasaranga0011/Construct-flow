const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
process.chdir(path.resolve(__dirname,'../..'));
const env=fs.readFileSync('frontend/.env','utf8'),base=env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1],key=`sb-${new URL(base).hostname.split('.')[0]}-auth-token`;
const uid='00000000-0000-0000-0000-000000000001',workerId='00000000-0000-0000-0000-000000000002';
const results=[];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 for(const role of ['admin','supplier','pm']){
  const page=await browser.newPage({viewport:{width:Number(process.env.SEARCH_WIDTH||1440),height:1000}});page.setDefaultTimeout(20000);
  const tables=require('./responsive-fixtures.cjs')(role);
  tables.profiles.push({id:workerId,full_name:'Sam Worker',email:'sam@example.invalid',role:'worker',is_approved:true});
  tables.profiles.push({id:'client-id',full_name:'Sam Client',email:'client@example.invalid',role:'client',is_approved:true});
  tables.profiles.push({id:'supplier-id',full_name:'Sam Supplier',email:'supplier@example.invalid',role:'supplier',is_approved:true});
  for(let i=3;i<=7;i++)tables.profiles.push({id:`worker-${i}`,full_name:`Crew Member ${i}`,role:'worker',email:`crew${i}@example.invalid`,is_approved:true});
  tables.workers.push({id:'roster-worker',user_id:workerId,skill_type:'Mason'});
  tables.site_workers.push({id:'roster-assignment',worker_id:'roster-worker',project_id:uid});
  tables.profiles.forEach(p=>{p.created_at='2026-10-01T08:00:00Z';});
  tables.materials[0].last_updated='2026-10-01T08:00:00Z';
  tables.materials[0].category='Cement';tables.materials[0].project=tables.projects[0];
  tables.purchase_orders[0].items='Cement';tables.purchase_orders[0].total_price=250000;
  const user={id:uid,email:'test@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:tables.profiles[0],app_metadata:{provider:'email'}};
  const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp,role:'authenticated'})).toString('base64url')+'.test';
  await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:{access_token:token,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user}});
  await page.route('**/auth/v1/**',r=>r.fulfill({json:user}));
  let calls=0,searchCalls=0,remoteMode='normal';const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.route('**/rest/v1/**',async r=>{
   calls++; const url=new URL(r.request().url()),name=url.pathname.split('/').pop();
   if(name==='projects' && url.searchParams.get('limit')==='8'){
    searchCalls++;
    if(remoteMode==='stale'){
     const old=url.search.includes('staleFirst');
     await new Promise(resolve=>setTimeout(resolve,old?1400:100));
     return r.fulfill({json:[{id:uid,name:old?'Old response':'Latest response',location:'Test site'}]}).catch(()=>{});
    }
    if(remoteMode==='error')return r.fulfill({status:500,json:{message:'Search unavailable'}});
    if(remoteMode==='timeout')return; // Request remains pending until the component aborts.
   }
   let rows=tables[name]||[];
   for(const [k,v] of url.searchParams)if(v.startsWith('eq.'))rows=rows.filter(x=>String(x[k])===v.slice(3));
   for(const [k,v] of url.searchParams)if(v.startsWith('in.('))rows=rows.filter(x=>v.slice(4,-1).split(',').includes(String(x[k])));
   return r.fulfill({json:r.request().headers().accept?.includes('object+json')?(rows[0]||null):rows,headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
  });
  await page.route('**/api/**',r=>r.fulfill({json:[]}));
  const channels=new Map();
  await page.routeWebSocket('**/realtime/**',ws=>{
   ws.onMessage(raw=>{
    const parsed=JSON.parse(raw.toString()),array=Array.isArray(parsed);
    const msg=array?{join_ref:parsed[0],ref:parsed[1],topic:parsed[2],event:parsed[3],payload:parsed[4]}:parsed;
    const send=(event,payload,ref=msg.ref)=>ws.send(JSON.stringify(array?[msg.join_ref,ref,msg.topic,event,payload]:{topic:msg.topic,event,payload,ref}));
    if(msg.event==='phx_join'){
     const bindings=(msg.payload.config?.postgres_changes||[]).map((x,i)=>({...x,id:i+1}));
     channels.set(msg.topic,{bindings,send});send('phx_reply',{status:'ok',response:{postgres_changes:bindings}});
    }else if(msg.event==='phx_leave'){channels.delete(msg.topic);send('phx_reply',{status:'ok',response:{}});}
    else if(msg.event==='heartbeat')send('phx_reply',{status:'ok',response:{}});
   });
  });
  const cases=role==='admin'?[
   ['/admin/client','Search clients...','Sam Client','profiles'],
   ['/admin/labour','Search workers...','Sam Worker','profiles'],
   ['/admin/users','Search users...','Sam Worker','profiles'],
   ['/admin/projects','Search projects...','Riverside','projects'],
   ['/admin/materials','Search materials...','Cement','materials'],
   ['/admin/materials/stock','Search material or site...','Cement','materials'],
   ['/admin/suppliers','Search by name or email...','Sam Supplier','profiles'],
  ]:role==='pm'?[['/pm/projects','Search projects...','Riverside','projects']]:[
   ['/supplier/dashboard','Search your orders by PO, material or project...','PO-2026','purchase_orders'],
   ['/supplier/deliveries','Search PO, material, project...','PO-2026','purchase_orders'],
   ['/supplier/orders/history','Search your orders by PO, material or project...','PO-2026','purchase_orders'],
  ];
  for(const [route,placeholder,match,table] of cases){
   await page.goto((process.env.RESPONSIVE_URL||'http://localhost:8081')+route,{waitUntil:'domcontentloaded',timeout:180000});
   const input=page.getByPlaceholder(placeholder,{exact:true});await input.waitFor();await page.waitForTimeout(1000);
   const before=await input.boundingBox(),count=calls;
   const neighborTop=()=>page.getByTestId('search-field').evaluate(e=>e.parentElement.nextElementSibling?.getBoundingClientRect().top);
   const neighborBefore=await neighborTop();
   await input.pressSequentially('sgs',{delay:350});
   await page.waitForTimeout(400);assert.equal(await input.inputValue(),'sgs');
   const dropdown=page.getByTestId('search-suggestions');await dropdown.waitFor();
   assert((await dropdown.innerText()).includes('sgs'));assert(!(await dropdown.innerText()).includes('Searching...'));
   assert(await input.evaluate(e=>e===document.activeElement));
   assert.deepEqual(await input.boundingBox(),before,'input must not move');
   assert.equal(await neighborTop(),neighborBefore,'adjacent content must not shift');
   assert.equal(await dropdown.evaluate(e=>getComputedStyle(e).position),'absolute');
   await input.fill('sgsrapid');await page.waitForTimeout(500);assert.equal(await input.inputValue(),'sgsrapid');
   assert.equal(calls,count,'typing must not refetch loaded rows');
   let delivered=0;
   for(const {bindings,send} of channels.values()){
    const ids=bindings.filter(b=>b.table===table && b.event!=='DELETE').map(b=>b.id);
    if(ids.length){send('postgres_changes',{ids,data:{schema:'public',table,type:'UPDATE',commit_timestamp:new Date().toISOString(),columns:[],record:{id:uid},old_record:{}}},null);delivered++;}
   }
   assert(delivered>0,'must deliver a subscribed realtime update on '+route);
   await page.waitForTimeout(1000);
   assert(calls>count,'realtime event must actually cause refetch');
   assert.equal(await input.inputValue(),'sgsrapid');assert(await dropdown.isVisible());assert(await input.evaluate(e=>e===document.activeElement));
   await page.getByLabel('Clear search',{exact:true}).click();assert.equal(await input.inputValue(),'');
   await input.fill(match);await dropdown.getByRole('button').first().waitFor();
   if(route==='/admin/labour'){assert((await dropdown.innerText()).includes('Mason'));assert((await dropdown.innerText()).includes('Riverside'));}
   const label=await dropdown.getByRole('button').first().getAttribute('aria-label');
   const oldUrl=page.url();await dropdown.getByRole('button').first().click();await page.waitForTimeout(450);
   if(route==='/admin/materials'||route==='/admin/materials/stock')assert((await input.inputValue()).length>0,'filter selection preserves chosen text');
   else assert.notEqual(page.url(),oldUrl,'first click must navigate: '+label);
   assert.equal(errors.length,0,errors.join('\n'));
   results.push({route,pass:true,checks:'slow/fast typing, zero keystroke requests, realtime refetch preserves focus/query/dropdown, clear, first-click selection, input geometry'});
   console.log('PASS',route);
  }
  if(role==='admin'){
   await page.goto((process.env.RESPONSIVE_URL||'http://localhost:8081')+'/admin/dashboard',{waitUntil:'domcontentloaded',timeout:180000});
   const input=page.getByPlaceholder('Search projects...',{exact:true});await input.waitFor();
   remoteMode='stale';await input.fill('staleFirst');await page.waitForTimeout(350);
   const started=searchCalls;await page.setViewportSize({width:1000,height:1000});await page.waitForTimeout(150);
   assert.equal(searchCalls,started,'inline config identity must not restart a pending search');
   await input.fill('staleSecond');await page.getByLabel('Select Latest response',{exact:true}).waitFor();
   await page.waitForTimeout(1400);assert.equal(await input.inputValue(),'staleSecond');assert.equal(await page.getByLabel('Select Old response',{exact:true}).count(),0);
   remoteMode='error';await input.fill('Riverside');await page.getByLabel('Retry search').waitFor();assert.equal(await input.inputValue(),'Riverside');
   remoteMode='normal';await page.getByLabel('Retry search').click();await page.getByTestId('search-suggestions').getByRole('button').first().waitFor();
   await input.fill('');remoteMode='timeout';await input.fill('timeout');await page.getByText('Search timed out. Please retry.',{exact:true}).waitFor({timeout:12000});
   assert.equal(await input.inputValue(),'timeout');assert.equal(await page.getByText('Searching...',{exact:true}).count(),0);
   await input.blur();await page.waitForTimeout(250);assert.equal(await input.inputValue(),'timeout');
   results.push({route:'/admin/dashboard',pass:true,checks:'stale response cancellation, stable inline config through parent resize, remote error, retry, 8-second timeout, blur preserves text'});console.log('PASS remote lifecycle');
  }
  await page.close();
 }
 await browser.close();fs.writeFileSync(`.validation-web/search-54-${process.env.SEARCH_WIDTH||1440}-results.json`,JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
