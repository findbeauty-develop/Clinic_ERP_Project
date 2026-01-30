import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";
import type { Request } from "express";
import {
  getSerialForImage,
  getUploadCategory,
  validMimeTypes,
} from "../common/utils/upload.utils";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

@Controller("uploads")
export class UploadsController {
  @Post(":category")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: async (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, destination: string) => void
        ) => {
          const category = getUploadCategory(req.params?.category);
          const targetDir = join(UPLOAD_ROOT, category);
          try {
            await fs.mkdir(targetDir, { recursive: true });
            callback(null, targetDir);
          } catch (error) {
            callback(error as Error, targetDir);
          }
        },
        filename: (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, filename: string) => void
        ) => {
          const filename = getSerialForImage(file.originalname);
          callback(null, filename);
        },
      }),
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
  upload(
    @Param("category") category: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const normalized = getUploadCategory(category);
    const filename = file.filename;
    const url = `/uploads/${normalized}/${filename}`;
    return {
      filename,
      url,
      category: normalized,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
