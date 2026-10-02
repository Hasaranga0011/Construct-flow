const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const pmNames = ['Nuwan Fernando', 'Ruwan Silva', 'Dinesh Kumara'];
const clientNames = ['Urban Developers', 'Oceanic Holdings', 'Kandy Real Estate'];
const supplierNames = ['Tokyo Cement', 'Lanka Iron Works', 'Nawaloka Supplies'];
const siteNames = ['Site Manager East', 'Site Manager West', 'Site Manager Central'];
const workerNames = ['Kamal Worker', 'Nimal Worker', 'Saman Worker'];

async function createUser(email, role, name) {
  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
    user_metadata: { role, full_name: name }
  });
  if (error && !error.message.includes('already exists')) {
     console.error('Error creating', email, error.message);
     return null;
  }
  
  // If already exists, fetch the user id
  if (error && error.message.includes('already exists')) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find(u => u.email === email);
      if (existing) {
         await supabase.from('profiles').upsert({ id: existing.id, email, role, full_name: name });
         return existing.id;
      }
      return null;
  }

  await supabase.from('profiles').upsert({ id: user.user.id, email, role, full_name: name });
  return user.user.id;
}

async function seed() {
  console.log('Generating more users...');
  
  const pms = [];
  const clients = [];
  const suppliers = [];
  
  for (let i = 0; i < 3; i++) {
     const pmId = await createUser(`pm${i+1}@constructflow.com`, 'pm', pmNames[i] + ' (PM)');
     if (pmId) pms.push(pmId);
     
     const clientId = await createUser(`client${i+1}@constructflow.com`, 'client', clientNames[i] + ' (Client)');
     if (clientId) clients.push(clientId);
     
     const supplierId = await createUser(`supplier${i+1}@constructflow.com`, 'supplier', supplierNames[i] + ' (Supplier)');
     if (supplierId) suppliers.push(supplierId);
     
     await createUser(`site${i+1}@constructflow.com`, 'site_manager', siteNames[i]);
     await createUser(`worker${i+1}@constructflow.com`, 'worker', workerNames[i]);
  }

  // Include original PM and Client and Supplier if they exist
  const { data: allUsers } = await supabase.from('profiles').select('id, email, role');
  const ogPm = allUsers.find(u => u.email === 'pm@constructflow.com')?.id;
  if (ogPm && !pms.includes(ogPm)) pms.push(ogPm);
  
  const ogClient = allUsers.find(u => u.email === 'client@constructflow.com')?.id;
  if (ogClient && !clients.includes(ogClient)) clients.push(ogClient);
  
  const ogSupplier = allUsers.find(u => u.email === 'supplier@constructflow.com')?.id;
  if (ogSupplier && !suppliers.includes(ogSupplier)) suppliers.push(ogSupplier);
  
  console.log(`Found ${pms.length} PMs, ${clients.length} Clients, ${suppliers.length} Suppliers`);

  // 1. Reassign Projects
  const { data: projects } = await supabase.from('projects').select('id');
  if (projects && projects.length > 0) {
     for (let i = 0; i < projects.length; i++) {
        const randomPm = pms[Math.floor(Math.random() * pms.length)];
        const randomClient = clients[Math.floor(Math.random() * clients.length)];
        await supabase.from('projects').update({
           pm_id: randomPm,
           client_id: randomClient
        }).eq('id', projects[i].id);
     }
     console.log('Randomly distributed all projects among multiple PMs and Clients.');
  }

  // 2. Reassign Purchase Orders
  const { data: pos } = await supabase.from('purchase_orders').select('id');
  if (pos && pos.length > 0) {
      for (let i = 0; i < pos.length; i++) {
         const randomSupplier = suppliers[Math.floor(Math.random() * suppliers.length)];
         await supabase.from('purchase_orders').update({
            supplier_id: randomSupplier
         }).eq('id', pos[i].id);
      }
      console.log('Randomly distributed all POs among multiple Suppliers.');
  }
  
  console.log('Done mapping everything!');
}
seed();
