/* Exercises the running app with synthetic, intercepted data. No live writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const dotenv = require('dotenv');
const fixtures = require('./responsive-fixtures.cjs');
const config = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')));
const base = process.env.PROCUREMENT_PREVIEW_URL || 'http://127.0.0.1:8082';
const sbHost = new URL(config.EXPO_PUBLIC_SUPABASE_URL).hostname;
const storageKey = `sb-${sbHost.split('.')[0]}-auth-token`;
const uid = '00000000-0000-0000-0000-000000000001';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const role of ['super_admin', 'pm']) {
      const tables = fixtures(role);
      const orders = Array.from({ length: 61 }, (_, index) => ({
        ...tables.purchase_orders[0], id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        po_number: `PO-${String(index + 1).padStart(3, '0')}`, items: index === 40 ? 'Needle material' : 'Cement',
        supplier_name: 'QA Supplier', total_price: 100, status: index < 30 ? 'Confirmed' : 'Delivered',
      }));
      const reads = [], errors = [], writes = [];
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const user = { id: uid, email: 'qa@example.invalid', role: 'authenticated', aud: 'authenticated', user_metadata: { role } };
      const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp, role: 'authenticated' })).toString('base64url')}.fixture`;
      await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: { access_token: token, refresh_token: 'fixture', expires_at: exp, token_type: 'bearer', user } });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.on('pageerror', error => errors.push(error.message));
      await page.routeWebSocket('**/*', ws => ws.close());
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === new URL(base).origin) return route.continue();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (!['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
        if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user, headers });
        if (url.pathname.endsWith('/rest/v1/purchase_orders')) {
          reads.push({ query: Object.fromEntries(url.searchParams), headers: request.headers() });
          let rows = orders;
          if (url.searchParams.get('status')) rows = rows.filter(row => row.status === url.searchParams.get('status').slice(3));
          if (url.searchParams.has('or')) rows = rows.filter(row => row.items.includes('Needle'));
          const total = rows.length;
          const offset = Number(url.searchParams.get('offset') || 0);
          const limit = Number(url.searchParams.get('limit') || 25);
          rows = rows.slice(offset, offset + limit);
          return route.fulfill({ json: rows, headers: { ...headers, 'content-range': `${offset}-${offset + rows.length - 1}/${total}` } });
        }
        if (url.pathname.startsWith('/rest/v1/')) {
          let rows = tables[url.pathname.split('/').pop()] || [];
          for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
          return route.fulfill({ json: request.headers().accept?.includes('object+json') ? rows[0] || {} : rows, headers });
        }
        return route.fulfill({ json: [], headers });
      });
      const portal = role === 'pm' ? 'pm' : 'admin';
      await page.goto(`${base}/${portal}/materials/orders?project_id=${uid}`);
      await page.getByText('1–25 of 61 orders', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await page.getByText('26–50 of 61 orders', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await page.getByText('51–61 of 61 orders', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Previous page', exact: true }).click();
      await page.getByText('26–50 of 61 orders', { exact: true }).waitFor();
      await page.getByLabel('Search purchase orders', { exact: true }).fill('Needle');
      await page.getByText('1–1 of 1 orders', { exact: true }).waitFor();
      await page.getByText('Needle material', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Clear order search', exact: true }).click();
      await page.getByText('1–25 of 61 orders', { exact: true }).waitFor();
      await page.getByText('Confirmed', { exact: true }).first().click();
      await page.getByText('1–25 of 30 orders', { exact: true }).waitFor();
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      assert(reads.every(read => read.query.limit === '25' && read.query.project_id === `eq.${uid}`));
      assert(reads.some(read => read.query.or?.includes('items.ilike.')));
      assert(reads.every(read => read.headers.prefer?.includes('count=exact')));
      assert.deepEqual(errors, []); assert.deepEqual(writes, []);
      console.log(`PASS ${role}: pagination, cross-page search, filters, project scope and responsive layout`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
