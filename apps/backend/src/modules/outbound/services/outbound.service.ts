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
import { ReturnRepository } from "../../return/repositories/return.repository";
import { CacheManager } from "../../../common/cache";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class OutboundService {
  // ✅ Replaced Map with CacheManager
  private productsForOutboundCache: CacheManager<any[]>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    @Inject(forwardRef(() => OrderReturnService))
    private readonly orderReturnService: OrderReturnService,
    private readonly returnRepository: ReturnRepository,
    private readonly configService: ConfigService
  ) {
    // Initialize CacheManagers
    this.productsForOutboundCache = new CacheManager({
      maxSize: 100,
      ttl: 30000, // 30 seconds
      cleanupInterval: 60000,
      name: "OutboundService:Products",
    });
  }

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

    // Check cache first
    const cacheKey = `${tenantId}:${search || ""}`;
    const cachedData =
      this.productsForOutboundCache.getWithStaleCheck(cacheKey);

    if (cachedData) {
      if (cachedData.isStale) {
        // Stale cache - background'da yangilash
        this.refreshProductsForOutboundCacheInBackground(
          tenantId,
          search
        ).catch(() => {});
      }
      return cachedData.data; // Return cached data (fresh or stale)
    }

    // ProductsService'dan getAllProducts ishlatish (FEFO sort va tag'lar bilan)
    const products = await this.productsService.getAllProducts(tenantId);

    let result: any[];

    // Agar search query bo'lsa, filter qilish
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      result = products
        .map((product: any) => {
          // Product name bo'yicha qidirish
          const nameMatch = product.productName
            ?.toLowerCase()
            .includes(searchLower);

          // Brand bo'yicha qidirish
          const brandMatch = product.brand?.toLowerCase().includes(searchLower);

          // Barcode bo'yicha qidirish
          const barcodeMatch = product.barcode
            ?.toLowerCase()
            .includes(searchLower);

          // Batch number bo'yicha qidirish
          const matchingBatches =
            product.batches?.filter((batch: any) =>
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
    } else {
      result = products;
    }

    // Update cache
    this.productsForOutboundCache.set(cacheKey, result);

    return result;
  }

  /**
   * Invalidate products cache for a tenant
   * Public method to allow ProductsService to invalidate outbound cache
   */
  public invalidateProductsCache(tenantId: string) {
    // ✅ Clear ALL cache entries for this tenant using deletePattern
    const deleted = this.productsForOutboundCache.deletePattern(
      `^${tenantId}:`
    );

    // ✅ CRITICAL: Also clear ProductsService cache since getProductsForOutbound uses getAllProducts
    // This ensures fresh data from database after outbound creation
    if (this.productsService) {
      try {
        // Access ProductsService's private cache using bracket notation
        const productsService = this.productsService as any;
        const productsCache = productsService.productsCache;

        if (productsCache && productsCache.delete) {
          // ProductsService uses cache key format: "products:${tenantId}"
          const productsCacheKey = `products:${tenantId}`;
          productsCache.delete(productsCacheKey);
          console.log(
            `[OutboundService] ProductsService cache invalidated: ${productsCacheKey}`
          );
        }
      } catch (error) {
        // If cache doesn't exist or method doesn't exist, log warning but continue
        console.warn(
          `[OutboundService] Could not invalidate ProductsService cache:`,
          error
        );
      }
    }
  }
  private async refreshProductsForOutboundCacheInBackground(
    tenantId: string,
    search?: string
  ): Promise<void> {
    try {
      const products = await this.productsService.getAllProducts(tenantId);

      let result: any[];
      // Agar search query bo'lsa, filter qilish
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        result = products
          .map((product: any) => {
            // Product name bo'yicha qidirish
            const nameMatch = product.productName
              ?.toLowerCase()
              .includes(searchLower);

            // Brand bo'yicha qidirish
            const brandMatch = product.brand
              ?.toLowerCase()
              .includes(searchLower);

            // Barcode bo'yicha qidirish
            const barcodeMatch = product.barcode
              ?.toLowerCase()
              .includes(searchLower);

            // Batch number bo'yicha qidirish
            const matchingBatches =
              product.batches?.filter((batch: any) =>
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
      } else {
        result = products;
      }

      const cacheKey = `${tenantId}:${search || ""}`;
      this.productsForOutboundCache.set(cacheKey, result);
    } catch (error) {
      // Error handling
    }
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
        product: {
          include: {
            returnPolicy: {
              select: {
                is_returnable: true,
                refund_amount: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException("Batch not found");
    }

    // Validation
    this.validateOutbound(batch, dto.outboundQty);

    return this.prisma
      .$transaction(
        async (tx: any) => {
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

          // 사용 단위 mantiqi: used_count yangilash va bo'sh box aniqlash
          const product = batch.product;

          let batchQtyDecrement = dto.outboundQty; // Default: to'g'ridan-to'g'ri kamaytirish

          if (
            product &&
            product.usage_capacity &&
            product.usage_capacity > 0 &&
            product.capacity_per_product &&
            product.capacity_per_product > 0
          ) {
            // Batch'ning hozirgi used_count'ini olish (yangilanishdan oldin)
            const currentBatch = await tx.batch.findUnique({
              where: { id: dto.batchId },
              select: { used_count: true, qty: true },
            });

            const currentUsedCount = currentBatch?.used_count || 0;
            const currentBatchQty = currentBatch?.qty || 0;

            // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
            // Masalan: outboundQty = 5, usage_capacity = 1 → usageIncrement = 5 (1 * 5)
            const usageIncrement = product.usage_capacity * dto.outboundQty;
            const newUsedCount = currentUsedCount + usageIncrement;

            // Bo'sh box aniqlash: yangilanishdan oldin va keyin
            const previousEmptyBoxes = Math.floor(
              currentUsedCount / product.capacity_per_product
            );
            const newEmptyBoxes = Math.floor(
              newUsedCount / product.capacity_per_product
            );
            const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

            // ✅ YANGI: Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
            // Masalan: capacity_per_product = 5, outboundQty = 5, usage_capacity = 1
            // usageIncrement = 5, emptyBoxesToCreate = 1
            // batchQtyDecrement = 1 box (5 emas!)
            // ✅ Manfiy bo'lmasligi kerak (agar manfiy bo'lsa, 0 qilamiz)
            batchQtyDecrement = Math.max(0, emptyBoxesToCreate);

            // used_count ni yangilash
            const updatedBatch = await tx.batch.update({
              where: { id: dto.batchId },
              data: { used_count: newUsedCount },
            });

            // Empty box'lar avtomatik Return jadvaliga yozilmaydi
            // Ular faqat Return page'da ko'rsatiladi va user xohlagan paytda return qiladi
          }

          // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)
          await tx.batch.update({
            where: { id: dto.batchId },
            data: { qty: { decrement: batchQtyDecrement } },
          });

          // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
          const totalStock = await tx.batch.aggregate({
            where: { product_id: dto.productId, tenant_id: tenantId },
            _sum: { qty: true },
          });

          await tx.product.update({
            where: { id: dto.productId },
            data: { current_stock: totalStock._sum.qty ?? 0 },
          });

          return outbound;
        },
        {
          timeout: 30000, // 30 seconds timeout for transaction
        }
      )
      .then(async (outbound: any) => {
        // If defective, create order return after transaction
        if (dto.isDefective) {
          try {
            await this.orderReturnService.createFromOutbound(tenantId, {
              outboundId: outbound.id,
              items: [
                {
                  batchNo: batch.batch_no,
                  productId: dto.productId,
                  productName: batch.product?.name || "알 수 없음",
                  brand: batch.product?.brand || null,
                  returnQuantity: dto.outboundQty,
                  totalQuantity: dto.outboundQty,
                  unitPrice: batch.product?.sale_price || 0,
                },
              ],
            });
          } catch (error: any) {
            console.error(
              `Failed to create return for defective product:`,
              error
            );
            // Don't fail the outbound if return creation fails
          }
        }
        // Invalidate caches after successful outbound creation
        this.invalidateProductsCache(tenantId);
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

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenant_id: tenantId,
      },
      select: {
        id: true,
        capacity_per_product: true,
        usage_capacity: true,
        returnPolicy: {
          select: {
            is_returnable: true,
            refund_amount: true,
          },
        },
      },
    });

    const productMap = new Map(products.map((p: any) => [p.id, p]));

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

    return this.prisma
      .$transaction(
        async (tx: any) => {
          const createdOutbounds = [];
          const defectiveItems: any[] = [];
          // Product'larni bir marta yangilash uchun map
          const productStockUpdates = new Map<string, number>();

          for (const item of dto.items) {
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

            // 사용 단위 mantiqi: used_count yangilash va bo'sh box aniqlash
            const product = productMap.get(item.productId);

            let batchQtyDecrement = item.outboundQty; // Default: to'g'ridan-to'g'ri kamaytirish

            if (
              product &&
              product.usage_capacity &&
              product.usage_capacity > 0 &&
              product.capacity_per_product &&
              product.capacity_per_product > 0
            ) {
              // Batch'ning hozirgi used_count'ini olish (yangilanishdan oldin)
              const currentBatch = await tx.batch.findUnique({
                where: { id: item.batchId },
                select: { used_count: true, qty: true },
              });

              const currentUsedCount = currentBatch?.used_count || 0;
              const currentBatchQty = currentBatch?.qty || 0;

              // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
              // Masalan: outboundQty = 5, usage_capacity = 1 → usageIncrement = 5 (1 * 5)
              const usageIncrement = product.usage_capacity * item.outboundQty;
              const newUsedCount = currentUsedCount + usageIncrement;

              console.log(`🔍 [Bulk Outbound] Batch ${item.batchId}:`, {
                productId: item.productId,
                currentUsedCount,
                outboundQty: item.outboundQty,
                usageCapacity: product.usage_capacity,
                capacityPerProduct: product.capacity_per_product,
                usageIncrement,
                newUsedCount,
                currentBatchQty,
              });

              // Bo'sh box aniqlash: yangilanishdan oldin va keyin
              const previousEmptyBoxes = Math.floor(
                currentUsedCount / product.capacity_per_product
              );
              const newEmptyBoxes = Math.floor(
                newUsedCount / product.capacity_per_product
              );
              const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

              // ✅ YANGI: Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
              // Masalan: capacity_per_product = 5, outboundQty = 5, usage_capacity = 1
              // usageIncrement = 5, emptyBoxesToCreate = 1
              // batchQtyDecrement = 1 box (5 emas!)
              // ✅ Manfiy bo'lmasligi kerak (agar manfiy bo'lsa, 0 qilamiz)
              batchQtyDecrement = Math.max(0, emptyBoxesToCreate);

              console.log(`🔍 [Bulk Outbound] Empty boxes calculation:`, {
                previousEmptyBoxes,
                newEmptyBoxes,
                emptyBoxesToCreate,
                batchQtyDecrement,
              });

              // used_count ni yangilash
              const updatedBatch = await tx.batch.update({
                where: { id: item.batchId },
                data: { used_count: newUsedCount },
              });

              // Empty box'lar avtomatik Return jadvaliga yozilmaydi
              // Ular faqat Return page'da ko'rsatiladi va user xohlagan paytda return qiladi
            }

            // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)

            const batchBeforeUpdate = await tx.batch.findUnique({
              where: { id: item.batchId },
              select: { qty: true, used_count: true },
            });

            await tx.batch.update({
              where: { id: item.batchId },
              data: { qty: { decrement: batchQtyDecrement } },
            });

            const batchAfterUpdate = await tx.batch.findUnique({
              where: { id: item.batchId },
              select: { qty: true, used_count: true },
            });

            console.log(`📊 [Bulk Outbound] Qty update result:`, {
              before: batchBeforeUpdate,
              after: batchAfterUpdate,
              decrement: batchQtyDecrement,
            });

            // Product stock yangilash uchun yig'ish (to'liq ishlatilgan box'lar yoki default)
            const currentDecrement =
              productStockUpdates.get(item.productId) || 0;
            productStockUpdates.set(
              item.productId,
              currentDecrement + batchQtyDecrement
            );

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
          for (const [
            productId,
            totalDecrement,
          ] of productStockUpdates.entries()) {
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
      )
      .then(async (result: any) => {
        // Process defective items after transaction
        if (result.defectiveItems && result.defectiveItems.length > 0) {
          for (const defectiveItem of result.defectiveItems) {
            try {
              await this.orderReturnService.createFromOutbound(tenantId, {
                outboundId: defectiveItem.outboundId,
                items: [
                  {
                    batchNo: defectiveItem.batchNo,
                    productId: defectiveItem.productId,
                    productName: defectiveItem.productName,
                    brand: defectiveItem.brand,
                    returnQuantity: defectiveItem.returnQuantity,
                    totalQuantity: defectiveItem.totalQuantity,
                    unitPrice: defectiveItem.unitPrice,
                  },
                ],
              });
            } catch (error: any) {
              console.error(
                `Failed to create return for defective product:`,
                error
              );
              // Don't fail the outbound if return creation fails
            }
          }
        }
        // Invalidate caches after successful bulk outbound creation
        if (result.success) {
          this.invalidateProductsCache(tenantId);
        }
        return result;
      });
  }

  /**
   * 출고 내역 조회
   * 기간별, 담당자별, 제품/패키지별로 조회 및 관리
   * 검색어(제품명, 출고자 등), 시간차 순서, 패키지 출고와 단품 출고 구분 표시
   */
  /**
   * Build where clause for outbound queries (helper function to avoid duplication)
   */
  private buildOutboundWhereClause(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      productId?: string;
      packageId?: string;
      managerName?: string;
      outboundType?: string;
      search?: string;
    },
    isPackageOutbound: boolean = false // ✅ PackageOutbound uchun patient_name ni exclude qilish
  ): any {
    const where: any = {
      tenant_id: tenantId,
    };

    // ✅ .env dan retention period o'qib olish (default: 1 yil)
    const retentionYears = parseInt(
      this.configService.get<string>("OUTBOUND_HISTORY_RETENTION_YEARS") || "1",
      10
    );

    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() - retentionYears);

    // Agar user startDate kiritmagan bo'lsa, retention period chegarasini qo'llash
    if (!filters?.startDate) {
      where.outbound_date = {
        gte: retentionDate, // Retention period'dan keyingi ma'lumotlar
      };
    }

    if (filters?.startDate || filters?.endDate) {
      where.outbound_date = {
        // Agar user startDate kiritgan bo'lsa, uni ishlatish
        // Lekin agar u retentionDate'dan eski bo'lsa, retentionDate'ni qo'llash
        gte:
          filters?.startDate && filters.startDate >= retentionDate
            ? filters.startDate
            : retentionDate,
        ...(filters.endDate && { lte: filters.endDate }),
      };
    } else {
      // Agar user hech qanday sana kiritmagan bo'lsa, retention period chegarasini qo'llash
      where.outbound_date = {
        gte: retentionDate,
      };
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

    // 출고 타입별 조회
    if (filters?.outboundType) {
      where.outbound_type = filters.outboundType;
    }

    // 검색어 (제품명, 출고자, 차트번호 등)
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
        // ✅ 차트번호 (Chart Number) qidirish
        {
          chart_number: {
            contains: searchLower,
            mode: "insensitive",
          },
        },
        // ✅ patient_name faqat Outbound uchun (PackageOutbound da yo'q)
        ...(isPackageOutbound
          ? []
          : [
              {
                patient_name: {
                  contains: searchLower,
                  mode: "insensitive",
                },
              },
            ]),
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

    return where;
  }

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
      capacity_unit?: string;
    }
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build where clause once (reused for all queries)
    const where = this.buildOutboundWhereClause(tenantId, filters, false); // Outbound uchun

    // Build where clause for PackageOutbound (patient_name ni exclude qilish)
    const packageOutboundWhere = this.buildOutboundWhereClause(
      tenantId,
      filters,
      true // ✅ PackageOutbound uchun - patient_name ni exclude qiladi
    );

    // Parallel fetching - all queries at once
    const [outbounds, packageOutbounds, outboundTotal, packageOutboundTotal] =
      await Promise.all([
        // Regular outbounds (제품 출고)
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).outbound.findMany({
            where,
            select: {
              id: true,
              tenant_id: true,
              product_id: true,
              batch_id: true,
              batch_no: true,
              outbound_qty: true,
              outbound_date: true,
              manager_name: true,
              patient_name: true,
              chart_number: true,
              memo: true,
              created_at: true,
              updated_at: true,
              is_damaged: true,
              is_defective: true,
              outbound_type: true,
              package_id: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  category: true,
                  sale_price: true,
                  unit: true,
                  capacity_unit: true,
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
          });
        }),
        // Package outbounds (패키지 출고) - package items already included
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).packageOutbound.findMany({
            where: packageOutboundWhere,
            select: {
              id: true,
              tenant_id: true,
              package_id: true,
              package_name: true,
              product_id: true,
              batch_id: true,
              package_qty: true,
              outbound_date: true,
              manager_name: true,
              chart_number: true,
              memo: true,
              created_at: true,
              is_damaged: true,
              is_defective: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  category: true,
                  sale_price: true,
                  unit: true,
                  capacity_unit: true,
                },
              },
              batch: {
                select: {
                  id: true,
                  batch_no: true,
                  expiry_date: true,
                },
              },
              package: {
                select: {
                  id: true,
                  name: true,
                  items: {
                    select: {
                      product_id: true,
                      quantity: true,
                      product: {
                        select: {
                          id: true,
                          name: true,
                          brand: true,
                          unit: true,
                          capacity_unit: true,
                          sale_price: true,
                        },
                      },
                    },
                    orderBy: {
                      order: "asc",
                    },
                  },
                },
              },
            },
            orderBy: { outbound_date: "desc" },
            skip,
            take: limit,
          });
        }),
        // Count queries (parallel)
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).outbound.count({ where });
        }),
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).packageOutbound.count({
            where: packageOutboundWhere,
          });
        }),
      ]);

    // Combine and sort all outbounds (both Outbound and PackageOutbound)
    // Note: Already sorted by outbound_date desc in queries, so we just combine
    const allOutbounds = [
      ...outbounds.map((outbound: any) => ({
        ...outbound,
        _type: "outbound" as const,
      })),
      ...packageOutbounds.map((pkgOutbound: any) => ({
        ...pkgOutbound,
        _type: "packageOutbound" as const,
      })),
    ]
      .sort((a, b) => {
        // Secondary sort in case of same date (shouldn't happen with pagination)
        const dateA = new Date(a.outbound_date).getTime();
        const dateB = new Date(b.outbound_date).getTime();
        return dateB - dateA; // 최신순
      })
      .slice(0, limit); // Pagination (already paginated, but ensure limit)

    const total = outboundTotal + packageOutboundTotal;

    // Response format - 패키지 출고와 단품 출고 구분 표시
    const result = {
      items: allOutbounds.map((item: any) => {
        if (item._type === "packageOutbound") {
          // PackageOutbound record
          // package_qty is the number of packages outbounded
          // For display, we'll show package_qty, but actual product quantity
          // would need to be calculated from package items
          // For now, we'll use package_qty as the display quantity

          // Get package items (already included in query)
          const packageItems = item.package?.items || [];

          return {
            id: item.id,
            outboundType: "패키지", // 패키지 출고
            outboundDate: item.outbound_date,
            outboundQty: item.package_qty, // Package count (will be displayed as "X packages")
            managerName: item.manager_name,
            patientName: null,
            chartNumber: item.chart_number,
            memo: item.memo,
            isDamaged: item.is_damaged,
            isDefective: item.is_defective,
            packageId: item.package_id,
            packageName: item.package_name || item.package?.name || null, // 패키지명 (denormalized yoki relation)
            packageQty: item.package_qty, // 패키지 수량
            packageItems: packageItems.map((pkgItem: any) => ({
              productId: pkgItem.product_id || pkgItem.product?.id,
              productName: pkgItem.product?.name || "",
              brand: pkgItem.product?.brand || "",
              unit: pkgItem.product?.unit || "",
              quantity: pkgItem.quantity || 1,
              capacity_unit: pkgItem.product?.capacity_unit || "",
              salePrice: pkgItem.product?.sale_price || 0,
            })),
            product: {
              id: item.product?.id,
              name: item.product?.name,
              brand: item.product?.brand,
              category: item.product?.category,
              salePrice: item.product?.sale_price,
              unit: item.product?.unit,
              capacity_unit: item.product?.capacity_unit || "",
            },
            batch: {
              id: item.batch?.id,
              batchNo: item.batch?.batch_no,
              expiryDate: item.batch?.expiry_date,
            },
            createdAt: item.created_at,
            updatedAt: null,
          };
        } else {
          // Regular Outbound record
          return {
            id: item.id,
            outboundType: item.outbound_type || "제품", // 단품 출고
            outboundDate: item.outbound_date,
            outboundQty: item.outbound_qty,
            managerName: item.manager_name,
            patientName: item.patient_name,
            chartNumber: item.chart_number,
            memo: item.memo,
            isDamaged: item.is_damaged,
            isDefective: item.is_defective,
            packageId: item.package_id,
            packageName: item.package_id ? item.package?.name || null : null, // 패키지 출고인 경우 패키지명
            product: {
              id: item.product?.id,
              name: item.product?.name,
              brand: item.product?.brand,
              category: item.product?.category,
              salePrice: item.product?.sale_price,
              unit: item.product?.unit,
              capacity_unit: item.product?.capacity_unit || "",
            },
            batch: {
              id: item.batch?.id,
              batchNo: item.batch?.batch_no,
              expiryDate: item.batch?.expiry_date,
            },
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          };
        }
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return result;
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

    // if (batch.qty < outboundQty) {
    //   throw new BadRequestException(
    //     `재고가 부족합니다. 현재 재고: ${batch.qty}, 요청 수량: ${outboundQty}`
    //   );
    // }

    if (batch.expiry_date && batch.expiry_date < new Date()) {
      throw new BadRequestException("유효기간이 만료된 제품입니다");
    }
  }

  /**
   * 패키지 출고 처리
   * 각 구성품의 출고 수량은 재고 DB에 개별 반영됨
   */
  async createPackageOutbound(dto: PackageOutboundDto, tenantId: string) {
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

    // 🔍 DEBUG: Valid items

    validItems.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`, {
        productId: item.productId?.substring(0, 8),
        batchId: item.batchId?.substring(0, 8),
        outboundQty: item.outboundQty,
        packageId: (item as any).packageId?.substring(0, 8) || "null",
        packageQty: (item as any).packageQty || "null",
      });
    });

    // Product ma'lumotlarini olish (capacity_per_product va usage_capacity uchun)
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenant_id: tenantId,
      },
      select: {
        id: true,
        usage_capacity: true,
        capacity_per_product: true,
      },
    });
    const productMap = new Map<string, any>(
      products.map((p: any) => [p.id, p])
    );

    return this.prisma
      .$transaction(
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

            // 사용 단위 mantiqi: used_count yangilash va bo'sh box aniqlash
            const product = productMap.get(item.productId);
            let batchQtyDecrement = item.outboundQty; // Default: to'g'ridan-to'g'ri kamaytirish

            if (
              product &&
              product.usage_capacity &&
              product.usage_capacity > 0 &&
              product.capacity_per_product &&
              product.capacity_per_product > 0
            ) {
              // Batch'ning hozirgi used_count'ini olish (yangilanishdan oldin)
              const currentBatch = await tx.batch.findUnique({
                where: { id: item.batchId },
                select: { used_count: true, qty: true },
              });

              const currentUsedCount = currentBatch?.used_count || 0;

              // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
              const usageIncrement = product.usage_capacity * item.outboundQty;
              const newUsedCount = currentUsedCount + usageIncrement;

              // Bo'sh box aniqlash: yangilanishdan oldin va keyin
              const previousEmptyBoxes = Math.floor(
                currentUsedCount / product.capacity_per_product
              );
              const newEmptyBoxes = Math.floor(
                newUsedCount / product.capacity_per_product
              );
              const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

              // ✅ Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
              // ✅ Manfiy bo'lmasligi kerak (agar manfiy bo'lsa, 0 qilamiz)
              batchQtyDecrement = Math.max(0, emptyBoxesToCreate);

              // used_count ni yangilash
              await tx.batch.update({
                where: { id: item.batchId },
                data: { used_count: newUsedCount },
              });
            }

            // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)
            await tx.batch.update({
              where: { id: item.batchId },
              data: { qty: { decrement: batchQtyDecrement } },
            });

            // Product stock yangilash uchun yig'ish (to'liq ishlatilgan box'lar yoki default)
            const currentDecrement =
              productStockUpdates.get(item.productId) || 0;
            productStockUpdates.set(
              item.productId,
              currentDecrement + batchQtyDecrement
            );

            createdOutbounds.push(outbound);
          }

          // Barcha product'larni bir vaqtda yangilash
          for (const [
            productId,
            totalDecrement,
          ] of productStockUpdates.entries()) {
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
            packageOutboundIds: [], // Package outbound records not created in this function
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
      )
      .then((result: any) => {
        // Invalidate caches after successful package outbound creation
        if (result.success) {
          this.invalidateProductsCache(tenantId);
        }
        return result;
      });
  }

  /**
   * 통합 출고 처리 (Unified Outbound)
   * 모든 출고 타입(제품, 패키지, 바코드)을 통합 처리함
   * - 출고 예정 리스트를 최종 검토 후 실제 출고를 확정
   * - 재고 DB 차감 반영
   * - 출고 로그 생성 (출고타입, 시간, 담당자 등)
   * - 오류 발생 시 실패 리스트 출력
   */
  async createUnifiedOutbound(dto: UnifiedOutboundDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("At least one item is required");
    }

    // 🔍 DEBUG: Request ma'lumotlari
    console.log(`\n🚀 [Unified Outbound] Started:`, {
      outboundType: dto.outboundType,
      totalItems: dto.items.length,
      items: dto.items.map((item) => ({
        productId: item.productId,
        batchId: item.batchId,
        outboundQty: item.outboundQty,
        packageId: item.packageId,
        packageQty: item.packageQty,
      })),
    });

    // Barcha batch'larni va product'larni bir vaqtda tekshirish
    const batchIds = dto.items.map((item) => item.batchId);
    const productIds = dto.items.map((item) => item.productId);

    const batches = await this.prisma.batch.findMany({
      where: {
        id: { in: batchIds },
        product_id: { in: productIds },
        tenant_id: tenantId,
      },
      select: {
        id: true,
        product_id: true,
        batch_no: true,
        qty: true,
        inbound_qty: true,
        used_count: true,
        // available_quantity: true, // ✅ Will be available after migration
      },
    });

    // Product'larni olish (capacity_per_product va usage_capacity uchun)

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenant_id: tenantId,
      },
      select: {
        id: true,
        capacity_per_product: true,
        usage_capacity: true,
        returnPolicy: {
          select: {
            is_returnable: true,
            refund_amount: true,
          },
        },
      },
    });

    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // Validation - har bir item uchun
    const failedItems: UnifiedOutboundDto["items"] = [];
    const validItems: UnifiedOutboundDto["items"] = [];

    for (const item of dto.items) {
      const batch = batches.find(
        (b: any) => b.id === item.batchId && b.product_id === item.productId
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

    return this.prisma
      .$transaction(
        async (tx: any) => {
          const createdOutbounds: any[] = [];
          const createdPackageOutbounds: any[] = [];
          const defectiveItems: any[] = [];
          const logs: any[] = [];
          // Product'larni bir marta yangilash uchun map
          const productStockUpdates: Map<string, number> = new Map<
            string,
            number
          >();

          // Package outbound uchun package items va package names'ni olish
          // ✅ FIX: packageId mavjud bo'lgan barcha items uchun package ma'lumotlarini olish
          const packageIds = [
            ...new Set(
              validItems.map((item) => item.packageId).filter(Boolean)
            ),
          ];

          const packageItemsMap = new Map<string, number>(); // packageId-productId -> package item quantity
          const packageNamesMap = new Map<string, string>(); // packageId -> package name

          if (packageIds.length > 0) {
            // Get package items
            const packageItems = await (tx as any).packageItem.findMany({
              where: {
                package_id: { in: packageIds },
                tenant_id: tenantId,
              },
              select: {
                package_id: true,
                product_id: true,
                quantity: true,
                package_name: true,
              },
            });

            // Get packages for names
            const packages = await (tx as any).package.findMany({
              where: {
                id: { in: packageIds },
                tenant_id: tenantId,
              },
              select: {
                id: true,
                name: true,
              },
            });

            // Group by packageId and productId to get package item quantity
            packageItems.forEach((pkgItem: any) => {
              const key = `${pkgItem.package_id}-${pkgItem.product_id}`;
              packageItemsMap.set(key, pkgItem.quantity);
            });

            // Map package names
            packages.forEach((pkg: any) => {
              packageNamesMap.set(pkg.id, pkg.name);
            });
          }

          // ✅ UNIFIED APPROACH: Barcha items'ni (product + package) batchId bo'yicha guruhlash
          // Bu race condition'ni oldini oladi

          // Step 1: Barcha items'ni productId|batchId bo'yicha guruhlash
          const itemsByBatch = new Map<
            string,
            { totalOutboundQty: number; items: UnifiedOutboundDto["items"] }
          >();

          for (const item of validItems) {
            const key = `${item.productId}|${item.batchId}`;
            if (!itemsByBatch.has(key)) {
              itemsByBatch.set(key, {
                totalOutboundQty: 0,
                items: [],
              });
            }
            const batchData = itemsByBatch.get(key)!;
            batchData.totalOutboundQty += item.outboundQty;
            batchData.items.push(item);
          }

          // Step 2: Har bir unique batch uchun used_count va qty yangilash (FAQAT 1 MARTA)
          for (const [key, batchData] of itemsByBatch.entries()) {
            const [productId, batchId] = key.split("|");
            const batch = batches.find(
              (b: any) => b.id === batchId && b.product_id === productId
            ) as any;

            if (!batch) {
              continue;
            }

            const product = productMap.get(productId);
            let batchQtyDecrement = batchData.totalOutboundQty; // Default

            if (
              product &&
              product.usage_capacity &&
              product.usage_capacity > 0 &&
              product.capacity_per_product &&
              product.capacity_per_product > 0
            ) {
              // Batch'ning hozirgi used_count'ini olish
              const currentBatch = await tx.batch.findUnique({
                where: { id: batchId },
                select: { used_count: true, qty: true, inbound_qty: true },
              });

              const currentUsedCount = currentBatch?.used_count || 0;
              const currentInboundQty = currentBatch?.inbound_qty || 0;
              const currentBatchQty = currentBatch?.qty || 0;

              // usage_capacity qo'shish
              const usageIncrement =
                product.usage_capacity * batchData.totalOutboundQty;
              const newUsedCount = currentUsedCount + usageIncrement;

              // Bo'sh box aniqlash
              const previousEmptyBoxes = Math.floor(
                currentUsedCount / product.capacity_per_product
              );
              const newEmptyBoxes = Math.floor(
                newUsedCount / product.capacity_per_product
              );
              const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;
              batchQtyDecrement = Math.max(0, emptyBoxesToCreate);

              const availableQuantityBefore =
                currentInboundQty * product.capacity_per_product -
                currentUsedCount;
              const availableQuantityAfter =
                currentInboundQty * product.capacity_per_product - newUsedCount;

              console.log(`🔍 [Unified Batch Update] Batch ${batchId}:`, {
                productId,
                currentUsedCount,
                totalOutboundQty: batchData.totalOutboundQty,
                usageIncrement,
                newUsedCount,
                previousEmptyBoxes,
                newEmptyBoxes,
                emptyBoxesToCreate,
                batchQtyDecrement,
                currentBatchQty,
                availableQuantityBefore,
                availableQuantityAfter,
              });

              // used_count ni yangilash
              await tx.batch.update({
                where: { id: batchId },
                data: { used_count: newUsedCount },
              });
            }

            // Batch qty ni kamaytirish
            await tx.batch.update({
              where: { id: batchId },
              data: { qty: { decrement: batchQtyDecrement } },
            });

            // Product stock yangilash uchun yig'ish
            const currentDecrement = productStockUpdates.get(productId) || 0;
            productStockUpdates.set(
              productId,
              currentDecrement + batchQtyDecrement
            );
          }

          // Step 3: Outbound records yaratish
          // 3a. Package outbound records (packageId bor bo'lgan items uchun)
          const packageItems = validItems.filter((item) => item.packageId);
          if (packageItems.length > 0) {
            // Package bo'yicha guruhlash
            const packageGroups = new Map<
              string,
              UnifiedOutboundDto["items"]
            >();

            for (const item of packageItems) {
              const packageId = item.packageId!;
              if (!packageGroups.has(packageId)) {
                packageGroups.set(packageId, []);
              }
              packageGroups.get(packageId)!.push(item);
            }

            // Har bir package uchun bitta PackageOutbound record
            for (const [packageId, items] of packageGroups.entries()) {
              const firstItem = items[0];
              const packageQty = firstItem.packageQty || 1;
              const packageName = packageNamesMap.get(packageId) || null;

              const firstBatch = batches.find(
                (b: any) =>
                  b.id === firstItem.batchId &&
                  b.product_id === firstItem.productId
              ) as any;

              if (firstBatch) {
                const packageOutbound = await (
                  tx as any
                ).packageOutbound.create({
                  data: {
                    tenant_id: tenantId,
                    package_id: packageId,
                    package_name: packageName,
                    product_id: firstItem.productId,
                    batch_id: firstItem.batchId,
                    package_qty: packageQty,
                    manager_name: dto.managerName,
                    chart_number: dto.chartNumber ?? null,
                    memo: dto.memo ?? null,
                    is_damaged: dto.isDamaged || false,
                    is_defective: dto.isDefective || false,
                  },
                });

                createdPackageOutbounds.push(packageOutbound);
              }
            }
          }

          // 3b. Product outbound records (packageId yo'q bo'lgan items uchun)
          const productItems = validItems.filter((item) => !item.packageId);
          if (productItems.length > 0) {
            console.log(
              `📝 [Unified Outbound] Creating ${productItems.length} product records`
            );

            for (const item of productItems) {
              const batch = batches.find(
                (b: any) =>
                  b.id === item.batchId && b.product_id === item.productId
              ) as any;

              if (batch) {
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
                    is_damaged: dto.isDamaged || false,
                    is_defective: dto.isDefective || false,
                    memo: dto.memo ?? null,
                    package_id: null,
                    created_by: null,
                  },
                });

                createdOutbounds.push(outbound);

                // Collect defective items for order return creation
                if (dto.isDefective) {
                  defectiveItems.push({
                    outboundId: outbound.id,
                    batchNo: batch.batch_no,
                    productId: item.productId,
                    productName: batch.product?.name || "알 수 없음",
                    brand: batch.product?.brand || null,
                    returnQuantity: item.outboundQty,
                    totalQuantity: item.outboundQty,
                    unitPrice: batch.product?.sale_price || 0,
                  });
                }
              }
            }
          }

          // Step 4: Product current_stock'ini yangilash
          for (const [
            productId,
            totalDecrement,
          ] of productStockUpdates.entries()) {
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

          console.log(`✅ [Unified Outbound] Completed successfully`);

          return {
            success: true,
            outboundIds: createdOutbounds.map((o: any) => o.id),
            packageOutboundIds: createdPackageOutbounds.map((o: any) => o.id),
            defectiveItems,
            failedItems: failedItems.length > 0 ? failedItems : undefined,
            logs: [],
            message:
              failedItems.length > 0
                ? `${
                    validItems.length - failedItems.length
                  } items processed successfully, ${
                    failedItems.length
                  } items failed`
                : "All items processed successfully",
          };
        },
        {
          maxWait: 10000, // 10 seconds max wait for transaction
          timeout: 30000, // 30 seconds timeout for transaction
        }
      )
      .then(async (result: any) => {
        // Process defective items after transaction
        if (result.defectiveItems && result.defectiveItems.length > 0) {
          for (const defectiveItem of result.defectiveItems) {
            try {
              await this.orderReturnService.createFromOutbound(tenantId, {
                outboundId: defectiveItem.outboundId,
                items: [
                  {
                    batchNo: defectiveItem.batchNo,
                    productId: defectiveItem.productId,
                    productName: defectiveItem.productName,
                    brand: defectiveItem.brand,
                    returnQuantity: defectiveItem.returnQuantity,
                    totalQuantity: defectiveItem.totalQuantity,
                    unitPrice: defectiveItem.unitPrice,
                  },
                ],
              });
            } catch (error: any) {
              console.error(
                `Failed to create return for defective product:`,
                error
              );
              // Don't fail the outbound if return creation fails
            }
          }
        }

        // ✅ Cache invalidation AFTER transaction
        if (result.success) {
          this.invalidateProductsCache(tenantId);
        }
        return result;
      });
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

    if (outbounds.length === 0) {
      throw new NotFoundException("출고 내역을 찾을 수 없습니다.");
    }

    // Transaction으로 재고 복원 및 출고 기록 삭제
    return this.prisma.$transaction(async (tx: any) => {
      const productStockUpdates = new Map<string, number>();

      // Product'larni olish (usage_capacity va capacity_per_product uchun)
      const productIds = [...new Set(outbounds.map((o) => o.product_id))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          tenant_id: tenantId,
        },
        select: {
          id: true,
          usage_capacity: true,
          capacity_per_product: true,
        },
      });
      const productMap = new Map<string, any>(
        products.map((p: any) => [p.id, p])
      );

      // 각 출고 건에 대해 재고 복원
      for (const outbound of outbounds) {
        const product = productMap.get(outbound.product_id) as any;

        // Batch'ning hozirgi holatini olish
        const batch = await tx.batch.findUnique({
          where: { id: outbound.batch_id },
          select: { used_count: true, qty: true },
        });

        let batchQtyIncrement = outbound.outbound_qty; // Default: to'g'ridan-to'g'ri qo'shish

        // 사용 단위 mantiqi: used_count kamaytirish va qancha box qaytarilishini hisoblash
        if (
          product &&
          product.usage_capacity &&
          product.usage_capacity > 0 &&
          product.capacity_per_product &&
          product.capacity_per_product > 0 &&
          batch
        ) {
          const currentUsedCount = batch.used_count || 0;

          // usage_capacity kamaytirish: outbound qilingan miqdorni olib tashlash
          const usageDecrement = product.usage_capacity * outbound.outbound_qty;
          const newUsedCount = Math.max(0, currentUsedCount - usageDecrement);

          // Qancha box qaytarilishini hisoblash
          const previousEmptyBoxes = Math.floor(
            currentUsedCount / product.capacity_per_product
          );
          const newEmptyBoxes = Math.floor(
            newUsedCount / product.capacity_per_product
          );
          const emptyBoxesToReturn = previousEmptyBoxes - newEmptyBoxes;

          // Faqat qaytarilgan box'lar sonini qo'shish
          batchQtyIncrement = emptyBoxesToReturn;

          // used_count ni yangilash
          await tx.batch.update({
            where: { id: outbound.batch_id },
            data: { used_count: newUsedCount },
          });
        }

        // Batch qty 증가 (faqat qaytarilgan box'lar soni)
        await tx.batch.update({
          where: { id: outbound.batch_id },
          data: { qty: { increment: batchQtyIncrement } },
        });

        // Product stock 업데이트를 위해 수집 (faqat qaytarilgan box'lar soni)
        const currentIncrement =
          productStockUpdates.get(outbound.product_id) || 0;
        productStockUpdates.set(
          outbound.product_id,
          currentIncrement + batchQtyIncrement
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

      return {
        success: true,
        canceledCount: outbounds.length,
        message: `${outbounds.length}개의 출고 건이 취소되었고 재고가 복원되었습니다.`,
      };
    });
  }
}
