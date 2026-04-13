import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as compression from "compression";
import * as cookieParser from "cookie-parser";
import * as helmet from "helmet";
import { httpHelmetOptions } from "./common/http-helmet.options";
import {
  buildAppCorsOptions,
  getAllowedCorsOrigins,
  setStaticUploadsCorsHeaders,
} from "./common/cors.config";
import { getUploadRoot } from "./common/utils/upload.utils";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = getAllowedCorsOrigins();

  app.use(helmet.default(httpHelmetOptions));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
      forbidNonWhitelisted: false,
    })
  );

  app.enableCors(buildAppCorsOptions(isProduction, allowedOrigins));

  app.use(compression.default());
  app.use(cookieParser.default());

  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(
    bodyParser.urlencoded({
      limit: "10mb",
      extended: true,
    })
  );

  const uploadsDir = getUploadRoot();
  app.use(
    "/uploads",
    express.static(uploadsDir, {
      setHeaders: (res) =>
        setStaticUploadsCorsHeaders(res, isProduction, allowedOrigins),
    })
  );

  app.getHttpAdapter().get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "clinic-backend",
    });
  });

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
    }
  } else {
    console.log("Swagger disabled in production mode");
  }

  await app.listen(process.env.PORT_API ?? 3000);
}

bootstrap();
