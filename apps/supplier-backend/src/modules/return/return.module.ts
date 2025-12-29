import { Module } from "@nestjs/common";
import { ReturnController } from "./return.controller";
import { ReturnService } from "./return.service";
import { PrismaService } from "../../core/prisma.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { SolapiProvider } from "../../services/providers/solapi.provider";

@Module({
  controllers: [ReturnController],
  providers: [ReturnService, PrismaService, JwtAuthGuard, SolapiProvider],
  exports: [ReturnService],
})
export class ReturnModule {}

