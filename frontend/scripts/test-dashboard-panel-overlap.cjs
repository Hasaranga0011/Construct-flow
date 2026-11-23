const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
 const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen:[],preview});
 try{
  for(const portal of ['client','admin','pm','supplier','site-manager','worker']){
   const {page,context}=await pageFor(portal);
   if(portal==='client'){
    const fixture=require('./responsive-fixtures.cjs')('client').projects[0];
    const projects=Array.from({length:12},(_,i)=>({...fixture,id:`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,name:`Project ${i+1} with a long construction name`,completion_percentage:i*8}));
    await page.route('https://fixture.supabase.co/rest/v1/projects*',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},json:projects}));
   }
   await page.goto(`${preview}/${portal}/dashboard`);
   await page.locator('[data-testid="dashboard-detail-panel"], [data-testid="dashboard-panel-link"]').first().waitFor();
   await page.waitForTimeout(1200);
   for(const width of [320,390,768,1024,1440,1680]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);
    const failures=await page.evaluate(()=>{
     const panels=[...document.querySelectorAll('[data-testid="dashboard-detail-panel"], [data-testid="dashboard-panel-link"]')].filter(el=>!el.parentElement.closest('[data-testid="dashboard-detail-panel"]'));
     const errors=[];
     for(const panel of panels){const box=panel.getBoundingClientRect();for(const child of panel.children){const b=child.getBoundingClientRect();if(b.bottom>box.bottom+2)errors.push(`Panel content exceeds height by ${b.bottom-box.bottom}`);}}
     for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){const a=panels[i].getBoundingClientRect(),b=panels[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>3)errors.push(`Panels ${i}/${j} overlap`);}
     if(document.documentElement.scrollWidth>innerWidth+1)errors.push('Horizontal page overflow');return errors;
    });
    assert.deepEqual(failures,[],`${portal} at ${width}`);
   }
   if(portal==='client')await page.screenshot({path:'../.validation-ui/current/client-dashboard-panels.png',fullPage:true});
   await context.close();
  }
  console.log('PASS six dashboards at six widths: intrinsic panel heights, no panel overlap, no horizontal page overflow; client fixture includes 12 projects');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
