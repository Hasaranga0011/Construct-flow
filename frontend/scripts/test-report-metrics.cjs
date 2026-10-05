const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/components/reports/metrics.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} }; vm.runInNewContext(compiled, sandbox);
const m = sandbox.exports;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS', name); }
test('Missing and invalid amounts are not zero', () => {
  for (const input of [null, undefined, '', '  ', 'bad', Infinity, false]) assert.equal(m.numeric(input), null);
  assert.equal(m.numeric('0'), 0);
  assert.equal(m.sumKnown([{id:'1',total_amount:null}],m.amount),null);
  assert.equal(m.sumKnown([],m.amount),0);
});
test('Budget comparisons include zero budgets and exclude missing budgets', () => {
  assert.equal(m.overBudget({id:'1', total_budget:0, spent_cost:10}), true);
  assert.equal(m.overBudget({id:'1', total_budget:null, spent_cost:10}), false);
  assert.equal(m.overBudget({id:'1', total_budget:10, spent_cost:10}), false);
});
test('Overdue rules exclude completed/cancelled projects and dates due today', () => {
  for(const state of ['Completed','cancelled','CANCELED']) assert.equal(m.overdueProject({id:'1',status:state,end_date:'2026-01-01'},'2026-02-01'),false);
  assert.equal(m.overdueProject({id:'1',status:'In Progress',end_date:'2026-01-31'},'2026-02-01'),true);
  assert.equal(m.overdueProject({id:'1',status:'In Progress',end_date:'2026-02-01'},'2026-02-01'),false);
});
test('Stock thresholds preserve zero and handle missing values', () => {
  assert.equal(m.stockFlag({id:'1',current_stock:0,minimum_threshold:0}),'Out of stock');
  assert.equal(m.stockFlag({id:'1',current_stock:5,minimum_threshold:5}),'Within threshold');
  assert.equal(m.shortage({id:'1',current_stock:2,minimum_threshold:5}),3);
  assert.equal(m.shortage({id:'1',current_stock:null,minimum_threshold:5}),null);
  assert.equal(m.stock({id:'1',current_stock:0,global_stock_quantity:10}),0);
});
test('Payroll uses actual generated fields and does not classify unknown as pending', () => {
  const row={id:'1',site_id:'site-1',total_amount:0,total_payout:50,total_overtime_hours:4,period_start:null};
  assert.equal(m.siteId(row),'site-1'); assert.equal(m.amount(row),0); assert.equal(m.overtime(row),4);
  assert.equal(m.monthKey(row.period_start),null); assert.equal(m.pendingPay(row),false);
  assert.equal(m.pendingPay({id:'1',status:'Pending'}),true);
});
test('Late delivery excludes delivered and cancelled orders', () => {
  assert.equal(m.lateOrder({id:'1',status:'Pending Delivery',expected_date:'2026-01-01'},'2026-01-02'),true);
  for(const state of ['Delivered','Cancelled','Rejected']) assert.equal(m.lateOrder({id:'1',status:state,expected_date:'2026-01-01'},'2026-01-02'),false);
  assert.equal(m.orderValue({id:'1',quantity_ordered:4,unit_price:20}),80);
  assert.equal(m.orderValue({id:'1',quantity_ordered:4}),null);
});
test('Invalid dates are excluded from month aggregation', () => {
  assert.equal(m.monthKey('2026-02-30'),null); assert.equal(m.monthKey('2026-10-01T00:00:00Z'),'2026-10');
});
test('CSV escapes quotes and neutralizes spreadsheet formulas', () => {
  const output=m.csv(['Name'],[['=1+1'],['test "quoted"'],['  @SUM(A1)']]);
  assert(output.includes('"\'=1+1"')); assert(output.includes('"test ""quoted"""')); assert(output.includes("'  @SUM"));
});
console.log(`${count} reporting calculation tests passed.`);
