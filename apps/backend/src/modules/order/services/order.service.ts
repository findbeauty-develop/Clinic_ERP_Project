import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { OrderRepository } from "../repositories/order.repository";
import { CreateOrderDto } from "../dto/create-order.dto";
import {
  UpdateOrderDraftDto,
  AddOrderDraftItemDto,
  UpdateOrderDraftItemDto,
} from "../dto/update-order-draft.dto";
import { SearchProductsQueryDto } from "../dto/search-products-query.dto";
import { MessageService } from "../../member/services/message.service";
import { EmailService } from "../../member/services/email.service";
import { CacheManager } from "../../../common/cache";
import { TelegramNotificationService } from "src/common/services/telegram-notification.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ORDER_SUPPLIER_NOTIFIED_EVENT } from "../../notifications/constants/notification-events";
import type { OrderSupplierNotifiedPayload } from "../../notifications/types/order-supplier-notified.payload";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  private pendingInboundCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService,
    private readonly telegramService: TelegramNotificationService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.pendingInboundCache = new CacheManager({
      maxSize: 100,
      ttl: 0,
      cleanupInterval: 60000,
      name: "OrderService:PendingInbound",
    });
  }
  /**
   * Mahsulotlar ro'yxatini olish (barcha productlar)
   */
  async getProductsForOrder(tenantId: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Barcha product'larni olish
    const products = await (this.prisma.product.findMany as any)({
      where: {
        tenant_id: tenantId,
      },
      include: {
        batches: true,
        productSupplier: {
          include: {
            clinicSupplierManager: {
              select: {
                id: true,
                company_name: true,
                position: true,
                name: true,
                phone_number: true,
                business_number: true,
                // unit: true,
              },
            },
          },
        },
      },
    });

    // Faqat basic formatting - hamma logic frontend'da
    // 단가: 1) Batch bor bo'lsa = oxirgi inbound (batch) narxi, 2) yo'q bo'lsa = Product/ProductSupplier
    const formattedProducts = products.map((product: any) => {
      // Get supplier info from ProductSupplier -> ClinicSupplierManager
      const supplierManager = product.productSupplier?.clinicSupplierManager;
      const supplierId = supplierManager?.id ?? null;
      const supplierName = supplierManager?.company_name ?? null;
      const managerName = supplierManager?.name ?? null;

      const batches = product.batches || [];
      const sortedBatches = [...batches].sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestBatch = sortedBatches[0];
      const unitPrice =
        latestBatch?.purchase_price != null
          ? latestBatch.purchase_price
          : (product.productSupplier?.purchase_price ??
            product.purchase_price ??
            null);

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        category: product.category ?? null,
        supplierId: supplierId, // ClinicSupplierManager ID
        supplierName: supplierName,
        managerName: managerName,
        managerPosition: supplierManager?.position ?? null, // Position is not in ClinicSupplierManager
        unitPrice,
        taxRate: product.tax_rate ?? 0,
        currentStock: product.current_stock ?? 0,
        minStock: product.min_stock ?? 0,
        unit: product.unit ?? null, // ✅ Product unit
        batches: batches.map((batch: any) => ({
          id: batch.id,
          batchNo: batch.batch_no ?? "",
          expiryDate: batch.expiry_date
            ? batch.expiry_date.toISOString().split("T")[0]
            : null,
          qty: batch.qty ?? 0,
          unit: product.unit ?? null,
          purchasePrice: batch.purchase_price ?? null,
        })),
      };
    });

    return formattedProducts;
  }

  /**
   * Order draft'ni olish yoki yaratish
   */
  async getOrCreateDraft(sessionId: string, tenantId: string): Promise<any> {
    if (!tenantId || !sessionId) {
      throw new BadRequestException("Tenant ID and Session ID are required");
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DRAFT_EXPIRY_HOURS);

    let draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      // Yangi draft yaratish
      draft = await this.orderRepository.createOrUpdateDraft(
        sessionId,
        tenantId,
        { items: [], total_amount: 0 },
        expiresAt
      );
    } else if (new Date(draft.expires_at) < new Date()) {
      // Expired draft'ni yangilash
      draft = await this.orderRepository.createOrUpdateDraft(
        sessionId,
        tenantId,
        { items: [], total_amount: 0 },
        expiresAt
      );
    }

    return this.formatDraftResponse(draft);
  }

  /**
   * Mahsulotlarni qidirish (pagination bilan, risk score bo'lmasa ham)
   */
  async searchProducts(
    tenantId: string,
    query: SearchProductsQueryDto
  ): Promise<{
    products: Array<{
      id: string;
      productName: string;
      brand: string;
      supplierId: string | null;
      supplierName: string | null;
      unitPrice: number | null;
      totalStock: number;
      unit: string | null;
      batches: Array<{
        batchNo: string;
        qty: number;
        unit: string | null;
        expiryDate: string | null;
        purchasePrice: number | null;
      }>;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
      is_active: true,
    };

    // Search filter
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { brand: { contains: query.search, mode: "insensitive" } },
        // Search by supplier company name via ProductSupplier
        {
          productSupplier: {
            clinicSupplierManager: {
              company_name: { contains: query.search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    // Supplier filter
    if (query.supplierId) {
      where.productSupplier = {
        clinic_supplier_manager_id: query.supplierId,
      };
    }

    // Total count
    const total = await this.prisma.product.count({ where });

    // Products olish
    const products = await this.prisma.executeWithRetry(async () => {
      return (this.prisma.product.findMany as any)({
        where,
        include: {
          batches: {
            where: {
              qty: { gt: 0 }, // Faqat zaxirasi bor batch'lar
              unit: { not: null },
            },
            orderBy: [
              { expiry_date: "asc" }, // FEFO
              { created_at: "asc" },
            ],
          },
          productSupplier: {
            include: {
              clinicSupplierManager: {
                select: {
                  id: true,
                  company_name: true,
                  name: true,
                  phone_number: true,
                  business_number: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
    });

    const formattedProducts = products.map((product: any) => {
      const totalStock = product.batches.reduce(
        (sum: number, batch: any) => sum + batch.qty,
        0
      );

      // Get supplier info from ProductSupplier -> ClinicSupplierManager
      const supplierManager = product.productSupplier?.clinicSupplierManager;
      const supplierId = supplierManager?.id ?? null;
      const supplierName = supplierManager?.company_name ?? null;
      const managerName = supplierManager?.name ?? null;

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        supplierId: supplierId,
        supplierName: supplierName,
        managerName: managerName,
        managerPosition: null,
        unitPrice:
          product.productSupplier?.purchase_price ??
          product.purchase_price ??
          null,
        totalStock: totalStock,
        unit: product.unit,
        batches: product.batches.map((batch: any) => ({
          batchNo: batch.batch_no,
          qty: batch.qty,
          unit: batch.unit,
          expiryDate: batch.expiry_date
            ? batch.expiry_date.toISOString().split("T")[0]
            : null,
          purchasePrice: batch.purchase_price ?? null,
        })),
      };
    });

    return {
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Order draft'ga item qo'shish
   */
  async addDraftItem(
    sessionId: string,
    tenantId: string,
    dto: AddOrderDraftItemDto
  ): Promise<any> {
    if (!tenantId || !sessionId) {
      throw new BadRequestException("Tenant ID and Session ID are required");
    }

    // Product va batch ma'lumotlarini olish (productSupplier = supplier tasdiqlagan narx keyingi order uchun)
    const product = await (this.prisma.product.findFirst as any)({
      where: { id: dto.productId, tenant_id: tenantId },
      include: {
        productSupplier: {
          select: {
            clinic_supplier_manager_id: true,
            purchase_price: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // 단가 tartibi: 1) Tanlangan/oxirgi batch (inbound qilingan narx), 2) ProductSupplier, 3) Product
    const supplierPrice = product.productSupplier?.purchase_price ?? null;
    const productPrice = product.purchase_price ?? 0;

    let batch = null;
    let unitPrice = supplierPrice ?? productPrice;

    if (dto.batchId) {
      batch = await this.prisma.batch.findFirst({
        where: {
          id: dto.batchId,
          product_id: dto.productId,
          tenant_id: tenantId,
        },
      });

      if (!batch) {
        throw new NotFoundException("Batch not found");
      }

      unitPrice = batch.purchase_price ?? supplierPrice ?? productPrice;
    } else {
      // Batch tanlanmagan: oxirgi inbound (batch) narxi bor bo'lsa shuni, yo'q bo'lsa Product/ProductSupplier
      const latestBatch = await this.prisma.batch.findFirst({
        where: {
          product_id: dto.productId,
          tenant_id: tenantId,
          qty: { gt: 0 },
          unit: { not: null },
        },
        orderBy: { created_at: "desc" },
      });

      if (latestBatch?.purchase_price != null) {
        unitPrice = latestBatch.purchase_price;
      } else {
        unitPrice = supplierPrice ?? productPrice;
      }
    }

    // Draft'ni olish
    const draft = await this.getOrCreateDraft(sessionId, tenantId);
    const items = Array.isArray(draft.items) ? draft.items : [];

    // Item ID yaratish (productId-batchId yoki productId)
    const itemId = dto.batchId
      ? `${dto.productId}-${dto.batchId}`
      : dto.productId;

    // Mavjud item'ni topish
    const existingItemIndex = items.findIndex(
      (item: any) => item.id === itemId
    );

    // Supplier ID olish (clinic_supplier_manager_id)
    const supplierId =
      product.productSupplier?.clinic_supplier_manager_id || null;

    const newItem = {
      id: itemId,
      productId: dto.productId,
      batchId: dto.batchId,
      supplierId: supplierId,
      quantity: dto.quantity,
      unitPrice: unitPrice,
      totalPrice: dto.quantity * unitPrice,
      memo: dto.memo,
    };

    if (existingItemIndex >= 0) {
      // Mavjud item'ni yangilash
      // ⚠️ MUHIM: Quantity'ni qo'shmaslik, balki to'g'ridan-to'g'ri o'rnatish
      // Frontend'da `PUT` chaqiruvida quantity to'g'ridan-to'g'ri o'rnatiladi
      // Agar `PUT` 404 qaytarsa va `POST` fallback ishlatilsa, quantity qo'shilmasligi kerak
      const oldQty = items[existingItemIndex].quantity;
      const newQty = dto.quantity; // To'g'ridan-to'g'ri o'rnatish (qo'shmaslik)

      items[existingItemIndex] = {
        ...items[existingItemIndex],
        quantity: newQty,
        totalPrice: newQty * unitPrice,
        // Mavjud item'ni yangilashda highlight flag o'chiriladi
        isNewlyAdded: false,
      };
    } else {
      // Yangi item qo'shish
      items.push(newItem);
    }

    // Total amount hisoblash
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.totalPrice,
      0
    );

    // Draft'ni yangilash
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DRAFT_EXPIRY_HOURS);

    const updatedDraft = await this.orderRepository.createOrUpdateDraft(
      sessionId,
      tenantId,
      { items, total_amount: totalAmount },
      expiresAt
    );

    // Yangi qo'shilgan item'ni highlight qilish
    const highlightItemIds = [itemId];

    return this.formatDraftResponse(updatedDraft, highlightItemIds);
  }

  /**
   * Order draft'dan item'ni yangilash yoki o'chirish
   */
  async updateDraftItem(
    sessionId: string,
    tenantId: string,
    itemId: string,
    dto: UpdateOrderDraftItemDto
  ): Promise<any> {
    if (!tenantId || !sessionId) {
      throw new BadRequestException("Tenant ID and Session ID are required");
    }

    const draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      throw new NotFoundException("Draft not found");
    }

    const items = Array.isArray(draft.items) ? draft.items : [];

    // Item'ni topish
    const itemIndex = items.findIndex((item: any) => item.id === itemId);

    if (itemIndex < 0) {
      // Debug: draft'dagi barcha item ID'larni ko'rsatish
      const availableItemIds = items.map((item: any) => item.id);

      throw new NotFoundException(
        `Item not found in draft. Looking for: ${itemId}, Available item IDs: ${availableItemIds.join(
          ", "
        )}`
      );
    }

    if (dto.quantity === 0) {
      // Item'ni o'chirish
      items.splice(itemIndex, 1);
    } else {
      // Item'ni yangilash
      const item = items[itemIndex];
      items[itemIndex] = {
        ...item,
        quantity: dto.quantity,
        totalPrice: dto.quantity * item.unitPrice,
      };
    }

    // Total amount hisoblash
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.totalPrice,
      0
    );

    // Draft'ni yangilash
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DRAFT_EXPIRY_HOURS);

    const updatedDraft = await this.orderRepository.createOrUpdateDraft(
      sessionId,
      tenantId,
      { items, total_amount: totalAmount },
      expiresAt
    );

    return this.formatDraftResponse(updatedDraft);
  }

  /**
   * Order draft'ni to'liq yangilash
   */
  async updateDraft(
    sessionId: string,
    tenantId: string,
    dto: UpdateOrderDraftDto
  ): Promise<any> {
    if (!tenantId || !sessionId) {
      throw new BadRequestException("Tenant ID and Session ID are required");
    }

    // Har bir item uchun narx va total price hisoblash
    const itemsWithPrices = await Promise.all(
      dto.items.map(async (item) => {
        const product = await (this.prisma.product.findFirst as any)({
          where: { id: item.productId, tenant_id: tenantId },
          select: {
            id: true,
            purchase_price: true,
            productSupplier: {
              select: {
                clinic_supplier_manager_id: true,
              },
            },
          },
        });

        if (!product) {
          throw new NotFoundException(`Product not found: ${item.productId}`);
        }

        let unitPrice = item.unitPrice;

        // Agar unitPrice berilmagan bo'lsa, product yoki batch'dan olish
        if (!unitPrice) {
          if (item.batchId) {
            const batch = await this.prisma.batch.findFirst({
              where: {
                id: item.batchId,
                product_id: item.productId,
                tenant_id: tenantId,
              },
            });
            unitPrice = batch?.purchase_price ?? product.purchase_price ?? 0;
          } else {
            unitPrice = product.purchase_price ?? 0;
          }
        }

        const itemId = item.batchId
          ? `${item.productId}-${item.batchId}`
          : item.productId;

        const supplierId =
          product.productSupplier?.clinic_supplier_manager_id || null;

        return {
          id: itemId,
          productId: item.productId,
          batchId: item.batchId,
          supplierId: supplierId,
          quantity: item.quantity,
          taxRate: product.tax_rate ?? 0,
          unitPrice: unitPrice,
          totalPrice: item.quantity * unitPrice,
          memo: item.memo,
        };
      })
    );

    // Total amount hisoblash
    const totalAmount = itemsWithPrices.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    // Supplier bo'yicha grouping (itemsWithPrices'da allaqachon supplierId bor)
    const groupedBySupplier: Record<string, any> = {};
    for (const item of itemsWithPrices) {
      const supplierId = item.supplierId || "unknown";

      if (!groupedBySupplier[supplierId]) {
        groupedBySupplier[supplierId] = {
          supplierId: supplierId,
          items: [],
          totalAmount: 0,
        };
      }

      groupedBySupplier[supplierId].items.push(item);
      groupedBySupplier[supplierId].totalAmount += item.totalPrice;
    }

    // Draft'ni yangilash
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DRAFT_EXPIRY_HOURS);

    const updatedDraft = await this.orderRepository.createOrUpdateDraft(
      sessionId,
      tenantId,
      { items: itemsWithPrices, total_amount: totalAmount },
      expiresAt
    );

    return {
      ...this.formatDraftResponse(updatedDraft),
      groupedBySupplier: Object.values(groupedBySupplier),
    };
  }

  /**
   * Order yaratish (draft'dan)
   */
  async createOrder(
    sessionId: string,
    tenantId: string,
    dto: CreateOrderDto,
    createdBy?: string
  ): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    let items: any[] = [];

    // Items'ni DTO'dan yoki draft'dan olish
    if (dto.items && dto.items.length > 0) {
      // Frontend'dan items berilgan - local state'dan
      items = dto.items.map((item) => ({
        id: item.batchId ? `${item.productId}-${item.batchId}` : item.productId,
        productId: item.productId,
        batchId: item.batchId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate ?? 0,
        totalPrice: item.quantity * item.unitPrice,
        // supplierId'ni product'dan olish kerak (quyida)
      }));
    } else if (sessionId) {
      // Draft'dan olish (eski logic)
      const draft = await this.orderRepository.findDraftBySession(
        sessionId,
        tenantId
      );

      if (!draft) {
        throw new NotFoundException("Draft not found");
      }

      items = Array.isArray(draft.items) ? draft.items : [];
    } else {
      throw new BadRequestException("Either items or sessionId is required");
    }

    if (items.length === 0) {
      throw new BadRequestException("Order must have at least one item");
    }

    // Validation va supplierId qo'shish
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(
          `Invalid quantity for item: ${item.productId}`
        );
      }

      // Product va batch mavjudligini tekshirish
      const product = await (this.prisma.product.findFirst as any)({
        where: { id: item.productId, tenant_id: tenantId },
        select: {
          id: true,
          productSupplier: {
            select: {
              clinic_supplier_manager_id: true,
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundException(`Product not found: ${item.productId}`);
      }

      // DTO'dan kelgan items'ga supplierId qo'shish (clinic_supplier_manager_id ishlatamiz)
      if (!item.supplierId) {
        const supplierId =
          product.productSupplier?.clinic_supplier_manager_id || "unknown";
        item.supplierId = supplierId;
      }

      // Zaxira tekshirish (agar batch bo'lsa)
      if (item.batchId) {
        const batch = await this.prisma.batch.findFirst({
          where: {
            id: item.batchId,
            product_id: item.productId,
            tenant_id: tenantId,
          },
        });

        if (!batch) {
          throw new NotFoundException(`Batch not found: ${item.batchId}`);
        }

        // Zaxira tekshirish (bu bosqichda ombor zaxirasi o'zgarmaydi, faqat tekshirish)
        // Keyingi bosqichda (C2-5-3) zaxira o'zgaradi
      }
    }

    // Supplier bo'yicha guruhlash
    const groupedBySupplier: Record<string, any> = {};
    for (const item of items) {
      const supplierId = item.supplierId || "unknown";
      if (!groupedBySupplier[supplierId]) {
        groupedBySupplier[supplierId] = {
          supplierId: supplierId,
          items: [],
          totalAmount: 0,
        };
      }
      groupedBySupplier[supplierId].items.push(item);
      groupedBySupplier[supplierId].totalAmount += item.totalPrice;
    }

    // Har bir supplier uchun alohida order yaratish
    const createdOrders = [];
    for (const [supplierId, group] of Object.entries(groupedBySupplier)) {
      // Order number yaratish
      const orderNo = await this.generateOrderNumber(tenantId);

      // Supplier uchun memo olish
      const supplierMemo = dto.supplierMemos?.[supplierId] || dto.memo || null;

      // ✅ STEP 1: Check if supplier is platform or manual
      const clinicSupplierManager = await this.prisma.executeWithRetry(
        async () => {
          return await (this.prisma as any).clinicSupplierManager.findFirst({
            where: {
              id: supplierId,
              tenant_id: tenantId,
            },
            select: {
              id: true,
              company_name: true,
              linked_supplier_manager_id: true, // ✅ Key field!
              phone_number: true, // For SMS notification on cancel
            },
          });
        }
      );

      const isManualSupplier =
        !clinicSupplierManager?.linked_supplier_manager_id;
      const initialStatus = isManualSupplier ? "supplier_confirmed" : "pending";

      this.logger.log(
        `📦 [Order Create] Supplier: ${clinicSupplierManager?.company_name}, ` +
          `Type: ${isManualSupplier ? "MANUAL" : "PLATFORM"}, ` +
          `Initial Status: ${initialStatus}`
      );

      // ✅ STEP 2: Create order with appropriate status
      let order: any;
      try {
        order = await this.prisma.$transaction(async (tx: any) => {
          const order = await (tx as any).order.create({
            data: {
              tenant_id: tenantId,
              order_no: orderNo,
              status: initialStatus, // ✅ Dynamic status
              supplier_id: supplierId !== "unknown" ? supplierId : null,
              total_amount: group.totalAmount,
              expected_delivery_date: dto.expectedDeliveryDate
                ? new Date(dto.expectedDeliveryDate)
                : null,
              confirmed_at: isManualSupplier ? new Date() : null, // ✅ Auto-confirm timestamp
              created_by: createdBy ?? null,
              memo: supplierMemo,
              clinic_manager_name: dto.clinicManagerName || null,
            },
          });

          // Order items yaratish (item_status: manual = confirmed, platform = pending)
          const initialItemStatus = isManualSupplier ? "confirmed" : "pending";
          await Promise.all(
            group.items.map((item: any) =>
              (tx as any).orderItem.create({
                data: {
                  tenant_id: tenantId,
                  order_id: order.id,
                  product_id: item.productId,
                  batch_id: item.batchId ?? null,
                  ordered_quantity: item.quantity,
                  confirmed_quantity: isManualSupplier ? item.quantity : null,
                  inbound_quantity: null,
                  pending_quantity: isManualSupplier ? item.quantity : null,
                  unit_price: item.unitPrice,
                  total_price: item.totalPrice,
                  tax_rate: item.taxRate ?? 0,
                  memo: item.memo ?? null,
                  item_status: initialItemStatus,
                },
              })
            )
          );

          return order;
        });
      } catch (transactionError: any) {
        // ✅ Telegram notification for transaction rollback
        if (
          process.env.NODE_ENV === "production" &&
          process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true"
        ) {
          await this.telegramService
            .sendSystemAlert(
              "Transaction Rollback",
              `Order creation transaction failed: ${transactionError?.message || "Unknown error"}\nOrder No: ${orderNo}\nTenant: ${tenantId}\nTotal Amount: ${group.totalAmount.toLocaleString()}원`
            )
            .catch((err) => {
              this.logger.error(
                `Failed to send Telegram alert: ${err.message}`
              );
            });
        }
        throw transactionError; // Re-throw to let caller handle
      }

      createdOrders.push(
        await this.orderRepository.findById(order.id, tenantId)
      );

      // ✅ STEP 3: Send to supplier-backend ONLY if platform supplier
      if (!isManualSupplier) {
        await this.sendOrderToSupplier(
          order,
          group,
          tenantId,
          createdBy,
          dto.clinicManagerName
        );
      } else {
        // ✅ NEW: Send SMS and Email to manual supplier
        this.logger.log(
          `📝 [Order Create] Manual supplier - sending SMS and Email notification`
        );
        await this.sendManualSupplierNotification(
          order,
          clinicSupplierManager,
          tenantId
        );
      }
    }

    // Draft'ni o'chirish (barcha order'lar yaratilgandan keyin)
    // Check if draft exists before deleting
    try {
      await this.prisma.executeWithRetry(async () => {
        const draft = await (this.prisma as any).orderDraft.findUnique({
          where: {
            tenant_id_session_id: {
              tenant_id: tenantId,
              session_id: sessionId,
            },
          },
        });

        if (draft) {
          await (this.prisma as any).orderDraft.delete({
            where: {
              tenant_id_session_id: {
                tenant_id: tenantId,
                session_id: sessionId,
              },
            },
          });
        }
      });
    } catch (error: any) {
      // Log error but don't fail the order creation
      this.logger.warn(`Failed to delete draft: ${error.message}`);
    }

    this.clearPendingInboundCache(tenantId);

    // Agar bitta order bo'lsa, uni qaytarish, aks holda array qaytarish
    return createdOrders.length === 1 ? createdOrders[0] : createdOrders;
  }

  /**
   * Order number yaratish
   * Format: YYMMDD + random 6 digits (000000YYMMDD + 6 random digits)
   */
  private async generateOrderNumber(tenantId: string): Promise<string> {
    const date = new Date();
    const year = String(date.getFullYear()).slice(-2); // YY
    const month = String(date.getMonth() + 1).padStart(2, "0"); // MM
    const day = String(date.getDate()).padStart(2, "0"); // DD
    const dateStr = `${year}${month}${day}`; // YYMMDD

    // Random 6 digits
    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();

    return `${dateStr}${randomDigits}`;
  }

  /**
   * Order'lar ro'yxatini olish (History uchun)
   */
  async getOrders(tenantId: string, search?: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const orders = await this.prisma.executeWithRetry(async () => {
      const where: any = {
        tenant_id: tenantId,
      };

      // Search filter
      if (search && search.trim()) {
        where.OR = [
          { order_no: { contains: search, mode: "insensitive" } },
          { supplier_id: { contains: search, mode: "insensitive" } },
          {
            items: {
              some: {
                product: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { brand: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        ];
      }

      return (this.prisma as any).order.findMany({
        where: {
          ...where,
          status: {
            not: "archived", // Exclude archived orders
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  productSupplier: {
                    include: {
                      clinicSupplierManager: {
                        include: {
                          linkedManager: true,
                        },
                      },
                    },
                  },
                },
              },
              batch: true,
            },
            orderBy: { created_at: "asc" },
          },
        },
        orderBy: { created_at: "desc" },
        take: 100, // Limit to 100 orders
      });
    });

    // ✅ Get list of original orders that have been split
    const splitOriginalOrderNos = new Set<string>();
    orders.forEach((order: any) => {
      // Check if this is a split order (ends with -R or -B)
      if (order.order_no && order.order_no.match(/-[RB]$/)) {
        // Extract original order number (remove -R or -B)
        const originalOrderNo = order.order_no.replace(/-[RB]$/, "");
        splitOriginalOrderNos.add(originalOrderNo);
      }
    });

    // Filter out rejected orders that haven't been confirmed AND split original orders
    const filteredOrders = orders.filter((order: any) => {
      // ✅ If this is an original order that has been split, exclude it
      if (splitOriginalOrderNos.has(order.order_no)) {
        return false;
      }

      // If order is rejected, only show it if at least one item has rejection_acknowledged
      // (meaning a clinic member has clicked "상황 확인")
      if (order.status === "rejected") {
        const hasAcknowledged = (order.items || []).some(
          (item: any) => item.item_status === "rejection_acknowledged"
        );
        if (!hasAcknowledged) return false;
      }
      return true;
    });

    // Format orders for frontend
    // First, collect all unique supplier IDs
    const supplierIds = new Set<string>();
    filteredOrders.forEach((order: any) => {
      if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
          if (item.product && item.product.productSupplier) {
            const productSupplier = item.product.productSupplier;
            const clinicSupplierManager = productSupplier.clinicSupplierManager;
            // Get supplier_id from linkedManager
            if (clinicSupplierManager?.linkedManager?.supplier?.id) {
              supplierIds.add(clinicSupplierManager.linkedManager.supplier.id);
            }
          }
        });
      }
      if (order.supplier_id) {
        supplierIds.add(order.supplier_id);
      }
    });

    // Fetch all suppliers with their managers
    const suppliersMap = new Map<string, any>();
    if (supplierIds.size > 0) {
      const suppliers = await (this.prisma as any).supplier.findMany({
        where: {
          id: {
            in: Array.from(supplierIds),
          },
        },
        select: {
          id: true,
          company_name: true,
          company_address: true,
          company_phone: true,
          company_email: true,
          business_number: true,
          managers: {
            where: {
              status: "ACTIVE",
            },
            take: 1,
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              name: true,
              phone_number: true,
              email1: true,
              position: true,
            },
          },
        },
      });

      suppliers.forEach((supplier: any) => {
        suppliersMap.set(supplier.id, supplier);
      });
    }

    // Collect all supplier IDs (from linkedManager) for batch lookup
    const supplierManagerIds = new Set<string>();
    // ✅ NEW: Collect clinic supplier IDs from order.supplier_id
    const clinicSupplierIds = new Set<string>();

    filteredOrders.forEach((order: any) => {
      // ✅ Add order.supplier_id (ClinicSupplierManager ID)
      if (order.supplier_id) {
        clinicSupplierIds.add(order.supplier_id);
      }

      if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
          if (item.product && item.product.productSupplier) {
            const productSupplier = item.product.productSupplier;
            const clinicSupplierManager = productSupplier.clinicSupplierManager;
            // Get linkedManager ID (SupplierManager)
            if (clinicSupplierManager?.linkedManager?.id) {
              supplierManagerIds.add(clinicSupplierManager.linkedManager.id);
            }
          }
        });
      }
    });

    // ✅ NEW: Batch fetch ClinicSupplierManagers
    const clinicSupplierManagersMap = new Map<string, any>();
    if (clinicSupplierIds.size > 0) {
      const clinicSuppliers = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinicSupplierManager.findMany({
          where: {
            id: {
              in: Array.from(clinicSupplierIds),
            },
            tenant_id: tenantId,
          },
          include: {
            linkedManager: {
              select: {
                id: true,
                name: true,
                position: true,
                supplier: {
                  select: {
                    id: true,
                    company_name: true,
                  },
                },
              },
            },
          },
        });
      });

      clinicSuppliers.forEach((csm: any) => {
        clinicSupplierManagersMap.set(csm.id, csm);
      });
    }

    // Fetch all SupplierManagers by their IDs
    const supplierManagersMap = new Map<string, any>();
    if (supplierManagerIds.size > 0) {
      const supplierManagers = await (
        this.prisma as any
      ).supplierManager.findMany({
        where: {
          id: {
            in: Array.from(supplierManagerIds),
          },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          phone_number: true,
          email1: true,
          position: true,
        },
      });

      supplierManagers.forEach((manager: any) => {
        supplierManagersMap.set(manager.id, manager);
      });
    }

    // Collect all created_by member IDs for batch lookup
    const memberIds = new Set<string>();
    filteredOrders.forEach((order: any) => {
      if (order.created_by && !order.clinic_manager_name) {
        memberIds.add(order.created_by);
      }
    });

    // Fetch all members in batch
    const membersMap = new Map<string, any>();
    if (memberIds.size > 0) {
      const members = await (this.prisma as any).member.findMany({
        where: {
          id: {
            in: Array.from(memberIds),
          },
          tenant_id: tenantId,
        },
        select: {
          id: true,
          full_name: true,
          member_id: true,
        },
      });

      members.forEach((member: any) => {
        membersMap.set(member.id, member);
      });
    }

    return filteredOrders.map((order: any) => {
      // Supplier va manager ma'lumotlarini topish
      let supplierName = order.supplier_id || "공급업체 없음";
      let managerName = "";
      let supplierDetails: any = null;

      // ✅ Get ClinicSupplierManager from order.supplier_id (batch fetched)
      let clinicSupplierManager: any = null;
      if (
        order.supplier_id &&
        clinicSupplierManagersMap.has(order.supplier_id)
      ) {
        clinicSupplierManager = clinicSupplierManagersMap.get(
          order.supplier_id
        );
      }

      // ✅ Check if platform supplier (linkedManager bor bo'lsa platform supplier)
      const isPlatformSupplier = !!clinicSupplierManager?.linkedManager?.id;

      // Get supplier ID from ClinicSupplierManager's linkedManager
      let supplierId: string | null = null;
      if (clinicSupplierManager?.linkedManager?.supplier?.id) {
        supplierId = clinicSupplierManager.linkedManager.supplier.id;
      }

      // Get supplier details from map
      if (supplierId && suppliersMap.has(supplierId)) {
        const supplier = suppliersMap.get(supplierId);
        supplierName = supplier.company_name || supplierName;

        supplierDetails = {
          id: supplier.id,
          companyName: supplier.company_name || "",
          companyAddress: supplier.company_address || null,
          companyPhone: supplier.company_phone || null,
          companyEmail: supplier.company_email || null,
          businessNumber: supplier.business_number || "",
          isPlatformSupplier: isPlatformSupplier, // ✅ Use pre-calculated value
        };

        // Manager ma'lumotlarini topish - Priority: linkedManager > first manager > clinic manager
        let manager: any = null;

        // Variant 1: Use linkedManager from ClinicSupplierManager
        if (clinicSupplierManager?.linkedManager) {
          const linkedManagerId = clinicSupplierManager.linkedManager.id;
          if (supplierManagersMap.has(linkedManagerId)) {
            manager = supplierManagersMap.get(linkedManagerId);
          }
        }

        // Variant 2: Fallback to first manager from supplier
        if (!manager && supplier.managers && supplier.managers.length > 0) {
          manager = supplier.managers[0];
        }

        // Variant 3: Use contact info from ClinicSupplierManager
        if (manager) {
          managerName = manager.name || "";
          supplierDetails.managerName = manager.name || "";
          supplierDetails.managerPhone = manager.phone_number || null;
          supplierDetails.managerEmail = manager.email1 || null;
          supplierDetails.position = manager.position || null;
        } else if (clinicSupplierManager) {
          managerName = clinicSupplierManager.name || "";
          supplierDetails.managerName = managerName;
          supplierDetails.managerPhone =
            clinicSupplierManager.phone_number || null;
          supplierDetails.managerEmail =
            clinicSupplierManager.email1 ||
            clinicSupplierManager.email2 ||
            null;
          supplierDetails.position = clinicSupplierManager.position || null;
        }
      } else {
        // Fallback: try to get from clinicSupplierManager
        if (clinicSupplierManager) {
          const fallbackSupplierId =
            clinicSupplierManager.linkedManager?.supplier?.id;

          // Try to find supplier by the fallback ID
          if (fallbackSupplierId && suppliersMap.has(fallbackSupplierId)) {
            const supplier = suppliersMap.get(fallbackSupplierId);
            supplierName = supplier.company_name || supplierName;
            supplierDetails = {
              id: supplier.id,
              companyName: supplier.company_name || "",
              companyAddress: supplier.company_address || null,
              companyPhone: supplier.company_phone || null,
              companyEmail: supplier.company_email || null,
              businessNumber: supplier.business_number || "",
              isPlatformSupplier: isPlatformSupplier, // ✅ Use pre-calculated value
            };

            // Manager ma'lumotlarini topish - Priority: linkedManager > first manager > clinic manager
            let manager: any = null;

            // Variant 1: Use linkedManager
            if (clinicSupplierManager.linkedManager) {
              const linkedManagerId = clinicSupplierManager.linkedManager.id;
              if (supplierManagersMap.has(linkedManagerId)) {
                manager = supplierManagersMap.get(linkedManagerId);
              }
            }

            // Variant 2: Fallback to first manager from supplier
            if (!manager && supplier.managers && supplier.managers.length > 0) {
              manager = supplier.managers[0];
            }

            // Variant 3: Use contact info from ClinicSupplierManager
            if (manager) {
              managerName = manager.name || "";
              supplierDetails.managerName = manager.name || "";
              supplierDetails.managerPhone = manager.phone_number || null;
              supplierDetails.managerEmail = manager.email1 || null;
              supplierDetails.position = manager.position || null;
            } else {
              managerName = clinicSupplierManager.name || "";
              supplierDetails.managerName = managerName;
              supplierDetails.managerPhone =
                clinicSupplierManager.phone_number || null;
              supplierDetails.managerEmail =
                clinicSupplierManager.email1 ||
                clinicSupplierManager.email2 ||
                null;
              supplierDetails.position = clinicSupplierManager.position || null;
            }
          } else {
            // Last resort: use clinicSupplierManager data
            // This could be platform supplier without Supplier entry, OR manual supplier
            supplierName = clinicSupplierManager.company_name || supplierName;
            managerName = clinicSupplierManager.name || "";

            // Create supplierDetails from clinicSupplierManager with all available fields
            supplierDetails = {
              companyName: supplierName,
              companyAddress: clinicSupplierManager.company_address || null,
              companyPhone: clinicSupplierManager.company_phone || null,
              companyEmail: clinicSupplierManager.company_email || null,
              managerName: managerName,
              managerPhone: clinicSupplierManager.phone_number || null,
              managerEmail:
                clinicSupplierManager.email1 ||
                clinicSupplierManager.email2 ||
                null,
              position: clinicSupplierManager.position || null,
              isPlatformSupplier: isPlatformSupplier, // ✅ Use pre-calculated value!
            };
          }
        }
      }

      // Items'ni formatlash (item_status for item-level status)
      const formattedItems = (order.items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product?.name || "제품명 없음",
        brand: item.product?.brand || "",
        batchId: item.batch_id,
        batchNo: item.batch?.batch_no || null,
        orderedQuantity: item.ordered_quantity,
        confirmedQuantity: item.confirmed_quantity ?? 0,
        inboundQuantity: item.inbound_quantity,
        pendingQuantity:
          (item.confirmed_quantity ?? 0) - (item.inbound_quantity || 0),
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        memo: item.memo || null,
        itemStatus: item.item_status || null,
        taxRate: item.tax_rate ?? 0,
      }));

      // 총금액 = klinika buyurtma paytidagi summa (ordered_quantity * unit_price)
      const totalAmount = formattedItems.reduce(
        (sum: number, item: any) =>
          sum + (item.orderedQuantity || 0) * (item.unitPrice || 0),
        0
      );

      // Get creator name - Use clinic_manager_name first
      let createdByName = "알 수 없음";
      if (order.clinic_manager_name) {
        createdByName = order.clinic_manager_name;
      } else if (order.created_by && membersMap.has(order.created_by)) {
        const member = membersMap.get(order.created_by);
        createdByName = member.full_name || member.member_id;
      }

      // 🔍 DEBUG - Log supplierDetails

      return {
        id: order.id,
        orderNo: order.order_no,
        supplierId: order.supplier_id,
        supplierName: supplierName,
        managerName: managerName,
        supplierDetails: supplierDetails, // To'liq supplier ma'lumotlari
        status: order.status,
        totalAmount, // ✅ Doim klinika order narxlari bo'yicha (supplier o'zgartirsa ham)
        memo: order.memo,
        createdAt: order.created_at,
        createdByName: createdByName, // 클리닉 담당자 이름
        items: formattedItems,
      };
    });
  }

  /**
   * Cancel order (Clinic initiates)
   */
  async cancelOrder(orderId: string, tenantId: string): Promise<any> {
    // Find order with supplier details
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findFirst({
        where: {
          id: orderId,
          tenant_id: tenantId,
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Check if order can be cancelled
    if (order.status === "completed" || order.status === "inbound_completed") {
      throw new BadRequestException(
        "완료된 주문은 취소할 수 없습니다. (Completed orders cannot be cancelled)"
      );
    }

    if (order.status === "cancelled") {
      throw new BadRequestException(
        "이미 취소된 주문입니다. (Order is already cancelled)"
      );
    }

    // Get supplier details for notification
    const clinicSupplierManager = await this.prisma.executeWithRetry(
      async () => {
        return await (this.prisma as any).clinicSupplierManager.findFirst({
          where: {
            id: order.supplier_id,
            tenant_id: tenantId,
          },
          select: {
            id: true,
            company_name: true,
            phone_number: true,
            linked_supplier_manager_id: true,
            linkedManager: {
              select: {
                id: true,
                supplier_tenant_id: true,
              },
            },
          },
        });
      }
    );

    const isPlatformSupplier =
      !!clinicSupplierManager?.linked_supplier_manager_id;

    // Update order status and all items to cancelled
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).order.update({
        where: { id: orderId },
        data: {
          status: "cancelled",
          updated_at: new Date(),
        },
      });
      await (this.prisma as any).orderItem.updateMany({
        where: { order_id: orderId },
        data: { item_status: "cancelled", updated_at: new Date() },
      });
    });

    // Notify supplier
    if (isPlatformSupplier) {
      // Platform supplier: Send webhook to supplier-backend to delete order
      await this.notifySupplierCancellation(order, clinicSupplierManager);
    } else {
      // Manual supplier: Send SMS notification
      await this.sendCancellationSMS(order, clinicSupplierManager);
    }

    // Invalidate cache
    this.clearPendingInboundCache(tenantId);

    return {
      success: true,
      orderId: order.id,
      orderNo: order.order_no,
      status: "cancelled",
    };
  }

  /**
   * Notify supplier-backend about order cancellation (Platform supplier)
   */
  private async notifySupplierCancellation(
    order: any,
    clinicSupplierManager: any
  ): Promise<void> {
    try {
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
        );
        return;
      }

      const supplierTenantId =
        clinicSupplierManager?.linkedManager?.supplier_tenant_id;

      if (!supplierTenantId) {
        this.logger.warn(
          `No supplier tenant ID found for order ${order.order_no}`
        );
        return;
      }

      const response = await fetch(`${supplierApiUrl}/supplier/orders/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          orderNo: order.order_no,
          supplierTenantId: supplierTenantId,
          cancelledAt: new Date().toISOString(),
          reason: "클리닉에서 주문을 취소했습니다", // Clinic cancelled the order
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to notify supplier about cancellation: ${response.status} ${errorText}`
        );
      } else {
      }

      // ✅ Also send SMS and Email to platform supplier manager
      await this.sendPlatformSupplierCancelNotification(
        order,
        clinicSupplierManager
      );
    } catch (error: any) {
      this.logger.error(
        `Error notifying supplier about cancellation: ${error.message}`
      );
    }
  }

  /**
   * Send SMS and Email to platform supplier about cancellation
   */
  private async sendPlatformSupplierCancelNotification(
    order: any,
    clinicSupplierManager: any
  ): Promise<void> {
    try {
      const linkedManager = clinicSupplierManager?.linkedManager;
      if (!linkedManager) {
        return;
      }

      // Get supplier manager details
      const supplierManager = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).supplierManager.findFirst({
          where: { id: linkedManager.id },
          select: {
            phone_number: true,
            email1: true,
            name: true,
          },
        });
      });

      if (!supplierManager) {
        return;
      }

      const phoneNumber = supplierManager.phone_number;
      const email = supplierManager.email1;

      // Get clinic name
      const clinic = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinic.findFirst({
          where: { tenant_id: order.tenant_id },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "병원";

      // SMS notification
      if (phoneNumber) {
        const message = `[주문 취소]\n${clinicName}에서 주문번호 ${
          order.order_no
        }를 취소했습니다.\n금액: ${order.total_amount?.toLocaleString()}원\n취소일시: ${new Date().toLocaleString(
          "ko-KR"
        )}`;

        await this.messageService.sendSMS(phoneNumber, message);
      }

      // Email notification
      if (email) {
        const emailSubject = `[주문 취소] ${clinicName} - 주문번호 ${order.order_no}`;
        const emailBody = `
          <h2>주문이 취소되었습니다</h2>
          <p><strong>클리닉:</strong> ${clinicName}</p>
          <p><strong>주문번호:</strong> ${order.order_no}</p>
          <p><strong>주문금액:</strong> ${order.total_amount?.toLocaleString()}원</p>
          <p><strong>취소일시:</strong> ${new Date().toLocaleString(
            "ko-KR"
          )}</p>
          <p style="color: red;">※ 이 주문은 클리닉에서 취소되었습니다.</p>
        `;

        await this.emailService.sendEmail(email, emailSubject, emailBody);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send platform supplier cancel notification: ${error.message}`
      );
    }
  }

  /**
   * Send SMS and Email notification to manual supplier about cancellation
   */
  private async sendCancellationSMS(
    order: any,
    clinicSupplierManager: any
  ): Promise<void> {
    try {
      const phoneNumber = clinicSupplierManager?.phone_number;
      const email =
        clinicSupplierManager?.company_email ||
        clinicSupplierManager?.email1 ||
        clinicSupplierManager?.email2;

      // Get clinic name
      const clinic = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinic.findFirst({
          where: { tenant_id: order.tenant_id },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "병원";

      // SMS notification
      if (phoneNumber) {
        const message = `[주문 취소]\n${clinicName}에서 주문번호 ${
          order.order_no
        }를 취소했습니다.\n금액: ${order.total_amount?.toLocaleString()}원\n취소일시: ${new Date().toLocaleString(
          "ko-KR"
        )}`;

        await this.messageService.sendSMS(phoneNumber, message);
      }

      // Email notification
      if (email) {
        const emailSubject = `[주문 취소] ${clinicName} - 주문번호 ${order.order_no}`;
        const emailBody = `
          <h2>주문이 취소되었습니다</h2>
          <p><strong>클리닉:</strong> ${clinicName}</p>
          <p><strong>주문번호:</strong> ${order.order_no}</p>
          <p><strong>주문금액:</strong> ${order.total_amount?.toLocaleString()}원</p>
          <p><strong>취소일시:</strong> ${new Date().toLocaleString(
            "ko-KR"
          )}</p>
          <p style="color: red;">※ 이 주문은 클리닉에서 취소되었습니다.</p>
        `;

        await this.emailService.sendEmail(email, emailSubject, emailBody);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send cancellation SMS/Email: ${error.message}`
      );
    }
  }

  /**
   * Send SMS and Email notification to manual supplier about new order
   */
  private async sendManualSupplierNotification(
    order: any,
    clinicSupplierManager: any,
    tenantId: string
  ): Promise<void> {
    try {
      const phoneNumber = clinicSupplierManager?.phone_number;
      const email =
        clinicSupplierManager?.company_email ||
        clinicSupplierManager?.email1 ||
        clinicSupplierManager?.email2;

      // Get clinic name
      const clinic = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinic.findFirst({
          where: { tenant_id: tenantId },
          select: { name: true },
        });
      });

      const clinicName = clinic?.name || "병원";

      // SMS notification
      if (phoneNumber) {
        const smsMessage = `[새 주문]\n${clinicName}에서 주문이 도착했습니다.\n주문번호: ${
          order.order_no
        }\n금액: ${order.total_amount?.toLocaleString()}원`;

        await this.messageService.sendSMS(phoneNumber, smsMessage);
      }

      // Email notification
      if (email) {
        const emailSubject = `[새 주문] ${clinicName} - 주문번호 ${order.order_no}`;
        const emailBody = `
          <h2>새로운 주문이 도착했습니다</h2>
          <p><strong>클리닉:</strong> ${clinicName}</p>
          <p><strong>주문번호:</strong> ${order.order_no}</p>
          <p><strong>주문금액:</strong> ${order.total_amount?.toLocaleString()}원</p>
          <p><strong>주문일시:</strong> ${new Date().toLocaleString(
            "ko-KR"
          )}</p>
        `;

        await this.emailService.sendEmail(email, emailSubject, emailBody);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to send manual supplier notification: ${error.message}`
      );
    }
  }

  /**
   * Draft response formatlash
   */
  private formatDraftResponse(draft: any, highlightItemIds?: string[]): any {
    const items = Array.isArray(draft.items) ? draft.items : [];

    // Supplier bo'yicha grouping (structure bilan)
    const supplierGroups: Record<string, any> = {};
    let totalAmount = 0;

    // Item ID mapping (productId va batchId bo'yicha)
    const itemIdMap: Record<string, any> = {};

    for (const item of items) {
      const supplierId = item.supplierId || "unknown";

      // Item ID mapping
      const itemId = item.id;
      itemIdMap[itemId] = {
        productId: item.productId,
        batchId: item.batchId || null,
        supplierId: supplierId,
        itemId: itemId,
      };

      // Highlight flag (yangi qo'shilgan yoki highlightItemIds'da bo'lsa)
      const isHighlighted =
        item.isNewlyAdded ||
        (highlightItemIds && highlightItemIds.includes(itemId));

      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          supplierId: supplierId,
          items: [],
          totalAmount: 0,
        };
      }

      // Item'ga highlight flag qo'shish
      const itemWithHighlight = {
        ...item,
        isHighlighted: isHighlighted,
      };

      supplierGroups[supplierId].items.push(itemWithHighlight);
      supplierGroups[supplierId].totalAmount += item.totalPrice || 0;
      totalAmount += item.totalPrice || 0;
    }

    return {
      id: draft.id,
      sessionId: draft.session_id,
      items: items.map((item: any) => ({
        ...item,
        isHighlighted:
          item.isNewlyAdded ||
          (highlightItemIds && highlightItemIds.includes(item.id)),
      })),
      totalAmount: totalAmount,
      groupedBySupplier: Object.values(supplierGroups).map((group: any) => ({
        ...group,
        items: group.items.map((item: any) => ({
          ...item,
          // Structure bilan ma'lumotlar
          productId: item.productId,
          batchId: item.batchId || null,
          supplierId: group.supplierId,
          itemId: item.id,
        })),
      })),
      itemIdMap: itemIdMap, // Mapping for easy lookup
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
      expiresAt: draft.expires_at,
    };
  }

  /**
   * Send order to supplier-backend (SupplierOrder table)
   */
  private async sendOrderToSupplier(
    order: any,
    group: any,
    tenantId: string,
    createdBy?: string,
    clinicManagerName?: string
  ): Promise<void> {
    try {
      // Get ClinicSupplierManager and linked Supplier info
      // Note: order.supplier_id now contains clinic_supplier_manager_id
      const clinicSupplierManager = await (
        this.prisma as any
      ).clinicSupplierManager.findUnique({
        where: { id: order.supplier_id },
        include: {
          linkedManager: {
            select: {
              id: true,
              name: true,
              position: true,
              phone_number: true,
              supplier: {
                select: {
                  id: true,
                  tenant_id: true,
                  company_name: true,
                },
              },
            },
          },
        },
      });

      // Get platform supplier (if linked)
      const supplier = clinicSupplierManager.linkedManager?.supplier;

      // Get ProductSupplier to find clinic_supplier_manager_id
      // IMPORTANT: Check ALL items to find the correct clinic_supplier_manager_id
      // If multiple products have different clinic_supplier_manager_id, use the most common one
      let supplierManager: any = null;
      let supplierPhoneNumber: string | null = null;
      let supplierProductRecord: any = null;

      if (group.items && group.items.length > 0) {
        // Collect all SupplierProducts for all items in this order
        // IMPORTANT: Use item.supplierId (from draft) instead of order.supplier_id
        const supplierManagerIdCounts = new Map<string, number>();
        const supplierProductsByManagerId = new Map<string, any>();

        for (const item of group.items) {
          if (item.productId) {
            const productSupplier = await (
              this.prisma as any
            ).productSupplier.findFirst({
              where: {
                product_id: item.productId,
                tenant_id: tenantId,
              },
              include: {
                clinicSupplierManager: {
                  include: {
                    linkedManager: {
                      select: {
                        id: true,
                        name: true,
                        phone_number: true,
                        email1: true,
                        position: true,
                        supplier: {
                          select: {
                            id: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            });

            if (productSupplier) {
              const clinicSupplierManager =
                productSupplier.clinicSupplierManager;
              const linkedManager = clinicSupplierManager?.linkedManager;

              // Use first product as default
              if (!supplierProductRecord) {
                supplierProductRecord = productSupplier;
              }

              // Count clinic_supplier_manager_id occurrences
              if (productSupplier.clinic_supplier_manager_id) {
                const count =
                  supplierManagerIdCounts.get(
                    productSupplier.clinic_supplier_manager_id
                  ) || 0;
                supplierManagerIdCounts.set(
                  productSupplier.clinic_supplier_manager_id,
                  count + 1
                );
                supplierProductsByManagerId.set(
                  productSupplier.clinic_supplier_manager_id,
                  productSupplier
                );
              } else {
              }
            } else {
            }
          }
        }

        // Find the most common clinic_supplier_manager_id (or use the first one if all are unique)
        let mostCommonManagerId: string | null = null;
        let maxCount = 0;
        for (const [managerId, count] of supplierManagerIdCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            mostCommonManagerId = managerId;
          }
        }

        // Variant 1: If clinic_supplier_manager_id exists and has linkedManager
        if (mostCommonManagerId) {
          const productSupplier =
            supplierProductsByManagerId.get(mostCommonManagerId);
          const linkedManager =
            productSupplier?.clinicSupplierManager?.linkedManager;

          if (linkedManager) {
            supplierManager = linkedManager;

            supplierProductRecord = productSupplier;
          } else {
          }
        } else {
        }

        // Variant 2: If no linkedManager, try to find by contact_phone from ClinicSupplierManager
        // (supplier might have registered on platform after product was created)
        if (
          !supplierManager &&
          supplierProductRecord?.clinicSupplierManager?.phone_number
        ) {
          supplierManager = await this.prisma.supplierManager.findFirst({
            where: {
              phone_number:
                supplierProductRecord.clinicSupplierManager.phone_number,
              status: "ACTIVE",
            },
          });
        }

        // Variant 3: Use contact_phone from ClinicSupplierManager for SMS fallback
        if (!supplierManager) {
          // No SupplierManager found, use contact_phone for SMS
          supplierPhoneNumber =
            supplierProductRecord?.clinicSupplierManager?.phone_number;
          if (supplierPhoneNumber) {
          }
        }
      }

      // Variant 4: Use linkedManager directly from clinicSupplierManager if available
      if (!supplierManager && clinicSupplierManager.linkedManager) {
        supplierManager = clinicSupplierManager.linkedManager;
      }

      // Variant 5: Fallback - first created SupplierManager (legacy behavior)
      if (!supplierManager && supplier) {
        // Try to get SupplierManager by supplier_tenant_id
        const fallbackManager = await this.prisma.supplierManager.findFirst({
          where: {
            supplier_tenant_id: supplier.tenant_id,
            status: "ACTIVE",
          },
          orderBy: {
            created_at: "asc",
          },
        });
      }

      // Get supplier with company_email for email fallback
      let supplierWithEmail: any = null;
      if (supplier && supplier.tenant_id) {
        supplierWithEmail = await this.prisma.supplier.findUnique({
          where: { tenant_id: supplier.tenant_id },
          select: { company_email: true },
        });
      }

      // Variant 6: Use manual contact info from ClinicSupplierManager
      if (!supplierManager && !supplierPhoneNumber) {
        supplierPhoneNumber = clinicSupplierManager.phone_number;
        if (supplierPhoneNumber) {
        } else {
        }
      }

      // Get clinic info

      const clinic = await this.prisma.clinic.findFirst({
        where: { tenant_id: tenantId },
      });

      // Get member info (created_by) - also used for clinic name fallback
      // Priority: 1. clinicManagerName parameter, 2. order.clinic_manager_name, 3. lookup from member
      let finalClinicManagerName =
        clinicManagerName || order.clinic_manager_name || createdBy || "담당자";
      let clinicNameFallback = null;

      // Only lookup member if clinic_manager_name is not set
      if (!clinicManagerName && !order.clinic_manager_name && createdBy) {
        const member = await this.prisma.member.findFirst({
          where: {
            id: createdBy,
            tenant_id: tenantId,
          },
        });
        if (member) {
          finalClinicManagerName = member.full_name || member.member_id;
          clinicNameFallback = member.clinic_name; // Fallback clinic name from member
        }
      } else {
        finalClinicManagerName =
          clinicManagerName ||
          order.clinic_manager_name ||
          finalClinicManagerName;
      }

      // Use clinic.name or fallback to member.clinic_name
      const finalClinicName =
        clinic?.name || clinicNameFallback || "알 수 없음";

      // Get product details for items with ProductSupplier information
      const itemsWithDetails = await Promise.all(
        group.items.map(async (item: any) => {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
            select: { name: true, brand: true, unit: true },
          });

          let batchNo = null;
          if (item.batchId) {
            const batch = await this.prisma.batch.findUnique({
              where: { id: item.batchId },
              select: { batch_no: true },
            });
            batchNo = batch?.batch_no || null;
          }

          // Get ProductSupplier for this product
          const productSupplier = await this.prisma.productSupplier.findUnique({
            where: {
              tenant_id_product_id: {
                tenant_id: tenantId,
                product_id: item.productId,
              },
            },
            include: {
              clinicSupplierManager: {
                include: {
                  linkedManager: {
                    include: {
                      supplier: {
                        select: {
                          tenant_id: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          return {
            productId: item.productId,
            productName: product?.name || "제품",
            brand: product?.brand || "",
            unit: product?.unit || null,
            batchNo: batchNo,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            memo: item.memo || null,
            productSupplier: productSupplier, // ProductSupplier ma'lumotlari
          };
        })
      );

      // Prepare order data for supplier-backend
      // supplierManagerId null bo'lishi mumkin (agar supplier platformadan ro'yxatdan o'tmagan bo'lsa)
      // Only send to supplier-backend if linked to platform
      if (!supplier || !supplier.tenant_id) {
        // Send SMS to manual supplier (yangi format bilan)
        const manualPhoneNumber = clinicSupplierManager.phone_number;
        if (manualPhoneNumber) {
          try {
            // Products ma'lumotlarini formatlash
            const products = itemsWithDetails.map((item: any) => ({
              productName: item.productName || "제품",
              brand: item.brand || "",
              quantity: item.quantity || 0,
            }));

            // Total quantity'ni hisoblash (barcha itemlarning quantity'sini yig'ish)
            const totalQuantity = itemsWithDetails.reduce(
              (sum: number, item: any) => {
                return sum + (item.quantity || 0);
              },
              0
            );

            // Send SMS via MessageService (yangi format bilan)
            const smsSent = await this.messageService.sendOrderNotification(
              manualPhoneNumber,
              finalClinicName,
              order.order_no,
              order.total_amount,
              totalQuantity,
              finalClinicManagerName,
              products
            );
          } catch (smsError: any) {
            this.logger.error(
              `Failed to send SMS to manual supplier: ${smsError.message}`
            );
          }
        }

        // ✅ MANUAL SUPPLIER: Send EMAIL notification
        try {
          const supplierEmail =
            clinicSupplierManager?.company_email ||
            clinicSupplierManager?.email1 ||
            clinicSupplierManager?.email2 ||
            null;

          if (supplierEmail) {
            const products = itemsWithDetails.map((item: any) => ({
              productName: item.productName || "제품",
              brand: item.brand || "",
              quantity: item.quantity || 0,
            }));

            const totalQuantity = itemsWithDetails.reduce(
              (sum: number, item: any) => sum + (item.quantity || 0),
              0
            );

            const templateId = parseInt(
              process.env.BREVO_ORDER_NOTIFICATION_TEMPLATE_ID || "1",
              10
            );

            const emailSent =
              await this.emailService.sendOrderNotificationEmailWithTemplate(
                supplierEmail,
                templateId, // ✅ Brevo template ID
                finalClinicName,
                order.order_no,
                order.total_amount,
                totalQuantity,
                finalClinicManagerName,
                products
              );
          } else {
            this.logger.warn(
              `No email address found for manual supplier ${order.supplier_id}`
            );
          }
        } catch (emailError: any) {
          this.logger.error(
            `Failed to send email to manual supplier: ${emailError?.message}`
          );
        }

        // ✅ Manual supplier - SMS and EMAIL sent, return here
        return;
      }

      const supplierOrderData = {
        orderNo: order.order_no,
        supplierTenantId: supplier.tenant_id,
        supplierManagerId: supplierManager?.id || null, // From linkedManager or contact_phone match
        clinicTenantId: tenantId,
        clinicName: finalClinicName,
        clinicManagerName: finalClinicManagerName,
        totalAmount: order.total_amount,
        memo: order.memo,
        items: itemsWithDetails,
      };

      // Prepare supplier phone number for SMS (even if API fails, we can still send SMS)
      // Priority: supplierManager.phone_number > supplierPhoneNumber > clinicSupplierManager.phone_number > supplier.company_phone
      const finalSupplierPhoneNumber =
        supplierManager?.phone_number ||
        supplierPhoneNumber ||
        clinicSupplierManager.phone_number ||
        supplier?.company_phone;

      // Call supplier-backend API
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      let supplierBackendSuccess = false;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier-backend API call"
        );
      } else {
        let timeoutId: NodeJS.Timeout | null = null;
        try {
          // Create AbortController for timeout
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

          const response = await fetch(`${supplierApiUrl}/supplier/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify(supplierOrderData),
            signal: controller.signal,
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!response.ok) {
            const errorText = await response
              .text()
              .catch(() => "Unknown error");

            // ✅ ERROR LOG QO'SHISH
            this.logger.error(
              `❌ Supplier backend API error: ${response.status} ${response.statusText}`
            );
            this.logger.error(`   Error response: ${errorText}`);
            this.logger.error(
              `   Order data: ${JSON.stringify({
                orderNo: supplierOrderData.orderNo,
                supplierTenantId: supplierOrderData.supplierTenantId,
                itemsCount: supplierOrderData.items.length,
              })}`
            );
          } else {
            const result: any = await response.json();

            // ✅ SUCCESS LOG QO'SHISH
            this.logger.log(
              `✅ Order sent to supplier backend: ${supplierOrderData.orderNo}, Items: ${result.items?.length || 0}`
            );

            supplierBackendSuccess = true;
          }
        } catch (fetchError: any) {
          // Clear timeout if it wasn't already cleared
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // Network error (connection refused, timeout, etc.)
          const errorMessage = fetchError?.message || String(fetchError);
          const errorName = fetchError?.name || "";

          if (
            errorName === "AbortError" ||
            errorMessage.includes("aborted") ||
            errorMessage.includes("timeout")
          ) {
            this.logger.warn(
              `⏱️ Supplier backend API timeout for order ${supplierOrderData.orderNo}`
            );
          } else if (
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ENOTFOUND")
          ) {
            this.logger.warn(
              `🔌 Supplier backend API connection failed for order ${supplierOrderData.orderNo}: ${errorMessage}`
            );
          } else {
            this.logger.error(
              `❌ Supplier backend API error for order ${supplierOrderData.orderNo}: ${errorMessage}`,
              fetchError?.stack
            );
          }
          // Continue - we'll still try to send SMS even if API call failed
        }
      }

      // Send SMS notification grouped by supplier manager
      // Product'larni supplier manager bo'yicha guruhlab, har bir manager'ga bitta SMS yuborish
      try {
        // Product'larni supplier manager bo'yicha guruhlash
        const itemsByManager = new Map<
          string,
          {
            managerId: string | null;
            supplierTenantId: string | null;
            phoneNumber: string | null;
            phoneSource: string;
            items: Array<{
              productName: string;
              brand: string;
              quantity: number;
              totalPrice: number;
            }>;
            isPlatformSupplier: boolean;
          }
        >();

        // Har bir product'ni guruhlash
        for (const item of itemsWithDetails) {
          const productSupplier = item.productSupplier;

          if (!productSupplier) {
            continue;
          }

          const clinicSupplierManager = productSupplier.clinicSupplierManager;
          if (!clinicSupplierManager) {
            continue;
          }

          // ProductSupplier → ClinicSupplierManager → linkedManager (SupplierManager)
          const linkedManager = clinicSupplierManager.linkedManager;
          const supplier = linkedManager?.supplier;

          // Telefon raqamini topish (priority: SupplierManager.phone_number > ClinicSupplierManager.phone_number)
          let phoneNumber: string | null = null;
          let phoneSource = "";
          let managerId: string | null = null;
          let supplierTenantId: string | null = null;
          let isPlatformSupplier = false;

          if (linkedManager?.phone_number) {
            phoneNumber = linkedManager.phone_number;
            phoneSource = "SupplierManager";
            managerId = linkedManager.id;
            supplierTenantId =
              supplier?.tenant_id || linkedManager.supplier_tenant_id || null;
            isPlatformSupplier = true;
          } else if (clinicSupplierManager.phone_number) {
            phoneNumber = clinicSupplierManager.phone_number;
            phoneSource = "ClinicSupplierManager";
            isPlatformSupplier = false;
          }

          if (!phoneNumber) {
            this.logger.warn(
              `No phone number found for product ${item.productId} (supplier: ${
                clinicSupplierManager.company_name || "unknown"
              }), skipping SMS`
            );
            continue;
          }

          // Guruhlash uchun key yaratish
          // Platform supplier bo'lsa: supplierTenantId + managerId
          // Manual supplier bo'lsa: phoneNumber
          const groupKey = isPlatformSupplier
            ? `${supplierTenantId}_${managerId || "all"}`
            : `manual_${phoneNumber}`;

          if (!itemsByManager.has(groupKey)) {
            itemsByManager.set(groupKey, {
              managerId,
              supplierTenantId,
              phoneNumber,
              phoneSource,
              items: [],
              isPlatformSupplier,
            });
          }

          itemsByManager.get(groupKey)!.items.push({
            productName: item.productName,
            brand: item.brand || "",
            quantity: item.quantity,
            totalPrice: item.totalPrice,
          });
        }

        // Har bir manager'ga bitta SMS yuborish (barcha product'lar bilan)
        const smsPromises = Array.from(itemsByManager.values()).map(
          async (group) => {
            try {
              // Agar platform supplier bo'lsa, SMS yuborish
              if (group.isPlatformSupplier && group.supplierTenantId) {
                // ✅ Agar specific managerId bo'lsa — FAQAT shu managerni ishlatish (receive_sms flag'dan qat'iy nazar)
                if (group.managerId && group.phoneNumber) {
                  const totalQuantity = group.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0
                  );
                  const totalAmount = group.items.reduce(
                    (sum, item) => sum + item.totalPrice,
                    0
                  );
                  const products = group.items.map((item) => ({
                    productName: item.productName,
                    brand: item.brand,
                    quantity: item.quantity,
                  }));
                  await this.messageService.sendOrderNotification(
                    group.phoneNumber,
                    finalClinicName,
                    order.order_no,
                    totalAmount,
                    totalQuantity,
                    clinicManagerName,
                    products
                  );
                } else {
                // managerId yo'q bo'lsa — receive_sms: true bo'lgan barcha active managerlarga
                const allManagers = await this.prisma.supplierManager.findMany({
                  where: {
                    supplier_tenant_id: group.supplierTenantId,
                    status: "ACTIVE",
                    receive_sms: true,
                  },
                  select: {
                    id: true,
                    name: true,
                    phone_number: true,
                  },
                });

                if (allManagers.length > 0) {
                  const managersToNotify = allManagers;

                  const managerSmsPromises = managersToNotify
                    .filter((manager) => manager.phone_number)
                    .map(async (manager) => {
                      try {
                        // Barcha product'lar uchun umumiy miqdor va narx
                        const totalQuantity = group.items.reduce(
                          (sum, item) => sum + item.quantity,
                          0
                        );
                        const totalAmount = group.items.reduce(
                          (sum, item) => sum + item.totalPrice,
                          0
                        );

                        // Barcha product'lar ro'yxati
                        const products = group.items.map((item) => ({
                          productName: item.productName,
                          brand: item.brand,
                          quantity: item.quantity,
                        }));

                        await this.messageService.sendOrderNotification(
                          manager.phone_number,
                          finalClinicName,
                          order.order_no,
                          totalAmount,
                          totalQuantity,
                          clinicManagerName,
                          products
                        );
                      } catch (smsError: any) {
                        this.logger.error(
                          `❌ Failed to send SMS to SupplierManager ${
                            manager.name
                          } (${manager.phone_number}): ${
                            smsError?.message || "Unknown error"
                          }`
                        );
                      }
                    });

                  await Promise.all(managerSmsPromises);
                } else {
                  // Fallback: Agar ACTIVE manager bo'lmasa, ClinicSupplierManager telefoniga SMS
                  if (group.phoneNumber) {
                    const totalQuantity = group.items.reduce(
                      (sum, item) => sum + item.quantity,
                      0
                    );
                    const totalAmount = group.items.reduce(
                      (sum, item) => sum + item.totalPrice,
                      0
                    );
                    const products = group.items.map((item) => ({
                      productName: item.productName,
                      brand: item.brand,
                      quantity: item.quantity,
                    }));

                    await this.messageService.sendOrderNotification(
                      group.phoneNumber,
                      finalClinicName,
                      order.order_no,
                      totalAmount,
                      totalQuantity,
                      clinicManagerName,
                      products
                    );
                  }
                }
                } // closes: else { // managerId yo'q
              } else {
                // Manual supplier: ClinicSupplierManager telefoniga SMS
                if (group.phoneNumber) {
                  const totalQuantity = group.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0
                  );
                  const totalAmount = group.items.reduce(
                    (sum, item) => sum + item.totalPrice,
                    0
                  );
                  const products = group.items.map((item) => ({
                    productName: item.productName,
                    brand: item.brand,
                    quantity: item.quantity,
                  }));

                  await this.messageService.sendOrderNotification(
                    group.phoneNumber,
                    finalClinicName,
                    order.order_no,
                    totalAmount,
                    totalQuantity,
                    clinicManagerName,
                    products
                  );
                }
              }
            } catch (error: any) {
              this.logger.error(
                `Error sending SMS for ${group.items.length} product(s): ${
                  error?.message || "Unknown error"
                }`
              );
            }
          }
        );

        await Promise.all(smsPromises);
      } catch (error: any) {
        // Log error but don't fail the order creation
      }

      // Send Email notification to supplier manager
      // Email yuborish supplier-backend API muvaffaqiyatli bo'lgan yoki bo'lmaganidan qat'iy nazar
      // (chunki email address mavjud bo'lsa, email yuborish kerak)
      try {
        // 🔍 DEBUG: Check what data we have

        // Get supplier email (priority: supplierManager.email1 > supplierManager.email2 > supplier.company_email > clinicSupplierManager.company_email > clinicSupplierManager.email1 > clinicSupplierManager.email2)
        const supplierEmail =
          supplierManager?.email1 ||
          supplierManager?.email2 ||
          supplierWithEmail?.company_email ||
          clinicSupplierManager?.company_email ||
          clinicSupplierManager?.email1 ||
          clinicSupplierManager?.email2 ||
          null;

        if (supplierEmail) {
          // Products ma'lumotlarini formatlash (quantity bilan)
          const products = itemsWithDetails.map((item: any) => ({
            productName: item.productName || "제품",
            brand: item.brand || "",
            quantity: item.quantity || 0,
          }));

          // Total quantity'ni hisoblash (barcha itemlarning quantity'sini yig'ish)
          const totalQuantity = itemsWithDetails.reduce(
            (sum: number, item: any) => {
              return sum + (item.quantity || 0);
            },
            0
          );

          const templateId = parseInt(
            process.env.BREVO_ORDER_NOTIFICATION_TEMPLATE_ID || "1",
            10
          );

          const emailSent =
            await this.emailService.sendOrderNotificationEmailWithTemplate(
              supplierEmail,
              templateId, // ✅ Brevo template ID
              finalClinicName,
              order.order_no,
              order.total_amount,
              totalQuantity,
              clinicManagerName,
              products
            );

          const emailSource = supplierManager?.email1
            ? "SupplierManager.email1"
            : supplierManager?.email2
              ? "SupplierManager.email2"
              : supplierWithEmail?.company_email
                ? "Supplier.company_email"
                : clinicSupplierManager?.company_email
                  ? "ClinicSupplierManager.company_email"
                  : clinicSupplierManager?.email1
                    ? "ClinicSupplierManager.email1"
                    : "ClinicSupplierManager.email2";
        } else {
          this.logger.warn(
            `No email address found for supplier ${order.supplier_id} (checked SupplierManager.email1, SupplierManager.email2, Supplier.company_email, ClinicSupplierManager.company_email, ClinicSupplierManager.email1, ClinicSupplierManager.email2), skipping email notification`
          );
        }
      } catch (emailError: any) {
        // Log error but don't fail the order creation
        this.logger.error(
          `Failed to send email notification to supplier: ${
            emailError?.message || "Unknown error"
          }`
        );

        // ✅ Telegram notification for high-value orders (>1M won)
        if (
          process.env.NODE_ENV === "production" &&
          process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true" &&
          order.total_amount > 1000000
        ) {
          await this.telegramService
            .sendSystemAlert(
              "High-Value Order Email Failed",
              `Order ${order.order_no} (${order.total_amount.toLocaleString()}원) email notification failed: ${emailError?.message || "Unknown error"}`
            )
            .catch((err) => {
              this.logger.error(
                `Failed to send Telegram alert: ${err.message}`
              );
            });
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending order to supplier-backend: ${error.message}`,
        error.stack
      );

      if (
        process.env.NODE_ENV === "production" &&
        process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true"
      ) {
        await this.telegramService.sendErrorAlert(error, {
          url: `/orders/${order.id}`,
          method: "POST",
          tenantId: tenantId,
        });
      }
      // Don't throw - order already created in clinic DB, supplier notification is optional
    }
  }

  /**
   * Update order from supplier confirmation callback
   */
  async updateOrderFromSupplier(dto: any) {
    const {
      orderNo,
      clinicTenantId,
      status,
      confirmedAt,
      adjustments,
      updatedItems,
      totalAmount,
      rejectionReasons,
    } = dto;

    if (!orderNo || !clinicTenantId) {
      throw new BadRequestException(
        "Order number and clinic tenant ID are required"
      );
    }

    // Find order by order_no with items
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findFirst({
        where: {
          order_no: orderNo,
          tenant_id: clinicTenantId,
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                },
              },
            },
          },
        },
      });
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNo} not found`);
    }

    // Update order with supplier confirmation data
    // Store adjustments as object with adjustments array for consistency
    const adjustmentsData = {
      adjustments: adjustments || [],
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.executeWithRetry(async () => {
      // If some items are already inbounded, keep pending_inbound status —
      // don't downgrade an in-progress order to rejected/supplier_confirmed
      const hasInboundedItems = order.items.some(
        (item: any) => item.item_status === "inbounded"
      );
      const newOrderStatus =
        hasInboundedItems && order.status === "pending_inbound"
          ? "pending_inbound"
          : status;

      await (this.prisma as any).order.update({
        where: { id: order.id },
        data: {
          status: newOrderStatus,
          supplier_adjustments: adjustmentsData,
          confirmed_at: confirmedAt ? new Date(confirmedAt) : new Date(),
          updated_at: new Date(),
        },
      });

      // ✅ YANGI: Update OrderItem'lar quantity va price'ni adjustments dan yangilash
      if (
        status === "supplier_confirmed" &&
        adjustments &&
        adjustments.length > 0
      ) {
        this.logger.log(
          `📦 Processing ${adjustments.length} adjustments for order ${orderNo}`
        );

        // ✅ Debug: updatedItems va order.items ni ko'rsatish
        if (updatedItems && updatedItems.length > 0) {
          this.logger.debug(
            `   UpdatedItems from supplier: ${updatedItems.map((item: any) => `itemId=${item.itemId}, productName=${item.productName}, brand=${item.brand}, unitPrice=${item.unitPrice}`).join("; ")}`
          );
        }
        this.logger.debug(
          `   OrderItems in clinic: ${order.items.map((item: any) => `id=${item.id}, productName=${item.product?.name}, brand=${item.product?.brand}, unitPrice=${item.unit_price}`).join("; ")}`
        );

        for (const adjustment of adjustments) {
          this.logger.debug(
            `   Adjustment: itemId=${adjustment.itemId}, productId=${adjustment.productId}, actualQuantity=${adjustment.actualQuantity}, actualPrice=${adjustment.actualPrice}`
          );

          // ✅ Muammo: adjustment.itemId supplier side'dagi SupplierOrderItem.id bo'lishi mumkin
          // ✅ Yechim: updatedItems dan foydalanish - supplier side'dagi item'ni topish, keyin uning ma'lumotlari orqali clinic side'dagi OrderItem ni topish
          let orderItem = null;

          // ✅ 1. Avval itemId orqali topish (agar clinic side'dagi OrderItem.id bo'lsa)
          orderItem = order.items.find(
            (item: any) => item.id === adjustment.itemId
          );

          // ✅ 2. Agar topilmasa, updatedItems dan supplier side'dagi item'ni topish
          if (!orderItem && updatedItems) {
            const supplierItem = updatedItems.find(
              (item: any) => item.itemId === adjustment.itemId
            );

            if (supplierItem) {
              // ✅ Supplier side'dagi item ma'lumotlari orqali clinic side'dagi OrderItem ni topish
              // productName, brand, quantity (original), unitPrice orqali match qilish
              orderItem = order.items.find((item: any) => {
                const product = item.product;
                return (
                  product?.name === supplierItem.productName &&
                  product?.brand === supplierItem.brand &&
                  item.unit_price === supplierItem.unitPrice
                );
              });

              if (!orderItem) {
                // ✅ Agar hali ham topilmasa, faqat productName va unitPrice orqali
                orderItem = order.items.find((item: any) => {
                  const product = item.product;
                  return (
                    product?.name === supplierItem.productName &&
                    item.unit_price === supplierItem.unitPrice
                  );
                });
              }
            }
          }

          // ✅ 3. Agar hali ham topilmasa, productId orqali topish (agar mos kelsa)
          if (!orderItem && adjustment.productId) {
            orderItem = order.items.find(
              (item: any) => item.product_id === adjustment.productId
            );
          }

          if (orderItem) {
            // ✅ unit_price = clinic order narxi (o'zgarmas). confirmed_unit_price = supplier tasdiqlagan narx.
            const oldConfirmedQuantity = orderItem.confirmed_quantity;
            const oldConfirmedPrice =
              orderItem.confirmed_unit_price ?? orderItem.unit_price;
            const newConfirmedQuantity =
              adjustment.actualQuantity ?? orderItem.confirmed_quantity;
            const newConfirmedUnitPrice =
              adjustment.actualPrice ??
              orderItem.confirmed_unit_price ??
              orderItem.unit_price;
            const newTotalPrice = newConfirmedQuantity * newConfirmedUnitPrice;

            await (this.prisma as any).orderItem.update({
              where: { id: orderItem.id },
              data: {
                confirmed_quantity: newConfirmedQuantity,
                pending_quantity: newConfirmedQuantity,
                confirmed_unit_price: newConfirmedUnitPrice,
                total_price: newTotalPrice,
                item_status: "confirmed",
                updated_at: new Date(),
              },
            });

            // ✅ Keyingi orderda shu narx ishlatilsin: ProductSupplier.purchase_price yangilash
            if (order.supplier_id && newConfirmedUnitPrice != null) {
              try {
                await (this.prisma as any).productSupplier.updateMany({
                  where: {
                    tenant_id: clinicTenantId,
                    product_id: orderItem.product_id,
                    clinic_supplier_manager_id: order.supplier_id,
                  },
                  data: { purchase_price: newConfirmedUnitPrice },
                });
              } catch (psErr: any) {
                this.logger.warn(
                  `ProductSupplier purchase_price update skip (product may not be linked): ${psErr?.message || psErr}`
                );
              }
            }

            this.logger.log(
              `✅ Updated OrderItem ${orderItem.id} (productId: ${orderItem.product_id}): confirmed_quantity ${oldConfirmedQuantity} → ${newConfirmedQuantity}, confirmed_unit_price ${oldConfirmedPrice} → ${newConfirmedUnitPrice} (unit_price unchanged)`
            );
          } else {
            this.logger.warn(
              `⚠️ Could not find OrderItem with itemId=${adjustment.itemId} or productId=${adjustment.productId}`
            );
            this.logger.warn(
              `   Available OrderItems: ${order.items.map((item: any) => `id=${item.id}, productId=${item.product_id}`).join(", ")}`
            );
          }
        }
      }

      // Rejected yoki supplier_confirmed: updatedItems da itemStatus bo‘lsa, har bir itemni shu bo‘yicha yangilash (qisman reject to‘g‘ri ishlashi uchun)
      const hasItemStatusInPayload =
        updatedItems?.length > 0 &&
        updatedItems.some(
          (u: any) =>
            (u.itemStatus ?? u.item_status) === "rejected" ||
            (u.itemStatus ?? u.item_status) === "confirmed"
        );

      if (hasItemStatusInPayload) {
        for (const item of order.items) {
          // Never override terminal statuses on the clinic side:
          // - inbounded: item is already in the warehouse
          // - rejection_acknowledged: clinic member has reviewed and acknowledged the rejection;
          //   a re-notification from supplier must not roll it back to "rejected"
          if (
            item.item_status === "inbounded" ||
            item.item_status === "rejection_acknowledged"
          )
            continue;

          const payloadItem = updatedItems.find(
            (u: any) =>
              u.productId === item.product_id ||
              (u.productName && item.product?.name === u.productName)
          );
          const newStatus =
            payloadItem?.itemStatus ??
            payloadItem?.item_status ??
            (status === "rejected" ? "rejected" : "confirmed");

          // If supplier says clinic_inbounded but clinic has it as inbounded — skip (handled above)
          // If supplier says clinic_inbounded — treat as confirmed on clinic side (already processed)
          if (newStatus === "clinic_inbounded") continue;

          // Rejected item uchun memo saqlash (partial reject da ham status "supplier_confirmed" keladi)
          const memo =
            newStatus === "rejected" && payloadItem?.memo
              ? payloadItem.memo
              : undefined;
          await (this.prisma as any).orderItem.update({
            where: { id: item.id },
            data: {
              ...(memo != null && memo !== "" && { memo }),
              item_status: newStatus,
              updated_at: new Date(),
            },
          });
        }
      } else if (status === "rejected" && updatedItems) {
        // Eski format: payload da itemStatus yo‘q – faqat to‘liq reject (barcha item rejected)
        for (const updatedItem of updatedItems) {
          let orderItem = null;
          if (updatedItem.productId) {
            orderItem = order.items.find(
              (item: any) => item.product_id === updatedItem.productId
            );
          }
          if (!orderItem && updatedItem.productName) {
            orderItem = order.items.find((item: any) => {
              const product = item.product;
              return (
                product?.name === updatedItem.productName &&
                item.ordered_quantity === updatedItem.quantity &&
                item.unit_price === updatedItem.unitPrice
              );
            });
          }
          if (orderItem) {
            await (this.prisma as any).orderItem.update({
              where: { id: orderItem.id },
              data: {
                memo: updatedItem?.memo ?? orderItem.memo,
                item_status: "rejected",
                updated_at: new Date(),
              },
            });
          }
        }
        for (const item of order.items) {
          const wasUpdated = updatedItems?.some(
            (u: any) =>
              u.productId === item.product_id ||
              (u.productName && item.product?.name === u.productName)
          );
          if (!wasUpdated) {
            await (this.prisma as any).orderItem.update({
              where: { id: item.id },
              data: { item_status: "rejected", updated_at: new Date() },
            });
          }
        }
      }

      // Payload da itemStatus bo‘lmaganda: supplier_confirmed bo‘lsa item_status ni updatedItems dan yoki confirmed qilish
      if (
        !hasItemStatusInPayload &&
        status === "supplier_confirmed" &&
        updatedItems?.length > 0
      ) {
        for (const item of order.items) {
          const payloadItem = updatedItems.find(
            (u: any) =>
              u.productId === item.product_id ||
              (u.productName && item.product?.name === u.productName)
          );
          const newStatus =
            payloadItem?.itemStatus ?? payloadItem?.item_status ?? "confirmed";
          await (this.prisma as any).orderItem.update({
            where: { id: item.id },
            data: { item_status: newStatus, updated_at: new Date() },
          });
        }
      } else if (!hasItemStatusInPayload && status === "supplier_confirmed") {
        // No updatedItems: full confirm (all confirmed)
        for (const item of order.items) {
          await (this.prisma as any).orderItem.update({
            where: { id: item.id },
            data: { item_status: "confirmed", updated_at: new Date() },
          });
        }
      }
    });

    // After DB transaction commit: in-app + realtime notifications (idempotent per webhook status)
    if (status === "supplier_confirmed" || status === "rejected") {
      try {
        const payload: OrderSupplierNotifiedPayload = {
          tenantId: clinicTenantId,
          orderId: order.id,
          orderNo: order.order_no,
          sourceStatus: status,
          rejectionReasons: rejectionReasons ?? null,
          adjustmentsCount: Array.isArray(adjustments) ? adjustments.length : 0,
        };
        this.eventEmitter.emit(ORDER_SUPPLIER_NOTIFIED_EVENT, payload);
      } catch (notificationError: any) {
        this.logger.error(
          `Failed to emit order supplier notification for ${orderNo}: ${notificationError.message}`
        );
      }
    }

    // Invalidate pending inbound cache when order status changes
    this.clearPendingInboundCache(clinicTenantId);

    return { success: true, orderId: order.id };
  }

  /**
   * Get pending inbound orders (supplier confirmed)
   */

  private getPendingInboundCacheKey(tenantId: string): string {
    return `pending-inbound:${tenantId}`;
  }

  private getCachedPendingInbound(
    tenantId: string
  ): { data: any; isStale: boolean } | null {
    const key = this.getPendingInboundCacheKey(tenantId);
    return this.pendingInboundCache.getWithStaleCheck(key);
  }

  private setCachedPendingInbound(tenantId: string, data: any): void {
    const key = this.getPendingInboundCacheKey(tenantId);
    this.pendingInboundCache.set(key, data);
  }

  private async refreshPendingInboundCacheInBackground(
    tenantId: string
  ): Promise<void> {
    try {
      const orders = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).order.findMany({
          where: {
            tenant_id: tenantId,
            status: {
              in: ["pending", "supplier_confirmed", "rejected"],
            },
          },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    brand: true,
                    unit: true,
                    alert_days: true,
                  },
                },
              },
            },
          },
          orderBy: [{ confirmed_at: "desc" }, { order_date: "desc" }],
        });
      });

      // Filter out rejected orders that haven't been confirmed yet
      // (i.e., no item has rejection_acknowledged — member hasn't clicked "상황 확인")
      const filteredOrders = orders.filter((order: any) => {
        if (order.status === "rejected") {
          const hasAcknowledged = (order.items || []).some(
            (item: any) => item.item_status === "rejection_acknowledged"
          );
          if (!hasAcknowledged) return false;
        }
        return true;
      });

      // Collect all unique supplier IDs and member IDs for batch fetching
      const supplierIds = new Set<string>();
      const memberIds = new Set<string>();

      filteredOrders.forEach((order: any) => {
        if (order.supplier_id) {
          supplierIds.add(order.supplier_id);
        }
        if (order.created_by && !order.clinic_manager_name) {
          memberIds.add(order.created_by);
        }
      });

      // Batch fetch all ClinicSupplierManagers
      const supplierManagersMap = new Map<string, any>();
      if (supplierIds.size > 0) {
        const supplierManagers = await this.prisma.executeWithRetry(
          async () => {
            return await (this.prisma as any).clinicSupplierManager.findMany({
              where: {
                id: {
                  in: Array.from(supplierIds),
                },
              },
              include: {
                linkedManager: {
                  select: {
                    name: true,
                    position: true,
                    supplier: {
                      select: {
                        id: true,
                        company_name: true,
                      },
                    },
                  },
                },
              },
            });
          }
        );

        supplierManagers.forEach((manager: any) => {
          supplierManagersMap.set(manager.id, manager);
        });
      }

      // Batch fetch all members
      const membersMap = new Map<string, any>();
      if (memberIds.size > 0) {
        const members = await this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).member.findMany({
            where: {
              id: {
                in: Array.from(memberIds),
              },
            },
            select: {
              id: true,
              full_name: true,
              member_id: true,
            },
          });
        });

        members.forEach((member: any) => {
          membersMap.set(member.id, member);
        });
      }

      // Group by supplier
      const grouped: Record<string, any> = {};

      for (const order of filteredOrders) {
        const supplierId = order.supplier_id || "unknown";

        if (!grouped[supplierId]) {
          let supplierInfo = {
            companyName: "알 수 없음",
            managerName: "",
            managerPosition: "",
          };
          if (order.supplier_id) {
            const clinicSupplierManager = supplierManagersMap.get(
              order.supplier_id
            );

            if (clinicSupplierManager) {
              if (clinicSupplierManager.linkedManager?.supplier) {
                supplierInfo.companyName =
                  clinicSupplierManager.linkedManager.supplier.company_name;
              } else {
                supplierInfo.companyName =
                  clinicSupplierManager.company_name || "알 수 없음";
              }
              supplierInfo.managerName =
                clinicSupplierManager.linkedManager?.name ||
                clinicSupplierManager.name ||
                "";
              supplierInfo.managerPosition =
                clinicSupplierManager.linkedManager?.position || "";
            }
          }

          grouped[supplierId] = {
            supplierId: supplierId,
            supplierName: supplierInfo.companyName,
            managerName: supplierInfo.managerName,
            managerPosition: supplierInfo.managerPosition,
            orders: [],
          };
        }

        const adjustments = Array.isArray(order.supplier_adjustments)
          ? order.supplier_adjustments
          : order.supplier_adjustments?.adjustments || [];

        const formattedItems = order.items.map((item: any) => {
          let adjustment = adjustments.find(
            (adj: any) => adj.itemId === item.id
          );
          if (!adjustment) {
            adjustment = adjustments.find(
              (adj: any) => adj.productId === item.product_id
            );
          }

          return {
            id: item.id,
            productId: item.product_id,
            productName: item.product?.name || "제품",
            brand: item.product?.brand || "",
            unit: item.product?.unit || "EA",
            orderedQuantity: item.quantity,
            confirmedQuantity: adjustment?.actualQuantity || item.quantity,
            orderedPrice: item.unit_price,
            confirmedPrice: item.confirmed_unit_price ?? item.unit_price,
            quantityReason: adjustment?.quantityChangeReason || null,
            priceReason: adjustment?.priceChangeReason || null,
            expiryMonths: item.product?.expiry_months || null,
            expiryUnit: item.product?.expiry_unit || null,
            alertDays: item.product?.alert_days || null,
            product: {
              id: item.product?.id,
              name: item.product?.name,
              brand: item.product?.brand,
              unit: item.product?.unit,
              alert_days: item.product?.alert_days,
              barcode: item.product?.barcode, // ✅ Include barcode for scanner
            },
          };
        });

        const creatorMember = order.clinic_manager_name
          ? { full_name: order.clinic_manager_name, member_id: "" }
          : membersMap.get(order.created_by);

        grouped[supplierId].orders.push({
          id: order.id,
          orderNo: order.order_no,
          orderDate: order.order_date,
          status: order.status,
          confirmedAt: order.confirmed_at,
          items: formattedItems,
          creatorName: creatorMember?.full_name || "알 수 없음",
          creatorMemberId: creatorMember?.member_id || "",
          totalAmount: order.total_amount,
        });
      }

      const result = Object.values(grouped);
      this.setCachedPendingInbound(tenantId, result);
    } catch (error) {
      // Error handling (user'ga ko'rsatilmaydi)
    }
  }

  private clearPendingInboundCache(tenantId: string): void {
    const key = this.getPendingInboundCacheKey(tenantId);
    this.pendingInboundCache.delete(key);
  }

  async getPendingInboundOrders(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // ✅ DISABLED CACHE: Always fetch fresh data from database
    // Cache disabled for real-time order updates (입고 대기 must show latest data)
    // Previous issue: Stale cache returned old data even with TTL=0
    // BYPASS CACHE LOGIC to ensure real-time accuracy

    // Commented out cache check:
    // const cached = this.getCachedPendingInbound(tenantId);
    // if (cached) {
    //   if (cached.isStale) {
    //     this.refreshPendingInboundCacheInBackground(tenantId).catch(() => {});
    //   }
    //   return cached.data;
    // }

    const orders = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findMany({
        where: {
          tenant_id: tenantId,
          status: {
            in: [
              "pending",
              "supplier_confirmed",
              "pending_inbound",
              "rejected",
            ], // ✅ Added pending_inbound
          },
        },
        include: {
          items: {
            where: {
              // Include items that are pending inbound OR rejected (so both editable and rejected cards show)
              OR: [
                {
                  item_status: { in: ["pending", "confirmed"] },
                  OR: [
                    { pending_quantity: { gt: 0 } },
                    { pending_quantity: null },
                  ],
                },
                { item_status: "rejected" },
              ],
            },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  unit: true,
                  alert_days: true,
                  barcode: true, // ✅ For barcode scanner matching
                },
              },
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { order_date: "desc" }],
      });
    });

    // No filtering - show all orders including rejected ones

    // Collect all unique supplier IDs and member IDs for batch fetching
    const supplierIds = new Set<string>();
    const memberIds = new Set<string>();

    orders.forEach((order: any) => {
      if (order.supplier_id) {
        supplierIds.add(order.supplier_id);
      }
      if (order.created_by && !order.clinic_manager_name) {
        memberIds.add(order.created_by);
      }
    });

    // Batch fetch all ClinicSupplierManagers in one query
    const supplierManagersMap = new Map<string, any>();
    if (supplierIds.size > 0) {
      const supplierManagers = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinicSupplierManager.findMany({
          where: {
            id: {
              in: Array.from(supplierIds),
            },
          },
          include: {
            linkedManager: {
              select: {
                name: true,
                position: true,
                supplier: {
                  select: {
                    id: true,
                    company_name: true,
                  },
                },
              },
            },
          },
        });
      });

      supplierManagers.forEach((manager: any) => {
        supplierManagersMap.set(manager.id, manager);
      });
    }

    // Batch fetch all members in one query
    const membersMap = new Map<string, any>();
    if (memberIds.size > 0) {
      const members = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).member.findMany({
          where: {
            id: {
              in: Array.from(memberIds),
            },
          },
          select: {
            id: true,
            full_name: true,
            member_id: true,
          },
        });
      });

      members.forEach((member: any) => {
        membersMap.set(member.id, member);
      });
    }

    // ✅ NO MORE RUNTIME FILTERING! Database already filtered by pending_quantity > 0
    // Filter out orders with no pending items (already done by Prisma)
    const filteredOrders = orders.filter(
      (order: any) => order.items.length > 0
    );

    this.logger.log(
      `📊 [getPendingInboundOrders] Found ${filteredOrders.length} orders with pending items (database filtered)`
    );

    // Group by supplier
    const grouped: Record<string, any> = {};

    for (const order of filteredOrders) {
      const supplierId = order.supplier_id || "unknown";

      if (!grouped[supplierId]) {
        // Get supplier info from pre-fetched map
        let supplierInfo = {
          companyName: "알 수 없음",
          managerName: "",
          managerPosition: "",
          isPlatformSupplier: false, // ✅ NEW
        };
        if (order.supplier_id) {
          const clinicSupplierManager = supplierManagersMap.get(
            order.supplier_id
          );

          if (clinicSupplierManager) {
            // If linked to platform supplier, use supplier's company_name
            if (clinicSupplierManager.linkedManager?.supplier) {
              supplierInfo.companyName =
                clinicSupplierManager.linkedManager.supplier.company_name;
              supplierInfo.managerName =
                clinicSupplierManager.linkedManager.name ||
                clinicSupplierManager.name ||
                "";
              supplierInfo.managerPosition =
                clinicSupplierManager.linkedManager.position ||
                clinicSupplierManager.position ||
                "";
              supplierInfo.isPlatformSupplier = true; // ✅ Platform supplier
            } else {
              // Manual supplier - use denormalized fields from ClinicSupplierManager
              supplierInfo.companyName =
                clinicSupplierManager.company_name || "알 수 없음";
              supplierInfo.managerName = clinicSupplierManager.name || "";
              supplierInfo.managerPosition =
                clinicSupplierManager.position || "";
              supplierInfo.isPlatformSupplier = false; // ✅ Manual supplier
            }
          } else {
            this.logger.warn(
              `⚠️ ClinicSupplierManager not found for supplier_id: ${order.supplier_id}`
            );
          }
        }

        grouped[supplierId] = {
          supplierId: supplierId,
          supplierName: supplierInfo.companyName,
          managerName: supplierInfo.managerName,
          managerPosition: supplierInfo.managerPosition,
          isPlatformSupplier: supplierInfo.isPlatformSupplier, // ✅ NEW
          orders: [],
        };
      }

      // Format order items with adjustments
      // Handle both formats: { adjustments: [...] } or direct array
      const adjustments = Array.isArray(order.supplier_adjustments)
        ? order.supplier_adjustments
        : order.supplier_adjustments?.adjustments || [];

      const formattedItems = order.items.map((item: any) => {
        // Find adjustment for this item
        // Try matching by itemId first (if supplier-backend sends clinic ItemId)
        let adjustment = adjustments.find((adj: any) => adj.itemId === item.id);

        // If not found, try matching by productId (fallback)
        if (!adjustment) {
          adjustment = adjustments.find(
            (adj: any) => adj.productId === item.product_id
          );
        }

        return {
          id: item.id,
          productId: item.product_id,
          productName: item.product?.name || "제품",
          brand: item.product?.brand || "",
          unit: item.product?.unit || "EA",
          orderedQuantity: item.ordered_quantity,
          confirmedQuantity:
            adjustment?.actualQuantity ||
            item.confirmed_quantity ||
            item.ordered_quantity,
          inboundQuantity: item.inbound_quantity || 0,
          pendingQuantity:
            (item.confirmed_quantity || item.ordered_quantity) -
            (item.inbound_quantity || 0),
          orderedPrice: item.unit_price,
          confirmedPrice: item.confirmed_unit_price ?? item.unit_price,
          quantityReason: adjustment?.quantityChangeReason || null,
          priceReason: adjustment?.priceChangeReason || null,
          memo: item.memo || null,
          itemStatus: item.item_status || null,
          // Product-level expiry defaults
          expiryMonths: item.product?.expiry_months || null,
          expiryUnit: item.product?.expiry_unit || null,
          alertDays: item.product?.alert_days || null,
          product: {
            id: item.product?.id,
            name: item.product?.name,
            brand: item.product?.brand,
            unit: item.product?.unit,
            alert_days: item.product?.alert_days,
            barcode: item.product?.barcode, // ✅ Include barcode for scanner
          },
        };
      });

      // Get creator member info - Use clinic_manager_name first, then pre-fetched map
      let createdByName = "알 수 없음";

      // Use clinic_manager_name from order if available, otherwise lookup from pre-fetched map
      if (order.clinic_manager_name) {
        createdByName = order.clinic_manager_name;
      } else if (order.created_by) {
        const member = membersMap.get(order.created_by);
        if (member) {
          createdByName = member.full_name || member.member_id;
        }
      }

      grouped[supplierId].orders.push({
        orderId: order.id,
        orderNo: order.order_no,
        orderDate: order.order_date,
        confirmedAt: order.confirmed_at,
        status: order.status, // Add status field: "pending" or "supplier_confirmed"
        createdByName: createdByName,
        items: formattedItems,
        totalAmount: order.total_amount,
      });
    }

    const result = Object.values(grouped);

    // ✅ DISABLED CACHE: Don't cache the result for real-time accuracy
    // Commented out cache set:
    // this.setCachedPendingInbound(tenantId, result);

    return result;
  }

  /**
   * Confirm rejected order - create RejectedOrder records
   */
  async confirmRejectedOrder(tenantId: string, dto: any) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const { orderId, orderNo, memberName, items } = dto;

    if (
      !orderId ||
      !orderNo ||
      !memberName ||
      !items ||
      !Array.isArray(items)
    ) {
      throw new BadRequestException(
        "All fields are required: orderId, orderNo, memberName, items"
      );
    }

    if (items.length === 0) {
      throw new BadRequestException("Items array cannot be empty");
    }

    // ✅ Fetch order to get correct supplier info
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          supplier_id: true,
          order_no: true,
        },
      });
    });

    if (!order) {
      throw new BadRequestException(`Order not found: ${orderId}`);
    }

    // ✅ Fetch supplier details from ClinicSupplierManager
    let companyName = "알 수 없음";
    let managerName = "알 수 없음";

    if (order.supplier_id) {
      const supplierManager = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).clinicSupplierManager.findUnique({
          where: { id: order.supplier_id },
          include: {
            linkedManager: {
              include: {
                supplier: true,
              },
            },
          },
        });
      });

      if (supplierManager) {
        // If linked to platform supplier, use platform data
        if (supplierManager.linkedManager?.supplier) {
          companyName = supplierManager.linkedManager.supplier.company_name;
          managerName =
            supplierManager.linkedManager.name ||
            supplierManager.name ||
            "알 수 없음";
        } else {
          // Manual supplier - use ClinicSupplierManager data
          companyName = supplierManager.company_name || "알 수 없음";
          managerName = supplierManager.name || "알 수 없음";
        }
      }
    }

    // ✅ Only update items that are rejected → rejection_acknowledged (partial reject: confirmed items stay confirmed)
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).orderItem.updateMany({
        where: {
          order_id: orderId,
          item_status: "rejected",
        },
        data: { item_status: "rejection_acknowledged", updated_at: new Date() },
      });
      // Set order status to confirmed_rejected only when ALL items are rejected/rejection_acknowledged (no confirmed/pending left)
      const itemCounts = await (this.prisma as any).orderItem.groupBy({
        by: ["item_status"],
        where: { order_id: orderId },
        _count: true,
      });
      const hasNonRejected = itemCounts.some(
        (g: any) =>
          g.item_status !== "rejected" &&
          g.item_status !== "rejection_acknowledged"
      );
      if (!hasNonRejected) {
        await (this.prisma as any).order.update({
          where: { id: orderId },
          data: { status: "confirmed_rejected" },
        });
      }
    });

    // Save rejection_member_name on each rejected OrderItem
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).orderItem.updateMany({
        where: {
          order_id: orderId,
          item_status: "rejection_acknowledged",
        },
        data: { rejection_member_name: memberName, updated_at: new Date() },
      });
    });

    // ✅ Clear cache for pending inbound orders
    this.clearPendingInboundCache(tenantId);

    return {
      message: "Rejected order confirmed successfully",
    };
  }

  /**
   * Get rejected orders for display in order history
   * Now queries directly from Order + OrderItem (rejection_acknowledged items)
   * instead of the removed RejectedOrder table.
   */
  async getRejectedOrders(tenantId: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Fetch orders that have at least one rejection_acknowledged item
    const orders = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findMany({
        where: {
          tenant_id: tenantId,
          items: {
            some: {
              item_status: "rejection_acknowledged",
            },
          },
        },
        select: {
          id: true,
          order_no: true,
          supplier_id: true,
          memo: true,
          updated_at: true,
          items: {
            where: {
              item_status: {
                in: ["rejected", "rejection_acknowledged"],
              },
            },
            select: {
              id: true,
              product_id: true,
              ordered_quantity: true,
              confirmed_quantity: true,
              inbound_quantity: true,
              unit_price: true,
              confirmed_unit_price: true,
              total_price: true,
              memo: true,
              item_status: true,
              rejection_member_name: true,
              updated_at: true,
              product: {
                select: {
                  name: true,
                  brand: true,
                },
              },
            },
          },
        },
        orderBy: { updated_at: "desc" },
      });
    });

    // Collect unique ClinicSupplierManager IDs
    const clinicSupplierIds = [
      ...new Set(orders.map((o: any) => o.supplier_id).filter(Boolean)),
    ];

    // Fetch ClinicSupplierManagers with contact details
    const clinicSuppliers = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).clinicSupplierManager.findMany({
        where: {
          id: { in: clinicSupplierIds },
          tenant_id: tenantId,
        },
        select: {
          id: true,
          company_name: true,
          company_address: true,
          company_phone: true,
          company_email: true,
          name: true,
          position: true,
          phone_number: true,
          email1: true,
          email2: true,
        },
      });
    });

    const clinicSupplierDetailsMap = new Map<string, any>();
    clinicSuppliers.forEach((csm: any) => {
      clinicSupplierDetailsMap.set(csm.id, csm);
    });

    return orders.map((order: any) => {
      const clinicSupplier = order.supplier_id
        ? clinicSupplierDetailsMap.get(order.supplier_id)
        : null;

      // Use rejection_member_name from the first acknowledged item as the confirmer
      const acknowledgedItem = order.items.find(
        (i: any) => i.item_status === "rejection_acknowledged"
      );
      const memberName = acknowledgedItem?.rejection_member_name || null;
      const confirmedAt = acknowledgedItem?.updated_at || order.updated_at;

      return {
        orderId: order.id,
        orderNo: order.order_no,
        companyName: clinicSupplier?.company_name || null,
        companyAddress: clinicSupplier?.company_address || null,
        companyPhone: clinicSupplier?.company_phone || null,
        companyEmail: clinicSupplier?.company_email || null,
        managerName: clinicSupplier?.name || null,
        managerPosition: clinicSupplier?.position || null,
        managerPhone: clinicSupplier?.phone_number || null,
        managerEmail: clinicSupplier?.email1 || clinicSupplier?.email2 || null,
        memberName,
        confirmedAt,
        items: order.items.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product?.name || null,
          productBrand: item.product?.brand || null,
          orderedQuantity: item.ordered_quantity,
          unitPrice: item.unit_price,
          totalPrice: item.unit_price * item.ordered_quantity,
          memo: item.memo || null,
          itemStatus: item.item_status || null,
          rejectionMemberName: item.rejection_member_name || null,
        })),
        memo: order.memo || null,
      };
    });
  }

  /**
   * Mark order as completed after inbound processing
   */
  async completeOrder(orderId: string, tenantId: string) {
    if (!orderId || !tenantId) {
      throw new BadRequestException("Order ID and Tenant ID are required");
    }

    // Find order with items
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findFirst({
        where: {
          id: orderId,
          tenant_id: tenantId,
        },
        include: {
          items: true,
        },
      });
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Update order status and all items to inbounded
    await this.prisma.executeWithRetry(async () => {
      await (this.prisma as any).order.update({
        where: { id: orderId },
        data: {
          status: "completed",
          updated_at: new Date(),
        },
      });
      // Only update items that are confirmed (not pending, rejected, cancelled, or already inbounded)
      await (this.prisma as any).orderItem.updateMany({
        where: {
          order_id: orderId,
          item_status: { in: ["confirmed"] },
        },
        data: { item_status: "inbounded", updated_at: new Date() },
      });
    });

    this.clearPendingInboundCache(tenantId);

    // Notify supplier-backend that order is completed
    if (order.supplier_id) {
      try {
        // Get supplier's tenant_id from ClinicSupplierManager -> linkedManager -> supplier
        const clinicSupplierManager = await this.prisma.executeWithRetry(
          async () => {
            return await (this.prisma as any).clinicSupplierManager.findUnique({
              where: { id: order.supplier_id },
              include: {
                linkedManager: {
                  select: {
                    supplier: {
                      select: {
                        tenant_id: true,
                      },
                    },
                  },
                },
              },
            });
          }
        );

        if (clinicSupplierManager?.linkedManager?.supplier?.tenant_id) {
          const supplierTenantId =
            clinicSupplierManager.linkedManager.supplier.tenant_id;

          // Only include confirmed items in inboundItems — rejected/rejection_acknowledged items
          // were not actually inbounded so they must not be reported to supplier as inbounded.
          const confirmedItemsForSupplier = order.items.filter(
            (item: any) => item.item_status === "confirmed"
          );
          const inboundItems = confirmedItemsForSupplier.map((item: any) => ({
            itemId: item.id,
            productId: item.product_id,
            inboundQuantity: item.confirmed_quantity,
            originalQuantity: item.ordered_quantity,
          }));

          // Update inbound_quantity only for confirmed items — never overwrite
          // rejection_acknowledged, pending, cancelled, or already-inbounded items.
          if (confirmedItemsForSupplier.length > 0) {
            await this.prisma.executeWithRetry(async () => {
              return await Promise.all(
                confirmedItemsForSupplier.map((item: any) =>
                  (this.prisma as any).orderItem.update({
                    where: { id: item.id },
                    data: {
                      inbound_quantity: item.confirmed_quantity,
                      pending_quantity: 0,
                      item_status: "inbounded",
                      updated_at: new Date(),
                    },
                  })
                )
              );
            });
          }

          await this.notifySupplierOrderCompleted(
            order.order_no,
            supplierTenantId,
            tenantId,
            inboundItems // ✅ Inbound items ma'lumotlari
          );
        } else {
          this.logger.warn(
            `ClinicSupplierManager ${order.supplier_id} is not linked to platform supplier, skipping notification`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to notify supplier-backend of order completion: ${error.message}`
        );

        // Don't throw - order is already completed in clinic DB
      }
    }

    return { success: true, message: "Order completed successfully" };
  }

  /**
   * Notify supplier-backend that order has been completed (inbound processed)
   * @param orderNo - Order number (may have -P or -C suffix from partial inbound)
   * @param supplierTenantId - Supplier's tenant_id (not supplier.id)
   * @param clinicTenantId - Clinic's tenant_id
   * @param inboundItems - Array of items with inbound quantities (optional, for partial inbound)
   */
  private async notifySupplierOrderCompleted(
    orderNo: string,
    supplierTenantId: string,
    clinicTenantId: string,
    inboundItems?: Array<{
      itemId: string;
      productId: string;
      inboundQuantity: number;
      originalQuantity: number;
    }>
  ) {
    try {
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "https://api-supplier.jaclit.com";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
        );
        return;
      }

      // ✅ Muammo: Partial inbound qilganda order -P (pending) yoki -C (completed) suffix bilan bo'linadi
      // ✅ Yechim: Original order number'ni topish - suffix'ni olib tashlash
      const originalOrderNo = orderNo.replace(/-[PC]$/, ""); // ✅ -P yoki -C ni olib tashlash

      if (originalOrderNo !== orderNo) {
        this.logger.log(
          `📦 Split order detected: ${orderNo} → ${originalOrderNo} (removed suffix)`
        );
      }

      const response = await fetch(
        `${supplierApiUrl}/supplier/orders/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            orderNo: originalOrderNo, // ✅ Original order number'ni yuborish
            supplierTenantId,
            clinicTenantId,
            completedAt: new Date().toISOString(),
            inboundItems, // ✅ Qaysi item'lar qancha inbound qilinganligi
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        this.logger.error(
          `Failed to notify supplier-backend of completion: ${response.status} ${errorText}`
        );

        // ✅ Telegram notification for supplier-backend communication failures
        if (
          process.env.NODE_ENV === "production" &&
          process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true"
        ) {
          await this.telegramService
            .sendSystemAlert(
              "Supplier Notification Failed",
              `Order ${orderNo} completion notification failed: HTTP ${response.status} - ${errorText.substring(0, 200)}`
            )
            .catch((err) => {
              this.logger.error(
                `Failed to send Telegram alert: ${err.message}`
              );
            });
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error notifying supplier-backend of completion: ${error.message}`,
        error.stack
      );

      // ✅ Telegram notification for supplier-backend communication failures
      if (
        process.env.NODE_ENV === "production" &&
        process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true"
      ) {
        await this.telegramService
          .sendSystemAlert(
            "Supplier Notification Failed",
            `Order ${orderNo} completion notification failed: ${error.message}`
          )
          .catch((err) => {
            this.logger.error(`Failed to send Telegram alert: ${err.message}`);
          });
      }

      // Don't throw - order is already completed in clinic DB
    }
  }

  /**
   * Delete order
   */
  async deleteOrder(orderId: string, tenantId: string) {
    if (!orderId || !tenantId) {
      throw new BadRequestException("Order ID and Tenant ID are required");
    }

    // Check if order exists and belongs to tenant
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findFirst({
        where: {
          id: orderId,
          tenant_id: tenantId,
        },
      });
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Delete order (cascade will delete items)
    await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.delete({
        where: { id: orderId },
      });
    });

    return { success: true, message: "Order deleted successfully" };
  }

  /**
   * Handle order split notification from supplier-backend.
   * @deprecated Use item-level status via updateOrderFromSupplier (per-item confirmed/rejected) instead.
   */
  async handleOrderSplit(dto: any) {
    this.logger.warn(
      "handleOrderSplit is deprecated. Use item-level status via supplier confirmation webhook (updateOrderFromSupplier) instead."
    );
    return {
      success: true,
      message:
        "Deprecated: order split disabled; use item-level status in supplier confirmation.",
    };
  }

  /**
   * Partial inbound processing - simple update without order splitting
   * ✅ REFACTORED: No more split orders (-C, -P), just update inbound_quantity
   */
  async partialInbound(orderId: string, tenantId: string, dto: any) {
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        // Get original order with items
        const originalOrder = await tx.order.findUnique({
          where: { id: orderId, tenant_id: tenantId },
          include: {
            items: true,
          },
        });

        if (!originalOrder) {
          throw new Error(`Order ${orderId} not found`);
        }

        // ✅ Map inbounded items by item ID with inbound quantity
        const inboundedItemsMap = new Map<string, number>(
          dto.inboundedItems.map((item: any) => [
            item.itemId,
            typeof item.inboundQty === "number" ? item.inboundQty : 0,
          ])
        );

        let allItemsFullyInbound = true;
        const inboundItems: Array<{
          itemId: string;
          productId: string;
          inboundQuantity: number;
          originalQuantity: number;
        }> = [];

        // ✅ Update each item's inbound_quantity
        for (const item of originalOrder.items) {
          const inboundQty = inboundedItemsMap.get(item.id);
          const currentItemStatus = item.item_status || "pending";

          if (
            inboundQty !== undefined &&
            inboundQty !== null &&
            typeof inboundQty === "number" &&
            inboundQty > 0
          ) {
            const currentInboundQty = item.inbound_quantity || 0;
            const totalInboundQty = currentInboundQty + inboundQty;
            const confirmedQty =
              item.confirmed_quantity || item.ordered_quantity;

            // ✅ SIMPLE UPDATE - no split, with pending_quantity and item_status
            const itemFullyInbound = totalInboundQty >= confirmedQty;
            await tx.orderItem.update({
              where: { id: item.id },
              data: {
                inbound_quantity: totalInboundQty,
                pending_quantity: confirmedQty - totalInboundQty,
                item_status: itemFullyInbound ? "inbounded" : "confirmed",
                updated_at: new Date(),
              },
            });

            if (!itemFullyInbound) {
              allItemsFullyInbound = false;
            }

            inboundItems.push({
              itemId: item.id,
              productId: item.product_id,
              inboundQuantity: inboundQty,
              originalQuantity: item.confirmed_quantity,
            });

            this.logger.log(
              `✅ Item ${item.id}: inbound ${inboundQty}, total ${totalInboundQty}/${item.confirmed_quantity}`
            );
          } else {
            // Item not in this inbound batch — check if it's already fully processed
            // pending/confirmed items that are NOT being inbounded now = not fully done
            if (
              currentItemStatus !== "inbounded" &&
              currentItemStatus !== "rejected" &&
              currentItemStatus !== "rejection_acknowledged" &&
              currentItemStatus !== "cancelled"
            ) {
              allItemsFullyInbound = false;
            }
          }
        }

        if (inboundItems.length === 0) {
          throw new Error("No items to inbound");
        }

        // ✅ Order status: agar rejected items bo'lsa — "completed" qilma, rejected "상황 확인" gacha "pending_inbound" saqlansin
        const hasRejectedItems = originalOrder.items.some(
          (item: any) => (item.item_status ?? item.itemStatus) === "rejected"
        );
        const newStatus =
          allItemsFullyInbound && !hasRejectedItems
            ? "completed"
            : "pending_inbound";

        await tx.order.update({
          where: { id: originalOrder.id },
          data: {
            status: newStatus,
            updated_at: new Date(),
          },
        });

        this.logger.log(
          `📊 Order ${originalOrder.order_no}: ${inboundItems.length} items inbound, status: ${newStatus}`
        );

        // Clear cache
        await this.clearPendingInboundCache(tenantId);

        // ✅ Notify supplier-backend about partial inbound
        if (originalOrder.supplier_id) {
          try {
            // Get supplier's tenant_id
            const clinicSupplierManager = await this.prisma.executeWithRetry(
              async () => {
                return await (
                  this.prisma as any
                ).clinicSupplierManager.findUnique({
                  where: { id: originalOrder.supplier_id },
                  include: {
                    linkedManager: {
                      select: {
                        supplier: {
                          select: {
                            tenant_id: true,
                          },
                        },
                      },
                    },
                  },
                });
              }
            );

            if (clinicSupplierManager?.linkedManager?.supplier?.tenant_id) {
              const supplierTenantId =
                clinicSupplierManager.linkedManager.supplier.tenant_id;

              await this.notifySupplierOrderCompleted(
                originalOrder.order_no,
                supplierTenantId,
                tenantId,
                inboundItems
              );
            }
          } catch (notifyError: any) {
            this.logger.warn(
              `⚠️  Failed to notify supplier about partial inbound: ${notifyError.message}`
            );
            // Don't throw - inbound should succeed even if notification fails
          }
        }

        return {
          success: true,
          order: {
            id: originalOrder.id,
            orderNo: originalOrder.order_no,
            status: newStatus,
            itemCount: inboundItems.length,
          },
          message: allItemsFullyInbound
            ? `${inboundItems.length}개 제품 입고 완료.`
            : `${inboundItems.length}개 제품 부분 입고 완료. 나머지는 대기 중입니다.`,
        };
      });
    } catch (error: any) {
      this.logger.error(
        `❌ [PARTIAL INBOUND] Failed: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
