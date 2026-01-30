import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { PrismaModule } from "./core/prisma.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { IamModule } from "./modules/iam/iam.module";
import { MemberModule } from "./modules/member/member.module";
import { ProductModule } from "./modules/product/product.module";
import { OutboundModule } from "./modules/outbound/outbound.module";
import { PackageModule } from "./modules/package/package.module";
import { ReturnModule } from "./modules/return/return.module";
import { OrderModule } from "./modules/order/order.module";
import { OrderReturnModule } from "./modules/order-return/order-return.module";
import { SupplierModule } from "./modules/supplier/supplier.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { UploadsModule } from "./uploads/uploads.module";
import { NewsModule } from "./modules/news/news.module";
import { HiraModule } from "./modules/hira/hira.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { WeatherModule } from "./modules/weather/weather.module";
import { SupportModule } from "./modules/support/support.module";
import { PerformanceLoggerMiddleware } from "./common/middleware/performance-logger.middleware";
import { CommonModule } from "./common/common.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Try multiple paths for .env file (local dev and Docker)
      envFilePath:
        process.env.NODE_ENV === "production"
          ? [
              ".env.production",
              "apps/backend/.env.production",
              "../../apps/backend/.env.production",
            ]
          : [
              ".env.local", // ✅ Development uchun .env.local (priority)
              ".env", // ✅ Development uchun .env
              "apps/backend/.env.local",
              "apps/backend/.env",
              "../../apps/backend/.env.local",
              "../../apps/backend/.env",
            ],
      ignoreEnvFile: false,
      ignoreEnvVars: false, // Always read from process.env
      expandVariables: true,
    }),
    // ✅ Rate Limiting - Global throttler configuration
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute (milliseconds)
        limit: 100, // 100 requests per minute (global default)
      },
    ]),
    PrismaModule, // Global PrismaModule - barcha module'larda PrismaService mavjud bo'ladi
    IamModule,
    ProductModule,
    MemberModule,
    OutboundModule,
    PackageModule,
    ReturnModule,
    OrderModule,
    OrderReturnModule,
    SupplierModule,
    InventoryModule,
    UploadsModule,
    NewsModule,
    HiraModule,
    CalendarModule,
    WeatherModule,
    SupportModule,
    CommonModule, // ✅ Global monitoring va notification services
  ],
  providers: [
    // ✅ Global throttler guard (barcha endpoint'lar uchun)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // ✅ Global exception filter (error handling uchun)
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply PerformanceLoggerMiddleware
    consumer.apply(PerformanceLoggerMiddleware).forRoutes("*");
  }
}
