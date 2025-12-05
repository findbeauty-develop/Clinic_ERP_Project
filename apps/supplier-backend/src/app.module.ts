import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { ManagerModule } from "./modules/manager/manager.module";
import { ReturnModule } from "./modules/return/return.module";
import { OrderModule } from "./modules/order/order.module";
import { PrismaService } from "./core/prisma.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        ".env",
        "apps/supplier-backend/.env",
        "../../apps/supplier-backend/.env",
        "/app/apps/supplier-backend/.env",
      ],
      ignoreEnvFile: false,
      ignoreEnvVars: false,
      expandVariables: true,
    }),
    AuthModule,
    ManagerModule,
    ReturnModule,
    OrderModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}

