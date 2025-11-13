import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IamModule } from "./modules/iam/iam.module";
import { MemberModule } from "./modules/member/member.module";
import { ProductModule } from "./modules/product/product.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IamModule,
    ProductModule,
    MemberModule,
    UploadsModule,
  ],
})
export class AppModule {}

