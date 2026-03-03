#!/usr/bin/env node

/**
 * Migration Script: Local Files to Supabase Storage
 * 
 * This script migrates existing files from local uploads/ directory to Supabase Storage
 * Run: node migrate-local-to-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: '.env.production' });

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

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const BUCKET_NAME = 'clinic-uploads';

async function getAllFiles(dir, fileList = []) {
  const files = await fs.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
}

async function migrateFiles() {
  console.log('🚀 Starting migration from local uploads to Supabase Storage...\n');

  try {
    // Check if uploads directory exists
    try {
      await fs.access(UPLOADS_DIR);
    } catch (error) {
      console.log('⚠️  No uploads directory found. Nothing to migrate.');
      return;
    }

    // Get all files recursively
    const files = await getAllFiles(UPLOADS_DIR);
    console.log(`📁 Found ${files.length} files to migrate\n`);

    if (files.length === 0) {
      console.log('✅ No files to migrate.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
      // Get relative path from uploads directory
      const relativePath = path.relative(UPLOADS_DIR, filePath);
      
      // Skip hidden files and system files
      if (relativePath.startsWith('.')) {
        console.log(`⏭️  Skipping: ${relativePath}`);
        continue;
      }

      try {
        // Read file
        const fileBuffer = await fs.readFile(filePath);
        
        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.gif') contentType = 'image/gif';

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(relativePath, fileBuffer, {
            contentType,
            upsert: true, // Overwrite if exists
            cacheControl: '3600',
          });

        if (error) {
          console.error(`❌ Error uploading ${relativePath}:`, error.message);
          errorCount++;
        } else {
          console.log(`✅ Migrated: ${relativePath}`);
          successCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing ${relativePath}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount} files`);
    console.log(`   ❌ Errors: ${errorCount} files`);
    console.log(`   📁 Total: ${files.length} files`);

    if (successCount > 0) {
      console.log('\n⚠️  IMPORTANT: Files have been migrated to Supabase Storage.');
      console.log('   You can now safely delete the local uploads/ directory after verifying the migration.');
      console.log('\n   To verify, check your Supabase Storage dashboard:');
      console.log(`   ${supabaseUrl}/project/_/storage/buckets/clinic-uploads\n`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

migrateFiles();
