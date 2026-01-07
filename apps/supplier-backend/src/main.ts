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
      console.log(`Set GOOGLE_APPLICATION_CREDENTIALS to: ${credentialsPath}`);
    }
  }
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ✅ CORS configuration from environment variable
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : ["http://localhost:3001", "http://localhost:3003"];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  });

  console.log("✅ CORS enabled for origins:", allowedOrigins);

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

  const port = Number(process.env.PORT) || 3002;
  await app.listen(port);
  console.log(`Supplier Backend is running on port ${port}`);
}
bootstrap();
