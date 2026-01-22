import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as compression from "compression";
import * as cookieParser from "cookie-parser";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ✅ Environment tekshirish log
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbUrl = process.env.DATABASE_URL;
  const dbHost = dbUrl ? new URL(dbUrl).hostname : 'not set';

 console.log(`🚀 Environment: ${nodeEnv}`);
  console.log(`📊 Database Host: ${dbHost}`);
  console.log(`📁 Env File: ${nodeEnv === 'production' ? '.env.production' : '.env.local/.env'}`);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false, // ✅ PERMANENT: Allow nested objects (suppliers array works correctly)
      transform: true, // Convert plain objects to DTO instances
      forbidNonWhitelisted: false, // Don't throw errors for extra fields
      // Note: Security is maintained through individual @IsOptional, @IsString, etc. decorators
    })
  );
  // app.enableCors({ origin: true });

  // ✅ CORS configuration from environment variable
  // Production'da CORS_ORIGINS majburiy, development'da localhost fallback
const isProduction = process.env.NODE_ENV === "production";
  
  // Development'da localhost'da ishlayotgan bo'lsa, production'ga o'xshamaslik
  const isLocalhost = process.env.PORT === "3000" || 
                      process.env.PORT === undefined ||
                      !process.env.CORS_ORIGINS;
  
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : (isProduction && !isLocalhost)
    ? (() => {
        throw new Error(
          "CORS_ORIGINS environment variable must be set in production mode"
        );
      })()
    : ["https://clinic.jaclit.com", "https://supplier.jaclit.com"];

  // Origin validation callback function (qo'shimcha xavfsizlik)
  const originValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Preflight request'lar uchun origin undefined bo'lishi mumkin
    if (!origin) {
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
      "x-session-id", // ✅ Session ID header (order draft uchun)
      "Cache-Control", // ✅ Cache control header
      "Pragma", // ✅ Pragma header (cache-busting uchun)
    ],
    preflightContinue: false, // Preflight request'ni to'xtatish
    optionsSuccessStatus: 204, // Preflight success status code
  });

  // Compression middleware (gzip) - response'ni siqish
  app.use(compression.default());

  // Cookie parser middleware - HttpOnly cookie'lar uchun
  app.use(cookieParser.default());

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

  const uploadsDir = join(process.cwd(), "uploads");
  app.use("/uploads", express.static(uploadsDir));

  // ✅ Swagger setup - faqat development'da (production'da xavfsizlik uchun o'chiriladi)

  if (!isProduction) {
    try {
      const cfg = new DocumentBuilder()
        .setTitle("ERP API")
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

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
