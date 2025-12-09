import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clinic → Supplier order yaratish (supplier manager yoki tenant bo'yicha)
   */
  async createOrder(dto: CreateOrderDto) {
    const {
      orderNo,
      supplierTenantId,
      supplierManagerId,
      clinicTenantId,
      clinicName,
      clinicManagerName,
      memo,
      totalAmount,
      items,
    } = dto;

    if (!orderNo || !supplierTenantId || !items || items.length === 0) {
      throw new BadRequestException("orderNo, supplierTenantId va items talab qilinadi");
    }

    // Build items data
    const itemsData = items.map((item) => ({
      product_id: item.productId || null,
      product_name: item.productName,
      brand: item.brand || null,
      batch_no: item.batchNo || null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      memo: item.memo || null,
    }));

    try {
      const order = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierOrder.create({
          data: {
            order_no: orderNo,
            supplier_tenant_id: supplierTenantId,
            supplier_manager_id: supplierManagerId || null,
            clinic_tenant_id: clinicTenantId || null,
            clinic_name: clinicName || null,
            clinic_manager_name: clinicManagerName || null,
            memo: memo || null,
            total_amount: totalAmount,
            items: {
              create: itemsData,
            },
          },
          include: {
            items: true,
          },
        });
      });

      return this.formatOrder(order);
    } catch (error: any) {
      this.logger.error(`Order create failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Order create failed: ${error.message}`);
    }
  }

  /**
   * Supplier manager uchun orderlar ro'yxati
   */
  async listOrdersForManager(
    supplierManagerId: string,
    query?: { status?: string; page?: number; limit?: number }
  ) {
    if (!supplierManagerId) {
      throw new BadRequestException("Supplier manager ID talab qilinadi");
    }

    const status = query?.status;
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = { supplier_manager_id: supplierManagerId };
    if (status && status !== "all") {
      where.status = status;
    }

    const [total, orders] = await Promise.all([
      (this.prisma as any).supplierOrder.count({ where }),
      (this.prisma as any).supplierOrder.findMany({
        where,
        orderBy: { order_date: "desc" },
        skip,
        take: limit,
        include: { items: true },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      orders: orders.map(this.formatOrder),
    };
  }

  /**
   * Order detail
   */
  async getOrderById(id: string, supplierManagerId: string) {
    if (!id || !supplierManagerId) {
      throw new BadRequestException("Order ID va Supplier manager ID talab qilinadi");
    }

    const order = await (this.prisma as any).supplierOrder.findFirst({
      where: { id, supplier_manager_id: supplierManagerId },
      include: { items: true },
    });

    if (!order) {
      throw new BadRequestException("Order topilmadi");
    }

    return this.formatOrder(order);
  }

  /**
   * Status yangilash (with optional item adjustments)
   */
  async updateStatus(
    id: string,
    supplierManagerId: string,
    dto: UpdateOrderStatusDto
  ) {
    if (!id || !supplierManagerId) {
      throw new BadRequestException("Order ID va Supplier manager ID talab qilinadi");
    }

    const order = await (this.prisma as any).supplierOrder.findFirst({
      where: { id, supplier_manager_id: supplierManagerId },
      include: { items: true },
    });
    if (!order) {
      throw new BadRequestException("Order topilmadi");
    }

    // Update order and items in transaction
    const updated = await this.prisma.$transaction(async (tx: any) => {
      // Update order status
      const updatedOrder = await tx.supplierOrder.update({
        where: { id },
        data: {
          status: dto.status,
          memo: dto.memo ?? order.memo,
          updated_at: new Date(),
        },
      });

      // Update item adjustments if provided (for confirmed orders)
      if (dto.adjustments && dto.adjustments.length > 0) {
        for (const adjustment of dto.adjustments) {
          const item = order.items.find((i: any) => i.id === adjustment.itemId);
          if (item) {
            // Build memo with change reasons
            let itemMemo = item.memo || "";
            if (adjustment.actualQuantity !== item.quantity) {
              const reason = adjustment.quantityChangeReason || "미지정";
              const note = adjustment.quantityChangeNote ? ` (${adjustment.quantityChangeNote})` : "";
              itemMemo += `\n[수량 변경: ${item.quantity}→${adjustment.actualQuantity}, 사유: ${reason}${note}]`;
            }
            if (adjustment.actualPrice !== item.unit_price) {
              const reason = adjustment.priceChangeReason || "미지정";
              const note = adjustment.priceChangeNote ? ` (${adjustment.priceChangeNote})` : "";
              itemMemo += `\n[가격 변경: ${item.unit_price}→${adjustment.actualPrice}, 사유: ${reason}${note}]`;
            }

            await tx.supplierOrderItem.update({
              where: { id: adjustment.itemId },
              data: {
                quantity: adjustment.actualQuantity,
                unit_price: adjustment.actualPrice,
                total_price: adjustment.actualQuantity * adjustment.actualPrice,
                memo: itemMemo.trim(),
                updated_at: new Date(),
              },
            });
          } else {
            this.logger.warn(`⚠️ Item not found for adjustment: itemId=${adjustment.itemId}`);
          }
        }

        // Recalculate total amount
        const updatedItems = await tx.supplierOrderItem.findMany({
          where: { order_id: id },
        });
        const newTotalAmount = updatedItems.reduce(
          (sum: number, item: any) => sum + item.total_price,
          0
        );
        await tx.supplierOrder.update({
          where: { id },
          data: { total_amount: newTotalAmount },
        });
      }

      // Update item rejection reasons if provided (for rejected orders)
      if (dto.status === "rejected" && dto.rejectionReasons) {
        for (const [itemId, reason] of Object.entries(dto.rejectionReasons)) {
          if (reason && reason.trim() !== "") {
            const item = order.items.find((i: any) => i.id === itemId);
            if (item) {
              const itemMemo = item.memo ? `${item.memo}\n[거절 사유: ${reason}]` : `[거절 사유: ${reason}]`;
              await tx.supplierOrderItem.update({
                where: { id: itemId },
                data: {
                  memo: itemMemo.trim(),
                  updated_at: new Date(),
                },
              });
            }
          }
        }
      }

      return tx.supplierOrder.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    // If status is "confirmed", notify clinic-backend
    if (dto.status === "confirmed" && dto.adjustments) {
      await this.notifyClinicBackend(updated, dto.adjustments);
    }

    return this.formatOrder(updated);
  }

  /**
   * Notify clinic-backend when order is confirmed
   */
  private async notifyClinicBackend(order: any, adjustments: any[]) {
    try {
      const clinicApiUrl = process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const apiKey = process.env.CLINIC_BACKEND_API_KEY || process.env.API_KEY_SECRET;

      if (!apiKey) {
        this.logger.warn("API_KEY_SECRET not configured, skipping clinic notification");
        return;
      }

      // Map adjustments to include productId for matching
      const adjustmentsWithProductId = adjustments.map((adj: any) => {
        const item = order.items.find((i: any) => i.id === adj.itemId);
        return {
          ...adj,
          productId: item?.product_id || null, // Add productId for matching
        };
      });

      const payload = {
        orderNo: order.order_no,
        clinicTenantId: order.clinic_tenant_id,
        status: "supplier_confirmed",
        confirmedAt: new Date().toISOString(),
        adjustments: adjustmentsWithProductId, // Use adjusted array with productId
        updatedItems: order.items.map((item: any) => ({
          itemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          brand: item.brand,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          memo: item.memo,
        })),
        totalAmount: order.total_amount,
      };

      const response = await fetch(`${clinicApiUrl}/order/supplier-confirmed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this.logger.error(`Failed to notify clinic-backend: ${response.status} - ${errorText}`);
      }
    } catch (error: any) {
      this.logger.error(`Error notifying clinic-backend: ${error.message}`);
      // Don't throw - order is already confirmed in supplier DB
    }
  }

  /**
   * Mark order as completed when clinic processes inbound
   */
  async markOrderCompleted(dto: any) {
    const { orderNo, supplierTenantId, clinicTenantId, completedAt } = dto;

    if (!orderNo) {
      throw new BadRequestException("Order number is required");
    }

    // Find order by order_no
    const where: any = {
      order_no: orderNo,
    };
    
    if (supplierTenantId) {
      where.supplier_tenant_id = supplierTenantId;
    }
    
    if (clinicTenantId) {
      where.clinic_tenant_id = clinicTenantId;
    }

    const order = await (this.prisma as any).supplierOrder.findFirst({
      where,
    });

    if (!order) {
      this.logger.error(`Order ${orderNo} not found in supplier-backend. Search params: supplierTenantId=${supplierTenantId}, clinicTenantId=${clinicTenantId}`);
      throw new BadRequestException(`Order ${orderNo} not found`);
    }

    this.logger.log(`Found order ${orderNo} (id: ${order.id}), current status: ${order.status}, updating to completed`);

    // Update status to completed
    const updated = await (this.prisma as any).supplierOrder.update({
      where: { id: order.id },
      data: {
        status: "completed",
        updated_at: new Date(),
      },
    });

    this.logger.log(`Order ${orderNo} marked as completed in supplier-backend`);
    return { success: true, message: "Order marked as completed", order: this.formatOrder(updated) };
  }

  private formatOrder = (order: any) => ({
    id: order.id,
    orderNo: order.order_no,
    status: order.status,
    totalAmount: order.total_amount,
    memo: order.memo,
    orderDate: order.order_date,
    clinic: {
      tenantId: order.clinic_tenant_id,
      name: order.clinic_name,
      managerName: order.clinic_manager_name,
    },
    supplier: {
      tenantId: order.supplier_tenant_id,
      managerId: order.supplier_manager_id,
    },
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      brand: item.brand,
      batchNo: item.batch_no,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
      memo: item.memo,
    })),
  });
}

