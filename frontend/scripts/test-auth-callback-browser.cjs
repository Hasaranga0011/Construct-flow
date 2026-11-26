const {chromium}=require('playwright'),assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen:[],preview});try{
 for(const portal of ['admin','pm','site-manager','client','supplier','worker']){
  const {page,context}=await pageFor(portal);page.setDefaultNavigationTimeout(120000);
  await page.goto(preview+'/auth/callback?next=https://example.invalid');
  await page.waitForURL(new RegExp(`/${portal}/dashboard$`));
  assert(!(await page.locator('body').innerText()).includes('Unmatched Route'));await context.close();
 }
 for(const suffix of ['', '?error=access_denied#error_description=private-provider-detail']){
  const {page,context}=await pageFor('worker',false);page.setDefaultNavigationTimeout(120000);
  await page.goto(preview+'/auth/callback'+suffix);
  await page.getByText('Sign-in could not be completed',{exact:true}).waitFor();
  assert(!(await page.locator('body').innerText()).includes('private-provider-detail'));
  await page.getByRole('button',{name:'Back to login',exact:true}).click();
  await page.waitForURL(/\/team-login$/);await context.close();
 }
 console.log('PASS callback routes six roles safely, ignores external next URLs and handles missing/failed sign-in with login recovery');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
