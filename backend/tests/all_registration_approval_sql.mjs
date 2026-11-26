import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../.validation-db/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
try{
 await db.exec(`CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,email text,role text,contact_number text,is_approved boolean DEFAULT true);
 INSERT INTO profiles(id,role,is_approved) VALUES('00000000-0000-0000-0000-000000000001','super_admin',true);`);
 const sql=await readFile(new URL('../migrations/20261125_all_registration_approval.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()');
 for(const [index,role] of ['client','supplier','pm','site_manager','worker',null,'admin'].entries()){
  const id=`00000000-0000-0000-0000-${String(index+10).padStart(12,'0')}`;
  await db.query('INSERT INTO auth.users VALUES($1,$2,$3,$4)',[id,'fixture@example.com','{}',JSON.stringify({role,is_approved:true,name:'Signup fixture'})]);
  const row=(await db.query('SELECT * FROM profiles WHERE id=$1',[id])).rows[0];
  assert.equal(row.is_approved,false);if(role==='admin')assert.equal(row.role,'pending');
 }
 assert.equal((await db.query("SELECT is_approved FROM profiles WHERE role='super_admin'")).rows[0].is_approved,true);
 await db.exec("INSERT INTO profiles(id,role) VALUES('00000000-0000-0000-0000-000000000099','client')");
 assert.equal((await db.query("SELECT is_approved FROM profiles WHERE id='00000000-0000-0000-0000-000000000099'")).rows[0].is_approved,false);
 console.log('PASS all signup roles including Google pending identity require approval; metadata cannot self-approve; existing admin approval preserved; default false; migration idempotent');
}catch(error){console.error({message:error.message,where:error.where,position:error.position});process.exitCode=1;}finally{await db.close();}
