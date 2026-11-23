const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen:[],preview:'http://127.0.0.1:8096'});
  const {page}=await pageFor('worker');
  await page.goto('http://127.0.0.1:8096/worker/dashboard');
  await page.getByText('My Hours This Month',{exact:true}).waitFor();
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(500);
   const chart=page.locator('.recharts-wrapper');
   assert.equal(await chart.count(),1,'Fixture attendance must render the chart');
   assert((await chart.boundingBox()).width>=1200);
   const ticks=await chart.locator('text[orientation="bottom"]').allTextContents();
   assert(ticks.includes('30')||ticks.includes('31'),JSON.stringify({width,ticks,html:(await chart.innerHTML()).slice(-1200)}));
   const scrolled=await chart.evaluate(el=>{let parent=el.parentElement;while(parent&&(!['auto','scroll'].includes(getComputedStyle(parent).overflowX)||parent.scrollWidth<=parent.clientWidth+1))parent=parent.parentElement;if(!parent)return false;parent.scrollLeft=parent.scrollWidth;return parent.scrollLeft>0;});
   assert(scrolled,JSON.stringify(await chart.evaluate(el=>{const rows=[];for(let p=el;p;p=p.parentElement)rows.push({width:p.clientWidth,scroll:p.scrollWidth,overflow:getComputedStyle(p).overflowX,tag:p.tagName});return rows;})));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.goto('http://127.0.0.1:8096/worker/attendance');
  await page.getByText('Attendance calendar',{exact:true}).waitFor();
  await page.getByRole('button',{name:/01\/11\/2026,/}).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({path:'../.validation-ui/current/worker-attendance-enhanced.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:'../.validation-ui/current/worker-attendance-enhanced-mobile.png',fullPage:true});
  await page.goto('http://127.0.0.1:8096/worker/payroll');
  await page.getByText('ESTIMATED NET PAY · LKR',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'../.validation-ui/current/worker-payroll-enhanced-mobile.png',fullPage:true});
  console.log('PASS worker chart: monthly dates, horizontal scrolling and responsive boundaries at four widths; attendance renders');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
