import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let checks=0;
try {
 await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('qa.user',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid,role text);
 CREATE TABLE projects(id uuid,pm_id uuid,client_id uuid);
 CREATE FUNCTION cf_current_role() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT role FROM profiles WHERE id=auth.uid() $$;
 CREATE FUNCTION cf_can_manage_project(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT cf_current_role()='super_admin' OR (cf_current_role()='pm' AND EXISTS(SELECT 1 FROM projects WHERE id=p AND pm_id=auth.uid())) $$;
 CREATE TABLE estimations(id uuid PRIMARY KEY,project_id uuid,status text);
 CREATE TABLE project_expenses(id uuid,project_id uuid);
 CREATE TABLE client_payment_schedule(id uuid,project_id uuid);
 CREATE TABLE variation_orders(id uuid,project_id uuid);
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT SELECT ON projects TO authenticated;
 `);
 for(const [n,role] of [[1,'super_admin'],[2,'pm'],[3,'site_manager'],[4,'supplier'],[5,'client'],[6,'worker'],[7,'pm'],[8,'client']]) {
  await db.query('INSERT INTO auth.users VALUES($1)',[id(n)]);
  await db.query('INSERT INTO profiles VALUES($1,$2)',[id(n),role]);
 }
 await db.query('INSERT INTO projects VALUES($1,$2,$3)',[id(10),id(2),id(5)]);
 for(const table of ['estimations','project_expenses','client_payment_schedule','variation_orders']) {
  await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; CREATE POLICY legacy_allow ON ${table} FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT ALL ON ${table} TO authenticated;`);
 }
 const migration=await readFile(new URL('../migrations/20261117_role_flow_boundaries.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 await db.query("INSERT INTO estimations VALUES($1,$2,'Approved',NULL),($3,NULL,'Pending',NULL),($4,NULL,'Pending',$5)",[id(20),id(10),id(21),id(22),id(2)]);
 for(const table of ['project_expenses','client_payment_schedule','variation_orders'])await db.query(`INSERT INTO ${table} VALUES($1,$2)`,[id(30),id(10)]);
 async function user(n){await db.exec('RESET ROLE');await db.query("SELECT set_config('qa.user',$1,false)",[id(n)]);await db.exec('SET ROLE authenticated');}
 for(const [n,expected] of [[1,3],[2,2],[3,0],[4,0],[5,1],[6,0],[7,0],[8,0]]) {
  await user(n);assert.equal((await db.query('SELECT * FROM estimations')).rows.length,expected);checks++;
 }
 for(const n of [3,4,6,7,8]) {
  await user(n);
  for(const table of ['project_expenses','client_payment_schedule','variation_orders']){assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);checks++;}
 }
 await user(5);
 assert.equal((await db.query('SELECT * FROM project_expenses')).rows.length,0);checks++;
 assert.equal((await db.query('SELECT * FROM client_payment_schedule')).rows.length,1);checks++;
 await db.query("INSERT INTO estimations(id,project_id,status) VALUES($1,$2,'Pending')",[id(40),id(10)]);checks++;
 assert.equal((await db.query('SELECT * FROM estimations WHERE id=$1',[id(40)])).rows.length,1);checks++;
 assert.equal((await db.query("UPDATE estimations SET status='Approved' WHERE id=$1 RETURNING id",[id(40)])).rows.length,0);checks++;
 await user(7);
 await assert.rejects(db.query("INSERT INTO estimations(id,project_id,status) VALUES($1,$2,'Pending')",[id(41),id(10)]),/row-level security/);checks++;
 await user(6);
 await assert.rejects(db.query("INSERT INTO estimations(id,status) VALUES($1,'Pending')",[id(42)]),/row-level security/);checks++;
 console.log(`${checks} role-flow RLS checks passed; migration applies twice.`);
} finally {await db.close();}
