import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { CreateProductDto } from "../dto/create-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto) {
    let imageUrl: string | undefined;

    if (dto.image) {
      const [savedImage] = await saveBase64Images("product", [dto.image]);
      imageUrl = savedImage;
    }

    const tenantId = dto.tenantId ?? undefined;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          brand: dto.brand,
          barcode: dto.barcode,
          image_url: imageUrl,
          category: dto.category,
          is_active: dto.isActive ?? true,
          current_stock: dto.currentStock ?? 0,
          min_stock: dto.minStock ?? 0,
          returnPolicy: dto.returnPolicy
            ? {
                create: {
                  tenant_id: tenantId,
                  is_returnable: dto.returnPolicy.is_returnable,
                  refund_amount: dto.returnPolicy.refund_amount ?? 0,
                  return_storage: dto.returnPolicy.return_storage ?? null,
                  note: dto.returnPolicy.note ?? null,
                },
              }
            : undefined,
        },
        include: { returnPolicy: true, batches: true, supplierProducts: true },
      });

      // Create batches
      if (dto.initial_batches?.length) {
        for (const batch of dto.initial_batches) {
          await tx.batch.create({
            data: {
              tenant_id: tenantId,
              product_id: product.id,
              batch_no: batch.batch_no,
              storage: batch.storage ?? null,
              purchase_price: batch.purchase_price ?? null,
              sale_price: batch.sale_price ?? null,
              manufacture_date: batch.manufacture_date
                ? new Date(batch.manufacture_date)
                : null,
              expiry_date: batch.expiry_date ? new Date(batch.expiry_date) : null,
              expiry_months: batch.expiry_months ?? null,
              qty: batch.qty,
              alert_days: batch.alert_days ?? null,
            },
          });
        }
      }

      // Create supplier products
      if (dto.suppliers?.length) {
        for (const s of dto.suppliers) {
          await tx.supplierProduct.create({
            data: {
              tenant_id: tenantId,
              product_id: product.id,
              supplier_id: s.supplier_id,
              purchase_price: s.purchase_price ?? null,
              moq: s.moq ?? null,
              lead_time_days: s.lead_time_days ?? null,
              note: s.note ?? null,
            },
          });
        }
      }

      // Return product with all related data
      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          returnPolicy: true,
          batches: true,
          supplierProducts: true,
        },
      });
    });
  }
}

