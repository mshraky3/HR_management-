import dotenv from 'dotenv'; dotenv.config();
import sql from '../config/database.js';
const fks = await sql`
  SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS ref_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND kcu.table_name = tc.table_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
  ORDER BY tc.table_name, kcu.column_name
`;
fks.forEach(r => console.log(
    r.table_name.padEnd(30),
    r.column_name.padEnd(25),
    '->',
    r.ref_table.padEnd(20),
    '|', r.constraint_name
));
await sql.end();
