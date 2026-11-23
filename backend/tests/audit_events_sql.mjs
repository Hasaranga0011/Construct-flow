import { PGlite } from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
const admin='00000000-0000-0000-0000-000000000001',worker='00000000-0000-0000-0000-000000000002',project='00000000-0000-0000-0000-000000000003';
const check=async(name,fn)=>{await fn();checks++;console.log('PASS',name);};
try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_approved boolean);
 CREATE FUNCTION cf_current_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT CASE WHEN role='admin' THEN 'super_admin' ELSE role END FROM profiles WHERE id=auth.uid() AND is_approved IS TRUE$$;
 CREATE TABLE projects(id uuid PRIMARY KEY,total_budget numeric,status text,notes text,password text);
 CREATE TABLE sites(id uuid PRIMARY KEY,project_id uuid);
 INSERT INTO profiles VALUES('${admin}','super_admin',true),('${worker}','worker',true);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
 GRANT ALL ON projects TO authenticated;
 SELECT set_config('request.jwt.claim.sub','${admin}',false);
 SELECT set_config('request.jwt.claim.role','authenticated',false);`);
 const migration=await readFile(new URL('../migrations/20261120_audit_events.sql',import.meta.url),'utf8');
 await db.exec(migration);
 await check('migration reapplies without duplicating triggers',async()=>{await db.exec(migration);});
 await db.exec(`INSERT INTO projects VALUES('${project}',100,'Planning','private message content','secret-token');`);
 await check('insert captures actor, project and safe values only',async()=>{
  const e=(await db.query('SELECT * FROM audit_events')).rows[0];
  assert.equal(e.actor_id,admin);assert.equal(e.actor_role,'super_admin');assert.equal(e.project_id,project);assert.equal(e.action,'INSERT');
  assert.equal(e.after_data.total_budget,100);assert.equal(e.before_data,null);
  assert(!JSON.stringify(e).includes('private message content'));assert(!JSON.stringify(e).includes('secret-token'));
 });
 await check('update records exact before and after plus changed field names',async()=>{
  await db.exec(`UPDATE projects SET total_budget=125 WHERE id='${project}'`);
  const e=(await db.query('SELECT * FROM audit_events ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(e.before_data.total_budget,100);assert.equal(e.after_data.total_budget,125);assert.deepEqual(e.changed_fields,['total_budget']);
 });
 await check('no-op updates do not create noise',async()=>{const before=(await db.query('SELECT count(*) AS n FROM audit_events')).rows[0].n;await db.exec(`UPDATE projects SET total_budget=total_budget`);assert.equal((await db.query('SELECT count(*) AS n FROM audit_events')).rows[0].n,before);});
 await check('business rollback also rolls back its audit event',async()=>{
  const before=(await db.query('SELECT count(*) AS n FROM audit_events')).rows[0].n;
  await db.exec('BEGIN');await db.exec('UPDATE projects SET total_budget=999');await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*) AS n FROM audit_events')).rows[0].n,before);
  assert.equal(Number((await db.query('SELECT total_budget FROM projects')).rows[0].total_budget),125);
 });
 await check('audit storage failure rolls back business operation',async()=>{
  await db.exec("ALTER TABLE audit_events ADD CONSTRAINT fail_test CHECK(action<>'UPDATE') NOT VALID");
  await assert.rejects(db.exec('UPDATE projects SET total_budget=999'),/fail_test/);
  assert.equal(Number((await db.query('SELECT total_budget FROM projects')).rows[0].total_budget),125);
  await db.exec('ALTER TABLE audit_events DROP CONSTRAINT fail_test');
 });
 await check('authenticated writes still use the trusted trigger',async()=>{await db.exec("SET ROLE authenticated; UPDATE projects SET total_budget=150; RESET ROLE;");assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,3);});
 await check('worker cannot read administrator history',async()=>{await db.exec(`SELECT set_config('request.jwt.claim.sub','${worker}',false); SET ROLE authenticated;`);assert.equal((await db.query('SELECT * FROM audit_events')).rows.length,0);await db.exec('RESET ROLE');});
 await check('unapproved admin cannot read history',async()=>{await db.exec(`SELECT set_config('request.jwt.claim.sub','${admin}',false); UPDATE profiles SET is_approved=false WHERE id='${admin}'; SET ROLE authenticated;`);assert.equal((await db.query('SELECT * FROM audit_events')).rows.length,0);await db.exec(`RESET ROLE; UPDATE profiles SET is_approved=true WHERE id='${admin}';`);});
 await check('approved administrator reads history but cannot forge or delete it',async()=>{
  await db.exec('SET ROLE authenticated');assert((await db.query('SELECT * FROM audit_events')).rows.length>0);
  for(const sql of ["INSERT INTO audit_events(actor_role,table_name,action) VALUES('super_admin','projects','INSERT')",'DELETE FROM audit_events','UPDATE audit_events SET actor_role=\'fake\'','TRUNCATE audit_events',"SELECT cf_audit_snapshot('{}')"]){await assert.rejects(db.exec(sql),/permission denied|append-only/);}
  await db.exec('RESET ROLE');
 });
 await check('service role cannot tamper with audit history',async()=>{await db.exec('SET ROLE service_role');await assert.rejects(db.exec('DELETE FROM audit_events'),/permission denied/);await db.exec('RESET ROLE');});
 await check('even direct owner update/delete/truncate is rejected by triggers',async()=>{for(const sql of ["UPDATE audit_events SET actor_role='fake'",'DELETE FROM audit_events','TRUNCATE audit_events'])await assert.rejects(db.exec(sql),/append-only/);});
 await check('delete keeps history without a project foreign key',async()=>{await db.exec('DELETE FROM projects');const e=(await db.query('SELECT * FROM audit_events ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(e.action,'DELETE');assert.equal(e.after_data,null);assert.equal(e.before_data.total_budget,150);});
 const detailsMigration=await readFile(new URL('../migrations/20261120_audit_business_details.sql',import.meta.url),'utf8');
 await check('business-details migration preserves existing immutable history and reapplies',async()=>{
  const before=(await db.query('SELECT * FROM audit_events ORDER BY id')).rows;
  await db.exec(detailsMigration);await db.exec(detailsMigration);
  assert.deepEqual((await db.query('SELECT * FROM audit_events ORDER BY id')).rows,before);
 });
 await check('business details include contact, email, names and notes but recursively exclude secrets',async()=>{
  const payload={contact_number:'+94000000001',email:'qa@example.invalid',full_name:'QA User',notes:'Business change reason',password:'do-not-store',nested:{api_key:'do-not-store',items:[{quantity:2,refresh_token:'do-not-store'}]},document_url:'https://user:pass@example.invalid/document?token=do-not-store#fragment',photo:'data:image/png;base64,do-not-store'};
  const result=(await db.query('SELECT cf_audit_snapshot($1::jsonb) AS snapshot',[JSON.stringify(payload)])).rows[0].snapshot;
  assert.equal(result.contact_number,payload.contact_number);assert.equal(result.email,payload.email);assert.equal(result.notes,payload.notes);assert.equal(result.full_name,payload.full_name);
  assert.equal(result.document_url,'https://example.invalid/document');
  assert.equal(result.nested.items[0].quantity,2);assert(!JSON.stringify(result).includes('do-not-store'));
 });
 await check('new contact-number changes retain exact before and after values',async()=>{
  await db.exec('ALTER TABLE profiles ADD COLUMN contact_number text');
  await db.query('UPDATE profiles SET contact_number=$1 WHERE id=$2',['+94000000001',worker]);
  await db.query('UPDATE profiles SET contact_number=$1 WHERE id=$2',['+94000000002',worker]);
  const event=(await db.query("SELECT * FROM audit_events WHERE table_name='profiles' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(event.before_data.contact_number,'+94000000001');assert.equal(event.after_data.contact_number,'+94000000002');
  assert.deepEqual(Object.keys(event.after_data),['contact_number']);
 });
 await check('expanded snapshots are still inaccessible to workers',async()=>{
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${worker}',false); SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT * FROM audit_events')).rows.length,0);await db.exec('RESET ROLE');
 });
 console.log(`${checks} audit checks passed`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
