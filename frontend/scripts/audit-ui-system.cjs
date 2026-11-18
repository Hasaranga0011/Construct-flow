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
   tables.projects[0].status = 'In Progress';
   tables.salary_slips[0].project_id = uid;
   tables.estimations=['Approved','Pending','Rejected','Draft'].map((status,index)=>({id:'00000000-0000-0000-0000-'+String(index+20).padStart(12,'0'),project_id:uid,project_name:JSON.stringify({title:'Residential construction in Colombo — phase '+(index+1),inputs:{type:'Residential',sq_ft:2500,floors:2,site:'Flat',timeline:'Standard'}}),estimated_cost:9079000+index*1000000,status,created_at:'2026-10-22T12:30:00Z'}));
   tables.purchase_orders.push({...tables.purchase_orders[0],id:'00000000-0000-0000-0000-000000000088',status:'Pending Delivery'});
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
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-range': '0-0/1' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data = [];
    if (url.pathname.startsWith('/auth/v1/')) data = user;
    else if (url.pathname.startsWith('/rest/v1/')) {
     const table = url.pathname.split('/').pop();
     data = tables[table] || [];
     for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) data = data.filter(row => String(row[key]) === value.slice(3));
      if (value.startsWith('in.(')) data = data.filter(row => value.slice(4, -1).split(',').includes(String(row[key])));
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
    errors = [];
    try {
     await page.setViewportSize({ width: 390, height: 844 });
     await page.goto(preview + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
     await page.getByLabel('Open notifications', { exact: true }).first().waitFor({ timeout: 15000 });
     await page.waitForTimeout(300);
     for (const width of process.env.UI_AUDIT_WIDTHS ? process.env.UI_AUDIT_WIDTHS.split(',').map(Number) : [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(100);
      if(process.env.UI_AUDIT_SCROLL_TO)await page.getByText(process.env.UI_AUDIT_SCROLL_TO,{exact:true}).first().evaluate(element=>element.scrollIntoView({block:'start'}));
      const geometry = await page.evaluate(() => ({
       headers: document.querySelectorAll('[aria-label="Open notifications"]').length,
       menus: document.querySelectorAll('[aria-label="Expand sidebar"],[aria-label="Collapse sidebar"],[aria-label="Open navigation menu"]').length,
       overflow: document.documentElement.scrollWidth > innerWidth + 1,
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
 const failed = results.filter(row => row.error || row.headers !== 1 || row.menus !== 1 || row.overflow || row.renderError || row.outside?.length || row.wrappedTokens?.length || row.errors?.length);
 console.log('RESULT', results.length, 'checks;', failed.length, 'failures');
 if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
