import type { Response } from "express";

const DEFAULT_ORIGINS = [
  "https://clinic.jaclit.com",
  "https://supplier.jaclit.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3003",
] as const;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] as const;

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-API-Key",
  "X-Tenant-Id",
  "X-Refresh-Token",
  "X-Jaclit-Desktop-Shell",
  "x-session-id",
  "Cache-Control",
  "Pragma",
] as const;

/** Env ro‘yxati bo‘sh yoki noto‘g‘ri bo‘lsa — default frontend originlar. */
export function getAllowedCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw == null || raw.trim() === "") {
    return [...DEFAULT_ORIGINS];
  }
  const parsed = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_ORIGINS];
}

type CorsOriginCb = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean | string) => void
) => void;

function productionOrigin(allowed: string[]): CorsOriginCb {
  return (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowed.includes(origin)) {
      return callback(null, origin);
    }
    return callback(null, false);
  };
}

export function buildAppCorsOptions(isProduction: boolean, allowedOrigins: string[]) {
  return {
    origin: isProduction ? productionOrigin(allowedOrigins) : true,
    credentials: true,
    methods: [...METHODS],
    allowedHeaders: [...ALLOWED_HEADERS],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
}

/** `/uploads` static — `enableCors` dan tashqari, xuddi avvalgi sarlavhalar. */
export function setStaticUploadsCorsHeaders(
  res: Response,
  isProduction: boolean,
  allowedOrigins: string[]
): void {
  const raw = res.req?.headers?.origin;
  const requestOrigin = typeof raw === "string" ? raw : undefined;

  if (
    requestOrigin &&
    (allowedOrigins.includes(requestOrigin) || !isProduction)
  ) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      isProduction ? requestOrigin : "*"
    );
  } else if (!isProduction) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
}
