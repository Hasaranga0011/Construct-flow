const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
  console.log('--- Authenticating... ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin_test99@gmail.com', // Using the admin account we created
    password: 'TestPassword123!',
  });

  if (authError) {
    console.error('Failed to authenticate:', authError);
    return;
  }
  
  console.log('--- Seeding AI Estimations & Notifications ---');

  // We need to fetch an active project ID for notifications
  const { data: projects, error: pError } = await supabase.from('projects').select('id, name').limit(3);
  
  let projectId = null;
  if (projects && projects.length > 0) {
    projectId = projects[0].id;
  }

  console.log('Inserting AI Estimations...');
  // 3 estimates spanning different confidence scores and statuses
  const { error: estError } = await supabase.from('estimations').insert([
    {
      project_name: 'Marina Tower',
      estimated_cost: 45000000.00,
      status: 'Approved',
      confidence_score: 85,
    },
    {
      project_name: 'City Mall Phase 2',
      estimated_cost: 22500000.00,
      status: 'Pending',
      confidence_score: 62,
    },
    {
      project_name: 'Green Villas',
      estimated_cost: 8000000.00,
      status: 'Draft',
      confidence_score: 35,
    }
  ]);

  if (estError) {
    console.error('Error inserting estimations:', estError);
  } else {
    console.log('Estimations inserted successfully!');
  }

  if (projectId) {
    console.log('Inserting Notifications...');
    const { error: notifError } = await supabase.from('notifications').insert([
      {
        project_id: projectId,
        title: 'Material Shortage Predicted',
        message: 'Cement inventory is projected to run out in 3 days based on current burn rate.',
        type: 'Warning',
        is_unread: true
      },
      {
        project_id: projectId,
        title: 'Labour Efficiency Peak',
        message: 'Site crew operated at 108% efficiency this week.',
        type: 'Success',
        is_unread: true
      },
      {
        project_id: projectId,
        title: 'Safety Audit Due',
        message: 'Quarterly compliance check is scheduled for tomorrow.',
        type: 'Info',
        is_unread: false
      },
      {
        project_id: projectId,
        title: 'Budget Threshold Warning',
        message: 'Electrical phase has consumed 85% of allocated funds.',
        type: 'Alert',
        is_unread: true
      }
    ]);
    
    if (notifError) {
      console.error('Error inserting notifications:', notifError);
    } else {
      console.log('Notifications inserted successfully!');
    }
  } else {
    console.log('No active projects found, skipping notifications seed.');
  }

  console.log('--- Done ---');
}

seedData();
