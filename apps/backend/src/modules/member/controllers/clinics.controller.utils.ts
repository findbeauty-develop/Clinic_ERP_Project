import { BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { join } from "path";
import { promises as fs } from "fs";
import type { Request } from "express";
import { getUploadRoot } from "../../../common/utils/upload.utils";

/** Ko‘p endpointlarda default tenant (verify-certificate, upload-certificate, …). */
export const SELF_SERVICE_TENANT = "self-service-tenant";

export const CLINIC_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export function resolveOptionalTenantId(
  tenantFromDecorator?: string,
  tenantFromQuery?: string,
  fallback: string = SELF_SERVICE_TENANT
): string {
  return tenantFromDecorator ?? tenantFromQuery ?? fallback;
}

/**
 * Masalan: `certificate/<tenant>/<ts>-<rand>.jpg` yoki `logo/...`
 * (oldingi controller bilan bir xil format).
 */
export function buildClinicStoragePath(
  categorySegment: string,
  tenantId: string,
  originalName: string
): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const random = Math.random().toString(36).substring(2, 10);
  return `${categorySegment}/${tenantId}/${Date.now()}-${random}.${ext}`;
}

export type ClinicUploadResponse = {
  filename: string | undefined;
  url: string;
  category: string;
  size: number;
  mimetype: string;
};

export function buildClinicUploadResponse(
  storagePath: string,
  publicUrl: string,
  category: string,
  file: Express.Multer.File
): ClinicUploadResponse {
  return {
    filename: storagePath.split("/").pop(),
    url: publicUrl,
    category,
    size: file.size,
    mimetype: file.mimetype,
  };
}

export function throwClinicUploadFailed(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unknown error";
  throw new BadRequestException(`Upload failed: ${message}`);
}

export type ClinicImageInterceptorOptions = {
  maxFileSizeBytes: number;
  /** true: `file` ixtiyoriy, lekin `fileUrl` query bo‘lmasa xato (verify-certificate). */
  optionalFileIfFileUrlQuery?: boolean;
};

/**
 * Nest dekorator uchun — class `this` ishlatilmaydi.
 */
export function clinicImageFileInterceptor(options: ClinicImageInterceptorOptions) {
  const allowed = CLINIC_IMAGE_MIME_TYPES as readonly string[];
  const { maxFileSizeBytes, optionalFileIfFileUrlQuery } = options;

  return FileInterceptor("file", {
    storage: undefined,
    limits: { fileSize: maxFileSizeBytes },
    fileFilter: (
      req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, acceptFile: boolean) => void
    ) => {
      if (optionalFileIfFileUrlQuery) {
        const fileUrl = req.query?.fileUrl;
        if (!file && !fileUrl) {
          return callback(
            new BadRequestException(
              "Either file or fileUrl query parameter is required"
            ),
            false
          );
        }
        if (file && !allowed.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              `Invalid file type. Allowed types: ${allowed.join(", ")}`
            ),
            false
          );
        }
        return callback(null, true);
      }

      if (!allowed.includes(file.mimetype)) {
        return callback(
          new BadRequestException(
            `Invalid file type. Allowed types: ${allowed.join(", ")}`
          ),
          false
        );
      }
      callback(null, true);
    },
  });
}

/**
 * verify-certificate: memory buffer, disk path yoki `fileUrl` (uploads ostidagi nisbiy yo‘l).
 */
export async function resolveCertificateFileInput(
  file: Express.Multer.File | undefined,
  fileUrl: string | undefined
): Promise<{ buffer: Buffer; mimetype: string | undefined }> {
  if (file) {
    if (file.buffer) {
      return { buffer: file.buffer, mimetype: file.mimetype };
    }
    if (file.path) {
      const diskFs = await import("fs/promises");
      const buffer = await diskFs.readFile(file.path);
      return { buffer, mimetype: file.mimetype };
    }
    throw new BadRequestException("Unable to read file content");
  }
  if (fileUrl) {
    try {
      const filePath = join(
        getUploadRoot(),
        fileUrl.replace(/^\/uploads\/?/, "")
      );
      const buffer = await fs.readFile(filePath);
      const ext = fileUrl.split(".").pop()?.toLowerCase();
      let mimetype: string | undefined;
      if (ext === "png") mimetype = "image/png";
      else if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";
      else if (ext === "webp") mimetype = "image/webp";
      else mimetype = "image/jpeg";
      return { buffer, mimetype };
    } catch {
      throw new BadRequestException(
        `Failed to read file from URL: ${fileUrl}`
      );
    }
  }
  throw new BadRequestException(
    "Either file or fileUrl query parameter is required"
  );
}
