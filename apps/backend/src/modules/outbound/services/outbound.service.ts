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

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    @Inject(forwardRef(() => OrderReturnService))
    private readonly orderReturnService: OrderReturnService,
    private readonly returnRepository: ReturnRepository
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
          console.log(
            `\n========== [createOutbound - 사용 단위 Debug] ==========`
          );
          console.log(`Product ID: ${dto.productId}`);
          console.log(`Batch ID: ${dto.batchId}`);
          console.log(`product found: ${!!product}`);
          if (product) {
            console.log(`usage_capacity: ${product.usage_capacity}`);
            console.log(
              `capacity_per_product: ${product.capacity_per_product}`
            );
            console.log(`returnPolicy:`, JSON.stringify(product.returnPolicy));
          }
          console.log(`==================================================\n`);

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

            console.log(`  currentUsedCount (before): ${currentUsedCount}`);
            console.log(`  currentBatchQty (before): ${currentBatchQty}`);
            console.log(`  outboundQty: ${dto.outboundQty}`);
            console.log(`  product.usage_capacity: ${product.usage_capacity}`);
            console.log(
              `  product.capacity_per_product: ${product.capacity_per_product}`
            );

            // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
            // Masalan: outboundQty = 5, usage_capacity = 1 → usageIncrement = 5 (1 * 5)
            const usageIncrement = product.usage_capacity * dto.outboundQty;
            const newUsedCount = currentUsedCount + usageIncrement;
            console.log(
              `  usageIncrement: ${usageIncrement} (= ${product.usage_capacity} * ${dto.outboundQty})`
            );
            console.log(`  newUsedCount (after): ${newUsedCount}`);

            // Bo'sh box aniqlash: yangilanishdan oldin va keyin
            const previousEmptyBoxes = Math.floor(
              currentUsedCount / product.capacity_per_product
            );
            const newEmptyBoxes = Math.floor(
              newUsedCount / product.capacity_per_product
            );
            const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

            console.log(
              `  previousEmptyBoxes: ${previousEmptyBoxes}, newEmptyBoxes: ${newEmptyBoxes}, emptyBoxesToCreate: ${emptyBoxesToCreate}`
            );

            // ✅ YANGI: Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
            // Masalan: capacity_per_product = 5, outboundQty = 5, usage_capacity = 1
            // usageIncrement = 5, emptyBoxesToCreate = 1
            // batchQtyDecrement = 1 box (5 emas!)
            batchQtyDecrement = emptyBoxesToCreate;

            console.log(
              `  📦 Batch qty decrement: ${batchQtyDecrement} (to'liq ishlatilgan box'lar)`
            );
            console.log(
              `  📦 Note: Empty boxes are shown in Return page, but not automatically created in Return table`
            );

            // used_count ni yangilash
            const updatedBatch = await tx.batch.update({
              where: { id: dto.batchId },
              data: { used_count: newUsedCount },
            });
            console.log(
              `  ✅ used_count updated to: ${updatedBatch.used_count}`
            );

            // Empty box'lar avtomatik Return jadvaliga yozilmaydi
            // Ular faqat Return page'da ko'rsatiladi va user xohlagan paytda return qiladi
          } else {
            console.log(
              `  ❌ Shart bajarilmadi! usage_capacity yoki capacity_per_product yo'q yoki 0`
            );
            console.log(
              `  📦 Using default batch qty decrement: ${batchQtyDecrement}`
            );
          }

          // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)
          await tx.batch.update({
            where: { id: dto.batchId },
            data: { qty: { decrement: batchQtyDecrement } },
          });
          console.log(`  ✅ Batch qty decremented by: ${batchQtyDecrement}`);

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

    // Product'larni olish (capacity_per_product va usage_capacity uchun)
    console.log(`\n📦 [createBulkOutbound] Product'larni olish...`);
    console.log(`  productIds:`, productIds);
    console.log(`  tenantId:`, tenantId);

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

    console.log(`  Found ${products.length} products`);
    products.forEach((p: any) => {
      console.log(
        `    - Product ID: ${p.id}, usage_capacity: ${p.usage_capacity}, capacity_per_product: ${p.capacity_per_product}`
      );
    });

    const productMap = new Map(products.map((p: any) => [p.id, p]));
    console.log(`  productMap size: ${productMap.size}`);

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

            console.log(
              `\n========== [createBulkOutbound - 사용 단위 Debug] ==========`
            );
            console.log(`Product ID: ${item.productId}`);
            console.log(`Batch ID: ${item.batchId}`);
            console.log(`product found: ${!!product}`);
            if (product) {
              console.log(`usage_capacity: ${product.usage_capacity}`);
              console.log(
                `capacity_per_product: ${product.capacity_per_product}`
              );
              console.log(
                `returnPolicy:`,
                JSON.stringify(product.returnPolicy)
              );
            } else {
              console.log(`❌ Product not found in productMap!`);
              console.log(
                `Available product IDs:`,
                Array.from(productMap.keys())
              );
            }
            console.log(`==================================================\n`);

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

              console.log(`  currentUsedCount (before): ${currentUsedCount}`);
              console.log(`  currentBatchQty (before): ${currentBatchQty}`);
              console.log(`  outboundQty: ${item.outboundQty}`);
              console.log(
                `  product.usage_capacity: ${product.usage_capacity}`
              );
              console.log(
                `  product.capacity_per_product: ${product.capacity_per_product}`
              );

              // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
              // Masalan: outboundQty = 5, usage_capacity = 1 → usageIncrement = 5 (1 * 5)
              const usageIncrement = product.usage_capacity * item.outboundQty;
              const newUsedCount = currentUsedCount + usageIncrement;
              console.log(
                `  usageIncrement: ${usageIncrement} (= ${product.usage_capacity} * ${item.outboundQty})`
              );
              console.log(`  newUsedCount (after): ${newUsedCount}`);

              // Bo'sh box aniqlash: yangilanishdan oldin va keyin
              const previousEmptyBoxes = Math.floor(
                currentUsedCount / product.capacity_per_product
              );
              const newEmptyBoxes = Math.floor(
                newUsedCount / product.capacity_per_product
              );
              const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

              console.log(
                `  previousEmptyBoxes: ${previousEmptyBoxes}, newEmptyBoxes: ${newEmptyBoxes}, emptyBoxesToCreate: ${emptyBoxesToCreate}`
              );

              // ✅ YANGI: Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
              // Masalan: capacity_per_product = 5, outboundQty = 5, usage_capacity = 1
              // usageIncrement = 5, emptyBoxesToCreate = 1
              // batchQtyDecrement = 1 box (5 emas!)
              batchQtyDecrement = emptyBoxesToCreate;

              console.log(
                `  📦 Batch qty decrement: ${batchQtyDecrement} (to'liq ishlatilgan box'lar)`
              );
              console.log(
                `  📦 Note: Empty boxes are shown in Return page, but not automatically created in Return table`
              );

              // used_count ni yangilash
              const updatedBatch = await tx.batch.update({
                where: { id: item.batchId },
                data: { used_count: newUsedCount },
              });
              console.log(
                `  ✅ used_count updated to: ${updatedBatch.used_count}`
              );

              // Empty box'lar avtomatik Return jadvaliga yozilmaydi
              // Ular faqat Return page'da ko'rsatiladi va user xohlagan paytda return qiladi
            } else {
              console.log(
                `  ❌ Shart bajarilmadi! usage_capacity yoki capacity_per_product yo'q yoki 0`
              );
              console.log(
                `  📦 Using default batch qty decrement: ${batchQtyDecrement}`
              );
            }

            // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)
            await tx.batch.update({
              where: { id: item.batchId },
              data: { qty: { decrement: batchQtyDecrement } },
            });
            console.log(`  ✅ Batch qty decremented by: ${batchQtyDecrement}`);

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

    // Get both Outbound and PackageOutbound records
    const [outbounds, packageOutbounds, outboundTotal, packageOutboundTotal] =
      await Promise.all([
        // Regular outbounds (제품 출고)
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
          orderBy: { outbound_date: "desc" },
          skip,
          take: limit,
        }),
        // Package outbounds (패키지 출고)
        (this.prisma as any).packageOutbound.findMany({
          where: {
            tenant_id: tenantId,
            ...(filters?.startDate || filters?.endDate
              ? {
                  outbound_date: {
                    ...(filters.startDate ? { gte: filters.startDate } : {}),
                    ...(filters.endDate ? { lte: filters.endDate } : {}),
                  },
                }
              : {}),
            ...(filters?.productId ? { product_id: filters.productId } : {}),
            ...(filters?.packageId ? { package_id: filters.packageId } : {}),
            ...(filters?.managerName
              ? {
                  manager_name: {
                    contains: filters.managerName,
                    mode: "insensitive",
                  },
                }
              : {}),
            ...(filters?.search
              ? {
                  OR: [
                    {
                      product: {
                        name: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      product: {
                        brand: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      manager_name: {
                        contains: filters.search.toLowerCase().trim(),
                        mode: "insensitive",
                      },
                    },
                    {
                      batch: {
                        batch_no: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
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
            package: {
              include: {
                items: {
                  include: {
                    product: {
                      select: {
                        id: true,
                        name: true,
                        brand: true,
                        unit: true,
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
        }),
        (this.prisma as any).outbound.count({ where }),
        (this.prisma as any).packageOutbound.count({
          where: {
            tenant_id: tenantId,
            ...(filters?.startDate || filters?.endDate
              ? {
                  outbound_date: {
                    ...(filters.startDate ? { gte: filters.startDate } : {}),
                    ...(filters.endDate ? { lte: filters.endDate } : {}),
                  },
                }
              : {}),
            ...(filters?.productId ? { product_id: filters.productId } : {}),
            ...(filters?.packageId ? { package_id: filters.packageId } : {}),
            ...(filters?.managerName
              ? {
                  manager_name: {
                    contains: filters.managerName,
                    mode: "insensitive",
                  },
                }
              : {}),
            ...(filters?.search
              ? {
                  OR: [
                    {
                      product: {
                        name: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      product: {
                        brand: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      manager_name: {
                        contains: filters.search.toLowerCase().trim(),
                        mode: "insensitive",
                      },
                    },
                    {
                      batch: {
                        batch_no: {
                          contains: filters.search.toLowerCase().trim(),
                          mode: "insensitive",
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
        }),
      ]);

    // Get package items for all package outbounds
    const packageIds = [
      ...new Set(
        packageOutbounds.map((p: any) => p.package_id).filter(Boolean)
      ),
    ];
    const packagesWithItems: Record<string, any> = {};

    if (packageIds.length > 0) {
      const packages = await (this.prisma as any).package.findMany({
        where: {
          id: { in: packageIds },
          tenant_id: tenantId,
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  unit: true,
                  sale_price: true,
                },
              },
            },
            orderBy: {
              order: "asc",
            },
          },
        },
      });

      packages.forEach((pkg: any) => {
        packagesWithItems[pkg.id] = pkg;
      });
    }

    // Combine and sort all outbounds (both Outbound and PackageOutbound)
    const allOutbounds = [
      ...outbounds.map((outbound: any) => ({
        ...outbound,
        _type: "outbound" as const,
      })),
      ...packageOutbounds.map((pkgOutbound: any) => ({
        ...pkgOutbound,
        _type: "packageOutbound" as const,
        packageWithItems: packagesWithItems[pkgOutbound.package_id] || null,
      })),
    ]
      .sort((a, b) => {
        const dateA = new Date(a.outbound_date || a.outboundDate).getTime();
        const dateB = new Date(b.outbound_date || b.outboundDate).getTime();
        return dateB - dateA; // 최신순
      })
      .slice(0, limit); // Pagination

    const total = outboundTotal + packageOutboundTotal;

    // Response format - 패키지 출고와 단품 출고 구분 표시
    return {
      items: allOutbounds.map((item: any) => {
        if (item._type === "packageOutbound") {
          // PackageOutbound record
          // package_qty is the number of packages outbounded
          // For display, we'll show package_qty, but actual product quantity
          // would need to be calculated from package items
          // For now, we'll use package_qty as the display quantity

          // Get package items
          const packageItems =
            item.packageWithItems?.items || item.package?.items || [];

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
            packageName:
              item.package_name ||
              item.package?.name ||
              item.packageWithItems?.name ||
              null, // 패키지명 (denormalized yoki relation)
            packageQty: item.package_qty, // 패키지 수량
            packageItems: packageItems.map((pkgItem: any) => ({
              productId: pkgItem.product_id || pkgItem.product?.id,
              productName: pkgItem.product?.name || "",
              brand: pkgItem.product?.brand || "",
              unit: pkgItem.product?.unit || "",
              quantity: pkgItem.quantity || 1,
              salePrice: pkgItem.product?.sale_price || 0,
            })),
            product: {
              id: item.product?.id,
              name: item.product?.name,
              brand: item.product?.brand,
              category: item.product?.category,
              salePrice: item.product?.sale_price,
              unit: item.product?.unit,
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
          productStockUpdates.set(
            item.productId,
            currentDecrement + item.outboundQty
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
  async createUnifiedOutbound(dto: UnifiedOutboundDto, tenantId: string) {
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

    // Product'larni olish (capacity_per_product va usage_capacity uchun)
    console.log(`\n📦 [createUnifiedOutbound] Product'larni olish...`);
    console.log(`  productIds:`, productIds);
    console.log(`  tenantId:`, tenantId);

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

    console.log(`  Found ${products.length} products`);
    products.forEach((p: any) => {
      console.log(
        `    - Product ID: ${p.id}, usage_capacity: ${p.usage_capacity}, capacity_per_product: ${p.capacity_per_product}`
      );
    });

    const productMap = new Map(products.map((p: any) => [p.id, p]));
    console.log(`  productMap size: ${productMap.size}`);

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

    // Debug: Transaction boshlanishidan oldin
    console.log(`\n🔵 [createUnifiedOutbound] Transaction boshlanmoqda...`);
    console.log(`  validItems count: ${validItems.length}`);
    console.log(`  productMap size: ${productMap.size}`);

    return this.prisma.$transaction(
      async (tx: any) => {
        console.log(`\n🟢 [createUnifiedOutbound] Transaction ichida...`);
        const createdOutbounds: any[] = [];
        const createdPackageOutbounds: any[] = [];
        const logs: any[] = [];
        // Product'larni bir marta yangilash uchun map
        const productStockUpdates: Map<string, number> = new Map<
          string,
          number
        >();

        // Package outbound uchun package items va package names'ni olish
        const packageItemsMap = new Map<string, number>(); // packageId -> package item quantity
        const packageNamesMap = new Map<string, string>(); // packageId -> package name
        if (dto.outboundType === "패키지") {
          const packageIds = [
            ...new Set(
              validItems.map((item) => item.packageId).filter(Boolean)
            ),
          ];
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
        }

        for (const item of validItems) {
          console.log(
            `\n🔄 Processing item: Product ID: ${item.productId}, Batch ID: ${item.batchId}`
          );
          const batch = batches.find(
            (b: any) => b.id === item.batchId && b.product_id === item.productId
          ) as any;

          if (!batch) {
            failedItems.push(item);
            continue;
          }

          try {
            // Package outbound bo'lsa, PackageOutbound tablega yozish
            if (dto.outboundType === "패키지" && item.packageId) {
              // Package qty'ni frontend'dan olish yoki hisoblash
              let packageQty = item.packageQty;
              if (!packageQty) {
                // Fallback: outboundQty / package item quantity
                const packageItemKey = `${item.packageId}-${item.productId}`;
                const packageItemQuantity =
                  packageItemsMap.get(packageItemKey) || 1;
                packageQty = Math.floor(item.outboundQty / packageItemQuantity);
              }

              // Get package name
              const packageName =
                packageNamesMap.get(item.packageId || "") || null;

              const packageOutbound = await (tx as any).packageOutbound.create({
                data: {
                  tenant_id: tenantId,
                  package_id: item.packageId,
                  package_name: packageName, // Denormalized package name
                  product_id: item.productId,
                  batch_id: item.batchId,
                  package_qty: packageQty,
                  manager_name: dto.managerName,
                  chart_number: dto.chartNumber ?? null,
                  memo: dto.memo ?? null,
                  is_damaged: dto.isDamaged || false,
                  is_defective: dto.isDefective || false,
                },
              });

              createdPackageOutbounds.push(packageOutbound);
              console.log(
                `  ✅ PackageOutbound created: package_qty=${packageQty}`
              );
            } else {
              // Product outbound bo'lsa, Outbound tablega yozish
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
                  package_id: null, // Product outbound'da package_id null
                  created_by: null, // TODO: User ID qo'shish
                },
              });

              createdOutbounds.push(outbound);
            }

            // 사용 단위 mantiqi: used_count yangilash va bo'sh box aniqlash
            const product = productMap.get(item.productId);

            // Debug log - har bir outbound uchun (ALWAYS LOG)
            console.log(`\n========== [사용 단위 Debug] ==========`);
            console.log(`Product ID: ${item.productId}`);
            console.log(`Batch ID: ${item.batchId}`);
            console.log(`productMap size: ${productMap.size}`);
            console.log(`product found: ${!!product}`);
            if (product) {
              console.log(`usage_capacity: ${product.usage_capacity}`);
              console.log(
                `capacity_per_product: ${product.capacity_per_product}`
              );
              console.log(
                `returnPolicy:`,
                JSON.stringify(product.returnPolicy)
              );
            } else {
              console.log(`❌ Product not found in productMap!`);
              console.log(
                `Available product IDs:`,
                Array.from(productMap.keys())
              );
            }
            console.log(`=====================================\n`);

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

              console.log(`  currentUsedCount (before):`, currentUsedCount);
              console.log(`  currentBatchQty (before):`, currentBatchQty);
              console.log(`  outboundQty: ${item.outboundQty}`);
              console.log(
                `  product.usage_capacity: ${product.usage_capacity}`
              );
              console.log(
                `  product.capacity_per_product: ${product.capacity_per_product}`
              );

              // usage_capacity qo'shish: har bir outbound product uchun usage_capacity qo'shiladi
              // Masalan: outboundQty = 5, usage_capacity = 1 → usageIncrement = 5 (1 * 5)
              const usageIncrement = product.usage_capacity * item.outboundQty;
              const newUsedCount = currentUsedCount + usageIncrement;
              console.log(
                `  usageIncrement: ${usageIncrement} (= ${product.usage_capacity} * ${item.outboundQty})`
              );
              console.log(`  newUsedCount (after):`, newUsedCount);

              // Bo'sh box aniqlash: yangilanishdan oldin va keyin
              const previousEmptyBoxes = Math.floor(
                currentUsedCount / product.capacity_per_product
              );
              const newEmptyBoxes = Math.floor(
                newUsedCount / product.capacity_per_product
              );
              const emptyBoxesToCreate = newEmptyBoxes - previousEmptyBoxes;

              console.log(
                `  previousEmptyBoxes: ${previousEmptyBoxes}, newEmptyBoxes: ${newEmptyBoxes}, emptyBoxesToCreate: ${emptyBoxesToCreate}`
              );

              // ✅ YANGI: Batch qty dan faqat to'liq ishlatilgan box'larni kamaytirish
              // Masalan: capacity_per_product = 5, outboundQty = 5, usage_capacity = 1
              // usageIncrement = 5, emptyBoxesToCreate = 1
              // batchQtyDecrement = 1 box (5 emas!)
              batchQtyDecrement = emptyBoxesToCreate;

              console.log(
                `  📦 Batch qty decrement: ${batchQtyDecrement} (to'liq ishlatilgan box'lar)`
              );
              console.log(
                `  📦 Note: Empty boxes are shown in Return page, but not automatically created in Return table`
              );

              // used_count ni yangilash
              const updatedBatch = await tx.batch.update({
                where: { id: item.batchId },
                data: { used_count: newUsedCount },
              });
              console.log(
                `  ✅ used_count updated to:`,
                updatedBatch.used_count
              );
            } else {
              console.log(
                `  ❌ Shart bajarilmadi! usage_capacity yoki capacity_per_product yo'q yoki 0`
              );
              console.log(
                `  📦 Using default batch qty decrement: ${batchQtyDecrement}`
              );
            }

            // Batch qty ni kamaytirish (faqat to'liq ishlatilgan box'lar yoki default)
            await tx.batch.update({
              where: { id: item.batchId },
              data: { qty: { decrement: batchQtyDecrement } },
            });
            console.log(`  ✅ Batch qty decremented by: ${batchQtyDecrement}`);

            // Product stock yangilash uchun yig'ish (to'liq ishlatilgan box'lar yoki default)
            const currentDecrement =
              productStockUpdates.get(item.productId) || 0;
            productStockUpdates.set(
              item.productId,
              currentDecrement + batchQtyDecrement
            );

            // 출고 로그 생성
            const recordId =
              dto.outboundType === "패키지" && item.packageId
                ? createdPackageOutbounds[createdPackageOutbounds.length - 1]
                    ?.id
                : createdOutbounds[createdOutbounds.length - 1]?.id;

            const log = {
              outboundId: recordId || null,
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
          } catch (error) {
            // Transaction ichida xato bo'lsa, itemni failed qilish
            console.error(
              `Failed to process outbound for item ${item.productId}:`,
              error
            );
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
          packageOutboundIds: createdPackageOutbounds.map((o: any) => o.id),
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
        const currentIncrement =
          productStockUpdates.get(outbound.product_id) || 0;
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
