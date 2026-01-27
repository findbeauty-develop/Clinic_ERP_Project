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
      // ✅ Production'da .env.production, Development'da .env/.env.local
      envFilePath: process.env.NODE_ENV === 'production' 
        ? [
            ".env.production",
            "apps/supplier-backend/.env.production",
            "../../apps/supplier-backend/.env.production",
            "/app/apps/supplier-backend/.env.production",
          ]
        : [
            "apps/supplier-backend/.env.local",  // ✅ Birinchi priority: app directory'dagi .env.local
            ".env.local",                        // ✅ Ikkinchi priority: root'dagi .env.local
            "apps/supplier-backend/.env",        // ✅ Uchinchi priority: app directory'dagi .env
            ".env",                              // ✅ To'rtinchi priority: root'dagi .env
            "../../apps/supplier-backend/.env.local",
            "../../apps/supplier-backend/.env",
            "/app/apps/supplier-backend/.env.local",
            "/app/apps/supplier-backend/.env",
          ],
      ignoreEnvFile: false,
      ignoreEnvVars: false, // Always read from process.env (but env files have priority in ConfigService.get())
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

