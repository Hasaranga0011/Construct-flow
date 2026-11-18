/* Public auth interaction checks; all remote requests are intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.WORKFLOW_PREVIEW_URL||'http://127.0.0.1:8087';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();const errors=[];let recoveryRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin===new URL(base).origin)return route.continue();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname.endsWith('/password-recovery')){recoveryRequests++;return route.fulfill({json:{message:'If an account exists, a password reset link will be sent.'},headers});}
   if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:{},headers});
   return route.abort();
  });
  await page.goto(base+'/forgot-password');
  await page.getByText('Send Reset Link',{exact:true}).click();
  await page.getByText('Please enter your email address',{exact:true}).waitFor();
  assert.equal(recoveryRequests,0);
  await page.getByPlaceholder('name@company.com').fill('qa@example.com');
  await page.getByText('Send Reset Link',{exact:true}).click();
  await page.getByText('If an account exists, a password reset link will be sent.',{exact:true}).waitFor();
  assert.equal(recoveryRequests,1);
  console.log('PASS forgot-password validates required input and submits exactly one recovery request');
  await page.goto(base+'/reset-password');
  await page.getByRole('button',{name:'Request a new reset link',exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('At least 8 characters').count(),0);
  assert.equal(await page.getByText('Update Password',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS password reset cannot update credentials without a recovery session; no hydration errors');
  await page.goto(base+'/reset-password#error=access_denied&error_code=otp_expired');
  await page.getByText('This reset link has expired or has already been used. Request a new link below.',{exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('At least 8 characters').count(),0);
  await page.getByRole('button',{name:'Request a new reset link',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/forgot-password');
  console.log('PASS expired recovery link stays disabled, explains the problem and opens a new-link request');
  await context.close();
  const recovery=await browser.newContext({viewport:{width:390,height:844}});
  const user={id:'00000000-0000-0000-0000-000000000001',email:'qa@example.com',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{provider:'email'}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp,role:'authenticated'})).toString('base64url')+'.fixture';
  await recovery.addInitScript(session=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:3600,token_type:'bearer',user});
  let updates=0,signouts=0;
  await recovery.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===new URL(base).origin)return route.continue();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname.endsWith('/user')){if(request.method()==='PUT'){updates++;assert.equal(request.postDataJSON().password,'ValidPassword123!');}return route.fulfill({json:user,headers});}
   if(url.pathname.endsWith('/logout')){signouts++;return route.fulfill({status:204,headers});}
   if(url.pathname.endsWith('/profiles'))return route.fulfill({json:{id:user.id,role:'client',is_approved:true,full_name:'QA Client'},headers});
   if(url.hostname==='api.fixture.invalid'||url.hostname==='fixture.supabase.co')return route.fulfill({json:[],headers});
   return route.abort();
  });
  const reset=await recovery.newPage();reset.on('pageerror',error=>errors.push(error.message));
  await reset.goto(base+'/reset-password');
  const password=reset.getByPlaceholder('At least 8 characters'),confirm=reset.getByPlaceholder('Repeat your password');
  await password.fill('short');await confirm.fill('short');
  await reset.getByText('Update Password',{exact:true}).click();
  await reset.getByText('Password must be at least 8 characters.',{exact:true}).waitFor();
  await password.fill('ValidPassword123!');await confirm.fill('DifferentPassword123!');
  await reset.getByText('Update Password',{exact:true}).click();
  await reset.getByText('Passwords do not match.',{exact:true}).waitFor();
  assert.equal(updates,0);
  await confirm.fill('ValidPassword123!');await reset.getByText('Update Password',{exact:true}).click();
  await reset.getByText(/Password updated successfully!/).waitFor();
  assert.equal(updates,1);assert.equal(signouts,1);assert.deepEqual(errors,[]);
  await reset.waitForURL(url=>url.pathname==='/partner-login');
  console.log('PASS simulated recovery validates password length/matching, updates exactly once and signs out');
  await recovery.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
