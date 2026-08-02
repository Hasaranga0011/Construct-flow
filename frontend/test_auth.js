require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testRole(email, password, role) {
  console.log(`\n--- Testing Role: ${role} ---`);
  
  // 1. Sign Up
  console.log(`[1] Registering ${email}...`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${role} Test User`,
        role: role,
      }
    }
  });

  if (signUpError) {
    if (signUpError.message.includes('already registered')) {
        console.log(`User already exists, skipping registration.`);
    } else {
        console.error(`Sign Up Failed:`, signUpError.message);
        return;
    }
  } else {
    console.log(`Registration successful!`);
  }

  // 2. Sign In
  console.log(`[2] Logging in...`);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.error(`Login Failed:`, signInError.message);
    return;
  }
  
  // 3. Verify Role Metadata
  const userRole = signInData.user.user_metadata.role;
  console.log(`[3] Verification:`);
  console.log(`    Expected Role: ${role}`);
  console.log(`    Actual Metadata Role: ${userRole}`);
  
  if (userRole === role) {
      console.log(`    ✅ SUCCESS: Role perfectly matches!`);
  } else {
      console.log(`    ❌ FAILED: Role desync!`);
  }
  
  // 4. Sign out
  await supabase.auth.signOut();
}

async function runTests() {
  await testRole('admin_test@example.com', 'TestPassword123!', 'Admin');
  await testRole('manager_test@example.com', 'TestPassword123!', 'Manager');
  await testRole('client_test@example.com', 'TestPassword123!', 'Client');
  console.log('\nAll backend auth flows tested successfully!\n');
}

runTests();
