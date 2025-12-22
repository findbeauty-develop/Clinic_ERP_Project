# Migration Strategy Guide

## Overview

This document outlines the recommended strategy for managing Prisma migrations in production, especially when using Supabase connection pooler.

---

## Common Issues & Solutions

### Issue 1: `npx prisma migrate` commands hang on Supabase pooler

**Problem**: Prisma CLI commands like `migrate dev`, `migrate deploy`, and `migrate resolve` may hang indefinitely when connected via Supabase connection pooler.

**Solution**: Use manual baseline approach with direct SQL queries.

### Issue 2: Migration files missing or out of sync

**Problem**: Local migration files don't match database migration history.

**Solution**:

1. Check database migration history
2. Create placeholder migration folders for missing migrations
3. Baseline migrations that are already applied

---

## Production-Safe Migration Workflow

### Step 1: Create Migration Files (Development)

```bash
# Option A: Create migration without applying (recommended for production)
npx prisma migrate dev --create-only --name your_migration_name

# Option B: Create and apply (for local development only)
npx prisma migrate dev --name your_migration_name
```

### Step 2: Review Migration SQL

Always review the generated SQL in `prisma/migrations/TIMESTAMP_migration_name/migration.sql`:

- ✅ Check for data loss risks (DROP TABLE, DROP COLUMN)
- ✅ Verify foreign key constraints
- ✅ Ensure NOT NULL constraints won't fail on existing data
- ✅ Test on development database first

### Step 3: Deploy to Production (Supabase)

#### Option A: Using Prisma CLI (if it works)

```bash
npx prisma migrate deploy
```

#### Option B: Manual Baseline (when CLI hangs)

If Prisma CLI hangs, use manual baseline approach:

1. **Check current migration status:**

```bash
node check-migrations.js
```

2. **Apply migration SQL manually in Supabase SQL Editor:**

Copy the SQL from `migration.sql` file and run it in Supabase Dashboard > SQL Editor.

3. **Baseline the migration:**

```bash
node baseline-migration.js MIGRATION_NAME
```

Or create a script:

```javascript
const { PrismaClient } = require("@prisma/client");

async function baselineMigration(migrationName) {
  const prisma = new PrismaClient();

  try {
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (
        id, checksum, finished_at, migration_name, logs,
        rolled_back_at, started_at, applied_steps_count
      ) 
      VALUES (
        gen_random_uuid()::text, '', NOW(), ${migrationName},
        'manually baselined', NULL, NOW(), 1
      )
    `;
    console.log("✅ Migration baselined:", migrationName);
  } finally {
    await prisma.$disconnect();
  }
}

baselineMigration(process.argv[2]);
```

### Step 4: Generate Prisma Client

After successful migration:

```bash
npx prisma generate
```

---

## Multi-Step Migration Pattern

For complex schema changes (like our clean architecture migration), use multi-step approach:

### Step 1: Add new columns/tables (non-breaking)

- Add new columns as nullable
- Add new tables
- Add new foreign keys (optional)

### Step 2: Migrate data

- Copy data from old columns to new columns
- Create records in new tables
- Update foreign key references

### Step 3: Cleanup (breaking changes)

- Set NOT NULL constraints
- Drop old columns
- Drop old tables
- Drop deprecated foreign keys

**Benefits:**

- ✅ Each step can be rolled back independently
- ✅ Minimizes downtime
- ✅ Easier to debug if something goes wrong

---

## Rollback Strategy

### If migration fails during deployment:

1. **Check database state:**

```bash
node check-migrations.js
```

2. **If migration is in failed state:**

```sql
-- In Supabase SQL Editor
DELETE FROM _prisma_migrations
WHERE migration_name = 'FAILED_MIGRATION_NAME';
```

3. **If data was corrupted:**
   - Use rollback SQL script (e.g., `20251220_clean_architecture_rollback.sql`)
   - Restore from backup if available

### If you need to undo a migration:

```sql
-- Mark migration as rolled back
UPDATE _prisma_migrations
SET rolled_back_at = NOW()
WHERE migration_name = 'MIGRATION_TO_ROLLBACK';

-- Then run your rollback SQL script
```

---

## Helper Scripts

### check-migrations.js

```javascript
const { PrismaClient } = require("@prisma/client");

