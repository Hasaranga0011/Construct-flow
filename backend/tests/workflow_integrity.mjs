import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';

// Entirely in-memory: no network, real users, or production credentials.
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let checks = 0;
async function check(name, run) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
async function asUser(userId, run) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)", [userId]);
  try { return await run(); }
  finally {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)");
  }
}
async function save(projectId, data) {
  const result = await db.query('SELECT public.save_project_with_assignments($1, $2::jsonb) AS project', [projectId, JSON.stringify(data)]);
  return result.rows[0].project;
}
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, email text, role text);
    CREATE TABLE public.projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), name text NOT NULL,
      location text, status text DEFAULT 'active', completion_percentage integer DEFAULT 0, spent_cost numeric DEFAULT 0,
      total_budget numeric DEFAULT 0, start_date date, end_date date, client_id uuid REFERENCES profiles(id), pm_id uuid REFERENCES profiles(id),
      latitude numeric, longitude numeric, address text);
    CREATE TABLE public.project_role_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id),
      user_id uuid REFERENCES profiles(id), role text CHECK(role IN ('admin','pm','client','worker','site_manager','supplier')),
      UNIQUE(project_id,user_id,role));
    CREATE TABLE public.pm_projects(project_id uuid REFERENCES projects(id), pm_id uuid REFERENCES profiles(id), UNIQUE(project_id,pm_id));
    CREATE TABLE public.materials(id uuid PRIMARY KEY, global_stock_quantity numeric DEFAULT 0);
    CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), supplier_id uuid REFERENCES profiles(id),
      material_id uuid REFERENCES materials(id), quantity_ordered numeric, po_number text, status text);
    CREATE TABLE public.notifications(project_id uuid, target_role text, title text, message text, type text);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    CREATE POLICY project_role_assignments_access ON project_role_assignments FOR ALL USING(true) WITH CHECK(true);
    CREATE POLICY "Allow project role assignments" ON project_role_assignments FOR ALL USING(true) WITH CHECK(true);
  `);
  for (const [n, role] of [[1,'super_admin'],[2,'pm'],[3,'worker'],[4,'supplier'],[5,'client'],[6,'pm']]) {
    await db.query('INSERT INTO profiles(id,role) VALUES($1,$2)',[id(n),role]);
  }
  const migration = await readFile(new URL('../migrations/20260925_workflow_integrity.sql', import.meta.url), 'utf8');
  await check('migration applies and can be rerun', async () => { await db.exec(migration); await db.exec(migration); });
  let project;
  await check('project and assignments saved together', async () => {
    project = await asUser(id(1), () => save(null, { name:'Original', location:'Colombo', start_date:'2026-01-01', end_date:'2026-12-31', total_budget:1000, pm_id:id(2), client_id:id(5), workers:[id(3)], suppliers:[id(4)] }));
    assert.equal(project.total_budget,1000);
    assert.equal((await db.query('SELECT * FROM project_role_assignments WHERE project_id=$1',[project.id])).rows.length,4);
  });
  await check('partial update preserves omitted assignments', async () => {
    const updated = await asUser(id(2), () => save(project.id,{name:'Renamed'}));
    assert.equal(updated.name,'Renamed');
    assert.equal((await db.query('SELECT * FROM project_role_assignments WHERE project_id=$1',[project.id])).rows.length,4);
  });
  await check('explicit empty assignment clears only that role', async () => {
    await asUser(id(1), () => save(project.id,{workers:[]}));
    const rows = (await db.query('SELECT role FROM project_role_assignments WHERE project_id=$1',[project.id])).rows;
    assert.equal(rows.length,3);
    assert.ok(!rows.some(row => row.role==='worker'));
  });
  await check('invalid assignment rolls back project and assignment changes', async () => {
    await assert.rejects(() => asUser(id(1), () => save(project.id,{name:'Must roll back',suppliers:[id(999)]})));
    assert.equal((await db.query('SELECT name FROM projects WHERE id=$1',[project.id])).rows[0].name,'Renamed');
    assert.equal((await db.query("SELECT user_id FROM project_role_assignments WHERE project_id=$1 AND role='supplier'",[project.id])).rows[0].user_id,id(4));
  });
  await check('worker cannot write project through RPC', async () => {
    await assert.rejects(() => asUser(id(3), () => save(project.id,{name:'Forbidden'})), /Not authorized/);
  });
  await check('unassigned PM cannot write another project', async () => {
    await assert.rejects(() => asUser(id(6), () => save(project.id,{name:'Forbidden'})), /Not your project/);
  });
  await check('PM cannot grant admin assignments', async () => {
    await assert.rejects(() => asUser(id(2), () => save(project.id,{admins:[id(3)]})), /Only admins/);
  });
  await check('profile role cannot be self-promoted', async () => {
    await assert.rejects(() => asUser(id(3), () => db.query("UPDATE profiles SET role='super_admin' WHERE id=$1",[id(3)])), /Only an administrator/);
  });
  await check('signup metadata cannot create an admin', async () => {
    await db.exec('CREATE TRIGGER signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()');
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)',[id(7),'new@example.test',JSON.stringify({full_name:'New User',role:'super_admin'})]);
    assert.equal((await db.query('SELECT role FROM profiles WHERE id=$1',[id(7)])).rows[0].role,'client');
  });
  await db.query('INSERT INTO materials(id,global_stock_quantity) VALUES($1,10)',[id(10)]);
  await db.query("INSERT INTO purchase_orders VALUES($1,$2,$3,$4,5,'PO-TEST','Confirmed')",[id(20),project.id,id(4),id(10)]);
  await check('repeated delivery increments stock once', async () => {
    await asUser(id(4), () => db.query('SELECT deliver_purchase_order($1)',[id(20)]));
    await asUser(id(4), () => db.query('SELECT deliver_purchase_order($1)',[id(20)]));
    assert.equal(Number((await db.query('SELECT global_stock_quantity FROM materials WHERE id=$1',[id(10)])).rows[0].global_stock_quantity),15);
    assert.equal((await db.query('SELECT * FROM notifications')).rows.length,2);
  });
  await check('worker cannot deliver an order', async () => {
    await assert.rejects(() => asUser(id(3), () => db.query('SELECT deliver_purchase_order($1)',[id(20)])), /Not your order/);
  });
  await check('missing profile cannot bypass delivery authorization', async () => {
    await assert.rejects(() => asUser(id(99), () => db.query('SELECT deliver_purchase_order($1)',[id(20)])), /Not your order/);
  });
  await check('non-admin cannot insert assignments directly', async () => {
    await assert.rejects(() => asUser(id(3), () => db.query("INSERT INTO project_role_assignments(project_id,user_id,role) VALUES($1,$2,'admin')",[project.id,id(3)])), /row-level security/);
  });
  console.log(`${checks} database checks passed`);
} finally { await db.close(); }
