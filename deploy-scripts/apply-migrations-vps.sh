#!/bin/bash

# Script to apply migrations on VPS
# Usage: ./apply-migrations-vps.sh

VPS_IP="13.209.40.48"
CONTAINER_NAME="supplier-erp-backend-prod"
MIGRATIONS_DIR="apps/supplier-backend/prisma/migrations"

echo "📦 Applying migrations on VPS..."

# Migration names
MIGRATIONS=(
  "20260126183759_add_unit_to_supplier_order_item"
  "20260126183800_add_business_number_and_link_to_clinic_supplier_manager"
  "20260126183801_create_supplier_order_tables"
)

# Step 1: Copy migration files to VPS
echo ""
echo "Step 1: Copying migration files to VPS..."
for migration in "${MIGRATIONS[@]}"; do
  echo "  Copying $migration..."
  
  # Create temp directory on VPS
  ssh ubuntu@$VPS_IP "mkdir -p /tmp/migrations/$migration"
  
  # Copy migration.sql file
  scp "$MIGRATIONS_DIR/$migration/migration.sql" ubuntu@$VPS_IP:/tmp/migrations/$migration/migration.sql
  
  # Copy to container
  ssh ubuntu@$VPS_IP "docker exec $CONTAINER_NAME mkdir -p /app/apps/supplier-backend/prisma/migrations/$migration"
  ssh ubuntu@$VPS_IP "docker cp /tmp/migrations/$migration/migration.sql $CONTAINER_NAME:/app/apps/supplier-backend/prisma/migrations/$migration/migration.sql"
  
  echo "  ✅ $migration copied"
done

# Cleanup temp files
ssh ubuntu@$VPS_IP "rm -rf /tmp/migrations"

echo ""
echo "Step 2: Resolving migrations as 'applied'..."
echo ""

# Step 2: Resolve migrations as 'applied' (since they're already in database)
for migration in "${MIGRATIONS[@]}"; do
  echo "  Resolving $migration..."
  ssh ubuntu@$VPS_IP "docker exec $CONTAINER_NAME sh -c 'cd /app/apps/supplier-backend && timeout 30 npx prisma migrate resolve --applied $migration'"
  
  if [ $? -eq 0 ]; then
    echo "  ✅ $migration resolved"
  else
    echo "  ⚠️  $migration resolve failed (may already be applied)"
  fi
done

echo ""
echo "✅ Migration process completed!"
echo ""
echo "Verify migrations:"
echo "  ssh ubuntu@$VPS_IP \"docker exec $CONTAINER_NAME sh -c 'cd /app/apps/supplier-backend && npx prisma migrate status'\""

