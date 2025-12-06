import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";
import { ReturnRepository } from "../repositories/return.repository";
import { SupplierReturnNotificationService } from "./supplier-return-notification.service";
import { CreateReturnDto, CreateReturnItemDto } from "../dto/create-return.dto";

@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly returnRepository: ReturnRepository,
    private readonly supplierReturnNotificationService: SupplierReturnNotificationService
  ) {}

  /**
   * Qaytarilishi mumkin bo'lgan mahsulotlarni olish
   * 미반납 수량 = Chiqarilgan miqdor - Qaytarilgan miqdor
   * Optimized: N+1 query muammosini hal qilish - barcha return'larni bir marta olish
   */
  async getAvailableProducts(tenantId: string, search?: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // 1. Barcha return'larni bir marta olish (optimizatsiya: N+1 query muammosini hal qilish)
    const allReturns = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).return.findMany({
        where: { tenant_id: tenantId },
        select: {
          product_id: true,
          outbound_id: true,
          return_qty: true,
        },
      });
    });

    // 2. Product ID va Outbound ID bo'yicha guruhlash (Map ishlatish - tezroq)
    const returnedByProduct = new Map<string, number>();
    const returnedByOutbound = new Map<string, number>();

    allReturns.forEach((ret: any) => {
      // Product bo'yicha qaytarilgan miqdorni yig'ish
      if (ret.product_id) {
        const productSum = returnedByProduct.get(ret.product_id) || 0;
        returnedByProduct.set(ret.product_id, productSum + (ret.return_qty || 0));
      }

      // Outbound bo'yicha qaytarilgan miqdorni yig'ish
      if (ret.outbound_id) {
        const outboundSum = returnedByOutbound.get(ret.outbound_id) || 0;
        returnedByOutbound.set(ret.outbound_id, outboundSum + (ret.return_qty || 0));
      }
    });

    // 3. Barcha product'larni olish (is_returnable = true bo'lganlar)
    const products = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).product.findMany({
        where: {
          tenant_id: tenantId,
          returnPolicy: {
            is_returnable: true,
          },
        },
        include: {
          returnPolicy: true,
          supplierProducts: {
            take: 1, // Birinchi supplier'ni olish
            orderBy: { created_at: "desc" },
          },
          batches: {
            take: 1, // Latest batch for storage location
            orderBy: { created_at: "desc" },
            select: {
              storage: true,
            },
          },
          outbounds: {
            select: {
              id: true,
              batch_id: true,
              batch_no: true,
              outbound_qty: true,
              outbound_date: true,
              manager_name: true,
            },
          },
        },
      });
    });

    // 4. Har bir product uchun qaytarilishi mumkin bo'lgan miqdorni hisoblash (Map'lardan foydalanish)
    const availableProducts = products
      .map((product: any) => {
        // Chiqarilgan jami miqdor
        const totalOutbound = (product.outbounds || []).reduce(
          (sum: number, outbound: any) => sum + (outbound.outbound_qty || 0),
          0
        );

        // Qaytarilgan jami miqdor (Map'dan olish - alohida query yo'q!)
        const totalReturned = returnedByProduct.get(product.id) || 0;

        // Qaytarilishi mumkin bo'lgan miqdor
        const unreturnedQty = totalOutbound - totalReturned;

        // Agar qaytarilishi mumkin bo'lgan miqdor 0 yoki kichik bo'lsa, o'tkazib yuborish
        if (unreturnedQty <= 0) {
          return null;
        }

        // Batch'lar bo'yicha tafsilotlar (Map'dan olish - alohida query yo'q!)
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

        // Search filter
        if (search && search.trim()) {
          const searchLower = search.toLowerCase().trim();
          const nameMatch = product.name?.toLowerCase().includes(searchLower);
          const brandMatch = product.brand?.toLowerCase().includes(searchLower);
          const batchMatch = batchDetails.some((b: any) =>
            b.batchNo?.toLowerCase().includes(searchLower)
          );

          if (!nameMatch && !brandMatch && !batchMatch) {
            return null;
          }
        }

        return {
          productId: product.id,
          productName: product.name,
          brand: product.brand,
          unit: product.unit,
          supplierId: null, // Supplier ID - optional field
          supplierName: null, // Supplier name not available from SupplierProduct
          storageLocation: product.batches?.[0]?.storage ?? null, // Latest batch storage location
          unreturnedQty,
          refundAmount: product.returnPolicy?.refund_amount ?? 0,
          batches: batchDetails.filter((b: any) => b.availableQty > 0),
        };
      })
      .filter((p: any) => p !== null);

    // Null qiymatlarni olib tashlash va faqat qaytarilishi mumkin bo'lganlarni qaytarish
    return availableProducts;
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

    return await this.prisma.$transaction(
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
                supplierProducts: {
                  take: 1,
                  orderBy: { created_at: "desc" },
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

            // 6. Supplier ID - optional field, set to undefined if not available
            const supplierId = undefined;

            // 7. Refund amount olish
            const refundAmount = product.returnPolicy?.refund_amount ?? 0;
            const totalRefund = item.returnQty * refundAmount;

            // 8. Return yozuvini yaratish
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
                memo: dto.memo,
              },
              tx
            );

            // 9. Batch stock'ini yangilash
            await (tx as any).batch.update({
              where: { id: item.batchId },
              data: {
                qty: {
                  increment: item.returnQty,
                },
              },
            });

            // 10. Product stock'ini yangilash
            await (tx as any).product.update({
              where: { id: item.productId },
              data: {
                current_stock: {
                  increment: item.returnQty,
                },
              },
            });

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
        for (const returnRecord of createdReturns) {
          // Product'ni qayta olish (transaction tashqarisida)
          const product = await (this.prisma as any).product.findFirst({
            where: {
              id: returnRecord.product_id,
              tenant_id: tenantId,
            },
            include: {
              supplierProducts: {
                orderBy: { created_at: "desc" },
              },
            },
          });

          if (product) {
            this.supplierReturnNotificationService
              .createNotificationsForReturn(returnRecord, product, tenantId)
              .catch((error) => {
                // Log error but don't fail the return process
                console.error(
                  `Failed to create supplier notifications for return ${returnRecord.id}:`,
                  error
                );
              });
          }
        }

        return {
          success: true,
          returns: createdReturns,
          errors: errors.length > 0 ? errors : undefined,
        };
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );
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
}

