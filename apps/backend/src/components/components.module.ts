import { Module } from "@nestjs/common";
import { CalendarModule } from "src/modules/calendar/calendar.module";
import { HiraModule } from "src/modules/hira/hira.module";
import { IamModule } from "src/modules/iam/iam.module";
import { InventoryModule } from "src/modules/inventory/inventory.module";
import { MemberModule } from "src/modules/member/member.module";
import { NewsModule } from "src/modules/news/news.module";
import { NotificationsModule } from "src/modules/notifications/notifications.module";
import { OrderReturnModule } from "src/modules/order-return/order-return.module";
import { OrderModule } from "src/modules/order/order.module";
import { OutboundModule } from "src/modules/outbound/outbound.module";
import { PackageModule } from "src/modules/package/package.module";
import { ProductModule } from "src/modules/product/product.module";
import { ReturnModule } from "src/modules/return/return.module";
import { SupplierModule } from "src/modules/supplier/supplier.module";
import { SupportModule } from "src/modules/support/support.module";
import { WeatherModule } from "src/modules/weather/weather.module";
import { UploadsModule } from "src/uploads/uploads.module";
@Module({
  imports: [
    IamModule,
    MemberModule,
    ProductModule,
    OutboundModule,
    PackageModule,
    ReturnModule,
    OrderModule,
    OrderReturnModule,
    SupplierModule,
    InventoryModule,
    NotificationsModule,
    UploadsModule,
    NewsModule,
    HiraModule,
    CalendarModule,
    WeatherModule,
    SupportModule,
  ],
})
export class ComponentsModule {}
