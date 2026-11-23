import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS', name); }
async function user(n) { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(n)]); }
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_approved boolean DEFAULT true,daily_rate numeric,full_name text);
 CREATE TABLE projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,location text,status text,total_budget numeric DEFAULT 0,spent_cost numeric,start_date date,end_date date,pm_id uuid,client_id uuid,address text,latitude numeric,longitude numeric);
 CREATE TABLE project_role_assignments(project_id uuid,user_id uuid,role text,UNIQUE(project_id,user_id,role));
 CREATE TABLE pm_projects(project_id uuid,pm_id uuid);
 CREATE TABLE site_manager_sites(id uuid,project_id uuid,site_manager_id uuid);
 CREATE TABLE site_workers(id uuid,project_id uuid,worker_id uuid);
 CREATE TABLE material_catalog(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,unit text,category text,reference_price numeric);
 CREATE TABLE materials(id uuid PRIMARY KEY,project_id uuid,name text,current_stock numeric,catalog_id uuid,unit text,minimum_threshold numeric);
 CREATE TABLE purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,supplier_id uuid,supplier_name text,material_id uuid,quantity_ordered numeric,unit_price numeric,total_price numeric,po_number text,items text,expected_date date,status text,received_at timestamptz,received_by uuid);
 CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,target_user_id uuid,target_role text,project_id uuid,title text,message text,type text,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());
 CREATE TABLE project_expenses(id uuid DEFAULT gen_random_uuid(),project_id uuid,title text,description text,amount numeric,expense_date date);
 CREATE TABLE salary_slips(worker_id uuid,project_id uuid,period_start date,period_end date);
 CREATE TABLE variation_orders(id uuid PRIMARY KEY,project_id uuid,amount numeric,status text,approved_by uuid,updated_at timestamptz);
 CREATE TABLE material_requests(id uuid PRIMARY KEY,project_id uuid,item_name text,quantity numeric,unit text,status text);
 CREATE TABLE workers(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE worker_details(user_id uuid PRIMARY KEY);
 CREATE TABLE sites(id uuid PRIMARY KEY,project_id uuid);
 CREATE TABLE attendance(id uuid PRIMARY KEY,worker_id uuid,site_id uuid,date date,status text,check_in_time timestamptz,check_out_time timestamptz,hours_worked numeric,overtime_hours numeric);
 CREATE TABLE client_payment_schedule(id uuid PRIMARY KEY,project_id uuid,amount numeric,status text,paid_at timestamptz,updated_at timestamptz);
 CREATE TABLE historical_projects(id uuid PRIMARY KEY,project_name text,start_date date,verified boolean DEFAULT true);
 CREATE FUNCTION cf_current_role() RETURNS text LANGUAGE sql AS $$ SELECT role FROM profiles WHERE id=auth.uid() $$;
 CREATE FUNCTION cf_can_manage_project(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(cf_current_role()='super_admin' OR EXISTS(SELECT 1 FROM projects WHERE id=p AND pm_id=auth.uid()),false) $$;
 CREATE FUNCTION cf_project_access(p_project_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT cf_can_manage_project(p_project_id) $$;
 `);
 for (const [n,role] of [[1,'super_admin'],[2,'pm'],[3,'worker'],[4,'client'],[5,'pm'],[6,'supplier']]) {
   await db.query('INSERT INTO auth.users VALUES($1)',[id(n)]);
   await db.query('INSERT INTO profiles(id,role) VALUES($1,$2)',[id(n),role]);
 }
 await db.query("INSERT INTO projects(id,name,location,status,total_budget,pm_id,client_id,start_date,end_date) VALUES($1,'House','Colombo','Planning',1000,$2,$3,'2026-01-01','2026-12-31')",[id(10),id(2),id(4)]);
 await db.query('INSERT INTO materials(id,project_id,name,current_stock) VALUES($1,$2,$3,10)',[id(20),id(10),'Cement']);
 await db.exec(await readFile(new URL('../migrations/20261116_security_workflow_integrity.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/20261120_audit_events.sql',import.meta.url),'utf8'));
 await check('workers cannot create projects through the privileged RPC',async()=>{
   await user(3); await assert.rejects(db.query('SELECT save_project_with_assignments(null,$1)',[JSON.stringify({name:'Attack',location:'Colombo'})]),/Manager access required/);
 });
 await check('PM cannot reassign someone else project',async()=>{
   await user(5); await assert.rejects(db.query('SELECT save_project_with_assignments($1,$2)',[id(10),'{}']),/Not your project/);
 });
 await check('invalid assignment rolls back project creation',async()=>{
   await user(1); const before=(await db.query('SELECT count(*)::int AS n FROM projects')).rows[0].n;
   await assert.rejects(db.query('SELECT save_project_with_assignments(null,$1)',[JSON.stringify({name:'Bad',location:'Colombo',workers:[id(4)],start_date:'2026-01-01',end_date:'2026-12-31'})]),/Invalid or unapproved/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM projects')).rows[0].n,before);
 });
 await check('assignment tables change atomically',async()=>{
   await user(1); await db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({workers:[id(3)]})]);
   assert.equal((await db.query('SELECT worker_id FROM site_workers WHERE project_id=$1',[id(10)])).rows[0].worker_id,id(3));
 });
 await check('expense refuses insufficient stock and does not insert',async()=>{
   await user(2);await assert.rejects(db.query('SELECT record_project_expense($1,$2)',[id(10),JSON.stringify({title:'Use',amount:50,material_id:id(20),quantity_used:11})]),/Insufficient stock/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM project_expenses')).rows[0].n,0);
 });
 await check('expense and stock commit together',async()=>{
   await db.query('SELECT record_project_expense($1,$2)',[id(10),JSON.stringify({title:'Use',amount:50,material_id:id(20),quantity_used:2})]);
   assert.equal(Number((await db.query('SELECT current_stock FROM materials WHERE id=$1',[id(20)])).rows[0].current_stock),8);
 });
 for (const [n,target,role] of [[30,null,'pm'],[31,id(5),'pm']]) await db.query('INSERT INTO notifications(id,target_user_id,target_role) VALUES($1,$2,$3)',[id(n),target,role]);
 await check('cannot mark another recipient notification read',async()=>{
   await user(2);await db.query('SELECT mark_own_notifications_read($1,false)',[[id(31)]]);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM notification_receipts')).rows[0].n,0);
 });
 await check('broadcast read state belongs to each user',async()=>{
   await user(2);await db.query('SELECT mark_own_notifications_read($1,false)',[[id(30)]]);
   await user(5);const feed=(await db.query('SELECT get_own_notifications() AS n')).rows.map(r=>r.n);
   assert.equal(feed.find(n=>n.id===id(30)).is_read,false);
 });
 await check('client variation applies budget exactly once',async()=>{
   await db.query("INSERT INTO variation_orders VALUES($1,$2,100,'Pending',null,null)",[id(40),id(10)]);
   await user(4);await db.query('SELECT review_variation($1,true)',[id(40)]);
   assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),1100);
   await assert.rejects(db.query('SELECT review_variation($1,true)',[id(40)]),/already been reviewed/);
 });
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_reviews.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_receipts.sql',import.meta.url),'utf8'));
 await db.query("INSERT INTO material_requests VALUES($1,$2,'Cement',10,'Bags','Pending Approval',null,null,null)",[id(50),id(10)]);
 await db.query("INSERT INTO project_role_assignments VALUES($1,$2,'supplier')",[id(10),id(6)]);
 let order;
 await check('request approval creates one linked order',async()=>{
   await user(2);
   order=(await db.query('SELECT review_material_request($1,true,$2,100,$3) AS po',[id(50),id(6),'2030-01-01'])).rows[0].po;
   assert.equal(order.request_id,id(50));
   await assert.rejects(db.query('SELECT review_material_request($1,true,$2,100,$3)',[id(50),id(6),'2030-01-01']),/already been reviewed/);
 });
 await check('partial receipt increments only accepted quantity and replay is safe',async()=>{
   await db.query("UPDATE purchase_orders SET status='Delivered' WHERE id=$1",[order.id]);
   await db.query('SELECT receive_purchase_order_quantity($1,3,$2)',[order.id,id(60)]);
   await db.query('SELECT receive_purchase_order_quantity($1,3,$2)',[order.id,id(60)]);
   assert.equal(Number((await db.query('SELECT quantity_received FROM purchase_orders WHERE id=$1',[order.id])).rows[0].quantity_received),3);
   assert.equal(Number((await db.query('SELECT current_stock FROM materials WHERE catalog_id=$1',[order.material_id])).rows[0].current_stock),3);
 });
 await check('over-receipt rolls back stock and ledger',async()=>{
   await assert.rejects(db.query('SELECT receive_purchase_order_quantity($1,8,$2)',[order.id,id(61)]),/exceeds outstanding/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM delivery_receipts')).rows[0].n,1);
 });
 await check('remaining receipt completes the order once',async()=>{
   await db.query('SELECT receive_purchase_order($1)',[order.id]);
   await db.query('SELECT receive_purchase_order($1)',[order.id]);
   assert.equal((await db.query('SELECT status FROM purchase_orders WHERE id=$1',[order.id])).rows[0].status,'Received');
   assert.equal(Number((await db.query('SELECT current_stock FROM materials WHERE catalog_id=$1',[order.material_id])).rows[0].current_stock),10);
 });
 await db.query('INSERT INTO sites VALUES($1,$2)',[id(70),id(10)]);
 await db.query('INSERT INTO workers VALUES($1,$2)',[id(71),id(3)]);
 await db.query("INSERT INTO attendance(id,worker_id,site_id,date,status,check_in_time,hours_worked,overtime_hours) VALUES($1,$2,$3,'2026-01-01','Present','2026-01-01T08:00:00Z',8,0)",[id(72),id(71),id(70)]);
 await check('open attendance cannot be approved',async()=>{
   await assert.rejects(db.query("SELECT review_attendance_period($1,'2026-01-01','2026-01-31')",[id(10)]),/Check out all/);
 });
 await check('salary generation requires reviewed attendance',async()=>{
   await assert.rejects(db.query("INSERT INTO salary_slips VALUES($1,$2,'2026-01-01','2026-01-31')",[id(3),id(10)]),/Review attendance/);
   await db.query("UPDATE attendance SET check_out_time='2026-01-01T16:00:00Z' WHERE id=$1",[id(72)]);
   await db.query("SELECT review_attendance_period($1,'2026-01-01','2026-01-31')",[id(10)]);
   await db.query("INSERT INTO salary_slips VALUES($1,$2,'2026-01-01','2026-01-31')",[id(3),id(10)]);
   await assert.rejects(db.query("INSERT INTO salary_slips VALUES($1,$2,'2026-01-15','2026-02-15')",[id(3),id(10)]),/Overlapping payroll/);
 });
 await check('payment verification requires exact amount and project authority',async()=>{
   await db.query("INSERT INTO client_payment_schedule(id,project_id,amount,status) VALUES($1,$2,100,'Pending')",[id(80),id(10)]);
   await assert.rejects(db.query("SELECT verify_project_payment($1,50,'Bank reference ABC123')",[id(80)]),/full payment/);
   await db.query("SELECT verify_project_payment($1,100,'Bank reference ABC123')",[id(80)]);
   assert.equal((await db.query('SELECT status FROM client_payment_schedule WHERE id=$1',[id(80)])).rows[0].status,'Paid');
 });
 await db.exec(`ALTER TABLE variation_orders ADD COLUMN title text, ADD COLUMN description text;
 ALTER TABLE client_payment_schedule ADD COLUMN description text, ADD COLUMN due_date date;`);
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_security_boundaries.sql',import.meta.url),'utf8'));
 await check('supplier cannot forge a received state through direct table update',async()=>{
   await user(2);
   const po=(await db.query("INSERT INTO purchase_orders(project_id,supplier_id,material_id,quantity_ordered,unit_price,status) VALUES($1,$2,$3,10,20,'Pending Delivery') RETURNING id",[id(10),id(6),order.material_id])).rows[0].id;
   await user(6);
   await assert.rejects(db.query("UPDATE purchase_orders SET status='Received' WHERE id=$1",[po]),/receipt transaction|cannot approve its own/);
 });
 await check('PM cannot delete a project',async()=>{
   await user(2);await assert.rejects(db.query('DELETE FROM projects WHERE id=$1',[id(10)]),/Only administrators/);
 });
 await check('disabled users cannot bypass RLS through legacy permissive policies',async()=>{
   await user(1);await db.query('UPDATE profiles SET is_approved=false WHERE id=$1',[id(5)]);
   await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT ON projects TO authenticated; CREATE POLICY legacy_open_projects ON projects FOR SELECT TO authenticated USING(true);');
   await user(5);await db.exec('SET ROLE authenticated');
   try { assert.equal((await db.query('SELECT * FROM projects')).rows.length,0); }
   finally { await db.exec('RESET ROLE'); }
 });

 await db.exec(`ALTER TABLE projects ADD COLUMN completion_percentage numeric;
 ALTER TABLE salary_slips ADD COLUMN total_amount numeric, ADD COLUMN total_pay numeric, ADD COLUMN status text;
 CREATE TABLE milestones(id uuid PRIMARY KEY,project_id uuid,status text,completion_percentage numeric,description text);
 CREATE TABLE milestone_media(id uuid DEFAULT gen_random_uuid(),milestone_id uuid,url text);`);
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_z_milestones.sql',import.meta.url),'utf8'));
 await user(2);
 await db.query("INSERT INTO milestones VALUES($1,$2,'Pending',0,'Foundation')",[id(90),id(10)]);
 await db.query("INSERT INTO milestones VALUES($1,$2,'Pending',0,'Roof')",[id(91),id(10)]);
 await check('partial milestones contribute to project progress',async()=>{
   await db.query('SELECT update_project_milestone($1,$2,$3)',[id(10),id(90),JSON.stringify({status:'In Progress',completion_percentage:50})]);
   assert.equal(Number((await db.query('SELECT completion_percentage FROM projects WHERE id=$1',[id(10)])).rows[0].completion_percentage),25);
 });
 await check('invalid milestone media rolls back progress and attachments',async()=>{
   await assert.rejects(db.query('SELECT update_project_milestone($1,$2,$3)',[id(10),id(90),JSON.stringify({status:'Completed',completion_percentage:100,media_urls:['https://storage.fixture/photo.jpg','javascript:alert(1)']})]),/secure storage URL/);
   assert.equal(Number((await db.query('SELECT completion_percentage FROM milestones WHERE id=$1',[id(90)])).rows[0].completion_percentage),50);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM milestone_media')).rows[0].n,0);
 });
 await check('milestone RPC does not accept a foreign project identifier',async()=>{
   await assert.rejects(db.query('SELECT update_project_milestone($1,$2,$3)',[id(10),id(999),JSON.stringify({status:'Completed'})]),/Milestone not found/);
 });
 await check('project spend includes received orders and paid wages exactly once',async()=>{
   await user(1);
   await db.query("UPDATE salary_slips SET total_amount=200,status='Pending' WHERE project_id=$1",[id(10)]);
   await db.query('SELECT refresh_project_spend($1)',[id(10)]);
   assert.equal(Number((await db.query('SELECT spent_cost FROM projects WHERE id=$1',[id(10)])).rows[0].spent_cost),1050);
   await db.query("UPDATE salary_slips SET status='Paid' WHERE project_id=$1",[id(10)]);
   assert.equal(Number((await db.query('SELECT spent_cost FROM projects WHERE id=$1',[id(10)])).rows[0].spent_cost),1250);
 });

 await check('budget alerts remain unique when the financial ledger is refreshed repeatedly',async()=>{
   await db.query('SELECT refresh_project_spend($1)',[id(10)]);
   await db.query('SELECT refresh_project_spend($1)',[id(10)]);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM project_budget_alerts WHERE project_id=$1',[id(10)])).rows[0].n,2);
 });
 await check('supplier cannot self-approve a counter-offer through direct SQL',async()=>{
   await user(2);
   const po=(await db.query("INSERT INTO purchase_orders(project_id,supplier_id,material_id,quantity_ordered,unit_price,status) VALUES($1,$2,$3,5,20,'Pending Delivery') RETURNING id",[id(10),id(6),order.material_id])).rows[0].id;
   await user(6); await db.query("UPDATE purchase_orders SET status='Suggested' WHERE id=$1",[po]);
   await assert.rejects(db.query("UPDATE purchase_orders SET status='Confirmed' WHERE id=$1",[po]),/cannot approve its own/);
 });
 await check('new schedules and variations cannot arrive pre-approved',async()=>{
   await user(2);
   await assert.rejects(db.query("INSERT INTO variation_orders(id,project_id,amount,status) VALUES($1,$2,100,'Approved')",[id(92),id(10)]),/await client review/);
   await assert.rejects(db.query("INSERT INTO client_payment_schedule(id,project_id,amount,status) VALUES($1,$2,100,'Paid')",[id(93),id(10)]),/await verification/);
 });
 await check('browser identities cannot forge attendance review evidence',async()=>{
   const result=(await db.query("SELECT has_column_privilege('authenticated','attendance','reviewed_at','UPDATE') AS allowed")).rows[0];
   assert.equal(result.allowed,false);
 });
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_zz_inquiries.sql',import.meta.url),'utf8'));
 await check('public inquiry is persisted even when there are no enabled administrators',async()=>{
   await user(1); await db.query('UPDATE profiles SET is_approved=false WHERE id=$1',[id(1)]);
   const result=await db.query('SELECT submit_public_inquiry($1) AS id',[JSON.stringify({name:'Test Client',email:'test@example.invalid',message:'Please contact me about a project.'})]);
   assert(result.rows[0].id);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM public_inquiries')).rows[0].n,1);
   assert.equal((await db.query("SELECT has_function_privilege('anon','submit_public_inquiry(jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false);
 });

 await db.exec(`ALTER TABLE milestones ADD COLUMN title text;
 CREATE TABLE shared_documents(id uuid DEFAULT gen_random_uuid(),project_id uuid,name text,category text,file_url text,status text,uploaded_by uuid);`);
 await db.exec(await readFile(new URL('../migrations/20261116_workflow_zzz_project_payload.sql',import.meta.url),'utf8'));
 await user(2);
 await check('a bad nested BOQ rolls back the entire new project and its milestones',async()=>{
   const before=(await db.query('SELECT count(*)::int AS n FROM projects')).rows[0].n;
   await assert.rejects(db.query('SELECT save_project_with_assignments(null,$1)',[JSON.stringify({name:'Atomic BOQ',location:'Colombo',pm_id:id(2),start_date:'2026-01-01',end_date:'2026-12-31',boq_data:{milestones:[{title:'Nested foundation',duration_days:4}],materials:[{name:'Invalid material',allocated_quantity:-1,unit_price:10}]}})]),/Invalid BOQ material/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM projects')).rows[0].n,before);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM milestones WHERE title='Nested foundation'")).rows[0].n,0);
 });
 await check('BOQ budget, milestones and zero-stock material baselines commit once',async()=>{
   const boq={total_budget:5000,milestones:[{title:'BOQ foundation',duration_days:4}],materials:[{name:'BOQ steel',allocated_quantity:20,unit_price:100}]};
   await db.query('SELECT apply_project_boq($1,$2)',[id(10),JSON.stringify(boq)]);
   await db.query('SELECT apply_project_boq($1,$2)',[id(10),JSON.stringify(boq)]);
   assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),5000);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM milestones WHERE project_id=$1 AND title='BOQ foundation'",[id(10)])).rows[0].n,1);
   const materials=(await db.query("SELECT current_stock FROM materials WHERE project_id=$1 AND name='BOQ steel'",[id(10)])).rows;
   assert.equal(materials.length,1); assert.equal(Number(materials[0].current_stock),0);
 });
 await check('failed BOQ application preserves the previous budget',async()=>{
   await assert.rejects(db.query('SELECT apply_project_boq($1,$2)',[id(10),JSON.stringify({total_budget:9000,materials:[{name:'Bad',allocated_quantity:1,unit_price:-1}]})]),/Invalid BOQ material/);
   assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),5000);
 });

 await db.exec(`ALTER TABLE material_requests ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE client_payment_schedule ADD COLUMN created_by uuid;
 ALTER TABLE client_payment_schedule ALTER COLUMN id SET DEFAULT gen_random_uuid();
 ALTER TABLE variation_orders ADD COLUMN created_by uuid, ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE variation_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
 await db.exec(await readFile(new URL('../migrations/20261117_project_commercial_ui.sql',import.meta.url),'utf8'));
 await check('managers create project payment stages and pending client variations',async()=>{
   await user(2);
   const payment=(await db.query('SELECT create_project_commercial_record($1,$2,$3) AS value',[id(10),'payment',JSON.stringify({description:'Foundation stage',amount:750,due_date:'2030-01-01'})])).rows[0].value;
   assert.equal(payment.status,'Pending'); assert.equal(payment.project_id,id(10));
   const variation=(await db.query('SELECT create_project_commercial_record($1,$2,$3) AS value',[id(10),'variation',JSON.stringify({title:'Extra wall',description:'Additional boundary wall',amount:250})])).rows[0].value;
   assert.equal(variation.status,'Pending');
   assert.equal(Number((await db.query('SELECT total_budget FROM projects WHERE id=$1',[id(10)])).rows[0].total_budget),5000);
 });
 await check('clients cannot create their own financial records through privileged RPCs',async()=>{
   await user(4);
   await assert.rejects(db.query('SELECT create_project_commercial_record($1,$2,$3)',[id(10),'payment',JSON.stringify({description:'Fake',amount:10,due_date:'2030-01-01'})]),/management access/);
 });
 await check('project document links require HTTPS and project authority',async()=>{
   await user(2);
   await assert.rejects(db.query('SELECT attach_project_document($1,$2)',[id(10),JSON.stringify({name:'Plan',url:'javascript:alert(1)'})]),/secure URL/);
   const document=(await db.query('SELECT attach_project_document($1,$2) AS value',[id(10),JSON.stringify({name:'Architectural plan',url:'https://fixture.invalid/plan.pdf'})])).rows[0].value;
   assert.equal(document.project_id,id(10)); assert.equal(document.filename,'Architectural plan');
 });

 await check('catalog receipts reuse the BOQ stock row and update its actual unit cost',async()=>{
   await user(2);
   const catalog=(await db.query("INSERT INTO material_catalog(name,unit) VALUES('BOQ matching item','bags') RETURNING id")).rows[0].id;
   await db.query("INSERT INTO materials(id,project_id,name,unit,current_stock,unit_price) VALUES($1,$2,'BOQ matching item','bags',0,8)",[id(95),id(10)]);
   const po=(await db.query("INSERT INTO purchase_orders(project_id,supplier_id,material_id,quantity_ordered,unit_price,status) VALUES($1,$2,$3,10,12,'Pending Delivery') RETURNING id",[id(10),id(6),catalog])).rows[0].id;
   await user(6); await db.query("UPDATE purchase_orders SET status='Confirmed' WHERE id=$1",[po]); await db.query("UPDATE purchase_orders SET status='Delivered' WHERE id=$1",[po]);
   await user(2); await db.query('SELECT receive_purchase_order_quantity($1,3,$2)',[po,id(96)]);
   const rows=(await db.query("SELECT id,current_stock,unit_price FROM materials WHERE project_id=$1 AND name='BOQ matching item'",[id(10)])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].id,id(95));assert.equal(Number(rows[0].current_stock),3);assert.equal(Number(rows[0].unit_price),12);
 });
 const { runBoqChecks } = await import('./boq_connected_sql.mjs');
 await runBoqChecks({ db, id, user, check });
 await check('display admin role reproduces the reported assignment rejection',async()=>{
   await user(8);
   await db.query("INSERT INTO profiles(id,role,is_approved) VALUES($1,'Super Admin',true)",[id(701)]);
   await db.query("UPDATE profiles SET is_approved=true WHERE id=$1",[id(1)]);
   await user(1);
   await assert.rejects(db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({admins:[id(701)]})]),/Invalid or unapproved admin assignment/);
 });
 const roleMigration=await readFile(new URL('../migrations/20261118_project_assignment_role_names.sql',import.meta.url),'utf8');
 await db.exec(roleMigration);
 await check('approved display role aliases save with canonical assignment roles',async()=>{
   for (const [n,role,key,stored] of [[701,'Super Admin','admins','admin'],[702,'Admin','admins','admin'],[703,'Worker','workers','worker'],[704,'Site Manager','site_managers','site_manager'],[705,'Supplier','suppliers','supplier']]) {
     await db.query('INSERT INTO profiles(id,role,is_approved) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET role=excluded.role,is_approved=true',[id(n),role]);
     await db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({[key]:[id(n)]})]);
     assert.equal((await db.query('SELECT role FROM project_role_assignments WHERE project_id=$1 AND user_id=$2',[id(10),id(n)])).rows[0].role,stored);
   }
 });
 await check('normalization still rejects unapproved accounts and wrong roles atomically',async()=>{
   await db.query('UPDATE profiles SET is_approved=false WHERE id=$1',[id(701)]);
   for (const candidate of [id(701),id(703)]) {
     await assert.rejects(db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({name:'Must roll back',admins:[candidate]})]),/Invalid or unapproved admin assignment/);
     assert.notEqual((await db.query('SELECT name FROM projects WHERE id=$1',[id(10)])).rows[0].name,'Must roll back');
   }
 });
 await check('PM still cannot assign administrators after role normalization',async()=>{
   await user(2);
   await assert.rejects(db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({admins:[id(702)]})]),/Only administrators/);
   await user(1);
 });
 await check('assignment normalization migration can be safely reapplied',async()=>{await db.exec(roleMigration);});
 await check('complete workflow schema supports audit capture without bypassing project RPC',async()=>{
   await db.exec(await readFile(new URL('../migrations/20261120_audit_events.sql',import.meta.url),'utf8'));
   await db.exec(await readFile(new URL('../migrations/20261120_audit_business_details.sql',import.meta.url),'utf8'));
   await user(1);
   await db.query('SELECT save_project_with_assignments($1,$2)',[id(10),JSON.stringify({name:'Audited QA project'})]);
   const event=(await db.query("SELECT * FROM audit_events WHERE table_name='projects' AND action='UPDATE' ORDER BY id DESC LIMIT 1")).rows[0];
   assert.equal(event.project_id,id(10));assert.equal(event.actor_id,id(1));assert(event.changed_fields.includes('name'));
   assert.equal(event.after_data.name,'Audited QA project');
 });
 const {runStaffIdentityChecks}=await import('./staff_identity_sql.mjs');
 await runStaffIdentityChecks({db,id,user,check});
 const {runAttendanceDeleteChecks}=await import('./attendance_delete_sql.mjs');
 await runAttendanceDeleteChecks({db,id,user,check});
 const {runRoleNotificationChecks}=await import('./role_notifications_sql.mjs');
 await runRoleNotificationChecks({db,id,user,check});
 console.log(`${checks} transactional security checks passed.`);
} catch (error) { console.error({message:error.message,position:error.position,internalQuery:error.internalQuery,where:error.where}); process.exitCode=1; }
finally { await db.close(); }
