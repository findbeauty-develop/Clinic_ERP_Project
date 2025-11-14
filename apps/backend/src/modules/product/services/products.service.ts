import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { CreateProductDto } from "../dto/create-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    let imageUrl: string | undefined;

    if (dto.image) {
      const [savedImage] = await saveBase64Images("product", [dto.image], tenantId);
      imageUrl = savedImage;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const resolvedStatus = dto.status ?? (dto.isActive === false ? "단종" : "활성");
      const resolvedIsActive =
        dto.isActive ??
        (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          brand: dto.brand,
          barcode: dto.barcode,
          image_url: imageUrl,
          category: dto.category,
          status: resolvedStatus,
          is_active: resolvedIsActive,
          unit: dto.unit ?? null,
          purchase_price: dto.purchasePrice ?? null,
          sale_price: dto.salePrice ?? null,
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
        } as any,
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
              expiry_unit: batch.expiry_unit ?? null,
              qty: batch.qty,
              alert_days: batch.alert_days ?? null,
            } as any,
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
              contact_name: s.contact_name ?? null,
              contact_phone: s.contact_phone ?? null,
              contact_email: s.contact_email ?? null,
            } as any,
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

  async getProduct(productId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
      include: {
        returnPolicy: true,
        batches: {
          orderBy: { created_at: "desc" },
        },
        supplierProducts: {
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const latestBatch = product.batches?.[0];
    const supplier = product.supplierProducts?.[0];

    return {
      productName: product.name,
      brand: product.brand,
      productImage: product.image_url,
      category: product.category,
      status: product.status,
      currentStock: product.current_stock,
      minStock: product.min_stock,
      purchasePrice: product.purchase_price,
      salePrice: product.sale_price,
      unit: product.unit,
      supplierName: supplier?.supplier_id ?? null,
      managerName: supplier?.contact_name ?? null,
      expiryDate: latestBatch?.expiry_date ?? null,
      storageLocation: latestBatch?.storage ?? null,
      memo: supplier?.note ?? product.returnPolicy?.note ?? null,
    };
  }
}

