import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { saveBase64Images } from "../../common/utils/upload.utils";

@Injectable()
export class OrderReturnService {
  private readonly logger = new Logger(OrderReturnService.name);
  
  constructor(private readonly prisma: PrismaService) {}

  async getReturns(tenantId: string, status?: string) {
    this.logger.log(`🔍 Getting returns for tenant: ${tenantId}, status: ${status}`);
    const where: any = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    return this.prisma.executeWithRetry(async () => {
      const returns = await (this.prisma as any).orderReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
      });

      this.logger.log(`📦 Found ${returns.length} returns`);

      // Fetch supplier information for each return
      const returnsWithSupplier = await Promise.all(
        returns.map(async (returnItem: any) => {
          let supplierName = "알 수 없음";
          let managerName = "";
          let returnManagerName = "";

          this.logger.log(`Processing return ${returnItem.id}: supplier_id=${returnItem.supplier_id}, outbound_id=${returnItem.outbound_id}`);

          // Fetch return manager name (clinic member)
          if (returnItem.return_manager) {
            const returnManager = await (this.prisma as any).member.findFirst({
              where: {
                member_id: returnItem.return_manager,
                tenant_id: tenantId,
              },
              select: {
                full_name: true,
              },
            });
            returnManagerName = returnManager?.full_name || "";
          }

          if (returnItem.supplier_id) {
            this.logger.log(`Fetching supplier: ${returnItem.supplier_id}`);
            const supplier = await (this.prisma as any).supplier.findUnique({
              where: { id: returnItem.supplier_id },
              include: {
                managers: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  orderBy: { created_at: "asc" },
                },
              },
            });

            this.logger.log(`Supplier query result:`, JSON.stringify({
              found: !!supplier,
              company_name: supplier?.company_name,
              managers_count: supplier?.managers?.length || 0,
              first_manager: supplier?.managers?.[0] ? {
                name: supplier.managers[0].name,
                manager_id: supplier.managers[0].manager_id,
              } : null
            }));

            if (supplier) {
              supplierName = supplier.company_name || "알 수 없음";
              const manager = supplier.managers?.[0];
              managerName = manager?.name || "";
              this.logger.log(`✅ Supplier found: ${supplierName}, manager: ${managerName}`);
            } else {
              this.logger.warn(`⚠️ Supplier not found: ${returnItem.supplier_id}, trying via product_id`);
              
              // Fallback: Try to get supplier via ProductSupplier -> ClinicSupplierManager
              if (returnItem.product_id) {
                try {
                  const productSupplier = await (this.prisma as any).productSupplier.findFirst({
                    where: {
                      product_id: returnItem.product_id,
                      tenant_id: tenantId,
                    },
                    include: {
                      clinicSupplierManager: {
                        include: {
                          linkedManager: {
                            include: {
                              supplier: {
                                include: {
                                  managers: {
                                    where: { status: "ACTIVE" },
                                    take: 1,
                                    orderBy: { created_at: "asc" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  });

                  if (productSupplier?.clinicSupplierManager) {
                    const clinicManager = productSupplier.clinicSupplierManager;
                    
                    // If linked to platform supplier, use that
                    if (clinicManager.linkedManager?.supplier) {
                      const platformSupplier = clinicManager.linkedManager.supplier;
                      supplierName = platformSupplier.company_name || clinicManager.company_name || "알 수 없음";
                      const manager = platformSupplier.managers?.[0];
                      managerName = manager?.name || clinicManager.name || "";
                      this.logger.log(`✅ Supplier found via ProductSupplier (platform): ${supplierName}, manager: ${managerName}`);
                    } else {
                      // Manual supplier (ClinicSupplierManager only)
                      supplierName = clinicManager.company_name || "알 수 없음";
                      managerName = clinicManager.name || "";
                      this.logger.log(`✅ Supplier found via ProductSupplier (manual): ${supplierName}, manager: ${managerName}`);
                    }
                  } else {
                    this.logger.warn(`⚠️ ProductSupplier not found for product_id: ${returnItem.product_id}`);
                  }
                } catch (error: any) {
                  this.logger.error(`Error fetching supplier via ProductSupplier: ${error.message}`);
                }
              }
            }
          } else if (returnItem.outbound_id) {
            // For defective products from outbound, get supplier from product
            const outbound = await (this.prisma as any).outbound.findFirst({
              where: { id: returnItem.outbound_id, tenant_id: tenantId },
              include: {
                product: {
                  include: {
                    supplierProducts: {
                      take: 1,
                      orderBy: { created_at: "asc" },
                    },
                  },
                },
              },
            });

            if (outbound?.product?.supplierProducts?.[0]) {
              const supplierProduct = outbound.product.supplierProducts[0];
              
              // Use company_name from SupplierProduct if available
              if (supplierProduct.company_name) {
                supplierName = supplierProduct.company_name;
                managerName = supplierProduct.contact_name || "";
              } else if (supplierProduct.supplier_id) {
                // Otherwise, fetch from Supplier table
                const supplier = await (this.prisma as any).supplier.findUnique({
                  where: { id: supplierProduct.supplier_id },
                  include: {
                    managers: {
                      where: { status: "ACTIVE" },
                      take: 1,
                      orderBy: { created_at: "asc" },
                    },
                  },
                });

                if (supplier) {
                  supplierName = supplier.company_name || "알 수 없음";
                  const manager = supplier.managers?.[0];
                  managerName = manager?.name || supplierProduct.contact_name || "";
                }
              }
            }
          }

          return {
            ...returnItem,
            supplierName,
            managerName,
            returnManagerName,
          };
        })
      );

      return returnsWithSupplier;
    });
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
      const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
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
    throw new BadRequestException("Failed to generate unique return number after multiple attempts");
  }

  async processReturn(tenantId: string, id: string, dto: any) {
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
    const returnNo = returnItem.return_no || await this.generateReturnNumber();

    // Update return with all data
    const finalImages = imageUrls.length > 0 ? imageUrls : (returnItem.images || []);
    
    const updatedReturn = await this.prisma.executeWithRetry(async () => {
      const updateData: any = {
        return_no: returnNo,
        return_manager: dto.returnManager || null,
        memo: dto.memo || null,
        images: finalImages,
        status: "pending", // Keep as pending until supplier confirms
        updated_at: new Date(),
      };
      
      // IMPORTANT: /order-returns page'dan yuborilgan barcha product'lar /exchanges page'ga kelishi kerak
      // Shuning uchun return_type ni "주문|교환" qilib majburiy o'rnatamiz
      // Frontend'dan kelgan return_type ni e'tiborsiz qoldiramiz
      updateData.return_type = "주문|교환"; // Always "주문|교환" for order-returns page
      
      return (this.prisma as any).orderReturn.update({
        where: { id, tenant_id: tenantId },
        data: updateData,
      });
    });

    // Ensure images are included in the return object for sending to supplier
    const returnWithImages = {
      ...updatedReturn,
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
      this.logger.error(`Failed to send return to supplier: ${error.message}`, error.stack);
      // Don't throw - return is already processed, supplier notification is optional
      // But still return the updated return with "pending" status
      return updatedReturn;
    }
  }

  /**
   * Send return request to supplier-backend
   */
  private async sendReturnToSupplier(returnItem: any, tenantId: string) {
    if (!returnItem.supplier_id) {
      this.logger.warn(`Return ${returnItem.id} has no supplier_id, skipping supplier notification`);
      return;
    }

    try {
      // Get supplier details
      const supplier = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplier.findUnique({
          where: { id: returnItem.supplier_id },
          select: { tenant_id: true },
        });
      });

      if (!supplier || !supplier.tenant_id) {
        this.logger.warn(`Supplier ${returnItem.supplier_id} not found or missing tenant_id`);
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

      // Get clinic manager name (return_manager)
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
        }
      }

      // Prepare return data for supplier
      const imagesArray = Array.isArray(returnItem.images) 
        ? returnItem.images 
        : (returnItem.images ? [returnItem.images] : []);
      
      // Debug log for images
      if (imagesArray.length > 0) {
        this.logger.log(`Sending ${imagesArray.length} image(s) to supplier for return ${returnItem.return_no}`);
      } else {
        this.logger.warn(`No images found for return ${returnItem.return_no}`);
      }
      
      const returnData = {
        returnNo: returnItem.return_no,
        supplierTenantId: supplier.tenant_id,
        clinicTenantId: tenantId,
        clinicName: clinicName,
        clinicManagerName: clinicManagerName,
        items: [
          {
            productName: returnItem.product_name,
            brand: returnItem.brand || "",
            quantity: returnItem.return_quantity,
            returnType: returnItem.return_type,
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

      // Call supplier-backend API
      const supplierApiUrl = process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn("SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification");
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
        this.logger.error(`Failed to send return to supplier-backend: ${response.status} ${errorText}`);
      } else {
        const result: any = await response.json();
        this.logger.log(`Return ${returnItem.return_no} sent to supplier-backend successfully: ${result.id || "OK"}`);
      }
    } catch (error: any) {
      this.logger.error(`Error sending return to supplier-backend: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateReturnType(tenantId: string, id: string, returnType: string) {
    const validTypes = ["주문|교환", "주문|반품", "불량|교환", "불량|반품"];
    if (!validTypes.includes(returnType)) {
      throw new BadRequestException(`Invalid return type. Must be one of: ${validTypes.join(", ")}`);
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
                supplierProducts: {
                  take: 1,
                  orderBy: { created_at: "asc" },
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

      // Get supplier_id from product if available
      let supplierId = null;
      if (outbound.product?.supplierProducts && outbound.product.supplierProducts.length > 0) {
        supplierId = outbound.product.supplierProducts[0].supplier_id;
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
            const itemBatchNo = item.batchNo || outbound.batch_no || outbound.batch?.batch_no;
            
            // Debug log
            if (!itemBatchNo) {
              console.log('⚠️ Batch No Debug:', {
                itemBatchNo: item.batchNo,
                outboundBatchNo: outbound.batch_no,
                outboundBatchRelation: outbound.batch?.batch_no,
                outboundId: outboundId,
                item: JSON.stringify(item)
              });
            }
            
            return (this.prisma as any).orderReturn.create({
              data: {
                tenant_id: tenantId,
                order_id: null, // No order for defective products
                order_no: null, // No order number for defective products
                outbound_id: outboundId,
                batch_no: itemBatchNo,
                product_id: item.productId || outbound.product_id,
                product_name: item.productName || outbound.product?.name || "알 수 없음",
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
  async handleReturnComplete(dto: { return_no: string; item_id?: string; status: string }) {
    try {
      this.logger.log(`Received return complete webhook: return_no=${dto.return_no}, item_id=${dto.item_id}`);
      
      // Find return by return_no
      const returnItem = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).orderReturn.findFirst({
          where: { return_no: dto.return_no },
        });
      });

      if (!returnItem) {
        this.logger.warn(`Return not found for return_no: ${dto.return_no}`);
        // Don't throw error, just log - webhook might be called multiple times
        return { success: false, message: `Return not found for return_no: ${dto.return_no}` };
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

      this.logger.log(`Return status updated to completed: id=${returnItem.id}, return_no=${dto.return_no}`);
      return { success: true, message: "Return status updated to completed" };
    } catch (error: any) {
      this.logger.error(`Error handling return complete: ${error.message}`, error.stack);
      // Don't throw error to prevent webhook retries
      return { success: false, message: `Failed to handle return complete: ${error.message}` };
    }
  }

  /**
   * Confirm exchange (교환 확인)
   * Changes status from "processing" to "completed" for exchange items
   */
  async confirmExchange(tenantId: string, id: string) {
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
      this.logger.error(`Error confirming exchange: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to confirm exchange: ${error.message}`);
    }
  }
}

