import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function runRoleNotificationChecks({db,id,user,check}) {
 const sql=await readFile(new URL('../migrations/20261123_role_activity_notifications.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 const notices=async(table,record)=> (await db.query('SELECT * FROM notifications WHERE source_table=$1 AND source_record=$2',[table,record])).rows;
 await user(1);
 await db.query("INSERT INTO projects(id,name,pm_id,client_id) VALUES($1,'Notification fixture',$2,$3)",[id(970),id(2),id(4)]);
 await db.query('INSERT INTO site_manager_sites(id,project_id,site_manager_id) VALUES($1,$2,$3)',[id(971),id(970),id(1002)]);
 await db.query("INSERT INTO sites(id,project_id) VALUES($1,$2)",[id(972),id(970)]);
 await db.query('INSERT INTO auth.users VALUES($1)',[id(973)]);
 await db.query("INSERT INTO profiles(id,role,is_approved,full_name) VALUES($1,'worker',true,'Notification worker')",[id(973)]);
 await db.query('INSERT INTO workers(id,user_id) VALUES($1,$1)',[id(973)]);
 await db.query('INSERT INTO site_workers(id,project_id,worker_id) VALUES($1,$2,$3)',[id(974),id(970),id(973)]);
 await check('project activity targets assigned roles and excludes unrelated managers/workers/suppliers',async()=>{
  const rows=await notices('projects',id(970));const recipients=rows.map(row=>row.target_user_id);
  assert(recipients.includes(id(1)));assert(recipients.includes(id(2)));assert(recipients.includes(id(4)));
  assert(!recipients.includes(id(5)));assert(!recipients.includes(id(6)));assert(!recipients.includes(id(3)));
 });
 await check('worker attendance reaches owner and site staff, with no client/supplier leakage',async()=>{
  await db.query("INSERT INTO attendance(id,worker_id,site_id,date,status,check_in_time,hours_worked,overtime_hours) VALUES($1,$2,$3,'2020-02-01','Present','2020-02-01T03:00Z',0,0)",[id(975),id(973),id(972)]);
  const rows=await notices('attendance',id(975)),recipients=rows.map(row=>row.target_user_id);
  assert(recipients.includes(id(973)));assert(recipients.includes(id(2)));assert(recipients.includes(id(1002)));
  assert(!recipients.includes(id(4)));assert(!recipients.includes(id(6)));
  assert.equal(rows.find(row=>row.target_user_id===id(973)).link,'/worker/attendance');
 });
 await check('failed transactions roll back their notifications',async()=>{
  const before=(await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n;
  await db.exec('BEGIN');await db.query("UPDATE projects SET name='Rolled back' WHERE id=$1",[id(970)]);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n,before);
 });
 await check('supplier order notifications are personal, actionable and deduplicate legacy SQL copies',async()=>{
  await db.query("INSERT INTO project_role_assignments VALUES($1,$2,'supplier')",[id(970),id(6)]);
  await db.exec('BEGIN');
  await db.query("INSERT INTO purchase_orders(id,project_id,supplier_id,status,quantity_ordered,unit_price,total_price) VALUES($1,$2,$3,'Pending Delivery',1,100,100)",[id(977),id(970),id(6)]);
  await db.query("INSERT INTO notifications(project_id,target_user_id,target_role,title,type) VALUES($1,$2,'supplier','Legacy order copy','general')",[id(970),id(6)]);
  await db.exec('COMMIT');
  const rows=await notices('purchase_orders',id(977));
  assert.equal(rows.filter(row=>row.target_user_id===id(6)).length,1);
  assert.equal(rows.find(row=>row.target_user_id===id(6)).link,'/supplier/orders/'+id(977));
  assert(!rows.some(row=>[id(4),id(3),id(973),id(5)].includes(row.target_user_id)));
  assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE title='Legacy order copy'")).rows[0].n,0);
 });
 await check('client progress and account approval updates reach the right identities',async()=>{
  await db.query("INSERT INTO milestones(id,project_id,title,status,completion_percentage) VALUES($1,$2,'Foundation','Pending',0)",[id(978),id(970)]);
  assert((await notices('milestones',id(978))).some(row=>row.target_user_id===id(4)&&row.link==='/client/project'));
  await db.query('INSERT INTO auth.users VALUES($1)',[id(979)]);
  await db.query("INSERT INTO profiles(id,role,is_approved,full_name) VALUES($1,'worker',false,'Pending fixture')",[id(979)]);
  assert(!(await notices('profiles',id(979))).some(row=>row.target_user_id===id(979)));
  await db.query('UPDATE profiles SET is_approved=true WHERE id=$1',[id(979)]);
  assert((await notices('profiles',id(979))).some(row=>row.target_user_id===id(979)&&row.title==='Account approved'));
 });
 await check('removed worker still receives their personal assignment notification',async()=>{
  await db.query('DELETE FROM site_workers WHERE id=$1',[id(974)]);
  const rows=await notices('site_workers',id(974));
  assert(rows.some(row=>row.target_user_id===id(973)&&row.title==='Project assignment removed'&&row.project_id===null));
  await db.query('INSERT INTO site_workers(id,project_id,worker_id) VALUES($1,$2,$3)',[id(974),id(970),id(973)]);
 });
 await check('assignment aliases in one transaction produce one personal update',async()=>{
  await db.query('DELETE FROM site_workers WHERE id=$1',[id(974)]);
  await db.exec('BEGIN');
  const tx=(await db.query('SELECT txid_current() n')).rows[0].n;
  await db.query('INSERT INTO site_workers(id,project_id,worker_id) VALUES($1,$2,$3)',[id(980),id(970),id(973)]);
  await db.query("INSERT INTO project_role_assignments(project_id,user_id,role) VALUES($1,$2,'worker')",[id(970),id(973)]);
  await db.exec('COMMIT');
  assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE event_txid=$1 AND target_user_id=$2 AND title='Project assignment created'",[tx,id(973)])).rows[0].n,1);
 });
 await check('private staff compensation notifies only its owner and administrators',async()=>{
  await db.query('UPDATE staff_compensation SET monthly_salary=monthly_salary+100 WHERE user_id=$1',[id(1002)]);
  const rows=await notices('staff_compensation',id(1002));
  assert(rows.some(row=>row.target_user_id===id(1002)));
  assert(!rows.some(row=>[id(2),id(4),id(6),id(973)].includes(row.target_user_id)));
  assert.equal(rows.find(row=>row.target_user_id===id(1002)).link,'/site-manager/my-salary');
 });
 await db.exec('CREATE TABLE client_messages(id uuid PRIMARY KEY,project_id uuid,sender_id uuid,receiver_id uuid,receiver_role text,message_text text,read_at timestamptz);');
 // Migration is repeatable and attaches to optional tables once present.
 await db.exec(sql);
 await check('private messages notify only the receiver without copying message contents',async()=>{
  await db.query("INSERT INTO client_messages VALUES($1,$2,$3,$4,'client','Private fixture text',null)",[id(976),id(970),id(2),id(4)]);
  const rows=await notices('client_messages',id(976));assert.equal(rows.length,1);assert.equal(rows[0].target_user_id,id(4));assert.equal(rows[0].link,'/client/messages');assert(!rows[0].message.includes('Private fixture text'));
  await db.query('UPDATE client_messages SET read_at=now() WHERE id=$1',[id(976)]);
  assert.equal((await notices('client_messages',id(976))).length,1);
 });
 await check('notification receipts and unread totals stay personal beyond the latest fifty events',async()=>{
  await user(4);
  const foreign=(await notices('attendance',id(975))).find(row=>row.target_user_id===id(973));
  assert.equal((await db.query('SELECT mark_own_notifications_read(ARRAY[$1::uuid],false) n',[foreign.id])).rows[0].n,0);
  for(let i=0;i<55;i++)await db.query("INSERT INTO notifications(target_user_id,target_role,title,message,type) VALUES($1,'client','Fixture','Fixture','general')",[id(4)]);
  const feed=(await db.query('SELECT get_own_notification_feed() feed')).rows[0].feed;
  assert.equal(feed.items.length,50);assert(feed.unread_count>=55);
  const mine=feed.items[0];await db.query('SELECT mark_own_notifications_read(ARRAY[$1::uuid],false)',[mine.id]);
  const after=(await db.query('SELECT get_own_notification_feed() feed')).rows[0].feed;
  assert.equal(after.unread_count,feed.unread_count-1);
  await user(5);const unrelated=(await db.query('SELECT get_own_notification_feed() feed')).rows[0].feed;
  assert(!unrelated.items.some(row=>row.target_user_id===id(4)));
  await user(1);
 });
 await check('permanent deletion produces one retained project event and no child-notification blockers',async()=>{
  await db.query('SELECT permanently_delete_project($1,$2)',[id(970),'Notification fixture']);
  assert.equal((await db.query('SELECT count(*)::int n FROM projects WHERE id=$1',[id(970)])).rows[0].n,0);
  const rows=await notices('projects',id(970));assert(rows.some(row=>row.title==='Project removed'&&row.target_user_id===id(2)&&row.project_id===null));
  for(const person of [1002,973,6])assert(rows.some(row=>row.title==='Project removed'&&row.target_user_id===id(person)&&row.project_id===null));
 });
 await check('notification generation cannot be forged through public RPCs or direct inserts',async()=>{
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','cf_role_activity_notification()','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','notifications','INSERT') allowed")).rows[0].allowed,false);
 });
}
