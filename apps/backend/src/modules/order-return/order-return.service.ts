import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { MessageService } from "../member/services/message.service";
import { EmailService } from "../member/services/email.service";
import { saveBase64Images } from "../../common/utils/upload.utils";
import { CacheManager } from "../../common/cache";
import type { OrderReturnSupplierNotifiedPayload } from "../notifications/types/order-return-notified.payload";
import { NotificationService } from "../notifications/notification.service";

const DEFECTIVE_RETURN_TYPE_VALUES = [
  "defective_exchange",
  "defective_return",
] as const;

export type DefectiveReturnTypeValue =
  (typeof DEFECTIVE_RETURN_TYPE_VALUES)[number];

@Injectable()
export class OrderReturnService {
  private readonly logger = new Logger(OrderReturnService.name);

  // ✅ Replaced Map with CacheManager
  private returnsCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService
  ) {
    this.returnsCache = new CacheManager({
      maxSize: 100,
      ttl: 5000, // 30 seconds
      cleanupInterval: 60000,
      name: "OrderReturnService",
    });
  }

  async getReturns(tenantId: string, status?: string) {
    // Check cache first
    const cacheKey = `${tenantId}:${status || "all"}`;
    const cached = this.returnsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = { tenant_id: tenantId };
    if (status === "history") {
      where.status = { in: ["completed", "rejected"] };
    } else if (status) {
      where.status = status;
    }

    const data = await this.prisma.executeWithRetry(async () => {
      const returns = await (
        this.prisma as any
      ).defectiveProductReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          defective_return_no: true,
          defective_return_type: true,
          return_quantity: true,
          quantity_unit: true,
            status: true,
            supplier_accepted_at: true,
            product_received: true,
            received_at: true,
          memo: true,
          images: true,
          return_manager: true,
          supplier_manager_id: true,
          product_id: true,
          inbound_date: true,
          created_at: true,
          unit_price: true,
          total_quantity: true,
          product_name: true,
          brand: true,
          updated_at: true,
        },
      });

      if (returns.length === 0) {
        return [];
      }

      const csmIds = [
        ...new Set(
          returns.map((r: any) => r.supplier_manager_id).filter(Boolean)
        ),
      ];
      const productIds = [
        ...new Set(returns.map((r: any) => r.product_id).filter(Boolean)),
      ];
      const returnManagerIds = [
        ...new Set(returns.map((r: any) => r.return_manager).filter(Boolean)),
      ];

      const [csmRows, products, members] = await Promise.all([
        csmIds.length > 0
          ? (this.prisma as any).clinicSupplierManager.findMany({
              where: { id: { in: csmIds }, tenant_id: tenantId },
              select: {
                id: true,
                company_name: true,
                name: true,
                position: true,
                phone_number: true,
                email1: true,
                linkedManager: {
                  select: {
                    id: true,
                    supplier: {
                      select: {
                        company_name: true,
                        managers: {
                          where: { status: "ACTIVE" },
                          take: 1,
                          orderBy: { created_at: "asc" },
                          select: {
                            id: true,
                            name: true,
                            position: true,
                            phone_number: true,
                            email1: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            })
          : [],
        productIds.length > 0
          ? (this.prisma as any).product.findMany({
              where: { id: { in: productIds } },
              select: {
                id: true,
                name: true,
                returnPolicy: {
                  select: {
                    refund_amount: true,
                  },
                },
              },
            })
          : [],
        returnManagerIds.length > 0
          ? (this.prisma as any).member.findMany({
              where: {
                OR: [
                  { member_id: { in: returnManagerIds } },
                  { full_name: { in: returnManagerIds } },
                ],
                tenant_id: tenantId,
              },
              select: {
                member_id: true,
                full_name: true,
              },
            })
          : [],
      ]);

      const productSuppliersMap = new Map();
      if (productIds.length > 0) {
        const productSuppliers = await (
          this.prisma as any
        ).productSupplier.findMany({
          where: {
            product_id: { in: productIds },
            tenant_id: tenantId,
          },
          select: {
            product_id: true,
            clinicSupplierManager: {
              select: {
                company_name: true,
                name: true,
                position: true,
                phone_number: true,
                email1: true,
                linkedManager: {
                  select: {
                    id: true,
                    supplier: {
                      select: {
                        company_name: true,
                        managers: {
                          where: { status: "ACTIVE" },
                          take: 1,
                          orderBy: { created_at: "asc" },
                          select: {
                            id: true,
                            name: true,
                            position: true,
                            phone_number: true,
                            email1: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        productSuppliers.forEach((ps: any) => {
          productSuppliersMap.set(ps.product_id, ps);
        });
      }

      const csmMap = new Map(csmRows.map((c: any) => [c.id, c]));
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      const memberMap = new Map();
      members.forEach((m: any) => {
        memberMap.set(m.member_id, m);
        memberMap.set(m.full_name, m);
      });

      const applyCsmDisplay = (
        clinicManager: any,
        supplierManagerIdOut: { value: string | null }
      ) => {
        let supplierName = "알 수 없음";
        let managerName = "";
        let managerPosition = "";
        let managerPhone = "";
        let managerEmail = "";
        if (clinicManager.linkedManager?.supplier) {
          const platformSupplier = clinicManager.linkedManager.supplier;
          supplierName =
            platformSupplier.company_name ||
            clinicManager.company_name ||
            "알 수 없음";
          const manager = platformSupplier.managers?.[0];
          managerName = manager?.name || clinicManager.name || "";
          managerPosition = manager?.position || clinicManager.position || "";
          managerPhone =
            manager?.phone_number || clinicManager.phone_number || "";
          managerEmail = manager?.email1 || clinicManager.email1 || "";
          supplierManagerIdOut.value = manager?.id || null;
        } else {
          supplierName = clinicManager.company_name || "알 수 없음";
          managerName = clinicManager.name || "";
          managerPosition = clinicManager.position || "";
          managerPhone = clinicManager.phone_number || "";
          managerEmail = clinicManager.email1 || "";
          supplierManagerIdOut.value = clinicManager.linkedManager?.id || null;
        }
        return {
          supplierName,
          managerName,
          managerPosition,
          managerPhone,
          managerEmail,
        };
      };

      const returnsWithSupplier = returns.map((returnItem: any) => {
        let supplierName = "알 수 없음";
        let managerName = "";
        let managerPosition = "";
        let managerPhone = "";
        let managerEmail = "";
        let supplierManagerId: string | null = null;
        let returnManagerName = "";

        if (returnItem.return_manager) {
          const member = memberMap.get(returnItem.return_manager);
          returnManagerName = member?.full_name || returnItem.return_manager;
        }

        const smIdHolder = { value: null as string | null };
        if (returnItem.supplier_manager_id) {
          const csm = csmMap.get(returnItem.supplier_manager_id);
          if (csm) {
            const d = applyCsmDisplay(csm, smIdHolder);
            supplierName = d.supplierName;
            managerName = d.managerName;
            managerPosition = d.managerPosition;
            managerPhone = d.managerPhone;
            managerEmail = d.managerEmail;
            supplierManagerId = smIdHolder.value;
          }
        } else if (returnItem.product_id) {
          const ps = productSuppliersMap.get(returnItem.product_id);
          const clinicManager = ps?.clinicSupplierManager;
          if (clinicManager) {
            const d = applyCsmDisplay(clinicManager, smIdHolder);
            supplierName = d.supplierName;
            managerName = d.managerName;
            managerPosition = d.managerPosition;
            managerPhone = d.managerPhone;
            managerEmail = d.managerEmail;
            supplierManagerId = smIdHolder.value;
          }
        }

        return {
          ...returnItem,
          supplierName,
          managerName,
          managerPosition,
          managerPhone,
          managerEmail,
          supplierManagerId,
          returnManagerName,
          product_name:
            (productMap.get(returnItem.product_id) as any)?.name ||
            "알 수 없음",
          refund_amount:
            (productMap.get(returnItem.product_id) as any)?.returnPolicy
              ?.refund_amount || 0,
        };
      });

      return returnsWithSupplier;
    });

    // Cache'ga saqlash
    this.returnsCache.set(cacheKey, data);

    return data;
  }

  private invalidateCache(tenantId: string) {
    // Remove all cache entries for this tenant using deletePattern
    const deleted = this.returnsCache.deletePattern(`^${tenantId}:`);
    this.logger.debug(
      `Invalidated ${deleted} cache entries for tenant: ${tenantId}`
    );
  }

  /** Return service bilan bir xil: SITE/OTHER partiya yoki default SITE/OTHER yo‘l */
  private isSiteOrOtherPurchasePathType(
    pathType: string | null | undefined
  ): boolean {
    return pathType === "SITE" || pathType === "OTHER";
  }

  /**
   * SITE/OTHER 구매 경로가 제품에 하나라도 있으면 불량 출고 → order-returns(공급사) 미생성.
   * Partiya `purchase_path_type` ham SITE/OTHER bo‘lsa skip.
   */
  private async shouldSkipOrderReturnForSiteOrOtherPurchase(
    tenantId: string,
    productId: string,
    batchPurchasePathType: string | null | undefined
  ): Promise<boolean> {
    if (this.isSiteOrOtherPurchasePathType(batchPurchasePathType)) {
      return true;
    }

    const siteOrOtherPath = await this.prisma.executeWithRetry(async () =>
      (this.prisma as any).purchasePath.findFirst({
        where: {
          tenant_id: tenantId,
          product_id: productId,
          path_type: { in: ["SITE", "OTHER"] },
        },
        select: { id: true },
      })
    );

    return Boolean(siteOrOtherPath);
  }

  private isDefectiveReturnTypeValue(v: string): v is DefectiveReturnTypeValue {
    return (DEFECTIVE_RETURN_TYPE_VALUES as readonly string[]).includes(v);
  }

  /** SMS / supplier UI: 교환 vs 반품 */
  private defectiveReturnTypeKorean(
    t: string | null | undefined
  ): "교환" | "반품" {
    return t === "defective_exchange" ? "교환" : "반품";
  }

  /**
   * Resolve defective_return_type from DTO (supports legacy Korean strings once).
   */
  private resolveDefectiveReturnType(
    dto: any,
    existing: string | null | undefined
  ): DefectiveReturnTypeValue {
    const raw =
      dto?.defective_return_type ?? dto?.return_type ?? dto?.returnType ?? "";
    const s = String(raw).trim();
    if (this.isDefectiveReturnTypeValue(s)) {
      return s;
    }
    if (s.includes("교환")) {
      return "defective_exchange";
    }
    if (s.includes("반품")) {
      return "defective_return";
    }
    if (existing && this.isDefectiveReturnTypeValue(existing)) {
      return existing;
    }
    return "defective_exchange";
  }

  private async generateDefectiveReturnNumber(): Promise<string> {
    const maxAttempts = 15;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const date = new Date();
      const y = String(date.getFullYear());
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const randomDigits = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      const no = `B${y}${m}${d}${randomDigits}`;
      const existing = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.findFirst({
          where: { defective_return_no: no },
          select: { id: true },
        });
      });
      if (!existing) {
        return no;
      }
    }
    const ts = Date.now().toString().slice(-6);
    const date = new Date();
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `B${y}${m}${d}${ts}`;
  }

  private async findDefectiveReturnByWebhookReturnNo(
    returnNo: string
  ): Promise<any | null> {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(returnNo)) {
      return this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.findFirst({
          where: { id: returnNo },
        });
      });
    }
    return this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).defectiveProductReturn.findFirst({
        where: { defective_return_no: returnNo },
      });
    });
  }

  /** 교환 확인: supplier SupplierDefectiveReturn → completed (defective_exchange). */
  private async syncSupplierDefectiveExchangeCompleted(returnNo: string) {
    const supplierApiUrl = (
      process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com"
    ).replace(/\/$/, "");
    const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        "SUPPLIER_BACKEND_API_KEY is not configured; cannot sync exchange confirmation to supplier"
      );
    }
    const url = `${supplierApiUrl}/supplier/defective-returns/webhook/clinic-exchange-confirmed`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ return_no: returnNo }),
      });
    } catch (e: any) {
      this.logger.error(
        `syncSupplierDefectiveExchangeCompleted network: ${e?.message}`
      );
      throw new BadRequestException(
        `Could not reach supplier backend: ${e?.message || "network error"}`
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
      throw new BadRequestException(
        text || `Supplier webhook failed: HTTP ${res.status}`
      );
    }
    if (body.success === false) {
      throw new BadRequestException(
        body.message || "Supplier did not mark defective return completed"
      );
    }
  }

  /** OrderReturn.unit_price = 제품 단가 (판매가 우선, 없으면 매입가, 마지막으로 DTO) */
  private resolveOrderReturnUnitPrice(
    itemUnit: unknown,
    product: {
      sale_price?: number | null;
      purchase_price?: number | null;
    } | null
  ): number {
    const sale = product?.sale_price;
    const purch = product?.purchase_price;
    if (sale != null && !Number.isNaN(Number(sale)) && Number(sale) > 0) {
      return Math.floor(Number(sale));
    }
    if (purch != null && !Number.isNaN(Number(purch)) && Number(purch) > 0) {
      return Math.floor(Number(purch));
    }
    if (sale != null && !Number.isNaN(Number(sale))) {
      return Math.floor(Number(sale));
    }
    if (purch != null && !Number.isNaN(Number(purch))) {
      return Math.floor(Number(purch));
    }
    const n = Number(itemUnit);
    if (itemUnit != null && itemUnit !== "" && !Number.isNaN(n) && n >= 0) {
      return Math.floor(n);
    }
    return 0;
  }

  async createFromInbound(_tenantId: string, _dto: any) {
    throw new BadRequestException(
      "주문 기반 반품은 추후 별도 API에서 지원 예정입니다. DefectiveProductReturn은 불량/출고 반품만 처리합니다."
    );
  }

  async processReturn(tenantId: string, id: string, dto: any) {
    // Invalidate cache
    this.invalidateCache(tenantId);

    const returnItem = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).defectiveProductReturn.findFirst({
        where: { id, tenant_id: tenantId },
      });
    });

    if (!returnItem) {
      throw new BadRequestException("Return not found");
    }

    let imageUrls: string[] = [];
    if (dto.images && dto.images.length > 0) {
      imageUrls = await saveBase64Images("returns", dto.images, tenantId);
    }

    const finalImages =
      imageUrls.length > 0 ? imageUrls : returnItem.images || [];

    const finalDefectiveReturnType = this.resolveDefectiveReturnType(
      dto,
      returnItem.defective_return_type
    );

    let defectiveReturnNo = returnItem.defective_return_no as string | null;
    if (!defectiveReturnNo) {
      defectiveReturnNo = await this.generateDefectiveReturnNumber();
    }

    const updatedReturn = await this.prisma.executeWithRetry(async () => {
      const updateData: any = {
        return_manager: dto.returnManager || null,
        memo: dto.memo || null,
        images: finalImages,
        status: "pending",
        updated_at: new Date(),
        defective_return_type: finalDefectiveReturnType,
        defective_return_no: defectiveReturnNo,
      };

      return (this.prisma as any).defectiveProductReturn.update({
        where: { id, tenant_id: tenantId },
        data: updateData,
      });
    });

    const returnWithImages = {
      ...updatedReturn,
      defective_return_type: finalDefectiveReturnType,
      defective_return_no: defectiveReturnNo,
      images: finalImages,
    };

    // Send to supplier-backend
    try {
      await this.sendReturnToSupplier(returnWithImages, tenantId);

      // After successfully sending to supplier, update status to "processing"
      const finalReturn = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.update({
          where: { id, tenant_id: tenantId },
          data: {
            status: "processing",
            supplier_accepted_at: null,
            updated_at: new Date(),
          },
        });
      });

      return finalReturn;
    } catch (error: any) {
      this.logger.error(
        `Failed to send return to supplier: ${error.message}`,
        error.stack
      );
      // Don't throw - return is already processed, supplier notification is optional
      // But still return the updated return with "pending" status
      return updatedReturn;
    }
  }

  /** Manual ClinicSupplierManager (no platform linked manager): SMS + email for defective return */
  private async notifyManualClinicSupplierForDefectiveReturn(
    clinicSupplierManager: any,
    returnItem: any,
    tenantId: string
  ): Promise<void> {
    try {
      const clinic = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).clinic.findFirst({
          where: { tenant_id: tenantId },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "알 수 없음";

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
        } else {
          clinicManagerName = returnItem.return_manager;
        }
      }

      const product = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).product.findFirst({
          where: { id: returnItem.product_id },
          select: { name: true, brand: true, unit: true },
        });
      });

      const productName =
        product?.name && product.name.trim() !== ""
          ? product.name
          : returnItem.product_name && returnItem.product_name.trim() !== ""
            ? returnItem.product_name
            : "알 수 없음";
      const returnQty = returnItem.return_quantity || 0;
      const totalRefund = (returnItem.unit_price || 0) * returnQty;
      const correlationId = returnItem.defective_return_no || returnItem.id;

      const returnTypeText = this.defectiveReturnTypeKorean(
        returnItem.defective_return_type
      );

      const phoneNumber =
        clinicSupplierManager.phone_number ||
        clinicSupplierManager.email1 ||
        null;

      if (phoneNumber) {
        try {
          const smsMessage = `[반품/교환 알림]
${clinicName}에서 ${productName} ${returnQty}${product?.unit ? ` ${product.unit}` : ""} ${returnTypeText} 요청이 있습니다.
반품번호: ${correlationId}
확인 후 처리해주세요.`;

          await this.messageService.sendSMS(phoneNumber, smsMessage);
        } catch (smsError: any) {
          this.logger.error(
            `Failed to send SMS to manual supplier: ${smsError.message}`
          );
        }
      }

      const supplierEmail =
        clinicSupplierManager.company_email ||
        clinicSupplierManager.email1 ||
        clinicSupplierManager.email2 ||
        null;

      if (supplierEmail) {
        const products = [
          {
            productName: productName,
            brand: product?.brand || returnItem.brand || "",
            quantity: returnQty,
            unit: product?.unit || "",
          },
        ];

        const templateId = parseInt(
          process.env.BREVO_PRODUCT_RETURN_TEMPLATE_ID ||
            process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID ||
            "0",
          10
        );

        if (templateId > 0) {
          await this.emailService.sendReturnNotificationEmailWithTemplate(
            supplierEmail,
            templateId,
            clinicName,
            correlationId,
            totalRefund,
            returnQty,
            clinicManagerName,
            products,
            returnTypeText
          );
        } else {
          await this.emailService.sendReturnNotificationEmail(
            supplierEmail,
            clinicName,
            correlationId,
            totalRefund,
            returnQty,
            clinicManagerName,
            products,
            returnTypeText
          );
        }
      } else {
        this.logger.warn(
          `No email found for manual supplier, skipping email notification for return ${correlationId}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending notification to manual supplier: ${error.message}`
      );
    }
  }

  /**
   * Send return request to supplier-backend
   */
  private async sendReturnToSupplier(returnItem: any, tenantId: string) {
    // Get supplierManagerId from return item or fetch via product_id
    let supplierManagerId = returnItem.supplierManagerId;
    let supplierTenantId: string | null = null;

    if (!supplierManagerId && returnItem.supplier_manager_id) {
      try {
        const csm = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).clinicSupplierManager.findFirst({
            where: {
              id: returnItem.supplier_manager_id,
              tenant_id: tenantId,
            },
            include: {
              linkedManager: {
                select: {
                  id: true,
                  supplier_tenant_id: true,
                  supplier: { select: { tenant_id: true } },
                },
              },
            },
          });
        });
        if (csm?.linkedManager) {
          supplierManagerId = csm.linkedManager.id;
          supplierTenantId =
            csm.linkedManager.supplier_tenant_id ||
            csm.linkedManager.supplier?.tenant_id ||
            null;
        } else if (csm) {
          await this.notifyManualClinicSupplierForDefectiveReturn(
            csm,
            returnItem,
            tenantId
          );
          return;
        }
      } catch (error: any) {
        this.logger.error(
          `Error resolving supplier_manager_id for return: ${error.message}`
        );
      }
    }

    // If supplierManagerId not in return item, fetch it via product_id
    if (!supplierManagerId && returnItem.product_id) {
      try {
        const productSupplier = await this.prisma.executeWithRetry(async () => {
          return (this.prisma as any).productSupplier.findFirst({
            where: {
              product_id: returnItem.product_id,
              tenant_id: tenantId,
            },
            include: {
              clinicSupplierManager: {
                include: {
                  linkedManager: {
                    select: {
                      id: true,
                      supplier_tenant_id: true, // This is the correct field for supplier tenant_id
                      supplier: {
                        select: { tenant_id: true },
                      },
                    },
                  },
                },
              },
            },
          });
        });

        if (productSupplier?.clinicSupplierManager?.linkedManager) {
          const linkedManager =
            productSupplier.clinicSupplierManager.linkedManager;
          supplierManagerId = linkedManager.id;
          // Use supplier_tenant_id first (most reliable), fallback to supplier.tenant_id
          supplierTenantId =
            linkedManager.supplier_tenant_id ||
            linkedManager.supplier?.tenant_id ||
            null;
        } else if (productSupplier?.clinicSupplierManager) {
          await this.notifyManualClinicSupplierForDefectiveReturn(
            productSupplier.clinicSupplierManager,
            returnItem,
            tenantId
          );
          return;
        }
      } catch (error: any) {
        this.logger.error(`Error fetching supplierManagerId: ${error.message}`);
      }
    }

    try {
      // Get clinic details
      const clinic = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).clinic.findFirst({
          where: { tenant_id: tenantId },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "알 수 없음";

      // Get clinic manager name (return_manager)
      // return_manager can be either a member_id or a name
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
        } else {
          // If not found by member_id, assume it's already a name
          clinicManagerName = returnItem.return_manager;
        }
      }

      // Prepare return data for supplier
      const imagesArray = Array.isArray(returnItem.images)
        ? returnItem.images
        : returnItem.images
          ? [returnItem.images]
          : [];

      // Debug log for images

      const returnData = {
        returnNo: returnItem.defective_return_no || returnItem.id,
        supplierTenantId: supplierTenantId,
        supplierManagerId: supplierManagerId,
        clinicTenantId: tenantId,
        clinicName: clinicName,
        clinicManagerName: clinicManagerName,
        items: [
          {
            productName: returnItem.product_name,
            brand: returnItem.brand || "",
            quantity: returnItem.return_quantity,
            returnType: returnItem.defective_return_type,
            memo: returnItem.memo || "",
            images: imagesArray,
            inboundDate: returnItem.inbound_date
              ? new Date(returnItem.inbound_date).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0],
            totalPrice: returnItem.unit_price * returnItem.return_quantity,
            orderNo: null,
            batchNo: null,
          },
        ],
        createdAt: returnItem.created_at.toISOString(),
      };

      // Fetch supplier phone number for SMS notification
      let supplierPhoneNumber: string | null = null;
      try {
        if (supplierManagerId) {
          // Try to get phone from SupplierManager
          const supplierManager = await this.prisma.executeWithRetry(
            async () => {
              return (this.prisma as any).supplierManager.findUnique({
                where: { id: supplierManagerId },
                select: { phone_number: true, name: true },
              });
            }
          );
          supplierPhoneNumber = supplierManager?.phone_number || null;

          if (!supplierPhoneNumber) {
            // Fallback: Try to get phone from ClinicSupplierManager
            const clinicSupplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).clinicSupplierManager.findFirst({
                  where: {
                    linked_manager_id: supplierManagerId,
                  },
                  select: { phone_number: true },
                });
              }
            );
            supplierPhoneNumber = clinicSupplierManager?.phone_number || null;
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to fetch supplier phone number: ${error.message}`
        );
      }

      // Call supplier-backend API
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
        );
        return;
      }

      const response = await fetch(
        `${supplierApiUrl}/supplier/defective-returns`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(returnData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send return to supplier-backend: ${response.status} ${errorText}`
        );
      } else {
        const result: any = await response.json();

        // Send SMS notification to supplier
        if (supplierPhoneNumber) {
          try {
            const returnTypeText = this.defectiveReturnTypeKorean(
              returnData.items[0].returnType
            );
            const productName = returnData.items[0].productName;
            const quantity = returnData.items[0].quantity;

            const smsMessage = `[반품/교환 알림]
${clinicName}에서 ${productName} ${quantity}개 ${returnTypeText} 요청이 있습니다.
반품번호: ${returnItem.defective_return_no || returnItem.id}
확인 후 처리해주세요.`;

            const smsSent = await this.messageService.sendSMS(
              supplierPhoneNumber,
              smsMessage
            );
          } catch (smsError: any) {
            this.logger.error(
              `Failed to send SMS to supplier: ${smsError.message}`
            );
            // Don't throw - SMS failure shouldn't break the return process
          }
        } else {
        }

        // Send Email notification to supplier
        try {
          // Get supplier email (priority: supplierManager.email1 > supplier.company_email > clinicSupplierManager.company_email > clinicSupplierManager.email1 > clinicSupplierManager.email2)
          let supplierEmail: string | null = null;

          if (supplierManagerId) {
            const supplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).supplierManager.findUnique({
                  where: { id: supplierManagerId },
                  select: {
                    email1: true,
                    supplier: {
                      select: {
                        company_email: true,
                      },
                    },
                  },
                });
              }
            );

            supplierEmail =
              supplierManager?.email1 ||
              supplierManager?.supplier?.company_email ||
              null;
          }

          // Fallback: Try ClinicSupplierManager email
          if (!supplierEmail) {
            const clinicSupplierManager = await this.prisma.executeWithRetry(
              async () => {
                return (this.prisma as any).clinicSupplierManager.findFirst({
                  where: {
                    linked_manager_id: supplierManagerId,
                  },
                  select: {
                    company_email: true,
                    email1: true,
                    email2: true,
                  },
                });
              }
            );

            supplierEmail =
              clinicSupplierManager?.company_email ||
              clinicSupplierManager?.email1 ||
              clinicSupplierManager?.email2 ||
              null;
          }

          if (supplierEmail) {
            const returnTypeText = this.defectiveReturnTypeKorean(
              returnData.items[0].returnType
            );

            // Fetch product name va unit from product table
            let productUnit = "";
            let productNameFromDB = "";
            if (returnItem.product_id) {
              try {
                const product = await this.prisma.executeWithRetry(async () => {
                  return (this.prisma as any).product.findFirst({
                    where: { id: returnItem.product_id },
                    select: { unit: true, name: true }, // ✅ name'ni ham select qilish
                  });
                });
                productUnit = product?.unit || "";
                productNameFromDB = product?.name || ""; // ✅ Product name'ni saqlash
              } catch (error: any) {
                this.logger.warn(
                  `Failed to fetch product unit: ${error.message}`
                );
              }
            }

            const products = returnData.items.map((item: any) => ({
              productName:
                item.productName && item.productName.trim() !== ""
                  ? item.productName
                  : productNameFromDB && productNameFromDB.trim() !== ""
                    ? productNameFromDB
                    : "알 수 없음", // ✅ Fallback qo'shish
              brand: item.brand,
              quantity: item.quantity,
              unit: productUnit,
            }));

            // Template ID'ni environment variable'dan olish
            const templateId = parseInt(
              process.env.BREVO_RETURN_NOTIFICATION_TEMPLATE_ID || "0",
              10
            );

            if (templateId > 0) {
              // Template ishlatish
              await this.emailService.sendReturnNotificationEmailWithTemplate(
                supplierEmail,
                templateId,
                clinicName,
                returnItem.defective_return_no || returnItem.id,
                returnData.items[0].totalPrice,
                returnData.items[0].quantity,
                clinicManagerName,
                products,
                returnTypeText
              );
            } else {
              // Oddiy HTML email (fallback)
              await this.emailService.sendReturnNotificationEmail(
                supplierEmail,
                clinicName,
                returnItem.defective_return_no || returnItem.id,
                returnData.items[0].totalPrice,
                returnData.items[0].quantity,
                clinicManagerName,
                products,
                returnTypeText
              );
            }
          } else {
          }
        } catch (emailError: any) {
          this.logger.error(
            `Failed to send return notification email: ${emailError.message}`
          );
          // Don't throw - email failure shouldn't break the return process
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending return to supplier-backend: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async updateReturnType(
    tenantId: string,
    id: string,
    defectiveReturnType: string
  ) {
    this.invalidateCache(tenantId);
    if (!this.isDefectiveReturnTypeValue(defectiveReturnType)) {
      throw new BadRequestException(
        `Invalid defective_return_type. Must be one of: ${DEFECTIVE_RETURN_TYPE_VALUES.join(", ")}`
      );
    }

    return this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).defectiveProductReturn.update({
        where: { id, tenant_id: tenantId },
        data: {
          defective_return_type: defectiveReturnType,
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
                productSupplier: {
                  include: {
                    clinicSupplierManager: {
                      include: {
                        linkedManager: {
                          include: {
                            supplier: {
                              select: { id: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            batch: {
              select: {
                id: true,
                batch_no: true,
                created_at: true,
                purchase_path_type: true,
              },
            },
          },
        });
      });

      if (!outbound) {
        throw new BadRequestException("Outbound not found");
      }

      const batchPurchasePathType =
        outbound.batch?.purchase_path_type ?? null;
      const skipOrderReturn =
        Boolean(outbound.is_defective) &&
        (await this.shouldSkipOrderReturnForSiteOrOtherPurchase(
          tenantId,
          outbound.product_id,
          batchPurchasePathType
        ));
      if (skipOrderReturn) {
        this.logger.log(
          `📦 [createFromOutbound] Skipping order-return (불량 + SITE/OTHER): outbound=${outboundId}, product=${outbound.product_id}`
        );
        return {
          message: "No returns to create (SITE/OTHER purchase path)",
          skipped: true,
          created: 0,
          returns: [],
        };
      }

      const defectiveReturnType: DefectiveReturnTypeValue = "defective_return";

      this.logger.log(
        `📦 [createFromOutbound] Creating return for outbound ${outboundId}: is_damaged=${outbound.is_damaged}, is_defective=${outbound.is_defective}, defective_return_type=${defectiveReturnType}`
      );

      const supplierManagerId =
        outbound.product?.productSupplier?.clinic_supplier_manager_id ??
        outbound.product?.productSupplier?.clinicSupplierManager?.id ??
        null;

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

      const isPlaceholderProductName = (v: unknown) => {
        if (v == null) return true;
        const s = String(v).trim();
        return s === "" || s === "알 수 없음";
      };

      const returns = await this.prisma.executeWithRetry(async () => {
        const created: any[] = [];
        for (const item of items) {
          const pid = item.productId || outbound.product_id;

          const pRow = await (this.prisma as any).product.findFirst({
            where: { id: pid, tenant_id: tenantId },
            select: {
              name: true,
              sale_price: true,
              purchase_price: true,
              brand: true,
            },
          });

          const nameCandidates = [
            item.productName,
            outbound.product_name,
            outbound.product?.name,
            pRow?.name,
          ];
          const productName =
            nameCandidates.find((n) => !isPlaceholderProductName(n)) ??
            "알 수 없음";

          const unitPrice = this.resolveOrderReturnUnitPrice(item.unitPrice, {
            sale_price: pRow?.sale_price ?? outbound.product?.sale_price,
            purchase_price:
              pRow?.purchase_price ?? outbound.product?.purchase_price,
          });

          const brand =
            item.brand || outbound.product?.brand || pRow?.brand || null;

          const useDefectiveBoxQty =
            outbound.is_defective &&
            outbound.defective_box_count != null &&
            Number(outbound.defective_box_count) > 0;

          const resolvedReturnQty = useDefectiveBoxQty
            ? Number(outbound.defective_box_count)
            : item.returnQuantity ?? outbound.outbound_qty;

          const resolvedTotalQty = useDefectiveBoxQty
            ? Number(outbound.defective_box_count)
            : item.totalQuantity ?? item.returnQuantity ?? outbound.outbound_qty;

          let quantity_unit: string | null = null;
          if (
            outbound.is_defective &&
            outbound.product_unit != null &&
            String(outbound.product_unit).trim() !== ""
          ) {
            quantity_unit = String(outbound.product_unit).trim();
          } else if (
            outbound.product?.capacity_unit != null &&
            String(outbound.product.capacity_unit).trim() !== ""
          ) {
            quantity_unit = String(outbound.product.capacity_unit).trim();
          } else if (
            outbound.product?.unit != null &&
            String(outbound.product.unit).trim() !== ""
          ) {
            quantity_unit = String(outbound.product.unit).trim();
          }

          const defective_return_no =
            await this.generateDefectiveReturnNumber();

          const row = await (this.prisma as any).defectiveProductReturn.create({
            data: {
              tenant_id: tenantId,
              supplier_manager_id: supplierManagerId,
              defective_return_no,
              defective_return_type: defectiveReturnType,
              product_id: pid,
              product_name: productName,
              brand,
              return_quantity: resolvedReturnQty,
              total_quantity: resolvedTotalQty,
              quantity_unit,
              unit_price: unitPrice,
              status: "pending",
              memo: outbound.memo ?? item.memo ?? null,
              return_manager: returnManager,
              inbound_date: batchCreatedAt || new Date(),
            },
          });
          created.push(row);
        }
        return created;
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
  async handleReturnComplete(dto: {
    return_no: string;
    item_id?: string;
    status: string;
  }) {
    try {
      const returnItem = await this.findDefectiveReturnByWebhookReturnNo(
        dto.return_no
      );

      if (!returnItem) {
        this.logger.warn(`Return not found for return_no: ${dto.return_no}`);
        return {
          success: false,
          message: `Return not found for return_no: ${dto.return_no}`,
        };
      }

      // Update status to completed
      const updated = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.update({
          where: { id: returnItem.id },
          data: {
            status: "completed",
            updated_at: new Date(),
          },
        });
      });

      const payload = await this.buildOrderReturnSupplierNotificationPayload(
        updated,
        "completed"
      );
      if (payload) {
        try {
          await this.notificationService.createFromOrderReturnSupplierEvent(
            payload
          );
        } catch (e: any) {
          this.logger.error(
            `Order-return completed notification: ${e?.message || e}`
          );
        }
      }

      return { success: true, message: "Return status updated to completed" };
    } catch (error: any) {
      this.logger.error(
        `Error handling return complete: ${error.message}`,
        error.stack
      );
      // Don't throw error to prevent webhook retries
      return {
        success: false,
        message: `Failed to handle return complete: ${error.message}`,
      };
    }
  }

  /**
   * Webhook: supplier accepted return/exchange request (요청 수락)
   */
  async handleOrderReturnAcceptWebhook(dto: { return_no: string }) {
    try {
      const row = await this.findDefectiveReturnByWebhookReturnNo(
        dto.return_no
      );
      if (!row) {
        return {
          success: false,
          message: "Defective product return not found",
        };
      }

      const updated = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.update({
          where: { id: row.id },
          data: {
            status: "processing",
            supplier_accepted_at: new Date(),
            updated_at: new Date(),
          },
        });
      });

      const payload = await this.buildOrderReturnSupplierNotificationPayload(
        updated,
        "accepted"
      );
      if (payload) {
        try {
          await this.notificationService.createFromOrderReturnSupplierEvent(
            payload
          );
        } catch (e: any) {
          this.logger.error(
            `Order-return accept notification: ${e?.message || e}`
          );
        }
      }

      return {
        success: true,
        message: "Order return accept webhook processed",
      };
    } catch (error: any) {
      this.logger.error(
        `handleOrderReturnAcceptWebhook: ${error.message}`,
        error.stack
      );
      return { success: false, message: error.message };
    }
  }

  /**
   * Webhook: supplier rejected return/exchange request (요청 반려)
   */
  async handleOrderReturnRejectWebhook(dto: {
    return_no: string;
    reason?: string;
  }) {
    try {
      const row = await this.findDefectiveReturnByWebhookReturnNo(
        dto.return_no
      );
      if (!row) {
        return {
          success: false,
          message: "Defective product return not found",
        };
      }

      const updated = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.update({
          where: { id: row.id },
          data: { status: "rejected", updated_at: new Date() },
        });
      });

      const payload = await this.buildOrderReturnSupplierNotificationPayload(
        updated,
        "rejected",
        dto.reason
      );
      if (payload) {
        try {
          await this.notificationService.createFromOrderReturnSupplierEvent(
            payload
          );
        } catch (e: any) {
          this.logger.error(
            `Order-return reject notification: ${e?.message || e}`
          );
        }
      }

      return {
        success: true,
        message: "Order return reject webhook processed",
      };
    } catch (error: any) {
      this.logger.error(
        `handleOrderReturnRejectWebhook: ${error.message}`,
        error.stack
      );
      return { success: false, message: error.message };
    }
  }

  private async buildOrderReturnSupplierNotificationPayload(
    row: any,
    action: OrderReturnSupplierNotifiedPayload["action"],
    rejectionReason?: string | null
  ): Promise<OrderReturnSupplierNotifiedPayload | null> {
    if (!row?.tenant_id || !row?.id) return null;

    const category: "exchange" | "refund" =
      row.defective_return_type === "defective_exchange"
        ? "exchange"
        : "refund";
    const qty = row.return_quantity ?? 0;

    const isUnknownProductName = (name: string | null | undefined) =>
      !name || !String(name).trim() || String(name).trim() === "알 수 없음";

    let displayProductName: string | null = null;
    if (!isUnknownProductName(row.product_name)) {
      displayProductName = String(row.product_name).trim();
    }

    let supplierCompanyName: string | null = null;
    let supplierManagerName: string | null = null;

    if (row.supplier_manager_id) {
      const csm = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).clinicSupplierManager.findFirst({
          where: { id: row.supplier_manager_id, tenant_id: row.tenant_id },
          select: { company_name: true, name: true },
        });
      });
      if (csm) {
        supplierCompanyName = csm.company_name ?? null;
        supplierManagerName = csm.name ?? null;
      }
    }

    // product_name = "알 수 없음" yoki supplier bo'sh — Product zanjiridan to'ldirish
    if (row.product_id && (!displayProductName || !supplierCompanyName)) {
      const product = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).product.findFirst({
          where: { id: row.product_id, tenant_id: row.tenant_id },
          select: {
            name: true,
            productSupplier: {
              select: {
                clinicSupplierManager: {
                  select: { company_name: true, name: true },
                },
              },
            },
          },
        });
      });
      if (product) {
        if (!displayProductName && !isUnknownProductName(product.name)) {
          displayProductName = String(product.name).trim();
        }
        if (!supplierCompanyName) {
          const csm2 = product.productSupplier?.clinicSupplierManager;
          if (csm2) {
            supplierCompanyName = csm2.company_name ?? null;
            supplierManagerName = csm2.name ?? null;
          }
        }
      }
    }

    let productSummary: string | null = null;
    if (displayProductName) {
      productSummary = `${displayProductName} ${qty}개`;
    } else if (row.product_id) {
      productSummary = `제품 ${row.product_id} ${qty}개`;
    }

    return {
      tenantId: row.tenant_id,
      orderReturnId: row.id,
      returnNo: row.defective_return_no ?? row.id,
      action,
      productSummary,
      supplierCompanyName,
      supplierManagerName,
      category,
      rejectionReason: rejectionReason ?? null,
    };
  }

  /**
   * Confirm exchange (교환 확인)
   * Changes status from "processing" to "completed" for exchange items
   */
  async confirmExchange(tenantId: string, id: string) {
    // Invalidate cache
    this.invalidateCache(tenantId);
    try {
      const returnItem = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).defectiveProductReturn.findFirst({
          where: { id, tenant_id: tenantId },
        });
      });

      if (!returnItem) {
        throw new BadRequestException("Return not found");
      }

      // Check if it's an exchange type
      const isExchange =
        returnItem.defective_return_type === "defective_exchange";
      if (!isExchange) {
        throw new BadRequestException("This is not an exchange item");
      }

      // Check if status is "processing"
      if (returnItem.status !== "processing") {
        throw new BadRequestException("Return is not in processing status");
      }

      if (!returnItem.supplier_accepted_at) {
        throw new BadRequestException(
          "공급처에서 요청 확인 후 진행할 수 있습니다."
        );
      }

      await this.syncSupplierDefectiveExchangeCompleted(
        returnItem.defective_return_no
      );

      const now = new Date();
      const updatedReturn = await this.prisma.executeWithRetry(async () => {
        return this.prisma.$transaction(async (tx: any) => {
          const updated = await tx.defectiveProductReturn.update({
            where: { id, tenant_id: tenantId },
            data: {
              status: "completed",
              product_received: true,
              received_at: now,
              updated_at: now,
            },
          });
          const expectedQty = Math.max(
            1,
            returnItem.return_quantity ||
              returnItem.total_quantity ||
              0
          );
          await tx.defectiveExchangeInboundExpectation.create({
            data: {
              tenant_id: tenantId,
              defective_product_return_id: id,
              product_id: returnItem.product_id,
              product_name: returnItem.product_name,
              brand: returnItem.brand ?? null,
              expected_qty: expectedQty,
              supplier_manager_id: returnItem.supplier_manager_id ?? null,
              unit_price: returnItem.unit_price ?? 0,
            },
          });
          return updated;
        });
      });

      return updatedReturn;
    } catch (error: any) {
      this.logger.error(
        `Error confirming exchange: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to confirm exchange: ${error.message}`
      );
    }
  }
}
