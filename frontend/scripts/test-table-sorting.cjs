const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireMock) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const context = {exports:{}, require:requireMock};
  vm.runInNewContext(output, context);
  return context.exports;
}
const utils = load('utils/tableSort.ts');
const sort = (values, direction='asc') => Array.from(utils.sortTableRows(values, x=>x, direction));
assert.deepEqual(sort([10,2,100]), [2,10,100]);
assert.deepEqual(sort(['Rs. 2M','LKR 10,000','Rs. 150K']), ['LKR 10,000','Rs. 150K','Rs. 2M']);
assert.deepEqual(sort(['Project 10','project 2','Project 1']), ['Project 1','project 2','Project 10']);
assert.deepEqual(sort(['20/11/2026','2025-01-01','19 Nov 2026']), ['2025-01-01','19 Nov 2026','20/11/2026']);
for (const direction of ['asc','desc']) {
  const result=sort([null,10,undefined,2,''],direction);
  assert.deepEqual(result.slice(0,2),direction==='asc'?[2,10]:[10,2]);
  assert.deepEqual(result.slice(2),[null,undefined,'']);
}
const rows=[{value:2,link:'/second'},{value:1,link:'/first'},{value:2,link:'/third'}];
const ordered=Array.from(utils.sortTableRows(rows,x=>x.value,'asc'));
assert.deepEqual(ordered.map(x=>x.link),['/first','/second','/third']);
assert.deepEqual(rows.map(x=>x.link),['/second','/first','/third']);
let cursor=0, state=[], changes=0;
const {useTableSort}=load('hooks/useTableSort.ts',name=>name==='react'?{useState:initial=>{
  const index=cursor++; if(!(index in state))state[index]=initial;
  return [state[index],value=>{state[index]=value;}];
}}:utils);
const render=()=>{cursor=0;return useTableSort({Name:x=>x.name,Amount:x=>x.amount},()=>changes++);};
let hook=render();
assert.equal(hook.column,'');
hook.select('Amount'); hook=render(); assert.equal(hook.direction,'asc');
hook.select('Amount'); hook=render(); assert.equal(hook.direction,'desc');
hook.select('Name'); hook=render(); assert.equal(hook.direction,'asc');
hook.select('Unknown'); hook=render(); assert.equal(hook.column,'Name'); assert.equal(changes,3);
console.log('PASS table sorting: numeric, currency, natural text, dates, empty values, stable links, immutable input and column toggles');
