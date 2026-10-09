import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let count = 0;
async function check(name, run) { await run(); console.log('PASS', name); count++; }
async function user(n) { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]); }
async function stock() { return Number((await db.query('SELECT current_stock FROM materials WHERE id=$1', [id(21)])).rows[0].current_stock); }
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text);
    CREATE TABLE projects(id uuid PRIMARY KEY, pm_id uuid);
    CREATE TABLE project_role_assignments(project_id uuid,user_id uuid,role text);
    CREATE FUNCTION cf_current_role() RETURNS text LANGUAGE sql AS $$ SELECT role FROM profiles WHERE id=auth.uid() $$;
    CREATE FUNCTION cf_can_manage_project(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM projects WHERE id=p AND pm_id=auth.uid()) $$;
    CREATE TABLE materials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,name text,unit text,current_stock numeric DEFAULT 0,minimum_threshold numeric);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY,project_id uuid,supplier_id uuid,material_id text,quantity_ordered numeric,status text,po_number text,items text);
    CREATE TABLE notifications(project_id uuid,target_role text,title text,message text,type text);
    CREATE FUNCTION old_delivery_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE materials SET current_stock=current_stock+NEW.quantity_ordered WHERE id=NEW.material_id::uuid; RETURN NEW; END $$;
    CREATE TRIGGER po_delivery_stock_trigger AFTER UPDATE OF status ON purchase_orders FOR EACH ROW WHEN(NEW.status='Delivered') EXECUTE FUNCTION old_delivery_stock();
  `);
  for (const [n,role] of [[1,'super_admin'],[2,'supplier'],[3,'pm'],[4,'worker'],[5,'site_manager'],[6,'supplier']]) {
    await db.query('INSERT INTO auth.users VALUES($1)', [id(n)]);
    await db.query('INSERT INTO profiles VALUES($1,$2)', [id(n),role]);
  }
  await db.query('INSERT INTO projects VALUES($1,$2)', [id(11),id(3)]);
  await db.query('INSERT INTO project_role_assignments VALUES($1,$2,$3)', [id(11),id(5),'site_manager']);
  await db.query('INSERT INTO materials(id,project_id,name,current_stock) VALUES($1,$2,$3,10)', [id(21),id(11),'Cement']);
  await db.query("INSERT INTO purchase_orders VALUES($1,$2,$3,$4,5,'Confirmed','PO-31','Cement')", [id(31),id(11),id(2),id(21)]);
  const migration=await readFile(new URL('../migrations/20261006_receipt_stock_boundary.sql',import.meta.url),'utf8');
  await check('migration applies and is repeatable', async()=>{await db.exec(migration);await db.exec(migration);});
  await check('supplier delivery is idempotent and does not increment stock', async()=>{
    await user(2);await db.query('SELECT deliver_purchase_order($1)',[id(31)]);await db.query('SELECT deliver_purchase_order($1)',[id(31)]);assert.equal(await stock(),10);
  });
  await check('supplier cannot receive goods', async()=>{await user(2);await assert.rejects(db.query('SELECT receive_purchase_order($1)',[id(31)]),/Only the project team/);});
  await check('receipt increments stock exactly once', async()=>{
    await user(3);await db.query('SELECT receive_purchase_order($1)',[id(31)]);await db.query('SELECT receive_purchase_order($1)',[id(31)]);assert.equal(await stock(),15);
    assert.equal((await db.query('SELECT status FROM purchase_orders WHERE id=$1',[id(31)])).rows[0].status,'Received');
  });
  await check('other suppliers and workers cannot deliver', async()=>{
    for(const n of [4,6]){await user(n);await assert.rejects(db.query('SELECT deliver_purchase_order($1)',[id(31)]),/Not your order/);}
  });
  await check('legacy material names resolve inside the receipt transaction', async()=>{
    await db.query("INSERT INTO purchase_orders VALUES($1,$2,$3,'Cement',2,'Delivered','PO-32','Cement')",[id(32),id(11),id(2)]);
    await user(5);await db.query('SELECT receive_purchase_order($1)',[id(32)]);assert.equal(await stock(),17);
    assert.equal((await db.query('SELECT material_id FROM purchase_orders WHERE id=$1',[id(32)])).rows[0].material_id,id(21));
  });
  await check('failed stock update rolls back receipt status', async()=>{
    await db.query("INSERT INTO purchase_orders VALUES($1,$2,$3,$4,2,'Delivered','PO-33','Missing')",[id(33),id(11),id(2),id(99)]);
    await user(3);await assert.rejects(db.query('SELECT receive_purchase_order($1)',[id(33)]),/Material not found/);
    assert.equal((await db.query('SELECT status FROM purchase_orders WHERE id=$1',[id(33)])).rows[0].status,'Delivered');assert.equal(await stock(),17);
  });
  console.log(`${count} in-memory PostgreSQL checks passed; no live database accessed.`);
} finally { await db.close(); }
