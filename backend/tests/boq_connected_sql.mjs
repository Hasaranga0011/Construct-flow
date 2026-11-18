import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function runBoqChecks({ db, id, user, check }) {
 const migration=await readFile(new URL('../migrations/20261117_boq_connected_workflow.sql',import.meta.url),'utf8');
 await check('connected BOQ migration applies twice',async()=>{ await db.exec(migration);await db.exec(migration); });
 const baseline={total_budget:5000,items:[{id:id(201),description:'Foundation work',stage:'BOQ foundation',unit:'item',quantity:1,rate:5000,amount:5000}],materials:[{id:id(202),name:'BOQ steel',unit:'units',allocated_quantity:20,unit_price:100}],labour_rates:[{id:id(203),trade:'Mason',daily_rate:4500,unit:'day'}],milestones:[{title:'BOQ foundation',duration_days:4}],stage_budgets:{'BOQ foundation':5000}};
 await user(2);
 await check('BOQ revision saves complete lines and preserves stock',async()=>{
  await db.query('SELECT revise_project_boq($1,$2,0,$3)',[id(10),JSON.stringify(baseline),'Connect original BOQ']);
  assert.equal((await db.query('SELECT count(*)::int n FROM project_boq_lines WHERE project_id=$1',[id(10)])).rows[0].n,3);
  const mat=(await db.query('SELECT current_stock,boq_item_id FROM materials WHERE project_id=$1 AND name=$2',[id(10),'BOQ steel'])).rows[0];
  assert.equal(Number(mat.current_stock),0);assert.equal(mat.boq_item_id,id(202));
 });
 await check('stale BOQ revision cannot overwrite current planning',async()=>{
  await assert.rejects(db.query('SELECT revise_project_boq($1,$2,0,$3)',[id(10),JSON.stringify(baseline),'Stale update attempt']),/BOQ changed/);
 });
 await check('manual budget deltas survive BOQ changes and history is retained',async()=>{
  await db.query('UPDATE projects SET total_budget=total_budget+250 WHERE id=$1',[id(10)]);
  const next=structuredClone(baseline);next.total_budget=6000;next.items[0].amount=6000;next.stage_budgets['BOQ foundation']=6000;
  await db.query('SELECT revise_project_boq($1,$2,1,$3)',[id(10),JSON.stringify(next),'Updated foundation cost']);
  assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),6250);
  assert.equal((await db.query('SELECT count(*)::int n FROM project_boq_revisions WHERE project_id=$1',[id(10)])).rows[0].n,2);
 });
 await check('BOQ requests carry the link through approved orders and receipts',async()=>{
  const mat=(await db.query('SELECT id FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows[0];
  const po=(await db.query("INSERT INTO purchase_orders(project_id,supplier_id,material_id,quantity_ordered,unit_price,status) VALUES($1,$2,$3,5,100,'Pending Delivery') RETURNING id,boq_item_id",[id(10),id(6),mat.id])).rows[0];
  assert.equal(po.boq_item_id,id(202));
  await user(6);await db.query("UPDATE purchase_orders SET status='Confirmed' WHERE id=$1",[po.id]);await db.query("UPDATE purchase_orders SET status='Delivered' WHERE id=$1",[po.id]);
  await user(2);await db.query('SELECT receive_purchase_order_quantity($1,2,$2)',[po.id,id(204)]);
  const report=(await db.query('SELECT get_project_boq($1) result',[id(10)])).rows[0].result;
  const line=report.lines.find(row=>row.id===id(202));assert.equal(Number(line.ordered_quantity),5);assert.equal(Number(line.received_quantity),2);assert.equal(Number(line.actual_cost),200);
 });
 await check('BOQ quantity cannot be exceeded by a second order',async()=>{
  const mat=(await db.query('SELECT id FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows[0];
  await assert.rejects(db.query("INSERT INTO purchase_orders(project_id,supplier_id,material_id,quantity_ordered,unit_price,status) VALUES($1,$2,$3,16,100,'Pending Delivery')",[id(10),id(6),mat.id]),/exceeds BOQ/);
 });
 await check('explicit expense and commercial allocations remain project scoped',async()=>{
  const expense=(await db.query('SELECT record_project_expense($1,$2) result',[id(10),JSON.stringify({title:'Foundation equipment',amount:25,boq_item_id:id(201)})])).rows[0].result;
  assert.equal(expense.boq_item_id,id(201));
  const payment=(await db.query('SELECT create_project_commercial_record($1,$2,$3) result',[id(10),'payment',JSON.stringify({description:'Foundation stage',amount:1000,due_date:'2030-01-01',boq_item_id:id(201)})])).rows[0].result;
  assert.equal(payment.boq_item_id,id(201));
  await assert.rejects(db.query('SELECT record_project_expense($1,$2)',[id(10),JSON.stringify({title:'Foreign allocation',amount:25,boq_item_id:id(999)})]),/active BOQ/);
 });
 await check('worker supplier and unassigned PM cannot read or revise BOQ',async()=>{
  for(const n of [3,6,5]){
   await user(n);await assert.rejects(db.query('SELECT get_project_boq($1)',[id(10)]),/BOQ access/);
   await assert.rejects(db.query('SELECT revise_project_boq($1,$2,2,$3)',[id(10),JSON.stringify(baseline),'Unauthorized revision']),/management access/);
  }
 });
 await user(2);
 await check('new BOQ project costs cannot silently remain unallocated',async()=>{
  await assert.rejects(db.query('SELECT record_project_expense($1,$2)',[id(10),JSON.stringify({title:'Missing allocation',amount:10})]),/Choose a BOQ reference/);
  await assert.rejects(db.query('SELECT create_project_commercial_record($1,$2,$3)',[id(10),'payment',JSON.stringify({description:'Missing allocation',amount:10,due_date:'2030-01-01'})]),/Choose a BOQ reference/);
 });
 await check('material usage tracks quantity without charging received stock twice',async()=>{
  const mat=(await db.query('SELECT id,current_stock FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows[0];
  const saved=(await db.query('SELECT record_project_expense($1,$2) result',[id(10),JSON.stringify({title:'Use received steel',amount:100,material_id:mat.id,quantity_used:1})])).rows[0].result;
  assert.equal(saved.boq_item_id,id(202));assert.equal(Number(saved.amount),0);
  assert.equal(Number((await db.query('SELECT current_stock FROM materials WHERE id=$1',[mat.id])).rows[0].current_stock),Number(mat.current_stock)-1);
 });
 await check('request approval retains the BOQ reference and stock identity',async()=>{
  const request=id(205);
  await db.query("INSERT INTO material_requests(id,project_id,item_name,quantity,unit,status) VALUES($1,$2,'BOQ steel',3,'units','Pending Approval')",[request,id(10)]);
  const result=(await db.query('SELECT review_material_request($1,true,$2,100,$3) result',[request,id(6),'2030-01-01'])).rows[0].result;
  const order=(await db.query('SELECT * FROM purchase_orders WHERE request_id=$1',[request])).rows[0];
  assert.equal(order.boq_item_id,id(202));
  assert.equal(order.material_id,(await db.query('SELECT id FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows[0].id);
 });
 await check('renamed BOQ material keeps existing stock and orders linked',async()=>{
  const plan=structuredClone(baseline);plan.items[0].amount=6000;plan.total_budget=6000;plan.stage_budgets['BOQ foundation']=6000;
  plan.materials[0].name='Updated BOQ steel';
  const before=(await db.query('SELECT id,current_stock FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows[0];
  await db.query('SELECT revise_project_boq($1,$2,2,$3)',[id(10),JSON.stringify(plan),'Rename steel specification']);
  const rows=(await db.query('SELECT id,name,current_stock FROM materials WHERE project_id=$1 AND boq_item_id=$2',[id(10),id(202)])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].id,before.id);assert.equal(rows[0].name,'Updated BOQ steel');assert.equal(rows[0].current_stock,before.current_stock);
 });
 await check('weighted BOQ phase progress replaces a misleading equal average',async()=>{
  const current=(await db.query('SELECT boq_data FROM projects WHERE id=$1',[id(10)])).rows[0].boq_data;
  current.items=[{...current.items[0],amount:9000},{id:id(210),description:'Roof works',stage:'BOQ roof',quantity:1,rate:1000,amount:1000}];
  current.total_budget=10000;current.stage_budgets={'BOQ foundation':9000,'BOQ roof':1000};current.milestones.push({title:'BOQ roof',duration_days:4});
  await db.query('SELECT revise_project_boq($1,$2,3,$3)',[id(10),JSON.stringify(current),'Add roof and reweight phases']);
  await db.query("UPDATE milestones SET status='Completed',completion_percentage=100 WHERE project_id=$1 AND boq_stage='BOQ foundation'",[id(10)]);
  assert.equal(Number((await db.query('SELECT completion_percentage FROM projects WHERE id=$1',[id(10)])).rows[0].completion_percentage),90);
 });
 await check('direct browser baseline updates cannot bypass revision history',async()=>{
  await db.exec('GRANT UPDATE(boq_revision) ON projects TO authenticated; CREATE POLICY boq_test_update ON projects FOR UPDATE TO authenticated USING(cf_can_manage_project(id)) WITH CHECK(cf_can_manage_project(id));');
  await db.exec('SET ROLE authenticated');
  try { await assert.rejects(db.query('UPDATE projects SET boq_revision=0 WHERE id=$1',[id(10)]),/audited BOQ/); }
  finally { await db.exec('RESET ROLE'); }
 });
 await check('private project worker rates stay out of project JSON and client BOQ reads',async()=>{
  const current=(await db.query('SELECT boq_data FROM projects WHERE id=$1',[id(10)])).rows[0].boq_data;
  current.labour_overrides=[{worker_id:id(3),daily_rate:5500}];
  await db.query('SELECT revise_project_boq($1,$2,4,$3)',[id(10),JSON.stringify(current),'Agreed project worker wage']);
  assert.equal((await db.query('SELECT boq_data FROM projects WHERE id=$1',[id(10)])).rows[0].boq_data.labour_overrides,undefined);
  assert.equal(Number((await db.query('SELECT daily_rate FROM project_boq_worker_rates WHERE project_id=$1 AND worker_id=$2',[id(10),id(3)])).rows[0].daily_rate),5500);
  await db.exec("CREATE OR REPLACE FUNCTION cf_project_access(p_project_id uuid) RETURNS boolean LANGUAGE sql AS $$SELECT cf_can_manage_project(p_project_id) OR EXISTS(SELECT 1 FROM projects WHERE id=p_project_id AND client_id=auth.uid())$$");
  await user(4);
  const clientView=(await db.query('SELECT get_project_boq($1) result',[id(10)])).rows[0].result;
  assert.equal(clientView.boq_data.labour_overrides,undefined);assert.equal(clientView.boq_data.labour_rates,undefined);assert(!clientView.lines.some(row=>row.kind==='labour'));assert.equal(clientView.workers,undefined);
  await db.exec('SET ROLE authenticated');
  try { assert.equal((await db.query('SELECT * FROM project_boq_worker_rates')).rows.length,0);assert.equal((await db.query('SELECT * FROM project_boq_revisions')).rows.length,0); }
  finally { await db.exec('RESET ROLE'); }
  await user(2);
 });
 await check('new project BOQ saves editable phase names and manual budget adjustment atomically',async()=>{
  const project=(await db.query('SELECT save_project_with_assignments(null,$1) result',[JSON.stringify({name:'New connected BOQ',location:'Colombo',start_date:'2030-01-01',end_date:'2030-12-31',pm_id:id(2),client_id:id(4),workers:[id(3)],total_budget:8000,boq_data:baseline,milestones:[{title:'Editable foundation name',boq_stage:'BOQ foundation',due_date:'2030-02-01'}]})])).rows[0].result;
  assert.equal(project.boq_revision,1);assert.equal(Number(project.total_budget),8000);
  const phases=(await db.query('SELECT title,boq_stage,allocated_budget FROM milestones WHERE project_id=$1',[project.id])).rows;
  assert.equal(phases.length,1);assert.equal(phases[0].title,'Editable foundation name');assert.equal(phases[0].boq_stage,'BOQ foundation');assert.equal(Number(phases[0].allocated_budget),5000);
 });
 await check('legacy project-save RPC cannot silently replace an existing BOQ',async()=>{
  const before=(await db.query('SELECT boq_revision FROM projects WHERE id=$1',[id(10)])).rows[0].boq_revision;
  await assert.rejects(db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({name:'Must roll back',boq_data:baseline})]),/audited BOQ revision/);
  assert.equal((await db.query('SELECT boq_revision FROM projects WHERE id=$1',[id(10)])).rows[0].boq_revision,before);
 });
 await check('a BOQ item cannot be scheduled for more than its agreed value',async()=>{
  await assert.rejects(db.query('SELECT create_project_commercial_record($1,$2,$3)',[id(10),'payment',JSON.stringify({description:'Excess phase payment',amount:20000,due_date:'2030-01-01',boq_item_id:id(201)})]),/Scheduled payments exceed/);
 });
 await check('site manager BOQ view exposes assigned quantities without financial rates',async()=>{
  await db.query('INSERT INTO auth.users VALUES($1)',[id(7)]);await db.query("INSERT INTO profiles(id,role,is_approved) VALUES($1,'site_manager',true)",[id(7)]);
  await db.query('INSERT INTO site_manager_sites(id,project_id,site_manager_id) VALUES($1,$2,$3)',[id(207),id(10),id(7)]);
  await db.exec("CREATE OR REPLACE FUNCTION cf_project_access(p_project_id uuid) RETURNS boolean LANGUAGE sql AS $$SELECT cf_can_manage_project(p_project_id) OR EXISTS(SELECT 1 FROM projects WHERE id=p_project_id AND client_id=auth.uid()) OR EXISTS(SELECT 1 FROM site_manager_sites WHERE project_id=p_project_id AND site_manager_id=auth.uid())$$");
  await user(7);const siteView=(await db.query('SELECT get_project_boq($1) result',[id(10)])).rows[0].result;
  assert(siteView.materials.length);assert.equal(siteView.boq_data,undefined);assert.equal(siteView.project_budget,undefined);assert.equal(siteView.materials[0].rate,undefined);assert.equal(siteView.materials[0].unit_price,undefined);assert(siteView.materials[0].ordered_quantity>0);
  await assert.rejects(db.query('SELECT get_project_boq($1)',[id(999)]),/BOQ access/);await user(2);
 });
 await check('approved variations stay linked to their BOQ item and change budget once',async()=>{
  const before=Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget);
  const variation=(await db.query('SELECT create_project_commercial_record($1,$2,$3) result',[id(10),'variation',JSON.stringify({title:'Foundation extra work',description:'Extra agreed work in this BOQ scope',amount:500,boq_item_id:id(201)})])).rows[0].result;
  await user(4);await db.query('SELECT review_variation($1,true)',[variation.id]);
  await assert.rejects(db.query('SELECT review_variation($1,true)',[variation.id]),/already been reviewed/);
  assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),before+500);await user(2);
 });
 await check('a truncated historical BOQ cannot replace the full baseline through direct SQL',async()=>{
  const rev=(await db.query('SELECT boq_revision FROM projects WHERE id=$1',[id(10)])).rows[0].boq_revision;
  await assert.rejects(db.query('SELECT revise_project_boq($1,$2,$3,$4)',[id(10),JSON.stringify({...baseline,items_count:250}),rev,'Unsafe partial historical source']),/original complete BOQ/);
  assert.equal((await db.query('SELECT boq_revision FROM projects WHERE id=$1',[id(10)])).rows[0].boq_revision,rev);
 });
 await check('first BOQ upload preserves approved variations on a previously manual project',async()=>{
  const project=(await db.query('SELECT save_project_with_assignments(null,$1) result',[JSON.stringify({name:'Manual baseline project',location:'Colombo',start_date:'2030-01-01',end_date:'2030-12-31',pm_id:id(2),client_id:id(4),total_budget:1000})])).rows[0].result;
  const variation=(await db.query('SELECT create_project_commercial_record($1,$2,$3) result',[project.id,'variation',JSON.stringify({title:'Existing approved change',description:'Existing manual-project agreed scope',amount:150})])).rows[0].result;
  await user(4);await db.query('SELECT review_variation($1,true)',[variation.id]);await user(2);
  const plan=structuredClone(baseline);plan.total_budget=2000;plan.items[0].amount=2000;plan.stage_budgets['BOQ foundation']=2000;
  await db.query('SELECT revise_project_boq($1,$2,0,$3)',[project.id,JSON.stringify(plan),'First complete BOQ baseline']);
  assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[project.id])).rows[0].total_budget),2150);
 });
 await check('optimized BOQ reads preserve totals and all role boundaries',async()=>{
  await db.query('INSERT INTO auth.users VALUES($1)',[id(8)]);
  await db.query("INSERT INTO profiles(id,role,is_approved) VALUES($1,'super_admin',true)",[id(8)]);
  const canonical=value=>Array.isArray(value)?value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
  const before={};
  for(const role of [8,2,4,7]) { await user(role); before[role]=canonical((await db.query('SELECT get_project_boq($1) result',[id(10)])).rows[0].result); }
  const optimized=await readFile(new URL('../migrations/20261118_boq_read_optimization.sql',import.meta.url),'utf8');
  await db.exec(optimized);await db.exec(optimized);
  for(const role of [8,2,4,7]) { await user(role); assert.deepEqual(canonical((await db.query('SELECT get_project_boq($1) result',[id(10)])).rows[0].result),before[role]); }
  for(const role of [3,5,6]) { await user(role); await assert.rejects(db.query('SELECT get_project_boq($1)',[id(10)]),/BOQ access/); }
  await user(2);
 });
}
