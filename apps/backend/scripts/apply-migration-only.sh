#!/bin/bash

# Apply ONLY the ClinicSupplierLink migration
# This script applies the migration SQL directly without using prisma db push

echo "⚠️  This will apply the ClinicSupplierLink migration only"
echo "Make sure you have database access"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPO =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 1
fi

cd "$(dirname "$0")/.."

MIGRATION_FILE="prisma/migrations/20251127135259_change_clinic_supplier_link_to_manager/migration.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Migration file found: $MIGRATION_FILE"
echo ""
echo "To apply this migration, you have two options:"
echo ""
echo "Option 1: Using Supabase Dashboard"
echo "1. Go to https://supabase.com/dashboard"
echo "2. Select your project"
echo "3. Go to SQL Editor"
echo "4. Copy and paste the contents of: $MIGRATION_FILE"
echo "5. Click 'Run'"
echo ""
echo "Option 2: Using psql command line"
echo "Run: psql \"\$DATABASE_URL\" -f $MIGRATION_FILE"
echo ""
echo "Migration SQL preview (first 20 lines):"
head -20 "$MIGRATION_FILE"

