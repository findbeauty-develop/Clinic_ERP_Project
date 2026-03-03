#!/usr/bin/env node

/**
 * Supabase Storage Bucket Setup Script
 * 
 * This script creates the 'clinic-uploads' bucket in Supabase Storage
 * Run: node create-supabase-bucket.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Determine which .env file to use based on command line argument
const envFile = process.argv[2] === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`📝 Using environment: ${envFile}`);
console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL}\n`);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
});

async function createBucket() {
  console.log('🚀 Creating Supabase Storage bucket...\n');

  try {
    // Check if bucket already exists
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      process.exit(1);
    }

    const bucketExists = existingBuckets.some(b => b.name === 'clinic-uploads');
    
    if (bucketExists) {
      console.log('✅ Bucket "clinic-uploads" already exists');
      
      // Update bucket to be public
      const { error: updateError } = await supabase.storage.updateBucket('clinic-uploads', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });

      if (updateError) {
        console.error('⚠️  Warning: Could not update bucket settings:', updateError.message);
      } else {
        console.log('✅ Bucket settings updated (public: true, size limit: 10MB)');
      }
    } else {
      // Create new bucket
      const { data, error } = await supabase.storage.createBucket('clinic-uploads', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
        ],
      });

      if (error) {
        console.error('❌ Error creating bucket:', error);
        process.exit(1);
      }

      console.log('✅ Bucket "clinic-uploads" created successfully!');
    }

    console.log('\n📦 Bucket Configuration:');
    console.log('   - Name: clinic-uploads');
    console.log('   - Public: Yes');
    console.log('   - Max file size: 10MB');
    console.log('   - Allowed types: image/jpeg, image/jpg, image/png, image/webp, image/gif');
    
    console.log('\n✅ Setup complete! Your backend is now ready to use Supabase Storage.');
    console.log('\n📝 Next steps:');
    console.log('   1. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in production');
    console.log('   2. Deploy your backend');
    console.log('   3. Test file uploads\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

createBucket();
