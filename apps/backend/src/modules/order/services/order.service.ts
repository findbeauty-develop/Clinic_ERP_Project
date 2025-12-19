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

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly messageService: MessageService
  ) {}

  /**
   * Mahsulotlar ro'yxatini olish (barcha productlar)
   */
  async getProductsForOrder(
    tenantId: string
  ): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Barcha product'larni olish
    const products = await this.prisma.product.findMany({
      where: {
        tenant_id: tenantId,
      },
      include: {
        batches: true,
        supplierProducts: true,
      },
    });

    // Faqat basic formatting - hamma logic frontend'da
    return products.map((product: any) => {
      const supplier = product.supplierProducts?.[0];

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        supplierId: supplier?.supplier_id ?? null,
        supplierName: supplier?.company_name ?? null,
        managerName: supplier?.contact_name ?? null,
        managerPosition: null, // TODO: Get from SupplierManager via ClinicSupplierLink
        unitPrice: supplier?.purchase_price ?? product.purchase_price ?? null,
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
  async getOrCreateDraft(
    sessionId: string,
    tenantId: string
  ): Promise<any> {
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
        {
          supplierProducts: {
            some: {
              supplier_id: { contains: query.search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    // Supplier filter
    if (query.supplierId) {
      where.supplierProducts = {
        some: {
          supplier_id: query.supplierId,
        },
      };
    }

    // Total count
    const total = await this.prisma.product.count({ where });

    // Products olish
    const products = await this.prisma.executeWithRetry(async () => {
      return this.prisma.product.findMany({
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
          supplierProducts: {
            orderBy: { created_at: "desc" },
            take: 1, // Eng so'nggi supplier
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
    });

    const formattedProducts = products.map((product: any) => {
      const supplier = product.supplierProducts?.[0];
      const totalStock = product.batches.reduce(
        (sum: number, batch: any) => sum + batch.qty,
        0
      );

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        supplierId: supplier?.supplier_id ?? null,
        supplierName: supplier?.supplier_id ?? null,
        managerName: supplier?.contact_name ?? null,
        managerPosition: null, // TODO: Get from SupplierManager via ClinicSupplierLink
        unitPrice: supplier?.purchase_price ?? product.purchase_price ?? null,
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
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenant_id: tenantId },
      include: {
        supplierProducts: {
          where: dto.batchId
            ? undefined
            : {
                // Agar batchId yo'q bo'lsa, eng so'nggi supplier
              },
          orderBy: { created_at: "desc" },
          take: 1,
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

    // Supplier price
    const supplier = product.supplierProducts?.[0];
    if (supplier?.purchase_price) {
      unitPrice = supplier.purchase_price;
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

    // Supplier ID olish
    const supplierId = supplier?.supplier_id || null;

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
      const oldQty = items[existingItemIndex].quantity;
      const newQty = oldQty + dto.quantity;
      this.logger.log(`🔄 Updating existing item: ${dto.productId} - Old: ${oldQty}, Adding: ${dto.quantity}, New: ${newQty}`);
      
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
      this.logger.log(`➕ Added NEW item: ${dto.productId} - Qty: ${dto.quantity}`);
    }

    this.logger.log(`📝 Draft now has ${items.length} unique items`);
    this.logger.log(`📊 Total quantities by product:`);
    const qtyByProduct: Record<string, number> = {};
    items.forEach((item: any) => {
      qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.quantity;
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

    this.logger.log(`🔍 DEBUG: Saving draft - sessionId: ${sessionId}, tenantId: ${tenantId}, items count: ${items.length}`);
    this.logger.log(`🔍 DEBUG: Items to save: ${JSON.stringify(items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity, supplierId: i.supplierId })))}`);

    const updatedDraft = await this.orderRepository.createOrUpdateDraft(
      sessionId,
      tenantId,
      { items, total_amount: totalAmount },
      expiresAt
    );

    this.logger.log(`🔍 DEBUG: Draft saved successfully - items count in saved draft: ${Array.isArray(updatedDraft.items) ? updatedDraft.items.length : 0}`);

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

    this.logger.log(`🔍 DEBUG: updateDraftItem - sessionId: ${sessionId}, tenantId: ${tenantId}, itemId: ${itemId}`);

    const draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      this.logger.warn(`🔍 DEBUG: Draft not found - sessionId: ${sessionId}, tenantId: ${tenantId}`);
      throw new NotFoundException("Draft not found");
    }

    const items = Array.isArray(draft.items) ? draft.items : [];

    this.logger.log(`🔍 DEBUG: Retrieved draft - items count: ${items.length}`);
    this.logger.log(`🔍 DEBUG: Draft items: ${JSON.stringify(items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity })))}`);

    // Item'ni topish
    const itemIndex = items.findIndex(
      (item: any) => item.id === itemId
    );

    if (itemIndex < 0) {
      // Debug: draft'dagi barcha item ID'larni ko'rsatish
      const availableItemIds = items.map((item: any) => item.id);
      this.logger.warn(
        `Item not found. Looking for: ${itemId}, Available items: ${JSON.stringify(availableItemIds)}`
      );
      throw new NotFoundException(
        `Item not found in draft. Looking for: ${itemId}, Available item IDs: ${availableItemIds.join(", ")}`
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
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, tenant_id: tenantId },
          include: {
            supplierProducts: {
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
        });

        if (!product) {
          throw new NotFoundException(
            `Product not found: ${item.productId}`
          );
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

          // Supplier price
          const supplier = product.supplierProducts?.[0];
          if (supplier?.purchase_price) {
            unitPrice = supplier.purchase_price;
          }
        }

        const itemId = item.batchId
          ? `${item.productId}-${item.batchId}`
          : item.productId;

        const supplierId = null; // Supplier ID - optional field

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
    if (!tenantId || !sessionId) {
      throw new BadRequestException("Tenant ID and Session ID are required");
    }

    // Draft'ni olish
    this.logger.log(`🔍 DEBUG: createOrder - sessionId: ${sessionId}, tenantId: ${tenantId}`);

    const draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      this.logger.warn(`🔍 DEBUG: Draft not found - sessionId: ${sessionId}, tenantId: ${tenantId}`);
      throw new NotFoundException("Draft not found");
    }

    const items = Array.isArray(draft.items) ? draft.items : [];

    this.logger.log(`🔍 DEBUG: Total items from draft: ${items.length}`);
    this.logger.log(`🔍 DEBUG: Draft items: ${JSON.stringify(items.map(i => ({ id: i.id, productId: i.productId, supplierId: i.supplierId, quantity: i.quantity })))}`);

    if (items.length === 0) {
      throw new BadRequestException("Order must have at least one item");
    }

    // Validation: manfiy yoki 0 son emas
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(
          `Invalid quantity for item: ${item.productId}`
        );
      }

      // Product va batch mavjudligini tekshirish
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, tenant_id: tenantId },
      });

      if (!product) {
        throw new NotFoundException(`Product not found: ${item.productId}`);
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
    this.logger.log(`🔍 DEBUG: Starting grouping, total items: ${items.length}`);
    items.forEach((item, idx) => {
      this.logger.log(`🔍 DEBUG: Item ${idx + 1}: productId=${item.productId}, supplierId=${item.supplierId || "unknown"}, quantity=${item.quantity}`);
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

    this.logger.log(`🔍 DEBUG: Grouped into ${Object.keys(groupedBySupplier).length} suppliers`);
    for (const [supplierId, group] of Object.entries(groupedBySupplier)) {
      this.logger.log(`🔍 DEBUG: Supplier ${supplierId}: ${group.items.length} items`);
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

      createdOrders.push(await this.orderRepository.findById(order.id, tenantId));
      
      this.logger.log(`🔍 DEBUG: Sending order ${order.order_no} to supplier ${supplierId} with ${group.items.length} items`);
      
      // Send order to supplier-backend (SupplierOrder table)
      await this.sendOrderToSupplier(order, group, tenantId, createdBy);
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
                  supplierProducts: {
                    orderBy: { created_at: "desc" },
                    take: 1,
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
    const confirmedRejectedOrderIds = await this.prisma.executeWithRetry(async () => {
      const confirmedRejected = await (this.prisma as any).rejectedOrder.findMany({
        where: {
          tenant_id: tenantId,
        },
        select: {
          order_id: true,
        },
        distinct: ["order_id"],
      });
      return new Set(confirmedRejected.map((ro: any) => ro.order_id));
    });

    // Filter out rejected orders that haven't been confirmed
    const filteredOrders = orders.filter((order: any) => {
      // If order is rejected but not confirmed, exclude it from order history
      if (order.status === "rejected" && !confirmedRejectedOrderIds.has(order.id)) {
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
          if (item.product && item.product.supplierProducts && item.product.supplierProducts.length > 0) {
            const supplierProduct = item.product.supplierProducts[0];
            if (supplierProduct.supplier_id) {
              supplierIds.add(supplierProduct.supplier_id);
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

    // Collect all supplier_manager_ids from SupplierProducts for batch lookup
    const supplierManagerIds = new Set<string>();
    filteredOrders.forEach((order: any) => {
      if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
          if (item.product && item.product.supplierProducts && item.product.supplierProducts.length > 0) {
            const supplierProduct = item.product.supplierProducts[0];
            if (supplierProduct.supplier_manager_id) {
              supplierManagerIds.add(supplierProduct.supplier_manager_id);
            }
          }
        });
      }
    });

    // Fetch all SupplierManagers by their IDs
    const supplierManagersMap = new Map<string, any>();
    if (supplierManagerIds.size > 0) {
      const supplierManagers = await (this.prisma as any).supplierManager.findMany({
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

    return filteredOrders.map((order: any) => {
      // Supplier va manager ma'lumotlarini topish (items'dan)
      let supplierName = order.supplier_id || "공급업체 없음";
      let managerName = "";
      let supplierDetails: any = null;

      // Get supplier ID from order or items
      let supplierId: string | null = order.supplier_id || null;
      
      if (!supplierId && order.items && order.items.length > 0) {
        const firstItem = order.items[0];
        if (firstItem.product && firstItem.product.supplierProducts && firstItem.product.supplierProducts.length > 0) {
          supplierId = firstItem.product.supplierProducts[0].supplier_id || null;
        }
      }

      // Get SupplierProduct from first item
      let supplierProduct: any = null;
      if (order.items && order.items.length > 0) {
        const firstItem = order.items[0];
        if (firstItem.product && firstItem.product.supplierProducts && firstItem.product.supplierProducts.length > 0) {
          supplierProduct = firstItem.product.supplierProducts[0];
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
        
        // Manager ma'lumotlarini topish - Priority: supplier_manager_id > first manager > contact info
        let manager: any = null;
        
        // Variant 1: Use supplier_manager_id from SupplierProduct
        if (supplierProduct?.supplier_manager_id && supplierManagersMap.has(supplierProduct.supplier_manager_id)) {
          manager = supplierManagersMap.get(supplierProduct.supplier_manager_id);
        }
        
        // Variant 2: Fallback to first manager from supplier
        if (!manager && supplier.managers && supplier.managers.length > 0) {
          manager = supplier.managers[0];
        }
        
        // Variant 3: Use contact info from SupplierProduct
        if (manager) {
          managerName = manager.name || "";
          supplierDetails.managerName = manager.name || "";
          supplierDetails.managerPhone = manager.phone_number || null;
          supplierDetails.managerEmail = manager.email1 || null;
          supplierDetails.position = manager.position || null;
        } else if (supplierProduct) {
          managerName = supplierProduct.contact_name || "";
          supplierDetails.managerName = managerName;
          supplierDetails.managerPhone = supplierProduct.contact_phone || null;
          supplierDetails.managerEmail = supplierProduct.contact_email || null;
        }
      } else {
        // Fallback: try to get from supplierProducts
        if (supplierProduct) {
          const fallbackSupplierId = supplierProduct.supplier_id;
          
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
            
            // Manager ma'lumotlarini topish - Priority: supplier_manager_id > first manager > contact info
            let manager: any = null;
            
            // Variant 1: Use supplier_manager_id from SupplierProduct
            if (supplierProduct.supplier_manager_id && supplierManagersMap.has(supplierProduct.supplier_manager_id)) {
              manager = supplierManagersMap.get(supplierProduct.supplier_manager_id);
            }
            
            // Variant 2: Fallback to first manager from supplier
            if (!manager && supplier.managers && supplier.managers.length > 0) {
              manager = supplier.managers[0];
            }
            
            // Variant 3: Use contact info from SupplierProduct
            if (manager) {
              managerName = manager.name || "";
              supplierDetails.managerName = manager.name || "";
              supplierDetails.managerPhone = manager.phone_number || null;
              supplierDetails.managerEmail = manager.email1 || null;
              supplierDetails.position = manager.position || null;
            } else {
              managerName = supplierProduct.contact_name || "";
              supplierDetails.managerName = managerName;
              supplierDetails.managerPhone = supplierProduct.contact_phone || null;
              supplierDetails.managerEmail = supplierProduct.contact_email || null;
            }
          } else {
            // Last resort: use supplierProduct data
            supplierName = fallbackSupplierId || supplierName;
            managerName = supplierProduct.contact_name || "";
            
            // Create minimal supplierDetails from supplierProduct
            supplierDetails = {
              companyName: supplierName,
              managerName: managerName,
              managerPhone: supplierProduct.contact_phone || null,
              managerEmail: supplierProduct.contact_email || null,
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
    createdBy?: string
  ): Promise<void> {
    try {
      if (!order.supplier_id) {
        this.logger.warn(`Order ${order.order_no} has no supplier_id, skipping supplier notification`);
        return;
      }

      // Get supplier and manager info
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: order.supplier_id },
        include: {
          managers: {
            where: { status: "ACTIVE" },
            orderBy: { created_at: "asc" },
            take: 1,
          },
        },
      });

      if (!supplier || !supplier.tenant_id) {
        this.logger.warn(`Supplier ${order.supplier_id} not found or has no tenant_id`);
        return;
      }

      // Get SupplierProduct to find supplier_manager_id or contact_phone
      // IMPORTANT: Check ALL items to find the correct supplier_manager_id
      // If multiple products have different supplier_manager_id, use the most common one
      let supplierManager: any = null;
      let supplierPhoneNumber: string | null = null;
      let supplierProductRecord: any = null;

      if (group.items && group.items.length > 0) {
        this.logger.log(`🔍 DEBUG: sendOrderToSupplier - group.items.length: ${group.items.length}`);
        this.logger.log(`🔍 DEBUG: sendOrderToSupplier - First item: ${JSON.stringify(group.items[0])}`);
        if (group.items.length > 1) {
          this.logger.log(`🔍 DEBUG: sendOrderToSupplier - Last item: ${JSON.stringify(group.items[group.items.length - 1])}`);
        }

        // Collect all SupplierProducts for all items in this order
        // IMPORTANT: Use item.supplierId (from draft) instead of order.supplier_id
        const supplierManagerIdCounts = new Map<string, number>();
        const supplierProductsByManagerId = new Map<string, any>();

        for (const item of group.items) {
          if (item.productId) {
            // Use item.supplierId from draft, fallback to order.supplier_id
            const itemSupplierId = item.supplierId || order.supplier_id;
            
            this.logger.log(`🔍 Checking item: productId=${item.productId}, item.supplierId=${item.supplierId}, order.supplier_id=${order.supplier_id}, using supplierId=${itemSupplierId}`);
            
            const supplierProduct = await this.prisma.supplierProduct.findFirst({
              where: {
                product_id: item.productId,
                supplier_id: itemSupplierId, // Use item's supplierId, not order's
              },
              select: {
                id: true,
                supplier_manager_id: true,
                contact_phone: true,
                contact_name: true,
                company_name: true,
                supplier_id: true,
              },
            });

            if (supplierProduct) {
              this.logger.log(`✅ Found SupplierProduct: id=${supplierProduct.id}, supplier_id=${supplierProduct.supplier_id}, supplier_manager_id=${supplierProduct.supplier_manager_id}, contact_phone=${supplierProduct.contact_phone}, contact_name=${supplierProduct.contact_name}`);
              
              // Use first product as default (for contact_phone fallback)
              if (!supplierProductRecord) {
                supplierProductRecord = supplierProduct;
              }

              // Count supplier_manager_id occurrences
              if (supplierProduct.supplier_manager_id) {
                const count = supplierManagerIdCounts.get(supplierProduct.supplier_manager_id) || 0;
                supplierManagerIdCounts.set(supplierProduct.supplier_manager_id, count + 1);
                supplierProductsByManagerId.set(supplierProduct.supplier_manager_id, supplierProduct);
                this.logger.log(`📊 Item ${item.productId}: Found supplier_manager_id ${supplierProduct.supplier_manager_id} for supplier ${itemSupplierId} (count: ${count + 1})`);
              } else {
                this.logger.log(`⚠️ Item ${item.productId}: No supplier_manager_id found, contact_phone: ${supplierProduct.contact_phone}, contact_name: ${supplierProduct.contact_name}`);
              }
            } else {
              this.logger.warn(`❌ Item ${item.productId}: No SupplierProduct found for supplier ${itemSupplierId}`);
            }
          }
        }

        // Find the most common supplier_manager_id (or use the first one if all are unique)
        let mostCommonManagerId: string | null = null;
        let maxCount = 0;
        for (const [managerId, count] of supplierManagerIdCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            mostCommonManagerId = managerId;
          }
        }

        this.logger.log(`SupplierManager ID counts: ${JSON.stringify(Array.from(supplierManagerIdCounts.entries()))}`);
        this.logger.log(`Most common supplier_manager_id: ${mostCommonManagerId} (count: ${maxCount})`);

        // Variant 1: If supplier_manager_id exists in SupplierProduct (product was created with registered supplier)
        if (mostCommonManagerId) {
          supplierManager = await this.prisma.supplierManager.findUnique({
            where: { id: mostCommonManagerId },
            select: {
              id: true,
              name: true,
              phone_number: true,
              email1: true,
              position: true,
            },
          });
          if (supplierManager) {
            this.logger.log(`✅ Found SupplierManager by supplier_manager_id (most common): ${supplierManager.id}, name: ${supplierManager.name}, phone: ${supplierManager.phone_number} (used in ${maxCount} products)`);
            // Update supplierProductRecord to the one with this manager_id for potential update
            supplierProductRecord = supplierProductsByManagerId.get(mostCommonManagerId);
          } else {
            this.logger.warn(`❌ SupplierManager ${mostCommonManagerId} not found in database`);
          }
        } else {
          this.logger.log(`⚠️ No supplier_manager_id found in any SupplierProduct`);
        }

        // Variant 2: If supplier_manager_id doesn't exist, try to find by contact_phone
        // (supplier might have registered on platform after product was created)
        if (!supplierManager && supplierProductRecord?.contact_phone) {
          supplierManager = await this.prisma.supplierManager.findFirst({
            where: {
              phone_number: supplierProductRecord.contact_phone,
              status: "ACTIVE",
            },
          });

          if (supplierManager) {
            this.logger.log(`Found SupplierManager by contact_phone: ${supplierManager.id}, updating SupplierProduct`);
            
            // Update SupplierProduct with supplier_manager_id for future orders
            if (supplierProductRecord.id) {
              try {
                await this.prisma.supplierProduct.update({
                  where: { id: supplierProductRecord.id },
                  data: { supplier_manager_id: supplierManager.id },
                });
                this.logger.log(`Updated SupplierProduct ${supplierProductRecord.id} with supplier_manager_id`);
              } catch (updateError: any) {
                // Log but don't fail - update is optional
                this.logger.warn(`Failed to update SupplierProduct with supplier_manager_id: ${updateError?.message}`);
              }
            }
          } else {
            // No SupplierManager found, use contact_phone for SMS
            supplierPhoneNumber = supplierProductRecord.contact_phone;
            this.logger.log(`No SupplierManager found, will use contact_phone for SMS: ${supplierPhoneNumber}`);
          }
        }
      }

      // Variant 3: Fallback - first created SupplierManager (legacy behavior)
      if (!supplierManager) {
        const fallbackManager = supplier.managers?.[0];
        if (fallbackManager) {
          supplierManager = fallbackManager;
          this.logger.log(`Using fallback SupplierManager (first created): ${supplierManager.id}`);
        } else {
          // Last resort: try to get phone from SupplierProduct by supplier_id
          if (!supplierPhoneNumber) {
            const supplierProductBySupplier = await this.prisma.supplierProduct.findFirst({
              where: {
                supplier_id: order.supplier_id,
                contact_phone: { not: null },
              },
              select: {
                contact_phone: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            });
            
            if (supplierProductBySupplier?.contact_phone) {
              supplierPhoneNumber = supplierProductBySupplier.contact_phone;
              this.logger.log(`Found phone number from SupplierProduct (by supplier_id): ${supplierPhoneNumber}`);
            }
          }

          if (!supplierPhoneNumber) {
            this.logger.warn(`No SupplierManager or phone number found for supplier ${order.supplier_id}, SMS will not be sent`);
          }
        }
      }

      // Get clinic info
      this.logger.log(`Looking for clinic with tenantId: ${tenantId}`);
      const clinic = await this.prisma.clinic.findFirst({
        where: { tenant_id: tenantId },
      });
      
      // Get member info (created_by) - also used for clinic name fallback
      let clinicManagerName = createdBy || "담당자";
      let clinicNameFallback = null;
      
      if (createdBy) {
        const member = await this.prisma.member.findFirst({
          where: { 
            id: createdBy,
            tenant_id: tenantId 
          },
        });
        if (member) {
          clinicManagerName = member.full_name || member.member_id;
          clinicNameFallback = member.clinic_name; // Fallback clinic name from member
        }
      }
      
      // Use clinic.name or fallback to member.clinic_name
      const finalClinicName = clinic?.name || clinicNameFallback || "알 수 없음";
      
      this.logger.log(`Found clinic: ${finalClinicName} (from ${clinic ? 'Clinic table' : 'Member fallback'})`);

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
      const supplierOrderData = {
        orderNo: order.order_no,
        supplierTenantId: supplier.tenant_id,
        supplierManagerId: supplierManager?.id || null, // From SupplierProduct.supplier_manager_id or contact_phone match
        clinicTenantId: tenantId,
        clinicName: finalClinicName,
        clinicManagerName: clinicManagerName,
        totalAmount: order.total_amount,
        memo: order.memo,
        items: itemsWithDetails,
      };

      this.logger.log(`Sending order to supplier-backend: clinicName=${finalClinicName}, manager=${clinicManagerName}`);
      this.logger.log(`📦 Order items count: ${itemsWithDetails.length}`);
      itemsWithDetails.forEach((item, idx) => {
        this.logger.log(`  Item ${idx + 1}: ${item.productName} - Qty: ${item.quantity}`);
      });


      // Prepare supplier phone number for SMS (even if API fails, we can still send SMS)
      // Priority: supplierManager.phone_number > supplierPhoneNumber (from SupplierProduct) > supplier.company_phone
      const finalSupplierPhoneNumber = 
        supplierManager?.phone_number || 
        supplierPhoneNumber || 
        supplier.company_phone;

      // Call supplier-backend API
      const supplierApiUrl = process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;
      
      let supplierBackendSuccess = false;
      
      if (!apiKey) {
        this.logger.warn('SUPPLIER_BACKEND_API_KEY not configured, skipping supplier-backend API call');
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
            const errorText = await response.text().catch(() => "Unknown error");
            this.logger.error(`Failed to send order to supplier-backend: ${response.status} ${errorText}`);
          } else {
            const result: any = await response.json();
            this.logger.log(`Order ${order.order_no} sent to supplier-backend successfully: ${result.id}`);
            supplierBackendSuccess = true;
          }
        } catch (fetchError: any) {
          // Clear timeout if it wasn't already cleared
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          
          // Network error (connection refused, timeout, etc.)
          const errorMessage = fetchError?.message || String(fetchError);
          const errorName = fetchError?.name || '';
          
          if (errorName === 'AbortError' || errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
            this.logger.error(`Supplier-backend API request timed out after 10 seconds. URL: ${supplierApiUrl}`);
          } else if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            this.logger.error(`Cannot connect to supplier-backend at ${supplierApiUrl}. Is supplier-backend running? Error: ${errorMessage}`);
            this.logger.error(`Please check: 1) Supplier-backend is running, 2) SUPPLIER_BACKEND_URL is correct in .env`);
          } else {
            this.logger.error(`Error calling supplier-backend API: ${errorMessage}`);
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
          const totalQuantity = itemsWithDetails.reduce((sum: number, item: any) => {
            return sum + (item.quantity || 0);
          }, 0);
          
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
            ? 'SupplierManager' 
            : supplierPhoneNumber 
            ? 'SupplierProduct' 
            : 'Supplier.company_phone';
          this.logger.log(`Order notification SMS sent to supplier: ${finalSupplierPhoneNumber} (source: ${phoneSource})`);
        } catch (smsError: any) {
          // Log error but don't fail the order creation
          this.logger.error(`Failed to send SMS notification to supplier: ${smsError?.message || 'Unknown error'}`);
        }
      } else {
        this.logger.warn(`No phone number found for supplier ${order.supplier_id} (checked SupplierManager, SupplierProduct, and Supplier.company_phone), skipping SMS notification`);
      }
    } catch (error: any) {
      this.logger.error(`Error sending order to supplier-backend: ${error.message}`, error.stack);
      // Don't throw - order already created in clinic DB, supplier notification is optional
    }
  }

  /**
   * Update order from supplier confirmation callback
   */
  async updateOrderFromSupplier(dto: any) {
    const { orderNo, clinicTenantId, status, confirmedAt, adjustments, updatedItems, totalAmount, rejectionReasons } = dto;

    if (!orderNo || !clinicTenantId) {
      throw new BadRequestException("Order number and clinic tenant ID are required");
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
            orderItem = order.items.find((item: any) => 
              item.product_id === updatedItem.productId
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
        orderBy: [
          { confirmed_at: "desc" },
          { order_date: "desc" },
        ],
      });
    });

    // Filter out rejected orders that have already been confirmed (have RejectedOrder records)
    const confirmedRejectedOrderIds = await this.prisma.executeWithRetry(async () => {
      const confirmedRejected = await (this.prisma as any).rejectedOrder.findMany({
        where: {
          tenant_id: tenantId,
        },
        select: {
          order_id: true,
        },
        distinct: ["order_id"],
      });
      return new Set(confirmedRejected.map((ro: any) => ro.order_id));
    });

    // Filter out orders that are rejected and already confirmed
    const filteredOrders = orders.filter((order: any) => {
      if (order.status === "rejected" && confirmedRejectedOrderIds.has(order.id)) {
        return false; // Exclude this rejected order as it's already been confirmed
      }
      return true;
    });


    // Group by supplier
    const grouped: Record<string, any> = {};

    for (const order of filteredOrders) {
      const supplierId = order.supplier_id || "unknown";
      
      if (!grouped[supplierId]) {
        // Get supplier info
        let supplierInfo = { companyName: "알 수 없음", managerName: "" };
        if (order.supplier_id) {
          const supplier = await (this.prisma as any).supplier.findUnique({
            where: { id: order.supplier_id },
            include: {
              managers: {
                where: { status: "ACTIVE" },
                take: 1,
              },
            },
          });
          if (supplier) {
            supplierInfo.companyName = supplier.company_name;
            supplierInfo.managerName = supplier.managers?.[0]?.name || "";
          }
        }

        grouped[supplierId] = {
          supplierId: supplierId,
          supplierName: supplierInfo.companyName,
          managerName: supplierInfo.managerName,
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
          adjustment = adjustments.find((adj: any) => adj.productId === item.product_id);
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

      // Get creator member info
      let createdByName = "알 수 없음";
      if (order.created_by) {
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

    const { orderId, orderNo, companyName, managerName, memberName, items } = dto;

    if (!orderId || !orderNo || !companyName || !managerName || !memberName || !items || !Array.isArray(items)) {
      throw new BadRequestException("All fields are required: orderId, orderNo, companyName, managerName, memberName, items");
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
        supplierPositionMap.set(supplier.id, supplier.managers[0].position || null);
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
        // Get supplier's tenant_id from Supplier table
        const supplier = await this.prisma.executeWithRetry(async () => {
          return await (this.prisma as any).supplier.findUnique({
            where: { id: order.supplier_id },
            select: { tenant_id: true },
          });
        });

        if (supplier && supplier.tenant_id) {
          this.logger.log(`Notifying supplier-backend: orderNo=${order.order_no}, supplierTenantId=${supplier.tenant_id}, clinicTenantId=${tenantId}`);
          await this.notifySupplierOrderCompleted(order.order_no, supplier.tenant_id, tenantId);
        } else {
          this.logger.warn(`Supplier ${order.supplier_id} not found or missing tenant_id, skipping notification`);
        }
      } catch (error: any) {
        this.logger.error(`Failed to notify supplier-backend of order completion: ${error.message}`);
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
      const supplierApiUrl = process.env.SUPPLIER_BACKEND_URL || "http://localhost:3002";
      const apiKey = process.env.SUPPLIER_BACKEND_API_KEY;

      if (!apiKey) {
        this.logger.warn('SUPPLIER_BACKEND_API_KEY not configured, skipping supplier notification');
        return;
      }

      const response = await fetch(`${supplierApiUrl}/supplier/orders/complete`, {
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
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        this.logger.error(`Failed to notify supplier-backend of completion: ${response.status} ${errorText}`);
      } else {
        this.logger.log(`Order ${orderNo} completion notified to supplier-backend successfully`);
      }
    } catch (error: any) {
      this.logger.error(`Error notifying supplier-backend of completion: ${error.message}`, error.stack);
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
      throw new BadRequestException(`Order with status "${order.status}" cannot be cancelled. Only pending orders can be cancelled.`);
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

