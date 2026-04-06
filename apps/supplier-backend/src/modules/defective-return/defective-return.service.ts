import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

@Injectable()
export class DefectiveReturnService {
  private readonly logger = new Logger(DefectiveReturnService.name);

  constructor(private readonly prisma: PrismaService) {}

  private formatRow(row: any) {
    const qty = row.total_qty || 0;
    const unitPrice = qty > 0 ? Math.floor(row.total_price / qty) : 0;
    const statusUpper =
      row.status === "request-progress"
        ? "ACCEPTED"
        : row.status === "completed"
          ? "COMPLETED"
          : row.status === "rejected"
            ? "REJECTED"
            : "PENDING";
    return {
      id: row.id,
      returnId: row.id,
      returnNo: row.defective_return_no,
      clinicName: row.clinic_name,
      returnManagerName: row.clinic_manager_name,
      returnDate: row.created_at,
      totalRefund: row.total_price,
      status: statusUpper,
      confirmedAt: row.confirmed_at,
      completedAt: row.completed_at,
      rejectedAt: row.rejected_at,
      items: [
        {
          id: row.id,
          productCode: "",
          productName: row.product_name,
          productBrand: row.brand || "",
          qty: row.total_qty,
          unitPrice,
          totalPrice: row.total_price,
          returnType: row.defective_return_type,
          memo: row.memo,
          images: Array.isArray(row.images) ? row.images : [],
          inboundDate: row.inbound_date,
          orderNo: null,
          batchNo: null,
          // Exchanges UI filters on item status: pending | processing | completed | rejected
          status:
            row.status === "request-progress" ? "processing" : row.status,
        },
      ],
    };
  }

