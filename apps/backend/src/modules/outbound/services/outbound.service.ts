import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { ProductsService } from "../../product/services/products.service";
import { CreateOutboundDto, BulkOutboundDto } from "../dto/create-outbound.dto";
import { PackageOutboundDto } from "../../package/dto/package-outbound.dto";
import { UnifiedOutboundDto, OutboundType } from "../dto/unified-outbound.dto";
import { OrderReturnService } from "../../order-return/order-return.service";

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    @Inject(forwardRef(() => OrderReturnService))
    private readonly orderReturnService: OrderReturnService
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
      include: {
        product: true,
      },
    });

    if (!batch) {
      throw new NotFoundException("Batch not found");
    }

    // Validation
    this.validateOutbound(batch, dto.outboundQty);

    return this.prisma.$transaction(async (tx: any) => {
      // Outbound record yaratish
      const outbound = await tx.outbound.create({
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
      },
      {
        timeout: 30000, // 30 seconds timeout for transaction
      }
    ).then(async (outbound: any) => {
      // If defective, create order return after transaction
      if (dto.isDefective) {
        try {
          await this.orderReturnService.createFromOutbound(tenantId, {
            outboundId: outbound.id,
            items: [{
              batchNo: batch.batch_no,
              productId: dto.productId,
              productName: batch.product?.name || "알 수 없음",
              brand: batch.product?.brand || null,
              returnQuantity: dto.outboundQty,
              totalQuantity: dto.outboundQty,
              unitPrice: batch.product?.sale_price || 0,
            }],
          });
        } catch (error: any) {
          console.error(`Failed to create return for defective product:`, error);
          // Don't fail the outbound if return creation fails
        }
      }
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
      include: {
        product: true,
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

    return this.prisma.$transaction(
      async (tx: any) => {
        const createdOutbounds = [];
        const defectiveItems: any[] = [];
        // Product'larni bir marta yangilash uchun map
        const productStockUpdates = new Map<string, number>();

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
              outbound_type: "제품",
              manager_name: item.managerName,
              patient_name: item.patientName ?? null,
              chart_number: item.chartNumber ?? null,
              is_damaged: item.isDamaged ?? false,
              is_defective: item.isDefective ?? false,
              memo: item.memo ?? null,
              package_id: null,
              created_by: null, // TODO: User ID qo'shish
            },
          });

          // Batch qty ni kamaytirish
          await tx.batch.update({
            where: { id: item.batchId },
            data: { qty: { decrement: item.outboundQty } },
          });

          // Product stock yangilash uchun yig'ish
          const currentDecrement = productStockUpdates.get(item.productId) || 0;
          productStockUpdates.set(item.productId, currentDecrement + item.outboundQty);

          createdOutbounds.push(outbound);

          // If defective, create order return (after transaction)
          if (item.isDefective) {
            // Store for later processing after transaction
            defectiveItems.push({
              outboundId: outbound.id,
              batchNo: batch!.batch_no,
              productId: item.productId,
              productName: batch!.product?.name || "알 수 없음",
              brand: batch!.product?.brand || null,
              returnQuantity: item.outboundQty,
              totalQuantity: item.outboundQty,
              unitPrice: batch!.product?.sale_price || 0,
            });
          }
        }

        // Barcha product'larni bir vaqtda yangilash
        for (const [productId, totalDecrement] of productStockUpdates.entries()) {
          // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
          const totalStock = await tx.batch.aggregate({
            where: { product_id: productId, tenant_id: tenantId },
            _sum: { qty: true },
          });

          await tx.product.update({
            where: { id: productId },
            data: { current_stock: totalStock._sum.qty ?? 0 },
          });
        }

        return {
          success: true,
          count: createdOutbounds.length,
          items: createdOutbounds,
          defectiveItems, // Return defective items for processing
        };
      },
      {
        timeout: 30000, // 30 seconds timeout for transaction
      }
    ).then(async (result: any) => {
      // Process defective items after transaction
      if (result.defectiveItems && result.defectiveItems.length > 0) {
        for (const defectiveItem of result.defectiveItems) {
          try {
            await this.orderReturnService.createFromOutbound(tenantId, {
              outboundId: defectiveItem.outboundId,
              items: [{
                batchNo: defectiveItem.batchNo,
                productId: defectiveItem.productId,
                productName: defectiveItem.productName,
                brand: defectiveItem.brand,
                returnQuantity: defectiveItem.returnQuantity,
                totalQuantity: defectiveItem.totalQuantity,
                unitPrice: defectiveItem.unitPrice,
              }],
            });
          } catch (error: any) {
            console.error(`Failed to create return for defective product:`, error);
            // Don't fail the outbound if return creation fails
          }
        }
      }
      return result;
    });
  }

  /**
   * 출고 내역 조회
   * 기간별, 담당자별, 제품/패키지별로 조회 및 관리
   * 검색어(제품명, 출고자 등), 시간차 순서, 패키지 출고와 단품 출고 구분 표시
   */
  async getOutboundHistory(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      productId?: string;
      packageId?: string;
      managerName?: string;
      outboundType?: string; // 제품, 패키지, 바코드
      search?: string; // 검색어 (제품명, 출고자 등)
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

    // 기간별 조회
    if (filters?.startDate || filters?.endDate) {
      where.outbound_date = {};
      if (filters.startDate) {
        where.outbound_date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.outbound_date.lte = filters.endDate;
      }
    }

    // 제품별 조회
    if (filters?.productId) {
      where.product_id = filters.productId;
    }

    // 패키지별 조회
    if (filters?.packageId) {
      where.package_id = filters.packageId;
    }

    // 담당자별 조회
    if (filters?.managerName) {
      where.manager_name = {
        contains: filters.managerName,
        mode: "insensitive",
      };
    }

    // 출고 타입별 조회 (패키지 출고와 단품 출고 구분)
    if (filters?.outboundType) {
      where.outbound_type = filters.outboundType;
    }

    // 검색어 (제품명, 출고자 등)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase().trim();
      where.OR = [
        {
          product: {
            name: {
              contains: searchLower,
              mode: "insensitive",
            },
          },
        },
        {
          product: {
            brand: {
              contains: searchLower,
              mode: "insensitive",
            },
          },
        },
        {
          manager_name: {
            contains: searchLower,
            mode: "insensitive",
          },
        },
        {
          patient_name: {
            contains: searchLower,
            mode: "insensitive",
          },
        },
        {
          batch: {
            batch_no: {
              contains: searchLower,
              mode: "insensitive",
            },
          },
        },
      ];
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
              sale_price: true,
              unit: true,
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
        orderBy: { outbound_date: "desc" }, // 시간차 순서 (최신순)
        skip,
        take: limit,
      }),
      (this.prisma as any).outbound.count({ where }),
    ]);

    // Package nomlarini alohida olish (package_id mavjud bo'lgan outbound'lar uchun)
    const packageIds = outbounds
      .filter((outbound: any) => outbound.package_id)
      .map((outbound: any) => outbound.package_id);
    
    const packagesMap: Record<string, string> = {};
    if (packageIds.length > 0) {
      const packages = await (this.prisma as any).package.findMany({
        where: {
          id: { in: packageIds },
          tenant_id: tenantId,
        },
        select: {
          id: true,
          name: true,
        },
      });
      
      packages.forEach((pkg: any) => {
        packagesMap[pkg.id] = pkg.name;
      });
    }

    // Response format - 패키지 출고와 단품 출고 구분 표시
    return {
      items: outbounds.map((outbound: any) => ({
        id: outbound.id,
        outboundType: outbound.outbound_type || "제품", // 패키지 출고와 단품 출고 구분
        outboundDate: outbound.outbound_date,
        outboundQty: outbound.outbound_qty,
        managerName: outbound.manager_name,
        patientName: outbound.patient_name,
        chartNumber: outbound.chart_number,
        memo: outbound.memo,
        isDamaged: outbound.is_damaged,
        isDefective: outbound.is_defective,
        packageId: outbound.package_id,
        packageName: outbound.package_id ? packagesMap[outbound.package_id] || null : null, // 패키지 출고인 경우 패키지명
        product: {
          id: outbound.product?.id,
          name: outbound.product?.name,
          brand: outbound.product?.brand,
          category: outbound.product?.category,
          salePrice: outbound.product?.sale_price,
          unit: outbound.product?.unit,
        },
        batch: {
          id: outbound.batch?.id,
          batchNo: outbound.batch?.batch_no,
          expiryDate: outbound.batch?.expiry_date,
        },
        createdAt: outbound.created_at,
        updatedAt: outbound.updated_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 출고 상세 정보 (수량·담당자·사유 등)
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
            sale_price: true,
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

    // 상세 정보 format - 패키지 출고와 단품 출고 구분 표시
    return {
      id: outbound.id,
      outboundType: outbound.outbound_type || "제품", // 패키지 출고와 단품 출고 구분
      outboundDate: outbound.outbound_date,
      outboundQty: outbound.outbound_qty,
      managerName: outbound.manager_name,
      patientName: outbound.patient_name,
      chartNumber: outbound.chart_number,
      memo: outbound.memo,
      isDamaged: outbound.is_damaged,
      isDefective: outbound.is_defective,
      packageId: outbound.package_id,
      product: {
        id: outbound.product?.id,
        name: outbound.product?.name,
        brand: outbound.product?.brand,
        category: outbound.product?.category,
        unit: outbound.product?.unit,
        salePrice: outbound.product?.sale_price,
      },
      batch: {
        id: outbound.batch?.id,
        batchNo: outbound.batch?.batch_no,
        expiryDate: outbound.batch?.expiry_date,
        storage: outbound.batch?.storage,
      },
      createdAt: outbound.created_at,
      updatedAt: outbound.updated_at,
      createdBy: outbound.created_by,
    };
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
   * 패키지 출고 처리
   * 각 구성품의 출고 수량은 재고 DB에 개별 반영됨
   */
  async createPackageOutbound(
    dto: PackageOutboundDto,
    tenantId: string
  ) {
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
    const failedItems: PackageOutboundDto["items"] = [];
    const validItems: PackageOutboundDto["items"] = [];

    for (const item of dto.items) {
      const batch = batches.find(
        (b: { id: string; product_id: string }) =>
          b.id === item.batchId && b.product_id === item.productId
      );
      if (!batch) {
        failedItems.push(item);
        continue;
      }
      try {
        this.validateOutbound(batch, item.outboundQty);
        validItems.push(item);
      } catch (error) {
        failedItems.push(item);
      }
    }

    // Agar barcha itemlar failed bo'lsa
    if (validItems.length === 0) {
      return {
        success: false,
        message: "All items failed validation",
        failedItems,
        outboundIds: [],
      };
    }

    return this.prisma.$transaction(
      async (tx: any) => {
        const createdOutbounds: any[] = [];
        // Product'larni bir marta yangilash uchun map
        const productStockUpdates = new Map<string, number>();

        for (const item of validItems) {
          const batch = batches.find(
            (b: { id: string; product_id: string }) =>
              b.id === item.batchId && b.product_id === item.productId
          );

          // Outbound record yaratish
          const outbound = await (tx as any).outbound.create({
            data: {
              tenant_id: tenantId,
              product_id: item.productId,
              batch_id: item.batchId,
              batch_no: batch!.batch_no,
              outbound_qty: item.outboundQty,
              outbound_type: "패키지",
              manager_name: dto.managerName,
              patient_name: dto.patientName ?? null,
              chart_number: dto.chartNumber ?? null,
              is_damaged: false,
              is_defective: false,
              memo: dto.memo ?? null,
              package_id: null,
              created_by: null, // TODO: User ID qo'shish
            },
          });

          // Batch qty ni kamaytirish
          await tx.batch.update({
            where: { id: item.batchId },
            data: { qty: { decrement: item.outboundQty } },
          });

          // Product stock yangilash uchun yig'ish
          const currentDecrement = productStockUpdates.get(item.productId) || 0;
          productStockUpdates.set(item.productId, currentDecrement + item.outboundQty);

          createdOutbounds.push(outbound);
        }

        // Barcha product'larni bir vaqtda yangilash
        for (const [productId, totalDecrement] of productStockUpdates.entries()) {
          // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
          const totalStock = await tx.batch.aggregate({
            where: { product_id: productId, tenant_id: tenantId },
            _sum: { qty: true },
          });

          await tx.product.update({
            where: { id: productId },
            data: { current_stock: totalStock._sum.qty ?? 0 },
          });
        }

        return {
          success: true,
          outboundIds: createdOutbounds.map((o: any) => o.id),
          failedItems: failedItems.length > 0 ? failedItems : undefined,
          message:
            failedItems.length > 0
            ? `${validItems.length} items processed successfully, ${failedItems.length} items failed`
            : "All items processed successfully",
      };
    },
      {
        timeout: 30000, // 30 seconds timeout for transaction
      }
    );
  }

  /**
   * 통합 출고 처리 (Unified Outbound)
   * 모든 출고 타입(제품, 패키지, 바코드)을 통합 처리함
   * - 출고 예정 리스트를 최종 검토 후 실제 출고를 확정
   * - 재고 DB 차감 반영
   * - 출고 로그 생성 (출고타입, 시간, 담당자 등)
   * - 오류 발생 시 실패 리스트 출력
   */
  async createUnifiedOutbound(
    dto: UnifiedOutboundDto,
    tenantId: string
  ) {
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
    const failedItems: UnifiedOutboundDto["items"] = [];
    const validItems: UnifiedOutboundDto["items"] = [];

    for (const item of dto.items) {
      const batch = batches.find(
        (b: any) =>
          b.id === item.batchId && b.product_id === item.productId
      ) as any;
      if (!batch) {
        failedItems.push(item);
        continue;
      }
      try {
        // Validate with actual batch qty (no reservation logic)
        this.validateOutbound(batch, item.outboundQty);
        validItems.push(item);
      } catch (error) {
        failedItems.push(item);
      }
    }

    // Agar barcha itemlar failed bo'lsa
    if (validItems.length === 0) {
      return {
        success: false,
        message: "All items failed validation",
        failedItems,
        outboundIds: [],
        logs: [],
      };
    }

    return this.prisma.$transaction(
      async (tx: any) => {
        const createdOutbounds: any[] = [];
        const logs: any[] = [];
        // Product'larni bir marta yangilash uchun map
        const productStockUpdates: Map<string, number> = new Map<string, number>();

        for (const item of validItems) {
        const batch = batches.find(
          (b: any) =>
            b.id === item.batchId && b.product_id === item.productId
        ) as any;

        if (!batch) {
          failedItems.push(item);
          continue;
        }

        try {
          // Outbound record yaratish
          const outbound = await (tx as any).outbound.create({
            data: {
              tenant_id: tenantId,
              product_id: item.productId,
              batch_id: item.batchId,
              batch_no: batch.batch_no,
              outbound_qty: item.outboundQty,
              outbound_type: dto.outboundType,
              manager_name: dto.managerName,
              patient_name: dto.patientName ?? null,
              chart_number: dto.chartNumber ?? null,
              is_damaged: false,
              is_defective: false,
              memo: dto.memo ?? null,
              package_id: item.packageId ?? null,
              created_by: null, // TODO: User ID qo'shish
            },
          });

          // Batch qty ni kamaytirish
          await tx.batch.update({
            where: { id: item.batchId },
            data: { qty: { decrement: item.outboundQty } },
          });

          // Product stock yangilash uchun yig'ish
          const currentDecrement = productStockUpdates.get(item.productId) || 0;
          productStockUpdates.set(item.productId, currentDecrement + item.outboundQty);

          // 출고 로그 생성
          const log = {
            outboundId: outbound.id,
            outboundType: dto.outboundType,
            timestamp: new Date().toISOString(),
            managerName: dto.managerName,
            productId: item.productId,
            batchId: item.batchId,
            batchNo: batch.batch_no,
            quantity: item.outboundQty,
            status: "success",
          };
          logs.push(log);

          createdOutbounds.push(outbound);
        } catch (error) {
          // Transaction ichida xato bo'lsa, itemni failed qilish
          console.error(`Failed to process outbound for item ${item.productId}:`, error);
          failedItems.push(item);
          logs.push({
            outboundId: null,
            outboundType: dto.outboundType,
            timestamp: new Date().toISOString(),
            managerName: dto.managerName,
            productId: item.productId,
            batchId: item.batchId,
            batchNo: batch.batch_no,
            quantity: item.outboundQty,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      // Package outbound - hech narsa qo'shimcha qilmaslik
      // Stock to'g'ridan-to'g'ri batch'lardan kamayadi (yuqorida)

      // Barcha product'larni bir vaqtda yangilash
      for (const [productId, totalDecrement] of productStockUpdates.entries()) {
        // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
        const totalStock = await tx.batch.aggregate({
          where: { product_id: productId, tenant_id: tenantId },
          _sum: { qty: true },
        });

        await tx.product.update({
          where: { id: productId },
          data: { current_stock: totalStock._sum.qty ?? 0 },
        });
      }

      // 실패한 항목lar uchun log
      for (const item of failedItems) {
        logs.push({
          outboundId: null,
          outboundType: dto.outboundType,
          timestamp: new Date().toISOString(),
          managerName: dto.managerName,
          productId: item.productId,
          batchId: item.batchId,
          batchNo: null,
          quantity: item.outboundQty,
          status: "failed",
          error: "Validation failed",
        });
      }

        return {
          success: true,
          outboundIds: createdOutbounds.map((o: any) => o.id),
          failedItems: failedItems.length > 0 ? failedItems : undefined,
          logs,
          message:
            failedItems.length > 0
              ? `${validItems.length} items processed successfully, ${failedItems.length} items failed`
              : "All items processed successfully",
        };
      },
      {
        maxWait: 10000, // 10 seconds max wait for transaction
        timeout: 30000, // 30 seconds timeout for transaction
      }
    );
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

  /**
   * 출고 취소 - 특정 시간의 출고 건들을 취소 및 재고 복원
   */
  async cancelOutboundByTimestamp(
    outboundTimestamp: string,
    managerName: string,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Parse the timestamp (ISO string)
    const targetDate = new Date(outboundTimestamp);
    
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException("Invalid timestamp format");
    }

    // Create a very narrow time window (±2 seconds for exact match)
    const startWindow = new Date(targetDate.getTime() - 2000); // -2 seconds
    const endWindow = new Date(targetDate.getTime() + 2000); // +2 seconds

    console.log("Canceling outbound:", {
      targetTimestamp: targetDate.toISOString(),
      managerName,
      startWindow: startWindow.toISOString(),
      endWindow: endWindow.toISOString(),
    });

    // Find all outbound records for this specific time and manager
    const outbounds = await this.prisma.outbound.findMany({
      where: {
        tenant_id: tenantId,
        manager_name: managerName,
        outbound_date: {
          gte: startWindow,
          lte: endWindow,
        },
      },
      include: {
        product: true,
        batch: true,
      },
    });

    console.log(`Found ${outbounds.length} outbound records to cancel`);

    if (outbounds.length === 0) {
      throw new NotFoundException("출고 내역을 찾을 수 없습니다.");
    }

    // Transaction으로 재고 복원 및 출고 기록 삭제
    return this.prisma.$transaction(async (tx: any) => {
      const productStockUpdates = new Map<string, number>();

      // 각 출고 건에 대해 재고 복원
      for (const outbound of outbounds) {
        // Batch qty 증가
        await tx.batch.update({
          where: { id: outbound.batch_id },
          data: { qty: { increment: outbound.outbound_qty } },
        });

        // Product stock 업데이트를 위해 수집
        const currentIncrement = productStockUpdates.get(outbound.product_id) || 0;
        productStockUpdates.set(
          outbound.product_id,
          currentIncrement + outbound.outbound_qty
        );
      }

      // Product current_stock 업데이트
      for (const [productId, _] of productStockUpdates.entries()) {
        const totalStock = await tx.batch.aggregate({
          where: { product_id: productId, tenant_id: tenantId },
          _sum: { qty: true },
        });

        await tx.product.update({
          where: { id: productId },
          data: { current_stock: totalStock._sum.qty ?? 0 },
        });
      }

      // 출고 기록 삭제
      await tx.outbound.deleteMany({
        where: {
          tenant_id: tenantId,
          manager_name: managerName,
          outbound_date: {
            gte: startWindow,
            lte: endWindow,
          },
        },
      });

      console.log(`Successfully canceled ${outbounds.length} outbound records`);

      return {
        success: true,
        canceledCount: outbounds.length,
        message: `${outbounds.length}개의 출고 건이 취소되었고 재고가 복원되었습니다.`,
      };
    });
  }
}
