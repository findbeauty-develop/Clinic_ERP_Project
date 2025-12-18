import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
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

    return this.prisma.$transaction(async (tx: any) => {
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
          capacity_per_product: dto.capacityPerProduct ?? null,
          capacity_unit: dto.capacityUnit ?? null,
          usage_capacity: dto.usageCapacity ?? null,
          // Product-level expiry defaults
          expiry_months: dto.expiryMonths ?? null,
          expiry_unit: dto.expiryUnit ?? null,
          alert_days: dto.alertDays ?? null,
          // Packaging unit conversion
          has_different_packaging_quantity: dto.hasDifferentPackagingQuantity ?? false,
          packaging_from_quantity: dto.packagingFromQuantity ?? null,
          packaging_from_unit: dto.packagingFromUnit ?? null,
          packaging_to_quantity: dto.packagingToQuantity ?? null,
          packaging_to_unit: dto.packagingToUnit ?? null,
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
              inbound_manager: (batch as any).inbound_manager ?? null, // 입고 담당자 (Inbound manager)
              sale_price: batch.sale_price ?? null,
              expiry_date: batch.expiry_date
                ? new Date(batch.expiry_date)
                : null,
              alert_days: batch.alert_days ?? product.alert_days ?? null,
            } as any,
          });
        }
      }

      // Create supplier products
      if (dto.suppliers?.length) {
        for (const s of dto.suppliers) {
          // Try to find Supplier by supplier_id to get tenant_id and company_name
          let supplierTenantId = null;
          let companyName = null;
          let supplierRecord = null;
          
          if (s.supplier_id) {
            try {
              // Check if supplier_id is a UUID (Supplier.id)
              supplierRecord = await tx.supplier.findUnique({
                where: { id: s.supplier_id },
                select: { tenant_id: true, company_name: true },
              });
              
              if (supplierRecord) {
                supplierTenantId = supplierRecord.tenant_id;
                companyName = supplierRecord.company_name;
              } else {
                // Not a UUID, maybe it's a company name or manager_id (legacy)
                companyName = s.supplier_id;
              }
            } catch (e) {
              // Invalid UUID format - treat as company name
              companyName = s.supplier_id;
            }
          }

          // Find SupplierManager by contact_phone if available
          // This allows us to link the product to the correct manager even if supplier is registered on platform
          let supplierManagerId = null;
          if (s.contact_phone) {
            try {
              // phone_number is unique, so we'll get at most one result
              const supplierManager = await tx.supplierManager.findFirst({
                where: {
                  phone_number: s.contact_phone,
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                },
              });

              if (supplierManager) {
                supplierManagerId = supplierManager.id;
              }
            } catch (e) {
              // Log but don't fail - supplier might not be registered on platform yet
              console.warn(`Failed to find SupplierManager by phone ${s.contact_phone}: ${e}`);
            }
          }

          await tx.supplierProduct.create({
            data: {
              tenant_id: tenantId,
              product_id: product.id,
              supplier_id: s.supplier_id ?? null, // Optional - legacy field
              supplier_manager_id: supplierManagerId, // SupplierManager ID if supplier is registered on platform
              supplier_tenant_id: supplierTenantId,
              company_name: companyName,
              purchase_price: s.purchase_price ?? null,
              moq: s.moq ?? null,
              lead_time_days: s.lead_time_days ?? null,
              note: s.note ?? null,
              contact_name: s.contact_name ?? null,
              contact_phone: s.contact_phone ?? null,
              contact_email: s.contact_email ?? null,
            } as any,
          });

          // Create ClinicSupplierLink if supplier is registered on platform
          // This ensures that suppliers with actual business transactions appear in primary search
          if (supplierRecord && supplierRecord.tenant_id) {
            try {
              // Find SupplierManager for this supplier (ACTIVE status)
              const supplierManager = await tx.supplierManager.findFirst({
                where: {
                  supplier_tenant_id: supplierRecord.tenant_id,
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                },
              });

              if (supplierManager) {
                // Create or update ClinicSupplierLink to APPROVED status
                // This link will allow the supplier to appear in primary search results
                await tx.clinicSupplierLink.upsert({
                  where: {
                    tenant_id_supplier_manager_id: {
                      tenant_id: tenantId,
                      supplier_manager_id: supplierManager.id,
                    },
                  },
                  update: {
                    status: "APPROVED",
                    approved_at: new Date(),
                    updated_at: new Date(),
                  },
                  create: {
                    tenant_id: tenantId,
                    supplier_manager_id: supplierManager.id,
                    status: "APPROVED",
                    approved_at: new Date(),
                  },
                });
              }
            } catch (linkError: any) {
              // Log error but don't fail product creation
              // Trade link creation is optional - product creation should succeed even if link creation fails
              console.warn(`Failed to create ClinicSupplierLink for supplier ${s.supplier_id}: ${linkError?.message || 'Unknown error'}`);
            }
          }
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
    const supplierProduct = product.supplierProducts?.[0];

    // alertDays ni batch'dan yoki product'dan olish
    // Agar batch'da alert_days bo'lsa, uni ishlatish, aks holda null
    const alertDays = latestBatch?.alert_days ?? null;

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
      capacityPerProduct: (product as any).capacity_per_product,
      capacityUnit: (product as any).capacity_unit,
      usageCapacity: (product as any).usage_capacity,
      supplierId: supplierProduct?.supplier_id ?? null, // Supplier UUID
      supplierName: supplierProduct?.company_name ?? null, // Company name (denormalized)
      managerName: supplierProduct?.contact_name ?? null,
      contactPhone: supplierProduct?.contact_phone ?? null,
      contactEmail: supplierProduct?.contact_email ?? null,
      expiryDate: latestBatch?.expiry_date ?? null,
      storageLocation: latestBatch?.storage ?? null,
      memo: supplierProduct?.note ?? product.returnPolicy?.note ?? null,
      isReturnable: product.returnPolicy?.is_returnable ?? false,
      refundAmount: product.returnPolicy?.refund_amount ?? null,
      returnStorage: product.returnPolicy?.return_storage ?? null,
      alertDays: (product as any).alert_days ?? null,
    };
  }

  async getAllProducts(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Use executeWithRetry to handle connection errors automatically
    const products = await this.prisma.executeWithRetry(async () => {
      return await this.prisma.product.findMany({
        where: { tenant_id: tenantId },
        include: {
          returnPolicy: true,
          batches: {
            orderBy: { created_at: "desc" },
          },
          supplierProducts: {
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      });
    });

    return products.map((product: any) => {
      const latestBatch = product.batches?.[0];
      const supplierProduct = product.supplierProducts?.[0];
      
      // Get company_name directly from SupplierProduct (denormalized field)
      const companyName = supplierProduct?.company_name ?? null;

      // 재고 부족 tag
      const isLowStock = product.current_stock < product.min_stock;

      // Batch'larni FEFO bo'yicha sortlash (유효기간 → 배치번호)
      const sortedBatches = this.sortBatchesByFEFO(product.batches || []);

      // Batch'larga expiry status qo'shish
      const batchesWithStatus = sortedBatches.map((batch: any) => {
        const isExpiringSoon = batch.expiry_date
          ? this.calculateExpiringSoon(batch.expiry_date, batch.alert_days)
          : false;
        const daysUntilExpiry = batch.expiry_date
          ? this.calculateDaysUntilExpiry(batch.expiry_date)
          : null;

        return {
          ...batch,
          isExpiringSoon,
          daysUntilExpiry,
        };
      });

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        barcode: product.barcode,
        productImage: product.image_url,
        category: product.category,
        status: product.status,
        currentStock: product.current_stock,
        minStock: product.min_stock,
        purchasePrice: product.purchase_price,
        salePrice: product.sale_price,
        unit: product.unit,
        supplierName: companyName, // Company name from Supplier table
        managerName: supplierProduct?.contact_name ?? null,
        expiryDate: latestBatch?.expiry_date ?? null,
        storageLocation: latestBatch?.storage ?? null,
        memo: supplierProduct?.note ?? product.returnPolicy?.note ?? null,
        expiryMonths: product.expiry_months ?? null,
        expiryUnit: product.expiry_unit ?? null,
        isLowStock, // ← Qo'shildi (재고 부족 tag)
        batches: batchesWithStatus, // ← FEFO sorted va status bilan
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

    // Image handling: agar null yuborilgan bo'lsa, image'ni o'chirish
    // Agar yangi image yuborilgan bo'lsa, yangi image'ni saqlash
    if (dto.image !== undefined) {
      if (dto.image === null || dto.image === "") {
        // Image o'chirilmoqda
        imageUrl = null;
      } else if (
        dto.image &&
        typeof dto.image === "string" &&
        dto.image.length > 0
      ) {
        // Yangi image yuklanmoqda (base64 format'da)
        const [savedImage] = await saveBase64Images(
          "product",
          [dto.image],
          tenantId
        );
        imageUrl = savedImage;
      }
    }
    // Agar dto.image undefined bo'lsa, eski image saqlanadi (image o'zgarmagan)

    const resolvedStatus = dto.status ?? existing.status;
    const resolvedIsActive =
      dto.isActive ??
      (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

    await this.prisma.$transaction(async (tx: any) => {
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
          capacity_per_product: dto.capacityPerProduct ?? (existing as any).capacity_per_product,
          capacity_unit: dto.capacityUnit ?? (existing as any).capacity_unit,
          usage_capacity: dto.usageCapacity ?? (existing as any).usage_capacity,
        } as any,
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
          // Skip entries without required data
          if (!supplier?.contact_name && !supplier?.contact_phone) {
            continue;
          }

          // Try to find Supplier by supplier_id to get tenant_id and company_name
          let supplierTenantId = null;
          let companyName = null;
          
          if (supplier.supplier_id) {
            try {
              // Check if supplier_id is a UUID (Supplier.id)
              const supplierRecord = await tx.supplier.findUnique({
                where: { id: supplier.supplier_id },
                select: { tenant_id: true, company_name: true },
              });
              
              if (supplierRecord) {
                supplierTenantId = supplierRecord.tenant_id;
                companyName = supplierRecord.company_name;
              } else {
                // Not a UUID, maybe it's a company name or manager_id (legacy)
                companyName = supplier.supplier_id;
              }
            } catch (e) {
              // Invalid UUID format - treat as company name
              companyName = supplier.supplier_id;
            }
          }

          await tx.supplierProduct.create({
            data: {
              tenant_id: tenantId,
              product_id: id,
              supplier_id: supplier.supplier_id ?? null, // Optional - legacy field
              supplier_tenant_id: supplierTenantId,
              company_name: companyName,
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
            } as any,
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

    await this.prisma.$transaction(async (tx: any) => {
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
   * @returns Batch'lar ro'yxati: batch_no, 유효기간, 보관 위치, created_at, 입고 수량
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
        id: true,
        batch_no: true,
        expiry_date: true,
        expiry_months: true,
        expiry_unit: true,
        alert_days: true,
        storage: true,
        created_at: true,
        qty: true,
      },
    });

    // Formatlash: 유효기간 ni yaratish (expiry_date yoki expiry_months + expiry_unit)
    return batches.map(
      (batch: {
        id: string;
        batch_no: string;
        expiry_date: Date | null;
        expiry_months: number | null;
        expiry_unit: string | null;
        alert_days: string | null;
        storage: string | null;
        created_at: Date;
        qty: number;
      }) => ({
        id: batch.id,
        batch_no: batch.batch_no,
        유효기간: batch.expiry_date
          ? batch.expiry_date.toISOString().split("T")[0]
          : batch.expiry_months && batch.expiry_unit
          ? `${batch.expiry_months} ${batch.expiry_unit}`
          : null,
        보관위치: batch.storage ?? null,
        "입고 수량": batch.qty,
        created_at: batch.created_at,
        // Raw fields for batch copying (입고 대기 page uchun)
        expiry_months: batch.expiry_months,
        expiry_unit: batch.expiry_unit,
        alert_days: batch.alert_days,
        storage: batch.storage,
        qty: batch.qty,
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

    return this.prisma.$transaction(async (tx: any) => {
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
          alert_days: dto.alert_days ?? (product as any).alert_days ?? null,
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

      // Return the created batch directly (with batch_no)
      return batch;
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
    tx: any
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

  /**
   * Batch'larni FEFO bo'yicha sortlash
   * 정렬 우선순위: ① 유효기간 → ② 미량 재고 (qty) → ③ 배치번호
   */
  private sortBatchesByFEFO(batches: any[]): any[] {
    return [...batches].sort((a, b) => {
      // 1. 유효기간 (expiry_date) bo'yicha sortlash - oldre olan batches birinchi
      if (a.expiry_date && b.expiry_date) {
        const dateDiff = a.expiry_date.getTime() - b.expiry_date.getTime();
        if (dateDiff !== 0) return dateDiff; // Eng eski (yaqin expiry) birinchi
      } else if (a.expiry_date && !b.expiry_date) {
        return -1; // a.expiry_date bor, b.expiry_date yo'q → a birinchi
      } else if (!a.expiry_date && b.expiry_date) {
        return 1; // b.expiry_date bor, a.expiry_date yo'q → b birinchi
      }

      // 2. 미량 재고 우선 (qty 적은 것 먼저 소진) - kam qty birinchi
      if (a.qty !== b.qty) {
        return a.qty - b.qty; // Kam miqdor birinchi
      }

      // 3. 배치번호 bo'yicha sortlash
      return a.batch_no.localeCompare(b.batch_no);
    });
  }

  /**
   * 유효기간 임박 hisoblash
   * @param expiryDate - 유효기간 sanasi
   * @param alertDays - Ogohlantirish kuni (optional, default: 30)
   * @returns true agar 유효기간 임박 bo'lsa
   */
  private calculateExpiringSoon(
    expiryDate: Date,
    alertDays?: string | null
  ): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Kun boshiga

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // alert_days ni parse qilish (default: 30 kun)
    const alertDaysNum = alertDays ? parseInt(alertDays, 10) : 30;

    // Agar NaN bo'lsa, 30 kun ishlatish
    const finalAlertDays = isNaN(alertDaysNum) ? 30 : alertDaysNum;

    // Agar 유효기간 kelajakda va alert_days ichida bo'lsa → 임박
    return diffDays > 0 && diffDays <= finalAlertDays;
  }

  /**
   * 유효기간 gacha qolgan kunlarni hisoblash
   * @param expiryDate - 유효기간 sanasi
   * @returns Qolgan kunlar soni (agar o'tgan bo'lsa, manfiy raqam)
   */
  private calculateDaysUntilExpiry(expiryDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get distinct storage locations for a tenant
   * @param tenantId - Tenant ID
   * @returns Array of distinct storage location strings
   */
  async getStorages(tenantId: string): Promise<string[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Get warehouse locations from WarehouseLocation table
    const warehouseLocations = await this.prisma.warehouseLocation.findMany({
      where: {
        tenant_id: tenantId,
      },
      select: {
        name: true,
      },
    });

    // Get distinct storage values from Batch table
    const batches = await this.prisma.batch.findMany({
      where: {
        tenant_id: tenantId,
        storage: {
          not: null,
        },
      },
      select: {
        storage: true,
      },
      distinct: ["storage"],
    });

    // Combine both sources
    const warehouseNames = new Set(warehouseLocations.map((w) => w.name));
    const batchStorages = batches
      .map((batch) => batch.storage)
      .filter((storage): storage is string => {
        return storage !== null && storage !== undefined && storage.trim() !== "";
      });

    // Merge and deduplicate
    const allStorages = new Set([...warehouseNames, ...batchStorages]);
    
    // Sort alphabetically
    return Array.from(allStorages).sort((a, b) =>
      a.localeCompare(b, "ko", { sensitivity: "base" })
    );
  }

  /**
   * Get all warehouse locations with full data
   * @param tenantId - Tenant ID
   * @returns Array of warehouse locations with category and items
   */
  async getWarehouseLocations(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const warehouses = await this.prisma.warehouseLocation.findMany({
      where: {
        tenant_id: tenantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      category: w.category,
      items: w.items || [],
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    }));
  }

  /**
   * Add new warehouse location
   * @param tenantId - Tenant ID
   * @param name - Warehouse name
   * @param category - Warehouse category (수면실, 레이저 실, 창고, 기타)
   * @param items - Items in warehouse (A 침대, B 침대, etc.)
   */
  async addWarehouseLocation(
    tenantId: string,
    name: string,
    category: string | null,
    items: string[]
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!name || !name.trim()) {
      throw new BadRequestException("창고 이름은 필수입니다");
    }

    // Check if warehouse already exists
    const existing = await this.prisma.warehouseLocation.findUnique({
      where: {
        tenant_id_name: {
          tenant_id: tenantId,
          name: name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException("이미 존재하는 창고 위치입니다");
    }

    // Create warehouse location
    const warehouse = await this.prisma.warehouseLocation.create({
      data: {
        tenant_id: tenantId,
        name: name.trim(),
        category: category || null,
        items: items || [],
      },
    });

    console.log("Created warehouse:", warehouse);
    console.log("Warehouse items:", warehouse.items);

    return {
      success: true,
      message: "창고 위치가 추가되었습니다",
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        category: warehouse.category,
        items: warehouse.items || [],
        createdAt: warehouse.created_at,
        updatedAt: warehouse.updated_at,
      },
    };
  }
}
