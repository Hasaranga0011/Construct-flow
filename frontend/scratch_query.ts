import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Querying information_schema to get columns of 'projects' table
  const { data, error } = await supabase.rpc('get_projects_columns'); // Supabase blocks information_schema from anon by default
  // Instead, let's just make a POST to postgres using a generic select if we can't get it.
  
  // We can just try to select 'spent_cost, actual_cost, project_cost' to see which one succeeds
  const checks = ['spent_cost', 'actual_cost', 'project_cost'];
  
  for (const field of checks) {
    const res = await supabase.from('projects').select(field).limit(1);
    if (!res.error) {
      console.log(`Field EXISTS: ${field}`);
    } else {
      console.log(`Field MISSING: ${field} - ${res.error.message}`);
    }
  }
}
check();
