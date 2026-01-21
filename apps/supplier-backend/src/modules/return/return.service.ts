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
      returnType?: "반품" | "교환"; // DEPRECATED: For backward compatibility
      returnCategory?: "empty_box" | "product"; // NEW: Filter by category
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
      // Faqat shu manager'ga tegishli return request'larni ko'rsatish
      // OR condition: supplier_manager_id = supplierManagerId YOKI supplier_manager_id = null
      // (null bo'lsa, bu manual supplier degani va barcha manager'lar ko'ra oladi)
      OR: [
        { supplier_manager_id: supplierManagerId },
        { supplier_manager_id: null },
      ],
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
      // Return requests (we need to fetch all to filter by return_type)
      const returnRequests = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findMany({
          where,
          include: {
            items: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      });

      // Filter by return_type or return_category
      let filteredRequests = returnRequests;

      // NEW: Filter by returnCategory (empty_box or product)
      if (filters?.returnCategory) {
        filteredRequests = returnRequests.filter((request: any) => {
          const hasMatchingItem = request.items?.some((item: any) => {
            if (filters.returnCategory === "empty_box") {
              // Empty box returns: return_type does NOT contain "|"
              // OR return_type is null/undefined (for backward compatibility)
              return !item.return_type || !item.return_type.includes("|");
            } else if (filters.returnCategory === "product") {
              // Product returns/exchanges: return_type contains "|" (e.g., "주문|반품", "불량|교환")
              return item.return_type && item.return_type.includes("|");
            }
            return false;
          });
          return hasMatchingItem;
        });
      }
      // DEPRECATED: Filter by returnType (for backward compatibility)
      else if (filters?.returnType) {
        filteredRequests = returnRequests.filter((request: any) => {
          // Check if any item in the request matches the return_type filter
          const hasMatchingItem = request.items?.some((item: any) => {
            return item.return_type?.includes(filters.returnType);
          });
          return hasMatchingItem;
        });
      }

      // Calculate total count after filtering
      const total = filteredRequests.length;

      // Unread count (pending requests after filtering)
      const unreadCount = filteredRequests.filter(
        (request: any) => request.status === "pending"
      ).length;

      // Apply pagination after filtering
      const paginatedRequests = filteredRequests.slice(skip, skip + limit);

      // Format response with return_type/return_category filtering
      const formattedNotifications = paginatedRequests
        .map((request: any) => {
          // Filter items by return_category or return_type if specified
          let filteredItems = request.items || [];

          if (filters?.returnCategory) {
            filteredItems = filteredItems.filter((item: any) => {
              if (filters.returnCategory === "empty_box") {
                // Empty box returns: return_type does NOT contain "|"
                return !item.return_type || !item.return_type.includes("|");
              } else if (filters.returnCategory === "product") {
                // Product returns/exchanges: return_type contains "|"
                return item.return_type && item.return_type.includes("|");
              }
              return false;
            });
          }
          // DEPRECATED: Filter by returnType (for backward compatibility)
          else if (filters?.returnType) {
            filteredItems = filteredItems.filter((item: any) => {
              // Check if return_type contains the filter value (e.g., "반품" or "교환")
              return item.return_type?.includes(filters.returnType);
            });
          }

          // If no items match the filter, skip this request
          if (filteredItems.length === 0) {
            return null;
          }

          const totalRefund = filteredItems.reduce(
            (sum: number, item: any) => sum + (item.total_price || 0),
            0
          );

          return {
            id: request.id,
            returnId: request.id,
            returnNo: request.return_no,
            clinicName: request.clinic_name,
            returnManagerName: request.clinic_manager_name,
            returnDate: request.created_at,
            totalRefund: totalRefund,
            items: filteredItems.map((item: any) => ({
              id: item.id,
              productCode: item.batch_no || item.order_no || "",
              productName: item.product_name,
              productBrand: item.brand || "",
              qty: item.quantity,
              unitPrice: item.total_price / item.quantity || 0,
              totalPrice: item.total_price,
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
            })),
            status: request.status.toUpperCase(),
            isRead: request.status !== "pending", // Consider non-pending as read
            createdAt: request.created_at,
            confirmedAt: request.confirmed_at,
            completedAt: request.completed_at,
            rejectedAt: request.rejected_at,
          };
        })
        .filter((notif: any) => notif !== null); // Remove null entries

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
      throw new BadRequestException(
        "Notification ID and Supplier Manager ID are required"
      );
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
   * Adjustments: Array of { itemId, actualQuantity, quantityChangeReason }
   */
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

        const allAccepted = allItems.every(
          (item: any) =>
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
        // If adjustments provided, apply them to each item
        if (adjustments && adjustments.length > 0) {
          // Get all items first to preserve existing memos
          const allItems = await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierReturnItem.findMany({
              where: {
                return_request_id: notificationId,
              },
            });
          });

          // Prepare webhook payload for unreturned items (추후반납)
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
            returnId: returnRequest.id,
            clinicTenantId: returnRequest.clinic_tenant_id,
            unreturnedItems: [],
          };

          // Update each item with its adjustment
          for (const adj of adjustments) {
            const existingItem = allItems.find(
              (item: any) => item.id === adj.itemId
            );
            
            if (!existingItem) continue;

            const originalQty = existingItem.quantity;
            const acceptedQty = adj.actualQuantity;
            const unreturnedQty = originalQty - acceptedQty;

            const updateData: any = {
              status: "processing",
              quantity: adj.actualQuantity, // Update quantity to actual
              updated_at: new Date(),
            };

            // If quantity changed and reason provided, update memo
            if (adj.quantityChangeReason && existingItem) {
              const existingMemo = existingItem.memo || "";
              updateData.memo = existingMemo
                ? `${adj.quantityChangeReason} - ${existingMemo}`
                : adj.quantityChangeReason;
            }

            // Track unreturned quantity for webhook
            // Only send back to clinic if reason is "추후반납" (Later Return)
            if (unreturnedQty > 0 && adj.quantityChangeReason === "추후반납") {
              webhookPayload.unreturnedItems.push({
                productId: existingItem.product_id,
                batchNo: existingItem.batch_no || "",
                unreturnedQty: unreturnedQty,
                reason: "추후반납",
              });
            }

            await this.prisma.executeWithRetry(async () => {
              return (this.prisma as any).supplierReturnItem.updateMany({
                where: {
                  return_request_id: notificationId,
                  id: adj.itemId,
                  status: "pending",
                },
                data: updateData,
              });
            });
          }

          // Update items that are not in adjustments (keep original quantity)
          const adjustmentItemIds = adjustments.map((adj) => adj.itemId);
          await this.prisma.executeWithRetry(async () => {
            return (this.prisma as any).supplierReturnItem.updateMany({
              where: {
                return_request_id: notificationId,
                status: "pending",
                NOT: {
                  id: { in: adjustmentItemIds },
                },
              },
              data: {
                status: "processing",
                updated_at: new Date(),
              },
            });
          });

          // Send partial return webhook to clinic if there are unreturned items
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
          // No adjustments, update all items normally
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
        }

        // Send webhook to clinic-backend for /returns page
        this.sendAcceptWebhookToClinic(returnRequest).catch((error) => {
          this.logger.error(
            `Failed to send accept webhook to clinic: ${error.message}`
          );
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
  async completeReturn(
    returnRequestId: string,
    supplierManagerId: string,
    itemId?: string
  ) {
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
      const allCompleted = allItems.every(
        (item: any) => item.status === "completed"
      );

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
        const clinicBackendUrl =
          process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
        // Supplier sends its own API key to clinic-backend for authentication
        const supplierApiKey =
          process.env.SUPPLIER_BACKEND_API_KEY ||
          process.env.API_KEY_SECRET ||
          "";

        if (!supplierApiKey) {
          this.logger.error(
            `SUPPLIER_BACKEND_API_KEY not configured! Check environment variables.`
          );
        } 

        // Get return items to send to clinic
        const returnItems = itemId
          ? allItems.filter((item: any) => item.id === itemId)
          : allItems;

        for (const item of returnItems) {
          try {
            if (!supplierApiKey) {
              this.logger.warn(
                `SUPPLIER_BACKEND_API_KEY not configured, skipping webhook for return_no: ${request.return_no}`
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
                  return_no: request.return_no,
                  item_id: item.id,
                  status: "completed",
                }),
              }
            );

            if (!webhookResponse.ok) {
              const errorText = await webhookResponse.text();
              this.logger.error(
                `Webhook failed: ${webhookResponse.status} - ${errorText} for return_no: ${request.return_no}`
              );
            } else {
              const responseData = await webhookResponse.json();
              this.logger.log(
                `Webhook sent successfully for return_no: ${
                  request.return_no
                }, response: ${JSON.stringify(responseData)}`
              );
            }
          } catch (fetchError: any) {
            this.logger.error(
              `Webhook fetch error for return_no ${request.return_no}: ${fetchError.message}`
            );
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to send webhook to clinic: ${error.message}`,
          error.stack
        );
        // Don't throw - completion is already processed
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

  /**
   * Send webhook to clinic-backend when return is accepted (for /returns page)
   */
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

      // Get return request to find return_no
      const requestWithReturnNo = await this.prisma.executeWithRetry(
        async () => {
          return (this.prisma as any).supplierReturnRequest.findFirst({
            where: { id: request.id },
            select: { return_no: true },
          });
        }
      );

      if (!requestWithReturnNo || !requestWithReturnNo.return_no) {
        this.logger.warn(
          `Return request ${request.id} has no return_no, skipping webhook`
        );
        return;
      }

      const returnNo = requestWithReturnNo.return_no;
      const isValidFormat =
        returnNo &&
        typeof returnNo === "string" &&
        returnNo.length === 20 &&
        /^\d{20}$/.test(returnNo);

      if (isValidFormat) {
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
      } else {
        this.logger.warn(
          `returnNo format check failed. Expected: 20 digits (YYYYMMDD000000XXXXXX), got: ${returnNo} (length: ${returnNo?.length})`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send accept webhook to clinic: ${error.message}`,
        error.stack
      );
      // Don't throw - webhook failure shouldn't break return acceptance
    }
  }

  /**
   * Send partial return webhook to clinic for unreturned items (추후반납)
   */
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
      // Don't throw - webhook failure shouldn't break return acceptance
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
      supplierManagerId, // Faqat shu manager'ga SMS yuboriladi
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

    // For grouping: Check if there's a recent return request from the same clinic to the same supplier
    // within 5 minutes that hasn't been confirmed yet
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    try {
      // Find existing pending request from same clinic to same supplier AND same supplier manager within time window
      // Har bir product o'z supplier manager'iga tegishli bo'lishi kerak
      const existingRequest = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierReturnRequest.findFirst({
          where: {
            supplier_tenant_id: supplierTenantId,
            clinic_tenant_id: clinicTenantId,
            supplier_manager_id: supplierManagerId || null, // supplier_manager_id ham mos kelishi kerak
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

      // Agar existingRequest topilsa, supplier_manager_id ham mos kelishi kerak
      // Agar mos kelmasa, yangi request yaratish kerak (har bir product o'z manager'iga tegishli)
      if (
        existingRequest &&
        existingRequest.supplier_manager_id === (supplierManagerId || null)
      ) {
        // Add items to existing request (faqat bir xil supplier_manager_id bo'lsa)
        const newItems = items.map((item: any) => {
          // Ensure images is always an array
          const imagesArray = Array.isArray(item.images)
            ? item.images
            : item.images
            ? [item.images]
            : [];

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

        // supplierManagerId'ni updatedRequest'ga qo'shish
        updatedRequest.supplier_manager_id =
          supplierManagerId || updatedRequest.supplier_manager_id || null;

        // SMS notification clinic-backend'da yuboriladi
        this.logger.log(
          `[Return Create] Items added to existing return request. ReturnNo: ${
            updatedRequest.return_no
          }, SupplierTenantId: ${supplierTenantId}, SupplierManagerId: ${
            supplierManagerId || "not specified"
          }. SMS notification is sent from clinic-backend.`
        );

        return this.formatReturnRequest(updatedRequest);
      } else {
        // Check if return_no already exists (to avoid unique constraint error)
        const existingByReturnNo = await this.prisma.executeWithRetry(
          async () => {
            return (this.prisma as any).supplierReturnRequest.findFirst({
              where: {
                return_no: returnNo,
              },
              include: {
                items: true,
              },
            });
          }
        );

        if (existingByReturnNo) {
          // If return_no exists, add items to existing request
          const newItems = items.map((item: any) => {
            // Ensure images is always an array
            const imagesArray = Array.isArray(item.images)
              ? item.images
              : item.images
              ? [item.images]
              : [];

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

          const updatedRequest = await this.prisma.executeWithRetry(
            async () => {
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
            }
          );

          // supplierManagerId'ni updatedRequest'ga qo'shish
          updatedRequest.supplier_manager_id =
            supplierManagerId || updatedRequest.supplier_manager_id || null;

          // SMS notification clinic-backend'da yuboriladi
          this.logger.log(
            `[Return Create] Items added to existing return request (by return_no). ReturnNo: ${
              updatedRequest.return_no
            }, SupplierTenantId: ${supplierTenantId}, SupplierManagerId: ${
              supplierManagerId || "not specified"
            }. SMS notification is sent from clinic-backend.`
          );

          return this.formatReturnRequest(updatedRequest);
        }

        // Create new return request
        const newItems = items.map((item: any) => {
          // Ensure images is always an array
          const imagesArray = Array.isArray(item.images)
            ? item.images
            : item.images
            ? [item.images]
            : [];

          return {
            product_name: item.productName,
            brand: item.brand || null,
            quantity: item.quantity,
            return_type: item.returnType, // Should be "주문|교환", "불량|교환", etc.
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
              supplier_manager_id: supplierManagerId || null, // Product bilan bog'langan SupplierManager ID
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

        // SMS notification clinic-backend'da yuboriladi
        this.logger.log(
          `[Return Create] Return request created successfully. ReturnNo: ${returnNo}, SupplierTenantId: ${supplierTenantId}, SupplierManagerId: ${
            supplierManagerId || "not specified"
          }. SMS notification is sent from clinic-backend.`
        );

        return this.formatReturnRequest(returnRequest);
      }
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
        })) || [],
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    };
  }
}
