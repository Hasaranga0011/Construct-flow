const {chromium}=require('playwright'),assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const seen=[];const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen,preview});try{
 for(const role of ['pm','site-manager']){
  const {page,context}=await pageFor(role);
  page.setDefaultNavigationTimeout(120000);
  await page.goto(`${preview}/${role}/dashboard`);
  await page.getByRole('button',{name:'Manage Expenses',exact:true}).click();
  await page.waitForURL(new RegExp(`/${role}/expenses$`));
  await page.getByRole('button',{name:'Manage Expenses',exact:true}).click();
  await page.waitForURL(/\/projects\/[^/]+\/expenses$/);
  await page.getByRole('button',{name:'Add Expense',exact:true}).click();
  await page.waitForURL(/\/expenses\/create$/);
  console.log(`PASS ${role} dashboard -> assigned-project expenses -> add expense`);await context.close();
 }
 const {page,context}=await pageFor('admin');
 page.setDefaultNavigationTimeout(120000);
 await page.goto(`${preview}/admin/projects/00000000-0000-0000-0000-000000000001`);
 await page.getByText('Permanently Delete Project',{exact:true}).click();
 const name='Riverside International Construction and Infrastructure Development';
 const submit=page.getByText('Delete Project',{exact:true});
 assert(await submit.evaluate(el=>!!el.closest('[aria-disabled="true"],button:disabled')));
 await page.getByPlaceholder(name,{exact:true}).fill(name);
 await submit.click();
 await page.waitForURL(/\/admin\/projects$/);
 assert(seen.some(row=>row.path==='/api/projects/00000000-0000-0000-0000-000000000001'));
 console.log('PASS permanent deletion requires typed project name and returns to project register (mock request only)');await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
