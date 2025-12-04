-- Add description column to Clinic table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='Clinic' AND column_name='description') THEN
        ALTER TABLE "Clinic" ADD COLUMN "description" TEXT;
        RAISE NOTICE 'Column description added to Clinic table';
    ELSE
        RAISE NOTICE 'Column description already exists in Clinic table';
    END IF;
END $$;

