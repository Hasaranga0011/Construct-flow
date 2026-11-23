/* Whole-portal geometry audit with synthetic data; all auth/database/API traffic is intercepted. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./responsive-fixtures.cjs');
const root = path.resolve(__dirname, '../..');
const preview = process.env.UI_AUDIT_URL || 'http://127.0.0.1:8085';
const output = path.join(root, process.env.UI_AUDIT_OUTPUT || '.validation-ui');
fs.mkdirSync(output, { recursive: true });
const uid = '00000000-0000-0000-0000-000000000001';
const roles = (process.env.UI_AUDIT_ROLES || 'admin,pm,site-manager,supplier,client,worker').split(',');
function files(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)]); }
const results = [];
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  for (const portal of roles) {
   const role = portal === 'site-manager' ? 'site_manager' : portal;
   const tables = fixtures(role);
   if(process.env.UI_AUDIT_SORTING){
    tables.projects=[10,2,1].map((number,index)=>({...tables.projects[0],id:index===0?uid:`00000000-0000-0000-0000-${String(index+2).padStart(12,'0')}`,name:`Sort Project ${number}`}));
   }
   tables.projects[0].status = 'In Progress';
   tables.salary_slips[0].project_id = uid;
   tables.estimations=['Approved','Pending','Rejected','Draft'].map((status,index)=>({id:'00000000-0000-0000-0000-'+String(index+20).padStart(12,'0'),project_id:uid,project_name:JSON.stringify({title:'Residential construction in Colombo — phase '+(index+1),inputs:{type:'Residential',sq_ft:2500,floors:2,site:'Flat',timeline:'Standard'}}),estimated_cost:9079000+index*1000000,status,created_at:'2026-10-22T12:30:00Z'}));
   tables.purchase_orders.push({...tables.purchase_orders[0],id:'00000000-0000-0000-0000-000000000088',status:'Pending Delivery'});
   if(process.env.UI_AUDIT_SORTING)tables.purchase_orders=Array.from({length:51},(_,index)=>({...tables.purchase_orders[0],id:`00000000-0000-0000-0000-${String(index+100).padStart(12,'0')}`,po_number:`SORT-${String(index+1).padStart(3,'0')}`,total_price:index+1}));
   if(process.env.UI_AUDIT_MODALS)tables.purchase_orders[0].status='Pending Delivery';
   tables.material_requests[0].item_name = 'Fixture Portland Cement';
   tables.material_catalog = [{ id: uid, name: 'Fixture Portland Cement', unit: 'bags', reference_price: 1500, category: 'General' }];
   tables.client_payment_schedule = [{ id: 'payment1', project_id: uid, description: 'Foundation stage', amount: 50000, due_date: '2026-12-01', status: 'Pending' }];
   tables.variation_orders = [{ id: 'variation1', project_id: uid, title: 'Additional boundary wall', description: 'Client-requested scope extension', amount: 15000, status: 'Pending' }];
   tables.shared_documents = [{ id: 'document1', project_id: uid, name: 'Approved project plan', filename: 'plan.pdf', file_url: 'https://example.invalid/plan.pdf', category: 'Plans', created_at: '2026-11-01' }];
   tables.issues[0].reported_by = uid;
   tables.worker_details = [{ user_id: uid, notification_preferences: { email: false, in_app: true } }];
   const user = { id: uid, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', user_metadata: { role, full_name: 'Fixture User' }, app_metadata: { provider: 'email' } };
   const exp = Math.floor(Date.now() / 1000) + 3600;
   const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, exp, role: 'authenticated' })).toString('base64url') + '.fixture';
   const context = await browser.newContext();
   const page = await context.newPage();
   if(process.env.UI_AUDIT_KEYBOARD)await page.addInitScript(()=>{
    if(!window.visualViewport)return;
    Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>window.__qaVisualHeight||window.innerHeight});
    Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,get:()=>window.__qaVisualTop||0});
   });
   if(process.env.UI_AUDIT_THEME)await page.addInitScript(theme=>{if(window.top===window)localStorage.setItem('@cf_theme',theme);},process.env.UI_AUDIT_THEME);
   await page.addInitScript(session => { if (window.top === window) localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)); }, { access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user });
   page.on('dialog', dialog => dialog.dismiss());
   await page.routeWebSocket('**/*', socket => socket.close());
   await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // Geometry automation must not download public OSM tiles or pan their servers.
    if (url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==', 'base64') });
    if (url.origin === new URL(preview).origin) return route.continue();
    if (!['fixture.supabase.co', 'api.fixture.invalid'].includes(url.hostname)) {
     if (request.method() === 'GET' && ['image', 'font', 'script', 'stylesheet'].includes(request.resourceType())) return route.continue();
     return route.abort();
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers':'content-range', 'content-range': '0-0/1' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data = [];
    if(process.env.UI_AUDIT_PAYROLL_STATE==='conflict'&&url.pathname.endsWith('/labour/salary/generate')){
     return route.fulfill({status:409,headers,json:{detail:{message:'Salary slips already cover this period. Review existing slips before generating payroll.',conflicts:[{id:uid,worker_id:uid,worker_name:'Fixture worker with a long payroll record name',period_start:'2026-11-01',period_end:'2026-11-20',status:'Generated'}]}}});
    }
    if (url.pathname.startsWith('/auth/v1/')) data = user;
    else if(url.pathname.endsWith('/audit/')) data={events:[{id:'9007199254740999',transaction_id:'9007199254740998',occurred_at:'2026-11-20T06:30:00Z',actor_id:uid,actor_role:'super_admin',actor_name:'Fixture Administrator',project_name:'Galle Building',record_name:'Galle Building',table_name:'projects',action:'UPDATE',record_id:uid,project_id:uid,changed_fields:['total_budget','status','contact_number','email'],before_data:{total_budget:100000,status:'Planning',contact_number:'+94000000001'},after_data:{total_budget:125000,status:'In Progress',contact_number:'+94000000002'},current_values:{email:'qa_current@example.invalid'}}],next_cursor:null};
    else if (url.pathname.startsWith('/rest/v1/')) {
     const table = url.pathname.split('/').pop();
     data = tables[table] || [];
     for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) data = data.filter(row => String(row[key]) === value.slice(3));
      if (value.startsWith('in.(')) data = data.filter(row => value.slice(4, -1).split(',').includes(String(row[key])));
     }
     if(process.env.UI_AUDIT_SORTING&&table==='purchase_orders'){
      for(const order of (url.searchParams.get('order')||'').split(',').reverse()){
       const [key,direction]=order.split('.');
       data=[...data].sort((a,b)=>(typeof a[key]==='number'?a[key]-b[key]:String(a[key]||'').localeCompare(String(b[key]||'')))*(direction==='desc'?-1:1));
      }
      const count=data.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||count);
      data=data.slice(offset,offset+limit);headers['content-range']=`${offset}-${offset+data.length-1}/${count}`;
     }
     if (request.headers().accept?.includes('object+json')) data = data[0] || {};
    } else if (url.pathname.endsWith('/workflow/material-requests')) data = { requests: tables.material_requests, suppliers: [{ id: uid, full_name: 'Fixture Supplier', project_id: uid }], projects: tables.projects };
    else if (/\/workflow\/projects\/[^/]+\/commercial$/.test(url.pathname)) data = { payments: tables.client_payment_schedule, variations: tables.variation_orders };
    else if (/\/workflow\/projects\/[^/]+\/documents$/.test(url.pathname)) data = tables.shared_documents;
    else if (url.pathname.endsWith('/workflow/attendance')) data = tables.attendance.map(row => ({ ...row, worker_name: 'Fixture Worker', check_out_time: '2026-11-01T12:00:00Z' }));
    else if (url.pathname.endsWith('/labour/worker/site')) data = { project: tables.projects[0], site: tables.sites[0], manager: { full_name: 'Fixture Site Manager', contact_number: '+94771234567' } };
    else if (url.pathname.endsWith('/labour/worker/payroll')) data = { total_days: 1, total_hours: 9, overtime_hours: 1, daily_rate: 3500, basic_pay: 3500, overtime_pay: 656.25, total_pay: 4156.25, final: false };
    else if (url.pathname.startsWith('/api/boq/')) data = require('./boq-fixture.cjs')(uid);
    else if (url.pathname.endsWith('/financials')) data = { total_budget: 1000000, actual_spend: 250000, committed_cost: 100000, remaining_budget: 650000, actual_po: 200000, actual_payroll: 40000, actual_expenses: 10000 };
    else if (url.pathname.endsWith('/ai/insights')) data = { projects: [], feature_importance: [], project_health: { trending_over_budget: 0 }, market_trends: [], pending_market_trends: [], historical_projects: [], real_projects_count: 0, verified_real_count: 0, model_info: {}, historical_summary_metrics: {count:0,mean_variance_pct:0,mean_abs_variance_pct:0} };
    else if (url.pathname.endsWith('/reports/management')) data = { projects: tables.projects, materials: tables.materials, orders: tables.purchase_orders, payroll: tables.salary_slips, people: tables.profiles, expenses: [], attendance: tables.attendance, issues: tables.issues, generated_at: new Date().toISOString() };
    else if (url.pathname === '/api/projects/' || url.pathname === '/api/projects') data = tables.projects;
    else if (url.pathname.includes('/site-reports/')) data = tables.site_reports;
    return route.fulfill({ json: data, headers });
   });
   let errors = [];
   page.on('pageerror', error => errors.push(error.message));
   for (const file of files(path.join(root, 'frontend/src/app', portal)).filter(file => file.endsWith('.tsx') && !file.endsWith('_layout.tsx'))) {
    const route = '/' + path.relative(path.join(root, 'frontend/src/app'), file).replaceAll('\\', '/').replace(/\.tsx$/, '').replace(/\/index$/, '').replace(/\[[^\]]+\]/g, uid);
    if (process.env.UI_AUDIT_ROUTE && !process.env.UI_AUDIT_ROUTE.split(',').includes(route)) continue;
    const modalTriggers={
     '/admin/dashboard':'+ New Project',
     [`/admin/projects/${uid}/commercial`]:'Add variation',
     '/pm/payroll':'Run Payroll Batch',
     '/site-manager/issues':'Report Issue',
     '/site-manager/reports/create':'Add Material',
     '/site-manager/attendance':'Manual Check In/Out',
     [`/supplier/orders/${uid}`]:'Counter Admin',
    };
    if(process.env.UI_AUDIT_MODALS&&!modalTriggers[route])continue;
    errors = [];
    try {
     await page.setViewportSize({ width: 390, height: 844 });
     await page.goto(preview + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
     await page.getByLabel('Open notifications', { exact: true }).first().waitFor({ timeout: 15000 });
     await page.waitForTimeout(300);
     if(process.env.UI_AUDIT_KEYBOARD&&route==='/admin/insights'){
      await page.getByRole('button',{name:'Sort by column',exact:true}).click();
      const search=page.getByRole('textbox',{name:'Search options',exact:true});
      if(await search.evaluate(element=>element===document.activeElement))throw new Error('Mobile dropdown unexpectedly opens the keyboard');
      await search.fill('Variance');
      await page.evaluate(()=>{window.__qaVisualHeight=300;window.__qaVisualTop=80;window.visualViewport.dispatchEvent(new Event('resize'));});
      await page.waitForTimeout(150);
      const menu=await page.getByTestId('select-options-menu').boundingBox();
      if(!menu||menu.x<12||menu.x+menu.width>378||menu.y<92||menu.y+menu.height>368)throw new Error('Dropdown extends outside simulated keyboard viewport');
      await page.getByRole('button',{name:'Variance',exact:true}).click();
      await page.getByText(/Ascending/).first().waitFor();
      await page.evaluate(()=>{window.__qaVisualHeight=0;window.__qaVisualTop=0;window.visualViewport.dispatchEvent(new Event('resize'));});
      console.log('PASS searchable mobile dropdown selection inside simulated keyboard viewport');
     }
     if(process.env.UI_AUDIT_SORTING&&route==='/admin/materials/orders'){
      await page.setViewportSize({width:1440,height:900});
      await page.waitForTimeout(300);
      await page.getByRole('button',{name:'Sort by Total Cost, ascending',exact:true}).click();
      await page.getByText('SORT-001',{exact:true}).waitFor();
      if(await page.getByText('SORT-051',{exact:true}).count())throw new Error('Sorting did not limit the first page');
      await page.getByRole('button',{name:'Next page',exact:true}).click();
      await page.getByText('SORT-026',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Sort by Total Cost, descending',exact:true}).click();
      await page.getByText('SORT-051',{exact:true}).waitFor();
      if(!await page.getByRole('button',{name:'Previous page',exact:true}).isDisabled())throw new Error('Sorting did not reset pagination');
      console.log('PASS server sorting spans all 51 orders and resets page after direction change');
     }
     if(process.env.UI_AUDIT_SORTING && route==='/admin/projects'){
      await page.setViewportSize({width:1440,height:900});
      await page.getByRole('button',{name:'Sort by Project Name, ascending',exact:true}).click();
      const checkOrder=async names=>{
       const positions=await Promise.all(names.map(async name=>{const rect=await page.getByText(name,{exact:true}).last().boundingBox();if(!rect)throw new Error('Missing sorted row '+name);return rect.y;}));
       if(!positions.every((y,index)=>!index||y>positions[index-1]))throw new Error('Incorrect sorting order: '+names.join(', '));
      };
      await checkOrder(['Sort Project 1','Sort Project 2','Sort Project 10']);
      await page.getByRole('button',{name:'Sort by Project Name, descending',exact:true}).click();
      await checkOrder(['Sort Project 10','Sort Project 2','Sort Project 1']);
      await page.setViewportSize({width:390,height:844});
      await page.getByRole('button',{name:'Reverse sort direction',exact:true}).click();
      await checkOrder(['Sort Project 1','Sort Project 2','Sort Project 10']);
      console.log('PASS desktop ascending/descending and mobile sort direction with natural project names');
     }
     if(process.env.UI_AUDIT_AUDIT_DETAILS&&route==='/admin/audit'){
      await page.getByRole('button',{name:'View details',exact:true}).click();
      await page.getByText('Before: Rs. 100,000.00',{exact:true}).waitFor();
      await page.getByText('After: Rs. 125,000.00',{exact:true}).waitFor();
      await page.getByText('Before: +94000000001',{exact:true}).waitFor();
      await page.getByText('After: +94000000002',{exact:true}).waitFor();
      await page.getByText('Values were not captured in this older log. They cannot be recovered from the audit history.',{exact:true}).waitFor();
      await page.getByText('Current saved value: qa_current@example.invalid',{exact:true}).waitFor();
      if(await page.getByText('Not recorded / omitted',{exact:true}).count())throw new Error('Technical audit placeholders should not appear');
      await page.getByText(`User ID: ${uid}`,{exact:true}).waitFor();
     }
     if(process.env.UI_AUDIT_PAYROLL_MODAL && route==='/pm/payroll'){
      await page.getByText('Run Payroll Batch',{exact:true}).click();
      await page.getByText('Verify attendance before payroll',{exact:true}).waitFor();
      if(process.env.UI_AUDIT_PAYROLL_STATE){
       await page.getByRole('button',{name:'Load attendance for review',exact:true}).click();
       await page.getByText('Fixture Worker',{exact:true}).last().waitFor();
       if(process.env.UI_AUDIT_PAYROLL_STATE==='conflict'){
        await page.getByRole('button',{name:'Generate Slips',exact:true}).click();
        await page.getByText('Fixture worker with a long payroll record name',{exact:true}).waitFor();
       }
      }
     }
     if(process.env.UI_AUDIT_MODALS){
      await page.getByText(modalTriggers[route],{exact:true}).first().click();
      await page.getByTestId('modal-content-viewport').last().waitFor();
      if(process.env.UI_AUDIT_KEYBOARD){
       await page.evaluate(()=>{window.__qaVisualHeight=300;window.__qaVisualTop=80;window.visualViewport.dispatchEvent(new Event('resize'));});
       await page.waitForTimeout(150);
       const modal=await page.getByTestId('modal-content-viewport').last().boundingBox();
       if(!modal||modal.y<80||modal.y+modal.height>380)throw new Error('Modal extends outside simulated keyboard viewport');
       await page.evaluate(()=>{window.__qaVisualHeight=0;window.__qaVisualTop=0;window.visualViewport.dispatchEvent(new Event('resize'));});
       console.log('PASS simulated keyboard modal bounds',route);
      }
     }
     for (const width of process.env.UI_AUDIT_WIDTHS ? process.env.UI_AUDIT_WIDTHS.split(',').map(Number) : [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: process.env.UI_AUDIT_HEIGHT ? Number(process.env.UI_AUDIT_HEIGHT) : width < 768 ? 844 : 900 });
      await page.waitForTimeout(350);
      if(process.env.UI_AUDIT_SCROLL_TO)await page.getByText(process.env.UI_AUDIT_SCROLL_TO,{exact:true}).first().evaluate(element=>element.scrollIntoView({block:'start'}));
      const geometry = await page.evaluate(() => ({
       headers: document.querySelectorAll('[aria-label="Open notifications"]').length,
       menus: document.querySelectorAll('[aria-label="Expand sidebar"],[aria-label="Collapse sidebar"],[aria-label="Open navigation menu"]').length,
       overflow: document.documentElement.scrollWidth > innerWidth + 1,
       boundedContent: [...document.querySelectorAll('[data-testid="page-content-scroll"]')].map(element=>{
        const content=element.firstElementChild;
        if(!content)return null;
        const bounds=content.getBoundingClientRect(),limit=parseFloat(getComputedStyle(content).maxWidth);
        return {width:Math.round(bounds.width),limit,exceeds:bounds.width>limit+1};
       }).filter(Boolean),
       renderError: /Uncaught Error|Unmatched Route|Log 1 of/.test(document.body.innerText),
       wrappedTokens: [...document.querySelectorAll('[dir="auto"]')].filter(element=>{
        if(!/^(Approved|Rejected|Pending|Draft|Pending Delivery|Pending Approval|In Progress|Completed|Received|Confirmed|Suggested|Low Stock|Out of Stock|Paid|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} [A-Za-z]{3} \d{4})$/i.test(element.textContent.trim()))return false;
        const rect=element.getBoundingClientRect();if(!rect.width||!rect.height||element.closest('[aria-hidden="true"]'))return false;
        const range=document.createRange();range.selectNodeContents(element);
        return new Set([...range.getClientRects()].filter(rect=>rect.width>0).map(rect=>Math.round(rect.top))).size>1 || element.scrollWidth>element.clientWidth+2;
       }).map(element=>element.textContent),
       outside: [...document.querySelectorAll('input,button,[role="button"],[dir="auto"]')].filter(element => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.right <= 0 || element.closest('[aria-hidden="true"]')) return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
         if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) return false;
        }
        return rect.left < -1 || rect.right > innerWidth + 1;
       }).map(element => (element.textContent || element.getAttribute('placeholder') || 'input').slice(0, 70)),
      }));
      const result = { route, width, ...geometry, errors: [...errors] };
      if(process.env.UI_AUDIT_PAYROLL_MODAL && route==='/pm/payroll'){
       const viewport=page.getByTestId('modal-content-viewport').last();
       const review=page.getByText('Verify attendance before payroll',{exact:true});
       const load=page.getByRole('button',{name:'Load attendance for review',exact:true});
       const generate=page.getByRole('button',{name:'Generate Slips',exact:true});
       await load.scrollIntoViewIfNeeded();
       const outer=await viewport.boundingBox(),r=await review.boundingBox(),l=await load.boundingBox();
       const fits=rect=>rect&&rect.x>=outer.x-1&&rect.x+rect.width<=outer.x+outer.width+1;
       if(!fits(r)||!fits(l))result.modalError='Attendance review overflows payroll modal';
       await generate.scrollIntoViewIfNeeded();
       const g=await generate.boundingBox();
       const cancel=await page.getByRole('button',{name:'Cancel payroll batch',exact:true}).boundingBox();
       if(!fits(g)||!fits(cancel)||g.height<44||cancel.width<48)result.modalError='Payroll action buttons clip';
       if(width<1024&&cancel.y<=g.y)result.modalError='Mobile payroll actions are not stacked';
       if(width>=1024&&Math.abs(cancel.y-g.y)>5)result.modalError='Desktop payroll actions are not aligned';
      }
      if(process.env.UI_AUDIT_MODALS){
       const viewport=page.getByTestId('modal-content-viewport').last();
       const outer=await viewport.boundingBox();
       if(!outer||outer.x<0||outer.x+outer.width>width+1||outer.height>page.viewportSize().height*.85+2)result.modalError='Modal viewport exceeds available space';
       for(const input of await viewport.locator('input:visible,textarea:visible').all()){
        await input.scrollIntoViewIfNeeded();
        const box=await input.boundingBox();
        if(!box||box.x<outer.x-1||box.x+box.width>outer.x+outer.width+1)result.modalError='Modal input extends outside the panel';
       }
       if(process.env.UI_AUDIT_MOBILE_ACTIONS)for(const action of await viewport.locator('button:visible,[role="button"]:visible,[tabindex="0"]:visible').all()){
        await action.scrollIntoViewIfNeeded();
        const box=await action.boundingBox();
        if(!box||box.x<outer.x-1||box.x+box.width>outer.x+outer.width+1||box.y<outer.y-1||box.y+box.height>outer.y+outer.height+1)result.modalError='Modal action cannot be fully reached by scrolling: '+(await action.textContent()).slice(0,100)+' '+JSON.stringify({box,outer});
       }
      }
      results.push(result);
      if (process.env.UI_AUDIT_SCREENSHOTS && [390,1440,1680].includes(width)) await page.screenshot({ path: path.join(output, route.replace(/\W/g, '_') + '-' + width + '-preview.png') });
      if (geometry.overflow || geometry.renderError || geometry.outside.length || geometry.wrappedTokens.length || errors.length) await page.screenshot({ path: path.join(output, route.replace(/\W/g, '_') + '-' + width + '.png') });
     }
     console.log('CHECKED', route);
    } catch (error) { results.push({ route, error: error.message }); console.log('FAIL', route, error.message.slice(0, 180)); }
    fs.writeFileSync(path.join(output, 'system-ui-results.json'), JSON.stringify(results, null, 2));
   }
   await context.close();
  }
 } finally { await browser.close(); }
 const failed = results.filter(row => row.error || row.modalError || row.headers !== 1 || row.menus !== 1 || row.overflow || row.boundedContent?.some(item=>item.exceeds) || row.renderError || row.outside?.length || row.wrappedTokens?.length || row.errors?.length);
 console.log('RESULT', results.length, 'checks;', failed.length, 'failures');
 if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
