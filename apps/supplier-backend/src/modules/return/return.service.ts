import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { NotificationService } from "../notifications/notification.service";

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService
  ) {}

  private managerScopeOrUnassigned(supplierManagerId: string) {
    return {
      OR: [
        { supplier_manager_id: supplierManagerId },
        { supplier_manager_id: null },
      ],
    };
  }

  /** Clinic defective flow: defective_exchange | defective_return, or legacy "…|…" strings */
  private isProductCategoryReturnType(rt: string | null | undefined): boolean {
    if (!rt) return false;
    if (rt === "defective_exchange" || rt === "defective_return") return true;
    return rt.includes("|");
  }

  private isEmptyBoxCategoryReturnType(rt: string | null | undefined): boolean {
    if (!rt) return true;
    return !this.isProductCategoryReturnType(rt);
  }

  private matchesDeprecatedReturnTypeFilter(
    itemReturnType: string | null | undefined,
    filter: "반품" | "교환"
  ): boolean {
    if (!itemReturnType) return false;
    if (filter === "교환") {
      return (
        itemReturnType.includes("교환") ||
        itemReturnType === "defective_exchange"
      );
    }
    return (
      itemReturnType.includes("반품") ||
      itemReturnType === "defective_return"
    );
  }

  private aggregateGroupStatus(
    rows: { status: string }[]
  ): "pending" | "processing" | "completed" | "rejected" {
    if (rows.length === 0) return "pending";
    if (rows.some((r) => r.status === "rejected")) return "rejected";
    if (rows.every((r) => r.status === "completed")) return "completed";
    if (rows.some((r) => r.status === "pending")) return "pending";
    if (
      rows.every(
        (r) => r.status === "processing" || r.status === "completed"
      )
    ) {
      return rows.every((r) => r.status === "completed")
        ? "completed"
        : "processing";
    }
    return "processing";
  }

  private repGroupId(rows: { id: string }[]): string {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id))[0].id;
  }

  private maxDate(
    rows: { [k: string]: Date | null | undefined }[],
    key: string
  ): Date | undefined {
    let t = 0;
    let best: Date | undefined;
    for (const r of rows) {
      const d = r[key] as Date | null | undefined;
      if (d && d.getTime() > t) {
        t = d.getTime();
        best = d;
      }
    }
    return best;
  }

  private minDate(rows: { created_at: Date }[]): Date {
    return new Date(Math.min(...rows.map((r) => r.created_at.getTime())));
  }

  private formatVirtualReturn(rows: any[]) {
    const sorted = [...rows].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime()
    );
    const head = sorted[0];
    const agg = this.aggregateGroupStatus(sorted);
    return {
      id: this.repGroupId(sorted),
      return_no: head.return_no,
      clinic_tenant_id: head.clinic_tenant_id,
      clinic_name: head.clinic_name,
      clinic_manager_name: head.clinic_manager_name,
      status: agg,
      created_at: head.created_at,
      updated_at: head.updated_at,
      confirmed_at: this.maxDate(sorted, "confirmed_at"),
      completed_at: this.maxDate(sorted, "completed_at"),
      rejected_at: this.maxDate(sorted, "rejected_at"),
      items: sorted.map((row: any) => ({
        id: row.id,
        product_name: row.product_name,
        brand: row.brand,
        quantity: row.quantity,
        return_type: row.return_type,
        memo: row.memo,
        images: row.images,
        inbound_date: row.inbound_date,
        total_price: row.tip_return_price,
        order_no: row.order_no,
        batch_no: row.batch_no,
        status: row.status,
        product_id: row.product_id,
      })),
    };
  }

  private formatReturnRequestPayload(request: any) {
    return {
      id: request.id,
      returnNo: request.return_no,
      clinicTenantId: request.clinic_tenant_id,
      clinicName: request.clinic_name,
      clinicManagerName: request.clinic_manager_name,
      status: request.status,
      items:
        request.items?.map((item: any) => ({
          id: item.id,
          productName: item.product_name,
          brand: item.brand,
          quantity: item.quantity,
          returnType: item.return_type,
          memo: item.memo,
          images: item.images,
          inboundDate: item.inbound_date,
          totalPrice: item.total_price,
          orderNo: item.order_no,
          batchNo: item.batch_no,
          productId: item.product_id,
        })) || [],
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    };
  }

  async getReturnNotifications(
    supplierManagerId: string,
    filters?: {
      status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL";
      isRead?: boolean | null;
      returnType?: "반품" | "교환";
      returnCategory?: "empty_box" | "product";
      page?: number;
      limit?: number;
    }
  ) {
    if (!supplierManagerId) {
      throw new BadRequestException("Supplier Manager ID is required");
    }

    const manager = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierManager.findFirst({
        where: { id: supplierManagerId },
        select: { supplier_tenant_id: true },
      });
    });

    if (!manager) {
      throw new BadRequestException("Supplier Manager not found");
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      supplier_tenant_id: manager.supplier_tenant_id,
      ...this.managerScopeOrUnassigned(supplierManagerId),
    };

    try {
      const tipRows = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findMany({
          where,
          orderBy: { created_at: "desc" },
        });
      });

      const byReturnNo = new Map<string, any[]>();
      for (const row of tipRows) {
        const k = row.return_no;
        if (!byReturnNo.has(k)) byReturnNo.set(k, []);
        byReturnNo.get(k)!.push(row);
      }

      let groups: any[][] = [...byReturnNo.values()];

      const filterRowsInGroup = (rows: any[]) => {
        let filtered = rows;
        if (filters?.returnCategory) {
          filtered = filtered.filter((item: any) => {
            if (filters.returnCategory === "empty_box") {
              return this.isEmptyBoxCategoryReturnType(item.return_type);
            }
            if (filters.returnCategory === "product") {
              return this.isProductCategoryReturnType(item.return_type);
            }
            return false;
          });
        } else if (filters?.returnType) {
          filtered = filtered.filter((item: any) =>
            this.matchesDeprecatedReturnTypeFilter(
              item.return_type,
              filters.returnType!
            )
          );
        }
        return filtered;
      };

      groups = groups
        .map((g) => filterRowsInGroup(g))
        .filter((g) => g.length > 0);

      const statusFilter = filters?.status;
      if (statusFilter && statusFilter !== "ALL") {
        const want =
          statusFilter === "PENDING"
            ? "pending"
            : statusFilter === "ACCEPTED"
              ? "processing"
              : statusFilter === "REJECTED"
                ? "rejected"
                : null;
        if (want) {
          groups = groups.filter(
            (g) => this.aggregateGroupStatus(g) === want
          );
        }
      }

      if (filters?.isRead === true) {
        groups = groups.filter(
          (g) => this.aggregateGroupStatus(g) !== "pending"
        );
      } else if (filters?.isRead === false) {
        groups = groups.filter(
          (g) => this.aggregateGroupStatus(g) === "pending"
        );
      }

      groups.sort(
        (a, b) =>
          this.minDate(b).getTime() - this.minDate(a).getTime()
      );

      const total = groups.length;
      const unreadCount = groups.filter(
        (g) => this.aggregateGroupStatus(g) === "pending"
      ).length;

      const pageGroups = groups.slice(skip, skip + limit);

      const formattedNotifications = pageGroups.map((groupRows) => {
        const totalRefund = groupRows.reduce(
          (sum: number, row: any) => sum + (row.tip_return_price || 0),
          0
        );
        const agg = this.aggregateGroupStatus(groupRows);
        const repId = this.repGroupId(groupRows);
        return {
          id: repId,
          returnId: repId,
          returnNo: groupRows[0].return_no,
          clinicName: groupRows[0].clinic_name,
          returnManagerName: groupRows[0].clinic_manager_name,
          returnDate: this.minDate(groupRows),
          totalRefund,
          items: groupRows.map((item: any) => ({
            id: item.id,
            productCode: item.batch_no || item.order_no || "",
            productName: item.product_name,
            productBrand: item.brand || "",
            qty: item.quantity,
            unitPrice:
              item.quantity > 0
                ? item.tip_return_price / item.quantity
                : 0,
            totalPrice: item.tip_return_price,
            returnType: item.return_type,
            memo: item.memo,
            images: Array.isArray(item.images)
              ? item.images
              : item.images
                ? [item.images]
                : [],
            inboundDate: item.inbound_date,
            orderNo: item.order_no,
            batchNo: item.batch_no,
            status: item.status || "pending",
            confirmedAt: item.confirmed_at ?? null,
          })),
          status: agg.toUpperCase(),
          isRead: agg !== "pending",
          createdAt: groupRows[0].created_at,
          confirmedAt: this.maxDate(groupRows, "confirmed_at"),
          completedAt: this.maxDate(groupRows, "completed_at"),
          rejectedAt: this.maxDate(groupRows, "rejected_at"),
          acceptedAt: this.maxDate(groupRows, "completed_at"),
        };
      });

      return {
        notifications: formattedNotifications,
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching return notifications: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to fetch return notifications: ${error.message}`
      );
    }
  }

  async markAsRead(notificationId: string, supplierManagerId: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException(
        "Notification ID and Supplier Manager ID are required"
      );
    }

    try {
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      const row = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: {
            id: notificationId,
            supplier_tenant_id: manager.supplier_tenant_id,
            ...this.managerScopeOrUnassigned(supplierManagerId),
          },
        });
      });

      if (!row) {
        throw new BadRequestException("Return request not found");
      }

      const group = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findMany({
          where: {
            return_no: row.return_no,
            supplier_tenant_id: manager.supplier_tenant_id,
          },
        });
      });
      const agg = this.aggregateGroupStatus(group);

      return {
        success: true,
        notification: {
          id: row.id,
          isRead: agg !== "pending",
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error marking notification as read: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to mark notification as read: ${error.message}`
      );
    }
  }

  async markAllAsRead(supplierManagerId: string) {
    if (!supplierManagerId) {
      throw new BadRequestException("Supplier Manager ID is required");
    }

    try {
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      const pendingRows = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findMany({
          where: {
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
            ...this.managerScopeOrUnassigned(supplierManagerId),
          },
          select: { return_no: true },
        });
      });

      const uniqueReturnNos = new Set(
        pendingRows.map((r: any) => r.return_no)
      );

      return {
        success: true,
        updatedCount: uniqueReturnNos.size,
      };
    } catch (error: any) {
      this.logger.error(
        `Error marking all notifications as read: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to mark all notifications as read: ${error.message}`
      );
    }
  }

  async acceptReturn(
    notificationId: string,
    supplierManagerId: string,
    itemId?: string,
    adjustments?: Array<{
      itemId: string;
      actualQuantity: number;
      quantityChangeReason?: string | null;
    }>
  ) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException(
        "Notification ID and Supplier Manager ID are required"
      );
    }

    try {
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true, id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      const anchor = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: {
            id: notificationId,
            supplier_tenant_id: manager.supplier_tenant_id,
            ...this.managerScopeOrUnassigned(supplierManagerId),
          },
        });
      });

      if (!anchor) {
        throw new BadRequestException("Return request not found");
      }

      const returnNo = anchor.return_no as string;

      if (itemId) {
        const line = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.findFirst({
            where: {
              id: itemId,
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
              status: "pending",
            },
          });
        });
        if (!line) {
          throw new BadRequestException("Return line not found or not pending");
        }
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.update({
            where: { id: itemId },
            data: {
              status: "processing",
              updated_at: new Date(),
            },
          });
        });

        const allRows = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.findMany({
            where: {
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
            },
          });
        });

        const allAccepted = allRows.every(
          (r: any) => r.status === "processing" || r.status === "completed"
        );

        if (allAccepted) {
          await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierTipReturnRequest.updateMany({
              where: {
                return_no: returnNo,
                supplier_tenant_id: manager.supplier_tenant_id,
              },
              data: {
                supplier_manager_id: manager.id,
                confirmed_at: new Date(),
                updated_at: new Date(),
              },
            });
          });

          this.sendAcceptWebhookToClinic({ id: notificationId }).catch(
            (error) => {
              this.logger.error(
                `Failed to send accept webhook to clinic (single-item path): ${error.message}`
              );
            }
          );
        }

        return {
          success: true,
          notification: {
            id: notificationId,
            itemId: itemId,
            status: "PROCESSING",
          },
        };
      }

      const pendingCheck = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.count({
          where: {
            return_no: returnNo,
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
          },
        });
      });

      if (pendingCheck === 0) {
        throw new BadRequestException(
          "Return is not pending or already processed"
        );
      }

      if (adjustments && adjustments.length > 0) {
        const allRows = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.findMany({
            where: {
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
            },
          });
        });

        const webhookPayload: {
          returnId: string;
          clinicTenantId: string;
          unreturnedItems: Array<{
            productId: string;
            batchNo: string;
            unreturnedQty: number;
            reason: string;
          }>;
        } = {
          returnId: anchor.id,
          clinicTenantId: anchor.clinic_tenant_id,
          unreturnedItems: [],
        };

        for (const adj of adjustments) {
          const existingItem = allRows.find((r: any) => r.id === adj.itemId);
          if (!existingItem) continue;

          const originalQty = existingItem.quantity;
          const acceptedQty = adj.actualQuantity;
          const unreturnedQty = originalQty - acceptedQty;

          const updateData: any = {
            status: "processing",
            quantity: adj.actualQuantity,
            tip_return_price: Math.round(
              (existingItem.tip_return_price / Math.max(originalQty, 1)) *
                adj.actualQuantity
            ),
            updated_at: new Date(),
          };

          if (adj.quantityChangeReason) {
            const existingMemo = existingItem.memo || "";
            updateData.memo = existingMemo
              ? `${adj.quantityChangeReason} - ${existingMemo}`
              : adj.quantityChangeReason;
            updateData.quantity_change_reason = adj.quantityChangeReason;
          }

          if (
            unreturnedQty > 0 &&
            adj.quantityChangeReason === "추후반납" &&
            existingItem.product_id
          ) {
            webhookPayload.unreturnedItems.push({
              productId: existingItem.product_id,
              batchNo: existingItem.batch_no || "",
              unreturnedQty,
              reason: "추후반납",
            });
          }

          await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierTipReturnRequest.updateMany({
              where: {
                id: adj.itemId,
                return_no: returnNo,
                supplier_tenant_id: manager.supplier_tenant_id,
                status: "pending",
              },
              data: updateData,
            });
          });
        }

        const adjustmentIds = new Set(adjustments.map((a) => a.itemId));
        const otherPendingIds = allRows
          .filter(
            (r: any) => r.status === "pending" && !adjustmentIds.has(r.id)
          )
          .map((r: any) => r.id);
        if (otherPendingIds.length > 0) {
          await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierTipReturnRequest.updateMany({
              where: {
                id: { in: otherPendingIds },
                return_no: returnNo,
                supplier_tenant_id: manager.supplier_tenant_id,
                status: "pending",
              },
              data: {
                status: "processing",
                updated_at: new Date(),
              },
            });
          });
        }

        if (webhookPayload.unreturnedItems.length > 0) {
          this.sendPartialReturnWebhookToClinic(webhookPayload).catch(
            (error) => {
              this.logger.error(
                `Failed to send partial return webhook to clinic: ${error.message}`
              );
            }
          );
        }
      } else {
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.updateMany({
            where: {
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
              status: "pending",
            },
            data: {
              status: "processing",
              updated_at: new Date(),
            },
          });
        });
      }

      await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.updateMany({
          where: {
            return_no: returnNo,
            supplier_tenant_id: manager.supplier_tenant_id,
          },
          data: {
            supplier_manager_id: manager.id,
            confirmed_at: new Date(),
            updated_at: new Date(),
          },
        });
      });

      this.sendAcceptWebhookToClinic({ id: anchor.id }).catch((error) => {
        this.logger.error(
          `Failed to send accept webhook to clinic: ${error.message}`
        );
      });

      return {
        success: true,
        notification: {
          id: notificationId,
          status: "PROCESSING",
          confirmedAt: new Date(),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error accepting return: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to accept return: ${error.message}`
      );
    }
  }

  async rejectReturn(
    notificationId: string,
    supplierManagerId: string,
    reason?: string
  ) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException(
        "Notification ID and Supplier Manager ID are required"
      );
    }

    try {
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true, id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      const anchor = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: {
            id: notificationId,
            supplier_tenant_id: manager.supplier_tenant_id,
            ...this.managerScopeOrUnassigned(supplierManagerId),
          },
        });
      });

      if (!anchor) {
        throw new BadRequestException("Return request not found");
      }

      const now = new Date();
      const res = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.updateMany({
          where: {
            return_no: anchor.return_no,
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
          },
          data: {
            status: "rejected",
            supplier_manager_id: manager.id,
            rejected_reason: reason || null,
            rejected_at: now,
            updated_at: now,
          },
        });
      });

      if (res.count === 0) {
        throw new BadRequestException(
          "Return is not pending or already processed"
        );
      }

      this.sendOrderReturnRejectWebhookToClinic(
        anchor.return_no,
        reason
      ).catch((err) =>
        this.logger.warn(
          `Order-return reject webhook failed: ${err?.message || err}`
        )
      );

      return {
        success: true,
        notification: {
          id: notificationId,
          status: "REJECTED",
          rejectedAt: now,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error rejecting return: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to reject return: ${error.message}`
      );
    }
  }

  async completeReturn(
    returnRequestId: string,
    supplierManagerId: string,
    itemId?: string
  ) {
    try {
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      const anchor = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: {
            id: returnRequestId,
            supplier_tenant_id: manager.supplier_tenant_id,
            ...this.managerScopeOrUnassigned(supplierManagerId),
          },
        });
      });

      if (!anchor) {
        throw new BadRequestException("Return request not found");
      }

      const returnNo = anchor.return_no as string;

      if (itemId) {
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.updateMany({
            where: {
              id: itemId,
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
            },
            data: {
              status: "completed",
              completed_at: new Date(),
              updated_at: new Date(),
            },
          });
        });
      } else {
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierTipReturnRequest.updateMany({
            where: {
              return_no: returnNo,
              supplier_tenant_id: manager.supplier_tenant_id,
            },
            data: {
              status: "completed",
              completed_at: new Date(),
              updated_at: new Date(),
            },
          });
        });
      }

      const allRows = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findMany({
          where: {
            return_no: returnNo,
            supplier_tenant_id: manager.supplier_tenant_id,
          },
        });
      });

      const returnItems = itemId
        ? allRows.filter((r: any) => r.id === itemId)
        : allRows;

      const clinicBackendUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const supplierApiKey =
        process.env.SUPPLIER_BACKEND_API_KEY ||
        process.env.API_KEY_SECRET ||
        "";

      if (!supplierApiKey) {
        this.logger.error(
          `SUPPLIER_BACKEND_API_KEY not configured! Check environment variables.`
        );
      }

      for (const item of returnItems) {
        try {
          if (!supplierApiKey) {
            this.logger.warn(
              `SUPPLIER_BACKEND_API_KEY not configured, skipping webhook for return_no: ${returnNo}`
            );
            continue;
          }

          const webhookResponse = await fetch(
            `${clinicBackendUrl}/order-returns/webhook/complete`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": supplierApiKey,
              },
              body: JSON.stringify({
                return_no: returnNo,
                item_id: item.id,
                status: "completed",
              }),
            }
          );

          if (!webhookResponse.ok) {
            const errorText = await webhookResponse.text();
            this.logger.error(
              `Webhook failed: ${webhookResponse.status} - ${errorText} for return_no: ${returnNo}`
            );
          } else {
            const responseData = await webhookResponse.json();
            this.logger.log(
              `Webhook sent successfully for return_no: ${returnNo}, response: ${JSON.stringify(responseData)}`
            );
          }
        } catch (fetchError: any) {
          this.logger.error(
            `Webhook fetch error for return_no ${returnNo}: ${fetchError.message}`
          );
        }
      }

      return { success: true, message: "Return marked as completed" };
    } catch (error: any) {
      this.logger.error(
        `Error completing return: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to complete return: ${error.message}`
      );
    }
  }

  private async sendAcceptWebhookToClinic(request: any): Promise<void> {
    try {
      const clinicBackendUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const supplierApiKey =
        process.env.SUPPLIER_BACKEND_API_KEY ||
        process.env.API_KEY_SECRET ||
        "";

      if (!supplierApiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping accept webhook"
        );
        return;
      }

      const row = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: { id: request.id },
          select: { return_no: true },
        });
      });

      if (!row || !row.return_no) {
        this.logger.warn(
          `Return row ${request.id} has no return_no, skipping webhook`
        );
        return;
      }

      const returnNo = row.return_no as string;
      const isLegacyNumericReturn =
        returnNo &&
        typeof returnNo === "string" &&
        returnNo.length >= 10 &&
        /^\d+$/.test(returnNo);
      const isClinicOrderReturnNo =
        typeof returnNo === "string" &&
        returnNo.length >= 10 &&
        returnNo.startsWith("B");
      const isClinicDefectiveReturnId =
        typeof returnNo === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          returnNo
        );
      const isClinicTipReturnNo =
        typeof returnNo === "string" &&
        returnNo.length >= 10 &&
        returnNo.startsWith("R");

      if (isLegacyNumericReturn || isClinicTipReturnNo) {
        try {
          const webhookResponse = await fetch(
            `${clinicBackendUrl}/returns/webhook/accept`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": supplierApiKey,
              },
              body: JSON.stringify({
                return_no: returnNo,
                status: "processing",
              }),
            }
          );

          if (!webhookResponse.ok) {
            const errorText = await webhookResponse.text();
            this.logger.error(
              `Accept webhook failed: ${webhookResponse.status} - ${errorText} for return_no: ${returnNo}`
            );
          }
        } catch (fetchError: any) {
          this.logger.error(
            `Accept webhook fetch error for return_no ${returnNo}: ${fetchError.message}`
          );
        }
      }

      if (isClinicOrderReturnNo || isClinicDefectiveReturnId) {
        try {
          const orRes = await fetch(
            `${clinicBackendUrl}/order-returns/webhook/accept`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": supplierApiKey,
              },
              body: JSON.stringify({
                return_no: returnNo,
                status: "processing",
              }),
            }
          );
          if (!orRes.ok) {
            const t = await orRes.text();
            this.logger.warn(
              `Order-return accept webhook: ${orRes.status} ${t} return_no=${returnNo}`
            );
          }
        } catch (e: any) {
          this.logger.warn(
            `Order-return accept webhook error return_no=${returnNo}: ${e?.message}`
          );
        }
      } else if (
        !isLegacyNumericReturn &&
        !isClinicOrderReturnNo &&
        !isClinicDefectiveReturnId &&
        !isClinicTipReturnNo
      ) {
        this.logger.warn(
          `Unknown return_no format, skipping webhooks: ${returnNo} (length: ${returnNo?.length})`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send accept webhook to clinic: ${error.message}`,
        error.stack
      );
    }
  }

  private async sendOrderReturnRejectWebhookToClinic(
    returnNo: string | null | undefined,
    reason?: string
  ): Promise<void> {
    if (!returnNo || typeof returnNo !== "string") return;

    const clinicBackendUrl =
      process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
    const supplierApiKey =
      process.env.SUPPLIER_BACKEND_API_KEY ||
      process.env.API_KEY_SECRET ||
      "";
    if (!supplierApiKey) return;

    const res = await fetch(
      `${clinicBackendUrl}/order-returns/webhook/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": supplierApiKey,
        },
        body: JSON.stringify({ return_no: returnNo, reason: reason ?? null }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      this.logger.warn(
        `Order-return reject webhook: ${res.status} ${t} return_no=${returnNo}`
      );
    }
  }

  private async sendPartialReturnWebhookToClinic(payload: {
    returnId: string;
    clinicTenantId: string;
    unreturnedItems: Array<{
      productId: string;
      batchNo: string;
      unreturnedQty: number;
      reason: string;
    }>;
  }): Promise<void> {
    try {
      const clinicBackendUrl =
        process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
      const supplierApiKey =
        process.env.SUPPLIER_BACKEND_API_KEY ||
        process.env.API_KEY_SECRET ||
        "";

      if (!supplierApiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping partial return webhook"
        );
        return;
      }

      this.logger.log(
        `Sending partial return webhook for returnId: ${payload.returnId}, unreturned items: ${payload.unreturnedItems.length}`
      );

      const webhookResponse = await fetch(
        `${clinicBackendUrl}/returns/webhooks/return-partial-acceptance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": supplierApiKey,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        this.logger.error(
          `Partial return webhook failed: ${webhookResponse.status} - ${errorText}`
        );
      } else {
        this.logger.log(
          `Partial return webhook sent successfully for returnId: ${payload.returnId}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send partial return webhook to clinic: ${error.message}`,
        error.stack
      );
    }
  }

  async createReturnRequest(dto: any) {
    const {
      returnNo,
      supplierTenantId,
      supplierManagerId,
      clinicTenantId,
      clinicName,
      clinicManagerName,
      items,
      createdAt,
    } = dto;

    if (
      !returnNo ||
      !supplierTenantId ||
      !clinicTenantId ||
      !items ||
      items.length === 0
    ) {
      throw new BadRequestException(
        "returnNo, supplierTenantId, clinicTenantId va items talab qilinadi"
      );
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const mapItemToRow = (targetReturnNo: string) => (item: any) => {
      const imagesArray = Array.isArray(item.images)
        ? item.images
        : item.images
          ? [item.images]
          : [];
      return {
        return_no: targetReturnNo,
        supplier_tenant_id: supplierTenantId,
        supplier_manager_id: supplierManagerId || null,
        clinic_tenant_id: clinicTenantId,
        clinic_name: clinicName,
        clinic_manager_name: clinicManagerName,
        status: "pending",
        product_name: item.productName,
        brand: item.brand || null,
        quantity: item.quantity,
        return_type: item.returnType,
        tip_return_price: item.totalPrice ?? 0,
        quantity_change_reason: null as string | null,
        memo: item.memo || null,
        images: imagesArray,
        inbound_date: item.inboundDate || null,
        order_no: item.orderNo || null,
        batch_no: item.batchNo || null,
        product_id: item.productId || null,
        created_at: createdAt ? new Date(createdAt) : new Date(),
      };
    };

    try {
      const existingRecent = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findFirst({
          where: {
            supplier_tenant_id: supplierTenantId,
            clinic_tenant_id: clinicTenantId,
            supplier_manager_id: supplierManagerId || null,
            status: "pending",
            created_at: { gte: fiveMinutesAgo },
          },
          orderBy: { created_at: "desc" },
        });
      });

      let targetReturnNo = returnNo as string;
      if (
        existingRecent &&
        existingRecent.supplier_manager_id === (supplierManagerId || null)
      ) {
        targetReturnNo = existingRecent.return_no;
      }

      const rows = items.map(mapItemToRow(targetReturnNo));
      await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.createMany({
          data: rows,
        });
      });

      const all = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierTipReturnRequest.findMany({
          where: {
            return_no: targetReturnNo,
            supplier_tenant_id: supplierTenantId,
          },
        });
      });
      const virtual = this.formatVirtualReturn(all);

      const dedupe =
        existingRecent &&
        existingRecent.supplier_manager_id === (supplierManagerId || null)
          ? `append-${Date.now()}`
          : undefined;

      this.logger.log(
        `[Return Create] Tip return rows created. return_no=${targetReturnNo}, supplierTenantId=${supplierTenantId}`
      );

      await this.notifyReturnRequestCreated({
        items,
        clinicName,
        clinicManagerName,
        supplierManagerId,
        supplierTenantId,
        returnRequestId: virtual.id,
        returnNo: targetReturnNo,
        dedupeSuffix: dedupe,
      });

      return this.formatReturnRequestPayload(virtual);
    } catch (error: any) {
      this.logger.error(
        `Return request create failed: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Return request create failed: ${error.message}`
      );
    }
  }

  private phrasesForClinicReturnRequest(items: any[]): {
    kindNoun: "반품" | "교환";
    requestLine: string;
  } {
    const types = items.map((i: any) =>
      String(i.returnType ?? i.return_type ?? "")
    );
    const anyExchange = types.some(
      (t) => t.includes("교환") || t === "defective_exchange"
    );
    if (anyExchange) {
      return {
        kindNoun: "교환",
        requestLine: "교환 요청이 들어왔습니다.",
      };
    }
    return {
      kindNoun: "반품",
      requestLine: "반품 요청이 들어왔습니다.",
    };
  }

  private async notifyReturnRequestCreated(params: {
    items: any[];
    clinicName: string;
    clinicManagerName?: string | null;
    supplierManagerId: string | null | undefined;
    supplierTenantId: string;
    returnRequestId: string;
    returnNo: string;
    dedupeSuffix?: string;
  }): Promise<void> {
    const {
      items,
      clinicName,
      clinicManagerName,
      supplierManagerId,
      supplierTenantId,
      returnRequestId,
      returnNo,
      dedupeSuffix,
    } = params;

    try {
      const productNames: string[] = items
        .map((item: any) => item.productName || item.product_name)
        .filter(Boolean);
      const totalCount = productNames.length;
      const preview = productNames.slice(0, 2).join(", ");
      const phrases = this.phrasesForClinicReturnRequest(items);
      const notificationPayload = {
        returnNo,
        returnCategory: "product" as const,
        kind: phrases.kindNoun,
      };
      const productSummary =
        totalCount > 2
          ? `${preview} 등 총 ${totalCount}개 제품`
          : totalCount > 0
            ? `${preview} 총 ${totalCount}개 제품`
            : items.length > 0
              ? `총 ${items.length}개 제품`
              : "제품";

      const notifTitle = clinicName
        ? `${clinicName}${clinicManagerName ? " " + clinicManagerName : ""}`
        : "클리닉";
      const notifBody = `${productSummary}의 ${phrases.kindNoun}\n${phrases.requestLine}`;

      const dedupeBase = dedupeSuffix
        ? `new_return:${returnRequestId}:${dedupeSuffix}`
        : `new_return:${returnRequestId}`;

      if (supplierManagerId) {
        await this.notificationService.create({
          supplierManagerId,
          type: "new_return",
          title: notifTitle,
          body: notifBody,
          entityType: "return",
          entityId: returnRequestId,
          payload: notificationPayload,
          dedupeKey: dedupeBase,
        });
      } else {
        const managers = await (this.prisma as any).supplierManager.findMany({
          where: { supplier_tenant_id: supplierTenantId },
          select: { id: true },
        });
        if (managers.length > 0) {
          await this.notificationService.createMany(
            managers.map((m: any) => ({
              supplierManagerId: m.id,
              type: "new_return",
              title: notifTitle,
              body: notifBody,
              entityType: "return",
              entityId: returnRequestId,
              payload: notificationPayload,
              dedupeKey: `${dedupeBase}:${m.id}`,
            }))
          );
        }
      }
    } catch (notifErr: any) {
      this.logger.warn(
        `Return notification failed (non-critical): ${notifErr?.message}`
      );
    }
  }
}
