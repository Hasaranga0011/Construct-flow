const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, ...globals };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

(async () => {
  const { siteCoordinates, broadLocation, googleMapsSearchUrl } = load('../src/utils/siteLocation.ts');
  const googleSearch = new URL(googleMapsSearchUrl('Mr Kottu & branch=1'));
  assert.equal(googleSearch.hostname, 'www.google.com');
  assert.equal(googleSearch.searchParams.get('query'), 'Mr Kottu & branch=1, Sri Lanka');
  assert.equal(googleSearch.searchParams.size, 2);
  assert.equal(siteCoordinates('Enrich Arcane, Negombo'), null);
  assert.equal(siteCoordinates('408/1/1, Colombo Road'), null);
  assert.equal(siteCoordinates('51.5, -0.1'), null);
  assert.equal(siteCoordinates('NaN, 80'), null);
  assert.equal(JSON.stringify(siteCoordinates('7.210123, 79.810456')), JSON.stringify({ lat: 7.210123, lng: 79.810456 }));
  assert(broadLocation({result_type:'city'}));
  assert(broadLocation({precision:'street'}));
  assert(!broadLocation({result_type:'amenity',precision:'place'}));
  console.log('PASS exact site coordinates and broad area/street classification');
  const { pageMetadata } = load('../src/utils/pageTitles.ts');
  assert.equal(pageMetadata('/pm/projects/qa-project/boq').title, 'Project BOQ | Project Manager | ConstructAi');
  assert.equal(pageMetadata('/admin/materials/orders/create').heading, 'New Purchase Order');
  assert.equal(pageMetadata('/admin/materials/orders/qa-order').heading, 'Purchase Order Details');
  assert.equal(pageMetadata('/reset-password#access_token=private').title, 'Reset Password | ConstructAi');
  let routeCount = 0;
  function checkRouteTitles(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) checkRouteTitles(path.join(directory, entry.name), relative);
      else if (entry.name.endsWith('.tsx') && !['_layout.tsx', '+html.tsx'].includes(entry.name)) {
        const route = relative.replace(/\.tsx$/, '').replace(/\/index$/, '').replace(/\[[^\]]+\]/g, 'qa-record');
        assert.notEqual(pageMetadata(route).heading, 'Page Not Found', route);
        routeCount++;
      }
    }
  }
  checkRouteTitles(path.join(__dirname, '../src/app'));
  console.log(`PASS meaningful titles for all ${routeCount} routes and private recovery URLs`);
  const { formatCurrencyExact } = load('../src/utils/format.ts');
  assert.equal(formatCurrencyExact(4156.25), 'Rs. 4,156.25');
  assert.equal(formatCurrencyExact(95000), 'Rs. 95,000.00');
  assert.equal(formatCurrencyExact(0), 'Rs. 0.00');
  assert.equal(formatCurrencyExact(NaN), 'Not recorded');
  console.log('PASS salary and payment amounts preserve exact cents');
  const { firstRelation } = load('../src/utils/relations.ts');
  const person = { full_name: 'Site Manager', avatar_url: null };
  assert.equal(firstRelation(person), person);
  assert.equal(firstRelation([person]), person);
  assert.equal(firstRelation([]), undefined);
  assert.equal(firstRelation(null), undefined);
  assert.equal(firstRelation(undefined), undefined);
  assert.equal(firstRelation([person, { full_name: 'Other' }]), person);
  const material = { project: [{ name: 'Riverside' }] };
  assert(firstRelation(material.project).name.toLowerCase().includes('river'));
  console.log('PASS joined profile/project objects, arrays and missing relations');

  const requests = [];
  const { api, apiErrorMessage } = load('../src/services/api.ts', {
    process: { env: { EXPO_PUBLIC_API_URL: 'http://fixture.invalid/api' } },
    require: name => {
      if (name === '../lib/apiUrl') return { getApiUrl: () => 'http://fixture.invalid/api', normalizeFetchError: e => e };
      assert.equal(name, '../lib/supabase');
      return { supabase: { auth: { onAuthStateChange: () => ({}), getSession: async () => ({ data: { session: { access_token: 'fixture-token', user: { id: 'user-1' } } } }) } } };
    },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => ({ id: 'po-1', status: 'Confirmed' }) };
    },
  });
  await api.purchaseOrders.approve('po-1', {});
  assert.equal(requests[0].url, 'http://fixture.invalid/api/purchase-orders/po-1/approve');
  assert.equal(requests[0].method, 'PATCH');
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(requests[0].headers.Authorization, 'Bearer fixture-token');
  assert.deepEqual(JSON.parse(requests[0].body), {});
  await api.purchaseOrders.approve('po-1', { unit_price: 0 });
  assert.deepEqual(JSON.parse(requests[1].body), { unit_price: 0 });
  console.log('PASS approval JSON body and explicit zero price; no network calls');
  assert.equal(apiErrorMessage({ detail: [{ loc: ['body', 'quantity_ordered'], msg: 'Input should be greater than 0', input: 'private-value' }] }), 'quantity ordered: Input should be greater than 0');
  assert.equal(apiErrorMessage({ detail: 'Supplier is not assigned to this project' }), 'Supplier is not assigned to this project');
  const workflow = load('../src/utils/siteWorkflow.ts');
  const procurement = load('../src/utils/procurement.ts', { require: () => workflow });
  const valid = { projectId: 'p', supplierId: 's', material: 'm', quantity: '2', unitPrice: '0', expectedDate: '2030-02-28', unit: 'bags' };
  assert.equal(procurement.validatePurchaseOrder(valid), '');
  for (const changed of [{ quantity: '-1' }, { quantity: 'Infinity' }, { unitPrice: '' }, { unitPrice: '-1' }, { expectedDate: '2030-02-30' }, { supplierId: '' }, { unit: ' ' }]) assert(procurement.validatePurchaseOrder({ ...valid, ...changed }));
  const submissions = [];
  let resolve, reject;
  const { useOrderSubmission } = load('../src/hooks/useOrderSubmission.ts', { require: name => {
    if (name === 'react') return { useRef: value => ({ current: value }) };
    if (name.includes('procurement')) return procurement;
    return { api: { purchaseOrders: { create: data => { submissions.push(data); return new Promise((yes, no) => { resolve = yes; reject = no; }); } } } };
  } });
  const submit = useOrderSubmission();
  const failed = submit({ quantity_ordered: 2 });
  const failedAssertion = assert.rejects(failed, /connection/);
  reject(new Error('connection interrupted'));
  await failedAssertion;
  const retried = submit({ quantity_ordered: 2 });
  const concurrent = submit({ quantity_ordered: 2 });
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].request_id, submissions[1].request_id);
  resolve({ id: 'saved-order' }); await Promise.all([retried, concurrent]);
  const next = submit({ quantity_ordered: 3 });
  assert.notEqual(submissions[2].request_id, submissions[1].request_id);
  resolve({ id: 'next-order' }); await next;
  console.log('PASS shared procurement validation, readable errors and safe concurrent/retry submissions');
})().catch(error => { console.error(error); process.exitCode = 1; });
