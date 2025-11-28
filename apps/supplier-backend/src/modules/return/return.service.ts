import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SupplierManager uchun return notification'larni olish
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

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      supplier_manager_id: supplierManagerId,
    };

    // Status filter
    if (filters?.status && filters.status !== "ALL") {
      where.status = filters.status;
    }

    // Read filter
    if (filters?.isRead !== null && filters?.isRead !== undefined) {
      where.is_read = filters.isRead;
    }

    try {
      // Total count
      const total = await (this.prisma as any).supplierReturnNotification.count({
        where,
      });

      // Unread count
      const unreadCount = await (this.prisma as any).supplierReturnNotification.count({
        where: {
          supplier_manager_id: supplierManagerId,
          is_read: false,
          status: "PENDING",
        },
      });

      // Notifications
      const notifications = await (this.prisma as any).supplierReturnNotification.findMany({
        where,
        orderBy: {
          created_at: "desc",
        },
        skip,
        take: limit,
      });

      // Format response
      const formattedNotifications = notifications.map((notification: any) => ({
        id: notification.id,
        clinicName: notification.clinic_name,
        returnManagerName: notification.return_manager_name,
        returnDate: notification.return_date,
        totalRefund: notification.total_refund,
        items: [
          {
            productCode: notification.product_code || "",
            productName: notification.product_name,
            productBrand: notification.product_brand,
            qty: notification.return_qty,
            unitPrice: notification.refund_amount_per_item,
            totalPrice: notification.total_refund,
          },
        ],
        status: notification.status,
        isRead: notification.is_read,
        batchNo: notification.batch_no,
        createdAt: notification.created_at,
      }));

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
   * Notification'ni o'qilgan deb belgilash
   */
  async markAsRead(notificationId: string, supplierManagerId: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
    }

    try {
      const notification = await (this.prisma as any).supplierReturnNotification.update({
        where: {
          id: notificationId,
          supplier_manager_id: supplierManagerId, // Ensure manager owns this notification
        },
        data: {
          is_read: true,
          updated_at: new Date(),
        },
      });

      return {
        success: true,
        notification: {
          id: notification.id,
          isRead: notification.is_read,
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
   * Barcha notification'larni o'qilgan deb belgilash
   */
  async markAllAsRead(supplierManagerId: string) {
    if (!supplierManagerId) {
      throw new BadRequestException("Supplier Manager ID is required");
    }

    try {
      const result = await (this.prisma as any).supplierReturnNotification.updateMany({
        where: {
          supplier_manager_id: supplierManagerId,
          is_read: false,
        },
        data: {
          is_read: true,
          updated_at: new Date(),
        },
      });

      return {
        success: true,
        updatedCount: result.count,
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
   * Return'ni qabul qilish (반납 접수)
   */
  async acceptReturn(notificationId: string, supplierManagerId: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
    }

    try {
      const notification = await (this.prisma as any).supplierReturnNotification.update({
        where: {
          id: notificationId,
          supplier_manager_id: supplierManagerId,
          status: "PENDING", // Only accept pending returns
        },
        data: {
          status: "ACCEPTED",
          is_read: true,
          accepted_at: new Date(),
          updated_at: new Date(),
        },
      });

      return {
        success: true,
        notification: {
          id: notification.id,
          status: notification.status,
          acceptedAt: notification.accepted_at,
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

  /**
   * Return'ni rad etish (optional)
   */
  async rejectReturn(notificationId: string, supplierManagerId: string, reason?: string) {
    if (!notificationId || !supplierManagerId) {
      throw new BadRequestException("Notification ID and Supplier Manager ID are required");
    }

    try {
      const notification = await (this.prisma as any).supplierReturnNotification.update({
        where: {
          id: notificationId,
          supplier_manager_id: supplierManagerId,
          status: "PENDING",
        },
        data: {
          status: "REJECTED",
          is_read: true,
          rejected_at: new Date(),
          updated_at: new Date(),
        },
      });

      return {
        success: true,
        notification: {
          id: notification.id,
          status: notification.status,
          rejectedAt: notification.rejected_at,
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
}

