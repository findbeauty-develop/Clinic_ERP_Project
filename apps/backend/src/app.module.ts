import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./core/prisma.module";
import { StorageModule } from "./core/storage/storage.module";
import { PerformanceLoggerMiddleware } from "./common/middleware/performance-logger.middleware";
import { CommonModule } from "./common/common.module";
import { getNestConfigEnvFilePath } from "./common/nest-config-env.paths";
import { ComponentsModule } from "./components/components.module";
import { CoreModule } from "./core/core.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getNestConfigEnvFilePath(),
      ignoreEnvFile: false,
      ignoreEnvVars: false,
      expandVariables: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute (milliseconds)
        limit: 10, // Strict limit for auth endpoints only
      },
    ]),
    PrismaModule, // Global PrismaModule - barcha module'larda PrismaService mavjud bo'ladi
    EventEmitterModule.forRoot(),
    StorageModule, // Global StorageModule - Supabase Storage for file uploads
    CommonModule,
    ComponentsModule, // ✅ Global monitoring va notification services
  ],
  providers: [CoreModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply PerformanceLoggerMiddleware
    consumer.apply(PerformanceLoggerMiddleware).forRoutes("*");
  }
}
