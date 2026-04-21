import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";
import { ReturnRepository } from "../repositories/return.repository";
import { SupplierReturnNotificationService } from "./supplier-return-notification.service";
import { CreateReturnDto, CreateReturnItemDto } from "../dto/create-return.dto";
import { MessageService } from "../../member/services/message.service";
import { EmailService } from "../../member/services/email.service";
import { CacheManager } from "../../../common/cache";
import { ReturnSupplierNotifiedPayload } from "../../notifications/types/return-supplier-notification.payload";
import { RETURN_SUPPLIER_NOTIFIED_EVENT } from "../../notifications/constants/notification-events";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationService } from "src/modules/notifications/notification.service";

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  // ✅ Replaced Map with CacheManager
  private availableProductsCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly returnRepository: ReturnRepository,
    private readonly supplierReturnNotificationService: SupplierReturnNotificationService,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notificationService: NotificationService
  ) {
    this.availableProductsCache = new CacheManager({
      maxSize: 100,
      ttl: 30000, // 30 seconds
      cleanupInterval: 60000,
      name: "ReturnService",
    });
  }

  private getCachedAvailableProducts(cacheKey: string): any[] | null {
    const result = this.availableProductsCache.getWithStaleCheck(cacheKey);

    if (!result) {
      this.logger.debug(
        `❌ [getAvailableProducts] Cache MISS for key: ${cacheKey}, fetching from DB`
      );
      return null;
    }

    if (result.isStale) {
      this.logger.debug(
        `⚠️ [getAvailableProducts] Cache STALE for key: ${cacheKey}, deleting and fetching fresh data`
      );
      this.availableProductsCache.delete(cacheKey);
      return null;
    }

    this.logger.debug(
      `✨ [getAvailableProducts] Cache HIT (fresh) for key: ${cacheKey}`
    );
    return result.data;
  }

  private aggregateReturns(allReturns: any[]): {
    returnedByProduct: Map<string, number>;
    returnedByOutbound: Map<string, number>;
    emptyBoxReturnsByProduct: Map<string, number>;
  } {
    const returnedByProduct = new Map<string, number>();
    const returnedByOutbound = new Map<string, number>();
    const emptyBoxReturnsByProduct = new Map<string, number>();

    for (const ret of allReturns) {
      if (ret.product_id) {
        returnedByProduct.set(
          ret.product_id,
          (returnedByProduct.get(ret.product_id) || 0) + (ret.return_qty || 0)
        );

        if (ret.memo?.includes("자동 반납: 빈 박스")) {
          emptyBoxReturnsByProduct.set(
            ret.product_id,
            (emptyBoxReturnsByProduct.get(ret.product_id) || 0) +
              (ret.return_qty || 0)
          );
        }
      }

      if (ret.outbound_id) {
        returnedByOutbound.set(
          ret.outbound_id,
          (returnedByOutbound.get(ret.outbound_id) || 0) + (ret.return_qty || 0)
        );
      }
    }

    return {
      returnedByProduct,
      returnedByOutbound,
      emptyBoxReturnsByProduct,
    };
  }

  private isSiteOrOtherPurchasePathType(
    pathType: string | null | undefined
  ): boolean {
    return pathType === "SITE" || pathType === "OTHER";
  }

  /** OutboundService bilan bir xil (불량 문서 수량 / used_count). */
  private getDefectiveOutboundDocumentQty(product: {
    capacity_per_product?: number | null;
    usage_capacity?: number | null;
  }): number {
    const cap = Number(product?.capacity_per_product);
    const use = Number(product?.usage_capacity);
    if (
      Number.isFinite(cap) &&
      cap > 0 &&
      Number.isFinite(use) &&
      use > 0
    ) {
      const n = Math.round(cap / use);
      return n >= 1 ? n : 1;
    }
    return 1;
  }

  private getDefectiveUsedCountIncrementPerBox(product: {
    capacity_per_product?: number | null;
    usage_capacity?: number | null;
  }): number {
    const cap = Number(product?.capacity_per_product);
    const use = Number(product?.usage_capacity);
    if (
      !Number.isFinite(cap) ||
      cap <= 0 ||
      !Number.isFinite(use) ||
      use <= 0
    ) {
      return 0;
    }
    return cap / use;
  }

  /**
   * 불량(is_defective) va 폐기(waste_product) chiqimlar batch.used_count ga qo'shgan qism —
   * bo'sh quti (returns) hajm hisobidan chiqariladi (oddiy foydalanishdan farqlab).
   */
  private async fetchExcludedOutboundUsedCountByBatchForEmptyBoxes(
    tenantId: string,
    batchIds: string[],
    skipEmptyBoxProductIds: Set<string>
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (batchIds.length === 0) return map;

    const rows = await this.prisma.executeWithRetry(async () =>
      (this.prisma as any).outbound.findMany({
        where: {
          tenant_id: tenantId,
          batch_id: { in: batchIds },
          OR: [{ is_defective: true }, { waste_product: true }],
        },
        select: {
          batch_id: true,
          product_id: true,
          outbound_qty: true,
          is_defective: true,
          waste_product: true,
          product: {
            select: {
              id: true,
              usage_capacity: true,
              capacity_per_product: true,
            },
          },
        },
      })
    );

    for (const row of rows as any[]) {
      if (!row.batch_id) continue;
      let add = 0;
      if (row.is_defective && row.product) {
        const p = row.product;
        const doc = this.getDefectiveOutboundDocumentQty(p);
        const inc = this.getDefectiveUsedCountIncrementPerBox(p);
        if (doc > 0 && inc > 0) {
          const boxes = Number(row.outbound_qty) / doc;
          if (Number.isFinite(boxes) && boxes > 0) add += inc * boxes;
        }
      } else if (row.waste_product) {
        const pid = row.product_id || row.product?.id;
        if (pid && skipEmptyBoxProductIds.has(pid)) {
          // SITE/OTHER 등으로 출고 시 used_count가 오르지 않은 제품 — 폐기분 차감하면 과소 계산됨
        } else {
          add += Number(row.outbound_qty) || 0;
        }
      }
      if (add > 0) {
        map.set(row.batch_id, (map.get(row.batch_id) || 0) + add);
      }
    }
    return map;
  }

  /**
   * usage_capacity / capacity_per_product bo'lmasa yoki 0 bo'lsa — undefined.
   * Aks holda qolgan empty box soni (0 dan kichik bo'lmaydi).
   * SITE/OTHER partiyalari (batch.purchase_path_type) hajm/bo'sh quti hisobiga kirmaydi.
   * 불량 / 폐기 chiqimlar batch.used_count ga qo'shilgan qism ayiriladi.
   */
  private calculateEmptyBoxes(
    product: any,
    emptyBoxReturnsMap: Map<string, number>,
    excludedOutboundUsedByBatch: Map<string, number>
  ): number | undefined {
    if (
      product.usage_capacity == null ||
      product.usage_capacity <= 0 ||
      product.capacity_per_product == null ||
      product.capacity_per_product <= 0
    ) {
      return undefined;
    }

    const totalVolumeUsed = (product.batches || [])
      .filter(
        (b: any) =>
          !b.is_separate_purchase &&
          !this.isSiteOrOtherPurchasePathType(b.purchase_path_type)
      )
      .reduce((sum: number, b: any) => {
        const raw = Number(b.used_count) || 0;
        const excluded = excludedOutboundUsedByBatch.get(b.id) || 0;
        const effectiveUsed = Math.max(0, raw - excluded);
        return sum + effectiveUsed * (product.usage_capacity || 0);
      }, 0);

    const previous = Math.floor(totalVolumeUsed / product.capacity_per_product);
    const returned = emptyBoxReturnsMap.get(product.id) || 0;
    return Math.max(0, previous - returned);
  }

  private async fetchAllReturnsForAvailableProducts(
    tenantId: string
  ): Promise<any[]> {
    return this.prisma.executeWithRetry(async () =>
      (this.prisma as any).return.findMany({
        where: { tenant_id: tenantId, cancelled_at: null },
        select: {
          product_id: true,
          outbound_id: true,
          return_qty: true,
          memo: true,
        },
      })
    );
  }

  private async fetchProductsForAvailableProducts(
    tenantId: string
  ): Promise<any[]> {
    const queryStartTime = Date.now();

    const rows = await this.prisma.executeWithRetry(async () =>
      (this.prisma as any).product.findMany({
        where: {
          tenant_id: tenantId,
          returnPolicy: { is_returnable: true },
        },
        select: {
          id: true,
          name: true,
          brand: true,
          unit: true,
          usage_capacity: true,
          capacity_per_product: true,
          returnPolicy: {
            select: {
              is_returnable: true,
              refund_amount: true,
            },
          },
          productSupplier: {
            select: {
              product_id: true,
              clinicSupplierManager: {
                select: {
                  id: true,
                  company_name: true,
                  name: true,
                  linkedManager: {
                    select: {
                      id: true,
                      name: true,
                      supplier: { select: { id: true } },
                    },
                  },
                },
              },
            },
          },
          batches: {
            orderBy: { created_at: "desc" },
            select: {
              id: true,
              storage: true,
              used_count: true,
              is_separate_purchase: true,
              purchase_path_type: true,
            },
          },
          outbounds: {
            where: { is_damaged: false, is_defective: false },
            select: {
              id: true,
              batch_id: true,
              batch_no: true,
              outbound_qty: true,
              outbound_date: true,
              manager_name: true,
              is_damaged: true,
              is_defective: true,
            },
          },
        },
      })
    );

    return rows;
  }

  private async loadSkipEmptyBoxProductIds(
    tenantId: string,
    productIds: string[]
  ): Promise<Set<string>> {
    const skip = new Set<string>();
    if (productIds.length === 0) return skip;

    const defaultPaths = await this.prisma.executeWithRetry(async () =>
      (this.prisma as any).purchasePath.findMany({
        where: {
          tenant_id: tenantId,
          product_id: { in: productIds },
          is_default: true,
          path_type: { in: ["SITE", "OTHER"] },
        },
        select: { product_id: true },
      })
    );
    for (const row of defaultPaths as any[]) {
      if (row?.product_id) skip.add(row.product_id);
    }

    const allPaths = await this.prisma.executeWithRetry(async () =>
      (this.prisma as any).purchasePath.findMany({
        where: {
          tenant_id: tenantId,
          product_id: { in: productIds },
        },
        select: { product_id: true, path_type: true },
      })
    );
    const hasManagerPath = new Set<string>();
    const hasSiteOrOtherPath = new Set<string>();
    for (const row of allPaths as any[]) {
      const pid = row?.product_id;
      if (!pid) continue;
      if (row.path_type === "MANAGER") hasManagerPath.add(pid);
      if (row.path_type === "SITE" || row.path_type === "OTHER") {
        hasSiteOrOtherPath.add(pid);
      }
    }
    for (const pid of hasSiteOrOtherPath) {
      if (!hasManagerPath.has(pid)) skip.add(pid);
    }

    return skip;
  }

  private mapProductToAvailableReturnRow(
    product: any,
    returnedByProduct: Map<string, number>,
    returnedByOutbound: Map<string, number>,
    emptyBoxReturnsByProduct: Map<string, number>,
    skipEmptyBoxProductIds: Set<string>,
    excludedOutboundUsedByBatch: Map<string, number>,
    search?: string
  ): any | null {
    const damagedOrDefective = (product.outbounds || []).filter(
      (o: any) => o.is_damaged || o.is_defective
    );
    if (damagedOrDefective.length > 0) {
      this.logger.warn(
        `⚠️ [getAvailableProducts] Product ${product.id} has ${damagedOrDefective.length} damaged/defective outbounds (should be filtered out by query)`
      );
    }

    const totalOutbound = (product.outbounds || []).reduce(
      (sum: number, outbound: any) => sum + (outbound.outbound_qty || 0),
      0
    );
    const totalReturned = returnedByProduct.get(product.id) || 0;
    const unreturnedQty = totalOutbound - totalReturned;

    let emptyBoxes = this.calculateEmptyBoxes(
      product,
      emptyBoxReturnsByProduct,
      excludedOutboundUsedByBatch
    );
    if (skipEmptyBoxProductIds.has(product.id)) {
      emptyBoxes = undefined;
    }

    if (
      unreturnedQty <= 0 &&
      (emptyBoxes == null || emptyBoxes <= 0)
    ) {
      return null;
    }

    const batchDetails = (product.outbounds || []).map((outbound: any) => {
      const batchReturned = returnedByOutbound.get(outbound.id) || 0;
      const availableQty = outbound.outbound_qty - batchReturned;
      return {
        batchId: outbound.batch_id,
        batchNo: outbound.batch_no,
        outboundId: outbound.id,
        outboundQty: outbound.outbound_qty,
        returnedQty: batchReturned,
        availableQty: availableQty > 0 ? availableQty : 0,
        outboundDate: outbound.outbound_date,
        managerName: outbound.manager_name,
      };
    });

    if (search?.trim()) {
      const searchLower = search.toLowerCase().trim();
      const nameMatch = product.name?.toLowerCase().includes(searchLower);
      const brandMatch = product.brand?.toLowerCase().includes(searchLower);
      const batchMatch = batchDetails.some((b: any) =>
        b.batchNo?.toLowerCase().includes(searchLower)
      );
      if (!nameMatch && !brandMatch && !batchMatch) return null;
    }

    return {
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      unit: product.unit,
      supplierId:
        product.productSupplier?.clinicSupplierManager?.linkedManager?.supplier
          ?.id || null,
      supplierName:
        product.productSupplier?.clinicSupplierManager?.company_name || null,
      supplierManagerName:
        product.productSupplier?.clinicSupplierManager?.name || null,
      storageLocation: product.batches?.[0]?.storage ?? null,
      unreturnedQty,
      emptyBoxes,
      refundAmount: product.returnPolicy?.refund_amount ?? 0,
      batches: batchDetails.filter((b: any) => b.availableQty > 0),
    };
  }

  /**
   * Qaytarilishi mumkin bo'lgan mahsulotlarni olish
   * 미반납 수량 = Chiqarilgan miqdor - Qaytarilgan miqdor
   * Optimized: N+1 query muammosini hal qilish - barcha return'larni bir marta olish
   */
  async getAvailableProducts(tenantId: string, search?: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const cacheKey = `available-products:${tenantId}:${search || ""}`;
    const cached = this.getCachedAvailableProducts(cacheKey);
    if (cached) return cached;

    const allReturns = await this.fetchAllReturnsForAvailableProducts(tenantId);
    const { returnedByProduct, returnedByOutbound, emptyBoxReturnsByProduct } =
      this.aggregateReturns(allReturns);

    const products = await this.fetchProductsForAvailableProducts(tenantId);
    const productIds = (products as any[]).map((p: any) => p.id);
    const batchIds = [
      ...new Set(
        (products as any[]).flatMap((p: any) =>
          (p.batches || []).map((b: any) => b.id)
        )
      ),
    ];
    const skipEmptyBoxProductIds = await this.loadSkipEmptyBoxProductIds(
      tenantId,
      productIds
    );
    const excludedOutboundUsedByBatch =
      await this.fetchExcludedOutboundUsedCountByBatchForEmptyBoxes(
        tenantId,
        batchIds,
        skipEmptyBoxProductIds
      );

    const availableProducts = (products as any[])
      .map((p) =>
        this.mapProductToAvailableReturnRow(
          p,
          returnedByProduct,
          returnedByOutbound,
          emptyBoxReturnsByProduct,
          skipEmptyBoxProductIds,
          excludedOutboundUsedByBatch,
          search
        )
      )
      .filter((row): row is NonNullable<typeof row> => row != null);

    this.availableProductsCache.set(cacheKey, availableProducts);

    return availableProducts;
  }

  /**
   * Cache'ni invalidate qilish (Outbound yaratilganda chaqiriladi)
   */
  public invalidateCache(tenantId: string): void {
    const deleted = this.availableProductsCache.deletePattern(
      `^available-products:${tenantId}:`
    );
    this.logger.debug(
      `🗑️ [ReturnService] Invalidated ${deleted} cache entries for tenant: ${tenantId}`
    );
  }

  /**
   * Qaytarish amalga oshirish
   */
  async processReturn(dto: CreateReturnDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("Return items are required");
    }

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const createdReturns = [];
        const errors: string[] = [];

        for (const item of dto.items) {
          try {
            // 1. Product mavjudligini tekshirish
            const product = await (tx as any).product.findFirst({
              where: {
                id: item.productId,
                tenant_id: tenantId,
              },
              include: {
                returnPolicy: true,
                productSupplier: {
                  include: {
                    clinicSupplierManager: {
                      include: {
                        linkedManager: {
                          select: {
                            id: true,
                            supplier_tenant_id: true, // This is the correct field for supplier tenant_id
                            supplier: {
                              select: {
                                id: true,
                                tenant_id: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            });

            if (!product) {
              errors.push(`Product not found: ${item.productId}`);
              continue;
            }

            // 2. ReturnPolicy tekshirish
            if (!product.returnPolicy || !product.returnPolicy.is_returnable) {
              errors.push(
                `Product is not returnable: ${product.name || item.productId}`
              );
              continue;
            }

            // 3. Outbound mavjudligini tekshirish
            const outbound = await (tx as any).outbound.findFirst({
              where: {
                id: item.outboundId,
                tenant_id: tenantId,
                product_id: item.productId,
              },
            });

            if (!outbound) {
              errors.push(`Outbound not found: ${item.outboundId}`);
              continue;
            }

            // 4. Batch mavjudligini tekshirish
            const batch = await (tx as any).batch.findFirst({
              where: {
                id: item.batchId,
                tenant_id: tenantId,
                product_id: item.productId,
              },
              select: {
                id: true,
                batch_no: true,
                used_count: true, // 사용 단위 uchun
                purchase_path_type: true,
              },
            });

            if (!batch) {
              errors.push(`Batch not found: ${item.batchId}`);
              continue;
            }

            // 5. Qaytarilishi mumkin bo'lgan miqdorni tekshirish
            const returnedQty =
              await this.returnRepository.getReturnedQuantityByOutbound(
                item.outboundId,
                tenantId,
                tx
              );
            const availableQty = outbound.outbound_qty - returnedQty;

            if (item.returnQty > availableQty) {
              errors.push(
                `Return quantity (${item.returnQty}) exceeds available quantity (${availableQty}) for product: ${product.name}`
              );
              continue;
            }

            // 6. Supplier ID olish (productSupplier orqali)
            // First try to get supplier_tenant_id from linkedManager (most reliable)
            const linkedManager =
              product.productSupplier?.clinicSupplierManager?.linkedManager;
            const supplierId = linkedManager?.supplier?.id || undefined;

            // Debug: Log supplier chain

            // 7. Refund amount olish
            const refundAmount = product.returnPolicy?.refund_amount ?? 0;
            const totalRefund = item.returnQty * refundAmount;

            // 8. Empty box return ekanligini tekshirish va memo'ga qo'shish
            let memo = dto.memo || "";

            // Product'ning usage_capacity va capacity_per_product ni olish (include bilan kelmaydi, shuning uchun alohida query)
            const productDetails = await (tx as any).product.findFirst({
              where: { id: item.productId },
              select: {
                usage_capacity: true,
                capacity_per_product: true,
              },
            });

            const defaultSiteOrOtherPath = await (
              tx as any
            ).purchasePath.findFirst({
              where: {
                product_id: item.productId,
                tenant_id: tenantId,
                is_default: true,
                path_type: { in: ["SITE", "OTHER"] },
              },
              select: { id: true },
            });

            const batchIsSiteOrOther = this.isSiteOrOtherPurchasePathType(
              batch.purchase_path_type
            );

            // Product'ning usage_capacity va capacity_per_product ni tekshirish
            if (
              !defaultSiteOrOtherPath &&
              !batchIsSiteOrOther &&
              productDetails?.usage_capacity &&
              productDetails.usage_capacity > 0 &&
              productDetails?.capacity_per_product &&
              productDetails.capacity_per_product > 0
            ) {
              const usedCount = batch.used_count || 0;
              const volumeUsed =
                usedCount * (productDetails.usage_capacity || 0);

              const previousEmptyBoxes = Math.floor(
                volumeUsed / productDetails.capacity_per_product
              );

              // Return qilingan empty box'lar sonini olish (hozirgi return'dan oldin)
              const emptyBoxReturns = await (tx as any).return.findMany({
                where: {
                  product_id: item.productId,
                  tenant_id: tenantId,
                  cancelled_at: null,
                  memo: { contains: "자동 반납: 빈 박스" },
                },
                select: { return_qty: true },
              });

              const returnedEmptyBoxes = emptyBoxReturns.reduce(
                (sum: number, ret: any) => sum + (ret.return_qty || 0),
                0
              );
              const availableEmptyBoxes =
                previousEmptyBoxes - returnedEmptyBoxes;

              // Agar return qilinayotgan miqdor available empty boxes dan kichik yoki teng bo'lsa, bu empty box return
              if (
                availableEmptyBoxes > 0 &&
                item.returnQty <= availableEmptyBoxes
              ) {
                memo = `자동 반납: 빈 박스`;
              }
            }

            // 9. Return yozuvini yaratish
            const returnRecord = await this.returnRepository.create(
              {
                tenant_id: tenantId,
                product_id: item.productId,
                batch_id: item.batchId,
                outbound_id: item.outboundId,
                batch_no: batch.batch_no,
                supplier_id: supplierId,
                return_qty: item.returnQty,
                refund_amount: refundAmount,
                total_refund: totalRefund,
                manager_name: dto.managerName,
                memo: memo,
              },
              tx
            );

            // 9. Batch stock'ini yangilash

            createdReturns.push(returnRecord);
          } catch (error: any) {
            errors.push(
              `Error processing return for product ${item.productId}: ${error.message}`
            );
          }
        }

        if (createdReturns.length === 0) {
          throw new BadRequestException(
            `Failed to process returns: ${errors.join(", ")}`
          );
        }

        // Transaction commit bo'lgandan keyin notification'larni yaratish
        // Bu muvaffaqiyatsiz bo'lsa ham return jarayoni to'xtamasligi kerak

        // Group returns by supplier_tenant_id to send one request per supplier
        const returnsBySupplier = new Map<
          string,
          Array<{ returnRecord: any; product: any }>
        >();

        for (const returnRecord of createdReturns) {
          // Product'ni qayta olish (transaction tashqarisida)
          const product = await (this.prisma as any).product.findFirst({
            where: {
              id: returnRecord.product_id,
              tenant_id: tenantId,
            },
            include: {
              productSupplier: {
                include: {
                  clinicSupplierManager: {
                    include: {
                      linkedManager: {
                        select: {
                          id: true,
                          supplier_tenant_id: true, // This is the correct field for supplier tenant_id
                          supplier: {
                            select: {
                              id: true,
                              tenant_id: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          if (product) {
            // Eski notification service (clinic backend DB'ga yozadi)
            this.supplierReturnNotificationService
              .createNotificationsForReturn(returnRecord, product, tenantId)
              .catch((error) => {
                // Log error but don't fail the return process
                console.error(
                  `Failed to create supplier notifications for return ${returnRecord.id}:`,
                  error
                );
              });

            // Yangi: Supplier backend'ga API call qilish
            // supplier_id bo'lmasa ham, linkedManager orqali supplier tenant_id ni topishga harakat qilamiz
            const supplierId =
              returnRecord.supplier_id ||
              product.productSupplier?.clinicSupplierManager?.linkedManager
                ?.supplier?.id ||
              null;

            if (supplierId) {
              // supplier_id ni yangilash (agar u bo'lmasa)
              if (!returnRecord.supplier_id) {
                await this.prisma.executeWithRetry(async () => {
                  return (this.prisma as any).return.update({
                    where: { id: returnRecord.id },
                    data: { supplier_id: supplierId },
                  });
                });
                returnRecord.supplier_id = supplierId;
              }

              // Get supplier_tenant_id for grouping
              const linkedManager =
                product.productSupplier?.clinicSupplierManager?.linkedManager;
              const supplierTenantId =
                linkedManager?.supplier_tenant_id ||
                linkedManager?.supplier?.tenant_id ||
                null;

              if (supplierTenantId) {
                // Group returns by supplier_tenant_id
                if (!returnsBySupplier.has(supplierTenantId)) {
                  returnsBySupplier.set(supplierTenantId, []);
                }
                returnsBySupplier
                  .get(supplierTenantId)!
                  .push({ returnRecord, product });
              } else {
                this.logger.warn(
                  `Return ${returnRecord.id} has supplier_id but no supplier_tenant_id. Skipping supplier notification.`
                );
              }
            } else {
              // linkedManager bo'lmasa ham, ClinicSupplierManager telefon raqami bo'lsa SMS yuborish
              const clinicSupplierManager =
                product.productSupplier?.clinicSupplierManager;
              const phoneNumber = clinicSupplierManager?.phone_number;

              if (phoneNumber) {
                // linkedManager bo'lmasa ham, ClinicSupplierManager telefon raqamiga SMS yuborish

                // sendReturnToSupplier funksiyasida linkedManager bo'lmasa ham SMS yuboriladi
                this.sendReturnToSupplier(
                  returnRecord,
                  product,
                  tenantId
                ).catch((error) => {
                  // Log error but don't fail the return process
                  this.logger.error(
                    `Failed to send return to supplier for product ${product.name} (no linkedManager):`,
                    error
                  );
                });
              } else {
                this.logger.warn(
                  `Return ${
                    returnRecord.id
                  } has no supplier_id, no linked supplier manager, and no ClinicSupplierManager phone number. Product: ${
                    product.name
                  }, Has productSupplier: ${!!product.productSupplier}, Has clinicSupplierManager: ${!!product
                    .productSupplier
                    ?.clinicSupplierManager}, Has linkedManager: ${!!product
                    .productSupplier?.clinicSupplierManager
                    ?.linkedManager}, Has phoneNumber: ${!!phoneNumber}, skipping supplier notification`
                );
              }
            }
          }
        }

        // Send one request per return (har bir product o'z supplier'iga SMS yuboriladi)
        for (const [supplierTenantId, returns] of returnsBySupplier.entries()) {
          if (returns.length > 0) {
            // Har bir return uchun alohida SMS yuborish
            // Har bir product o'z supplier'iga SMS yuboriladi
            for (const returnItem of returns) {
              this.sendReturnToSupplier(
                returnItem.returnRecord,
                returnItem.product,
                tenantId
              ).catch((error) => {
                // Log error but don't fail the return process
                this.logger.error(
                  `Failed to send return to supplier-backend for product ${returnItem.product.name} (supplier_tenant_id=${supplierTenantId}):`,
                  error
                );
              });
            }
          }
        }

        return {
          success: true,
          returns: createdReturns,
          errors: errors.length > 0 ? errors : undefined,
        };
      }
    );

    // Cache'ni invalidate qilish
    this.availableProductsCache.clear();

    return result;
  }

  /**
   * Return tarixini olish
   */
  async getReturnHistory(
    tenantId: string,
    filters?: {
      productId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    }
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    return await this.returnRepository.getReturnHistory(tenantId, filters);
  }

  /**
   * Handle return accept webhook from supplier (for /returns page)
   */
  async handleReturnAccept(dto: { return_no: string; status: string }) {
    try {
      // Find return by return_no
      const returnRecord = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).return.findFirst({
          where: { return_no: dto.return_no },
        });
      });

      if (!returnRecord) {
        this.logger.warn(`Return not found for return_no: ${dto.return_no}`);
        return {
          success: false,
          message: `Return not found for return_no: ${dto.return_no}`,
        };
      }

      // Update SupplierReturnNotification status to ACCEPTED
      await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnNotification.updateMany({
          where: {
            return_id: returnRecord.id,
            status: "PENDING",
          },
          data: {
            status: "ACCEPTED",
            accepted_at: new Date(),
            updated_at: new Date(),
          },
        });
      });

      // Fetch product + supplier info for notification
      let supplierCompanyName: string | null = null;
      let supplierManagerName: string | null = null;
      let productSummary: string | null = null;

      const productWithSupplier = await this.prisma.executeWithRetry(
        async () => {
          return (this.prisma as any).product.findFirst({
            where: { id: returnRecord.product_id },
            select: {
              name: true,
              productSupplier: {
                select: {
                  clinicSupplierManager: {
                    select: {
                      company_name: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });
        }
      );

      if (productWithSupplier) {
        if (productWithSupplier.name) {
          productSummary = `${productWithSupplier.name} ${returnRecord.return_qty}개`;
        }
        const csm = productWithSupplier.productSupplier?.clinicSupplierManager;
        if (csm) {
          supplierCompanyName = csm.company_name ?? null;
          supplierManagerName = csm.name ?? null;
        }
      }

      // In-app notification emit
      await this.eventEmitter.emit(RETURN_SUPPLIER_NOTIFIED_EVENT, {
        tenantId: returnRecord.tenant_id,
        returnId: returnRecord.id,
        returnNo: returnRecord.return_no,
        sourceStatus: "accepted",
        supplierCompanyName,
        supplierManagerName,
        productSummary,
      } satisfies ReturnSupplierNotifiedPayload);

      return { success: true, message: "Return accept webhook processed" };
    } catch (error: any) {
      this.logger.error(
        `Error handling return accept: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message: `Failed to handle return accept: ${error.message}`,
      };
    }
  }

  /**
   * Format SMS message for return notification
   */
  private formatReturnSMSMessage(
    returnNo: string,
    clinicName: string,
    clinicManagerName: string,
    productName: string,
    returnQty: number,
    totalRefund: number,
    isPlatformSupplier: boolean = true,
    unit?: string
  ): string {
    const footer = isPlatformSupplier
      ? "자세한 내용은 공급옵제 플렛폼에서 확인하세요"
      : "자세한 내용은 확인해주세요.";

    return `${clinicName}에서 발생한[반납 알림]
반납번호: ${returnNo}
반납담당자: ${clinicManagerName}
제품명: ${productName}
수량: ${returnQty}${unit ? ` ${unit}` : ""} 
총 금액: ${totalRefund.toLocaleString()}원

${footer}`;
  }

  /**
   * Generate unique return number for /returns page
   * Format: YYYYMMDD + 000000 + 6 random digits
   * Example: 20251229000000123456
   */
  private async generateReturnNumber(): Promise<string> {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const date = new Date();
      const year = String(date.getFullYear()); // YYYY
      const month = String(date.getMonth() + 1).padStart(2, "0"); // MM
      const day = String(date.getDate()).padStart(2, "0"); // DD
      const dateStr = `${year}${month}${day}`; // YYYYMMDD

      // Random 6 digits
      const randomDigits = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      const returnNo = `${dateStr}${randomDigits}`; // YYYYMMDD + 000000 + 6 random digits

      const existingReturn = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).return.findFirst({
          where: { return_no: returnNo },
          select: { id: true },
        });
      });

      if (!existingReturn) {
        return returnNo;
      }

      attempts++;
    }

    // If all attempts failed (shouldn't happen), use timestamp-based approach
    const timestamp = Date.now().toString().slice(-6);
    const date = new Date();
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}${timestamp}`;
  }

  /**
   * Send return request to supplier-backend
   */
  private async sendReturnToSupplier(
    returnRecord: any,
    product: any,
    tenantId: string
  ): Promise<void> {
    let supplierId = returnRecord.supplier_id;
    let supplierTenantId: string | null = null;

    // ALWAYS try to get supplier_tenant_id from product's linkedManager first (most reliable)
    // This is the same approach as order-return service
    if (product?.productSupplier?.clinicSupplierManager?.linkedManager) {
      const linkedManager =
        product.productSupplier.clinicSupplierManager.linkedManager;

      // CRITICAL FIX: Prioritize supplier_tenant_id from SupplierManager (most reliable)
      // Check if supplier_tenant_id exists and is different from clinic tenant_id
      if (
        linkedManager.supplier_tenant_id &&
        linkedManager.supplier_tenant_id !== tenantId
      ) {
        supplierTenantId = linkedManager.supplier_tenant_id;
        if (!supplierId) {
          supplierId = linkedManager.supplier?.id || null;
        }
      } else if (
        linkedManager.supplier?.tenant_id &&
        linkedManager.supplier.tenant_id !== tenantId
      ) {
        // Fallback: Use supplier.tenant_id if supplier_tenant_id is invalid
        supplierTenantId = linkedManager.supplier.tenant_id;
        if (!supplierId) {
          supplierId = linkedManager.supplier.id;
        }
      } else {
        // Both are missing or equal to clinic tenant_id - this is an error
        this.logger.error(
          `[ReturnService] ❌ linkedManager exists but supplier_tenant_id (${
            linkedManager.supplier_tenant_id
          }) and supplier.tenant_id (${
            linkedManager.supplier?.tenant_id
          }) are both missing or equal to clinic tenant_id (${tenantId}). This indicates incorrect data in the database. linkedManager: ${JSON.stringify(
            {
              id: linkedManager.id,
              supplier_tenant_id: linkedManager.supplier_tenant_id,
              supplier_id: linkedManager.supplier?.id,
              supplier_tenant_id_from_supplier:
                linkedManager.supplier?.tenant_id,
            }
          )}`
        );
      }
    }

    // Agar linkedManager bo'lmasa, lekin ClinicSupplierManager telefon raqami bo'lsa, SMS yuborish
    if (!supplierId) {
      const clinicSupplierManager =
        product?.productSupplier?.clinicSupplierManager;
      const phoneNumber = clinicSupplierManager?.phone_number;

      if (phoneNumber) {
        // ClinicSupplierManager telefon raqamiga to'g'ridan-to'g'ri SMS yuborish

        try {
          // Get clinic details
          const clinic = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).clinic.findFirst({
              where: { tenant_id: tenantId },
              select: { name: true },
            });
          });

          const clinicName = clinic?.name || "알 수 없음";
          const clinicManagerName = returnRecord.manager_name || "알 수 없음";
          // ✅ Product name'ni to'g'ri olish - avval product.name, keyin fallback
          const productName =
            product?.name && product.name.trim() !== ""
              ? product.name
              : "알 수 없음";
          const returnQty = returnRecord.return_qty || 0;
          const totalRefund = returnRecord.total_refund || 0;

          // Generate return_no
          const returnNo = await this.generateReturnNumber();

          // Format SMS message (manual supplier uchun)
          const smsMessage = this.formatReturnSMSMessage(
            returnNo,
            clinicName,
            clinicManagerName,
            productName,
            returnQty,
            totalRefund,
            false, // Manual supplier
            product?.unit || ""
          );

          // Send SMS
          const smsSent = await this.messageService.sendSMS(
            phoneNumber,
            smsMessage
          );

          if (smsSent) {
            // Save return_no to Return record
            await this.prisma.executeWithRetry(async () => {
              return (this.prisma as any).return.update({
                where: { id: returnRecord.id },
                data: { return_no: returnNo },
              });
            });
          } else {
            this.logger.error(
              `[ReturnService] ❌ Failed to send SMS to ClinicSupplierManager (${phoneNumber})`
            );
          }

          // Send Email notification to manual supplier
          try {
            const supplierEmail =
              clinicSupplierManager?.company_email ||
              clinicSupplierManager?.email1 ||
              clinicSupplierManager?.email2 ||
              null;

            if (supplierEmail) {
              const products = [
                {
                  productName: productName,
                  brand: product?.brand || "",
                  quantity: returnQty,
                  unit: product?.unit || "",
                },
              ];

              // ReturnService faqat /returns page (empty box returns - 반납) bilan ishlaydi
              await this.emailService.sendReturnNotificationEmail(
                supplierEmail,
                clinicName,
                returnNo,
                totalRefund,
                returnQty,
                clinicManagerName,
                products,
                "반납"
              );
            } else {
              this.logger.warn(
                `[ReturnService] ⚠️ No supplier email found for return ${returnNo}, skipping email notification`
              );
            }
          } catch (emailError: any) {
            this.logger.error(
              `[ReturnService] Failed to send return notification email: ${emailError.message}`
            );
            // Don't throw - email failure shouldn't break the return process
          }
        } catch (smsError: any) {
          this.logger.error(
            `[ReturnService] Error sending SMS to ClinicSupplierManager: ${
              smsError?.message || "Unknown error"
            }`
          );
        }
      } else {
        this.logger.warn(
          `[ReturnService] Return ${returnRecord.id} has no supplier_id, no linked supplier manager, and no ClinicSupplierManager phone number. Skipping supplier notification.`
        );
      }
      return;
    }

    try {
      // Get supplier details if tenant_id is not already available
      if (!supplierTenantId) {
        if (supplierId) {
          const supplier = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplier.findFirst({
              where: { id: supplierId },
              select: { id: true, tenant_id: true },
            });
          });

          supplierTenantId = supplier.tenant_id;
        } else {
          this.logger.error(
            `[ReturnService] Cannot find supplier tenant_id: no supplierId and no supplierTenantId available`
          );
          return;
        }
      }

      // Validate supplierTenantId is different from clinic tenantId
      // If they're the same, try fetching from Supplier table as a fallback
      if (supplierTenantId === tenantId) {
        this.logger.warn(
          `[ReturnService] ⚠️ WARNING: supplierTenantId (${supplierTenantId}) is the same as clinicTenantId (${tenantId}). Attempting to fetch correct tenant_id from Supplier table...`
        );

        if (supplierId) {
          const supplier = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplier.findFirst({
              where: { id: supplierId },
              select: { id: true, tenant_id: true },
            });
          });

          if (supplier?.tenant_id && supplier.tenant_id !== tenantId) {
            supplierTenantId = supplier.tenant_id;
          } else {
            this.logger.error(
              `[ReturnService] ❌ ERROR: Supplier ${supplierId} has tenant_id (${supplier?.tenant_id}) that is missing or same as clinic tenant_id (${tenantId}). This indicates incorrect data in the database.`
            );
            this.logger.error(
              `[ReturnService] This means the product's supplier is not properly linked to a platform supplier. Please check ProductSupplier -> ClinicSupplierManager -> linkedManager -> supplier relationship.`
            );
            return;
          }
        } else {
          this.logger.error(
            `[ReturnService] ❌ ERROR: supplierTenantId (${supplierTenantId}) is the same as clinicTenantId (${tenantId}) and no supplierId available to fetch correct tenant_id.`
          );
          this.logger.error(
            `[ReturnService] This means the product's supplier is not properly linked to a platform supplier. Please check ProductSupplier -> ClinicSupplierManager -> linkedManager -> supplier relationship.`
          );
          return;
        }
      }

      // Get clinic details
      const clinic = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).clinic.findFirst({
          where: { tenant_id: tenantId },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "알 수 없음";

      // Get clinic manager name
      let clinicManagerName = returnRecord.manager_name || "";
      if (returnRecord.manager_name) {
        const member = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).member.findFirst({
            where: {
              full_name: returnRecord.manager_name,
              tenant_id: tenantId,
            },
            select: { full_name: true },
          });
        });
        if (member?.full_name) {
          clinicManagerName = member.full_name;
        }
      }

      // Generate return_no (format: R + YYYYMMDD + 6 random digits)
      const returnNo = await this.generateReturnNumber();

      // ReturnService faqat /returns page (empty box returns - 반납) bilan ishlaydi
      // Product returns/exchanges order-return.service.ts da boshqariladi
      const returnType = "반납"; // Always 반납 for /returns page
      const emailReturnType = "반납"; // Always 반납 for email notification

      // Get batch inbound date (created_at)
      const batchData = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).batch.findFirst({
          where: { id: returnRecord.batch_id },
          select: { created_at: true },
        });
      });

      const inboundDate = batchData?.created_at
        ? new Date(batchData.created_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      // Get supplierManagerId from linkedManager (faqat shu manager'ga SMS yuboriladi)
      const linkedManager =
        product?.productSupplier?.clinicSupplierManager?.linkedManager;
      const supplierManagerId = linkedManager?.id || null;

      // Prepare return data for supplier
      const returnData = {
        returnNo: returnNo,
        supplierTenantId: supplierTenantId,
        supplierManagerId: supplierManagerId, // Faqat shu manager'ga SMS yuboriladi
        clinicTenantId: tenantId,
        clinicName: clinicName,
        clinicManagerName: clinicManagerName,
        items: [
          {
            productId: returnRecord.product_id,
            productName:
              product?.name && product.name.trim() !== ""
                ? product.name
                : "알 수 없음",
            brand: product?.brand || "",
            quantity: returnRecord.return_qty,
            returnType: returnType,
            memo: returnRecord.memo || "",
            images: [], // /returns page doesn't have images
            inboundDate: inboundDate,
            totalPrice: returnRecord.total_refund || 0,
            orderNo: null, // /returns page doesn't have order_no
            batchNo: returnRecord.batch_no || null,
          },
        ],
        createdAt: returnRecord.return_date
          ? new Date(returnRecord.return_date).toISOString()
          : new Date().toISOString(),
      };

      // Call supplier-backend API
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
        );
        return;
      }

      // Validate supplierTenantId is not clinic tenant_id
      if (supplierTenantId === tenantId) {
        this.logger.error(
          `[ReturnService] ⚠️ ERROR: supplierTenantId (${supplierTenantId}) is the same as clinicTenantId (${tenantId}). This means supplier tenant_id was not found correctly.`
        );
        this.logger.error(
          `[ReturnService] Product supplier info: hasProductSupplier=${!!product?.productSupplier}, hasClinicSupplierManager=${!!product
            ?.productSupplier
            ?.clinicSupplierManager}, hasLinkedManager=${!!product
            ?.productSupplier?.clinicSupplierManager
            ?.linkedManager}, hasSupplier=${!!product?.productSupplier
            ?.clinicSupplierManager?.linkedManager?.supplier}`
        );
        return;
      }

      const response = await fetch(`${supplierApiUrl}/supplier/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(returnData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send return to supplier-backend: ${
            response.status
          } ${errorText}. Request data: ${JSON.stringify(returnData)}`
        );
      } else {
        const result: any = await response.json();

        // Save return_no to Return record
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).return.update({
            where: { id: returnRecord.id },
            data: { return_no: returnNo },
          });
        });
      }

      // Send SMS notification to supplier managers (clinic-backend'da)
      // linkedManager bo'lsa ham SMS yuborish
      if (linkedManager && supplierTenantId) {
        try {
          // Barcha ACTIVE SupplierManager'larni topish
          const allManagers = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierManager.findMany({
              where: {
                supplier_tenant_id: supplierTenantId,
                status: "ACTIVE",
                receive_sms: true,
              },
              select: {
                id: true,
                name: true,
                phone_number: true,
              },
            });
          });

          // Agar supplierManagerId bo'lsa, faqat shu manager'ga SMS yuborish
          // Agar bo'lmasa, barcha ACTIVE manager'larga SMS yuborish
          const managersToNotify = supplierManagerId
            ? allManagers.filter((m: any) => m.id === supplierManagerId)
            : allManagers;

          if (managersToNotify.length > 0) {
            // ✅ Product name'ni to'g'ri olish
            const productName =
              product?.name && product.name.trim() !== ""
                ? product.name
                : "알 수 없음";
            const returnQty = returnRecord.return_qty || 0;
            const totalRefund = returnRecord.total_refund || 0;

            // Format SMS message (platform supplier uchun)
            const smsMessage = this.formatReturnSMSMessage(
              returnNo,
              clinicName,
              clinicManagerName,
              productName,
              returnQty,
              totalRefund,
              true, // Platform supplier
              product?.unit || ""
            );

            // Har bir manager'ga SMS yuborish
            const smsPromises = managersToNotify
              .filter((manager: any) => manager.phone_number)
              .map(async (manager: any) => {
                try {
                  const smsSent = await this.messageService.sendSMS(
                    manager.phone_number,
                    smsMessage
                  );

                  if (smsSent) {
                  } else {
                    this.logger.error(
                      `[ReturnService] ❌ Failed to send SMS to SupplierManager ${manager.name} (${manager.phone_number}) for return ${returnNo}`
                    );
                  }
                } catch (smsError: any) {
                  this.logger.error(
                    `[ReturnService] ❌ Failed to send SMS to SupplierManager ${
                      manager.name
                    } (${manager.phone_number}) for return ${returnNo}: ${
                      smsError?.message || "Unknown error"
                    }`
                  );
                }
              });

            await Promise.all(smsPromises);

            // Send Email notification to supplier managers
            try {
              // Get supplier email addresses (priority: supplierManager.email1 > supplier.company_email)
              const managersWithEmail = await this.prisma.executeWithRetry(
                async () => {
                  return (this.prisma as any).supplierManager.findMany({
                    where: {
                      supplier_tenant_id: supplierTenantId,
                      status: "ACTIVE",
                      id: supplierManagerId
                        ? { in: [supplierManagerId] }
                        : undefined,
                    },
                    select: {
                      id: true,
                      name: true,
                      email1: true,
                      supplier: {
                        select: {
                          company_email: true,
                        },
                      },
                    },
                  });
                }
              );

              // Har bir manager'ga email yuborish
              const emailPromises = managersWithEmail
                .filter((manager: any) => {
                  const email =
                    manager.email1 || manager.supplier?.company_email;
                  return !!email;
                })
                .map(async (manager: any) => {
                  try {
                    const supplierEmail =
                      manager.email1 || manager.supplier?.company_email;

                    if (supplierEmail) {
                      const products = [
                        {
                          productName: productName,
                          brand: product?.brand || "",
                          quantity: returnQty,
                          unit: product?.unit || "",
                        },
                      ];

                      // Template ID'ni environment variable'dan olish
                      const templateId = parseInt(
                        process.env.BREVO_EMPTY_BOX_RETURN_TEMPLATE_ID ||
                          process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID ||
                          "0",
                        10
                      );

                      if (templateId > 0) {
                        // Template ishlatish
                        await this.emailService.sendReturnNotificationEmailWithTemplate(
                          supplierEmail,
                          templateId,
                          clinicName,
                          returnNo,
                          totalRefund,
                          returnQty,
                          clinicManagerName,
                          products,
                          emailReturnType
                        );
                      } else {
                        // Oddiy HTML email (fallback)
                        await this.emailService.sendReturnNotificationEmail(
                          supplierEmail,
                          clinicName,
                          returnNo,
                          totalRefund,
                          returnQty,
                          clinicManagerName,
                          products,
                          emailReturnType
                        );
                      }
                    }
                  } catch (emailError: any) {
                    this.logger.error(
                      `[ReturnService] ❌ Failed to send return notification email to SupplierManager ${
                        manager.name
                      }: ${emailError?.message || "Unknown error"}`
                    );
                  }
                });

              await Promise.all(emailPromises);
            } catch (emailError: any) {
              this.logger.error(
                `[ReturnService] Error sending return notification emails: ${
                  emailError?.message || "Unknown error"
                }`
              );
              // Don't throw - email failure shouldn't break return process
            }
          } else {
            this.logger.warn(
              `[ReturnService] No active managers with SMS enabled found for supplier ${supplierTenantId} (supplierManagerId: ${
                supplierManagerId || "not specified"
              })`
            );
          }
        } catch (smsError: any) {
          this.logger.error(
            `[ReturnService] Error sending SMS to supplier managers: ${
              smsError?.message || "Unknown error"
            }`
          );
          // Don't throw - SMS failure shouldn't break return process
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending return to supplier-backend: ${error.message}`,
        error.stack
      );
      // Don't throw - notification failure shouldn't break return process
    }
  }

  /**
   * Handle partial return acceptance webhook from supplier
   * When supplier accepts less than requested (e.g., 11 out of 12) with reason "추후반납",
   * the unreturned quantity (1) is added back to clinic's available return pool
   */
  async handlePartialReturnAcceptance(dto: {
    returnId: string;
    clinicTenantId: string;
    unreturnedItems: Array<{
      productId: string;
      batchNo: string;
      unreturnedQty: number;
      reason: string;
    }>;
  }) {
    try {
      // Process each unreturned item
      for (const item of dto.unreturnedItems) {
        // Find the Return record(s) that match this product and batch
        // We need to reduce the return_qty by the unreturned amount
        const returns = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).return.findMany({
            where: {
              tenant_id: dto.clinicTenantId,
              product_id: item.productId,
              batch_no: item.batchNo,
              cancelled_at: null,
            },
            orderBy: {
              return_date: "desc", // Most recent first
            },
          });
        });

        if (returns && returns.length > 0) {
          // Find the most recent return that has enough quantity
          let remainingUnreturned = item.unreturnedQty;

          for (const returnRecord of returns) {
            if (remainingUnreturned <= 0) break;

            const currentReturnQty = returnRecord.return_qty;
            const qtyToReduce = Math.min(remainingUnreturned, currentReturnQty);

            if (qtyToReduce > 0) {
              // Reduce the return_qty in the Return record
              const newReturnQty = currentReturnQty - qtyToReduce;

              await this.prisma.executeWithRetry(async () => {
                return (this.prisma as any).return.update({
                  where: { id: returnRecord.id },
                  data: {
                    return_qty: newReturnQty,
                    memo: `${
                      returnRecord.memo || ""
                    }\n[추후반납: -${qtyToReduce} (${new Date().toLocaleDateString()})]`.trim(),
                    updated_at: new Date(),
                  },
                });
              });

              remainingUnreturned -= qtyToReduce;
            }
          }

          if (remainingUnreturned > 0) {
            this.logger.warn(
              `Could not fully restore ${remainingUnreturned} unreturned units for product ${item.productId}, batch ${item.batchNo}`
            );
          }
        } else {
          this.logger.warn(
            `No Return records found for product ${item.productId}, batch ${item.batchNo} in tenant ${dto.clinicTenantId}`
          );
        }
      }

      // Clear the available products cache so the UI shows updated data
      this.availableProductsCache.delete(dto.clinicTenantId);
      this.logger.log(
        `Cleared available products cache for tenant ${dto.clinicTenantId}`
      );

      return {
        success: true,
        message: `Successfully processed ${dto.unreturnedItems.length} unreturned items`,
      };
    } catch (error: any) {
      this.logger.error(
        `Error handling partial return acceptance: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to handle partial return acceptance: ${error.message}`
      );
    }
  }

  /**
   * 플랫폼 미사용 공급사 반납 — 클리닉 [반납 완료]
   */
  async manualCompleteReturn(returnId: string, tenantId: string) {
    await this.assertManualOnlyReturn(returnId, tenantId);

    const row = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).return.findFirst({
        where: { id: returnId, tenant_id: tenantId },
        select: { id: true, clinic_confirmed_at: true, cancelled_at: true },
      });
    });

    if (!row) {
      throw new NotFoundException("반납 내역을 찾을 수 없습니다.");
    }
    if (row.cancelled_at) {
      throw new BadRequestException("취소된 반납입니다.");
    }
    if (row.clinic_confirmed_at) {
      throw new BadRequestException("이미 완료 처리된 반납입니다.");
    }

    await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).return.update({
        where: { id: returnId },
        data: {
          clinic_confirmed_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    this.invalidateCache(tenantId);
    return { success: true };
  }

  /**
   * 플랫폼 미사용 공급사 반납 — 클리닉 [반납 취소] (미반납 수량 복구 = Return 행 삭제)
   */
  async manualCancelReturn(returnId: string, tenantId: string) {
    await this.assertManualOnlyReturn(returnId, tenantId);

    const row = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).return.findFirst({
        where: { id: returnId, tenant_id: tenantId },
        select: { id: true, clinic_confirmed_at: true, cancelled_at: true },
      });
    });

    if (!row) {
      throw new NotFoundException("반납 내역을 찾을 수 없습니다.");
    }
    if (row.cancelled_at) {
      throw new BadRequestException("이미 취소된 반납입니다.");
    }
    if (row.clinic_confirmed_at) {
      throw new BadRequestException("완료된 반납은 취소할 수 없습니다.");
    }

    await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).return.update({
        where: { id: returnId },
        data: {
          cancelled_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    this.invalidateCache(tenantId);
    return { success: true };
  }

  private async assertManualOnlyReturn(returnId: string, tenantId: string) {
    const notifCount = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierReturnNotification.count({
        where: { return_id: returnId },
      });
    });

    if (notifCount > 0) {
      throw new BadRequestException(
        "플랫폼 공급사와 연결된 반납은 수동 완료·취소를 사용할 수 없습니다."
      );
    }

    const ret = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).return.findFirst({
        where: { id: returnId, tenant_id: tenantId },
        include: {
          product: {
            include: {
              productSupplier: {
                include: {
                  clinicSupplierManager: {
                    include: {
                      linkedManager: { include: { supplier: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    if (!ret) {
      throw new NotFoundException("반납 내역을 찾을 수 없습니다.");
    }

    const platformLinked =
      !!ret.product?.productSupplier?.clinicSupplierManager?.linkedManager
        ?.supplier;

    if (platformLinked) {
      throw new BadRequestException(
        "플랫폼 연동 공급사 제품은 수동 완료·취소를 사용할 수 없습니다."
      );
    }
  }
}
