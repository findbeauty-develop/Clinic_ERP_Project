import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { ReturnRepository } from "../repositories/return.repository";
import { CreateReturnDto, CreateReturnItemDto } from "../dto/create-return.dto";

@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly returnRepository: ReturnRepository
  ) {}

  /**
   * Qaytarilishi mumkin bo'lgan mahsulotlarni olish
   * 미반납 수량 = Chiqarilgan miqdor - Qaytarilgan miqdor
   */
  async getAvailableProducts(tenantId: string, search?: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // 1. Barcha product'larni olish (is_returnable = true bo'lganlar)
    const products = await (this.prisma as any).product.findMany({
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

    // 2. Har bir product uchun qaytarilishi mumkin bo'lgan miqdorni hisoblash
    const availableProducts = await Promise.all(
      products.map(async (product: any) => {
        // Chiqarilgan jami miqdor
        const totalOutbound = (product.outbounds || []).reduce(
          (sum: number, outbound: any) => sum + (outbound.outbound_qty || 0),
          0
        );

        // Qaytarilgan jami miqdor
        const totalReturned =
          await this.returnRepository.getReturnedQuantity(
            product.id,
            tenantId
          );

        // Qaytarilishi mumkin bo'lgan miqdor
        const unreturnedQty = totalOutbound - totalReturned;

        // Agar qaytarilishi mumkin bo'lgan miqdor 0 yoki kichik bo'lsa, o'tkazib yuborish
        if (unreturnedQty <= 0) {
          return null;
        }

        // Batch'lar bo'yicha tafsilotlar
        const batchDetails = await Promise.all(
          (product.outbounds || []).map(async (outbound: any) => {
            const batchReturned =
              await this.returnRepository.getReturnedQuantityByOutbound(
                outbound.id,
                tenantId
              );
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
          })
        );

        // Supplier ma'lumotlari
        const supplier = product.supplierProducts?.[0];

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
          supplierId: supplier?.supplier_id ?? null,
          supplierName: supplier?.supplier_id ?? null, // Bu yerda supplier nomini olish kerak (agar Catalog model bo'lsa)
          storageLocation: product.batches?.[0]?.storage ?? null, // Latest batch storage location
          unreturnedQty,
          refundAmount: product.returnPolicy?.refund_amount ?? 0,
          batches: batchDetails.filter((b: any) => b.availableQty > 0),
        };
      })
    );

    // Null qiymatlarni olib tashlash va faqat qaytarilishi mumkin bo'lganlarni qaytarish
    return availableProducts.filter((p) => p !== null);
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

            // 6. Supplier ID olish
            const supplier = product.supplierProducts?.[0];
            const supplierId = supplier?.supplier_id ?? null;

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

