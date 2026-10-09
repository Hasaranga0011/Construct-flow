const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'd:/PROJECTS/Construct-flow/backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('notifications').insert({
    user_id: 'd9b0a9b4-3b1a-4c9f-8a43-85b4b1049931', // UUID dummy
    type: 'invalid_type_test'
  });
  console.log('Insert error:', error);
}

testInsert();
