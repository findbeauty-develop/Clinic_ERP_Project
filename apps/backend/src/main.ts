import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as express from "express";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true });

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

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
