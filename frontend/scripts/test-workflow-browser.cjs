/* Run against the fixture export on 127.0.0.1:8085. No live services. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fixtures = require('./responsive-fixtures.cjs');
const uid = '00000000-0000-0000-0000-000000000001';
const base = process.env.WORKFLOW_PREVIEW_URL || 'http://127.0.0.1:8085';
const results = [];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    async function scenario(role, approved, fn, options = {}) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const tables = fixtures(role);
      const boqFixture = require('./boq-fixture.cjs')(uid);
      if(options.boqPartial){boqFixture.requires_reupload=true;boqFixture.boq_data.items_count=250;}
      tables.profiles[0].is_approved = approved;
      tables.projects[0].status = 'In Progress';
      tables.purchase_orders[0].status = 'Delivered';
      tables.purchase_orders[0].quantity_received = 0;
      tables.salary_slips[0].project_id = uid;
      if(options.manualAttendance){
        const workerId=uid.slice(0,-1)+'2';
        tables.profiles.push({...tables.profiles[0],id:workerId,role:'worker',full_name:'Assigned QA Worker',is_approved:true});
        tables.workers.push({id:workerId,user_id:workerId});tables.site_workers=[{project_id:uid,worker_id:workerId}];
      }
      if(options.estimates)tables.estimations=['Approved','Pending','Rejected'].map((status,index)=>({id:index?uid.slice(0,-1)+(index+2):uid,project_id:uid,project_name:'Fixture '+status+' Residence with a long project title',status,estimated_cost:9079000,created_at:'2026-10-22T12:30:00Z'}));
      if(options.workerSummary)tables.salary_slips.push({...tables.salary_slips[0],id:'second-slip',total_amount:5000,basic_pay:5000,overtime_pay:0,total_days:1,total_hours:8,daily_rate:5000});
      const mutations = [], errors = [], blocked = [], reads = [];
      tables.commercial = { payments:[{id:'payment1',project_id:uid,description:'Fixture foundation',amount:50000,due_date:'2030-01-01',status:'Pending'}],variations:[{id:'variation1',project_id:uid,title:'Fixture boundary wall',description:'Additional project scope',amount:15000,status:'Pending'}] };
      tables.shared_documents=[];

      const user = { id: uid, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', user_metadata: { role: 'super_admin' }, app_metadata: { provider: 'email' } };
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, exp, role: 'authenticated' })).toString('base64url') + '.fixture';
      await page.addInitScript(session => { if(window.top===window)localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)); }, { access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user });
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => d.accept());
      await page.routeWebSocket('**/*', ws => ws.close());
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === new URL(base).origin) return route.continue();
        if (!['fixture.supabase.co', 'api.fixture.invalid'].includes(url.hostname)) {
          blocked.push(url.hostname); return route.abort();
        }
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        let data = [];
        if (url.pathname.startsWith('/auth/v1/')) data = user;
        else if (url.pathname.startsWith('/rest/v1/')) {
          const table = url.pathname.split('/').pop();
          if(request.method()==='GET') reads.push({table,query:url.search});
          if(url.pathname.endsWith('/rpc/review_variation')) {
            const body=request.postDataJSON();mutations.push({path:url.pathname,body});
            tables.commercial.variations.find(row=>row.id===body.p_id).status=body.p_approve?'Approved':'Rejected';
          }
          data = tables[table] || [];
          for (const [k, v] of url.searchParams) {
            if (v.startsWith('eq.')) data = data.filter(r => String(r[k]) === v.slice(3));
            if (v.startsWith('in.(')) data = data.filter(r => v.slice(4, -1).split(',').includes(String(r[k])));
          }
          if (request.headers().accept?.includes('object+json')) data = data[0] || {};
        } else {
          if(/\/documents\/estimation\/[^/]+\/pdf$/.test(url.pathname))return route.fulfill({body:'%PDF-1.4\nFixture QA document\n%%EOF',contentType:'application/pdf',headers:{'access-control-allow-origin':'*'}});
          if (request.method() !== 'GET' && !request.headers()['content-type']?.includes('multipart/form-data')) mutations.push({ path: url.pathname, body: request.postDataJSON() });
          if (url.pathname.startsWith('/api/boq/')) {
            if(request.method()==='PUT') {
              if(options.boqConflict){boqFixture.revision=2;return route.fulfill({status:409,json:{detail:'BOQ changed. Reload before saving your revision'},headers:{'access-control-allow-origin':'*'}});}
              boqFixture.boq_data=request.postDataJSON().boq_data;boqFixture.revision++;
            }
            data=options.boq?boqFixture:{revision:0,lines:[],materials:[]};
          }
          else if(url.pathname.endsWith('/projects/parse-boq'))data=boqFixture.boq_data;
          else if (/\/workflow\/projects\/[^/]+\/commercial$/.test(url.pathname)) {
            if(request.method()==='POST') {
              const body=request.postDataJSON();
              tables.commercial[body.kind==='payment'?'payments':'variations'].push({id:'created-record',project_id:uid,status:'Pending',...body});
            }
            data=tables.commercial;
          }
          else if (/\/workflow\/projects\/[^/]+\/documents$/.test(url.pathname)) {
            if(request.method()==='POST')tables.shared_documents.push({id:'document1',project_id:uid,...request.postDataJSON()});
            data=tables.shared_documents;
          }
          else if(url.pathname.endsWith('/workflow/attendance'))data=[{id:'att1',worker_name:'Fixture Worker',date:'2026-11-01',hours_worked:8,overtime_hours:0,check_in_time:'2026-11-01T02:30:00Z',check_out_time:'2026-11-01T10:30:00Z'}];
          else if(url.pathname.endsWith('/labour/worker/site'))data={project:tables.projects[0],site:tables.sites[0],manager:null};
          else if(url.pathname.endsWith('/labour/worker/payroll'))data=options.workerSummary?{summary_kind:'recorded_slips',final:true,slip_count:2,slips:tables.salary_slips,total_days:21,total_hours:168,overtime_hours:10,basic_pay:95000,overtime_pay:5000,deductions:0,total_pay:100000,daily_rate:null,includes_cross_month_periods:true}:{total_days:1,total_hours:8,overtime_hours:0,basic_pay:3500,overtime_pay:0,total_pay:3500,final:false};
          else if(url.pathname.endsWith('/labour/salary/generate')) {
            if(options.payrollOverlap)return route.fulfill({status:409,json:{detail:{code:'payroll_overlap',message:'Salary slips already cover part of this pay period. No new slips were created. Review the existing slips and choose a non-overlapping period.',conflicts:[{id:uid,worker_id:uid,worker_name:'Fixture Worker',period_start:'2026-11-01',period_end:'2026-11-15',status:'Paid'}]}},headers:{'access-control-allow-origin':'*'}});
            data={generated:1,slips:[{worker_id:uid}]};
          }
          else if(/\/labour\/salary\/[^/]+\/paid$/.test(url.pathname)) {
            tables.salary_slips[0].status='Paid';data=tables.salary_slips[0];
          }
          else if (url.pathname.endsWith('/workflow/material-requests')) data = { requests: [{ id: 'request1', project_id: uid, item_name: 'Fixture Cement', quantity: 10, unit: 'bags', status: 'Pending Approval' }], suppliers: [{ id: 'supplier1', project_id: uid, full_name: 'Fixture Supplier' }], projects: tables.projects };
          else if (url.pathname.endsWith('/notifications/')) data = [];
          else if (url.pathname.includes('/purchase-orders/') && url.pathname.endsWith('/receive')) data = Object.assign(tables.purchase_orders[0], { quantity_received: request.postDataJSON().quantity });
          else if (url.pathname.includes('/workflow/')) data = {};
          else data = [];
        }
        return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' } });
      });
      try { await fn(page, mutations, reads); assert.deepEqual(errors, []); }
      catch (error) { console.error('PAGE', page.url(), (await page.locator('body').innerText()).slice(-5500)); throw error; }
      finally { await context.close(); }
    }
    if(!process.env.BOQ_ONLY){
    await scenario('pm', true, async (page, mutations, reads) => {
      await page.goto(base + '/pm/materials');
      await page.getByText('Review request', { exact: true }).click();
      assert.equal(reads.filter(row=>row.table==='projects').length,1,'Materials reuse one project-scope query across panels');
      await page.getByRole('button',{name:'Choose an assigned supplier',exact:true}).click();
      await page.getByText('Fixture Supplier',{exact:true}).click();
      await page.getByLabel('Unit price in LKR').fill('125');
      await page.getByLabel('Expected delivery date').fill('2030-01-01');
      await page.getByText('Approve and create order', { exact: true }).click();
      await page.getByText('Request approved and purchase order created.', { exact: true }).waitFor();
      const call = mutations.find(m => m.path.endsWith('/material-requests/request1/review'));
      assert.deepEqual(call.body, { approve: true, supplier_id: 'supplier1', unit_price: 125, expected_date: '2030-01-01' });
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px overflow`);
      }
      results.push('PM request review sends one complete approval transaction at five viewport widths');
    });
    await scenario('site_manager', true, async (page, mutations) => {
      await page.goto(base + '/site-manager/materials');
      const incoming = page.getByText(/Incoming Deliveries/).first();
      await incoming.waitFor(); await incoming.click();
      await page.getByLabel('Quantity actually received').first().fill('3');
      await page.getByLabel('Delivery receipt note').first().fill('3 accepted; remainder pending');
      await page.getByRole('button', { name: 'Confirm accepted quantity', exact: true }).first().click();
      await page.getByText(/97 outstanding/).first().waitFor();
      const call = mutations.find(m => m.path.endsWith('/receive'));
      assert.equal(call.body.quantity, 3);
      assert.match(call.body.receipt_id, /^[0-9a-f-]{36}$/);
      results.push('Site manager submits actual partial quantity with an idempotency identifier');
    });
    await scenario('pm', false, async page => {
      await page.goto(base + '/pm/materials');
      await page.waitForURL('**/pending-approval');
      assert.equal(await page.getByText('Review request', { exact: true }).count(), 0);
      results.push('Unapproved PM cannot mount operational material review');
    });
    await scenario('worker', true, async page => {
      await page.goto(base + '/admin/materials');
      await page.waitForURL('**/worker/dashboard');
      assert.equal(await page.getByText('Review request', { exact: true }).count(), 0);
      results.push('User metadata claiming admin cannot override the worker profile');
    });
    await scenario('pm', true, async(page,mutations)=>{
      await page.goto(base+'/pm/projects/'+uid+'/commercial');
      await page.getByRole('button',{name:'Add payment',exact:true}).click();
      await page.getByLabel('Payment description',{exact:true}).fill('Foundation test stage');
      await page.getByLabel('Amount (LKR)',{exact:true}).fill('60000');
      await page.getByLabel('Payment due date',{exact:true}).fill('2030-01-01');
      await page.getByRole('button',{name:'Save payment stage',exact:true}).click();
      await page.getByText('Foundation test stage',{exact:true}).waitFor();
      assert(mutations.some(row=>row.body?.kind==='payment'&&row.body.amount===60000));
      await page.getByRole('button',{name:'Add variation',exact:true}).click();
      await page.getByLabel('Variation title',{exact:true}).fill('Extra test wall');
      await page.getByLabel('Scope and reason',{exact:true}).fill('Client requested an additional wall');
      await page.getByLabel('Amount (LKR)',{exact:true}).fill('15000');
      await page.getByRole('button',{name:'Submit for client approval',exact:true}).click();
      await page.getByText('Extra test wall',{exact:true}).waitFor();
      assert(mutations.some(row=>row.body?.kind==='variation'&&row.body.title==='Extra test wall'));
      results.push('PM creates project-scoped payment stages and pending variations through shared forms');
    });
    await scenario('client',true,async(page,mutations)=>{
      await page.goto(base+'/client/financials');
      await page.getByRole('button',{name:'Approve variation',exact:true}).click();
      await page.getByText('Variation approved. The project budget has been updated.',{exact:true}).waitFor();
      assert(mutations.some(row=>row.path.endsWith('/rpc/review_variation')&&row.body.p_approve===true));
      results.push('Client can discover and approve pending project variations');
    });
    await scenario('pm',true,async(page,mutations)=>{
      await page.goto(base+'/pm/projects/'+uid+'/documents');
      await page.getByRole('button',{name:'Add document',exact:true}).click();
      await page.getByLabel('Document name',{exact:true}).fill('Test approved plan');
      await page.getByLabel('Secure document URL',{exact:true}).fill('https://example.invalid/approved-plan.pdf');
      await page.getByRole('button',{name:'Share document',exact:true}).click();
      await page.getByText('Test approved plan',{exact:true}).waitFor();
      assert(mutations.some(row=>row.path.endsWith('/documents')&&row.body.name==='Test approved plan'));
      results.push('Managers attach and expose project documents using a named secure link');
    });
    await scenario('admin',true,async(page,mutations)=>{
      await page.goto(base+'/admin/payroll/generate?project='+uid);
      await page.getByRole('button',{name:'Load attendance for review',exact:true}).click();
      await page.getByText('Fixture Worker',{exact:true}).waitFor();
      await page.getByRole('button',{name:'I have reviewed these records — approve attendance',exact:true}).click();
      await page.getByText('Attendance approved. You can now generate salary slips.',{exact:true}).waitFor();
      assert(mutations.some(row=>row.path.endsWith('/workflow/attendance/review')&&row.body.project_id===uid));
      results.push('Payroll retains the selected project and requires an explicit attendance review');
    });
    await scenario('pm',true,async(page,mutations)=>{
      await page.goto(base+'/pm/payroll?project='+uid);
      await page.getByLabel('View salary slip '+uid,{exact:true}).click();
      await page.getByRole('button',{name:'Record salary payment',exact:true}).click();
      await page.getByLabel('Confirm amount paid',{exact:true}).fill('1');
      await page.getByRole('button',{name:'Confirm salary paid',exact:true}).click();
      await page.getByText('Enter the exact salary amount to confirm payment.',{exact:true}).waitFor();
      assert(!mutations.some(row=>row.path.endsWith('/paid')));
      await page.getByLabel('Confirm amount paid',{exact:true}).fill('95000');
      await page.getByRole('button',{name:'Confirm salary paid',exact:true}).click();
      await page.getByText('Paid',{exact:true}).last().waitFor();
      assert(mutations.some(row=>row.path.endsWith('/paid')&&row.body.amount===95000));
      results.push('Salary payment requires the exact amount before updating the project slip');
    });
    for(const role of ['admin','pm'])await scenario(role,true,async(page)=>{
      await page.goto(base+(role==='admin'?'/admin/payroll/generate?project=':'/pm/payroll?project=')+uid);
      if(role==='pm')await page.getByRole('button',{name:'Run Payroll Batch',exact:true}).click();
      await page.getByRole('button',{name:role==='admin'?'Generate Salary Slips':'Generate Slips',exact:true}).click();
      await page.getByText(/Salary slips already cover part of this pay period/).waitFor();
      await page.getByText('2026-11-01 to 2026-11-15 · Paid',{exact:true}).waitFor();
      assert(!(await page.locator('body').innerText()).includes('23505'));
      for(const width of [320,390,768]) {
        await page.setViewportSize({width,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      }
      await page.getByRole('button',{name:'View existing salary slip',exact:true}).click();
      if(role==='admin')await page.waitForURL('**/admin/payroll/'+uid);
      else await page.getByText('Salary Slip Details',{exact:true}).waitFor();
      results.push(role+' payroll overlap shows existing dates and opens the salary slip');
    },{payrollOverlap:true});
    await scenario('worker',true,async(page)=>{
      await page.goto(base+'/worker/payroll');
      await page.getByText(/Basic pay across 2 recorded payslips/).waitFor();
      await page.getByText('Totals include full pay periods overlapping this month, including days outside this month.',{exact:true}).waitFor();
      const text=await page.locator('body').innerText();
      assert(text.includes('100,000'));
      assert(!text.includes('days x'));
      for(const width of [320,390,768]) {
        await page.setViewportSize({width,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      }
      results.push('Worker monthly summary combines payslips and labels cross-month pay periods without a false daily rate');
    },{workerSummary:true});
    for(const [role,action,target] of [
      ['admin','Project workspace','/admin/projects'],
      ['pm','Attendance & payroll','/pm/payroll'],
      ['site_manager','Daily reports','/site-manager/reports'],
      ['supplier','Deliveries','/supplier/deliveries'],
      ['client','Payments & variations','/client/financials'],
      ['worker','My payslips','/worker/payroll'],
    ])await scenario(role,true,async(page)=>{
      await page.goto(base+'/'+(role==='site_manager'?'site-manager':role)+'/dashboard');
      await page.getByRole('button',{name:action,exact:true}).click();
      await page.waitForURL('**'+target);
      results.push(role+' dashboard quick action opens its own role workspace');
    });
    await scenario('worker',true,async(page)=>{
      await page.goto(base+'/worker/dashboard');
      await page.getByRole('button',{name:'Show my QR',exact:true}).click();
      await page.getByRole('button',{name:'Close',exact:true}).waitFor();
      for(const [width,height] of [[320,568],[390,844]]) {
        await page.setViewportSize({width,height});
        const bounds=await page.getByTestId('modal-content-viewport').boundingBox();
        assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=height+1);
      }
      await page.getByRole('button',{name:'Close',exact:true}).click();
      results.push('Worker dashboard QR dialog fits small screens and closes accessibly');
    });
    await scenario('supplier',true,async(page)=>{
      await page.goto(base+'/supplier/dashboard');
      await page.getByRole('button',{name:'Order inbox',exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('[dir="auto"]')].some(element=>element.textContent==='Incoming Purchase Orders'&&element.getBoundingClientRect().top>=0&&element.getBoundingClientRect().top<innerHeight));
      results.push('Supplier order inbox action scrolls directly to its order register');
    });
    for(const role of ['admin','pm'])await scenario(role,true,async(page)=>{
      await page.goto(base+'/'+role+'/estimator');
      const rows=page.getByTestId('estimate-row');
      await rows.first().waitFor();
      for(const width of [320,390,768,1024,1280,1440,1680,1920]) {
        await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
        assert(await page.evaluate(()=>{
          const rows=[...document.querySelectorAll('[data-testid="estimate-row"]')];
          return document.documentElement.scrollWidth<=innerWidth+1 && rows.every(row=>{
            const badge=row.querySelector('[data-testid="status-badge"] [dir="auto"]');
            const range=document.createRange();range.selectNodeContents(badge);
            return new Set([...range.getClientRects()].filter(rect=>rect.width>0).map(rect=>Math.round(rect.top))).size===1&&badge.scrollWidth<=badge.clientWidth+1;
          });
        }));
        const buttons=await rows.nth(1).getByRole('button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
        for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++)assert(!(buttons[i].left<buttons[j].right-1&&buttons[i].right>buttons[j].left+1&&buttons[i].top<buttons[j].bottom-1&&buttons[i].bottom>buttons[j].top+1));
      }
      const downloaded=page.waitForEvent('download');
      await rows.first().getByRole('button',{name:'View PDF',exact:true}).click();
      assert((await downloaded).suggestedFilename().endsWith('.pdf'));
      results.push(role+' estimate badges remain on one line, actions do not overlap, and PDF download works at eight widths');
    },{estimates:true});
    for(const role of ['admin','pm','site_manager','supplier','client','worker'])await scenario(role,true,async(page)=>{
      const ownPortal=role==='site_manager'?'site-manager':role;
      for(const portal of ['admin','pm','site-manager','supplier','client','worker'].filter(portal=>portal!==ownPortal)){
        await page.goto(base+'/'+portal+'/dashboard');
        await page.waitForURL(url=>url.pathname==='/'+ownPortal+'/dashboard');
        await page.getByLabel('Open notifications',{exact:true}).first().waitFor();
      }
      results.push(role+' is redirected from all five other role portals');
    });
    await scenario('admin',true,async(page,mutations)=>{
      await page.goto(base+'/admin/labour');
      await page.getByRole('button',{name:'Record attendance',exact:true}).click();
      const modal=page.getByTestId('modal-content-viewport').last();
      await modal.getByText(fixtures('admin').projects[0].name,{exact:true}).click();
      await modal.getByText('Assigned QA Worker',{exact:true}).click();
      await modal.getByText('Check In',{exact:true}).click();
      await page.waitForFunction(()=>!document.body.innerText.includes('Check In Worker'));
      const writes=mutations.filter(item=>/\/labour\/?$/.test(item.path));
      assert.equal(writes.length,1);assert.equal(writes[0].body.worker_id,uid.slice(0,-1)+'2');
      assert.equal(writes[0].body.project_id,uid);assert.equal(writes[0].body.hours_worked,0);
      assert(Number.isFinite(Date.parse(writes[0].body.check_in_time)));
      results.push('Admin manual attendance selects assigned worker identity and sends one open check-in with its actual timestamp');
    },{manualAttendance:true});
    await scenario('site_manager',true,async(page)=>{
      await page.addInitScript(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new DOMException('Denied in QA','NotAllowedError');}}}));
      await page.goto(base+'/site-manager/attendance');
      await page.getByText('Scan QR',{exact:true}).click();
      await page.getByText(/Camera permission was denied/).waitFor();
      const input=page.getByPlaceholder('e.g. worker UUID or code (W-0012)');
      await input.fill('worker-test-code');assert.equal(await input.inputValue(),'worker-test-code');
      await page.getByLabel('Close QR scanner',{exact:true}).click();
      await page.getByText('Scan Worker QR Code',{exact:true}).waitFor({state:'hidden'});
      results.push('Denied browser camera keeps manual worker-code entry available and scanner closes');
    });
    const cardRoutes={admin:['projects','labour','materials','reports/projects'],pm:['projects','labour','materials','projects'],site_manager:['sites','attendance','materials','issues'],supplier:['orders','deliveries','deliveries','orders/history'],client:['project','project/milestones','financials','invoices'],worker:['attendance','attendance','attendance','payroll']};
    for(const [role,routes] of Object.entries(cardRoutes))await scenario(role,true,async(page)=>{
      const portal=role==='site_manager'?'site-manager':role;
      for(let i=0;i<routes.length;i++){
        await page.goto(base+'/'+portal+'/dashboard');
        const cards=page.getByTestId('dashboard-stat-link');
        await cards.first().waitFor();assert.equal(await cards.count(),4);
        await cards.nth(i).click();
        await page.waitForURL(url=>url.pathname==='/'+portal+'/'+routes[i]);
      }
      await page.goto(base+'/'+portal+'/dashboard');
      await page.getByTestId('dashboard-stat-link').first().waitFor();
      const panelHrefs=await page.getByTestId('dashboard-panel-link').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
      for(const href of panelHrefs){
        assert(href&&href.startsWith('/'+portal+'/'));
        await page.goto(base+'/'+portal+'/dashboard');
        await page.locator('[data-testid="dashboard-panel-link"]').filter({hasText:''}).first().waitFor();
        await page.locator('[data-testid="dashboard-panel-link"]').evaluateAll((nodes,href)=>nodes.find(node=>node.getAttribute('href')===href).click(),href);
        await page.waitForURL(url=>url.pathname===href);
      }
      results.push(role+' dashboard metric and panel links navigate to their own role details');
    });
    }
    for(const role of ['admin','pm'])await scenario(role,true,async(page,mutations)=>{
      await page.goto(`${base}/${role}/projects/${uid}/boq`);
      await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).click();
      await page.getByRole('button',{name:'Edit BOQ item',exact:true}).first().click();
      await page.getByLabel('Planned quantity',{exact:true}).fill('3');
      await page.getByRole('button',{name:'Calculate quantity × rate',exact:true}).click();
      await page.getByRole('button',{name:'Keep item changes',exact:true}).click();
      await page.getByLabel('Reason for revision',{exact:true}).fill('Corrected foundation quantities');
      await page.getByRole('button',{name:'Save BOQ revision',exact:true}).click();
      await page.getByText('BOQ revision saved. Existing stock, payments and progress were preserved.',{exact:true}).waitFor();
      const write=mutations.filter(row=>row.path===`/api/boq/${uid}`);
      assert.equal(write.length,1);assert.equal(write[0].body.expected_revision,1);assert.equal(write[0].body.boq_data.items[0].id,'00000000-0000-0000-0000-000000000201');assert.equal(write[0].body.boq_data.total_budget,3000);
      results.push(role+' edits BOQ quantities and saves one stable-ID revision with a reason');
    },{boq:true});
    await scenario('pm',true,async(page)=>{
      await page.goto(`${base}/pm/projects/${uid}/boq`);await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).click();
      await page.getByLabel('Reason for revision',{exact:true}).fill('Concurrent baseline update');await page.getByRole('button',{name:'Save BOQ revision',exact:true}).click();
      await page.getByText('BOQ changed. Reload before saving your revision',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('Reason for revision',{exact:true}).inputValue(),'Concurrent baseline update');
      await page.getByRole('button',{name:'Discard changes and reload',exact:true}).click();await page.getByText('BOQ revision 2',{exact:true}).waitFor();
      results.push('BOQ conflict keeps the editable draft and prevents a silent overwrite');
    },{boq:true,boqConflict:true});
    await scenario('client',true,async(page)=>{
      await page.goto(`${base}/client/project/${uid}/boq`);await page.getByText('Fixture BOQ project',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Save BOQ revision',exact:true}).count(),0);
      results.push('Client BOQ workspace is read-only');
    },{boq:true});
    await scenario('admin',true,async(page)=>{
      await page.goto(`${base}/admin/materials/orders/create?project_id=${uid}`);
      await page.getByRole('button',{name:'Choose a BOQ reference',exact:true}).click();
      await page.getByText('BOQ cement · 10 bags',{exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('input[placeholder="e.g. 100"]')?.value==='7');
      assert.equal(await page.getByLabel('Unit price in LKR',{exact:true}).inputValue(),'100');
      await page.getByLabel('Unit price in LKR',{exact:true}).fill('125');
      assert.equal(await page.getByLabel('Unit price in LKR',{exact:true}).inputValue(),'125');
      results.push('BOQ order selection prefills remaining quantity and rate while preserving editable supplier pricing');
    },{boq:true});
    await scenario('admin',true,async(page,mutations)=>{
      await page.goto(`${base}/admin/projects/${uid}/boq`);
      const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload BOQ for review',exact:true}).click();
      await (await chooser).setFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from('Item Description,Quantity,Rate,Amount\nFoundation,2,1000,2000')});
      await page.getByText('BOQ parsed. Review the editable items and save a revision to apply it.',{exact:true}).waitFor();
      assert.equal(mutations.filter(row=>row.path===`/api/boq/${uid}`).length,0);
      await page.getByRole('button',{name:'Cancel changes',exact:true}).click();
      await page.getByRole('button',{name:'Link existing record',exact:true}).click();
      await page.getByRole('button',{name:'Choose an existing record',exact:true}).click();await page.getByText('purchase orders · Legacy QA order',{exact:true}).click();
      await page.getByRole('button',{name:'Choose the matching BOQ item',exact:true}).click();await page.getByText('BOQ cement · 10 bags',{exact:true}).click();
      await page.getByRole('button',{name:'Save BOQ allocation',exact:true}).click();await page.getByText('Existing record linked to its BOQ item.',{exact:true}).waitFor();
      const writes=mutations.filter(row=>row.path===`/api/boq/${uid}/allocate`);assert.equal(writes.length,1);assert.equal(writes[0].body.record_id,uid);assert.equal(writes[0].body.boq_item_id,'00000000-0000-0000-0000-000000000202');
      results.push('BOQ upload stays a reviewable draft; existing records require an explicit scoped allocation');
    },{boq:true});
    await scenario('admin',true,async(page)=>{
      await page.goto(`${base}/admin/projects/${uid}/boq`);
      await page.getByText('This older BOQ contains only a saved preview. Upload the original complete file before editing its baseline; the current project budget is preserved.',{exact:true}).waitFor();
      assert(await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).isDisabled());
      assert(await page.getByRole('button',{name:'Upload BOQ for review',exact:true}).isEnabled());
      results.push('Legacy partial BOQs require a complete source upload before baseline edits');
    },{boq:true,boqPartial:true});
    results.forEach(name => console.log('PASS', name));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
