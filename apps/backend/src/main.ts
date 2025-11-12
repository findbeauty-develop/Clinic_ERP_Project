import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true }); 
  const cfg = new DocumentBuilder()
    .setTitle("ERP API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
   
   app.enableCors({ origin: true });  
  const doc = SwaggerModule.createDocument(app, cfg);
  SwaggerModule.setup("docs", app, doc);
  app.getHttpAdapter().get("/docs-json", (req, res) => {
    res.json(doc);
  });
  try {
    await app.listen(process.env.PORT ?? 3000);
    console.log(`Server is running on port ${process.env.PORT}`);
  } catch (err) {
    console.log(err)
  }
  
}
bootstrap();

