import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { StorageService } from "../core/storage/storage.service";
import type { Request } from "express";
import {
  validMimeTypes,
} from "../common/utils/upload.utils";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post(":category")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: undefined, // Use memory storage to get buffer
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        if (!validMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException("Unsupported file type"),
            false
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    })
  )
  async upload(
    @Param("category") category: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    // Get tenant ID from request (for multi-tenant isolation)
    const tenantId =
      (req as any).tenantId ||
      (req.query?.tenantId as string) ||
      "default-tenant";

    // Generate storage path
    const storagePath = this.storageService.generateFilename(
      file.originalname,
      tenantId,
      category as any
    );

    try {
      // Upload to Supabase Storage
      const publicUrl = await this.storageService.uploadFile(file, storagePath, {
        optimize: true,
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 85,
      });

      return {
        filename: storagePath.split('/').pop(),
        url: publicUrl, // Return Supabase public URL
        category,
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Upload failed: ${error.message || "Unknown error"}`
      );
    }
  }
}
