import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { ProductsService } from "../../product/services/products.service";
import { CreateOutboundDto, BulkOutboundDto } from "../dto/create-outbound.dto";

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService
  ) {}

  /**
   * Barcha product'larni batch'lari bilan olish (출고 uchun)
   * FEFO sort va tag'lar bilan
   * @param tenantId - Tenant ID
   * @param search - Search query (product name, brand, batch number)
   */
  async getProductsForOutbound(tenantId: string, search?: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // ProductsService'dan getAllProducts ishlatish (FEFO sort va tag'lar bilan)
    const products = await this.productsService.getAllProducts(tenantId);

    // Agar search query bo'lsa, filter qilish
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      return products
        .map((product: any) => {
          // Product name bo'yicha qidirish
          const nameMatch = product.productName?.toLowerCase().includes(searchLower);
          
          // Brand bo'yicha qidirish
          const brandMatch = product.brand?.toLowerCase().includes(searchLower);
          
          // Barcode bo'yicha qidirish
          const barcodeMatch = product.barcode?.toLowerCase().includes(searchLower);
          
          // Batch number bo'yicha qidirish
          const matchingBatches = product.batches?.filter((batch: any) =>
            batch.batch_no?.toLowerCase().includes(searchLower)
          ) || [];
          const batchMatch = matchingBatches.length > 0;

          // Agar product match qilsa yoki batch match qilsa
          if (nameMatch || brandMatch || barcodeMatch || batchMatch) {
            // Agar batch number bo'yicha qidirilgan bo'lsa, faqat matching batchlarni ko'rsatish
            if (batchMatch) {
              return {
                ...product,
                batches: matchingBatches, // Faqat matching batchlar
              };
            }
            // Agar faqat product name/brand/barcode bo'yicha qidirilgan bo'lsa, barcha batchlarni ko'rsatish
            return product;
          }
          return null;
        })
        .filter((product: any) => product !== null); // Null qiymatlarni olib tashlash
    }

    return products;
  }

  /**
   * Bitta 출고 yaratish
   */
  async createOutbound(dto: CreateOutboundDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Batch mavjudligini va yetarli qty borligini tekshirish
    const batch = await this.prisma.batch.findFirst({
      where: {
        id: dto.batchId,
        product_id: dto.productId,
        tenant_id: tenantId,
      },
    });

    if (!batch) {
      throw new NotFoundException("Batch not found");
    }

    // Validation
    this.validateOutbound(batch, dto.outboundQty);

    return this.prisma.$transaction(async (tx) => {
      // Outbound record yaratish
      const outbound = await (tx as any).outbound.create({
        data: {
          tenant_id: tenantId,
          product_id: dto.productId,
          batch_id: dto.batchId,
          batch_no: batch.batch_no,
          outbound_qty: dto.outboundQty,
          manager_name: dto.managerName,
          patient_name: dto.patientName ?? null,
          chart_number: dto.chartNumber ?? null,
          is_damaged: dto.isDamaged ?? false,
          is_defective: dto.isDefective ?? false,
          memo: dto.memo ?? null,
          created_by: null, // TODO: User ID qo'shish
        },
      });

        // Stock deduction
        await this.deductStock(
          dto.batchId,
          dto.outboundQty,
          dto.productId,
          tenantId,
          tx as any
        );

      return outbound;
    });
  }

  /**
   * Bir nechta 출고 bir vaqtda yaratish (Bulk)
   */
  async createBulkOutbound(dto: BulkOutboundDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("At least one item is required");
    }

    // Barcha batch'larni va product'larni bir vaqtda tekshirish
    const batchIds = dto.items.map((item) => item.batchId);
    const productIds = dto.items.map((item) => item.productId);

    const batches = await this.prisma.batch.findMany({
      where: {
        id: { in: batchIds },
        product_id: { in: productIds },
        tenant_id: tenantId,
      },
    });

    // Validation - har bir item uchun
    for (const item of dto.items) {
      const batch = batches.find(
        (b: { id: string; product_id: string }) =>
          b.id === item.batchId && b.product_id === item.productId
      );
      if (!batch) {
        throw new NotFoundException(
          `Batch not found for product ${item.productId}`
        );
      }
      this.validateOutbound(batch, item.outboundQty);
    }

    return this.prisma.$transaction(async (tx) => {
      const createdOutbounds = [];

      for (const item of dto.items) {
        const batch = batches.find(
          (b: { id: string; product_id: string }) => b.id === item.batchId && b.product_id === item.productId
        );

        // Outbound record yaratish
        const outbound = await (tx as any).outbound.create({
          data: {
            tenant_id: tenantId,
            product_id: item.productId,
            batch_id: item.batchId,
            batch_no: batch!.batch_no,
            outbound_qty: item.outboundQty,
            manager_name: item.managerName,
            patient_name: item.patientName ?? null,
            chart_number: item.chartNumber ?? null,
            is_damaged: item.isDamaged ?? false,
            is_defective: item.isDefective ?? false,
            memo: item.memo ?? null,
            created_by: null, // TODO: User ID qo'shish
          },
        });

        // Stock deduction
        await this.deductStock(
          item.batchId,
          item.outboundQty,
          item.productId,
          tenantId,
          tx as any
        );

        createdOutbounds.push(outbound);
      }

      return {
        success: true,
        count: createdOutbounds.length,
        items: createdOutbounds,
      };
    });
  }

  /**
   * 출고 tarixini olish
   */
  async getOutboundHistory(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      productId?: string;
      page?: number;
      limit?: number;
    }
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
    };

    if (filters?.productId) {
      where.product_id = filters.productId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.outbound_date = {};
      if (filters.startDate) {
        where.outbound_date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.outbound_date.lte = filters.endDate;
      }
    }

    const [outbounds, total] = await Promise.all([
      (this.prisma as any).outbound.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              category: true,
            },
          },
          batch: {
            select: {
              id: true,
              batch_no: true,
              expiry_date: true,
            },
          },
        },
        orderBy: { outbound_date: "desc" },
        skip,
        take: limit,
      }),
      (this.prisma as any).outbound.count({ where }),
    ]);

    return {
      items: outbounds,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Bitta 출고 detail olish
   */
  async getOutbound(id: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const outbound = await (this.prisma as any).outbound.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            unit: true,
          },
        },
        batch: {
          select: {
            id: true,
            batch_no: true,
            expiry_date: true,
            storage: true,
          },
        },
      },
    });

    if (!outbound) {
      throw new NotFoundException("Outbound not found");
    }

    return outbound;
  }

  /**
   * 출고 validation
   */
  private validateOutbound(batch: any, outboundQty: number): void {
    if (outboundQty <= 0) {
      throw new BadRequestException("출고 수량은 0보다 커야 합니다");
    }

    if (batch.qty < outboundQty) {
      throw new BadRequestException(
        `재고가 부족합니다. 현재 재고: ${batch.qty}, 요청 수량: ${outboundQty}`
      );
    }

    if (batch.expiry_date && batch.expiry_date < new Date()) {
      throw new BadRequestException("유효기간이 만료된 제품입니다");
    }
  }

  /**
   * 재고 차감 (Stock deduction)
   */
  private async deductStock(
    batchId: string,
    outboundQty: number,
    productId: string,
    tenantId: string,
    tx: any
  ): Promise<void> {
    // 1. Batch qty ni kamaytirish
    await tx.batch.update({
      where: { id: batchId },
      data: { qty: { decrement: outboundQty } },
    });

    // 2. Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
    const totalStock = await tx.batch.aggregate({
      where: { product_id: productId, tenant_id: tenantId },
      _sum: { qty: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: { current_stock: totalStock._sum.qty ?? 0 },
    });
  }
}
