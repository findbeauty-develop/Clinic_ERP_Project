#!/bin/bash

# Apply withdrawal_reason migration manually
echo "Applying withdrawal_reason migration..."

# Get database URL from .env
if [ -f .env ]; then
  export $(cat .env | grep DATABASE_URL | xargs)
  if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not found in .env"
    exit 1
  fi
else
  echo "Error: .env file not found"
  exit 1
fi

# Run migration SQL
psql "$DATABASE_URL" <<EOF
-- Add withdrawal_reason column if not exists
ALTER TABLE "SupplierManager" ADD COLUMN IF NOT EXISTS "withdrawal_reason" TEXT;
EOF

echo "Migration applied successfully!"

