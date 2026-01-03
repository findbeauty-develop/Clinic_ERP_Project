import { Module } from "@nestjs/common";
import { ProductsController } from "./controllers/products.controller";
import { ProductsService } from "./services/products.service";
import { ProductsRepository } from "./repositories/products.repository";
import { SupabaseService } from "../../common/supabase.service";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository, SupabaseService],
})
export class CatalogModule {}
