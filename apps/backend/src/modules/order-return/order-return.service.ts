import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { MessageService } from "../member/services/message.service";
import { EmailService } from "../member/services/email.service";
import { saveBase64Images } from "../../common/utils/upload.utils";
import { CacheManager } from "../../common/cache";

@Injectable()
export class OrderReturnService {
  private readonly logger = new Logger(OrderReturnService.name);

  // ✅ Replaced Map with CacheManager
  private returnsCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService
  ) {
    this.returnsCache = new CacheManager({
      maxSize: 100,
      ttl: 5000, // 30 seconds
      cleanupInterval: 60000,
      name: "OrderReturnService",
    });
  }

  async getReturns(tenantId: string, status?: string) {
    // Check cache first
    const cacheKey = `${tenantId}:${status || "all"}`;
    const cached = this.returnsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const data = await this.prisma.executeWithRetry(async () => {
      // 1. Barcha return'larni bir marta olish (faqat kerakli fieldlar)
      const returns = await (this.prisma as any).orderReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          return_no: true,
          return_type: true,
          return_quantity: true,
          status: true,
          memo: true,
          images: true,
          return_manager: true,
          supplier_id: true,
          product_id: true,
          outbound_id: true,
          order_no: true,
          batch_no: true,
          inbound_date: true,
          created_at: true,
          unit_price: true,
          total_quantity: true,
          product_name: true,
          brand: true,
          order_id: true,
          updated_at: true,
        },
      });

      if (returns.length === 0) {
        return [];
      }

      // 2. Barcha unique ID'larni yig'ish
      const supplierIds = [
        ...new Set(returns.map((r: any) => r.supplier_id).filter(Boolean)),
      ];
      const productIds = [
        ...new Set(returns.map((r: any) => r.product_id).filter(Boolean)),
      ];
      const outboundIds = [
        ...new Set(returns.map((r: any) => r.outbound_id).filter(Boolean)),
      ];
      const returnManagerIds = [
        ...new Set(returns.map((r: any) => r.return_manager).filter(Boolean)),
      ];

      // 3. Parallel fetching - barcha ma'lumotlarni bir marta olish
      const [suppliers, products, outbounds, members] = await Promise.all([
        supplierIds.length > 0
          ? (this.prisma as any).supplier.findMany({
              where: { id: { in: supplierIds } },
              select: {
                id: true,
                company_name: true,
                managers: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  orderBy: { created_at: "asc" },
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    phone_number: true,
                    email1: true,
                  },
                },
              },
            })
          : [],
        productIds.length > 0
          ? (this.prisma as any).product.findMany({
              where: { id: { in: productIds } },
              select: {
                id: true,
                name: true,
              },
            })
          : [],
        outboundIds.length > 0
          ? (this.prisma as any).outbound.findMany({
              where: { id: { in: outboundIds }, tenant_id: tenantId },
              select: {
                id: true,
                product_id: true,
              },
            })
          : [],
        returnManagerIds.length > 0
          ? (this.prisma as any).member.findMany({
              where: {
                OR: [
                  { member_id: { in: returnManagerIds } },
                  { full_name: { in: returnManagerIds } },
                ],
                tenant_id: tenantId,
              },
              select: {
                member_id: true,
                full_name: true,
              },
            })
          : [],
      ]);

      // 4. ProductSupplier'larni olish (FAQAT supplier_id yo'q bo'lgan return'lar uchun)
      // ✅ Optimization: Faqat kerakli product'lar uchun query
      const productsNeedingSupplier = new Set<string>();

      // Return'lar orasida supplier_id yo'q bo'lganlarni topish
      returns.forEach((r: any) => {
        if (!r.supplier_id && r.product_id) {
          productsNeedingSupplier.add(r.product_id);
        }
      });

      // Outbound'lar orasida supplier_id yo'q bo'lganlarni topish
      outbounds.forEach((o: any) => {
        // Outbound'ning product_id'si bo'lsa va supplier_id yo'q bo'lsa
        if (o.product_id) {
          // Return'larni tekshirish
          const hasReturnWithoutSupplier = returns.some(
            (r: any) => r.outbound_id === o.id && !r.supplier_id
          );
          if (hasReturnWithoutSupplier) {
            productsNeedingSupplier.add(o.product_id);
          }
        }
      });

      const productSuppliersMap = new Map();
      if (productsNeedingSupplier.size > 0) {
        this.logger.debug(
          `🔍 [ProductSupplier Query] Querying for ${productsNeedingSupplier.size} products (out of ${returns.length} returns)`
        );

        const productSuppliers = await (
          this.prisma as any
        ).productSupplier.findMany({
          where: {
            product_id: { in: Array.from(productsNeedingSupplier) },
            tenant_id: tenantId,
          },
          select: {
            product_id: true,
            clinicSupplierManager: {
              select: {
                company_name: true,
                name: true,
                position: true,
                phone_number: true,
                email1: true,
                linkedManager: {
                  select: {
                    supplier: {
                      select: {
                        company_name: true,
                        managers: {
                          where: { status: "ACTIVE" },
                          take: 1,
                          orderBy: { created_at: "asc" },
                          select: {
                            id: true,
                            name: true,
                            position: true,
                            phone_number: true,
                            email1: true,
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

        productSuppliers.forEach((ps: any) => {
          productSuppliersMap.set(ps.product_id, ps);
        });

        this.logger.debug(
          `✅ [ProductSupplier Query] Found ${productSuppliers.length} product suppliers`
        );
      } else {
        this.logger.debug(
          `⚡ [ProductSupplier Query] Skipped - all returns have supplier_id`
        );
      }

      // 5. Map'lar yaratish tez lookup uchun
      const supplierMap = new Map(suppliers.map((s: any) => [s.id, s]));
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      const outboundMap = new Map(outbounds.map((o: any) => [o.id, o]));
      const memberMap = new Map();
      members.forEach((m: any) => {
        memberMap.set(m.member_id, m);
        memberMap.set(m.full_name, m);
      });

      // 6. Return'larni enrich qilish (N+1 problem yo'q)
      const returnsWithSupplier = returns.map((returnItem: any) => {
        let supplierName = "알 수 없음";
        let managerName = "";
        let managerPosition = "";
        let managerPhone = "";
        let managerEmail = "";
        let supplierManagerId = null;
        let returnManagerName = "";

        // Return manager name
        if (returnItem.return_manager) {
          const member = memberMap.get(returnItem.return_manager);
          returnManagerName = member?.full_name || returnItem.return_manager;
        }

        // Supplier info
        if (returnItem.supplier_id) {
          const supplier = supplierMap.get(returnItem.supplier_id) as any;
          if (supplier) {
            supplierName = supplier.company_name || "알 수 없음";
            const manager = supplier.managers?.[0];
            managerName = manager?.name || "";
            managerPosition = manager?.position || "";
            managerPhone = manager?.phone_number || "";
            managerEmail = manager?.email1 || "";
            supplierManagerId = manager?.id || null;
          } else if (returnItem.product_id) {
            // Fallback: Try via ProductSupplier
            const productSupplier = productSuppliersMap.get(
              returnItem.product_id
            );
            if (productSupplier?.clinicSupplierManager) {
              const clinicManager = productSupplier.clinicSupplierManager;
              if (clinicManager.linkedManager?.supplier) {
                const platformSupplier = clinicManager.linkedManager.supplier;
                supplierName =
                  platformSupplier.company_name ||
                  clinicManager.company_name ||
                  "알 수 없음";
                const manager = platformSupplier.managers?.[0];
                managerName = manager?.name || clinicManager.name || "";
                managerPosition =
                  manager?.position || clinicManager.position || "";
                managerPhone =
                  manager?.phone_number || clinicManager.phone_number || "";
                managerEmail = manager?.email1 || clinicManager.email1 || "";
                supplierManagerId = manager?.id || null;
              } else {
                supplierName = clinicManager.company_name || "알 수 없음";
                managerName = clinicManager.name || "";
                managerPosition = clinicManager.position || "";
                managerPhone = clinicManager.phone_number || "";
                managerEmail = clinicManager.email1 || "";
                supplierManagerId = null;
              }
            }
          }
        } else if (returnItem.outbound_id) {
          // For defective products from outbound
          const outbound = outboundMap.get(returnItem.outbound_id) as any;
          if (outbound?.product_id) {
            const productSupplier = productSuppliersMap.get(
              outbound.product_id
            ) as any;
            if (productSupplier?.clinicSupplierManager) {
              const clinicManager = productSupplier.clinicSupplierManager;
              if (clinicManager.linkedManager?.supplier) {
                const platformSupplier = clinicManager.linkedManager.supplier;
                supplierName =
                  platformSupplier.company_name ||
                  clinicManager.company_name ||
                  "알 수 없음";
                const manager = platformSupplier.managers?.[0];
                managerName = manager?.name || clinicManager.name || "";
                managerPosition =
                  manager?.position || clinicManager.position || "";
                managerPhone =
                  manager?.phone_number || clinicManager.phone_number || "";
                managerEmail = manager?.email1 || clinicManager.email1 || "";
                supplierManagerId = manager?.id || null;
              } else {
                supplierName = clinicManager.company_name || "알 수 없음";
                managerName = clinicManager.name || "";
                managerPosition = clinicManager.position || "";
                managerPhone = clinicManager.phone_number || "";
                managerEmail = clinicManager.email1 || "";
                supplierManagerId = null;
              }
            }
          }
        }

        return {
          ...returnItem,
          supplierName,
          managerName,
          managerPosition,
          managerPhone,
          managerEmail,
          supplierManagerId,
          returnManagerName,
          product_name:
            (productMap.get(returnItem.product_id) as any)?.name ||
            "알 수 없음",
        };
      });

      return returnsWithSupplier;
    });

    // Cache'ga saqlash
    this.returnsCache.set(cacheKey, data);

    return data;
  }

  private invalidateCache(tenantId: string) {
    // Remove all cache entries for this tenant using deletePattern
    const deleted = this.returnsCache.deletePattern(`^${tenantId}:`);
    this.logger.debug(
      `Invalidated ${deleted} cache entries for tenant: ${tenantId}`
    );
  }

  async createFromInbound(tenantId: string, dto: any) {
    const { orderId, orderNo, items } = dto;

    if (!items || items.length === 0) {
      return { message: "No returns to create" };
    }

    if (!orderId || !orderNo) {
      throw new BadRequestException("orderId and orderNo are required");
    }

    try {
      // Get supplier_id from order
      const order = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).order.findFirst({
          where: { id: orderId, tenant_id: tenantId },
          select: { supplier_id: true },
        });
      });

      // Get return manager: try to find member_id from inboundManager
      let returnManager = dto.returnManager || null;
      if (!returnManager && dto.inboundManager) {
        // Try to find member by member_id first, then by full_name
        const member = await (this.prisma as any).member.findFirst({
          where: {
            OR: [
              { member_id: dto.inboundManager },
              { full_name: dto.inboundManager },
            ],
            tenant_id: tenantId,
          },
          select: {
            member_id: true,
          },
        });
        returnManager = member?.member_id || dto.inboundManager; // Fallback to original value if not found
      }

      // Get batch created_at dates for inbound_date
      const batchNos = items.map((item: any) => item.batchNo).filter(Boolean);
      const batches = await this.prisma.executeWithRetry(async () => {
        if (batchNos.length === 0) return [];
        return (this.prisma as any).batch.findMany({
          where: {
            batch_no: { in: batchNos },
            tenant_id: tenantId,
          },
          select: {
            batch_no: true,
            created_at: true,
          },
        });
      });

      const batchDateMap = new Map(
        batches.map((b: any) => [b.batch_no, b.created_at])
      );

      const returns = await this.prisma.executeWithRetry(async () => {
        return Promise.all(
          items.map((item: any) => {
            const batchCreatedAt = batchDateMap.get(item.batchNo);
            return (this.prisma as any).orderReturn.create({
              data: {
                tenant_id: tenantId,
                order_id: orderId,
                order_no: orderNo,
                batch_no: item.batchNo,
                product_id: item.productId,
                product_name: item.productName,
                brand: item.brand || null,
                return_quantity: item.returnQuantity,
                total_quantity: item.totalQuantity,
                unit_price: item.unitPrice,
                return_type: "주문|반품",
                status: "pending",
                supplier_id: order?.supplier_id || null,
                return_manager: returnManager,
                inbound_date: batchCreatedAt || new Date(),
              },
            });
          })
        );
      });

      return { created: returns.length, returns };
    } catch (error: any) {
      console.error(`❌ Error creating returns:`, error);
      throw new BadRequestException(
        `Failed to create returns: ${error?.message || "Unknown error"}`
      );
    }
  }

  /**
   * Generate unique return number: B + YYYYMMDD + 6 random digits
   * Checks database to ensure uniqueness
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
      const returnNo = `B${dateStr}${randomDigits}`;

      // Check if this return_no already exists in OrderReturn table
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

    // If all attempts failed, throw error
    throw new BadRequestException(
      "Failed to generate unique return number after multiple attempts"
    );
  }

  async processReturn(tenantId: string, id: string, dto: any) {
    // Invalidate cache
    this.invalidateCache(tenantId);

    // Get return item first to check if it already has return_no
    const returnItem = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).orderReturn.findFirst({
        where: { id, tenant_id: tenantId },
      });
    });

    if (!returnItem) {
      throw new BadRequestException("Return not found");
    }

    // Save images if provided
    let imageUrls: string[] = [];
    if (dto.images && dto.images.length > 0) {
      imageUrls = await saveBase64Images("returns", dto.images, tenantId);
    }

    // Generate return number if not exists
    const returnNo =
      returnItem.return_no || (await this.generateReturnNumber());

    // Update return with all data
    const finalImages =
      imageUrls.length > 0 ? imageUrls : returnItem.images || [];

    // Determine return_type BEFORE database update (so we can use it for supplier notification)
    const existingReturnType = returnItem.return_type || "";
    const dtoReturnType = dto.return_type || "";

    let finalReturnType: string;
    if (existingReturnType.startsWith("불량")) {
      // Defective product - if dto.return_type contains "교환", use "불량|교환", otherwise keep existing
      if (dtoReturnType && dtoReturnType.includes("교환")) {
        finalReturnType = "불량|교환"; // For exchanges page
      } else if (dtoReturnType && dtoReturnType.includes("반품")) {
        finalReturnType = "불량|반품";
      } else {
        // Keep existing type
        finalReturnType = existingReturnType;
      }
    } else if (
      dtoReturnType &&
      (dtoReturnType.startsWith("주문") || dtoReturnType.startsWith("불량"))
    ) {
      // Use dto.return_type if provided and valid
      finalReturnType = dtoReturnType;
    } else {
      // Default: "주문|교환" for order returns (order-returns page -> exchanges page)
      finalReturnType = "주문|교환";
    }

    const updatedReturn = await this.prisma.executeWithRetry(async () => {
      const updateData: any = {
        return_no: returnNo,
        return_manager: dto.returnManager || null,
        memo: dto.memo || null,
        images: finalImages,
        status: "pending", // Keep as pending until supplier confirms
        updated_at: new Date(),
        return_type: finalReturnType, // Set the determined return_type
      };

      return (this.prisma as any).orderReturn.update({
        where: { id, tenant_id: tenantId },
        data: updateData,
      });
    });

    // Ensure images and updated return_type are included in the return object for sending to supplier
    const returnWithImages = {
      ...updatedReturn,
      return_type: finalReturnType, // Use the determined return_type
      images: finalImages,
    };

    // Send to supplier-backend
    try {
      await this.sendReturnToSupplier(returnWithImages, tenantId);

      // After successfully sending to supplier, update status to "processing"
      const finalReturn = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.update({
          where: { id, tenant_id: tenantId },
          data: {
            status: "processing",
            updated_at: new Date(),
          },
        });
      });

      return finalReturn;
    } catch (error: any) {
      this.logger.error(
        `Failed to send return to supplier: ${error.message}`,
        error.stack
      );
      // Don't throw - return is already processed, supplier notification is optional
      // But still return the updated return with "pending" status
      return updatedReturn;
    }
  }

  /**
   * Send return request to supplier-backend
   */
  private async sendReturnToSupplier(returnItem: any, tenantId: string) {
    // Get supplierManagerId from return item or fetch via product_id
    let supplierManagerId = returnItem.supplierManagerId;
    let supplierTenantId: string | null = null;

    // If supplierManagerId not in return item, fetch it via product_id
    if (!supplierManagerId && returnItem.product_id) {
      try {
        const productSupplier = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).productSupplier.findFirst({
            where: {
              product_id: returnItem.product_id,
              tenant_id: tenantId,
            },
            include: {
              clinicSupplierManager: {
                include: {
                  linkedManager: {
                    select: {
                      id: true,
                      supplier_tenant_id: true, // This is the correct field for supplier tenant_id
                      supplier: {
                        select: { tenant_id: true },
                      },
                    },
                  },
                },
              },
            },
          });
        });

        if (productSupplier?.clinicSupplierManager?.linkedManager) {
          const linkedManager =
            productSupplier.clinicSupplierManager.linkedManager;
          supplierManagerId = linkedManager.id;
          // Use supplier_tenant_id first (most reliable), fallback to supplier.tenant_id
          supplierTenantId =
            linkedManager.supplier_tenant_id ||
            linkedManager.supplier?.tenant_id ||
            null;
        } else if (productSupplier?.clinicSupplierManager) {
          // Manual supplier - send email/SMS notification directly (no platform API call)
          const clinicSupplierManager = productSupplier.clinicSupplierManager;

          try {
            // Get clinic details
            const clinic = await this.prisma.executeWithRetry(async () => {
              return (this.prisma as any).clinic.findFirst({
                where: { tenant_id: tenantId },
                select: { name: true },
              });
            });

            const clinicName = clinic?.name || "알 수 없음";

            // Get clinic manager name
            let clinicManagerName = returnItem.return_manager || "";
            if (returnItem.return_manager) {
              const member = await this.prisma.executeWithRetry(async () => {
                return (this.prisma as any).member.findFirst({
                  where: {
                    member_id: returnItem.return_manager,
                    tenant_id: tenantId,
                  },
                  select: { full_name: true },
                });
              });
              if (member?.full_name) {
                clinicManagerName = member.full_name;
              } else {
                clinicManagerName = returnItem.return_manager;
              }
            }

            // Get product details
            const product = await this.prisma.executeWithRetry(async () => {
              return (this.prisma as any).product.findFirst({
                where: { id: returnItem.product_id },
                select: { name: true, brand: true, unit: true },
              });
            });

            // ✅ Product name'ni to'g'ri olish - avval product.name, keyin returnItem.product_name
            const productName =
              product?.name && product.name.trim() !== ""
                ? product.name
                : returnItem.product_name &&
                    returnItem.product_name.trim() !== ""
                  ? returnItem.product_name
                  : "알 수 없음";
            const returnQty = returnItem.return_quantity || 0;
            const totalRefund = (returnItem.unit_price || 0) * returnQty;
            const returnNo = returnItem.return_no;

            // Determine return type (반품 or 교환)
            const returnTypeText = returnItem.return_type?.includes("교환")
              ? "교환"
              : "반품";

            // Send SMS notification
            const phoneNumber =
              clinicSupplierManager.phone_number ||
              clinicSupplierManager.email1 ||
              null;

            if (phoneNumber) {
              try {
                const smsMessage = `[반품/교환 알림]
${clinicName}에서 ${productName} ${returnQty}${product?.unit ? ` ${product.unit}` : ""} ${returnTypeText} 요청이 있습니다.
반품번호: ${returnNo}
확인 후 처리해주세요.`;

                await this.messageService.sendSMS(phoneNumber, smsMessage);
              } catch (smsError: any) {
                this.logger.error(
                  `Failed to send SMS to manual supplier: ${smsError.message}`
                );
              }
            }

            // Send Email notification
            const supplierEmail =
              clinicSupplierManager.company_email ||
              clinicSupplierManager.email1 ||
              clinicSupplierManager.email2 ||
              null;

            if (supplierEmail) {
              const products = [
                {
                  productName: productName,
                  brand: product?.brand || returnItem.brand || "",
                  quantity: returnQty,
                  unit: product?.unit || "",
                },
              ];

              // Template ID'ni environment variable'dan olish
              const templateId = parseInt(
                process.env.BREVO_PRODUCT_RETURN_TEMPLATE_ID ||
                  process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID ||
                  "0",
                10
              );

              if (templateId > 0) {
                await this.emailService.sendReturnNotificationEmailWithTemplate(
                  supplierEmail,
                  templateId,
                  clinicName,
                  returnNo,
                  totalRefund,
                  returnQty,
                  clinicManagerName,
                  products,
                  returnTypeText
                );
              } else {
                await this.emailService.sendReturnNotificationEmail(
                  supplierEmail,
                  clinicName,
                  returnNo,
                  totalRefund,
                  returnQty,
                  clinicManagerName,
                  products,
                  returnTypeText
                );
              }
            } else {
              this.logger.warn(
                `No email found for manual supplier, skipping email notification for return ${returnNo}`
              );
            }
          } catch (error: any) {
            this.logger.error(
              `Error sending notification to manual supplier: ${error.message}`
            );
            // Don't throw - notification failure shouldn't break return process
          }

          return; // Manual supplier - no platform API call needed
        }
      } catch (error: any) {
        this.logger.error(`Error fetching supplierManagerId: ${error.message}`);
      }
    }

    // Fallback 1: Try via supplier_id (old method)
    if (!supplierManagerId && returnItem.supplier_id) {
      try {
        const supplier = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplier.findUnique({
            where: { id: returnItem.supplier_id },
            include: {
              managers: {
                where: { status: "ACTIVE" },
                take: 1,
                orderBy: { created_at: "asc" },
              },
            },
          });
        });

        if (supplier?.managers?.[0]) {
          supplierManagerId = supplier.managers[0].id;
          supplierTenantId = supplier.tenant_id;
        }
      } catch (error: any) {
        this.logger.error(
          `Error fetching supplier via supplier_id: ${error.message}`
        );
      }
    }

    // Fallback 2: For defective products (불량), try via outbound_id -> product -> ProductSupplier
    if (!supplierManagerId && returnItem.outbound_id) {
      try {
        const outbound = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).outbound.findFirst({
            where: { id: returnItem.outbound_id, tenant_id: tenantId },
            include: {
              product: {
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
                                select: { tenant_id: true },
                              },
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
        });

        if (
          outbound?.product?.productSupplier?.clinicSupplierManager
            ?.linkedManager
        ) {
          const linkedManager =
            outbound.product.productSupplier.clinicSupplierManager
              .linkedManager;
          supplierManagerId = linkedManager.id;
          // Use supplier_tenant_id first (most reliable), fallback to supplier.tenant_id
          supplierTenantId =
            linkedManager.supplier_tenant_id ||
            linkedManager.supplier?.tenant_id ||
            null;
        } else if (outbound?.product?.productSupplier?.clinicSupplierManager) {
          // Manual supplier - send email/SMS notification directly (no platform API call)
          const clinicSupplierManager =
            outbound.product.productSupplier.clinicSupplierManager;

          try {
            // Get clinic details
            const clinic = await this.prisma.executeWithRetry(async () => {
              return (this.prisma as any).clinic.findFirst({
                where: { tenant_id: tenantId },
                select: { name: true },
              });
            });

            const clinicName = clinic?.name || "알 수 없음";

            // Get clinic manager name
            let clinicManagerName = returnItem.return_manager || "";
            if (returnItem.return_manager) {
              const member = await this.prisma.executeWithRetry(async () => {
                return (this.prisma as any).member.findFirst({
                  where: {
                    member_id: returnItem.return_manager,
                    tenant_id: tenantId,
                  },
                  select: { full_name: true },
                });
              });
              if (member?.full_name) {
                clinicManagerName = member.full_name;
              } else {
                clinicManagerName = returnItem.return_manager;
              }
            }

            // Get product details
            let product = null;
            if (outbound?.product?.id) {
              // Agar outbound.product include qilingan bo'lsa, lekin name bo'lmasligi mumkin
              // Shuning uchun yana fetch qilish kerak
              product = await this.prisma.executeWithRetry(async () => {
                return (this.prisma as any).product.findFirst({
                  where: { id: returnItem.product_id || outbound.product.id },
                  select: { name: true, brand: true, unit: true },
                });
              });
            } else {
              product = await this.prisma.executeWithRetry(async () => {
                return (this.prisma as any).product.findFirst({
                  where: { id: returnItem.product_id },
                  select: { name: true, brand: true, unit: true },
                });
              });
            }

            // ✅ Product name'ni to'g'ri olish
            const productName =
              product?.name && product.name.trim() !== ""
                ? product.name
                : returnItem.product_name &&
                    returnItem.product_name.trim() !== ""
                  ? returnItem.product_name
                  : "알 수 없음";
            const returnQty = returnItem.return_quantity || 0;
            const totalRefund = (returnItem.unit_price || 0) * returnQty;
            const returnNo = returnItem.return_no;

            // Determine return type (반품 or 교환)
            const returnTypeText = returnItem.return_type?.includes("교환")
              ? "교환"
              : "반품";

            // Send SMS notification
            const phoneNumber =
              clinicSupplierManager.phone_number ||
              clinicSupplierManager.email1 ||
              null;

            if (phoneNumber) {
              try {
                const smsMessage = `[반품/교환 알림]
${clinicName}에서 ${productName} ${returnQty}${product?.unit ? ` ${product.unit}` : ""} ${returnTypeText} 요청이 있습니다.
반품번호: ${returnNo}
확인 후 처리해주세요.`;

                await this.messageService.sendSMS(phoneNumber, smsMessage);
              } catch (smsError: any) {
                this.logger.error(
                  `Failed to send SMS to manual supplier: ${smsError.message}`
                );
              }
            }

            // Send Email notification
            const supplierEmail =
              clinicSupplierManager.company_email ||
              clinicSupplierManager.email1 ||
              clinicSupplierManager.email2 ||
              null;

            if (supplierEmail) {
              const products = [
                {
                  productName: productName,
                  brand: product?.brand || returnItem.brand || "",
                  quantity: returnQty,
                  unit: product?.unit || "",
                },
              ];

              // Template ID'ni environment variable'dan olish
              const templateId = parseInt(
                process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID || "0",
                10
              );

              if (templateId > 0) {
                await this.emailService.sendReturnNotificationEmailWithTemplate(
                  supplierEmail,
                  templateId,
                  clinicName,
                  returnNo,
                  totalRefund,
                  returnQty,
                  clinicManagerName,
                  products,
                  returnTypeText
                );
              } else {
                await this.emailService.sendReturnNotificationEmail(
                  supplierEmail,
                  clinicName,
                  returnNo,
                  totalRefund,
                  returnQty,
                  clinicManagerName,
                  products,
                  returnTypeText
                );
              }
            } else {
              this.logger.warn(
                `No email found for manual supplier, skipping email notification for return ${returnNo}`
              );
            }
          } catch (error: any) {
            this.logger.error(
              `Error sending notification to manual supplier: ${error.message}`
            );
            // Don't throw - notification failure shouldn't break return process
          }

          return; // Manual supplier - no platform API call needed
        }
      } catch (error: any) {
        this.logger.error(
          `Error fetching supplier via outbound_id: ${error.message}`
        );
      }
    }

    try {
      // Get clinic details
      const clinic = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).clinic.findFirst({
          where: { tenant_id: tenantId },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "알 수 없음";

      // Get clinic manager name (return_manager)
      // return_manager can be either a member_id or a name
      let clinicManagerName = returnItem.return_manager || "";
      if (returnItem.return_manager) {
        const member = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).member.findFirst({
            where: {
              member_id: returnItem.return_manager,
              tenant_id: tenantId,
            },
            select: { full_name: true },
          });
        });
        if (member?.full_name) {
          clinicManagerName = member.full_name;
        } else {
          // If not found by member_id, assume it's already a name
          clinicManagerName = returnItem.return_manager;
        }
      }

      // Prepare return data for supplier
      const imagesArray = Array.isArray(returnItem.images)
        ? returnItem.images
        : returnItem.images
          ? [returnItem.images]
          : [];

      // Debug log for images

      const returnData = {
        returnNo: returnItem.return_no,
        supplierTenantId: supplierTenantId,
        supplierManagerId: supplierManagerId, // Add supplierManagerId for supplier-backend
        clinicTenantId: tenantId,
        clinicName: clinicName,
        clinicManagerName: clinicManagerName,
        items: [
          {
            productName: returnItem.product_name,
            brand: returnItem.brand || "",
            quantity: returnItem.return_quantity,
            returnType: returnItem.return_type, // Should be "주문|교환" or "불량|교환" etc.
            memo: returnItem.memo || "",
            images: imagesArray,
            inboundDate: returnItem.inbound_date
              ? new Date(returnItem.inbound_date).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0],
            totalPrice: returnItem.unit_price * returnItem.return_quantity,
            orderNo: returnItem.order_no || null,
            batchNo: returnItem.batch_no || null,
          },
        ],
        createdAt: returnItem.created_at.toISOString(),
      };

      // Fetch supplier phone number for SMS notification
      let supplierPhoneNumber: string | null = null;
      try {
        if (supplierManagerId) {
          // Try to get phone from SupplierManager
          const supplierManager = await this.prisma.executeWithRetry(
            async () => {
              return (this.prisma as any).supplierManager.findUnique({
                where: { id: supplierManagerId },
                select: { phone_number: true, name: true },
              });
            }
          );
          supplierPhoneNumber = supplierManager?.phone_number || null;

          if (!supplierPhoneNumber) {
            // Fallback: Try to get phone from ClinicSupplierManager
            const clinicSupplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).clinicSupplierManager.findFirst({
                  where: {
                    linked_manager_id: supplierManagerId,
                  },
                  select: { phone_number: true },
                });
              }
            );
            supplierPhoneNumber = clinicSupplierManager?.phone_number || null;
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to fetch supplier phone number: ${error.message}`
        );
      }

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

        // Send SMS notification to supplier
        if (supplierPhoneNumber) {
          try {
            const returnTypeText = returnData.items[0].returnType.includes(
              "교환"
            )
              ? "교환"
              : "반품";
            const productName = returnData.items[0].productName;
            const quantity = returnData.items[0].quantity;

            const smsMessage = `[반품/교환 알림]
