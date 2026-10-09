const { chromium }=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
process.chdir(path.resolve(__dirname,'../..'));
const preview=process.env.RESPONSIVE_URL||'http://localhost:8083';
const env=fs.readFileSync('frontend/.env','utf8'),base=env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1],key=`sb-${new URL(base).hostname.split('.')[0]}-auth-token`;
const results=[];
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
for(const role of ['admin','pm','site-manager','supplier','client','worker']){
 const tables=require('./responsive-fixtures.cjs')(role==='site-manager'?'site_manager':role),profile=tables.profiles[0],user={id:profile.id,email:profile.email,aud:'authenticated',role:'authenticated',user_metadata:profile,app_metadata:{provider:'email'}};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp,role:'authenticated'})).toString('base64url')+'.test';
 const page=await browser.newPage();page.setDefaultTimeout(15000);
 await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:{access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:3600,token_type:'bearer',user}});
 await page.route('**/rest/v1/**',r=>{const name=new URL(r.request().url()).pathname.split('/').pop(),rows=tables[name]||[];return r.fulfill({json:r.request().headers().accept?.includes('object+json')?(rows[0]||null):rows});});
 await page.route('**/auth/v1/**',r=>r.fulfill({json:user}));await page.route('**/api/**',r=>r.fulfill({json:[]}));await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 async function check(name,fn,width){try{await fn();results.push({role,name,width,pass:true});console.log('PASS',role,name,width);}catch(e){results.push({role,name,width,pass:false,error:e.message});console.log('FAIL',role,name,width,e.message.slice(0,180));await page.screenshot({path:`.validation-web/interaction-${role}-${width}.png`});}}
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:width<768?640:900});
  await page.goto(`${preview}/${role}/dashboard`,{waitUntil:'domcontentloaded',timeout:180000});await page.getByLabel('Open account details').waitFor();
  await check('single header and drawer',async()=>{assert.equal(await page.getByLabel('Open notifications',{exact:true}).count(),1);assert.equal(await page.getByLabel('Open navigation menu',{exact:true}).count(),width<1024?1:0);if(width<1024){await page.getByLabel('Open navigation menu',{exact:true}).click();await page.waitForTimeout(350);await page.getByLabel('Close navigation menu',{exact:true}).click({position:{x:width-10,y:100}});}},width);
  await check('account overlay fits and closes',async()=>{await page.getByLabel('Open account details').click();const close=page.getByLabel('Close account details');await close.waitFor();const r=await close.boundingBox();assert(r.x>=0&&r.x+r.width<=width&&r.height>=44);await page.getByText(profile.email,{exact:true}).last().waitFor();await close.click();},width);
  if(role==='admin')await check('project modal fields and assignment overlay',async()=>{
   await page.getByText('+ New Project',{exact:true}).click();await page.getByText('Start Date',{exact:true}).waitFor();const bounds=await page.getByTestId('modal-content-viewport').last().boundingBox();assert(bounds.height<=page.viewportSize().height*0.85+1,'modal height exceeds 85%');
   const title=page.getByText('Create New Project',{exact:true});
   const inputs=page.locator('input:visible,textarea:visible');
   for(let i=0;i<await inputs.count();i++){const input=inputs.nth(i);await input.scrollIntoViewIfNeeded();await input.focus();const r=await input.boundingBox();assert(r&&r.x>=0&&r.x+r.width<=width+1,'input width');}
   const assignment=page.getByLabel('Assign Administrators',{exact:true});await assignment.scrollIntoViewIfNeeded();await assignment.click();const optionClose=page.getByLabel('Close Assign Administrators',{exact:true});await optionClose.waitFor();const r=await optionClose.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<=900,'dropdown bounds');await optionClose.click();
   await page.getByText('Cancel',{exact:true}).last().scrollIntoViewIfNeeded();await page.getByText('Cancel',{exact:true}).last().click();
  },width);
 }
 await page.close();
}
await browser.close();fs.writeFileSync('.validation-web/responsive-interactions.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);fs.writeFileSync('.validation-web/responsive-interactions.json',JSON.stringify(results,null,2));process.exit(1)});
