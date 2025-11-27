#!/bin/bash

# Script to manually apply the ClinicSupplierLink migration
# Run this when database connection is restored

echo "Applying ClinicSupplierLink migration..."
echo "Make sure DATABASE_URL is set in .env file"

cd "$(dirname "$0")/.."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set. Loading from .env..."
    export $(cat .env | grep DATABASE_URL | xargs)
fi

# Apply migration using psql
if command -v psql &> /dev/null; then
    echo "Applying migration SQL..."
    psql "$DATABASE_URL" -f prisma/migrations/20251127135259_change_clinic_supplier_link_to_manager/migration.sql
    echo "Migration applied successfully!"
else
    echo "psql not found. Please run the migration SQL manually:"
    echo "cat prisma/migrations/20251127135259_change_clinic_supplier_link_to_manager/migration.sql"
fi

