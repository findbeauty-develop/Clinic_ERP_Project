-- Step 1: Drop trigger so we can alter used_count column type in the next migration
DROP TRIGGER IF EXISTS batch_available_quantity_trigger ON "Batch" CASCADE;
