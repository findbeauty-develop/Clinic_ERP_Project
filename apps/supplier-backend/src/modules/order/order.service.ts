import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { PartialAcceptDto } from "./dto/partial-accept.dto";
import { NotificationService } from "../notifications/notification.service";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

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
      received_order_quantity: item.quantity,
      confirmed_quantity: null,
      inbound_quantity: null,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      memo: item.memo || null,
      item_status: "pending",
    }));

    

    try {
      const order = await this.prisma.executeWithRetry(async () => {
        const result = await (this.prisma as any).supplierOrder.create({
          data: {
            order_no: orderNo,
            supplier_tenant_id: supplierTenantId,
            supplier_manager_id: supplierManagerId || null,
            clinic_tenant_id: clinicTenantId || null,
            clinic_name: clinicName || null,
            clinic_manager_name: clinicManagerName || null,
            total_amount: totalAmount,
            items: {
              create: itemsData,
            },
          },
          include: {
            items: true,
          },
        });

        // ✅ Tekshirish: Items yaratildimi?
        if (!result.items || result.items.length === 0) {
          this.logger.error(
            `⚠️ Order created but NO ITEMS were saved! Order ID: ${result.id}, Expected: ${itemsData.length} items`
          );
          this.logger.error(
            `   Order data: ${JSON.stringify({
              orderNo,
              supplierTenantId,
              itemsCount: items.length,
              itemsDataSample: itemsData.slice(0, 1),
            })}`
          );
          throw new Error("Failed to create order items - transaction may have rolled back");
        }

       

        return result;
      });

      // Send in-app notification to supplier manager(s)
      try {
        const productNames: string[] = (order.items ?? [])
          .map((item: any) => item.product_name)
          .filter(Boolean);
        const totalCount = productNames.length;
        const preview = productNames.slice(0, 2).join(", ");
        const productSummary =
          totalCount > 2
            ? `${preview} 등 총 ${totalCount}개 제품`
            : totalCount > 0
            ? `${preview} 총 ${totalCount}개 제품`
            : "주문";

        const notifTitle = clinicName
          ? `${clinicName}${clinicManagerName ? " " + clinicManagerName : ""}`
          : "클리닉";
        const notifBody = `${productSummary}의 주문\n새 주문이 들어왔습니다.`;

        if (supplierManagerId) {
          await this.notificationService.create({
            supplierManagerId,
            type: "new_order",
            title: notifTitle,
            body: notifBody,
            entityType: "order",
            entityId: order.id,
            payload: { orderNo, totalAmount, itemCount: totalCount },
            dedupeKey: `new_order:${order.id}`,
          });
        } else if (supplierTenantId) {
          // Notify all managers of this supplier tenant
          const managers = await (this.prisma as any).supplierManager.findMany({
            where: { supplier_tenant_id: supplierTenantId },
            select: { id: true },
          });
          if (managers.length > 0) {
            await this.notificationService.createMany(
              managers.map((m: any) => ({
                supplierManagerId: m.id,
                type: "new_order",
                title: notifTitle,
                body: notifBody,
                entityType: "order",
                entityId: order.id,
                payload: { orderNo, totalAmount, itemCount: totalCount },
                dedupeKey: `new_order:${order.id}:${m.id}`,
              }))
            );
          }
        }
      } catch (notifErr: any) {
        this.logger.warn(`Notification creation failed (non-critical): ${notifErr?.message}`);
      }

      return this.formatOrder(order);
    } catch (error: any) {
      // ✅ Detailed error logging
      this.logger.error(
        `❌ [Order Create] Failed: ${error.message}`,
        error.stack
      );
      this.logger.error(
        `   Order data: ${JSON.stringify({
          orderNo,
          supplierTenantId,
          itemsCount: items.length,
          itemsDataSample: itemsData.slice(0, 1),
        })}`
      );
      
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

    // ✅ Tab mantiqi SupplierOrderItem.item_status dan (SupplierOrder.status ustuni yo'q)
    const where: any = {
      supplier_manager_id: supplierManagerId,
    };

    if (status === "pending") {
      // 주문 목록: kamida bitta pending item bo'lgan orderlar
      where.items = { some: { item_status: "pending" } };
    } else if (status === "confirmed") {
      // 클리닉 확인중: kamida bitta confirmed item bo'lgan orderlar
      where.items = { some: { item_status: "confirmed" } };
    } else if (status === "all") {
      // 주문 내역: clinic_inbounded yoki rejected itemlar bo'lgan orderlar
      where.items = { some: { item_status: { in: ["clinic_inbounded", "rejected", "cancelled"] } } };
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

    let processedOrders = orders;

    if (status === "all") {
      // 주문 내역: clinic_inbounded, rejected, cancelled itemlar (pending/confirmed ko'rinmasin)
      processedOrders = orders
        .map((order: any) => ({
          ...order,
          items: order.items.filter((item: any) => {
            const s = item.item_status || "pending";
            return s === "clinic_inbounded" || s === "rejected" || s === "cancelled";
          }),
        }))
        .filter((order: any) => order.items.length > 0);
    } else if (status === "pending") {
      // 주문 목록: faqat pending itemlar (confirmed/rejected ko'rinmasin)
      processedOrders = orders
        .map((order: any) => ({
          ...order,
          items: order.items.filter(
            (item: any) => (item.item_status || "pending") === "pending"
          ),
        }))
        .filter((order: any) => order.items.length > 0);
    } else if (status === "confirmed") {
      // 클리닉 확인중: faqat confirmed itemlar (pending ko'rinmasin)
      processedOrders = orders
        .map((order: any) => ({
          ...order,
          items: order.items.filter(
            (item: any) => (item.item_status || "pending") === "confirmed"
          ),
        }))
        .filter((order: any) => order.items.length > 0);
    }

    const filteredOrders = processedOrders.filter(
      (order: any) => order.items && order.items.length > 0
    );

    this.logger.log(
      `📊 [listOrdersForManager] status=${status}, total_fetched=${orders.length}, after_filter=${filteredOrders.length}`
    );
    
    // ✅ DEBUG: Log order statuses for "all" tab
    if (status === "all" || status === "confirmed") {
      filteredOrders.forEach((order: any) => {
        this.logger.debug(
          `   Order ${order.order_no}: items=${order.items.length}`
        );
        // ✅ DEBUG: Log first item's quantities
        if (order.items.length > 0) {
          const firstItem = order.items[0];
          this.logger.debug(
            `      First item: confirmed=${firstItem.confirmed_quantity}, inbound=${firstItem.inbound_quantity}, pending_calc=${(firstItem.confirmed_quantity || firstItem.received_order_quantity || 0) - (firstItem.inbound_quantity || 0)}`
          );
        }
      });
    }

    return {
      total: filteredOrders.length,  // ✅ Return filtered count
      page,
      limit,
      totalPages: Math.ceil(filteredOrders.length / limit),
      orders: filteredOrders.map(this.formatOrder),
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
      // Order status will be set at the end based on item-level status (pending until all items confirmed)
      await tx.supplierOrder.update({
        where: { id },
        data: { updated_at: new Date() },
      });

      // Update item adjustments if provided (for confirmed orders)
      if (dto.adjustments && dto.adjustments.length > 0) {
        for (const adjustment of dto.adjustments) {
          const item = order.items.find((i: any) => i.id === adjustment.itemId);
          if (item) {
            // Build memo with change reasons
            let itemMemo = item.memo || "";
            if (adjustment.actualQuantity !== item.confirmed_quantity) {
              const reason = adjustment.quantityChangeReason || "미지정";
              const note = adjustment.quantityChangeNote
                ? ` (${adjustment.quantityChangeNote})`
                : "";
              itemMemo += `\n[수량 변경: ${item.confirmed_quantity}→${adjustment.actualQuantity}, 사유: ${reason}${note}]`;
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
                confirmed_quantity: adjustment.actualQuantity,
                unit_price: adjustment.actualPrice,
                total_price: adjustment.actualQuantity * adjustment.actualPrice,
                memo: itemMemo.trim(),
                item_status: "confirmed",
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

        // Item-level status: only adjusted items are confirmed; rest stay pending
        const adjustedItemIds = dto.adjustments.map((a: any) => a.itemId);
        if (adjustedItemIds.length < order.items.length) {
          await tx.supplierOrderItem.updateMany({
            where: {
              order_id: id,
              id: { notIn: adjustedItemIds },
            },
            data: { item_status: "pending", updated_at: new Date() },
          });
        }
      }

      // Set all items to item_status confirmed only when full confirm (no partial: no adjustments or adjustments cover all items)
      if (dto.status === "confirmed") {
        const hasPartialAdjustments =
          dto.adjustments &&
          dto.adjustments.length > 0 &&
          dto.adjustments.length < order.items.length;
        if (!hasPartialAdjustments) {
          await tx.supplierOrderItem.updateMany({
            where: { order_id: id },
            data: { item_status: "confirmed", updated_at: new Date() },
          });
        }
      }

      // Update item rejection reasons if provided (for rejected orders)
      if (dto.status === "rejected" && dto.rejectionReasons) {
        this.logger.log(
          `📝 [Rejection] Processing rejection reasons for ${
            Object.keys(dto.rejectionReasons).length
          } items`
        );

        const rejectedItemIds = new Set<string>();
        for (const [itemId, reason] of Object.entries(dto.rejectionReasons)) {
          if (reason && reason.trim() !== "") {
            const item = order.items.find((i: any) => i.id === itemId);
            if (item) {
              rejectedItemIds.add(itemId);
              const itemMemo = item.memo
                ? `${item.memo}\n[거절 사유: ${reason}]`
                : `[거절 사유: ${reason}]`;

              await tx.supplierOrderItem.update({
                where: { id: itemId },
                data: {
                  memo: itemMemo.trim(),
                  item_status: "rejected",
                  updated_at: new Date(),
                },
              });
            } else {
              this.logger.warn(`   ⚠️ Item with id ${itemId} not found`);
            }
          }
        }
        // Partial reject: items not in rejectionReasons -> confirmed. Full reject: all -> rejected.
        if (rejectedItemIds.size === 0) {
          await tx.supplierOrderItem.updateMany({
            where: { order_id: id },
            data: { item_status: "rejected", updated_at: new Date() },
          });
        } else if (rejectedItemIds.size < order.items.length) {
          // Only reset pending/confirmed items to confirmed — do NOT touch clinic_inbounded or cancelled items
          await tx.supplierOrderItem.updateMany({
            where: {
              order_id: id,
              id: { notIn: Array.from(rejectedItemIds) },
              item_status: { notIn: ["clinic_inbounded", "cancelled"] },
            },
            data: { item_status: "confirmed", updated_at: new Date() },
          });
        }
      } else if (dto.status === "rejected") {
        // Full reject: set all non-inbounded items to rejected
        await tx.supplierOrderItem.updateMany({
          where: {
            order_id: id,
            item_status: { notIn: ["clinic_inbounded", "cancelled"] },
          },
          data: { item_status: "rejected", updated_at: new Date() },
        });
      }

      await tx.supplierOrder.update({
        where: { id },
        data: { updated_at: new Date() },
      });

      return tx.supplierOrder.findUnique({
        where: { id },
        include: { items: true },
      });
    });

   

    // If status is "confirmed", notify clinic-backend
    // ✅ FIX: Notify even if adjustments is empty/undefined (no adjustments = all items confirmed as ordered)
    if (dto.status === "confirmed") {
      const adjustments = dto.adjustments || [];
      
      await this.notifyClinicBackend(updated, adjustments);
    }

    // If status is "rejected", notify clinic-backend
    if (dto.status === "rejected") {
     
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
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000"; // ✅ Local dev default
      const apiKey =
        process.env.SUPPLIER_BACKEND_API_KEY || process.env.API_KEY_SECRET;

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
        adjustments: adjustmentsWithProductId,
        updatedItems: order.items.map((item: any) => ({
          itemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          brand: item.brand,
          quantity: item.confirmed_quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          memo: item.memo,
          itemStatus: item.item_status || "pending",
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
          `❌ Failed to notify clinic-backend: ${response.status} - ${errorText}`
        );
        this.logger.error(
          `   Response status: ${response.status} ${response.statusText}`
        );
      } else {
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

      // Partial reject: har bir item uchun itemStatus (rejected/confirmed/clinic_inbounded) yuboriladi
      const rejectionReasonsMap = rejectionReasons || {};
      // clinic_inbounded items also count as "active" — not fully rejected
      const hasAnyActive = order.items.some((i: any) => {
        const s = i.item_status || "pending";
        return s === "confirmed" || s === "clinic_inbounded";
      });
      const payload = {
        orderNo: order.order_no,
        clinicTenantId: order.clinic_tenant_id,
        status: hasAnyActive ? "supplier_confirmed" : "rejected",
        rejectionReasons: rejectionReasonsMap,
        updatedItems: order.items.map((item: any) => ({
          itemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          brand: item.brand,
          quantity: item.confirmed_quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          memo: item.memo,
          // Preserve clinic_inbounded status — do not convert to "confirmed"
          itemStatus:
            (item.item_status || "pending") === "rejected"
              ? "rejected"
              : (item.item_status || "pending") === "clinic_inbounded"
                ? "clinic_inbounded"
                : "confirmed",
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
    const { orderNo, supplierTenantId, clinicTenantId, completedAt, inboundItems } = dto;

    if (!orderNo) {
      throw new BadRequestException("Order number is required");
    }

    // Find order by order_no with items
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
      include: {
        items: true,
      },
    });

    if (!order) {
      this.logger.error(
        `Order ${orderNo} not found in supplier-backend. Search params: supplierTenantId=${supplierTenantId}, clinicTenantId=${clinicTenantId}`
      );
      throw new BadRequestException(`Order ${orderNo} not found`);
    }

    this.logger.log(`Found order ${orderNo} (id: ${order.id})`);

    // ✅ REFACTORED: No split orders - update inbound_quantity directly
    let allItemsCompleted = true;
    let newStatus = "completed";

    if (inboundItems && inboundItems.length > 0) {
      this.logger.log(
        `📦 Processing ${inboundItems.length} inbound items for order ${orderNo} (total items: ${order.items.length})`
      );

      // ✅ Debug: inboundItems ni ko'rsatish
      this.logger.debug(
        `   InboundItems: ${inboundItems.map((ii: any) => `itemId=${ii.itemId}, productId=${ii.productId}, inbound=${ii.inboundQuantity}, original=${ii.originalQuantity}`).join('; ')}`
      );
      this.logger.debug(
        `   OrderItems: ${order.items.map((item: any) => `id=${item.id}, productId=${item.product_id}, confirmed=${item.confirmed_quantity}, inbound=${item.inbound_quantity}`).join('; ')}`
      );

      // ✅ Update each item's inbound_quantity (no splitting)
      for (const item of order.items) {
        // ✅ 1. Avval itemId orqali topish (agar clinic side'dagi OrderItem.id bo'lsa)
        let inboundItem = inboundItems.find((ii: any) => ii.itemId === item.id);
        
        // ✅ 2. Agar topilmasa, productId orqali topish
        if (!inboundItem && item.product_id) {
          inboundItem = inboundItems.find((ii: any) => ii.productId === item.product_id);
        }
        
        if (inboundItem) {
          const newInboundQty = inboundItem.inboundQuantity || 0;
          const currentInboundQty = item.inbound_quantity || 0;
          const totalInboundQty = currentInboundQty + newInboundQty; // ✅ Accumulate inbound
          const confirmedQty = item.confirmed_quantity || item.received_order_quantity;
          
          this.logger.log(
            `   Item ${item.id} (productId: ${item.product_id}): current_inbound=${currentInboundQty}, new_inbound=${newInboundQty}, total_inbound=${totalInboundQty}, confirmed=${confirmedQty}`
          );

          // ✅ Update inbound_quantity + item_status
          const itemFullyInbound = totalInboundQty >= confirmedQty;
          await (this.prisma as any).supplierOrderItem.update({
            where: { id: item.id },
            data: {
              inbound_quantity: totalInboundQty,
              item_status: itemFullyInbound ? "clinic_inbounded" : "confirmed",
              updated_at: new Date(),
            },
          });

          // ✅ Check if item is fully inbound
          if (!itemFullyInbound) {
            allItemsCompleted = false;
            this.logger.log(
              `   📦 Item ${item.id}: partially inbound (${totalInboundQty}/${confirmedQty}, ${confirmedQty - totalInboundQty} remaining)`
            );
          } else {
            this.logger.log(`   ✅ Item ${item.id}: fully inbound → clinic_inbounded (${totalInboundQty}/${confirmedQty})`);
          }
        } else {
          // ✅ Item inbound qilinmagan
          allItemsCompleted = false;
          this.logger.warn(`   ⚠️ Item ${item.id} (productId: ${item.product_id}): not found in inboundItems`);
        }
      }

      // ✅ Set order status based on all items
      newStatus = allItemsCompleted ? "completed" : "confirmed";
      this.logger.log(
        `📊 Order ${orderNo}: ${allItemsCompleted ? 'All items completed' : 'Some items pending'} → status: ${newStatus}`
      );
    } else {
      // ✅ inboundItems yo'q bo'lsa, eski logika (barcha item'lar to'liq inbound)
      newStatus = "completed";
      this.logger.log(`✅ No inboundItems provided, assuming all items completed for order ${orderNo}`);
      // Barcha itemlarni clinic_inbounded qilamiz
      await (this.prisma as any).supplierOrderItem.updateMany({
        where: { order_id: order.id },
        data: { item_status: "clinic_inbounded", updated_at: new Date() },
      });
    }

    const updated = await (this.prisma as any).supplierOrder.update({
      where: { id: order.id },
      data: { updated_at: new Date() },
      include: { items: true },
    });

    this.logger.log(`Order ${orderNo} inbound processed (allItemsCompleted: ${allItemsCompleted})`);
    return {
      success: true,
      message: `Order marked as ${newStatus}`,
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

    // ✅ Barcha itemlarni cancelled — headerda status ustuni yo'q
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).supplierOrderItem.updateMany({
        where: { order_id: order.id },
        data: { item_status: "cancelled", updated_at: new Date() },
      });
      await (this.prisma as any).supplierOrder.update({
        where: { id: order.id },
        data: { updated_at: new Date() },
      });
    });

    this.logger.log(
      `✅ [Order Cancel] Order ${orderNo} marked as cancelled in supplier-backend`
    );

    return {
      success: true,
      orderNo: orderNo,
      message: "Order cancelled",
    };
  }

  /**
   * Partial Order Acceptance - Split order into accepted and remaining.
   * @deprecated Use updateStatus with item-level adjustments (confirm/reject per item) instead.
   */
  async partialAcceptOrder(
    id: string,
    supplierManagerId: string,
    dto: { selectedItemIds: string[]; adjustments?: any[]; memo?: string }
  ) {
    this.logger.warn(
      "partialAcceptOrder is deprecated. Use updateStatus(confirmed) with adjustments for item-level confirm."
    );
    throw new BadRequestException(
      "Partial accept is deprecated. Use full confirm with quantity/price adjustments, or full reject."
    );
  }

  /**
   * Partial reject order - split order into rejected and remaining.
   * @deprecated Use updateStatus(rejected) with rejectionReasons (per-item) instead.
   */
  async partialRejectOrder(
    id: string,
    supplierManagerId: string,
    dto: { selectedItemIds: string[]; rejectionReasons: Record<string, string> }
  ) {
    this.logger.warn(
      "partialRejectOrder is deprecated. Use updateStatus(rejected) with rejectionReasons for item-level reject."
    );
    throw new BadRequestException(
      "Partial reject is deprecated. Use full reject with rejection reasons per item."
    );
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
              quantity: i.confirmed_quantity, // ✅ Supplier confirmed
              total_price: i.total_price,
              product_id: i.product_id,
            })),
          },
          {
            order_no: remainingOrder.order_no,
            status: "pending",
            total_amount: remainingOrder.total_amount,
            items: remainingOrder.items.map((i: any) => ({
              product_name: i.product_name,
              quantity: i.confirmed_quantity, // ✅ Supplier confirmed
              total_price: i.total_price,
              product_id: i.product_id,
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

  /**
   * Notify clinic backend about partial rejection split
   */
  private async notifyClinicBackendReject(
    rejectedOrder: any,
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

      const idempotencyKey = `split-reject-${originalOrder.id}-${Date.now()}`;

      const payload = {
        type: "order_split",
        original_order_no: originalOrder.order_no,
        clinic_tenant_id: originalOrder.clinic_tenant_id,
        orders: [
          {
            order_no: rejectedOrder.order_no,
            status: "rejected",
            total_amount: rejectedOrder.total_amount,
            items: rejectedOrder.items.map((i: any) => ({
              product_name: i.product_name,
              quantity: i.confirmed_quantity, // ✅ Supplier confirmed
              total_price: i.total_price,
              product_id: i.product_id,
            })),
          },
          {
            order_no: remainingOrder.order_no,
            status: "pending",
            total_amount: remainingOrder.total_amount,
            items: remainingOrder.items.map((i: any) => ({
              product_name: i.product_name,
              quantity: i.confirmed_quantity, // ✅ Supplier confirmed
              total_price: i.total_price,
              product_id: i.product_id,
            })),
          },
        ],
      };

      this.logger.log(
        `📤 [Supplier→Clinic] Notifying about partial rejection: ${originalOrder.order_no}`
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
        `✅ [Supplier→Clinic] Partial rejection notification sent successfully`
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to notify clinic about partial rejection: ${error.message}`
      );
    }
  }

  private formatOrder = (order: any) => {
    const formattedItems = (order.items || []).map((item: any) => {
      const confirmedQty = item.confirmed_quantity ?? item.received_order_quantity;
      const inboundQty = item.inbound_quantity || 0;
      const pendingQty = Math.max(0, confirmedQty - inboundQty); // ✅ Runtime calculation
      
      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        brand: item.brand,
        batchNo: item.batch_no,
        receivedOrderQuantity: item.received_order_quantity,
        confirmedQuantity: confirmedQty,
        inboundQuantity: inboundQty,
        pendingQuantity: pendingQty,
        quantity: pendingQty,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        memo: item.memo,
        itemStatus: item.item_status || "pending",
      };
    });

    // ✅ DEBUG: Log formatted items
    if (formattedItems.length > 0) {
      this.logger.debug(
        `   [formatOrder] Order ${order.order_no}: Item[0] quantity=${formattedItems[0].quantity}, pending=${formattedItems[0].pendingQuantity}`
      );
    }

    const itemsList = order.items || [];
    const derivedStatus =
      itemsList.length === 0
        ? "pending"
        : itemsList.every((i: any) => (i.item_status || "pending") === "cancelled")
          ? "cancelled"
          : itemsList.every((i: any) => (i.item_status || "pending") === "rejected")
            ? "rejected"
            : itemsList.every((i: any) => (i.item_status || "pending") === "confirmed")
              ? "confirmed"
              : "pending";

    return {
      id: order.id,
      orderNo: order.order_no,
      status: derivedStatus,
      totalAmount: order.total_amount,
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
      items: formattedItems,
    };
  };
}
