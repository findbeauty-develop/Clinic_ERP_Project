import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { IamModule } from "./modules/iam/iam.module";
import { MemberModule } from "./modules/member/member.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IamModule,
    CatalogModule,
    MemberModule,
    UploadsModule,
  ],
})
export class AppModule {}

