import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private bucketName = 'clinic-uploads';

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('⚠️ Supabase Storage not configured - falling back to local storage');
      this.supabase = null as any;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
        },
      });
      this.logger.log('✅ Supabase Storage initialized');
    }
  }

  /**
   * Check if Supabase Storage is available
   */
  isAvailable(): boolean {
    return !!this.supabase;
  }

  /**
   * Upload file to Supabase Storage
   * @param file - Multer file object
   * @param storagePath - Storage path (e.g., 'product/tenant_id/filename.jpg')
   * @param options - Upload options
   * @returns Public URL of uploaded file
   */
  async uploadFile(
    file: Express.Multer.File,
    storagePath: string,
    options?: {
      optimize?: boolean;
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    }
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Supabase Storage is not configured');
    }

    const {
      optimize = true,
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 85,
    } = options || {};

    try {
      let fileBuffer = file.buffer;
      let contentType = file.mimetype;

      // Image optimization (only for images)
      if (optimize && file.mimetype.startsWith('image/')) {
        this.logger.debug(`Optimizing image: ${storagePath}`);

        // JPEG has no alpha; without this, transparent PNG areas become black after .jpeg().
        fileBuffer = await sharp(file.buffer)
          .resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality })
          .toBuffer();

        contentType = 'image/jpeg'; // Convert to JPEG after optimization
      }

      // Upload to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(storagePath, fileBuffer, {
          contentType,
          upsert: true, // Overwrite if exists
          cacheControl: '3600', // Cache for 1 hour
        });

      if (error) {
        this.logger.error(`Supabase upload error: ${error.message}`, error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);

      this.logger.log(`✅ File uploaded: ${storagePath}`);
      return urlData.publicUrl;
    } catch (error: any) {
      this.logger.error(`File upload error: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Upload file from buffer (for OCR results, etc.)
   */
  async uploadBuffer(
    buffer: Buffer,
    storagePath: string,
    contentType: string
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Supabase Storage is not configured');
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
          cacheControl: '3600',
        });

      if (error) {
        this.logger.error(`Supabase upload error: ${error.message}`, error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);

      this.logger.log(`✅ Buffer uploaded: ${storagePath}`);
      return urlData.publicUrl;
    } catch (error: any) {
      this.logger.error(`Buffer upload error: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Delete file from Supabase Storage
   */
  async deleteFile(storagePath: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Supabase Storage not available - skipping delete');
      return;
    }

    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([storagePath]);

      if (error) {
        this.logger.error(`Delete error: ${error.message}`, error);
        throw new Error(`Delete failed: ${error.message}`);
      }

      this.logger.log(`🗑️ File deleted: ${storagePath}`);
    } catch (error: any) {
      this.logger.error(`File delete error: ${error.message}`, error);
      // Don't throw - deletion errors shouldn't break the flow
    }
  }

  /**
   * Delete multiple files from Supabase Storage
   */
  async deleteFiles(storagePaths: string[]): Promise<void> {
    if (!this.isAvailable() || storagePaths.length === 0) {
      return;
    }

    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove(storagePaths);

      if (error) {
        this.logger.error(`Batch delete error: ${error.message}`, error);
      } else {
        this.logger.log(`🗑️ ${storagePaths.length} files deleted`);
      }
    } catch (error: any) {
      this.logger.error(`Batch delete error: ${error.message}`, error);
    }
  }

  /**
   * Generate unique filename with tenant isolation
   */
  generateFilename(
    originalName: string,
    tenantId: string,
    category: 'product' | 'logo' | 'clinic' | 'certificate'
  ): string {
    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${category}/${tenantId}/${timestamp}-${random}.${ext}`;
  }

  /**
   * Extract storage path from Supabase URL
   * Example: https://xxx.supabase.co/storage/v1/object/public/clinic-uploads/product/tenant/file.jpg
   * Returns: product/tenant/file.jpg
   */
  extractStoragePath(url: string): string | null {
    if (!url) return null;
    
    const match = url.match(/\/clinic-uploads\/(.+)$/);
    return match ? match[1] : null;
  }
}
