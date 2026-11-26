const {chromium}=require('playwright'),assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen:[],preview});try{
 for(const portal of ['pm','site-manager','worker','client','supplier']){
  const {page,context}=await pageFor(portal);page.setDefaultNavigationTimeout(120000);
  let approved=false;
  const id=portal==='pm'?'00000000-0000-0000-0000-000000000002':'00000000-0000-0000-0000-000000000001';
  await page.route('https://fixture.supabase.co/rest/v1/profiles*',r=>{
   const profile={id,role:portal==='site-manager'?'site_manager':portal,is_approved:approved,full_name:'Pending fixture'};
   return r.fulfill({headers:{'access-control-allow-origin':'*'},json:r.request().headers().accept?.includes('object+json')?profile:[profile]});
  });
  await page.goto(`${preview}/${portal}/dashboard`);
  await page.waitForURL(/\/pending-approval$/);
  await page.getByText(portal==='supplier'?'Supplier Approval Pending':'Administrator Approval Pending',{exact:true}).waitFor();
  await page.getByText('Check Status',{exact:true}).click();await page.waitForTimeout(300);
  assert(new URL(page.url()).pathname==='/pending-approval');
  approved=true;
  await page.getByText('Check Status',{exact:true}).click();
  await page.waitForURL(new RegExp(`/${portal}/dashboard$`));
  await context.close();console.log(`PASS ${portal}: pending cannot enter dashboard; administrator approval unlocks workspace`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
