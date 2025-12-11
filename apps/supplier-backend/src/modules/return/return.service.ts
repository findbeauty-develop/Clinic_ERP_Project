import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SupplierManager uchun return request'larni olish
   */
  async getReturnNotifications(
    supplierManagerId: string,
    filters?: {
      status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL";
      isRead?: boolean | null;
      page?: number;
      limit?: number;
    }
  ) {
    if (!supplierManagerId) {
      throw new BadRequestException("Supplier Manager ID is required");
    }

    // Get supplier tenant_id from manager
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
    };

    // Status filter - map old statuses to new ones
    if (filters?.status && filters.status !== "ALL") {
      const statusMap: Record<string, string> = {
        PENDING: "pending",
        ACCEPTED: "processing",
        REJECTED: "rejected",
      };
      where.status = statusMap[filters.status] || filters.status.toLowerCase();
    }

    try {
      // Total count
      const total = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.count({
          where,
        });
      });

      // Unread count (pending requests)
      const unreadCount = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.count({
          where: {
            ...where,
            status: "pending",
          },
        });
      });

      // Return requests
      const returnRequests = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findMany({
          where,
          include: {
            items: true,
          },
          orderBy: {
            created_at: "desc",
          },
          skip,
          take: limit,
        });
      });

      // Format response
      const formattedNotifications = returnRequests.map((request: any) => {
        const totalRefund = request.items?.reduce(
          (sum: number, item: any) => sum + (item.total_price || 0),
          0
        ) || 0;

        return {
          id: request.id,
          returnId: request.id,
          returnNo: request.return_no,
          clinicName: request.clinic_name,
          returnManagerName: request.clinic_manager_name,
          returnDate: request.created_at,
          totalRefund: totalRefund,
          items: request.items?.map((item: any) => ({
            id: item.id,
            productCode: item.batch_no || item.order_no || "",
            productName: item.product_name,
            productBrand: item.brand || "",
            qty: item.quantity,
            unitPrice: item.total_price / item.quantity || 0,
            totalPrice: item.total_price,
            returnType: item.return_type,
            memo: item.memo,
            images: Array.isArray(item.images) ? item.images : (item.images ? [item.images] : []),
            inboundDate: item.inbound_date,
            orderNo: item.order_no,
            batchNo: item.batch_no,
            status: item.status || "pending",
          })) || [],
          status: request.status.toUpperCase(),
          isRead: request.status !== "pending", // Consider non-pending as read
          createdAt: request.created_at,
          confirmedAt: request.confirmed_at,
          completedAt: request.completed_at,
          rejectedAt: request.rejected_at,
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

  /**
   * Notification'ni o'qilgan deb belgilash (status-based, no-op for now)
   */
  async markAsRead(notificationId: string, supplierManagerId: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
    }

    // For now, just verify the request exists and belongs to the supplier
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

      const request = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findFirst({
          where: {
            id: notificationId,
            supplier_tenant_id: manager.supplier_tenant_id,
          },
        });
      });

      if (!request) {
        throw new BadRequestException("Return request not found");
      }

      return {
        success: true,
        notification: {
          id: request.id,
          isRead: request.status !== "pending",
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

  /**
   * Barcha notification'larni o'qilgan deb belgilash (status-based, no-op for now)
   */
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

      // Count pending requests (considered unread)
      const unreadCount = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.count({
          where: {
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
          },
        });
      });

      return {
        success: true,
        updatedCount: unreadCount,
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

  /**
   * Return'ni qabul qilish (요청 확인) - status: pending → processing
   * If itemId is provided, only that item is accepted. Otherwise, entire request is accepted.
   */
  async acceptReturn(notificationId: string, supplierManagerId: string, itemId?: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
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

      // If itemId is provided, accept only that specific item
      if (itemId) {
        // Update the specific item status
        const item = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnItem.update({
            where: {
              id: itemId,
              returnRequest: {
                id: notificationId,
                supplier_tenant_id: manager.supplier_tenant_id,
                status: "pending",
              },
            },
            data: {
              status: "processing",
              updated_at: new Date(),
            },
            include: {
              returnRequest: true,
            },
          });
        });

        // Check if all items in the request are now processing or completed
        const allItems = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnItem.findMany({
            where: {
              return_request_id: notificationId,
            },
          });
        });

        const allAccepted = allItems.every((item: any) => 
          item.status === "processing" || item.status === "completed"
        );

        // If all items are accepted, update the request status
        if (allAccepted) {
          await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierReturnRequest.update({
              where: { id: notificationId },
              data: {
                status: "processing",
                supplier_manager_id: manager.id,
                confirmed_at: new Date(),
                updated_at: new Date(),
              },
            });
          });
        }

        return {
          success: true,
          notification: {
            id: notificationId,
            itemId: itemId,
            status: "PROCESSING",
          },
        };
      } else {
        // Accept entire request (backward compatibility)
        const returnRequest = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnRequest.update({
            where: {
              id: notificationId,
              supplier_tenant_id: manager.supplier_tenant_id,
              status: "pending", // Only accept pending returns
            },
            data: {
              status: "processing",
              supplier_manager_id: manager.id, // Assign to this manager
              confirmed_at: new Date(),
              updated_at: new Date(),
            },
          });
        });

        // Update all items in the request to processing
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnItem.updateMany({
            where: {
              return_request_id: notificationId,
              status: "pending",
            },
            data: {
              status: "processing",
              updated_at: new Date(),
            },
          });
        });

        return {
          success: true,
          notification: {
            id: returnRequest.id,
            status: returnRequest.status.toUpperCase(),
            confirmedAt: returnRequest.confirmed_at,
          },
        };
      }
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

  /**
   * Return'ni rad etish (요청 거절)
   */
  async rejectReturn(notificationId: string, supplierManagerId: string, reason?: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
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

      const returnRequest = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.update({
          where: {
            id: notificationId,
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
          },
          data: {
            status: "rejected",
            supplier_manager_id: manager.id,
            rejected_reason: reason || null,
            rejected_at: new Date(),
            updated_at: new Date(),
          },
        });
      });

      return {
        success: true,
        notification: {
          id: returnRequest.id,
          status: returnRequest.status.toUpperCase(),
          rejectedAt: returnRequest.rejected_at,
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

  /**
   * Mark return as completed (제품 받았음)
   * Updates item status and sends webhook to clinic-backend
   */
  async completeReturn(returnRequestId: string, supplierManagerId: string, itemId?: string) {
    try {
      // Get supplier manager to find tenant_id
      const manager = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierManager.findFirst({
          where: { id: supplierManagerId },
          select: { supplier_tenant_id: true },
        });
      });

      if (!manager) {
        throw new BadRequestException("Supplier Manager not found");
      }

      // Get return request
      const request = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findFirst({
          where: {
            id: returnRequestId,
            supplier_tenant_id: manager.supplier_tenant_id,
          },
          include: {
            items: true,
          },
        });
      });

      if (!request) {
        throw new BadRequestException("Return request not found");
      }

      // Update item status if itemId provided, otherwise update all items
      if (itemId) {
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnItem.updateMany({
            where: {
              id: itemId,
              return_request_id: returnRequestId,
            },
            data: {
              status: "completed",
              updated_at: new Date(),
            },
          });
        });
      } else {
        // Update all items
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnItem.updateMany({
            where: {
              return_request_id: returnRequestId,
            },
            data: {
              status: "completed",
              updated_at: new Date(),
            },
          });
        });
      }

      // Get updated items
      const allItems = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnItem.findMany({
          where: { return_request_id: returnRequestId },
        });
      });

      // Check if all items are completed
      const allCompleted = allItems.every((item: any) => item.status === "completed");

      if (allCompleted) {
        // Update request status
        await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnRequest.update({
            where: { id: returnRequestId },
            data: {
              status: "completed",
              completed_at: new Date(),
              updated_at: new Date(),
            },
          });
        });
      }

      // Send webhook to clinic-backend
      try {
        const clinicBackendUrl = process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
        const clinicBackendApiKey = process.env.CLINIC_BACKEND_API_KEY || "";

        // Get return items to send to clinic
        const returnItems = itemId 
          ? allItems.filter((item: any) => item.id === itemId)
          : allItems;

        for (const item of returnItems) {
          await fetch(`${clinicBackendUrl}/order-returns/webhook/complete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": clinicBackendApiKey,
            },
            body: JSON.stringify({
              return_no: request.return_no,
              item_id: item.id,
              status: "completed",
            }),
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to send webhook to clinic: ${error.message}`, error.stack);
        // Don't throw - completion is already processed
      }

      return { success: true, message: "Return marked as completed" };
    } catch (error: any) {
      this.logger.error(`Error completing return: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to complete return: ${error.message}`);
    }
  }

  /**
   * Clinic → Supplier return request yaratish
   * Groups multiple items from same clinic into one request if they arrive within 5 minutes
   */
  async createReturnRequest(dto: any) {
    const {
      returnNo,
      supplierTenantId,
      clinicTenantId,
      clinicName,
      clinicManagerName,
      items,
      createdAt,
    } = dto;

    if (!returnNo || !supplierTenantId || !clinicTenantId || !items || items.length === 0) {
      throw new BadRequestException("returnNo, supplierTenantId, clinicTenantId va items talab qilinadi");
    }

    // For grouping: Check if there's a recent return request from the same clinic to the same supplier
    // within 5 minutes that hasn't been confirmed yet
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    try {
      // Find existing pending request from same clinic to same supplier within time window
      const existingRequest = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findFirst({
          where: {
            supplier_tenant_id: supplierTenantId,
            clinic_tenant_id: clinicTenantId,
            status: "pending",
            created_at: {
              gte: fiveMinutesAgo,
            },
          },
          include: {
            items: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      });

      if (existingRequest) {
        // Add items to existing request
        const newItems = items.map((item: any) => {
          // Ensure images is always an array
          const imagesArray = Array.isArray(item.images) 
            ? item.images 
            : (item.images ? [item.images] : []);
          
          return {
            product_name: item.productName,
            brand: item.brand || null,
            quantity: item.quantity,
            return_type: item.returnType,
            memo: item.memo || null,
            images: imagesArray,
            inbound_date: item.inboundDate,
            total_price: item.totalPrice,
            order_no: item.orderNo || null,
            batch_no: item.batchNo || null,
          };
        });

        const updatedRequest = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnRequest.update({
            where: { id: existingRequest.id },
            data: {
              items: {
                create: newItems,
              },
            },
            include: {
              items: true,
            },
          });
        });

        return this.formatReturnRequest(updatedRequest);
      } else {
        // Check if return_no already exists (to avoid unique constraint error)
        const existingByReturnNo = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnRequest.findFirst({
            where: {
              return_no: returnNo,
            },
            include: {
              items: true,
            },
          });
        });

        if (existingByReturnNo) {
          // If return_no exists, add items to existing request
          const newItems = items.map((item: any) => {
            // Ensure images is always an array
            const imagesArray = Array.isArray(item.images) 
              ? item.images 
              : (item.images ? [item.images] : []);
            
            return {
              product_name: item.productName,
              brand: item.brand || null,
              quantity: item.quantity,
              return_type: item.returnType,
              memo: item.memo || null,
              images: imagesArray,
              inbound_date: item.inboundDate,
              total_price: item.totalPrice,
              order_no: item.orderNo || null,
              batch_no: item.batchNo || null,
            };
          });

          const updatedRequest = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierReturnRequest.update({
              where: { id: existingByReturnNo.id },
              data: {
                items: {
                  create: newItems,
                },
              },
              include: {
                items: true,
              },
            });
          });

          return this.formatReturnRequest(updatedRequest);
        }

        // Create new return request
        const newItems = items.map((item: any) => {
          // Ensure images is always an array
          const imagesArray = Array.isArray(item.images) 
            ? item.images 
            : (item.images ? [item.images] : []);
          
          return {
            product_name: item.productName,
            brand: item.brand || null,
            quantity: item.quantity,
            return_type: item.returnType,
            memo: item.memo || null,
            images: imagesArray,
            inbound_date: item.inboundDate,
            total_price: item.totalPrice,
            order_no: item.orderNo || null,
            batch_no: item.batchNo || null,
          };
        });

        const returnRequest = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).supplierReturnRequest.create({
            data: {
              return_no: returnNo,
              supplier_tenant_id: supplierTenantId,
              clinic_tenant_id: clinicTenantId,
              clinic_name: clinicName,
              clinic_manager_name: clinicManagerName,
              supplier_manager_id: null, // Will be assigned when supplier manager views it
              memo: null,
              status: "pending",
              items: {
                create: newItems,
              },
            },
            include: {
              items: true,
            },
          });
        });

        return this.formatReturnRequest(returnRequest);
      }
    } catch (error: any) {
      this.logger.error(`Return request create failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Return request create failed: ${error.message}`);
    }
  }

  /**
   * Format return request for response
   */
  private formatReturnRequest(request: any) {
    return {
      id: request.id,
      returnNo: request.return_no,
      clinicTenantId: request.clinic_tenant_id,
      clinicName: request.clinic_name,
      clinicManagerName: request.clinic_manager_name,
      status: request.status,
      items: request.items?.map((item: any) => ({
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
      })) || [],
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    };
  }
}

