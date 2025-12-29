import { Module } from "@nestjs/common";
import { ReturnController } from "./return.controller";
import { ReturnService } from "./return.service";
import { PrismaService } from "../../core/prisma.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  controllers: [ReturnController],
  providers: [ReturnService, PrismaService, JwtAuthGuard],
  exports: [ReturnService],
})
export class ReturnModule {}

