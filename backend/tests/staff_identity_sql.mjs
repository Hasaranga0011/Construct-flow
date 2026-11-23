import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function runStaffIdentityChecks({db,id,user,check}){
 await user(1);
 await db.exec(`ALTER TABLE workers ADD COLUMN IF NOT EXISTS site_id uuid;
 ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(), ADD COLUMN IF NOT EXISTS month date,
 ADD COLUMN IF NOT EXISTS basic_pay numeric, ADD COLUMN IF NOT EXISTS overtime_pay numeric,
 ADD COLUMN IF NOT EXISTS total_days numeric, ADD COLUMN IF NOT EXISTS total_hours numeric, ADD COLUMN IF NOT EXISTS overtime_hours numeric;`);
 const migration=await readFile(new URL('../migrations/20261123_staff_identity_payroll.sql',import.meta.url),'utf8');
 await check('staff identity/payroll migration is repeatable',async()=>{await db.exec(migration);await db.exec(migration);});
 for(const [n,role] of [[1001,'pm'],[1002,'site_manager'],[1003,'site_manager'],[1006,'worker']]){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id(n)]);
  await db.query('INSERT INTO profiles(id,role,is_approved,full_name) VALUES($1,$2,true,$2)',[id(n),role]);
 }
 await db.query("INSERT INTO projects(id,name,pm_id) VALUES($1,'Staff test',$2),($3,'Second staff test',$2)",[id(1000),id(1001),id(1005)]);
 await db.query('INSERT INTO sites(id,project_id) VALUES($1,$2)',[id(1004),id(1000)]);
 await db.query('INSERT INTO site_manager_sites(id,project_id,site_manager_id) VALUES($1,$2,$3)',[id(1008),id(1000),id(1002)]);
 await check('assigned site manager records BOQ-safe expenses',async()=>{
  await user(1002);const row=(await db.query('SELECT record_project_expense($1,$2) result',[id(1000),JSON.stringify({title:'Site transport',amount:120,category:'Other'})])).rows[0].result;
  assert.equal(Number(row.amount),120);assert.equal(row.project_id,id(1000));
 });
 await check('unassigned site manager and workers cannot record expenses',async()=>{
  for(const n of [1003,3,6]){await user(n);await assert.rejects(db.query('SELECT record_project_expense($1,$2)',[id(1000),JSON.stringify({title:'Blocked',amount:20})]),/access required/);}
 });
 await check('worker identity aliases cannot be assigned across projects',async()=>{
  await user(1);await assert.rejects(db.query('SELECT assign_project_worker($1,$2)',[id(1000),id(71)]),/another project/);
 });
 await check('worker transfer removes both links and preserves attendance',async()=>{
  const before=(await db.query('SELECT count(*)::int n FROM attendance')).rows[0].n;
  const row=(await db.query('SELECT sw.id FROM site_workers sw LEFT JOIN workers w ON w.id=sw.worker_id WHERE coalesce(w.user_id,sw.worker_id)=$1 LIMIT 1',[id(3)])).rows[0];
  await db.query('SELECT remove_project_worker($1)',[row.id]);
  await user(1001);await db.query('SELECT assign_project_worker($1,$2)',[id(1000),id(71)]);
  assert.equal((await db.query('SELECT site_id FROM workers WHERE id=$1',[id(71)])).rows[0].site_id,id(1004));
  assert.equal((await db.query('SELECT count(*)::int n FROM attendance')).rows[0].n,before);
 });
 await check('many workers per project and assignment retries remain valid',async()=>{
  await db.query('SELECT assign_project_worker($1,$2)',[id(1000),id(71)]);
  await db.query('SELECT assign_project_worker($1,$2)',[id(1000),id(1006)]);
  assert.equal((await db.query('SELECT count(*)::int n FROM site_workers WHERE project_id=$1',[id(1000)])).rows[0].n,2);
 });
 await check('staff cannot generate or approve their own monthly salary',async()=>{
  for(const n of [1001,1002,3]){await user(n);await assert.rejects(db.query('SELECT create_staff_salary($1,$2,$3,0,$4)',[id(1001),id(1000),'2026-11-01','']),/Administrator required/);}
 });
 await user(1);
 await db.query('INSERT INTO staff_compensation(user_id,monthly_salary,updated_by) VALUES($1,50000,$3),($2,40000,$3)',[id(1001),id(1002),id(1)]);
 let slip;
 await check('monthly salary uses saved rate, reason and exact net amount',async()=>{
  slip=(await db.query('SELECT create_staff_salary($1,$2,$3,250.25,$4) result',[id(1001),id(1000),'2026-11-01','Advance repayment'])).rows[0].result;
  assert.equal(Number(slip.basic_pay),50000);assert.equal(Number(slip.total_amount),49749.75);assert.equal(Number(slip.deductions),250.25);assert.equal(slip.period_end,'2026-11-30');
 });
 await check('staff salary cannot be duplicated on another project',async()=>{await assert.rejects(db.query('SELECT create_staff_salary($1,$2,$3,0,$4)',[id(1001),id(1005),'2026-11-01','']),/already exists/);});
 await check('over-deductions and blank deduction reasons are rejected',async()=>{
  for(const [amount,reason] of [[60000,'Invalid'],[20,''],[-5,'Invalid']])await assert.rejects(db.query('SELECT create_staff_salary($1,$2,$3,$4,$5)',[id(1002),id(1000),'2026-11-01',amount,reason]),/valid deductions/);
 });
 await check('generated salary amounts cannot be silently edited',async()=>{
  await assert.rejects(db.query('UPDATE salary_slips SET total_amount=1 WHERE id=$1',[slip.id]),/immutable/);
 });
 await check('PM cannot mark their staff salary paid',async()=>{
  await user(1001);await assert.rejects(db.query("UPDATE salary_slips SET status='Paid' WHERE id=$1",[slip.id]),/Only administrators/);await user(1);
 });
 await check('admin can record staff payment without changing salary',async()=>{
  await db.query("UPDATE salary_slips SET status='Paid' WHERE id=$1",[slip.id]);
  assert.equal((await db.query('SELECT status FROM salary_slips WHERE id=$1',[slip.id])).rows[0].status,'Paid');
 });
 await check('username lookup registry is inaccessible to public/authenticated callers',async()=>{
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT * FROM username_accounts'),/permission denied/);
  await db.exec('RESET ROLE');
 });
 await check('monthly slip reads are limited to the owner',async()=>{
  await db.exec('ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY; GRANT SELECT ON salary_slips TO authenticated; GRANT SELECT ON profiles TO authenticated;');
  await user(1001);await db.exec('SET ROLE authenticated');
  assert.equal((await db.query("SELECT count(*)::int n FROM salary_slips WHERE pay_basis='monthly'")).rows[0].n,1);
  await user(1003);
  assert.equal((await db.query("SELECT count(*)::int n FROM salary_slips WHERE pay_basis='monthly'")).rows[0].n,0);
  await db.exec('RESET ROLE');await user(1);
 });
 await check('owner-approved eight-worker reconciliation is atomic and repeatable',async()=>{
  const script=await readFile(new URL('../reviews/APPLY_20261123_WORKFLOWS.sql',import.meta.url),'utf8');
  const choices=JSON.parse(script.split('$choices$')[1]);
  await db.exec('ALTER TABLE site_workers DISABLE TRIGGER one_worker_project; ALTER TABLE project_role_assignments DISABLE TRIGGER one_worker_role_project;');
  for(const choice of choices){
   await db.query('INSERT INTO auth.users(id) VALUES($1)',[choice.worker_id]);
   await db.query("INSERT INTO profiles(id,role,is_approved) VALUES($1,'worker',true)",[choice.worker_id]);
   for(const project of choice.observed_projects){
    await db.query("INSERT INTO projects(id,name,pm_id) VALUES($1,'Mapping fixture',$2) ON CONFLICT DO NOTHING",[project,id(1)]);
    await db.query("INSERT INTO sites(id,project_id) VALUES(md5($1||'.site')::uuid,$1::uuid) ON CONFLICT DO NOTHING",[project]);
   }
   await db.query('INSERT INTO site_workers(id,project_id,worker_id) VALUES(gen_random_uuid(),$1,$3),(gen_random_uuid(),$2,$3)',[choice.keep_project,choice.observed_projects.find(project=>project!==choice.keep_project),choice.worker_id]);
  }
  await db.exec('ALTER TABLE site_workers ENABLE TRIGGER one_worker_project; ALTER TABLE project_role_assignments ENABLE TRIGGER one_worker_role_project;');
  const before=(await db.query('SELECT (SELECT count(*) FROM attendance)::int attendance,(SELECT count(*) FROM salary_slips)::int slips')).rows[0];
  await db.exec(script);await db.exec(script);
  for(const choice of choices){
   const rows=(await db.query('SELECT DISTINCT project_id FROM site_workers WHERE worker_id=$1',[choice.worker_id])).rows;
   assert.deepEqual(rows,[{project_id:choice.keep_project}]);
  }
  const after=(await db.query('SELECT (SELECT count(*) FROM attendance)::int attendance,(SELECT count(*) FROM salary_slips)::int slips')).rows[0];
  assert.deepEqual(after,before);
 });
}