  async createFromClinic(dto: any) {
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

    const first = items[0];
    const productName = first.productName ?? "알 수 없음";
    const brand = first.brand ?? null;
    const quantity = Number(first.quantity) || 0;
    const totalPrice = Number(first.totalPrice) || 0;
    const defectiveReturnType = String(first.returnType || "").trim();
    if (
      defectiveReturnType !== "defective_exchange" &&
      defectiveReturnType !== "defective_return"
    ) {
      throw new BadRequestException(
        "items[0].returnType must be defective_exchange or defective_return"
      );
    }

    const imagesArray = Array.isArray(first.images)
      ? first.images
      : first.images
        ? [first.images]
        : [];
    const inboundDate =
      first.inboundDate ||
      new Date().toISOString().split("T")[0];

    const existing = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.findUnique({
        where: { defective_return_no: returnNo },
      });
    });
    if (existing) {
      return this.formatRow(existing);
    }

    const row = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.create({
        data: {
          supplier_tenant_id: supplierTenantId,
          supplier_manager_id: supplierManagerId || null,
          clinic_tenant_id: clinicTenantId,
          clinic_name: clinicName || "",
          clinic_manager_name: clinicManagerName || "",
          defective_return_no: returnNo,
          defective_return_type: defectiveReturnType,
          status: "pending",
          product_name: productName,
          brand,
          total_qty: quantity,
          total_price: totalPrice,
          memo: first.memo || null,
          images: imagesArray,
          inbound_date: inboundDate,
          created_at: createdAt ? new Date(createdAt) : undefined,
        },
      });
    });

    return this.formatRow(row);
  }

  async getList(
    supplierManagerId: string,
    filters: {
      status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL";
      page?: number;
      limit?: number;
    }
  ) {
    const manager = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierManager.findFirst({
        where: { id: supplierManagerId },
        select: { supplier_tenant_id: true },
      });
    });
    if (!manager) {
      throw new BadRequestException("Supplier Manager not found");
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const statusFilter = filters.status || "ALL";
    const where: any = {
      supplier_tenant_id: manager.supplier_tenant_id,
      OR: [
        { supplier_manager_id: supplierManagerId },
        { supplier_manager_id: null },
      ],
    };
    if (statusFilter === "PENDING") {
      where.status = "pending";
    } else if (statusFilter === "ACCEPTED") {
      where.status = "request-progress";
    } else if (statusFilter === "REJECTED") {
      where.status = "rejected";
    }

    const [rows, total, unread] = await Promise.all([
      this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierDefectiveReturn.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        });
      }),
      this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierDefectiveReturn.count({ where });
      }),
      this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).supplierDefectiveReturn.count({
          where: {
            supplier_tenant_id: manager.supplier_tenant_id,
            status: "pending",
            OR: [
              { supplier_manager_id: supplierManagerId },
              { supplier_manager_id: null },
            ],
          },
        });
      }),
    ]);

    const notifications = rows.map((r: any) => this.formatRow(r));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications,
      total,
      unreadCount: unread,
      page,
      limit,
      totalPages,
    };
  }

  private async sendOrderReturnAcceptWebhook(defectiveReturnNo: string) {
    const clinicBackendUrl =
      process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
    const supplierApiKey =
      process.env.SUPPLIER_BACKEND_API_KEY ||
      process.env.API_KEY_SECRET ||
      "";
    if (!supplierApiKey) return;
    try {
      const res = await fetch(
        `${clinicBackendUrl}/order-returns/webhook/accept`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": supplierApiKey,
          },
          body: JSON.stringify({
            return_no: defectiveReturnNo,
            status: "processing",
          }),
        }
      );
      if (!res.ok) {
        this.logger.warn(
          `Defective accept webhook: ${res.status} ${await res.text()}`
        );
      }
    } catch (e: any) {
      this.logger.warn(`Defective accept webhook error: ${e?.message}`);
    }
  }

  private async sendOrderReturnRejectWebhook(
    defectiveReturnNo: string,
    reason?: string
  ) {
    const clinicBackendUrl =
      process.env.CLINIC_BACKEND_URL || "http://localhost:3000";
    const supplierApiKey =
      process.env.SUPPLIER_BACKEND_API_KEY ||
      process.env.API_KEY_SECRET ||
      "";
    if (!supplierApiKey) return;
    try {
      const res = await fetch(
        `${clinicBackendUrl}/order-returns/webhook/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": supplierApiKey,
          },
          body: JSON.stringify({
            return_no: defectiveReturnNo,
            reason: reason ?? null,
          }),
        }
      );
      if (!res.ok) {
        this.logger.warn(
          `Defective reject webhook: ${res.status} ${await res.text()}`
        );
      }
    } catch (e: any) {
      this.logger.warn(`Defective reject webhook error: ${e?.message}`);
    }
  }

  /**
   * Marks DefectiveProductReturn completed on clinic before local row is completed.
   * Throws if clinic rejects or is unreachable so supplier row stays request-progress.
   */
  private async syncClinicDefectiveReturnCompleted(row: {
    id: string;
    defective_return_no: string;
  }) {
    const clinicBackendUrl = (
      process.env.CLINIC_BACKEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    const supplierApiKey =
      process.env.SUPPLIER_BACKEND_API_KEY ||
      process.env.API_KEY_SECRET ||
      "";
    if (!supplierApiKey) {
      throw new BadRequestException(
        "Set SUPPLIER_BACKEND_API_KEY or API_KEY_SECRET so defective completion can sync to the clinic (DefectiveProductReturn)."
      );
    }
    const url = `${clinicBackendUrl}/order-returns/webhook/complete`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": supplierApiKey,
        },
        body: JSON.stringify({
          return_no: row.defective_return_no,
          item_id: row.id,
          status: "completed",
        }),
      });
    } catch (e: any) {
      this.logger.error(`Defective complete webhook network: ${e?.message}`);
      throw new BadRequestException(
        `Could not reach clinic backend: ${e?.message || "network error"}`
      );
    }
    const text = await res.text();
    let body: { success?: boolean; message?: string } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      this.logger.warn(`Defective complete webhook: ${res.status} ${text}`);
      throw new BadRequestException(
        text || `Clinic webhook failed: HTTP ${res.status}`
      );
    }
    if (body.success === false) {
      const msg =
        body.message || "Clinic did not update DefectiveProductReturn";
      this.logger.warn(`Defective complete webhook: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  async accept(id: string, supplierManagerId: string) {
    const manager = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierManager.findFirst({
        where: { id: supplierManagerId },
        select: { supplier_tenant_id: true, id: true },
      });
    });
    if (!manager) {
      throw new BadRequestException("Supplier Manager not found");
    }

    const updated = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.update({
        where: {
          id,
          supplier_tenant_id: manager.supplier_tenant_id,
          status: "pending",
        },
        data: {
          status: "request-progress",
          supplier_manager_id: manager.id,
          confirmed_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    this.sendOrderReturnAcceptWebhook(updated.defective_return_no).catch(
      () => undefined
    );

    return {
      success: true,
      notification: {
        id: updated.id,
        status: "PROCESSING",
        confirmedAt: updated.confirmed_at,
      },
    };
  }

  async reject(id: string, supplierManagerId: string, reason?: string) {
    const manager = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierManager.findFirst({
        where: { id: supplierManagerId },
        select: { supplier_tenant_id: true, id: true },
      });
    });
    if (!manager) {
      throw new BadRequestException("Supplier Manager not found");
    }

    const updated = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.update({
        where: {
          id,
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

    this.sendOrderReturnRejectWebhook(
      updated.defective_return_no,
      reason
    ).catch(() => undefined);

    return {
      success: true,
      notification: {
        id: updated.id,
        status: "REJECTED",
        rejectedAt: updated.rejected_at,
      },
    };
  }

  async complete(id: string, supplierManagerId: string) {
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
      return (this.prisma as any).supplierDefectiveReturn.findFirst({
        where: {
          id,
          supplier_tenant_id: manager.supplier_tenant_id,
          status: "request-progress",
        },
      });
    });
    if (!row) {
      throw new BadRequestException(
        "Defective return not found or not in request-progress"
      );
    }

    await this.syncClinicDefectiveReturnCompleted({
      id: row.id,
      defective_return_no: row.defective_return_no,
    });

    await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.update({
        where: { id },
        data: {
          status: "completed",
          product_received: true,
          received_at: new Date(),
          completed_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    return { success: true, message: "Return marked as completed" };
  }

  /**
   * Clinic clicks 교환 확인 on order-returns → mark supplier row completed (defective_exchange, request-progress).
   */
  async completeExchangeFromClinicWebhook(defectiveReturnNo: string) {
    const no = String(defectiveReturnNo || "").trim();
    if (!no) {
      throw new BadRequestException("return_no is required");
    }

    const row = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.findUnique({
        where: { defective_return_no: no },
      });
    });
    if (!row) {
      throw new BadRequestException(
        `SupplierDefectiveReturn not found for return_no: ${no}`
      );
    }
    if (row.defective_return_type !== "defective_exchange") {
      throw new BadRequestException(
        "Clinic exchange confirmation applies only to defective_exchange"
      );
    }
    if (row.status === "completed") {
      return { success: true, message: "Already completed" };
    }
    if (row.status !== "request-progress") {
      throw new BadRequestException(
        `Invalid supplier status for clinic exchange confirm: ${row.status}`
      );
    }

    await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).supplierDefectiveReturn.update({
        where: { id: row.id },
        data: {
          status: "completed",
          product_received: true,
          received_at: new Date(),
          completed_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    return {
      success: true,
      message: "Supplier defective exchange marked completed",
    };
  }
}
