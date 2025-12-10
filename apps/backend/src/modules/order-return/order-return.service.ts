import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

@Injectable()
export class OrderReturnService {
  constructor(private readonly prisma: PrismaService) {}

  async getReturns(tenantId: string, status?: string) {
    const where: any = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    return this.prisma.executeWithRetry(async () => {
      const returns = await (this.prisma as any).orderReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
      });

      // Fetch supplier information for each return
      const returnsWithSupplier = await Promise.all(
        returns.map(async (returnItem: any) => {
          let supplierName = "알 수 없음";
          let managerName = "";

          if (returnItem.supplier_id) {
            const supplier = await (this.prisma as any).supplier.findUnique({
              where: { id: returnItem.supplier_id },
              include: {
                managers: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  orderBy: { created_at: "asc" },
                },
                clinicManagers: {
                  where: { tenant_id: tenantId },
                  take: 1,
                  orderBy: { created_at: "asc" },
                },
              },
            });

            if (supplier) {
              supplierName = supplier.company_name || "알 수 없음";
              const manager = supplier.managers?.[0] || supplier.clinicManagers?.[0];
              managerName = manager?.name || "";
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
                    clinicManagers: {
                      where: { tenant_id: tenantId },
                      take: 1,
                      orderBy: { created_at: "asc" },
                    },
                  },
                });

                if (supplier) {
                  supplierName = supplier.company_name || "알 수 없음";
                  const manager = supplier.managers?.[0] || supplier.clinicManagers?.[0];
                  managerName = manager?.name || supplierProduct.contact_name || "";
                }
              }
            }
          }

          return {
            ...returnItem,
            supplierName,
            managerName,
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

      const returns = await this.prisma.executeWithRetry(async () => {
        return Promise.all(
          items.map((item: any) =>
            (this.prisma as any).orderReturn.create({
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
              },
            })
          )
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

  async processReturn(tenantId: string, id: string, dto: any) {
    // Will implement: update status, add manager, memo, images
    return this.prisma.executeWithRetry(async () => {
      const updateData: any = {
        status: "completed",
        return_manager: dto.returnManager || null,
        memo: dto.memo || null,
        images: dto.images || [],
        updated_at: new Date(),
      };
      
      // Update return_type if provided
      if (dto.return_type) {
        updateData.return_type = dto.return_type;
      }
      
      return (this.prisma as any).orderReturn.update({
        where: { id, tenant_id: tenantId },
        data: updateData,
      });
    });
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

      const returns = await this.prisma.executeWithRetry(async () => {
        return Promise.all(
          items.map((item: any) =>
            (this.prisma as any).orderReturn.create({
              data: {
                tenant_id: tenantId,
                order_id: null, // No order for defective products
                order_no: null, // No order number for defective products
                outbound_id: outboundId,
                batch_no: item.batchNo || outbound.batch?.batch_no,
                product_id: item.productId || outbound.product_id,
                product_name: item.productName || outbound.product?.name || "알 수 없음",
                brand: item.brand || outbound.product?.brand || null,
                return_quantity: item.returnQuantity || outbound.outbound_qty,
                total_quantity: item.totalQuantity || outbound.outbound_qty,
                unit_price: item.unitPrice || outbound.product?.sale_price || 0,
                return_type: "불량|반품",
                status: "pending",
                supplier_id: supplierId,
              },
            })
          )
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
}

