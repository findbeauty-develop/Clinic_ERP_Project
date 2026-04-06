import { Module } from "@nestjs/common";
import { DefectiveReturnController } from "./defective-return.controller";
import { DefectiveReturnService } from "./defective-return.service";
import { PrismaService } from "../../core/prisma.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  controllers: [DefectiveReturnController],
  providers: [DefectiveReturnService, PrismaService, JwtAuthGuard],
  exports: [DefectiveReturnService],
})
export class DefectiveReturnModule {}
