/* Mixed labels and long addresses, with all remote requests intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const seen=[],pageFor=require('./workflow-browser-fixture.cjs')({browser,seen,preview});
 try{
  for(const portal of ['admin','pm']){
   const {page,context}=await pageFor(portal);
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   const fixture=require('./responsive-fixtures.cjs')('super_admin').projects[0];
   const statuses=['active','Active','In Progress','in progress','active'];
   const projects=statuses.map((status,index)=>({...fixture,id:'00000000-0000-0000-0000-'+String(8800+index).padStart(12,'0'),pm_id:'00000000-0000-0000-0000-000000000002',name:'Fixture project '+(index+1)+(index===2?' with a long descriptive construction name':''),location:index===1?'Galle':('Advanced Technological Institute - Galle, Siridhamma Mawatha, Karapitiya, Galle 80090, Sri Lanka. ශ්‍රී ලංකා '+index),status,completion_percentage:[-5,23,0,75,145][index]}));
   await page.route('https://fixture.supabase.co/rest/v1/projects*',route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({headers,json:projects}));
   await page.route('https://fixture.supabase.co/rest/v1/milestones*',route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({headers,json:[]}));
   await page.goto(preview+'/'+portal+'/dashboard');
   await page.getByTestId('active-project-row').first().waitFor();
   for(const width of [320,390,768,1024,1440,1680]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
    const rows=page.getByTestId('active-project-row');assert.equal(await rows.count(),5);
    const slots=[];
    for(const row of await rows.all()){
     const slot=await row.getByTestId('project-status-cell').boundingBox();
     const badge=await row.getByTestId('status-badge').boundingBox();
     if(Math.abs(slot.width-120)>=1||Math.abs(badge.width-120)>=1){await row.scrollIntoViewIfNeeded();await page.screenshot({path:'../.validation-ui/current/project-status-debug.png'});const css=await row.getByTestId('project-status-cell').evaluate(el=>({html:el.outerHTML.slice(0,800),width:getComputedStyle(el).width,flex:getComputedStyle(el).flex,parentWidth:el.parentElement.getBoundingClientRect().width}));throw new Error(JSON.stringify({portal,width,slot,badge,css}));}
     assert(['Active','In progress'].includes((await row.getByTestId('status-badge').innerText()).trim()));
     const action=row.getByRole('button',{name:/^Manage Fixture project/});assert((await action.boundingBox()).height>=44);
     if(await row.getByTestId('project-details-cell').count()){
      const details=await row.getByTestId('project-details-cell').boundingBox(),progress=await row.getByTestId('project-progress-cell').boundingBox(),button=await row.getByTestId('project-action-cell').boundingBox();
      assert(details.x+details.width<=slot.x+1);
      assert(Math.abs(slot.y+slot.height/2-progress.y-progress.height/2)<1);
      assert(Math.abs(slot.y+slot.height/2-button.y-button.height/2)<1);
      slots.push({x:slot.x,width:slot.width,progressX:progress.x,actionX:button.x});
     }
    }
    if(slots.length)for(const slot of slots)for(const key of ['x','width','progressX','actionX'])assert(Math.abs(slot[key]-slots[0][key])<1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await rows.first().scrollIntoViewIfNeeded();
    if([390,1680].includes(width))await page.screenshot({path:'../.validation-ui/current/project-status-'+portal+'-'+width+'.png'});
   }
   console.log('PASS '+portal+' mixed project statuses, fixed columns, long addresses and 44px actions at six widths');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
