import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IamModule } from "./modules/iam/iam.module";
import { MemberModule } from "./modules/member/member.module";
import { ProductModule } from "./modules/product/product.module";
import { OutboundModule } from "./modules/outbound/outbound.module";
import { PackageModule } from "./modules/package/package.module";
import { ReturnModule } from "./modules/return/return.module";
import { OrderModule } from "./modules/order/order.module";
import { SupplierModule } from "./modules/supplier/supplier.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Try multiple paths for .env file (local dev and Docker)
      envFilePath: [
        ".env",
        "apps/backend/.env",
        "../../apps/backend/.env",
        "/app/apps/backend/.env",
      ],
      ignoreEnvFile: false,
      ignoreEnvVars: false, // Always read from process.env
      expandVariables: true,
    }),
    IamModule,
    ProductModule,
    MemberModule,
    OutboundModule,
    PackageModule,
    ReturnModule,
    OrderModule,
    SupplierModule,
    UploadsModule,
  ],
})
export class AppModule {}