async function checkMigrations() {
  const prisma = new PrismaClient();

  try {
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, applied_steps_count, logs
      FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT 20
    `;

    console.log("Applied migrations:");
    migrations.forEach((m, i) => {
      console.log(`${i + 1}. ${m.migration_name}`);
      console.log(`   Applied: ${m.finished_at}`);
      console.log(`   Steps: ${m.applied_steps_count}`);
      if (m.logs) console.log(`   Logs: ${m.logs}`);
      console.log("");
    });
  } finally {
    await prisma.$disconnect();
  }
}

checkMigrations();
```

### baseline-migration.js

```javascript
const { PrismaClient } = require("@prisma/client");

async function baselineMigration(migrationName) {
  const prisma = new PrismaClient();

  try {
    // Check if already exists
    const existing = await prisma.$queryRaw`
      SELECT * FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;

    if (existing.length > 0) {
      console.log("✅ Migration already baselined");
      return;
    }

    // Insert as baselined
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (
        id, checksum, finished_at, migration_name, logs,
        rolled_back_at, started_at, applied_steps_count
      ) 
      VALUES (
        gen_random_uuid()::text, '', NOW(), ${migrationName},
        'manually baselined', NULL, NOW(), 1
      )
    `;

    console.log("✅ Migration baselined:", migrationName);
  } finally {
    await prisma.$disconnect();
  }
}

const migrationName = process.argv[2];
if (!migrationName) {
  console.error("❌ Please provide migration name");
  process.exit(1);
}

baselineMigration(migrationName);
```

Usage:

```bash
node baseline-migration.js 20251220120000_your_migration_name
```

---

## Best Practices

### ✅ DO:

- Always review migration SQL before applying
- Test migrations on development database first
- Use multi-step approach for complex changes
- Keep rollback scripts up to date
- Baseline migrations manually when Prisma CLI hangs
- Use `--create-only` flag for production migrations
- Document breaking changes in migration files

### ❌ DON'T:

- Don't use `migrate dev` on production
- Don't drop columns/tables without data backup
- Don't add NOT NULL constraints without default values or data migration
- Don't apply multiple breaking changes in one migration
- Don't delete migration files from `prisma/migrations/` folder
- Don't use connection pooler for migrations if possible (use direct connection)

---

## Checklist for Each Migration

Before applying a migration:

- [ ] Migration SQL reviewed
- [ ] Tested on development database
- [ ] Rollback script prepared (if needed)
- [ ] Data backup taken (if making breaking changes)
- [ ] Team notified about downtime (if expected)
- [ ] Migration applied manually via Supabase SQL Editor
- [ ] Migration baselined in `_prisma_migrations` table
- [ ] Prisma Client regenerated (`npx prisma generate`)
- [ ] Backend restarted to use new Prisma Client
- [ ] Verified database schema matches `schema.prisma`

---

## Troubleshooting

### Prisma CLI says "Migration X not found locally"

**Solution**: Create placeholder migration folder:

```bash
mkdir -p prisma/migrations/MISSING_MIGRATION_NAME
echo "-- Already applied in database" > prisma/migrations/MISSING_MIGRATION_NAME/migration.sql
```

### Database schema doesn't match schema.prisma

**Solution**:

```bash
# Check what's different
npx prisma db pull --print

# If you want to sync schema.prisma from database:
npx prisma db pull

# Or create a new migration to fix the difference:
npx prisma migrate dev --create-only --name fix_schema_mismatch
```

### Migration failed with constraint violation

**Solution**:

1. Delete failed migration from `_prisma_migrations`
2. Fix the issue in migration SQL (add data migration step)
3. Re-apply the migration

---

## Connection Strings

### For Prisma CLI (use direct connection):

```env
DATABASE_URL="postgresql://user:pass@db.xxx.supabase.co:5432/postgres"
```

### For Application (use pooler):

```env
DATABASE_URL="postgresql://user:pass@db.xxx.supabase.com:6543/postgres?pgbouncer=true"
```

**Note**: If Prisma CLI hangs, always fallback to manual baseline approach.

---

## Summary

The recommended workflow for this project (with Supabase pooler) is:

1. Create migration with `--create-only`
2. Review SQL
3. Apply SQL manually in Supabase SQL Editor
4. Baseline migration using Node.js script
5. Generate Prisma Client
6. Restart backend

This approach avoids CLI hanging issues and gives you full control over the migration process.
