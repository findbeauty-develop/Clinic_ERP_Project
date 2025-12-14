-- Add return_no column to Return table
-- This script adds the return_no column to the Return table

DO $$
BEGIN
  -- Add return_no column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Return' AND column_name = 'return_no'
  ) THEN
    ALTER TABLE "Return" ADD COLUMN "return_no" TEXT;
  END IF;
END $$;

