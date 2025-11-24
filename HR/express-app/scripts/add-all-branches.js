/**
 * Script to add all 25 branches
 * 19 healthcare centers and 6 schools
 */

import sql from '../config/database.js';
import { Branch } from '../models/Branch.js';

const branches = [
  // Healthcare Centers (19)
  {
    branch_name: 'مراكز ايادي نجد (القريات :بنات )',
    branch_location: 'القريات',
    branch_type: 'healthcare_center',
    username: 'branch0',
    password: 'test0',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مراكز ايادي نجد (القريات :بنات مسائي  )',
    branch_location: 'القريات',
    branch_type: 'healthcare_center',
    username: 'branch1',
    password: 'test1',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (القريات : بنين )',
    branch_location: 'القريات',
    branch_type: 'healthcare_center',
    username: 'branch2',
    password: 'test2',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (طبرجل :بنات )',
    branch_location: 'طبرجل',
    branch_type: 'healthcare_center',
    username: 'branch3',
    password: 'test3',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (طبرجل :بنين )',
    branch_location: 'طبرجل',
    branch_type: 'healthcare_center',
    username: 'branch4',
    password: 'test4',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز براعم التحدي (سكاكا:بنات)',
    branch_location: 'سكاكا',
    branch_type: 'healthcare_center',
    username: 'branch5',
    password: 'test5',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (عرعر:بنات )',
    branch_location: 'عرعر',
    branch_type: 'healthcare_center',
    username: 'branch6',
    password: 'test6',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (عرعر:بنين)',
    branch_location: 'عرعر',
    branch_type: 'healthcare_center',
    username: 'branch7',
    password: 'test7',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (رفحاء :بنات )',
    branch_location: 'رفحاء',
    branch_type: 'healthcare_center',
    username: 'branch8',
    password: 'test8',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (رفحاء :بنين )',
    branch_location: 'رفحاء',
    branch_type: 'healthcare_center',
    username: 'branch9',
    password: 'test9',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (طريف :بنات )',
    branch_location: 'طريف',
    branch_type: 'healthcare_center',
    username: 'branch10',
    password: 'test10',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (طريف : بنين )',
    branch_location: 'طريف',
    branch_type: 'healthcare_center',
    username: 'branch11',
    password: 'test11',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (الخفجي :بنات )',
    branch_location: 'الخفجي',
    branch_type: 'healthcare_center',
    username: 'branch12',
    password: 'test12',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (الخفجي :بنين )',
    branch_location: 'الخفجي',
    branch_type: 'healthcare_center',
    username: 'branch13',
    password: 'test13',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (تثليث :بنات )',
    branch_location: 'تثليث',
    branch_type: 'healthcare_center',
    username: 'branch14',
    password: 'test14',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (تثليث :بنين )',
    branch_location: 'تثليث',
    branch_type: 'healthcare_center',
    username: 'branch15',
    password: 'test15',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز ايادي نجد (القحمة : بنات )',
    branch_location: 'القحمة',
    branch_type: 'healthcare_center',
    username: 'branch16',
    password: 'test16',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز اشراقة (محايل عسير : بنات )',
    branch_location: 'محايل عسير',
    branch_type: 'healthcare_center',
    username: 'branch17',
    password: 'test17',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مركز أفياء (جازان : بنات )',
    branch_location: 'جازان',
    branch_type: 'healthcare_center',
    username: 'branch18',
    password: 'test18',
    branch_documents_password: 'test'
  },
  
  // Schools (6)
  {
    branch_name: 'انجال المستقبل (البكيرية :بنات )',
    branch_location: 'البكيرية',
    branch_type: 'school',
    username: 'branch19',
    password: 'test19',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'انجال المستقبل  (البكيرية : أبتدائي / متوسط : بنين )',
    branch_location: 'البكيرية',
    branch_type: 'school',
    username: 'branch20',
    password: 'test20',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'انجال المستقبل (البكيرية : ثانوي : بنين )',
    branch_location: 'البكيرية',
    branch_type: 'school',
    username: 'branch21',
    password: 'test21',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'مجمع انجال المستقبل (رفحاء : بنات )',
    branch_location: 'رفحاء',
    branch_type: 'school',
    username: 'branch22',
    password: 'test22',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'انجال التربية (الداودمي: أبتدائي و متوسط  :بنات )',
    branch_location: 'الدوادمي',
    branch_type: 'school',
    username: 'branch23',
    password: 'test23',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'انجال التربية (الدوادمي : ثانوي : بنات )',
    branch_location: 'الدوادمي',
    branch_type: 'school',
    username: 'branch24',
    password: 'test24',
    branch_documents_password: 'test'
  },
  {
    branch_name: 'اجيال البجادية (متوسط / ثانوي :بنين )',
    branch_location: 'البجادية',
    branch_type: 'school',
    username: 'branch25',
    password: 'test25',
    branch_documents_password: 'test'
  }
];

async function addAllBranches() {
  console.log('🚀 Starting to add all branches...\n');
  console.log(`Total branches to add: ${branches.length}`);
  console.log(`  - Healthcare centers: ${branches.filter(b => b.branch_type === 'healthcare_center').length}`);
  console.log(`  - Schools: ${branches.filter(b => b.branch_type === 'school').length}\n`);

  try {
    const createdBranches = [];
    const errors = [];

    for (let i = 0; i < branches.length; i++) {
      const branchData = branches[i];
      try {
        console.log(`[${i + 1}/${branches.length}] Creating: ${branchData.branch_name}`);
        const branch = await Branch.create(branchData);
        createdBranches.push(branch);
        console.log(`  ✅ Created successfully (ID: ${branch.id}, Username: ${branch.username})\n`);
      } catch (error) {
        console.error(`  ❌ Failed to create: ${error.message}\n`);
        errors.push({ branch: branchData.branch_name, error: error.message });
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Successfully created: ${createdBranches.length} branches`);
    console.log(`  ❌ Failed: ${errors.length} branches`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((err, index) => {
        console.log(`  ${index + 1}. ${err.branch}: ${err.error}`);
      });
    }

    // Verify counts
    const [healthcareCount] = await sql`
      SELECT COUNT(*) as count FROM branches WHERE branch_type = 'healthcare_center'
    `;
    const [schoolCount] = await sql`
      SELECT COUNT(*) as count FROM branches WHERE branch_type = 'school'
    `;
    const [totalCount] = await sql`
      SELECT COUNT(*) as count FROM branches
    `;

    console.log('\n📈 Database Status:');
    console.log(`  Total branches: ${totalCount.count}`);
    console.log(`  Healthcare centers: ${healthcareCount.count}`);
    console.log(`  Schools: ${schoolCount.count}`);

    return { success: errors.length === 0, created: createdBranches, errors };

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run if script is executed directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('add-all-branches.js');

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  addAllBranches()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ All branches added successfully!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Some branches failed to add. Check errors above.');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export default addAllBranches;

