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

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService
  ) {}

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
                name: true,
                phone_number: true,
                business_number: true,
              },
            },
          },
        },
      },
    });

    // Faqat basic formatting - hamma logic frontend'da
    return products.map((product: any) => {
      // Get supplier info from ProductSupplier -> ClinicSupplierManager
      const supplierManager = product.productSupplier?.clinicSupplierManager;
      const supplierId = supplierManager?.id ?? null;
      const supplierName = supplierManager?.company_name ?? null;
      const managerName = supplierManager?.name ?? null;

      // 🔍 DEBUG: Log qo'shish
      this.logger.log(
        `🔍 Product: ${product.name}, Supplier: ${
          supplierName || "none"
        }, Manager: ${managerName || "none"}`
      );

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        supplierId: supplierId, // ClinicSupplierManager ID
        supplierName: supplierName,
        managerName: managerName,
        managerPosition: null, // Position is not in ClinicSupplierManager
        unitPrice:
          product.productSupplier?.purchase_price ??
          product.purchase_price ??
          null,
        currentStock: product.current_stock ?? 0,
        minStock: product.min_stock ?? 0,
        batches: (product.batches || []).map((batch: any) => ({
          id: batch.id,
          batchNo: batch.batch_no ?? "",
          expiryDate: batch.expiry_date
            ? batch.expiry_date.toISOString().split("T")[0]
            : null,
          qty: batch.qty ?? 0,
          purchasePrice: batch.purchase_price ?? null,
        })),
      };
    });
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

    // Product va batch ma'lumotlarini olish
    const product = await (this.prisma.product.findFirst as any)({
      where: { id: dto.productId, tenant_id: tenantId },
      include: {
        supplierManager: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    let batch = null;
    let unitPrice = product.purchase_price ?? 0;

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

      unitPrice = batch.purchase_price ?? product.purchase_price ?? 0;
    } else {
      // BatchId yo'q bo'lsa, eng so'nggi batch'dan narx olish
      const latestBatch = await this.prisma.batch.findFirst({
        where: {
          product_id: dto.productId,
          tenant_id: tenantId,
          qty: { gt: 0 },
        },
        orderBy: { created_at: "desc" },
      });

      if (latestBatch) {
        unitPrice = latestBatch.purchase_price ?? product.purchase_price ?? 0;
      } else {
        unitPrice = product.purchase_price ?? 0;
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
      product.productSupplier.clinic_supplier_manager_id || null;

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
      this.logger.log(
        `🔄 Updating existing item: ${dto.productId} - Old: ${oldQty}, Setting to: ${dto.quantity}, New: ${newQty}`
      );

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
      this.logger.log(
        `➕ Added NEW item: ${dto.productId} - Qty: ${dto.quantity}`
      );
    }

    this.logger.log(`📝 Draft now has ${items.length} unique items`);
    this.logger.log(`📊 Total quantities by product:`);
    const qtyByProduct: Record<string, number> = {};
    items.forEach((item: any) => {
      qtyByProduct[item.productId] =
        (qtyByProduct[item.productId] || 0) + item.quantity;
    });
    Object.entries(qtyByProduct).forEach(([prodId, qty]) => {
      this.logger.log(`  - ${prodId}: ${qty}개`);
    });

    // Total amount hisoblash
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.totalPrice,
      0
    );

    // Draft'ni yangilash
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DRAFT_EXPIRY_HOURS);

    this.logger.log(
      `🔍 DEBUG: Saving draft - sessionId: ${sessionId}, tenantId: ${tenantId}, items count: ${items.length}`
    );
    this.logger.log(
      `🔍 DEBUG: Items to save: ${JSON.stringify(
        items.map((i: any) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
          supplierId: i.supplierId,
        }))
      )}`
    );

    const updatedDraft = await this.orderRepository.createOrUpdateDraft(
      sessionId,
      tenantId,
      { items, total_amount: totalAmount },
      expiresAt
    );

    this.logger.log(
      `🔍 DEBUG: Draft saved successfully - items count in saved draft: ${
        Array.isArray(updatedDraft.items) ? updatedDraft.items.length : 0
      }`
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

    this.logger.log(
      `🔍 DEBUG: updateDraftItem - sessionId: ${sessionId}, tenantId: ${tenantId}, itemId: ${itemId}`
    );

    const draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      this.logger.warn(
        `🔍 DEBUG: Draft not found - sessionId: ${sessionId}, tenantId: ${tenantId}`
      );
      throw new NotFoundException("Draft not found");
    }

    const items = Array.isArray(draft.items) ? draft.items : [];

    this.logger.log(`🔍 DEBUG: Retrieved draft - items count: ${items.length}`);
    this.logger.log(
      `🔍 DEBUG: Draft items: ${JSON.stringify(
        items.map((i: any) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
        }))
      )}`
    );

    // Item'ni topish
    const itemIndex = items.findIndex((item: any) => item.id === itemId);

    if (itemIndex < 0) {
      // Debug: draft'dagi barcha item ID'larni ko'rsatish
      const availableItemIds = items.map((item: any) => item.id);
      this.logger.warn(
        `Item not found. Looking for: ${itemId}, Available items: ${JSON.stringify(
          availableItemIds
        )}`
      );
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
      this.logger.log(
        `🔍 DEBUG: createOrder - Using items from request body (${dto.items.length} items)`
      );
      items = dto.items.map((item) => ({
        id: item.batchId ? `${item.productId}-${item.batchId}` : item.productId,
        productId: item.productId,
        batchId: item.batchId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        // supplierId'ni product'dan olish kerak (quyida)
      }));
    } else if (sessionId) {
      // Draft'dan olish (eski logic)
      this.logger.log(
        `🔍 DEBUG: createOrder - sessionId: ${sessionId}, tenantId: ${tenantId}`
      );

      const draft = await this.orderRepository.findDraftBySession(
        sessionId,
        tenantId
      );

      if (!draft) {
        this.logger.warn(
          `🔍 DEBUG: Draft not found - sessionId: ${sessionId}, tenantId: ${tenantId}`
        );
        throw new NotFoundException("Draft not found");
      }

      items = Array.isArray(draft.items) ? draft.items : [];

      this.logger.log(`🔍 DEBUG: Total items from draft: ${items.length}`);
      this.logger.log(
        `🔍 DEBUG: Draft items: ${JSON.stringify(
          items.map((i: any) => ({
            id: i.id,
            productId: i.productId,
            supplierId: i.supplierId,
            quantity: i.quantity,
          }))
        )}`
      );
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
    this.logger.log(
      `🔍 DEBUG: Starting grouping, total items: ${items.length}`
    );
    items.forEach((item: any, idx: number) => {
      this.logger.log(
        `🔍 DEBUG: Item ${idx + 1}: productId=${item.productId}, supplierId=${
          item.supplierId || "unknown"
        }, quantity=${item.quantity}`
      );
    });

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

    this.logger.log(
      `🔍 DEBUG: Grouped into ${
        Object.keys(groupedBySupplier).length
      } suppliers`
    );
    for (const [supplierId, group] of Object.entries(groupedBySupplier)) {
      this.logger.log(
        `🔍 DEBUG: Supplier ${supplierId}: ${group.items.length} items`
      );
    }

    // Har bir supplier uchun alohida order yaratish
    const createdOrders = [];
    for (const [supplierId, group] of Object.entries(groupedBySupplier)) {
      // Order number yaratish
      const orderNo = await this.generateOrderNumber(tenantId);

      // Supplier uchun memo olish
      const supplierMemo = dto.supplierMemos?.[supplierId] || dto.memo || null;

      // Order yaratish
      const order = await this.prisma.$transaction(async (tx: any) => {
        const order = await (tx as any).order.create({
          data: {
            tenant_id: tenantId,
            order_no: orderNo,
            status: "pending",
            supplier_id: supplierId !== "unknown" ? supplierId : null,
            total_amount: group.totalAmount,
            expected_delivery_date: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : null,
            created_by: createdBy ?? null,
            memo: supplierMemo,
            clinic_manager_name: dto.clinicManagerName || null,
          },
        });

        // Order items yaratish
        await Promise.all(
          group.items.map((item: any) =>
            (tx as any).orderItem.create({
              data: {
                tenant_id: tenantId,
                order_id: order.id,
                product_id: item.productId,
                batch_id: item.batchId ?? null,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                total_price: item.totalPrice,
                memo: item.memo ?? null,
              },
            })
          )
        );

        return order;
      });

      createdOrders.push(
        await this.orderRepository.findById(order.id, tenantId)
      );

      this.logger.log(
        `🔍 DEBUG: Sending order ${order.order_no} to supplier ${supplierId} with ${group.items.length} items`
      );

      // Send order to supplier-backend (SupplierOrder table)
      await this.sendOrderToSupplier(
        order,
        group,
        tenantId,
        createdBy,
        dto.clinicManagerName
      );
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
        where,
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

    // Filter out rejected orders that haven't been confirmed yet (don't have RejectedOrder records)
    const confirmedRejectedOrderIds = await this.prisma.executeWithRetry(
      async () => {
        const confirmedRejected = await (
          this.prisma as any
        ).rejectedOrder.findMany({
          where: {
            tenant_id: tenantId,
          },
          select: {
            order_id: true,
          },
          distinct: ["order_id"],
        });
        return new Set(confirmedRejected.map((ro: any) => ro.order_id));
      }
    );

    // Filter out rejected orders that haven't been confirmed
    const filteredOrders = orders.filter((order: any) => {
      // If order is rejected but not confirmed, exclude it from order history
      if (
        order.status === "rejected" &&
        !confirmedRejectedOrderIds.has(order.id)
      ) {
        return false;
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
    filteredOrders.forEach((order: any) => {
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
      // Supplier va manager ma'lumotlarini topish (items'dan)
      let supplierName = order.supplier_id || "공급업체 없음";
      let managerName = "";
      let supplierDetails: any = null;

      // Get supplier ID from order or items
      let supplierId: string | null = order.supplier_id || null;

      if (!supplierId && order.items && order.items.length > 0) {
        const firstItem = order.items[0];
        if (firstItem.product && firstItem.product.productSupplier) {
          const productSupplier = firstItem.product.productSupplier;
          const clinicSupplierManager = productSupplier.clinicSupplierManager;
          supplierId =
            clinicSupplierManager?.linkedManager?.supplier?.id || null;
        }
      }

      // Get ProductSupplier from first item
      let clinicSupplierManager: any = null;
      if (order.items && order.items.length > 0) {
        const firstItem = order.items[0];
        if (firstItem.product && firstItem.product.productSupplier) {
          clinicSupplierManager =
            firstItem.product.productSupplier.clinicSupplierManager;
        }
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
            // Last resort: use clinicSupplierManager data (manual supplier)
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
            };
          }
        }
      }

      // Items'ni formatlash
      const formattedItems = (order.items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product?.name || "제품명 없음",
        brand: item.product?.brand || "",
        batchId: item.batch_id,
        batchNo: item.batch?.batch_no || null,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        memo: item.memo || null,
      }));

      // Total amount hisoblash
      const totalAmount = formattedItems.reduce(
        (sum: number, item: any) => sum + item.totalPrice,
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

      return {
        id: order.id,
        orderNo: order.order_no,
        supplierId: order.supplier_id,
        supplierName: supplierName,
        managerName: managerName,
        supplierDetails: supplierDetails, // To'liq supplier ma'lumotlari
        status: order.status,
        totalAmount: order.total_amount || totalAmount,
        memo: order.memo,
        createdAt: order.created_at,
        createdByName: createdByName, // 클리닉 담당자 이름
        items: formattedItems,
      };
    });
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
      if (!order.supplier_id) {
        this.logger.warn(
          `Order ${order.order_no} has no supplier_id, skipping supplier notification`
        );
        return;
      }

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

      if (!clinicSupplierManager) {
        this.logger.warn(
          `ClinicSupplierManager ${order.supplier_id} not found`
        );
        return;
      }

      // Get platform supplier (if linked)
      const supplier = clinicSupplierManager.linkedManager?.supplier;

      if (!supplier || !supplier.tenant_id) {
        this.logger.log(
          `ClinicSupplierManager ${order.supplier_id} is not linked to platform supplier, notification will use manual contact info`
        );
        // Continue with manual contact flow (SMS to clinicSupplierManager.phone_number)
      }

      // Get ProductSupplier to find clinic_supplier_manager_id
      // IMPORTANT: Check ALL items to find the correct clinic_supplier_manager_id
      // If multiple products have different clinic_supplier_manager_id, use the most common one
      let supplierManager: any = null;
      let supplierPhoneNumber: string | null = null;
      let supplierProductRecord: any = null;

      if (group.items && group.items.length > 0) {
        this.logger.log(
          `🔍 DEBUG: sendOrderToSupplier - group.items.length: ${group.items.length}`
        );
        this.logger.log(
          `🔍 DEBUG: sendOrderToSupplier - First item: ${JSON.stringify(
            group.items[0]
          )}`
        );
        if (group.items.length > 1) {
          this.logger.log(
            `🔍 DEBUG: sendOrderToSupplier - Last item: ${JSON.stringify(
              group.items[group.items.length - 1]
            )}`
          );
        }

        // Collect all SupplierProducts for all items in this order
        // IMPORTANT: Use item.supplierId (from draft) instead of order.supplier_id
        const supplierManagerIdCounts = new Map<string, number>();
        const supplierProductsByManagerId = new Map<string, any>();

        for (const item of group.items) {
          if (item.productId) {
            this.logger.log(
              `🔍 Checking item: productId=${item.productId}, order.supplier_id=${order.supplier_id}`
            );

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

              this.logger.log(
                `✅ Found ProductSupplier: id=${productSupplier.id}, clinic_supplier_manager_id=${productSupplier.clinic_supplier_manager_id}, company_name=${clinicSupplierManager?.company_name}, linkedManager=${linkedManager?.id}`
              );

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
                this.logger.log(
                  `📊 Item ${
                    item.productId
                  }: Found clinic_supplier_manager_id ${
                    productSupplier.clinic_supplier_manager_id
                  } (count: ${count + 1})`
                );
              } else {
                this.logger.log(
                  `⚠️ Item ${item.productId}: No clinic_supplier_manager_id found`
                );
              }
            } else {
              this.logger.warn(
                `❌ Item ${item.productId}: No ProductSupplier found`
              );
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

        this.logger.log(
          `ClinicSupplierManager ID counts: ${JSON.stringify(
            Array.from(supplierManagerIdCounts.entries())
          )}`
        );
        this.logger.log(
          `Most common clinic_supplier_manager_id: ${mostCommonManagerId} (count: ${maxCount})`
        );

        // Variant 1: If clinic_supplier_manager_id exists and has linkedManager
        if (mostCommonManagerId) {
          const productSupplier =
            supplierProductsByManagerId.get(mostCommonManagerId);
          const linkedManager =
            productSupplier?.clinicSupplierManager?.linkedManager;

          if (linkedManager) {
            supplierManager = linkedManager;
            this.logger.log(
              `✅ Found SupplierManager via linkedManager: ${supplierManager.id}, name: ${supplierManager.name}, phone: ${supplierManager.phone_number} (used in ${maxCount} products)`
            );
            supplierProductRecord = productSupplier;
          } else {
            this.logger.log(
              `ℹ️  ClinicSupplierManager ${mostCommonManagerId} is a manual supplier (not linked to platform)`
            );
          }
        } else {
          this.logger.log(
            `⚠️ No clinic_supplier_manager_id found in any ProductSupplier`
          );
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

          if (supplierManager) {
            this.logger.log(
              `Found SupplierManager by contact_phone: ${supplierManager.id}, could potentially link ClinicSupplierManager`
            );
            // Note: We don't automatically link here, that should be done via claim flow
          }
        }

        // Variant 3: Use contact_phone from ClinicSupplierManager for SMS fallback
        if (!supplierManager) {
          // No SupplierManager found, use contact_phone for SMS
          supplierPhoneNumber =
            supplierProductRecord?.clinicSupplierManager?.phone_number;
          if (supplierPhoneNumber) {
            this.logger.log(
              `No SupplierManager found, will use contact_phone from ClinicSupplierManager for SMS: ${supplierPhoneNumber}`
            );
          }
        }
      }

      // Variant 4: Use linkedManager directly from clinicSupplierManager if available
      if (!supplierManager && clinicSupplierManager.linkedManager) {
        supplierManager = clinicSupplierManager.linkedManager;
        this.logger.log(
          `✅ Using linkedManager directly from ClinicSupplierManager: ${supplierManager.id}, name: ${supplierManager.name}`
        );
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
        if (fallbackManager) {
          supplierManager = fallbackManager;
          this.logger.log(
            `Using fallback SupplierManager (first created): ${fallbackManager.id}`
          );
        }
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
          this.logger.log(
            `Using manual contact phone from ClinicSupplierManager: ${supplierPhoneNumber}`
          );
        } else {
          this.logger.warn(
            `No SupplierManager or phone number found for ClinicSupplierManager ${order.supplier_id}, SMS will not be sent`
          );
        }
      }

      // Get clinic info
      this.logger.log(`Looking for clinic with tenantId: ${tenantId}`);
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

      this.logger.log(
        `Found clinic: ${finalClinicName} (from ${
          clinic ? "Clinic table" : "Member fallback"
        })`
      );

      // Get product details for items
      const itemsWithDetails = await Promise.all(
        group.items.map(async (item: any) => {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
            select: { name: true, brand: true },
          });

          let batchNo = null;
          if (item.batchId) {
            const batch = await this.prisma.batch.findUnique({
              where: { id: item.batchId },
              select: { batch_no: true },
            });
            batchNo = batch?.batch_no || null;
          }

          return {
            productId: item.productId,
            productName: product?.name || "제품",
            brand: product?.brand || "",
            batchNo: batchNo,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            memo: item.memo || null,
          };
        })
      );

      // Prepare order data for supplier-backend
      // supplierManagerId null bo'lishi mumkin (agar supplier platformadan ro'yxatdan o'tmagan bo'lsa)
      // Only send to supplier-backend if linked to platform
      if (!supplier || !supplier.tenant_id) {
        this.logger.log(
          `Skipping supplier-backend notification for manual supplier ${order.supplier_id}, will send SMS only`
        );

        // Send SMS to manual supplier
        const manualPhoneNumber = clinicSupplierManager.phone_number;
        if (manualPhoneNumber) {
          try {
            // Professional SMS format
            const smsMessage = `[Web발신]
[주문 도착] ${finalClinicName}에서 주문 요청이 등록되었습니다.



주문번호: ${order.order_no}
상품 항목 수: ${itemsWithDetails.length}
총 금액: ${order.total_amount?.toLocaleString()}원



주문 내용을 확인하고 관리해 주세요.

* 문의: ${finalClinicManagerName || "담당자"} / ${
              clinicSupplierManager.company_phone || "연락처 없음"
            }`;

            this.logger.log(
              `Sending SMS to manual supplier: ${manualPhoneNumber}`
            );

            // Send SMS via MessageService
            const smsSent = await this.messageService.sendSMS(
              manualPhoneNumber,
              smsMessage
            );

            if (smsSent) {
              this.logger.log(
                `✅ SMS sent successfully to manual supplier: ${manualPhoneNumber}`
              );
            } else {
              this.logger.warn(
                `⚠️ SMS failed to send to manual supplier: ${manualPhoneNumber}`
              );
            }
          } catch (smsError: any) {
            this.logger.error(
              `Failed to send SMS to manual supplier: ${smsError.message}`
            );
          }
        }
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

      this.logger.log(
        `Sending order to supplier-backend: clinicName=${finalClinicName}, manager=${finalClinicManagerName}`
      );
      this.logger.log(`📦 Order items count: ${itemsWithDetails.length}`);
      itemsWithDetails.forEach((item, idx) => {
        this.logger.log(
          `  Item ${idx + 1}: ${item.productName} - Qty: ${item.quantity}`
        );
      });

      // Prepare supplier phone number for SMS (even if API fails, we can still send SMS)
      // Priority: supplierManager.phone_number > supplierPhoneNumber > clinicSupplierManager.phone_number > supplier.company_phone
      const finalSupplierPhoneNumber =
        supplierManager?.phone_number ||
        supplierPhoneNumber ||
        clinicSupplierManager.phone_number ||
        supplier?.company_phone;

      // Call supplier-backend API
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
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
            this.logger.error(
              `Failed to send order to supplier-backend: ${response.status} ${errorText}`
            );
          } else {
            const result: any = await response.json();
            this.logger.log(
              `Order ${order.order_no} sent to supplier-backend successfully: ${result.id}`
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
            this.logger.error(
              `Supplier-backend API request timed out after 10 seconds. URL: ${supplierApiUrl}`
            );
          } else if (
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ENOTFOUND")
          ) {
            this.logger.error(
              `Cannot connect to supplier-backend at ${supplierApiUrl}. Is supplier-backend running? Error: ${errorMessage}`
            );
            this.logger.error(
              `Please check: 1) Supplier-backend is running, 2) SUPPLIER_BACKEND_URL is correct in .env`
            );
          } else {
            this.logger.error(
              `Error calling supplier-backend API: ${errorMessage}`
            );
          }
          // Continue - we'll still try to send SMS even if API call failed
        }
      }

      // Send SMS notification to supplier manager
      // SMS yuborish supplier-backend API muvaffaqiyatli bo'lgan yoki bo'lmaganidan qat'iy nazar
      // (chunki telefon raqami mavjud bo'lsa, SMS yuborish kerak)
      if (finalSupplierPhoneNumber) {
        try {
          // Products ma'lumotlarini formatlash
          const products = itemsWithDetails.map((item: any) => ({
            productName: item.productName || "제품",
            brand: item.brand || "",
          }));

          // Total quantity'ni hisoblash (barcha itemlarning quantity'sini yig'ish)
          const totalQuantity = itemsWithDetails.reduce(
            (sum: number, item: any) => {
              return sum + (item.quantity || 0);
            },
            0
          );

          await this.messageService.sendOrderNotification(
            finalSupplierPhoneNumber,
            finalClinicName,
            order.order_no,
            order.total_amount,
            totalQuantity, // itemsWithDetails.length o'rniga totalQuantity
            clinicManagerName,
            products
          );
          const phoneSource = supplierManager?.phone_number
            ? "SupplierManager"
            : supplierPhoneNumber
            ? "SupplierProduct"
            : "Supplier.company_phone";
          this.logger.log(
            `Order notification SMS sent to supplier: ${finalSupplierPhoneNumber} (source: ${phoneSource})`
          );
        } catch (smsError: any) {
          // Log error but don't fail the order creation
          this.logger.error(
            `Failed to send SMS notification to supplier: ${
              smsError?.message || "Unknown error"
            }`
          );
        }
      } else {
        this.logger.warn(
          `No phone number found for supplier ${order.supplier_id} (checked SupplierManager, SupplierProduct, and Supplier.company_phone), skipping SMS notification`
        );
      }

      // Send Email notification to supplier manager
      // Email yuborish supplier-backend API muvaffaqiyatli bo'lgan yoki bo'lmaganidan qat'iy nazar
      // (chunki email address mavjud bo'lsa, email yuborish kerak)
      try {
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

          await this.emailService.sendOrderNotificationEmail(
            supplierEmail,
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
          this.logger.log(
            `Order notification email sent to supplier: ${supplierEmail} (source: ${emailSource})`
          );
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
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending order to supplier-backend: ${error.message}`,
        error.stack
      );
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
      // Update order
      await (this.prisma as any).order.update({
        where: { id: order.id },
        data: {
          status: status,
          supplier_adjustments: adjustmentsData,
          confirmed_at: confirmedAt ? new Date(confirmedAt) : new Date(),
          total_amount: totalAmount || order.total_amount,
          updated_at: new Date(),
        },
      });

      // If rejected, update item memos with rejection reasons
      if (status === "rejected" && updatedItems) {
        for (const updatedItem of updatedItems) {
          // Find matching order item by productId, productName, quantity, and unitPrice
          // This ensures we match the correct item even if productId is null
          let orderItem = null;

          if (updatedItem.productId) {
            // First try to match by productId
            orderItem = order.items.find(
              (item: any) => item.product_id === updatedItem.productId
            );
          }

          // If not found by productId, try matching by productName, quantity, and unitPrice
          if (!orderItem && updatedItem.productName) {
            orderItem = order.items.find((item: any) => {
              const product = item.product;
              return (
                product?.name === updatedItem.productName &&
                item.quantity === updatedItem.quantity &&
                item.unit_price === updatedItem.unitPrice
              );
            });
          }

          if (orderItem && updatedItem.memo) {
            await (this.prisma as any).orderItem.update({
              where: { id: orderItem.id },
              data: {
                memo: updatedItem.memo,
                updated_at: new Date(),
              },
            });
          }
        }
      }
    });

    // 🆕 Notification: Log supplier order confirmation for clinic
    try {
      const statusText =
        status === "supplier_confirmed"
          ? "✅ Supplier confirmed"
          : status === "rejected"
          ? "❌ Supplier rejected"
          : `📋 Status updated: ${status}`;

      const adjustmentCount = adjustments?.length || 0;
      const adjustmentInfo =
        adjustmentCount > 0 ? ` (${adjustmentCount} adjustments)` : "";

      this.logger.log(
        `🔔 [Clinic Notification] Order ${orderNo} - ${statusText}${adjustmentInfo} | ` +
          `Total: ${(
            totalAmount || order.total_amount
          )?.toLocaleString()}원 | ` +
          `Tenant: ${clinicTenantId}`
      );

      // If there are adjustments, log them for visibility
      if (adjustmentCount > 0) {
        adjustments.forEach((adj: any, idx: number) => {
          const product = order.items.find(
            (item: any) => item.id === adj.itemId
          )?.product;
          const productName = product?.name || adj.productName || "Unknown";

          this.logger.log(
            `  📝 Adjustment ${idx + 1}: ${productName} | ` +
              `Original: ${adj.originalQuantity} → Confirmed: ${adj.confirmedQuantity} | ` +
              `Reason: ${adj.reason || "N/A"}`
          );
        });
      }

      // TODO: Create in-app notification table entry for clinic user
      // await this.createClinicOrderNotification(order, status, adjustments);
    } catch (notificationError: any) {
      this.logger.error(
        `Failed to create notification for order ${orderNo}: ${notificationError.message}`
      );
      // Don't throw - order update is more important than notification
    }

    return { success: true, orderId: order.id };
  }

  /**
   * Get pending inbound orders (supplier confirmed)
   */
  async getPendingInboundOrders(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

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
                  expiry_months: true,
                  expiry_unit: true,
                  alert_days: true,
                },
              },
            },
          },
        },
        orderBy: [{ confirmed_at: "desc" }, { order_date: "desc" }],
      });
    });

    // Filter out rejected orders that have already been confirmed (have RejectedOrder records)
    const confirmedRejectedOrderIds = await this.prisma.executeWithRetry(
      async () => {
        const confirmedRejected = await (
          this.prisma as any
        ).rejectedOrder.findMany({
          where: {
            tenant_id: tenantId,
          },
          select: {
            order_id: true,
          },
          distinct: ["order_id"],
        });
        return new Set(confirmedRejected.map((ro: any) => ro.order_id));
      }
    );

    // Filter out orders that are rejected and already confirmed
    const filteredOrders = orders.filter((order: any) => {
      if (
        order.status === "rejected" &&
        confirmedRejectedOrderIds.has(order.id)
      ) {
        return false; // Exclude this rejected order as it's already been confirmed
      }
      return true;
    });

    // Group by supplier
    const grouped: Record<string, any> = {};

    for (const order of filteredOrders) {
      const supplierId = order.supplier_id || "unknown";

      if (!grouped[supplierId]) {
        // Get supplier info from ClinicSupplierManager
        let supplierInfo = {
          companyName: "알 수 없음",
          managerName: "",
          managerPosition: "",
        };
        if (order.supplier_id) {
          const clinicSupplierManager = await (
            this.prisma as any
          ).clinicSupplierManager.findUnique({
            where: { id: order.supplier_id },
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
              this.logger.log(
                `✅ Platform supplier found: ${supplierInfo.companyName}, Manager: ${supplierInfo.managerName}, Position: ${supplierInfo.managerPosition}`
              );
            } else {
              // Manual supplier - use denormalized fields from ClinicSupplierManager
              supplierInfo.companyName =
                clinicSupplierManager.company_name || "알 수 없음";
              supplierInfo.managerName = clinicSupplierManager.name || "";
              supplierInfo.managerPosition =
                clinicSupplierManager.position || "";
              this.logger.log(
                `✅ Manual supplier found: ${supplierInfo.companyName}, Manager: ${supplierInfo.managerName}, Position: ${supplierInfo.managerPosition}`
              );
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
          orderedQuantity: item.quantity, // Original order quantity
          confirmedQuantity: adjustment?.actualQuantity || item.quantity, // Supplier confirmed
          orderedPrice: item.unit_price, // Original price
          confirmedPrice: adjustment?.actualPrice || item.unit_price, // Supplier confirmed
          quantityReason: adjustment?.quantityChangeReason || null,
          priceReason: adjustment?.priceChangeReason || null,
          // Product-level expiry defaults
          expiryMonths: item.product?.expiry_months || null,
          expiryUnit: item.product?.expiry_unit || null,
          alertDays: item.product?.alert_days || null,
        };
      });

      // Get creator member info - Use clinic_manager_name first
      let createdByName = "알 수 없음";

      // Use clinic_manager_name from order if available, otherwise lookup from member
      if (order.clinic_manager_name) {
        createdByName = order.clinic_manager_name;
      } else if (order.created_by) {
        const member = await (this.prisma as any).member.findFirst({
          where: { id: order.created_by },
          select: { full_name: true, member_id: true },
        });
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

    return Object.values(grouped);
  }

  /**
   * Confirm rejected order - create RejectedOrder records
   */
  async confirmRejectedOrder(tenantId: string, dto: any) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const { orderId, orderNo, companyName, managerName, memberName, items } =
      dto;

    if (
      !orderId ||
      !orderNo ||
      !companyName ||
      !managerName ||
      !memberName ||
      !items ||
      !Array.isArray(items)
    ) {
      throw new BadRequestException(
        "All fields are required: orderId, orderNo, companyName, managerName, memberName, items"
      );
    }

    // Create RejectedOrder records for each item
    const rejectedOrders = await this.prisma.executeWithRetry(async () => {
      const createPromises = items.map((item: any) => {
        return (this.prisma as any).rejectedOrder.create({
          data: {
            tenant_id: tenantId,
            order_id: orderId,
            order_no: orderNo,
            company_name: companyName,
            manager_name: managerName,
            product_name: item.productName,
            product_brand: item.productBrand || null,
            qty: item.qty,
            member_name: memberName,
          },
        });
      });

      return Promise.all(createPromises);
    });

    return {
      message: "Rejected order confirmed successfully",
      rejectedOrders: rejectedOrders,
    };
  }

  /**
   * Get rejected orders for display in order history
   */
  async getRejectedOrders(tenantId: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const rejectedOrders = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).rejectedOrder.findMany({
        where: {
          tenant_id: tenantId,
        },
        orderBy: {
          created_at: "desc",
        },
      });
    });

    // Get unique order IDs to fetch supplier details
    const orderIds = [...new Set(rejectedOrders.map((ro: any) => ro.order_id))];

    // Fetch orders to get supplier information
    const orders = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findMany({
        where: {
          id: { in: orderIds },
          tenant_id: tenantId,
        },
        select: {
          id: true,
          supplier_id: true,
        },
      });
    });

    // Create a map of order_id -> supplier_id
    const orderSupplierMap = new Map<string, string>();
    orders.forEach((order: any) => {
      if (order.supplier_id) {
        orderSupplierMap.set(order.id, order.supplier_id);
      }
    });

    // Get unique supplier IDs
    const supplierIds = [...new Set(Array.from(orderSupplierMap.values()))];

    // Fetch suppliers with managers to get position
    const suppliers = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).supplier.findMany({
        where: {
          id: { in: supplierIds },
        },
        select: {
          id: true,
          managers: {
            where: {
              status: "ACTIVE",
            },
            take: 1,
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              name: true,
              position: true,
            },
          },
        },
      });
    });

    // Create a map of supplier_id -> manager position
    const supplierPositionMap = new Map<string, string | null>();
    suppliers.forEach((supplier: any) => {
      if (supplier.managers && supplier.managers.length > 0) {
        supplierPositionMap.set(
          supplier.id,
          supplier.managers[0].position || null
        );
      }
    });

    // Group by order_no
    const grouped: Record<string, any> = {};

    for (const rejectedOrder of rejectedOrders) {
      const orderNo = rejectedOrder.order_no;

      if (!grouped[orderNo]) {
        // Get position from supplier
        let managerPosition = null;
        const supplierId = orderSupplierMap.get(rejectedOrder.order_id);
        if (supplierId) {
          managerPosition = supplierPositionMap.get(supplierId) || null;
        }

        grouped[orderNo] = {
          orderId: rejectedOrder.order_id,
          orderNo: rejectedOrder.order_no,
          companyName: rejectedOrder.company_name,
          managerName: rejectedOrder.manager_name,
          managerPosition: managerPosition,
          memberName: rejectedOrder.member_name,
          confirmedAt: rejectedOrder.created_at,
          items: [],
        };
      }

      grouped[orderNo].items.push({
        productName: rejectedOrder.product_name,
        productBrand: rejectedOrder.product_brand,
        qty: rejectedOrder.qty,
      });
    }

    return Object.values(grouped);
  }

  /**
   * Mark order as completed after inbound processing
   */
  async completeOrder(orderId: string, tenantId: string) {
    if (!orderId || !tenantId) {
      throw new BadRequestException("Order ID and Tenant ID are required");
    }

    // Find order
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

    // Update status to completed
    await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.update({
        where: { id: orderId },
        data: {
          status: "completed",
          updated_at: new Date(),
        },
      });
    });

    this.logger.log(`Order ${order.order_no} marked as completed`);

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
          this.logger.log(
            `Notifying supplier-backend: orderNo=${order.order_no}, supplierTenantId=${supplierTenantId}, clinicTenantId=${tenantId}`
          );
          await this.notifySupplierOrderCompleted(
            order.order_no,
            supplierTenantId,
            tenantId
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
   * @param orderNo - Order number
   * @param supplierTenantId - Supplier's tenant_id (not supplier.id)
   * @param clinicTenantId - Clinic's tenant_id
   */
  private async notifySupplierOrderCompleted(
    orderNo: string,
    supplierTenantId: string,
    clinicTenantId: string
  ) {
    try {
      const supplierApiUrl =
        process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn(
          "SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification"
        );
        return;
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
            orderNo,
            supplierTenantId,
            clinicTenantId,
            completedAt: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        this.logger.error(
          `Failed to notify supplier-backend of completion: ${response.status} ${errorText}`
        );
      } else {
        this.logger.log(
          `Order ${orderNo} completion notified to supplier-backend successfully`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error notifying supplier-backend of completion: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Delete order
   */
  /**
   * Cancel order - update status to cancelled
   */
  async cancelOrder(orderId: string, tenantId: string) {
    if (!orderId || !tenantId) {
      throw new BadRequestException("Order ID and Tenant ID are required");
    }

    // Find order
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

    // Check if order can be cancelled (only pending orders can be cancelled)
    if (order.status !== "pending") {
      throw new BadRequestException(
        `Order with status "${order.status}" cannot be cancelled. Only pending orders can be cancelled.`
      );
    }

    // Update status to cancelled
    await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.update({
        where: { id: orderId },
        data: {
          status: "cancelled",
          updated_at: new Date(),
        },
      });
    });

    this.logger.log(`Order ${order.order_no} cancelled`);

    return { success: true, message: "Order cancelled successfully" };
  }

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
}
