const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SL_LOCATIONS = ['Colombo', 'Kandy', 'Galle', 'Kurunegala', 'Negombo', 'Gampaha', 'Matara', 'Nugegoda'];
const SL_NAMES = ['Nimal Perera', 'Sunil Fernando', 'Kamal Silva', 'Chaminda Weerasinghe', 'Kasun Bandara', 'Saman Kumara', 'Ruwan Rajapaksha', 'Tharindu Jayasuriya'];
const SUPPLIER_NAMES = ['Lanka Builders Pvt Ltd', 'Siam City Cement (Lanka)', 'Tokyo Cement Group', 'Nawaloka Construction', 'Maga Engineering', 'Access Engineering'];
const MATERIAL_NAMES = ['Portland Cement (50kg)', 'River Sand (Cube)', 'Metal 3/4 (Cube)', 'Bricks (Standard)', 'Steel Rebar 10mm (Ton)', 'PVC Pipes 2" (ft)', 'Roofing Sheets', 'Paint (10L)'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
}

async function seed() {
  console.log('Starting Sri Lanka data seed...');

  // 1. Get PM and Client users
  const { data: users, error: userErr } = await supabase.from('profiles').select('id, role');
  if (userErr) { console.error('Error fetching users:', userErr); return; }

  const pms = users.filter(u => u.role === 'pm' || u.role === 'admin' || u.role === 'super_admin');
  const clients = users.filter(u => u.role === 'client');
  const suppliers = users.filter(u => u.role === 'supplier');

  const pmId = pms.length > 0 ? pms[0].id : null;
  const clientId = clients.length > 0 ? clients[0].id : null;
  const supplierUserId = suppliers.length > 0 ? suppliers[0].id : null;

  if (!pmId) {
    console.log("No PM or Admin found to assign projects. Create one first.");
    return;
  }

  // 2. Generate 15 Projects
  const newProjects = [];
  for (let i = 0; i < 15; i++) {
    const isCommercial = Math.random() > 0.6;
    const statuses = ['active', 'completed', 'on_hold', 'In Progress'];
    const status = randomChoice(statuses);
    
    newProjects.push({
      name: `${isCommercial ? 'Commercial Complex' : 'Luxury Villa'} - ${randomChoice(SL_LOCATIONS)}`,
      location: randomChoice(SL_LOCATIONS),
      client_id: clientId,
      pm_id: pmId,
      start_date: randomDate(new Date(2025, 0, 1), new Date(2026, 0, 1)),
      end_date: randomDate(new Date(2026, 5, 1), new Date(2027, 11, 31)),
      status: status,
      total_budget: randomInt(10000000, 500000000), // 10M to 500M LKR
      spent_cost: randomInt(1000000, 40000000),
      description: `A modern ${isCommercial ? 'commercial' : 'residential'} building project in Sri Lanka.`,
    });
  }

  const { data: insertedProjects, error: projErr } = await supabase.from('projects').insert(newProjects).select('id');
  if (projErr) { console.error('Error inserting projects:', projErr); return; }
  console.log(`Inserted ${insertedProjects.length} projects.`);

  // 3. Generate Milestones for these projects
  const newMilestones = [];
  for (const proj of insertedProjects) {
    const milestoneNames = ['Site Clearance', 'Foundation Laying', 'Structure Frame', 'Roofing', 'Plumbing & Electrical', 'Finishing & Painting'];
    
    milestoneNames.forEach((name, idx) => {
      newMilestones.push({
        project_id: proj.id,
        title: name,
        description: `Complete the ${name.toLowerCase()} phase.`,
        planned_date: randomDate(new Date(), new Date(2026, 11, 31)),
        due_date: randomDate(new Date(), new Date(2026, 11, 31)),
        status: idx < 2 ? 'Completed' : idx === 2 ? 'In Progress' : 'Pending',
        completion_percentage: idx < 2 ? 100 : idx === 2 ? randomInt(20, 80) : 0
      });
    });
  }

  const { error: milErr } = await supabase.from('milestones').insert(newMilestones);
  if (milErr) { console.error('Error inserting milestones:', milErr); }
  else { console.log(`Inserted ${newMilestones.length} milestones.`); }

  // 4. Generate Materials
  const newMaterials = [];
  MATERIAL_NAMES.forEach(name => {
    newMaterials.push({
      name: name,
      category: name.includes('Cement') || name.includes('Sand') || name.includes('Metal') ? 'Raw Material' : 'Finishing',
      unit: name.includes('Cube') ? 'Cube' : name.includes('Ton') ? 'Ton' : name.includes('L') ? 'Liters' : 'Units',
      current_stock: randomInt(10, 500),
      minimum_threshold: randomInt(20, 100),
      unit_price: randomInt(1500, 25000), // LKR
    });
  });

  const { data: insertedMaterials, error: matErr } = await supabase.from('materials').insert(newMaterials).select('id, name');
  if (matErr) { console.error('Error inserting materials:', matErr); }
  else { console.log(`Inserted ${insertedMaterials.length} materials.`); }

  // 5. Generate Purchase Orders
  const newPOs = [];
  if (insertedMaterials && insertedMaterials.length > 0) {
    for (const proj of insertedProjects.slice(0, 5)) { // First 5 projects
      for (let i = 0; i < 3; i++) { // 3 POs per project
        const mat = randomChoice(insertedMaterials);
        const qty = randomInt(10, 100);
        const price = randomInt(1500, 25000);
        newPOs.push({
          project_id: proj.id,
          supplier_id: supplierUserId,
          supplier_name: suppliers.find(s => s.id === supplierUserId)?.name || randomChoice(SUPPLIER_NAMES),
          material_id: mat.id,
          po_number: `PO-${randomInt(1000, 9999)}`,
          quantity_ordered: qty,
          unit_price: price,
          total_price: qty * price,
          expected_date: randomDate(new Date(), new Date(2026, 11, 31)),
          supplier_notes: `Delivery requested to ${randomChoice(SL_LOCATIONS)} site.`
        });
      }
    }
    const { error: poErr } = await supabase.from('purchase_orders').insert(newPOs);
    if (poErr) { console.error('Error inserting POs:', poErr); }
    else { console.log(`Inserted ${newPOs.length} purchase orders.`); }
  }

  // 6. Generate Labour (Attendance Log)
  const newLabour = [];
  const today = new Date();
  
  for (let d = 0; d < 10; d++) {
    const dateStr = new Date(today.getTime() - (d * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    
    // Generate 5-10 workers per day
    const workersCount = randomInt(5, 10);
    for (let i = 0; i < workersCount; i++) {
      const isPresent = Math.random() > 0.1;
      const checkInHour = randomInt(7, 9);
      
      newLabour.push({
        project_id: randomChoice(insertedProjects).id,
        worker_name: randomChoice(SL_NAMES),
        role: randomChoice(['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Helper', 'Painter']),
        check_in_time: isPresent ? `${dateStr}T${checkInHour.toString().padStart(2, '0')}:00:00Z` : null,
        hours_worked: isPresent ? randomInt(4, 9) : 0,
        status: isPresent ? 'Present' : 'Absent',
        date: dateStr
      });
    }
  }

  const { error: workErr } = await supabase.from('labour').insert(newLabour);
  if (workErr) { console.error('Error inserting labour:', workErr); }
  else { console.log(`Inserted ${newLabour.length} labour records.`); }

  console.log('Database seeded successfully with Sri Lankan sample data!');
}

seed().catch(console.error);
