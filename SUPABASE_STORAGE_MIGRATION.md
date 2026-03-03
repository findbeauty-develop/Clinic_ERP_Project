# Supabase Storage Integration

## Overview

This project now uses **Supabase Storage** for all file uploads (product images, clinic logos, certificates). This ensures that files persist across deployments and are not lost when Docker containers are recreated.

## Why Supabase Storage?

Before this migration, files were stored locally in the `uploads/` directory, which caused issues:
- ❌ Files disappeared after production deployments
- ❌ Docker `.dockerignore` excluded `uploads/` from images
- ❌ No persistence across container restarts

With Supabase Storage:
- ✅ Files persist permanently in the cloud
- ✅ No deployment issues
- ✅ Automatic CDN delivery
- ✅ Image optimization with `sharp`
- ✅ Multi-tenant isolation (files organized by tenant)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Frontend)                        │
│                  (Upload files via API endpoints)                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (NestJS)                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Controllers (clinics.controller, uploads.controller)     │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          StorageService (Global)                          │  │
│  │  • uploadFile() - Upload with optimization                │  │
│  │  • deleteFile() - Delete files                            │  │
│  │  • generateFilename() - Tenant-isolated paths             │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  sharp (Image Optimization)                               │  │
│  │  • Resize (max 1200x1200 for products)                    │  │
│  │  • Convert to JPEG                                        │  │
│  │  • Quality: 85%                                           │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Storage                              │
│  Bucket: clinic-uploads                                          │
│  • Public: Yes                                                   │
│  • Max file size: 10MB                                           │
│  • Structure:                                                    │
│    - product/{tenant_id}/{timestamp}-{random}.{ext}              │
│    - logo/{tenant_id}/{timestamp}-{random}.{ext}                 │
│    - certificate/{tenant_id}/{timestamp}-{random}.{ext}          │
│                                                                  │
│  Returns: Public URL (https://...)                              │
└──────────────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/backend/
├── src/
│   ├── core/
│   │   └── storage/
│   │       ├── storage.service.ts   # Main storage service
│   │       └── storage.module.ts    # Global module
│   ├── uploads/
│   │   └── uploads.controller.ts    # Generic upload endpoint
│   └── modules/
│       └── member/
│           └── controllers/
│               └── clinics.controller.ts  # Clinic-specific uploads
└── scripts/
    ├── create-supabase-bucket.js         # Bucket setup script
    └── migrate-local-to-supabase.js      # Migration script
```

## Setup Instructions

### 1. Environment Variables

Add to your `.env.production`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Create Supabase Bucket

Run the setup script to create the `clinic-uploads` bucket:

```bash
cd apps/backend
node scripts/create-supabase-bucket.js
```

This will:
- Create the `clinic-uploads` bucket (if it doesn't exist)
- Configure it as public
- Set max file size to 10MB
- Allow image types: jpeg, jpg, png, webp, gif

### 3. Migrate Existing Files (Optional)

If you have existing files in `uploads/`, migrate them:

```bash
cd apps/backend
node scripts/migrate-local-to-supabase.js
```

This will:
- Recursively find all files in `uploads/`
- Upload them to Supabase Storage with the same paths
- Show a summary of successful/failed uploads

### 4. Deploy

After migration, deploy your backend. The new code will automatically use Supabase Storage.

## API Endpoints

### Generic Upload

```http
POST /api/uploads/:category
Content-Type: multipart/form-data

Form Data:
- file: (binary)
- tenantId: (optional, query param)

Response:
{
  "filename": "1234567890-abc123.jpg",
  "url": "https://ufktzxsegywvtclpwrvd.supabase.co/storage/v1/object/public/clinic-uploads/product/tenant_id/1234567890-abc123.jpg",
  "category": "product",
  "size": 123456,
  "mimetype": "image/jpeg"
}
```

### Clinic Logo Upload

```http
POST /api/iam/members/clinics/upload-logo
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- file: (binary)

Response:
{
  "filename": "1234567890-abc123.jpg",
  "url": "https://...",
  "category": "clinic-logo",
  "size": 123456,
  "mimetype": "image/jpeg"
}
```

### Clinic Certificate Upload

```http
POST /api/iam/members/clinics/upload-certificate
Content-Type: multipart/form-data

Form Data:
- file: (binary)
- tenantId: (optional, query param)

Response:
{
  "filename": "1234567890-abc123.jpg",
  "url": "https://...",
  "category": "clinic",
  "size": 123456,
  "mimetype": "image/jpeg"
}
```

## Image Optimization

All images are automatically optimized using `sharp`:

- **Product images**: Resized to max 1200x1200px, 85% quality
- **Logos**: Resized to max 500x500px, 90% quality
- **Certificates**: Resized to max 1920x1920px, 90% quality
- **Format**: Converted to JPEG for smaller file sizes

## File Organization

Files are organized by tenant for isolation:

```
clinic-uploads/
├── product/
│   ├── clinic_abc_1234567890_xyz/
│   │   ├── 1234567890-abc123.jpg
│   │   └── 1234567891-def456.jpg
│   └── clinic_def_9876543210_uvw/
│       └── 9876543210-ghi789.jpg
├── logo/
│   └── clinic_abc_1234567890_xyz/
│       └── 1234567890-logo.jpg
└── certificate/
    └── clinic_abc_1234567890_xyz/
        └── 1234567890-cert.jpg
```

## Troubleshooting

### Images not showing after deployment

1. Check environment variables:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE_KEY
   ```

2. Verify bucket exists in Supabase Dashboard:
   - Go to Storage → Buckets
   - Look for `clinic-uploads`
   - Check if it's public

3. Check backend logs for upload errors:
   ```bash
   docker logs clinic-backend
   ```

### Migration failed for some files

- The migration script will show which files failed
- You can re-run the script (it uses `upsert: true` to overwrite)
- Or manually upload failed files via Supabase Dashboard

### Sharp build errors

If you encounter `sharp` build errors during `pnpm install`:

```bash
pnpm approve-builds  # Select 'sharp' and press Enter
pnpm rebuild sharp
```

## Rollback (If Needed)

If you need to rollback to local storage:

1. Revert changes to:
   - `uploads.controller.ts`
   - `clinics.controller.ts`
   - `app.module.ts` (remove StorageModule import)

2. Remove:
   - `src/core/storage/` directory

3. Restore old local upload logic (use diskStorage)

## Performance

- **Upload speed**: Similar to local storage (network overhead is minimal)
- **Image optimization**: Adds ~100-500ms per upload (acceptable for better quality)
- **CDN delivery**: Faster for users (Supabase uses CDN)
- **Storage costs**: Free tier: 100GB (sufficient for most use cases)

## Security

- ✅ Multi-tenant isolation (files organized by tenant_id)
- ✅ File size limits (10MB max)
- ✅ MIME type validation (only images allowed)
- ✅ Public read, authenticated write
- ✅ Service role key kept secret (server-side only)

## Future Improvements

- [ ] Add file deletion when products/clinics are deleted
- [ ] Implement image caching strategy
- [ ] Add support for video uploads
- [ ] Implement signed URLs for private files
- [ ] Add thumbnail generation for products

## Support

For issues or questions, contact the development team or check:
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)
