import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
try {
 await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,full_name text,daily_rate numeric,contact_number text);
 CREATE FUNCTION cf_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT role FROM profiles WHERE id=auth.uid()$$;
 CREATE FUNCTION cf_is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT cf_role()='super_admin'$$;
 CREATE FUNCTION cf_project_access(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT cf_role() IN ('pm','site_manager','super_admin')$$;
 CREATE TABLE projects(id uuid PRIMARY KEY,name text);CREATE TABLE sites(id uuid PRIMARY KEY,project_id uuid,address text);
 CREATE TABLE workers(id uuid PRIMARY KEY,user_id uuid);
 CREATE FUNCTION cf_worker_owned_by(w uuid,u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM workers WHERE id=w AND user_id=u)$$;
 CREATE FUNCTION cf_worker_access(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT cf_role() IN ('pm','site_manager','super_admin')$$;
 CREATE TABLE attendance(id uuid PRIMARY KEY,worker_id uuid,site_id uuid,date date,check_in_time timestamptz,check_out_time timestamptz,hours_worked numeric,overtime_hours numeric,created_at timestamptz DEFAULT now());
 CREATE TABLE salary_slips(id uuid PRIMARY KEY,worker_id uuid,period_start date,basic_pay numeric,total_days integer,total_pay numeric,status text);
 CREATE TABLE notifications(id uuid PRIMARY KEY);CREATE TABLE site_workers(id uuid PRIMARY KEY);
 CREATE PUBLICATION supabase_realtime;
 ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY;ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
 CREATE POLICY existing_profiles ON profiles FOR ALL TO authenticated USING(true) WITH CHECK(true);
 CREATE POLICY existing_salary ON salary_slips FOR ALL TO authenticated USING(true) WITH CHECK(true);
 CREATE POLICY existing_attendance ON attendance FOR ALL TO authenticated USING(true) WITH CHECK(true);
 GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
 `);
 for(const n of [1,2])await db.query('INSERT INTO profiles VALUES($1,$2,$3,3500,NULL)',[id(n),'worker',`Worker ${n}`]);
 await db.query('INSERT INTO profiles VALUES($1,$2,$3,0,NULL)',[id(3),'site_manager','Manager']);
 await db.query('INSERT INTO projects VALUES($1,$2)',[id(10),'Site project']);
 await db.query('INSERT INTO sites VALUES($1,$2,$3)',[id(11),id(10),'Colombo']);
 for(const n of [1,2]){await db.query('INSERT INTO workers VALUES($1,$2)',[id(20+n),id(n)]);await db.query("INSERT INTO attendance(id,worker_id,site_id,date,hours_worked,overtime_hours) VALUES($1,$2,$3,'2026-10-01',10,0)",[id(30+n),id(20+n),id(11)]);await db.query("INSERT INTO salary_slips(id,worker_id,period_start,basic_pay,total_days,total_pay) VALUES($1,$2,'2026-10-01',3500,1,4812.5)",[id(40+n),id(n)]);}
 const dir=new URL('../../frontend/supabase/migrations/',import.meta.url);const name=(await readdir(dir)).find(n=>n.endsWith('_worker_portal.sql'));await db.exec(await readFile(new URL(name,dir),'utf8'));
 await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
 for(const [table,column] of [['labour','worker_id'],['salary_slips','worker_id'],['profiles','id']]){
  assert.equal((await db.query(`SELECT * FROM ${table} WHERE ${column}=$1`,[id(2)])).rows.length,0,table+' hides worker B');
  const field=table==='profiles'?'full_name':table==='labour'?'status':'total_pay';const value=table==='profiles'?"'Changed'":table==='labour'?"'Absent'":'0';
  assert.equal((await db.query(`UPDATE ${table} SET ${field}=${value} WHERE ${column}=$1 RETURNING *`,[id(2)])).rows.length,0,table+' denies B update');
  assert.equal((await db.query(`SELECT * FROM ${table} WHERE ${column}=$1`,[id(1)])).rows.length,1,table+' permits own read');
 }
 await assert.rejects(db.query('UPDATE profiles SET daily_rate=99999 WHERE id=$1',[id(1)]),/contact details/);
 await db.query("UPDATE profiles SET contact_number='+94771234567' WHERE id=$1",[id(1)]);
 assert.equal((await db.query('UPDATE labour SET hours_worked=999 WHERE worker_id=$1 RETURNING id',[id(1)])).rows.length,0);
 assert.equal((await db.query('SELECT overtime_hours FROM labour')).rows[0].overtime_hours,'2');
 await db.exec('RESET ROLE');await db.query("UPDATE attendance SET hours_worked=11,check_out_time=now() WHERE id=$1",[id(31)]);
 assert.equal(Number((await db.query('SELECT hours_worked FROM labour WHERE id=$1',[id(31)])).rows[0].hours_worked),11);
 console.log('PASS: migration, history backfill, scan synchronization, own reads, cross-worker reads/updates, protected wages and contact edits (real PostgreSQL RLS).');
} finally {await db.close();}
