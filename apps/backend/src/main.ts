import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as compression from "compression";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true });

  // Compression middleware (gzip) - response'ni siqish
  app.use(compression.default());

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

  // Swagger setup with error handling
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
  } catch (error: any) {
    console.warn("Swagger setup failed:", error?.message || String(error));
    // Continue without Swagger if setup fails
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
