/**
 * Script to add 25 branches (19 healthcare centers and 6 schools)
 * Run with: node scripts/add-branches.js
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: 'require',
});

const healthcareCenters = [
  { name: 'Al-Riyadh Healthcare Center', location: 'Riyadh, Al-Malaz District' },
  { name: 'Jeddah Medical Center', location: 'Jeddah, Al-Balad District' },
  { name: 'Dammam Health Clinic', location: 'Dammam, Al-Faisaliyah District' },
  { name: 'Mecca Healthcare Facility', location: 'Mecca, Al-Awali District' },
  { name: 'Medina Medical Center', location: 'Medina, Quba District' },
  { name: 'Khobar Health Clinic', location: 'Khobar, Al-Rakah District' },
  { name: 'Taif Healthcare Center', location: 'Taif, Al-Hawiyah District' },
  { name: 'Abha Medical Facility', location: 'Abha, Al-Sahab District' },
  { name: 'Tabuk Health Center', location: 'Tabuk, Al-Wurud District' },
  { name: 'Buraidah Medical Clinic', location: 'Buraidah, Al-Naseem District' },
  { name: 'Khamis Mushait Healthcare', location: 'Khamis Mushait, Al-Aziziyah District' },
  { name: 'Hail Medical Center', location: 'Hail, Al-Qasr District' },
  { name: 'Najran Health Clinic', location: 'Najran, Al-Aqeeq District' },
  { name: 'Jazan Healthcare Facility', location: 'Jazan, Al-Darb District' },
  { name: 'Al-Jubail Medical Center', location: 'Jubail, Al-Fanateer District' },
  { name: 'Yanbu Health Clinic', location: 'Yanbu, Al-Nakheel District' },
  { name: 'Al-Kharj Healthcare Center', location: 'Al-Kharj, Al-Yamamah District' },
  { name: 'Qatif Medical Facility', location: 'Qatif, Al-Qudaih District' },
  { name: 'Al-Ahsa Health Center', location: 'Al-Ahsa, Al-Mubarraz District' },
];

const schools = [
  { name: 'Al-Noor Special Needs School', location: 'Riyadh, Al-Olaya District' },
  { name: 'Al-Amal Special Education Center', location: 'Jeddah, Al-Shati District' },
  { name: 'Riyadh Special Needs Academy', location: 'Riyadh, Al-Nakheel District' },
  { name: 'Jeddah Learning Center', location: 'Jeddah, Al-Zahra District' },
  { name: 'Dammam Special Education School', location: 'Dammam, Al-Corniche District' },
  { name: 'Al-Khobar Special Needs Institute', location: 'Khobar, Al-Aziziyah District' },
];

async function addBranches() {
  try {
    console.log('Starting to add branches...');
    
    // Delete all existing branches first
    console.log('Deleting all existing branches...');
    await sql`DELETE FROM branches`;
    console.log('✓ All existing branches deleted');
    
    // Add healthcare centers
    for (let i = 0; i < healthcareCenters.length; i++) {
      const center = healthcareCenters[i];
      const username = `healthcare${i + 1}`;
      const password = `hc${String(i + 1).padStart(2, '0')}2024`;
      
      try {
        await sql`
          INSERT INTO branches (branch_name, branch_location, branch_type, username, password, is_active)
          VALUES (${center.name}, ${center.location}, 'healthcare_center', ${username}, ${password}, true)
          ON CONFLICT (username) DO NOTHING
        `;
        console.log(`✓ Added healthcare center: ${center.name}`);
      } catch (error) {
        console.error(`✗ Error adding ${center.name}:`, error.message);
      }
    }
    
    // Add schools
    for (let i = 0; i < schools.length; i++) {
      const school = schools[i];
      const username = `school${i + 1}`;
      const password = `sch${String(i + 1).padStart(2, '0')}2024`;
      
      try {
        await sql`
          INSERT INTO branches (branch_name, branch_location, branch_type, username, password, is_active)
          VALUES (${school.name}, ${school.location}, 'school', ${username}, ${password}, true)
          ON CONFLICT (username) DO NOTHING
        `;
        console.log(`✓ Added school: ${school.name}`);
      } catch (error) {
        console.error(`✗ Error adding ${school.name}:`, error.message);
      }
    }
    
    // Count branches
    const counts = await sql`
      SELECT branch_type, COUNT(*) as count
      FROM branches
      WHERE is_active = true
      GROUP BY branch_type
    `;
    
    console.log('\n=== Summary ===');
    counts.forEach(row => {
      console.log(`${row.branch_type}: ${row.count} branches`);
    });
    
    console.log('\n✓ All branches added successfully!');
    
  } catch (error) {
    console.error('Error adding branches:', error);
  } finally {
    await sql.end();
  }
}

addBranches();

