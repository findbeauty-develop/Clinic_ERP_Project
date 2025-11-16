import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { CreateBatchDto, CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    let imageUrl: string | undefined;

    if (dto.image) {
      const [savedImage] = await saveBase64Images(
        "product",
        [dto.image],
        tenantId
      );
      imageUrl = savedImage;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const resolvedStatus =
        dto.status ?? (dto.isActive === false ? "단종" : "활성");
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
          // Avtomatik batch_no yaratish (agar berilmagan bo'lsa)
          const batchNo =
            batch.batch_no ||
            (await this.generateBatchNo(product.id, tenantId, tx));

          await tx.batch.create({
            data: {
              tenant_id: tenantId,
              product_id: product.id,
              batch_no: batchNo,
              qty: batch.qty, // 입고 수량 (Inbound quantity)
              expiry_months: batch.expiry_months ?? null, // 유형 기간 (Expiry period)
              expiry_unit: batch.expiry_unit ?? null,
              manufacture_date: batch.manufacture_date
                ? new Date(batch.manufacture_date)
                : null, // 제조일 (Manufacture date)
              storage: batch.storage ?? null, // 보관 위치 (Storage location)
              purchase_price: batch.purchase_price ?? null, // 구매원가 (Purchase price)
              inbound_manager: batch.inbound_manager ?? null, // 입고 담당자 (Inbound manager)
              sale_price: batch.sale_price ?? null,
              expiry_date: batch.expiry_date
                ? new Date(batch.expiry_date)
                : null,
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
      id: product.id,
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
      isReturnable: product.returnPolicy?.is_returnable ?? false,
    };
  }

  async getAllProducts(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const products = await this.prisma.product.findMany({
      where: { tenant_id: tenantId },
      include: {
        returnPolicy: true,
        batches: {
          orderBy: { created_at: "desc" },
        },
        supplierProducts: {
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return products.map((product: (typeof products)[number]) => {
      const latestBatch = product.batches?.[0];
      const supplier = product.supplierProducts?.[0];

      return {
        id: product.id,
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
        batches: product.batches,
      };
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.prisma.product.findFirst({
      where: { id, tenant_id: tenantId },
      include: { returnPolicy: true },
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    let imageUrl = existing.image_url;

    if (dto.image) {
      const [savedImage] = await saveBase64Images(
        "product",
        [dto.image],
        tenantId
      );
      imageUrl = savedImage;
    }

    const resolvedStatus = dto.status ?? existing.status;
    const resolvedIsActive =
      dto.isActive ??
      (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          brand: dto.brand ?? existing.brand,
          barcode: dto.barcode ?? existing.barcode,
          image_url: imageUrl,
          category: dto.category ?? existing.category,
          status: resolvedStatus,
          is_active: resolvedIsActive,
          unit: dto.unit ?? existing.unit,
          purchase_price: dto.purchasePrice ?? existing.purchase_price,
          sale_price: dto.salePrice ?? existing.sale_price,
          current_stock: dto.currentStock ?? existing.current_stock,
          min_stock: dto.minStock ?? existing.min_stock,
        },
      });

      if (dto.returnPolicy) {
        await tx.returnPolicy.upsert({
          where: { product_id: id },
          update: {
            is_returnable: dto.returnPolicy.is_returnable,
            refund_amount:
              dto.returnPolicy.refund_amount ??
              existing.returnPolicy?.refund_amount ??
              0,
            return_storage: dto.returnPolicy.return_storage ?? null,
            note: dto.returnPolicy.note ?? null,
          },
          create: {
            tenant_id: tenantId,
            product_id: id,
            is_returnable: dto.returnPolicy.is_returnable,
            refund_amount: dto.returnPolicy.refund_amount ?? 0,
            return_storage: dto.returnPolicy.return_storage ?? null,
            note: dto.returnPolicy.note ?? null,
          },
        });
      }

      if (dto.suppliers) {
        await tx.supplierProduct.deleteMany({
          where: { product_id: id, tenant_id: tenantId },
        });

        for (const supplier of dto.suppliers) {
          if (!supplier?.supplier_id) {
            // Skip entries without supplier_id to avoid invalid inserts
            continue;
          }

          await tx.supplierProduct.create({
            data: {
              tenant_id: tenantId,
              product_id: id,
              supplier_id: supplier.supplier_id,
              purchase_price: supplier.purchase_price ?? null,
              moq: supplier.moq ?? null,
              lead_time_days: supplier.lead_time_days ?? null,
              note: supplier.note ?? null,
              contact_name: supplier.contact_name ?? null,
              contact_phone: supplier.contact_phone ?? null,
              contact_email: supplier.contact_email ?? null,
            },
          });
        }
      }

      if (dto.initial_batches) {
        await tx.batch.deleteMany({
          where: { product_id: id, tenant_id: tenantId },
        });

        for (const batch of dto.initial_batches) {
          // Avtomatik batch_no yaratish (agar berilmagan bo'lsa)
          const batchNo =
            batch.batch_no || (await this.generateBatchNo(id, tenantId, tx));

          await tx.batch.create({
            data: {
              tenant_id: tenantId,
              product_id: id,
              batch_no: batchNo,
              qty: batch.qty, // 입고 수량 (Inbound quantity)
              expiry_months: batch.expiry_months ?? null, // 유형 기간 (Expiry period)
              expiry_unit: batch.expiry_unit ?? null,
              manufacture_date: batch.manufacture_date
                ? new Date(batch.manufacture_date)
                : null, // 제조일 (Manufacture date)
              storage: batch.storage ?? null, // 보관 위치 (Storage location)
              purchase_price: batch.purchase_price ?? null, // 구매원가 (Purchase price)
              inbound_manager: batch.inbound_manager ?? null, // 입고 담당자 (Inbound manager)
              sale_price: batch.sale_price ?? null,
              expiry_date: batch.expiry_date
                ? new Date(batch.expiry_date)
                : null,
              alert_days: batch.alert_days ?? null,
            },
          });
        }
      }
    });

    return this.getProduct(id, tenantId);
  }

  async deleteProduct(id: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.prisma.product.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.batch.deleteMany({
        where: { product_id: id, tenant_id: tenantId },
      });
      await tx.supplierProduct.deleteMany({
        where: { product_id: id, tenant_id: tenantId },
      });
      await tx.returnPolicy.deleteMany({
        where: { product_id: id, tenant_id: tenantId },
      });
      await tx.product.delete({ where: { id } });
    });

    return { success: true };
  }

  /**
   * Product'ning barcha batch'larini olish
   * @param productId - Product ID
   * @param tenantId - Tenant ID
   * @returns Batch'lar ro'yxati: batch_no, 유효기간, 보관 위치, created_at
   */
  async getProductBatches(productId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Product mavjudligini tekshirish
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Product'ning barcha batch'larini olish
    const batches = await this.prisma.batch.findMany({
      where: { product_id: productId, tenant_id: tenantId },
      orderBy: { created_at: "desc" },
      select: {
        batch_no: true,
        expiry_date: true,
        expiry_months: true,
        expiry_unit: true,
        storage: true,
        created_at: true,
      },
    });

    // Formatlash: 유효기간 ni yaratish (expiry_date yoki expiry_months + expiry_unit)
    return batches.map(
      (batch: {
        batch_no: string;
        expiry_date: Date | null;
        expiry_months: number | null;
        expiry_unit: string | null;
        storage: string | null;
        created_at: Date;
      }) => ({
        batch_no: batch.batch_no,
        유효기간: batch.expiry_date
          ? batch.expiry_date.toISOString().split("T")[0] // YYYY-MM-DD formatida
          : batch.expiry_months && batch.expiry_unit
          ? `${batch.expiry_months} ${batch.expiry_unit}`
          : null,
        보관위치: batch.storage ?? null,
        created_at: batch.created_at,
      })
    );
  }

  /**
   * Mavjud productga batch yaratish
   * @param productId - Product ID
   * @param dto - Batch ma'lumotlari
   * @param tenantId - Tenant ID
   */
  async createBatchForProduct(
    productId: string,
    dto: CreateBatchDto,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Product mavjudligini tekshirish
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Avtomatik batch_no yaratish
      const batchNo = await this.generateBatchNo(productId, tenantId, tx);

      // Batch yaratish
      const batch = await tx.batch.create({
        data: {
          tenant_id: tenantId,
          product_id: productId,
          batch_no: batchNo,
          qty: dto.qty, // 입고 수량 (Inbound quantity)
          expiry_months: dto.expiry_months ?? null, // 유형 기간 (Expiry period)
          expiry_unit: dto.expiry_unit ?? null,
          manufacture_date: dto.manufacture_date
            ? new Date(dto.manufacture_date)
            : null, // 제조일 (Manufacture date) - optional
          storage: dto.storage ?? null, // 보관 위치 (Storage location) - optional
          purchase_price: dto.purchase_price ?? null, // 구매원가(원) (Purchase price in KRW) - optional
          inbound_manager: dto.inbound_manager ?? null, // 입고 담당자 (Inbound manager) - optional
          sale_price: dto.sale_price ?? null,
          expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
          alert_days: dto.alert_days ?? null,
        } as any,
      });

      // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
      const totalStock = await tx.batch.aggregate({
        where: { product_id: productId, tenant_id: tenantId },
        _sum: { qty: true },
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          current_stock: totalStock._sum.qty ?? 0,
        } as any,
      });

      // Product bilan birga qaytarish
      return tx.product.findUnique({
        where: { id: productId },
        include: {
          returnPolicy: true,
          batches: {
            orderBy: { created_at: "desc" },
          },
          supplierProducts: true,
        },
      });
    });
  }

  /**
   * Avtomatik batch_no yaratish
   * Format: {9xonalik random raqam}-{3xonalik tartib raqami}
   * Masalan: 123456789-001, 987654321-002
   */
  private async generateBatchNo(
    productId: string,
    tenantId: string,
    tx: Prisma.TransactionClient
  ): Promise<string> {
    // 9 xonalik random raqam yaratish (100000000 - 999999999)
    const random9Digits = Math.floor(
      100000000 + Math.random() * 900000000
    ).toString();

    // Product'ning mavjud batch'lari sonini topish
    const existingBatchesCount = await tx.batch.count({
      where: { product_id: productId, tenant_id: tenantId },
    });

    // Keyingi tartib raqamini hisoblash (001, 002, 003, ...)
    const sequenceNumber = (existingBatchesCount + 1)
      .toString()
      .padStart(3, "0");

    // Formatlash: {random9digit}-{3digitSequence}
    return `${random9Digits}-${sequenceNumber}`;
  }
}
