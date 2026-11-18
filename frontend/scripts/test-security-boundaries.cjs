const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const context = { exports: {}, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  }, ...globals };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context.exports;
}
(async () => {
  let session = { user: { id: 'A' }, access_token: 'token-A', expires_at: 9999999999 };
  let authChanged;
  let responseGate;
  const requests = [];
  const { api, clearApiCache } = load('../src/services/api.ts', {
    '../lib/apiUrl': { getApiUrl: () => 'https://fixture.invalid/api', normalizeFetchError: e => e },
    '../lib/supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: fn => { authChanged = fn; },
    } } },
  }, { AbortController, setTimeout, clearTimeout, fetch: async (url, options) => {
    const owner = options.headers.Authorization;
    requests.push({ url, owner });
    if (responseGate) await responseGate;
    return { ok: true, status: 200, json: async () => ({ owner }) };
  } });
  assert.equal((await api.projects.getAll()).owner, 'Bearer token-A');
  session = { ...session, user: { id: 'B' }, access_token: 'token-B' };
  authChanged();
  assert.equal((await api.projects.getAll()).owner, 'Bearer token-B');
  assert.equal(requests.length, 2);
  const freshStart = requests.length;
  await Promise.all([api.getFresh('/same-fresh-read'), api.getFresh('/same-fresh-read')]);
  assert.equal(requests.length - freshStart, 1);
  await api.getFresh('/same-fresh-read');
  assert.equal(requests.length - freshStart, 2);
  console.log('PASS concurrent fresh reads coalesce without caching completed results');
  let release;
  responseGate = new Promise(resolve => { release = resolve; });
  const inFlight = api.getFresh('/delayed');
  await new Promise(resolve => setTimeout(resolve, 0));
  session = { ...session, user: { id: 'C' }, access_token: 'token-C' }; authChanged();
  release();
  await assert.rejects(inFlight, /account changed/i);
  responseGate = null;
  session = null; authChanged();
  await assert.rejects(api.projects.getAll(), /sign in again/i);
  clearApiCache();
  console.log('PASS cache isolation and logout');

  const { generateLeafletHtml } = load('../src/components/common/mapHtml.ts', {});
  const html = generateLeafletHtml({ markers: [{ id: 'x', title: '</script><script>alert(1)</script>', lat: 1, lng: 1 }] });
  assert(!html.includes('</script><script>alert(1)'));
  assert(html.includes('\\u003c/script>'));
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(inline.length, 1);
  new vm.Script(inline[0]);
  console.log('PASS map script encoding and generated JavaScript syntax');

  const merge = require('../vendor/safe-deepmerge');
  for (const target of [{}, Object.create(null)]) {
    const poisoned = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"safe":1}');
    const result = merge(target, poisoned);
    assert.equal(result.polluted, undefined);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.safe, 1);
    const sourceTarget = Object.assign(Object.create(null), poisoned);
    assert.equal(merge(sourceTarget, {}).polluted, undefined);
  }
  assert.equal({}.polluted, undefined);
  console.log('PASS prototype-safe merges for source and target objects');

  const secure = new Map(); const legacy = new Map([['session', 'old-token']]);
  const { sessionStorage } = load('../src/lib/sessionStorage.ts', {
    '@react-native-async-storage/async-storage': { default: { getItem: async k => legacy.get(k) ?? null, removeItem: async k => legacy.delete(k) } },
    'expo-secure-store': { getItemAsync: async k => secure.get(k) ?? null, setItemAsync: async (k, v) => secure.set(k, v), deleteItemAsync: async k => secure.delete(k) },
    'react-native': { Platform: { OS: 'android' } },
  });
  assert.equal(await sessionStorage.getItem('session'), 'old-token');
  assert(!legacy.has('session'));
  await sessionStorage.setItem('session', 'x'.repeat(12000));
  assert.equal((await sessionStorage.getItem('session')).length, 12000);
  const unicode = 'x'.repeat(399) + '😀'.repeat(3000);
  await sessionStorage.setItem('session', unicode);
  assert.equal(await sessionStorage.getItem('session'), unicode);
  await sessionStorage.removeItem('session');
  assert.equal(await sessionStorage.getItem('session'), null);
  assert.equal(secure.size, 0);
  console.log('PASS encrypted storage migration, large sessions and logout cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
