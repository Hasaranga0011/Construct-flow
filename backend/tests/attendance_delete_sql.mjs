import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function runAttendanceDeleteChecks({db,id,user,check}) {
 const sql=await readFile(new URL('../migrations/20261123_attendance_resolution_project_delete.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 const followup=await readFile(new URL('../migrations/20261123_workflow_followup.sql',import.meta.url),'utf8');
 await db.exec(followup);await db.exec(followup);
 await user(1);
 await db.query("INSERT INTO projects(id,name,pm_id) VALUES($1,'Deletion fixture',$2),($3,'Unrelated project',$2)",[id(940),id(2),id(949)]);
 await db.query('INSERT INTO sites(id,project_id) VALUES($1,$2)',[id(941),id(940)]);
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[id(942)]);
 await db.query("INSERT INTO profiles(id,role,is_approved) VALUES($1,'worker',true)",[id(942)]);
 await db.query('INSERT INTO workers(id,user_id,site_id) VALUES($1,$1,$2)',[id(942),id(941)]);
 await db.query('INSERT INTO site_workers(id,project_id,worker_id) VALUES($1,$2,$3)',[id(943),id(940),id(942)]);
 await db.query("INSERT INTO attendance(id,worker_id,site_id,date,status,check_in_time,hours_worked,overtime_hours) VALUES($1,$2,$3,'2020-01-01','Present','2020-01-01T03:00Z',0,0)",[id(944),id(942),id(941)]);
 await check('missing check-out correction rejects worker and unassigned manager',async()=>{
  for(const actor of [3,5]) {await user(actor);await assert.rejects(db.query("SELECT resolve_missing_checkout($1,'2020-01-01T13:00Z','Forgot checkout')",[id(944)]),/Assigned project manager/);}
 });
 await check('check-out requires an actual bounded time and explanation',async()=>{
  await user(2);
  for(const [time,reason] of [['2020-01-01T02:00Z','Forgot checkout'],['2020-01-03T13:00Z','Forgot checkout'],['2099-01-01T13:00Z','Forgot checkout'],['2020-01-01T13:00Z','']])
   await assert.rejects(db.query('SELECT resolve_missing_checkout($1,$2,$3)',[id(944),time,reason]));
 });
 await check('manager correction recomputes base/OT, records reason and allows fresh approval',async()=>{
  await db.query("SELECT resolve_missing_checkout($1,'2020-01-01T13:00Z','Forgot checkout; supervisor verified time')",[id(944)]);
  const row=(await db.query('SELECT * FROM attendance WHERE id=$1',[id(944)])).rows[0];
  assert.equal(Number(row.hours_worked),10);assert.equal(Number(row.overtime_hours),2);assert.equal(row.checkout_corrected_by,id(2));assert.equal(row.reviewed_at,null);
  await db.query("SELECT review_attendance_period($1,'2020-01-01','2020-01-01')",[id(940)]);
  await assert.rejects(db.query("SELECT resolve_missing_checkout($1,'2020-01-01T14:00Z','Change existing checkout')",[id(944)]),/Only a missing/);
 });
 await check('generated payroll still blocks a later missing-checkout correction',async()=>{
  await user(1);
  await db.query("INSERT INTO attendance(id,worker_id,site_id,date,status,check_in_time,check_out_time,hours_worked,overtime_hours) VALUES($1,$2,$3,'2020-01-03','Present','2020-01-03T03:00Z','2020-01-03T11:00Z',8,0)",[id(948),id(942),id(941)]);
  await db.query("SELECT review_attendance_period($1,'2020-01-03','2020-01-03')",[id(940)]);
  await db.query("INSERT INTO salary_slips(worker_id,project_id,period_start,period_end,basic_pay,total_pay,total_amount,total_days,total_hours,overtime_hours,deductions,status) VALUES($1,$2,'2020-01-03','2020-01-03',3500,3500,3500,1,8,0,0,'Draft')",[id(942),id(940)]);
  await assert.rejects(db.query('UPDATE attendance SET check_out_time=NULL WHERE id=$1',[id(948)]),/payslip already covers/);
  // Simulate an inconsistent historical row created before the new guard existed.
  await db.exec('ALTER TABLE attendance DISABLE TRIGGER guard_attendance_identity');
  await db.query('UPDATE attendance SET check_out_time=NULL WHERE id=$1',[id(948)]);
  await db.exec('ALTER TABLE attendance ENABLE TRIGGER guard_attendance_identity');
  await assert.rejects(db.query("SELECT resolve_missing_checkout($1,'2020-01-03T11:00Z','Supervisor verified time')",[id(948)]),/payslip already covers/);
 });
 await check('transferred workers retain correctable history without permitting new old-project attendance',async()=>{
  await db.query("INSERT INTO attendance(id,worker_id,site_id,date,status,check_in_time,hours_worked,overtime_hours) VALUES($1,$2,$3,'2020-01-02','Present','2020-01-02T03:00Z',0,0)",[id(947),id(942),id(941)]);
  await db.query('SELECT remove_project_worker($1)',[id(943)]);
  await db.query('INSERT INTO sites(id,project_id) VALUES($1,$2)',[id(946),id(949)]);
  await db.query('SELECT assign_project_worker($1,$2)',[id(949),id(942)]);
  await user(2);
  await db.query("SELECT resolve_missing_checkout($1,'2020-01-02T04:30Z','Supervisor verified historical checkout')",[id(947)]);
  const row=(await db.query('SELECT hours_worked,overtime_hours FROM attendance WHERE id=$1',[id(947)])).rows[0];
  assert.equal(Number(row.hours_worked),1.5);assert.equal(Number(row.overtime_hours),0);
  await assert.rejects(db.query("INSERT INTO attendance(id,worker_id,site_id,date,status) VALUES($1,$2,$3,'2020-01-04','Present')",[id(950),id(942),id(941)]),/approved worker assigned/);
  await user(5);await assert.rejects(db.query("SELECT resolve_missing_checkout($1,'2020-01-02T04:30Z','Unassigned manager request')",[id(947)]),/Assigned project manager/);
  await user(1);
 });
 await db.exec('CREATE TABLE deletion_child(id uuid PRIMARY KEY, attendance_id uuid REFERENCES attendance(id)); ALTER TABLE profiles ADD COLUMN protected_project uuid REFERENCES projects(id);');
 await db.query('INSERT INTO deletion_child VALUES($1,$2)',[id(945),id(944)]);
 await check('permanent project deletion is admin-only with exact confirmation',async()=>{
  await user(2);await assert.rejects(db.query('SELECT permanently_delete_project($1,$2)',[id(940),'Deletion fixture']),/Administrator required/);
  await user(1);await assert.rejects(db.query('SELECT permanently_delete_project($1,$2)',[id(940),'Wrong name']),/exact project name/);
 });
 await check('unexpected shared dependency rolls back every project deletion',async()=>{
  await db.query('UPDATE profiles SET protected_project=$1 WHERE id=$2',[id(940),id(942)]);
  await assert.rejects(db.query('SELECT permanently_delete_project($1,$2)',[id(940),'Deletion fixture']),/linked record prevents/);
  assert.equal((await db.query('SELECT count(*)::int n FROM attendance WHERE id=$1',[id(944)])).rows[0].n,1);
  assert.equal((await db.query('SELECT site_id FROM workers WHERE id=$1',[id(942)])).rows[0].site_id,id(946));
  await db.query('UPDATE profiles SET protected_project=NULL WHERE id=$1',[id(942)]);
 });
 await check('project history deletes atomically while shared users, audit and other projects survive',async()=>{
  await db.query('SELECT permanently_delete_project($1,$2)',[id(940),'Deletion fixture']);
  for(const [table,key] of [['projects',940],['sites',941],['attendance',944],['deletion_child',945]])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE id=$1`,[id(key)])).rows[0].n,0);
  assert.equal((await db.query('SELECT site_id FROM workers WHERE id=$1',[id(942)])).rows[0].site_id,id(946));
  assert.equal((await db.query('SELECT count(*)::int n FROM profiles WHERE id=$1',[id(942)])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM projects WHERE id=$1',[id(949)])).rows[0].n,1);
  assert((await db.query("SELECT count(*)::int n FROM audit_events WHERE table_name='projects' AND action='DELETE' AND project_id=$1",[id(940)])).rows[0].n>0);
 });
}
