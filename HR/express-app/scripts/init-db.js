/**
 * Standalone script to initialize the database
 * Run with: node express-app/scripts/init-db.js
 */

import { initializeDatabase } from '../database/init.js';

initializeDatabase()
  .then(() => {
    console.log('\n✅ Database initialization completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Database initialization failed:', error);
    process.exit(1);
  });

