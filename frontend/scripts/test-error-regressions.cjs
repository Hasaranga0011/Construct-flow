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
  const { api } = load('../src/services/api.ts', {
    process: { env: { EXPO_PUBLIC_API_URL: 'http://fixture.invalid/api' } },
    require: name => {
      assert.equal(name, '../lib/supabase');
      return { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } } }) } } };
    },
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
})().catch(error => { console.error(error); process.exitCode = 1; });
