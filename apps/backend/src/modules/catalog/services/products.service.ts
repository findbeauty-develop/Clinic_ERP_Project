import { Injectable } from "@nestjs/common";
import { ProductsRepository } from "../repositories/products.repository";

@Injectable()
export class ProductsService {
  constructor(private repo: ProductsRepository) {}

  create(dto: any, tenantId: string, userId: string) {
    return this.repo.create({
      ...dto,
      tenant_id: tenantId,
      created_by: userId,
    });
  }

  list(tenantId: string) {
    return this.repo.findMany(tenantId);
  }

  update(id: string, dto: any, tenantId: string) {
    return this.repo.update(id, {
      ...dto,
      tenant_id: tenantId,
      updated_at: new Date(),
    });
  }
}

