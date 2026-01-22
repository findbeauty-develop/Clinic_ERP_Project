import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import { join, resolve } from "path";
import { existsSync } from "fs";

async function bootstrap() {
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ✅ CORS configuration from environment variable
  // Production'da CORS_ORIGINS majburiy, development'da localhost fallback
  const isProduction = process.env.NODE_ENV === "production";
  
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : isProduction
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
  app.use("/uploads", express.static(uploadsDir));

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

  const port = Number(process.env.PORT) || 3002;
  await app.listen(port);
  
}
bootstrap();
