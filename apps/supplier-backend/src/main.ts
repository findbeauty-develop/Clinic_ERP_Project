import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as helmet from "helmet";
import { join, resolve } from "path";
import { existsSync } from "fs";

async function bootstrap() {
  // ✅ Environment detection va logging (AppModule yaratilishidan oldin)
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  
  // ✅ Env file paths tekshirish
  const envFilePaths = isProduction
    ? [
        resolve(process.cwd(), ".env.production"),
        resolve(process.cwd(), "apps/supplier-backend/.env.production"),
        resolve(process.cwd(), "../../apps/supplier-backend/.env.production"),
        resolve(process.cwd(), "/app/apps/supplier-backend/.env.production"),
      ]
    : [
        resolve(process.cwd(), ".env.local"),
        resolve(process.cwd(), ".env"),
        resolve(process.cwd(), "apps/supplier-backend/.env.local"),
        resolve(process.cwd(), "apps/supplier-backend/.env"),
        resolve(process.cwd(), "../../apps/supplier-backend/.env.local"),
        resolve(process.cwd(), "../../apps/supplier-backend/.env"),
        resolve(process.cwd(), "/app/apps/supplier-backend/.env.local"),
        resolve(process.cwd(), "/app/apps/supplier-backend/.env"),
      ];
  
  const foundEnvFile = envFilePaths.find(path => existsSync(path));
  const envFileName = foundEnvFile 
    ? foundEnvFile.replace(process.cwd(), '.').replace(/\\/g, '/')
    : 'NOT FOUND';
  
  
  

  
 
  

  // Set GOOGLE_APPLICATION_CREDENTIALS to absolute path if it's relative
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith("/")
  ) {
    const credentialsPath = resolve(
      process.cwd(),
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
    if (existsSync(credentialsPath)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
     
    } 
  }
  
  const app = await NestFactory.create(AppModule);

  // ✅ Helmet.js - Security Headers (CRITICAL)
  app.use(
    helmet.default({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Swagger UI
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for Swagger UI
          imgSrc: ["'self'", "data:", "https:", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
          fontSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          workerSrc: ["'self'"],
          childSrc: ["'self'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"], // Prevent clickjacking
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      xFrameOptions: { action: "deny" }, // Prevent clickjacking
      xContentTypeOptions: true, // Prevent MIME type sniffing (noSniff)
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false, // Disable for compatibility
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: false, // ✅ Disable CORP - image'lar uchun (uploads)
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      // Disable DNS prefetch
      dnsPrefetchControl: true,
    })
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ✅ CORS configuration from environment variable
  // Production'da CORS_ORIGINS majburiy, development'da localhost fallback
  // isProduction already declared above
  
  let allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : isProduction
    ? (() => {
        throw new Error(
          "CORS_ORIGINS environment variable must be set in production mode"
        );
      })()
    : ["https://clinic.jaclit.com", "https://supplier.jaclit.com", "http://localhost:3000", "http://localhost:3001", "http://localhost:3003"];

  // ✅ FIX: Development mode'da localhost'ni avtomatik qo'shish
  if (!isProduction && process.env.CORS_ORIGINS) {
    const localhostOrigins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3003"];
    localhostOrigins.forEach((origin) => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });
  }

  // ✅ FIX: Production mode'da ham localhost'ni qo'shish (local development uchun)
  // Agar localhost'dan so'rov kelsa, ruxsat berish
  const localhostOrigins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3003"];
  localhostOrigins.forEach((origin) => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });

  // Origin validation callback function (qo'shimcha xavfsizlik)
  const originValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Preflight request'lar uchun origin undefined bo'lishi mumkin
    if (!origin) {
      return callback(null, true);
    }
    
    // Localhost'ni har doim ruxsat berish (local development uchun)
    if (origin.startsWith("http://localhost:") || origin.startsWith("https://localhost:")) {
      return callback(null, true);
    }
    
    // Production'da faqat allowed origins'ga ruxsat berish
    if (isProduction && !allowedOrigins.includes(origin)) {
      return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    }
    
    // Development'da barcha origin'larga ruxsat (localhost fallback)
    callback(null, true);
  };

  app.enableCors({
    origin: isProduction ? originValidator : allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Tenant-Id", // ✅ Tenant ID header
      "x-session-id", // ✅ Session ID header
      "Cache-Control", // ✅ Cache control header
      "Pragma", // ✅ Pragma header (cache-busting uchun)
    ],
    preflightContinue: false, // Preflight request'ni to'xtatish
    optionsSuccessStatus: 204, // Preflight success status code
  });

  
  app.use(
    bodyParser.json({
      limit: "10mb",
    })
  );
  app.use(
    bodyParser.urlencoded({
      limit: "10mb",
      extended: true,
    })
  );

  // Static file serving for uploads
  const uploadsDir = join(process.cwd(), "uploads");
  app.use("/uploads", express.static(uploadsDir, {
    setHeaders: (res, path) => {
      // ✅ CORS header'larini qo'shish - image'lar uchun
      const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
        : [
            "https://clinic.jaclit.com",
            "https://supplier.jaclit.com",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:3003",
          ];
      
      // Request origin'ni tekshirish
      const requestOrigin = (res as any).req?.headers?.origin;
      if (requestOrigin && (allowedOrigins.includes(requestOrigin) || !isProduction)) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      } else if (!isProduction) {
        // Development'da barcha origin'larga ruxsat
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
      
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    },
  }));

  // ✅ Health check endpoint (for Docker healthcheck)
  app.getHttpAdapter().get("/health", (req, res) => {
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      service: "supplier-backend"
    });
  });

  // ✅ Swagger setup - faqat development'da (production'da xavfsizlik uchun o'chiriladi)
  if (!isProduction) {
    try {
      const cfg = new DocumentBuilder()
        .setTitle("Supplier ERP API")
        .setVersion("0.1.0")
        .addBearerAuth()
        .build();
      const doc = SwaggerModule.createDocument(app, cfg);
      SwaggerModule.setup("docs", app, doc);
      app.getHttpAdapter().get("/docs-json", (req, res) => {
        res.json(doc);
      });
      console.log("Swagger documentation available at /docs");
    } catch (error: any) {
      console.warn("Swagger setup failed:", error?.message || String(error));
      // Continue without Swagger if setup fails
    }
  } else {
    console.log("Swagger disabled in production mode");
  }

  const serverPort = Number(process.env.PORT) || 3002;
  await app.listen(serverPort);
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Supplier Backend server is running on port ${serverPort}`);
  console.log(`📌 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log('='.repeat(60) + '\n');
}
bootstrap();