${clinicName}에서 ${productName} ${quantity}개 ${returnTypeText} 요청이 있습니다.
반품번호: ${returnItem.return_no}
확인 후 처리해주세요.`;

            const smsSent = await this.messageService.sendSMS(
              supplierPhoneNumber,
              smsMessage
            );
          } catch (smsError: any) {
            this.logger.error(
              `Failed to send SMS to supplier: ${smsError.message}`
            );
            // Don't throw - SMS failure shouldn't break the return process
          }
        } else {
        }

        // Send Email notification to supplier
        try {
          // Get supplier email (priority: supplierManager.email1 > supplier.company_email > clinicSupplierManager.company_email > clinicSupplierManager.email1 > clinicSupplierManager.email2)
          let supplierEmail: string | null = null;

          if (supplierManagerId) {
            const supplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).supplierManager.findUnique({
                  where: { id: supplierManagerId },
                  select: {
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

            supplierEmail =
              supplierManager?.email1 ||
              supplierManager?.supplier?.company_email ||
              null;
          }

          // Fallback: Try ClinicSupplierManager email
          if (!supplierEmail) {
            const clinicSupplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).clinicSupplierManager.findFirst({
                  where: {
                    linked_manager_id: supplierManagerId,
                  },
                  select: {
                    company_email: true,
                    email1: true,
                    email2: true,
                  },
                });
              }
            );

            supplierEmail =
              clinicSupplierManager?.company_email ||
              clinicSupplierManager?.email1 ||
              clinicSupplierManager?.email2 ||
              null;
          }

          if (supplierEmail) {
            const returnTypeText = returnData.items[0].returnType.includes(
              "교환"
            )
              ? "교환"
              : "반품";

            // Fetch product name va unit from product table
            let productUnit = "";
            let productNameFromDB = "";
            if (returnItem.product_id) {
              try {
                const product = await this.prisma.executeWithRetry(async () => {
                  return (this.prisma as any).product.findFirst({
                    where: { id: returnItem.product_id },
                    select: { unit: true, name: true }, // ✅ name'ni ham select qilish
                  });
                });
                productUnit = product?.unit || "";
                productNameFromDB = product?.name || ""; // ✅ Product name'ni saqlash
              } catch (error: any) {
                this.logger.warn(
                  `Failed to fetch product unit: ${error.message}`
                );
              }
            }

            const products = returnData.items.map((item: any) => ({
              productName:
                item.productName && item.productName.trim() !== ""
                  ? item.productName
                  : productNameFromDB && productNameFromDB.trim() !== ""
                    ? productNameFromDB
                    : "알 수 없음", // ✅ Fallback qo'shish
              brand: item.brand,
              quantity: item.quantity,
              unit: productUnit,
            }));

            // Template ID'ni environment variable'dan olish
            const templateId = parseInt(
              process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID || "0",
              10
            );

            if (templateId > 0) {
              // Template ishlatish
              await this.emailService.sendReturnNotificationEmailWithTemplate(
                supplierEmail,
                templateId,
                clinicName,
                returnItem.return_no,
                returnData.items[0].totalPrice,
                returnData.items[0].quantity,
                clinicManagerName,
                products,
                returnTypeText
              );
            } else {
              // Oddiy HTML email (fallback)
              await this.emailService.sendReturnNotificationEmail(
                supplierEmail,
                clinicName,
                returnItem.return_no,
                returnData.items[0].totalPrice,
                returnData.items[0].quantity,
                clinicManagerName,
                products,
                returnTypeText
              );
            }
          } else {
          }
        } catch (emailError: any) {
          this.logger.error(
            `Failed to send return notification email: ${emailError.message}`
          );
          // Don't throw - email failure shouldn't break the return process
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending return to supplier-backend: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async updateReturnType(tenantId: string, id: string, returnType: string) {
    // Invalidate cache
    this.invalidateCache(tenantId);
    const validTypes = ["주문|교환", "주문|반품", "불량|교환", "불량|반품"];
    if (!validTypes.includes(returnType)) {
      throw new BadRequestException(
        `Invalid return type. Must be one of: ${validTypes.join(", ")}`
      );
    }

    return this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).orderReturn.update({
        where: { id, tenant_id: tenantId },
        data: {
          return_type: returnType,
          updated_at: new Date(),
        },
      });
    });
  }

  async createFromOutbound(tenantId: string, dto: any) {
    const { outboundId, items } = dto;

    if (!items || items.length === 0) {
      return { message: "No returns to create" };
    }

    if (!outboundId) {
      throw new BadRequestException("outboundId is required");
    }

    try {
      // Get outbound details to get product and batch info
      const outbound = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).outbound.findFirst({
          where: { id: outboundId, tenant_id: tenantId },
          include: {
            product: {
              include: {
                productSupplier: {
                  include: {
                    clinicSupplierManager: {
                      include: {
                        linkedManager: {
                          include: {
                            supplier: {
                              select: { id: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            batch: true,
          },
        });
      });

      if (!outbound) {
        throw new BadRequestException("Outbound not found");
      }

      // Get supplier_id from product via ProductSupplier -> ClinicSupplierManager -> linkedManager
      let supplierId = null;
      if (
        outbound.product?.productSupplier?.clinicSupplierManager?.linkedManager
          ?.supplier
      ) {
        supplierId =
          outbound.product.productSupplier.clinicSupplierManager.linkedManager
            .supplier.id;
      } else {
      }

      // Get return manager: try to find member_id from manager_name (full_name)
      let returnManager = dto.returnManager || null;
      if (!returnManager && outbound.manager_name) {
        // Try to find member by full_name
        const member = await (this.prisma as any).member.findFirst({
          where: {
            full_name: outbound.manager_name,
            tenant_id: tenantId,
          },
          select: {
            member_id: true,
          },
        });
        returnManager = member?.member_id || outbound.manager_name; // Fallback to name if not found
      }

      // Get batch created_at date for inbound_date
      const batchNo = outbound.batch_no || outbound.batch?.batch_no;
      let batchCreatedAt: Date | null = null;

      if (batchNo) {
        const batch = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).batch.findFirst({
            where: {
              batch_no: batchNo,
              tenant_id: tenantId,
            },
            select: {
              created_at: true,
            },
          });
        });
        batchCreatedAt = batch?.created_at || null;
      }

      const returns = await this.prisma.executeWithRetry(async () => {
        return Promise.all(
          items.map((item: any) => {
            // Get batch_no from multiple sources as fallback
            const itemBatchNo =
              item.batchNo || outbound.batch_no || outbound.batch?.batch_no;

            // Debug log

            return (this.prisma as any).orderReturn.create({
              data: {
                tenant_id: tenantId,
                order_id: null, // No order for defective products
                order_no: null, // No order number for defective products
                outbound_id: outboundId,
                batch_no: itemBatchNo,
                product_id: item.productId || outbound.product_id,
                product_name:
                  item.productName || outbound.product?.name || "알 수 없음",
                brand: item.brand || outbound.product?.brand || null,
                return_quantity: item.returnQuantity || outbound.outbound_qty,
                total_quantity: item.totalQuantity || outbound.outbound_qty,
                unit_price: item.unitPrice || outbound.product?.sale_price || 0,
                return_type: "불량|반품",
                status: "pending",
                supplier_id: supplierId,
                return_manager: returnManager,
                inbound_date: batchCreatedAt || new Date(),
              },
            });
          })
        );
      });

      return { created: returns.length, returns };
    } catch (error: any) {
      console.error(`❌ Error creating returns from outbound:`, error);
      throw new BadRequestException(
        `Failed to create returns: ${error?.message || "Unknown error"}`
      );
    }
  }

  /**
   * Handle return completion webhook from supplier
   */
  async handleReturnComplete(dto: {
    return_no: string;
    item_id?: string;
    status: string;
  }) {
    try {
      // Find return by return_no
      const returnItem = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.findFirst({
          where: { return_no: dto.return_no },
        });
      });

      if (!returnItem) {
        this.logger.warn(`Return not found for return_no: ${dto.return_no}`);
        // Don't throw error, just log - webhook might be called multiple times
        return {
          success: false,
          message: `Return not found for return_no: ${dto.return_no}`,
        };
      }

      // Update status to completed
      const updated = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.update({
          where: { id: returnItem.id },
          data: {
            status: "completed",
            updated_at: new Date(),
          },
        });
      });

      return { success: true, message: "Return status updated to completed" };
    } catch (error: any) {
      this.logger.error(
        `Error handling return complete: ${error.message}`,
        error.stack
      );
      // Don't throw error to prevent webhook retries
      return {
        success: false,
        message: `Failed to handle return complete: ${error.message}`,
      };
    }
  }

  /**
   * Confirm exchange (교환 확인)
   * Changes status from "processing" to "completed" for exchange items
   */
  async confirmExchange(tenantId: string, id: string) {
    // Invalidate cache
    this.invalidateCache(tenantId);
    try {
      const returnItem = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.findFirst({
          where: { id, tenant_id: tenantId },
        });
      });

      if (!returnItem) {
        throw new BadRequestException("Return not found");
      }

      // Check if it's an exchange type
      const isExchange = returnItem.return_type?.includes("교환");
      if (!isExchange) {
        throw new BadRequestException("This is not an exchange item");
      }

      // Check if status is "processing"
      if (returnItem.status !== "processing") {
        throw new BadRequestException("Return is not in processing status");
      }

      // Update status to completed
      const updatedReturn = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.update({
          where: { id, tenant_id: tenantId },
          data: {
            status: "completed",
            updated_at: new Date(),
          },
        });
      });

      return updatedReturn;
    } catch (error: any) {
      this.logger.error(
        `Error confirming exchange: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to confirm exchange: ${error.message}`
      );
    }
  }
}
