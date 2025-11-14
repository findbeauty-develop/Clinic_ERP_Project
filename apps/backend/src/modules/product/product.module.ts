import { Module } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { ProductsController } from "./controllers/products.controller";
import { ProductsRepository } from "./repositories/products.repository";
import { ProductsService } from "./services/products.service";

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductsRepository,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
})
export class ProductModule {}

