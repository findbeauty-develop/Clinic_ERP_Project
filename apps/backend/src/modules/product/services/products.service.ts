import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { CreateProductDto } from "../dto/create-product.dto";
import { ProductsRepository } from "../repositories/products.repository";

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly prisma: PrismaService
  ) {}

  async createProduct(dto: CreateProductDto) {
    const data = {
      name: dto.name,
      brand: dto.brand,
      barcode: dto.barcode,
      image_url: dto.imageUrl,
      category: dto.category,
      is_active: dto.isActive ?? true,
      current_stock: dto.currentStock ?? 0,
      min_stock: dto.minStock ?? 0,
    };

    return this.productsRepository.create(data);
  }
}

