# Database Scripts

## Add Branches Script

This script adds 25 branches to the database:

- 19 Healthcare Centers
- 6 Schools

### Usage

Make sure you have your `.env` file configured with database credentials, then run:

```bash
npm run add-branches
```

Or directly:

```bash
node scripts/add-branches.js
```

### Branch Credentials

The script creates branches with the following username/password pattern:

**Healthcare Centers:**

- Username: `healthcare1`, `healthcare2`, ..., `healthcare19`
- Password: `hc012024`, `hc022024`, ..., `hc192024`

**Schools:**

- Username: `school1`, `school2`, ..., `school6`
- Password: `sch012024`, `sch022024`, ..., `sch062024`

### Notes

- The script uses `ON CONFLICT DO NOTHING` to prevent duplicate entries
- All branches are created as active (`is_active = true`)
- The script will show a summary of added branches at the end
