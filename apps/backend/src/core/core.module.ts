import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { HttpExceptionFilter } from "src/common/filters/http-exception.filter";
import { PrometheusInterceptor } from "src/common/interceptors/prometheus.interceptor";
import { AttackDetectionInterceptor } from "src/common/interceptors/attack-detection.interceptor";

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PrometheusInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AttackDetectionInterceptor,
    },
  ],
})
export class CoreModule {}
