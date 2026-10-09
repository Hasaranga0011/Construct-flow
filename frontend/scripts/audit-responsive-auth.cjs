const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');const fs=require('fs'),path=require('path');process.chdir(path.resolve(__dirname,'../..'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();const results=[];let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/auth/v1/**',r=>r.fulfill({json:{}}));
for(const route of ['/','/login','/admin-login','/partner-login','/team-login','/partner-register','/team-register','/forgot-password','/reset-password']){
 errors=[];await page.goto((process.env.RESPONSIVE_URL||'http://localhost:8083')+route,{waitUntil:'domcontentloaded',timeout:180000});await page.waitForTimeout(900);
 for(const [width,height] of [[360,640],[390,844],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);for(const input of await page.locator('input:visible,textarea:visible').all()){await input.scrollIntoViewIfNeeded();await input.focus();}
  const result=await page.evaluate(async()=>{let scrolls=0;for(const e of document.querySelectorAll('*')){if(['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight){e.scrollTop=e.scrollHeight;await new Promise(r=>requestAnimationFrame(r));scrolls++;e.scrollTop=0;}}return {scrolls,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...document.querySelectorAll('input,button,[role="button"],[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[aria-hidden="true"]'))return false;return r.x< -1||r.right>innerWidth+1;}).map(e=>(e.textContent||e.getAttribute('placeholder')||'input').slice(0,90))};});
  results.push({route,width,...result,errors:[...errors]});if(width===360)await page.screenshot({path:'.validation-web/auth-'+(route.slice(1)||'home')+'.png'});
 }console.log(route,'checked');
}
await browser.close();fs.writeFileSync('.validation-web/responsive-auth.json',JSON.stringify(results,null,2));const failed=results.filter(r=>r.overflow||r.outside.length||r.errors.length);console.log('DONE',results.length,'checks',failed.length,'failures');if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
