const {chromium} = require('C:/Users/UsEr/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs=require('node:fs'); const assert=require('node:assert/strict');
const env=fs.readFileSync('frontend/.env','utf8');
const base=env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
const storageKey=`sb-${new URL(base).hostname.split('.')[0]}-auth-token`;
const user={id:'00000000-0000-0000-0000-000000000001',email:'test@example.invalid',role:'authenticated',aud:'authenticated',user_metadata:{role:'super_admin',full_name:'Report Test Admin'},app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+3600;
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp,role:'authenticated'})).toString('base64url')+'.test';
const fixture={generated_at:new Date().toISOString(),people:[{id:'pm1',full_name:'Project Manager'},{id:'w1',full_name:'Test Worker'}],projects:[{id:'p1',name:'Riverside Apartments',status:'In Progress',total_budget:1000000,spent_cost:1200000,completion_percentage:60,end_date:'2025-01-01',pm_id:'pm1'},{id:'p2',name:'Completed Office',status:'Completed',total_budget:500000,spent_cost:450000,completion_percentage:100,end_date:'2025-01-01',pm_id:'pm1'}],materials:[{id:'m1',name:'Cement',unit:'bags',current_stock:3,minimum_threshold:10},{id:'m2',name:'Steel',unit:'kg',current_stock:100,minimum_threshold:20}],orders:[{id:'o1',po_number:'PO-001',supplier_name:'Supplier One',status:'Confirmed',total_price:50000,expected_date:'2025-01-01',site_id:'p1'}],payroll:[{id:'s1',worker_id:'w1',site_id:'p1',total_amount:25000,total_days:10,total_overtime_hours:5,period_start:'2026-09-01',period_end:'2026-09-30',status:'Pending'},{id:'s2',worker_id:'w1',site_id:'p2',total_amount:20000,total_days:8,total_overtime_hours:0,period_start:'2026-08-01',period_end:'2026-08-31',status:'Paid'}]};
let browser;
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 await page.addInitScript(({storageKey,session})=>localStorage.setItem(storageKey,JSON.stringify(session)),{storageKey,session:{access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:3600,token_type:'bearer',user}});
 await page.route('**/rest/v1/**',r=>r.fulfill({json:[]}));
 await page.route('**/auth/v1/**',r=>r.fulfill({json:user}));
 await page.route('**/api/**',r=>r.fulfill({json:[]}));
 let mode='data';let calls=0;
 await page.route('**/reports/management',r=>{calls++;return mode==='error'?r.fulfill({status:500,json:{detail:'Test service unavailable'}}):r.fulfill({json:mode==='empty'?{...fixture,projects:[],materials:[],orders:[],payroll:[],people:[]}:fixture});});
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 fixture.projects.push(...Array.from({length:80},(_,i)=>({...fixture.projects[0],id:'extra-'+i,name:i===79?'FINAL RECORD':'Project '+i})));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));

 await page.addInitScript(() => {
  const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{...descriptor,get(){const win=descriptor.get.call(this);if(win&&this.hasAttribute('data-report-print'))win.print=()=>{window.__printedReport=win.document.documentElement.outerHTML;};return win;}});
 });
 await page.goto('http://localhost:8083/admin/reports',{waitUntil:'domcontentloaded',timeout:240000});
 await page.getByRole('button',{name:'Download PDF: Management Reports',exact:true}).waitFor({timeout:180000});
 const ExcelJS=require('../frontend/node_modules/exceljs');
 async function check(title, suffix) {
  for(const format of ['PDF','Excel']) {
   const pending=page.waitForEvent('download',{timeout:60000});
   await page.getByRole('button',{name:`Download ${format}: ${title}`,exact:true}).click();
   const dl=await pending;const bytes=fs.readFileSync(await dl.path());
   const output=`.validation-web/${suffix}.${format==='PDF'?'pdf':'xlsx'}`;fs.writeFileSync(output,bytes);
   if(format==='PDF')assert(bytes.subarray(0,5).toString()==='%PDF-');
   else {const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert(book.worksheets.length>=2);if(title==='Project decision register'){const sheet=book.worksheets[1];assert.equal(sheet.rowCount,85);assert.equal(typeof sheet.getCell('D5').value,'number');assert(sheet.getColumn(1).values.includes('FINAL RECORD'));assert(!sheet.getColumn(1).values.includes('Completed Office'));}}
   await page.getByRole('button',{name:`Print: ${title}`,exact:true}).waitFor({state:'visible'});
  }
  await page.evaluate(()=>window.__printedReport=null);
  await page.getByRole('button',{name:`Print: ${title}`,exact:true}).click();
  await page.waitForFunction(()=>!!window.__printedReport);
  const markup=await page.evaluate(()=>window.__printedReport);
  assert(markup.includes(title.replace(/&/g,'&amp;')));assert(!markup.includes('Download PDF'));if(title==='Project decision register')assert(markup.includes('FINAL RECORD'));
  await page.evaluate(()=>document.querySelectorAll('[data-report-print]').forEach(el=>el.remove()));
  console.log('PASS PDF / XLSX / Print:',title);
 }
 await check('Management Reports','overview-export');await check('Executive summary','summary-export');
 await page.getByRole('button',{name:'Project Performance',exact:true}).click();
 await page.getByRole('button',{name:'Over budget',exact:true}).click();
 await check('Project Performance','projects-full-export');await check('Project decision register','projects-filtered-export');
 await page.getByRole('button',{name:'Inventory & Procurement',exact:true}).click();
 await check('Inventory & Procurement','materials-full-export');await check('Inventory replenishment register','inventory-export');await check('Purchase order follow-up','orders-export');
 await page.getByRole('button',{name:'Payroll & Workforce Cost',exact:true}).click();await page.getByRole('button',{name:'All periods',exact:true}).click();
 await check('Payroll & Workforce Cost','payroll-full-export');await check('Salary-slip register','payroll-register-export');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'.validation-web/export-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS all 9 report/export scopes, 18 real downloads and 9 print documents. Filtered rows beyond page 25 included; native printer dialog is stubbed.');
 await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
