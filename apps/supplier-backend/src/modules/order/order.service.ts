import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { PartialAcceptDto } from "./dto/partial-accept.dto";

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
      throw new BadRequestException(
        "orderNo, supplierTenantId va items talab qilinadi"
      );
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
      throw new BadRequestException(
        "Order ID va Supplier manager ID talab qilinadi"
      );
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
      throw new BadRequestException(
        "Order ID va Supplier manager ID talab qilinadi"
      );
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
              const note = adjustment.quantityChangeNote
                ? ` (${adjustment.quantityChangeNote})`
                : "";
              itemMemo += `\n[수량 변경: ${item.quantity}→${adjustment.actualQuantity}, 사유: ${reason}${note}]`;
            }
            if (adjustment.actualPrice !== item.unit_price) {
              const reason = adjustment.priceChangeReason || "미지정";
              const note = adjustment.priceChangeNote
                ? ` (${adjustment.priceChangeNote})`
                : "";
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
            this.logger.warn(
              `⚠️ Item not found for adjustment: itemId=${adjustment.itemId}`
            );
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
        this.logger.log(
          `📝 [Rejection] Processing rejection reasons for ${
            Object.keys(dto.rejectionReasons).length
          } items`
        );

        for (const [itemId, reason] of Object.entries(dto.rejectionReasons)) {
          if (reason && reason.trim() !== "") {
            const item = order.items.find((i: any) => i.id === itemId);
            if (item) {
              const itemMemo = item.memo
                ? `${item.memo}\n[거절 사유: ${reason}]`
                : `[거절 사유: ${reason}]`;

              this.logger.log(
                `   ✅ Item: ${
                  item.product_name || "Unknown"
                }, Reason: ${reason}`
              );

              await tx.supplierOrderItem.update({
                where: { id: itemId },
                data: {
                  memo: itemMemo.trim(),
                  updated_at: new Date(),
                },
              });
            } else {
              this.logger.warn(`   ⚠️ Item with id ${itemId} not found`);
            }
          }
        }
      }

      return tx.supplierOrder.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    this.logger.log(
      `📋 [Order Status Update] Order ${order.order_no} status changed to: ${dto.status}`
    );
    this.logger.log(`   Adjustments count: ${dto.adjustments?.length || 0}`);

    // If status is "confirmed", notify clinic-backend
    // ✅ FIX: Notify even if adjustments is empty/undefined (no adjustments = all items confirmed as ordered)
    if (dto.status === "confirmed") {
      const adjustments = dto.adjustments || [];
      this.logger.log(
        `🔔 [Order Confirmed] Notifying clinic-backend about order ${order.order_no} (adjustments: ${adjustments.length})`
      );
      await this.notifyClinicBackend(updated, adjustments);
    }

    // If status is "rejected", notify clinic-backend
    if (dto.status === "rejected") {
      this.logger.log(
        `❌ [Order Rejected] Notifying clinic-backend about order ${order.order_no}`
      );
      await this.notifyClinicBackendRejection(updated, dto.rejectionReasons);
    }

    return this.formatOrder(updated);
  }

  /**
   * Notify clinic-backend when order is confirmed
   */
  private async notifyClinicBackend(order: any, adjustments: any[]) {
    try {
      const clinicApiUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const apiKey =
        process.env.SUPPLIER_BACKEND_API_KEY || process.env.API_KEY_SECRET;

      this.logger.log(
        `📤 [Supplier→Clinic] Attempting to notify clinic about order ${order.order_no}`
      );
      this.logger.log(`   Clinic API: ${clinicApiUrl}`);
      this.logger.log(`   API Key configured: ${apiKey ? "YES" : "NO"}`);

      if (!apiKey) {
        this.logger.warn(
          "⚠️  API_KEY_SECRET not configured, skipping clinic notification"
        );
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

      this.logger.log(
        `   Sending to: POST ${clinicApiUrl}/order/supplier-confirmed`
      );
      this.logger.log(
        `   Payload: orderNo=${payload.orderNo}, tenantId=${payload.clinicTenantId}, adjustments=${adjustmentsWithProductId.length}`
      );

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
        this.logger.error(
          `❌ Failed to notify clinic-backend: ${response.status} - ${errorText}`
        );
        this.logger.error(
          `   Response status: ${response.status} ${response.statusText}`
        );
      } else {
        this.logger.log(
          `✅ Successfully notified clinic-backend about order ${order.order_no}`
        );
      }
    } catch (error: any) {
      this.logger.error(`❌ Error notifying clinic-backend: ${error.message}`);
      this.logger.error(`   Stack: ${error.stack}`);
      // Don't throw - order is already confirmed in supplier DB
    }
  }

  /**
   * Notify clinic-backend when order is rejected
   */
  private async notifyClinicBackendRejection(
    order: any,
    rejectionReasons?: Record<string, string>
  ) {
    try {
      const clinicApiUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const apiKey =
        process.env.CLINIC_BACKEND_API_KEY || process.env.API_KEY_SECRET;

      if (!apiKey) {
        this.logger.warn(
          "API_KEY_SECRET not configured, skipping clinic notification"
        );
        return;
      }

      const payload = {
        orderNo: order.order_no,
        clinicTenantId: order.clinic_tenant_id,
        status: "rejected",
        rejectionReasons: rejectionReasons || {},
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
        this.logger.error(
          `Failed to notify clinic-backend of rejection: ${response.status} - ${errorText}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error notifying clinic-backend of rejection: ${error.message}`,
        error.stack
      );
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
      this.logger.error(
        `Order ${orderNo} not found in supplier-backend. Search params: supplierTenantId=${supplierTenantId}, clinicTenantId=${clinicTenantId}`
      );
      throw new BadRequestException(`Order ${orderNo} not found`);
    }

    this.logger.log(
      `Found order ${orderNo} (id: ${order.id}), current status: ${order.status}, updating to completed`
    );

    // Update status to completed
    const updated = await (this.prisma as any).supplierOrder.update({
      where: { id: order.id },
      data: {
        status: "completed",
        updated_at: new Date(),
      },
    });

    this.logger.log(`Order ${orderNo} marked as completed in supplier-backend`);
    return {
      success: true,
      message: "Order marked as completed",
      order: this.formatOrder(updated),
    };
  }

  /**
   * Handle order cancellation from clinic
   */
  async handleCancellation(dto: {
    orderNo: string;
    supplierTenantId: string;
    cancelledAt: string;
    reason?: string;
  }): Promise<any> {
    const { orderNo, supplierTenantId, cancelledAt, reason } = dto;

    this.logger.log(
      `🚫 [Order Cancel] Received cancellation for order ${orderNo} from clinic`
    );

    // Find order
    const order = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierOrder.findFirst({
        where: {
          order_no: orderNo,
          supplier_tenant_id: supplierTenantId,
        },
      });
    });

    if (!order) {
      this.logger.warn(`Order ${orderNo} not found in supplier-backend`);
      return { success: false, message: "Order not found" };
    }

    // Delete order from supplier-backend (clinic cancelled, so no history needed)
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).supplierOrder.delete({
        where: { id: order.id },
      });
    });

    this.logger.log(
      `✅ [Order Cancel] Order ${orderNo} deleted from supplier-backend`
    );

    return {
      success: true,
      orderNo: orderNo,
      message: "Order cancelled and removed",
    };
  }

  /**
   * Partial Order Acceptance - Split order into accepted and remaining
   */
  async partialAcceptOrder(
    id: string,
    supplierManagerId: string,
    dto: { selectedItemIds: string[]; adjustments?: any[]; memo?: string }
  ) {
    this.logger.log(
      `🔀 [SPLIT ORDER START] Order: ${id}, Selected items: ${dto.selectedItemIds.length}`
    );

    // Check feature flag
    const featureEnabled =
      process.env.ENABLE_PARTIAL_ORDER_ACCEPTANCE === "true";
    if (!featureEnabled) {
      throw new BadRequestException("Partial order acceptance is not enabled");
    }

    // Get original order with items
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).supplierOrder.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    if (!order) {
      throw new BadRequestException("Order not found");
    }

    if (order.status !== "pending") {
      throw new BadRequestException(
        "Only pending orders can be partially accepted"
      );
    }

    // Validation: Selected items must belong to this order
    const orderItemIds = order.items.map((i: any) => i.id);
    const invalidItems = dto.selectedItemIds.filter(
      (id) => !orderItemIds.includes(id)
    );
    if (invalidItems.length > 0) {
      throw new BadRequestException(
        `Invalid item IDs: ${invalidItems.join(", ")}`
      );
    }

    // Validation: Must have at least one item remaining
    if (dto.selectedItemIds.length >= order.items.length) {
      throw new BadRequestException(
        "Cannot accept all items - use full accept instead"
      );
    }

    if (dto.selectedItemIds.length === 0) {
      throw new BadRequestException("Must select at least one item");
    }

    // Split items
    const acceptedItems = order.items.filter((i: any) =>
      dto.selectedItemIds.includes(i.id)
    );
    const remainingItems = order.items.filter(
      (i: any) => !dto.selectedItemIds.includes(i.id)
    );

    // Calculate amounts
    const acceptedTotal = acceptedItems.reduce(
      (sum: number, i: any) => sum + i.total_price,
      0
    );
    const remainingTotal = remainingItems.reduce(
      (sum: number, i: any) => sum + i.total_price,
      0
    );

    // Validation: Amounts must match
    if (acceptedTotal + remainingTotal !== order.total_amount) {
      throw new BadRequestException(
        `Amount mismatch: ${acceptedTotal} + ${remainingTotal} !== ${order.total_amount}`
      );
    }

    this.logger.log(
      `   Accepted: ${acceptedItems.length} items (${acceptedTotal}원)`
    );
    this.logger.log(
      `   Remaining: ${remainingItems.length} items (${remainingTotal}원)`
    );

    // Generate new order numbers
    const baseOrderNo = order.order_no;
    const acceptedOrderNo = `${baseOrderNo}-A`;
    const remainingOrderNo = `${baseOrderNo}-B`;

    // Transaction: Split order
    const result = await this.prisma.$transaction(async (tx: any) => {
      // Create Order 1: Accepted items (confirmed)
      const acceptedOrder = await tx.supplierOrder.create({
        data: {
          order_no: acceptedOrderNo,
          supplier_tenant_id: order.supplier_tenant_id,
          supplier_manager_id: order.supplier_manager_id,
          clinic_tenant_id: order.clinic_tenant_id,
          clinic_name: order.clinic_name,
          clinic_manager_name: order.clinic_manager_name,
          status: "confirmed",
          total_amount: acceptedTotal,
          memo: dto.memo || order.memo,
          order_date: order.order_date,
          original_order_id: order.id,
          is_split_order: true,
          split_sequence: 1,
          split_reason: "Partial acceptance - accepted items",
        },
      });

      // Create Order 2: Remaining items (pending)
      const remainingOrder = await tx.supplierOrder.create({
        data: {
          order_no: remainingOrderNo,
          supplier_tenant_id: order.supplier_tenant_id,
          supplier_manager_id: order.supplier_manager_id,
          clinic_tenant_id: order.clinic_tenant_id,
          clinic_name: order.clinic_name,
          clinic_manager_name: order.clinic_manager_name,
          status: "pending",
          total_amount: remainingTotal,
          memo: order.memo,
          order_date: order.order_date,
          original_order_id: order.id,
          is_split_order: true,
          split_sequence: 2,
          split_reason: "Partial acceptance - remaining items",
        },
      });

      // Move accepted items to Order 1
      for (const item of acceptedItems) {
        await tx.supplierOrderItem.create({
          data: {
            order_id: acceptedOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            brand: item.brand,
            batch_no: item.batch_no,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            memo: item.memo,
          },
        });
      }

      // Move remaining items to Order 2
      for (const item of remainingItems) {
        await tx.supplierOrderItem.create({
          data: {
            order_id: remainingOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            brand: item.brand,
            batch_no: item.batch_no,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            memo: item.memo,
          },
        });
      }

      // Delete original order items
      await tx.supplierOrderItem.deleteMany({
        where: { order_id: order.id },
      });

      // Archive original order
      await tx.supplierOrder.update({
        where: { id: order.id },
        data: {
          status: "archived",
          memo: `Split into ${acceptedOrderNo} and ${remainingOrderNo}`,
          updated_at: new Date(),
        },
      });

      // Fetch complete orders with items
      const acceptedOrderComplete = await tx.supplierOrder.findUnique({
        where: { id: acceptedOrder.id },
        include: { items: true },
      });

      const remainingOrderComplete = await tx.supplierOrder.findUnique({
        where: { id: remainingOrder.id },
        include: { items: true },
      });

      return {
        acceptedOrder: acceptedOrderComplete,
        remainingOrder: remainingOrderComplete,
      };
    });

    this.logger.log(`✅ [SPLIT ORDER SUCCESS]`);
    this.logger.log(`   Accepted Order: ${acceptedOrderNo} (confirmed)`);
    this.logger.log(`   Remaining Order: ${remainingOrderNo} (pending)`);

    // Notify clinic backend about split
    await this.notifyClinicBackendSplit(
      result.acceptedOrder,
      result.remainingOrder,
      order
    );

    return {
      message: "Order split successfully",
      acceptedOrder: this.formatOrder(result.acceptedOrder),
      remainingOrder: this.formatOrder(result.remainingOrder),
    };
  }

  /**
   * Notify clinic backend about order split
   */
  private async notifyClinicBackendSplit(
    acceptedOrder: any,
    remainingOrder: any,
    originalOrder: any
  ) {
    try {
      const clinicApiUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const apiKey =
        process.env.SUPPLIER_BACKEND_API_KEY || process.env.API_KEY_SECRET;

      if (!apiKey) {
        this.logger.warn(
          "API_KEY_SECRET not configured, skipping clinic notification"
        );
        return;
      }

      const idempotencyKey = `split-${originalOrder.id}-${Date.now()}`;

      const payload = {
        type: "order_split",
        original_order_no: originalOrder.order_no,
        clinic_tenant_id: originalOrder.clinic_tenant_id,
        orders: [
          {
            order_no: acceptedOrder.order_no,
            status: "confirmed",
            total_amount: acceptedOrder.total_amount,
            items: acceptedOrder.items.map((i: any) => ({
              product_name: i.product_name,
              quantity: i.quantity,
              total_price: i.total_price,
            })),
          },
          {
            order_no: remainingOrder.order_no,
            status: "pending",
            total_amount: remainingOrder.total_amount,
            items: remainingOrder.items.map((i: any) => ({
              product_name: i.product_name,
              quantity: i.quantity,
              total_price: i.total_price,
            })),
          },
        ],
      };

      this.logger.log(
        `📤 [Supplier→Clinic] Notifying about order split: ${originalOrder.order_no}`
      );

      await fetch(`${clinicApiUrl}/order/order-split`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      this.logger.log(
        `✅ [Supplier→Clinic] Split notification sent successfully`
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to notify clinic about order split: ${error.message}`
      );
    }
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
