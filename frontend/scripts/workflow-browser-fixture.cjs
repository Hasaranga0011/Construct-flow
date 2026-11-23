const fixtures=require('./responsive-fixtures.cjs');
const uid='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002',worker='00000000-0000-0000-0000-000000000003';
module.exports=({browser,seen,preview})=>{
async function pageFor(portal,loggedIn=true,missing=false){
 const role=portal==='admin'?'super_admin':portal==='site-manager'?'site_manager':portal;
 const tables=fixtures(role),person=portal==='pm'?staff:uid;
 tables.profiles[0]={...tables.profiles[0],id:person,role,full_name:'Fixture User',is_approved:loggedIn};
 tables.projects[0].pm_id=staff;
 const user={id:person,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:{role,full_name:'Fixture User'},app_metadata:{provider:'email'}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:person,exp,role:'authenticated'})).toString('base64url')+'.fixture';
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 if(loggedIn)await page.addInitScript(session=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user});
 let monthly=[]; let corrected=false; let monthlyRate=45000;
 page.on('dialog',dialog=>dialog.dismiss());
 await page.routeWebSocket('**/*',socket=>socket.close());
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===new URL(preview).origin)return route.continue();
  if(!['fixture.supabase.co','api.fixture.invalid'].includes(url.hostname))return route.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range','content-range':'0-0/1'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const data=request.postDataJSON?.();
  if(request.method()!=='GET')seen.push({path:url.pathname,data,portal});
  let response=[];
  if(url.pathname==='/api/auth/register')return route.fulfill({headers,json:{id:uid,username:data.username,is_approved:false}});
  if(url.pathname==='/api/auth/password-recovery')return route.fulfill({status:202,headers,json:{message:'If an account exists, a password reset link will be sent.'}});
  if(url.pathname==='/api/auth/username-login')return route.fulfill({headers,json:{access_token:token,refresh_token:'fixture'}});
  if(url.pathname.startsWith('/auth/v1/'))response=user;
  else if(url.pathname.startsWith('/rest/v1/')){
   const name=url.pathname.split('/').pop();response=tables[name]||[];
   for(const [key,value] of url.searchParams){if(value.startsWith('eq.'))response=response.filter(row=>String(row[key])===value.slice(3));}
   if(request.headers().accept?.includes('object+json'))response=response[0]||{};
  }else if(url.pathname==='/api/labour/staff/people')response=[{id:staff,full_name:'Fixture Manager',role:'pm',monthly_salary:monthlyRate,projects:[{id:uid,name:tables.projects[0].name}]}];
  else if(url.pathname==='/api/labour/staff/payroll')response=monthly;
  else if(url.pathname==='/api/labour/staff/compensation'){monthlyRate=data.monthly_salary;response={saved:true};}
  else if(url.pathname==='/api/labour/staff/salary'){
   monthly=[{id:uid,worker_id:staff,project_id:uid,pay_basis:'monthly',period_start:'2026-11-01',period_end:'2026-11-30',basic_pay:50000,deductions:data.deduction,deduction_details:[{amount:data.deduction,reason:data.reason}],total_amount:50000-data.deduction,status:'Draft'}];response=monthly[0];
  }else if(url.pathname==='/api/workflow/attendance')response=[{id:uid,worker_id:worker,worker_profile_id:worker,worker_name:'Fixture Worker',date:'2026-11-01',status:'Present',hours_worked:8,overtime_hours:0,check_in_time:'2026-11-01T03:00:00Z',site_name:'Fixture site address',check_out_time:missing&&!corrected?null:'2026-11-01T11:00:00Z'}];
  else if(url.pathname.endsWith('/resolve-checkout')){corrected=true;response={message:'Saved'};}
  else if(url.pathname==='/api/workflow/attendance/review')response={reviewed:1};
  else if(url.pathname==='/api/labour/salary/generate')response={generated:1,slips:[]};
  else if(url.pathname==='/api/labour/worker/site')response={project:tables.projects[0],site:tables.sites[0],manager:{full_name:'Fixture Site Manager'}};
  else if(url.pathname==='/api/labour/worker/payroll')response={total_days:1,total_hours:8,overtime_hours:0,total_pay:3500,basic_pay:3500,overtime_pay:0,deductions:0,daily_rate:3500,final:false};
  else if(url.pathname.endsWith('/expense-references'))response=[{id:worker,description:'Fixture BOQ work',unit:'item',quantity:1,active:true,kind:'work'}];
  else if(url.pathname.endsWith('/expenses'))response=request.method()==='POST'?{id:worker,...data}:[];
  else if(url.pathname.startsWith('/api/boq/'))response=require('./boq-fixture.cjs')(uid);
  return route.fulfill({headers,json:response});
 });
 return {page,context,projectName:tables.projects[0].name};
}
return pageFor;
};
