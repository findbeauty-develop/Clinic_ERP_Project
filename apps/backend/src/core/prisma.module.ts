import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global() // Global module - barcha module'larda mavjud bo'ladi
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

