#!/bin/bash

# Script to copy migration files to VPS container
# Usage: ./copy-migrations-to-vps.sh

VPS_IP="13.209.40.48"
CONTAINER_NAME="supplier-erp-backend-prod"
MIGRATIONS_DIR="apps/supplier-backend/prisma/migrations"

echo "📦 Copying migration files to VPS container..."

# Migration directories to copy
MIGRATIONS=(
  "20260126183759_add_unit_to_supplier_order_item"
  "20260126183800_add_business_number_and_link_to_clinic_supplier_manager"
  "20260126183801_create_supplier_order_tables"
)

# Copy each migration directory
for migration in "${MIGRATIONS[@]}"; do
  echo "Copying $migration..."
  
  # Create migration directory in container
  ssh ubuntu@$VPS_IP "docker exec $CONTAINER_NAME mkdir -p /app/apps/supplier-backend/prisma/migrations/$migration"
  
  # Copy migration.sql file
  scp "$MIGRATIONS_DIR/$migration/migration.sql" ubuntu@$VPS_IP:/tmp/migration.sql
  ssh ubuntu@$VPS_IP "docker cp /tmp/migration.sql $CONTAINER_NAME:/app/apps/supplier-backend/prisma/migrations/$migration/migration.sql"
  ssh ubuntu@$VPS_IP "rm /tmp/migration.sql"
  
  echo "✅ $migration copied"
done

echo ""
echo "✅ All migrations copied!"
echo ""
echo "Next steps on VPS:"
echo "1. docker exec $CONTAINER_NAME sh -c 'cd /app/apps/supplier-backend && npx prisma migrate resolve --applied 20260126183759_add_unit_to_supplier_order_item'"
echo "2. docker exec $CONTAINER_NAME sh -c 'cd /app/apps/supplier-backend && npx prisma migrate resolve --applied 20260126183800_add_business_number_and_link_to_clinic_supplier_manager'"
echo "3. docker exec $CONTAINER_NAME sh -c 'cd /app/apps/supplier-backend && npx prisma migrate resolve --applied 20260126183801_create_supplier_order_tables'"

