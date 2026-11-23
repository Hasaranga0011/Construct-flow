/* Synthetic data only: no live notifications, business records or emails. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const seen=[],pageFor=require('./workflow-browser-fixture.cjs')({browser,seen,preview});
 const roles={admin:'/admin/projects',pm:'/pm/payroll','site-manager':'/site-manager/attendance',supplier:'/supplier/orders',client:'/client/project',worker:'/worker/attendance'};
 try{
  for(const [portal,link] of Object.entries(roles)){
   if(process.env.NOTIFICATION_ROLES&&!process.env.NOTIFICATION_ROLES.split(',').includes(portal))continue;
   const {page,context}=await pageFor(portal);let unread=61,read=false,updated=false;
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   await page.route('https://api.fixture.invalid/api/notifications/feed*',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    return route.fulfill({headers,json:{items:[{id:'00000000-0000-0000-0000-000000009900',title:updated?'Fixture changed update':'Fixture role update',message:'A relevant task needs your attention.',is_read:read,link,created_at:'2026-11-23T06:00:00Z'}],unread_count:unread,total_count:61}});
   });
   await page.route('https://api.fixture.invalid/api/notifications/mark-read',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const data=route.request().postDataJSON();seen.push({portal,data});read=true;unread=data.all?0:60;
    return route.fulfill({headers,json:{success:true}});
   });
   await page.goto(preview+'/'+portal+'/dashboard');
   await page.getByText('Your updates · 61 unread',{exact:true}).waitFor();
   for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'../.validation-ui/current/notifications-'+portal+'-'+width+'.png'});
   }
   updated=true;unread=62;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.getByText('Your updates · 62 unread',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Open update: Fixture changed update',exact:true}).click();
   await page.waitForURL(url=>url.pathname===link);
   assert(seen.some(row=>row.portal===portal&&row.data?.ids?.[0]==='00000000-0000-0000-0000-000000009900'));
   await page.goto(preview+'/'+portal+'/notifications');
   await page.getByRole('button',{name:'Mark all notifications as read',exact:true}).click();
   await page.waitForTimeout(250);
   assert(seen.some(row=>row.portal===portal&&row.data?.all===true));
   console.log('PASS '+portal+' dashboard update, exact unread count, foreground refresh, action link and mark all');
   await context.close();
  }
  {
   const {page,context}=await pageFor('admin');let fail=true;
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   const rows=Array.from({length:61},(_,index)=>({id:'row-'+index,title:'History event '+index,message:'Fixture history',is_read:false,link:'/admin/projects',created_at:'2026-11-23T06:00:00Z'}));
   await page.route('https://api.fixture.invalid/api/notifications/feed*',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const offset=Number(new URL(route.request().url()).searchParams.get('offset')||0);
    return route.fulfill({headers,status:fail?503:200,json:fail?{detail:'Fixture notification failure'}:{items:rows.slice(offset,offset+50),unread_count:61,total_count:61}});
   });
   await page.goto(preview+'/admin/dashboard');await page.getByText('Updates could not be loaded.',{exact:true}).waitFor();
   fail=false;await page.getByRole('button',{name:'Retry notifications',exact:true}).click();
   await page.getByText('Your updates · 61 unread',{exact:true}).waitFor();
   await page.goto(preview+'/admin/notifications');
   await page.getByRole('button',{name:'Load older notifications',exact:true}).click();
   await page.getByText('History event 60',{exact:true}).waitFor();
   console.log('PASS notification error/retry and access to history beyond the latest fifty events');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
