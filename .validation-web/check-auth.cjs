const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/UsEr/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
let browser;
(async () => {
 browser = await chromium.launch({channel:'chrome',headless:true});
 const page = await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const sizes = [[1920,933],[1536,746],[1366,657],[1024,768],[768,1024],[390,844],[320,568],[844,390]];
 let checked=0;
 for (const route of ['partner-login','team-login','partner-register','team-register']) {
  console.log('CHECK', route);
  await page.goto('http://localhost:8083/'+route,{waitUntil:'domcontentloaded',timeout:300000});
  await page.getByTestId('auth-page-scroll').waitFor({timeout:300000});
  for (const [width,height] of sizes) {
   await page.setViewportSize({width,height});
   const scroll=page.getByTestId('auth-page-scroll');
   await page.waitForFunction(h=>document.querySelector('[data-testid="auth-page-scroll"]').clientHeight===h,height);
   await scroll.evaluate(el=>el.scrollTop=0);
   const logo=await page.getByLabel('ConstructAi home',{exact:true}).boundingBox();
   assert(logo.y>=0 && logo.y+logo.height<=height,`${route} ${width}: logo clipped`);
   const geometry=await scroll.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,top:el.getBoundingClientRect().top}));
   assert(geometry.scrollWidth<=geometry.width+1,`${route} ${width}: horizontal overflow`);
   assert(geometry.top===0,`${route} ${width}: offset scrollport`);
   const inputs=await page.locator('input').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}));
   assert(inputs.every(r=>r.left>=0&&r.right<=width),`${route} ${width}: input overflow`);
   const footer=page.getByText(route.endsWith('login')?'Register Now':'Sign In',{exact:true});
   await page.mouse.move(width/4,height/2);
   await page.mouse.wheel(0,10000);
   await page.waitForFunction(()=>{const el=document.querySelector('[data-testid="auth-page-scroll"]');return el.scrollTop+el.clientHeight>=el.scrollHeight-2});
   const bottom=await footer.boundingBox();
   assert(bottom.y>=0&&bottom.y+bottom.height<=height,`${route} ${width}: footer unreachable`);
   if(width===320&&route==='team-register')await page.screenshot({path:'.validation-web/auth-mobile-bottom.png'});
   await scroll.evaluate(el=>el.scrollTop=0);
   if(width===320&&route==='team-register')await page.screenshot({path:'.validation-web/auth-mobile-top.png'});
   checked++;
  }
  await page.getByText(route.endsWith('login')?'Log In':'Sign Up',{exact:true}).click();
  await page.getByText('Please fill in all fields',{exact:true}).waitFor();
  await page.getByTestId('auth-page-scroll').evaluate(el=>el.scrollTop=0);
  assert((await page.getByLabel('ConstructAi home',{exact:true}).boundingBox()).y>=0,'Logo clipped after validation');
  console.log('PASS',route,'8 viewport sizes + validation error');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS',checked,'responsive Chrome checks; wheel scrolling, visible logo, footer reachability, no horizontal overflow.');
 await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
