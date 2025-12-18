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

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

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
          memo: true, // Empty box return'larini aniqlash uchun
        },
      });
    });

    // 2. Product ID va Outbound ID bo'yicha guruhlash (Map ishlatish - tezroq)
    const returnedByProduct = new Map<string, number>();
    const returnedByOutbound = new Map<string, number>();
    // Empty box return'larini alohida hisoblash
    const emptyBoxReturnsByProduct = new Map<string, number>();

    allReturns.forEach((ret: any) => {
      // Product bo'yicha qaytarilgan miqdorni yig'ish
      if (ret.product_id) {
        const productSum = returnedByProduct.get(ret.product_id) || 0;
        returnedByProduct.set(ret.product_id, productSum + (ret.return_qty || 0));
        
        // Empty box return'larni alohida hisoblash (memo ichida "자동 반납: 빈 박스" bor bo'lsa)
        if (ret.memo && ret.memo.includes("자동 반납: 빈 박스")) {
          const emptyBoxSum = emptyBoxReturnsByProduct.get(ret.product_id) || 0;
          emptyBoxReturnsByProduct.set(ret.product_id, emptyBoxSum + (ret.return_qty || 0));
        }
      }

      // Outbound bo'yicha qaytarilgan miqdorni yig'ish
      if (ret.outbound_id) {
        const outboundSum = returnedByOutbound.get(ret.outbound_id) || 0;
        returnedByOutbound.set(ret.outbound_id, outboundSum + (ret.return_qty || 0));
      }
    });

    // 3. Barcha product'larni olish (is_returnable = true bo'lganlar)
    console.log(`\n🔍 [getAvailableProducts] Querying products with is_returnable=true...`);
    console.log(`  tenantId: ${tenantId}`);
    
    // Avval barcha product'larni olish (debug uchun)
    const allProductsCount = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).product.count({
        where: { tenant_id: tenantId },
      });
    });
    console.log(`  Total products in DB: ${allProductsCount}`);
    
    // ReturnPolicy bilan product'larni olish (debug uchun)
    const productsWithReturnPolicy = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).product.findMany({
        where: { 
          tenant_id: tenantId,
          returnPolicy: { isNot: null }, // returnPolicy mavjud bo'lganlar (Prisma'da isNot camelCase)
        },
        select: {
          id: true,
          name: true,
          returnPolicy: {
            select: {
              is_returnable: true,
            },
          },
        },
      });
    });
    console.log(`  Products with returnPolicy: ${productsWithReturnPolicy.length}`);
    productsWithReturnPolicy.forEach((p: any) => {
      console.log(`    - ${p.name}: is_returnable=${p.returnPolicy?.is_returnable}`);
    });
    
    const products = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).product.findMany({
        where: {
          tenant_id: tenantId,
          OR: [
            { returnPolicy: null }, // returnPolicy null bo'lsa ham qo'shish
            { returnPolicy: { is_returnable: true } }, // is_returnable = true bo'lsa qo'shish
          ],
        },
        select: {
          id: true,
          name: true,
          brand: true,
          unit: true,
          usage_capacity: true, // 사용 단위 uchun
          capacity_per_product: true, // 사용 단위 uchun
          returnPolicy: {
            select: {
              is_returnable: true,
              refund_amount: true,
            },
          },
          supplierProducts: {
            take: 1,
            orderBy: { created_at: "desc" },
          },
          batches: {
            take: 1,
            orderBy: { created_at: "desc" },
            select: {
              storage: true,
              used_count: true, // 사용 단위 uchun
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
    
    console.log(`  Products found (returnPolicy=null OR is_returnable=true): ${products.length}`);

    // 4. Har bir product uchun qaytarilishi mumkin bo'lgan miqdorni hisoblash (Map'lardan foydalanish)
    console.log(`\n🔍 [getAvailableProducts] Processing ${products.length} products...`);
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

        // 사용 단위 mantiqi: used_count va capacity_per_product asosida empty boxes hisoblash (avval hisoblash)
        let emptyBoxes: number | undefined = undefined;
        if (product.usage_capacity && product.usage_capacity > 0 && product.capacity_per_product && product.capacity_per_product > 0) {
          // Latest batch'ning used_count'ini olish
          const latestBatch = product.batches?.[0];
          const usedCount = latestBatch?.used_count || 0;
          
          // previousEmptyBoxes = Math.floor(used_count / capacity_per_product)
          const previousEmptyBoxes = Math.floor(usedCount / product.capacity_per_product);
          
          // Return qilingan empty box'lar sonini olish (faqat empty box return'lar)
          const returnedEmptyBoxes = emptyBoxReturnsByProduct.get(product.id) || 0;
          
          // Qolgan empty box'lar soni: previousEmptyBoxes - returnedEmptyBoxes
          emptyBoxes = Math.max(0, previousEmptyBoxes - returnedEmptyBoxes);
        }

        console.log(`  Product ${product.name}: unreturnedQty=${unreturnedQty}, emptyBoxes=${emptyBoxes !== undefined ? emptyBoxes : 'undefined'}, totalOutbound=${totalOutbound}, totalReturned=${totalReturned}`);

        // Agar qaytarilishi mumkin bo'lgan miqdor 0 yoki kichik bo'lsa VA emptyBoxes ham 0 yoki undefined bo'lsa, o'tkazib yuborish
        // Lekin agar unreturnedQty > 0 yoki emptyBoxes > 0 bo'lsa, product'ni ko'rsatish
        if (unreturnedQty <= 0 && (emptyBoxes === undefined || emptyBoxes <= 0)) {
          console.log(`    ❌ Filtered out: unreturnedQty=${unreturnedQty} <= 0 && emptyBoxes=${emptyBoxes !== undefined ? emptyBoxes : 'undefined'} <= 0 (or undefined)`);
          return null;
        }
        
        console.log(`    ✅ Product included: unreturnedQty=${unreturnedQty} > 0 ${emptyBoxes !== undefined ? `OR emptyBoxes=${emptyBoxes} > 0` : '(emptyBoxes undefined, using unreturnedQty only)'}`);

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
          emptyBoxes, // 사용 단위 mantiqi: bo'sh box'lar soni (previousEmptyBoxes)
          refundAmount: product.returnPolicy?.refund_amount ?? 0,
          batches: batchDetails.filter((b: any) => b.availableQty > 0),
        };
      })
      .filter((p: any) => p !== null);

    // Null qiymatlarni olib tashlash va faqat qaytarilishi mumkin bo'lganlarni qaytarish
    console.log(`✅ [getAvailableProducts] Returning ${availableProducts.length} available products\n`);
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
              select: {
                id: true,
                batch_no: true,
                used_count: true, // 사용 단위 uchun
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

            // 6. Supplier ID olish (supplierProducts orqali)
            const supplierId = product.supplierProducts?.[0]?.supplier_id || undefined;

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
            
            // Product'ning usage_capacity va capacity_per_product ni tekshirish
            if (productDetails?.usage_capacity && productDetails.usage_capacity > 0 && 
                productDetails?.capacity_per_product && productDetails.capacity_per_product > 0) {
              
              // Batch'ning used_count'ini olish (allaqachon olingan, lekin select'da bor)
              const usedCount = batch.used_count || 0;
              
              // Qolgan empty box'lar sonini hisoblash
              const previousEmptyBoxes = Math.floor(usedCount / productDetails.capacity_per_product);
              
              // Return qilingan empty box'lar sonini olish (hozirgi return'dan oldin)
              const emptyBoxReturns = await (tx as any).return.findMany({
                where: {
                  product_id: item.productId,
                  tenant_id: tenantId,
                  memo: { contains: "자동 반납: 빈 박스" },
                },
                select: { return_qty: true },
              });
              
              const returnedEmptyBoxes = emptyBoxReturns.reduce((sum: number, ret: any) => sum + (ret.return_qty || 0), 0);
              const availableEmptyBoxes = previousEmptyBoxes - returnedEmptyBoxes;
              
              // Agar return qilinayotgan miqdor available empty boxes dan kichik yoki teng bo'lsa, bu empty box return
              if (availableEmptyBoxes > 0 && item.returnQty <= availableEmptyBoxes) {
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
            if (returnRecord.supplier_id) {
              this.sendReturnToSupplier(returnRecord, product, tenantId)
                .catch((error) => {
                  // Log error but don't fail the return process
                  this.logger.error(
                    `Failed to send return to supplier-backend for return ${returnRecord.id}:`,
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

  /**
   * Handle return accept webhook from supplier (for /returns page)
   */
  async handleReturnAccept(dto: { return_no: string; status: string }) {
    try {
      this.logger.log(`Received return accept webhook: return_no=${dto.return_no}, status=${dto.status}`);

      // Find return by return_no
      const returnRecord = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).return.findFirst({
          where: { return_no: dto.return_no },
        });
      });

      if (!returnRecord) {
        this.logger.warn(`Return not found for return_no: ${dto.return_no}`);
        return { success: false, message: `Return not found for return_no: ${dto.return_no}` };
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

      this.logger.log(`Return accept webhook processed for return_no: ${dto.return_no}, return_id: ${returnRecord.id}, SupplierReturnNotification status updated to ACCEPTED`);
      
      return { success: true, message: "Return accept webhook processed" };
    } catch (error: any) {
      this.logger.error(`Error handling return accept: ${error.message}`, error.stack);
      return { success: false, message: `Failed to handle return accept: ${error.message}` };
    }
  }

  /**
   * Generate unique return number for /returns page
   * Format: R + YYYYMMDD + 6 random digits
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
      const returnNo = `R${dateStr}${randomDigits}`;

      // Check if this return_no already exists in OrderReturn table
      // (to avoid conflicts, since both OrderReturn and Return send to supplier-backend)
      const existing = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.findFirst({
          where: { return_no: returnNo },
          select: { id: true },
        });
      });

      // If not exists, return this number
      if (!existing) {
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
    return `R${year}${month}${day}${timestamp}`;
  }

  /**
   * Send return request to supplier-backend
   */
  private async sendReturnToSupplier(
    returnRecord: any,
    product: any,
    tenantId: string
  ): Promise<void> {
    if (!returnRecord.supplier_id) {
      this.logger.warn(
        `Return ${returnRecord.id} has no supplier_id, skipping supplier notification`
      );
      return;
    }

    try {
      // Get supplier details
      const supplier = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplier.findFirst({
          where: { id: returnRecord.supplier_id },
          select: { tenant_id: true },
        });
      });

      if (!supplier || !supplier.tenant_id) {
        this.logger.warn(
          `Supplier ${returnRecord.supplier_id} not found or missing tenant_id`
        );
        return;
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

      // Determine return type based on memo
      // /returns page'dan kelgan product'lar "불량|반품" format'ida bo'lishi kerak
      // (chunki bu outbound'dan kelgan defective product'lar)
      let returnType = "불량|반품"; // Default for /returns page (defective products from outbound)
      if (returnRecord.memo && returnRecord.memo.includes("자동 반납: 빈 박스")) {
        returnType = "불량|반품"; // Empty box is also a return, not exchange
      }

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

      // Prepare return data for supplier
      const returnData = {
        returnNo: returnNo,
        supplierTenantId: supplier.tenant_id,
        clinicTenantId: tenantId,
        clinicName: clinicName,
        clinicManagerName: clinicManagerName,
        items: [
          {
            productName: product.name || "",
            brand: product.brand || "",
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
        process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
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
          `Failed to send return to supplier-backend: ${response.status} ${errorText}`
        );
      } else {
        const result: any = await response.json();
        this.logger.log(
          `Return ${returnNo} sent to supplier-backend successfully: ${result.id || "OK"}`
        );

        // Save return_no to Return record
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).return.update({
            where: { id: returnRecord.id },
            data: { return_no: returnNo },
          });
        });
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending return to supplier-backend: ${error.message}`,
        error.stack
      );
      // Don't throw - notification failure shouldn't break return process
    }
  }
}

