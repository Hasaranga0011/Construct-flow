/* Functional workflows with synthetic identities; all remote traffic is intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8095';
const uid='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002',worker='00000000-0000-0000-0000-000000000003';
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
const seen=[];
const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen,preview});
try{
 {
  const {page,context}=await pageFor('pm',false);
  await page.goto(preview+'/register');
  await page.getByRole('button',{name:'Change registration identity',exact:true}).click();
  await page.getByPlaceholder('e.g. Kasun Perera').fill('Fixture Worker');
  await page.getByPlaceholder('Choose a username').fill('fixture.worker');
  await page.getByPlaceholder('07X XXXXXXX or +947X XXXXXXX').fill('0771234567');
  await page.getByPlaceholder('Minimum 12 characters').fill('FixturePassword123!');
  await page.getByPlaceholder('Re-enter password').fill('FixturePassword123!');
  await page.getByText('Register as Project Manager',{exact:true}).click();
  await page.waitForURL(/team-login\?registered=username/);
  const request=seen.find(row=>row.path==='/api/auth/register');
  assert.equal(request.data.username,'fixture.worker');assert(!request.data.email);
  await page.getByPlaceholder('Email or username').fill('fixture.worker');
  await page.locator('input[type="password"]').fill('FixturePassword123!');
  await page.getByText('Log In',{exact:true}).click();
  await page.waitForURL(/pending-approval/);
  assert(seen.some(row=>row.path==='/api/auth/username-login'&&row.data.username==='fixture.worker'));
  console.log('PASS username registration, Supabase-session login and pending-approval gate; no real account created');
  await context.close();
 }
 {
  const {page,context}=await pageFor('worker',false);
  await page.goto(preview+'/forgot-password');await page.getByPlaceholder('name@company.com').fill('fixture@example.invalid');
  await page.getByText('Send Reset Link',{exact:true}).click();
  await page.getByText('If an account exists, a password reset link will be sent.',{exact:true}).waitFor();
  assert(seen.some(row=>row.path==='/api/auth/password-recovery'&&row.data.redirect_to===preview+'/reset-password'));
  console.log('PASS signed-out password recovery uses current web origin; no real email sent');await context.close();
 }
 {
  const {page,context,projectName}=await pageFor('admin');
  await page.goto(preview+'/admin/staff-payroll');await page.getByLabel('Open notifications',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Choose Project Manager or Site Manager',exact:true}).click();
  await page.getByRole('button',{name:'Fixture Manager · Project Manager',exact:true}).click();
  await page.getByLabel('Fixed monthly salary (LKR)',{exact:true}).fill('50000');
  await page.getByRole('button',{name:'Save monthly salary',exact:true}).click();
  await page.getByText('Monthly salary saved. Existing payslips stay unchanged.',{exact:true}).waitFor();
  await page.getByRole('button',{name:"Select employee's assigned project",exact:true}).click();
  await page.getByRole('button',{name:projectName,exact:true}).click();
  await page.getByLabel('Salary month',{exact:true}).fill('2026-11-01');
  await page.getByLabel('Deduction amount (LKR)',{exact:true}).fill('500');await page.getByLabel('Deduction reason',{exact:true}).fill('Advance repayment');
  await page.getByRole('button',{name:'Generate monthly payslip',exact:true}).click();
  await page.getByText('Monthly payslip generated successfully.',{exact:true}).waitFor();
  await page.getByText(/49,500/).first().waitFor();
  const request=seen.find(row=>row.path==='/api/labour/staff/salary');assert.equal(request.data.month,'2026-11');assert.equal(request.data.deduction,500);
  console.log('PASS saved monthly manager salary and deduction generation UI');await context.close();
 }
 {
  const {page,context}=await pageFor('pm');
  await page.goto(preview+'/pm/payroll');await page.getByRole('button',{name:'Run Payroll Batch',exact:true}).click();
  await page.getByLabel('Start Date',{exact:true}).fill('2026-11-01');await page.getByLabel('End Date',{exact:true}).fill('2026-11-30');
  await page.getByRole('button',{name:'Load workers for deductions',exact:true}).click();
  await page.getByLabel('Deduction amount (LKR)',{exact:true}).fill('500.25');await page.getByLabel('Deduction reason',{exact:true}).fill('Worker advance');
  await page.getByRole('button',{name:'Load attendance for review',exact:true}).click();
  await page.getByRole('button',{name:/I have reviewed these records/}).click();
  await page.getByRole('button',{name:'Generate Slips',exact:true}).click();
  await page.waitForTimeout(300);
  const request=seen.find(row=>row.path==='/api/labour/salary/generate');assert.equal(request.data.deductions[0].worker_id,worker);assert.equal(request.data.deductions[0].amount,500.25);
  console.log('PASS PM calendar selection, attendance review and pre-generation worker deduction payload');await context.close();
 }
 {
  const {page,context}=await pageFor('site-manager');
  await page.goto(preview+'/site-manager/expenses');await page.getByRole('button',{name:'Manage Expenses',exact:true}).click();
  await page.getByText('Add Expense',{exact:true}).click();
  await page.getByText('Other',{exact:true}).click();
  await page.getByPlaceholder('e.g., Cement Bags, Site Equipment').fill('Site transport');await page.getByPlaceholder('0.00',{exact:true}).fill('200.25');
  await page.getByRole('button',{name:'Choose a BOQ reference',exact:true}).click();await page.getByRole('button',{name:'Fixture BOQ work · 1 item',exact:true}).click();
  await page.getByLabel('Expense Date',{exact:true}).fill('2026-11-23');await page.getByText('Save Expense',{exact:true}).click();
  await page.waitForTimeout(300);
  const request=seen.find(row=>row.path.endsWith('/expenses')&&row.data?.title==='Site transport');assert.equal(request.portal,'site-manager');assert.equal(request.data.project_id,uid);assert.equal(request.data.boq_item_id,worker);assert.equal(request.data.amount,200.25);
  console.log('PASS Site Manager assigned-project BOQ-linked expense UI');await context.close();
 }
 {
  const {page,context}=await pageFor('pm',true,true);
  await page.goto(preview+'/pm/payroll');await page.getByRole('button',{name:'Run Payroll Batch',exact:true}).click();
  await page.getByRole('button',{name:'Load attendance for review',exact:true}).click();
  await page.getByText('Site: Fixture site address',{exact:true}).waitFor();
  const approve=page.getByRole('button',{name:/I have reviewed these records/});assert(await approve.isDisabled());
  await page.getByLabel('Actual check-out date',{exact:true}).fill('2026-11-01');
  await page.getByLabel('Actual check-out time (Sri Lanka)',{exact:true}).fill('17:30');
  await page.getByLabel('Reason for missing check-out',{exact:true}).fill('Supervisor verified missed checkout');
  await page.getByRole('button',{name:'Save actual check-out',exact:true}).click();
  await page.getByText('Check-out saved. Load attendance again to verify the recalculated hours before approving.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Load attendance for review',exact:true}).click();
  assert(await approve.isEnabled());
  const request=seen.find(row=>row.path.endsWith('/resolve-checkout'));
  assert.equal(request.data.check_out_time,'2026-11-01T17:30:00+05:30');
  console.log('PASS mobile missing check-out correction, site display and fresh-review approval gate');await context.close();
 }

 {
  const {page,context}=await pageFor('admin');
  for(const width of [320,390,1024,1440]){
   await page.setViewportSize({width,height:900});await page.goto(preview+'/admin/staff-payroll');
   assert(await page.getByRole('button',{name:'Save monthly salary',exact:true}).isDisabled());
   await page.getByRole('button',{name:'Choose Project Manager or Site Manager',exact:true}).click();
   await page.getByRole('button',{name:'Fixture Manager · Project Manager',exact:true}).click();
   await page.getByRole('button',{name:"Select employee's assigned project",exact:true}).click();
   await page.getByRole('button',{name:require('./responsive-fixtures.cjs')('super_admin').projects[0].name,exact:true}).click();
   const generate=page.getByRole('button',{name:'Generate monthly payslip',exact:true});
   await page.getByLabel('Deduction amount (LKR)',{exact:true}).fill('45001');assert(await generate.isDisabled());
   await page.getByLabel('Deduction amount (LKR)',{exact:true}).fill('500');assert(await generate.isDisabled());
   await page.getByLabel('Deduction reason',{exact:true}).fill('Verified advance');assert(await generate.isEnabled());
   await page.getByLabel('Fixed monthly salary (LKR)',{exact:true}).fill('46000');assert(await generate.isDisabled());
   await page.getByText('Monthly staff payroll',{exact:true}).scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
   await page.screenshot({path:'../.validation-ui/current/staff-payroll-'+width+'.png'});
  }
  console.log('PASS staff payroll at four widths; empty selection, unsaved rate and invalid deductions are blocked');await context.close();
 }
 {
  const {page,context}=await pageFor('admin');let fail=true;
  await page.route('https://api.fixture.invalid/api/labour/staff/payroll',route=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   return route.fulfill({status:fail?503:200,headers,json:fail?{detail:'Fixture history unavailable'}:[]});
  });
  await page.goto(preview+'/admin/staff-payroll');
  await page.getByRole('button',{name:'Choose Project Manager or Site Manager',exact:true}).click();
  await page.getByRole('button',{name:'Fixture Manager · Project Manager',exact:true}).click();
  await page.getByText(/Payslip history could not be loaded/).waitFor();
  assert(await page.getByRole('button',{name:'Generate monthly payslip',exact:true}).isDisabled());
  fail=false;await page.getByRole('button',{name:'Retry loading salaries',exact:true}).click();
  await page.getByText('No monthly payslips yet',{exact:true}).waitFor();
  console.log('PASS payslip-history failure does not hide employees; retry restores history');await context.close();
 }
 {
  const {page,context,projectName}=await pageFor('admin');let release;
  const held=new Promise(resolve=>{release=resolve;});
  await page.route('https://api.fixture.invalid/api/labour/staff/payroll',async route=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   await held;return route.fulfill({headers,json:[]});
  });
  try{
   await page.goto(preview+'/admin/staff-payroll');
   await page.getByRole('button',{name:'Choose Project Manager or Site Manager',exact:true}).click();
   await page.getByRole('button',{name:'Fixture Manager · Project Manager',exact:true}).click();
   await page.getByRole('button',{name:"Select employee's assigned project",exact:true}).click();
   await page.getByRole('button',{name:projectName,exact:true}).click();
   await page.getByText('Loading payslip history…',{exact:true}).waitFor();
   const generate=page.getByRole('button',{name:'Generate monthly payslip',exact:true});assert(await generate.isDisabled());
   release();await page.getByText('No monthly payslips yet',{exact:true}).waitFor();assert(await generate.isEnabled());
   console.log('PASS slow payslip history does not block employee/project selection; generation waits for history');
  }finally{release();await context.close();}
 }
}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
