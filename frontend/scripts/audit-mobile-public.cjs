const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8092';
const routes=fs.readdirSync(path.join(__dirname,'../src/app')).filter(name=>name.endsWith('.tsx')&&!name.startsWith('_')&&!name.startsWith('+')).map(name=>name==='index.tsx'?'/':'/'+name.replace('.tsx',''));
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try{
 const page=await browser.newPage();
 await page.routeWebSocket('**/*',socket=>socket.close());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===new URL(preview).origin)return route.continue();
  if(url.hostname==='fixture.supabase.co')return route.fulfill({json:url.pathname.includes('/auth/')?{user:null}:[],headers:{'access-control-allow-origin':'*'}});
  return route.abort();
 });
 for(const route of routes){
  for(const [width,height] of [[320,568],[390,600],[844,390]]){
   await page.setViewportSize({width,height});
   await page.goto(preview+route,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(300);
   const geometry=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    error:/Uncaught Error|Unmatched Route/.test(document.body.innerText),
    smallInputs:[...document.querySelectorAll('input,textarea')].filter(element=>{const rect=element.getBoundingClientRect();return rect.width&&innerWidth<768&&parseFloat(getComputedStyle(element).fontSize)<16;}).length,
   }));
   assert(!geometry.overflow,`${route} ${width} horizontal overflow`);
   assert(!geometry.error,`${route} ${width} rendering error`);
   assert.equal(geometry.smallInputs,0,`${route} ${width} mobile input text`);
   const fields=page.locator('input:visible,textarea:visible');
   for(const field of await fields.all()){
    if(!await field.isEnabled())continue;
    await field.scrollIntoViewIfNeeded();await field.focus();await page.waitForTimeout(150);
    const rect=await field.boundingBox();
    assert(rect&&rect.x>=0&&rect.x+rect.width<=width+1,`${route} field clips horizontally`);
    assert(rect.y>=-2&&rect.y+rect.height<=height+2,`${route} ${width}x${height} field cannot be reached vertically: ${await field.getAttribute('placeholder')} ${JSON.stringify(rect)}`);
   }
   checks++;
  }
  console.log('CHECKED PUBLIC',route);
 }
 console.log(`PASS ${checks} public/auth mobile and landscape checks with input focus; all remote requests intercepted`);
}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
