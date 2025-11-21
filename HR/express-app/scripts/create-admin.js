/**
 * Create Main Manager Account
 * Run with: node scripts/create-admin.js
 */

import sql from '../config/database.js';

async function createAdmin() {
  try {
    console.log('Creating main manager account...');
    
    const username = 'test';
    const password = 'test';
    const role = 'main_manager';
    const fullName = 'Test Main Manager';
    
    // Check if user already exists
    const existing = await sql`
      SELECT id FROM users WHERE username = ${username}
    `;
    
    if (existing.length > 0) {
      console.log('User already exists. Updating password...');
      await sql`
        UPDATE users 
        SET password = ${password}, is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE username = ${username}
      `;
      console.log('✅ User updated successfully!');
      console.log(`Username: ${username}`);
      console.log(`Password: ${password}`);
      console.log(`Role: ${role}`);
    } else {
      // Create new user
      const [user] = await sql`
        INSERT INTO users (username, password, role, full_name, is_active)
        VALUES (${username}, ${password}, ${role}, ${fullName}, true)
        RETURNING id, username, role, full_name
      `;
      
      console.log('✅ Main manager account created successfully!');
      console.log(`ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Password: ${password}`);
      console.log(`Role: ${user.role}`);
      console.log(`Full Name: ${user.full_name}`);
    }
    
    console.log('\nYou can now login with:');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin account:', error);
    process.exit(1);
  }
}

createAdmin();

