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

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  // ✅ Replaced Maps with CacheManagers
  private productsForOrderCache: CacheManager<any>;
  private pendingInboundCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService
  ) {
    this.productsForOrderCache = new CacheManager({
      maxSize: 100,
      ttl: 30000, // 30 seconds
      cleanupInterval: 60000,
      name: "OrderService:Products",
    });

    this.pendingInboundCache = new CacheManager({
      maxSize: 100,
      ttl: 30000, // 30 seconds
      cleanupInterval: 60000,
      name: "OrderService:PendingInbound",
    });
  }

  private async refreshProductsForOrderCacheInBackground(
    tenantId: string
  ): Promise<void> {
    try {
      // ... (getProductsForOrder ichidagi barcha logic'ni copy qiling)
    } catch (error) {
      // Error handling
    }
  }
  /**
   * Mahsulotlar ro'yxatini olish (barcha productlar)
   */
  async getProductsForOrder(tenantId: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const cacheKey = `products-for-order:${tenantId}`;
    const result = this.productsForOrderCache.getWithStaleCheck(cacheKey);

    if (result) {
      if (result.isStale) {
        // Stale cache - background'da yangilash
        this.refreshProductsForOrderCacheInBackground(tenantId).catch(() => {});
      }
      return result.data; // Return cached data (fresh or stale)
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
    const formattedProducts = products.map((product: any) => {
      // Get supplier info from ProductSupplier -> ClinicSupplierManager
      const supplierManager = product.productSupplier?.clinicSupplierManager;
      const supplierId = supplierManager?.id ?? null;
      const supplierName = supplierManager?.company_name ?? null;
      const managerName = supplierManager?.name ?? null;

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

    // Cache'ga saqlash
    this.productsForOrderCache.set(cacheKey, formattedProducts);

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

    // Cache'ni invalidate qilish
    this.clearProductsForOrderCache(tenantId);
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
        console.log(
          "📝 Step 2.5: Manual supplier SMS sent, continuing to EMAIL..."
        );

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

            const emailSent =
              await this.emailService.sendOrderNotificationEmail(
                supplierEmail,
                finalClinicName,
                order.order_no,
                order.total_amount,
                totalQuantity,
                finalClinicManagerName,
                products
              );

            if (emailSent) {
              this.logger.log(
                `Email sent to manual supplier: ${supplierEmail}`
              );
            }
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
          } else {
            const result: any = await response.json();

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
          } else if (
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ENOTFOUND")
          ) {
          } else {
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
              // Agar platform supplier bo'lsa, barcha ACTIVE manager'larga SMS yuborish
              if (group.isPlatformSupplier && group.supplierTenantId) {
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
                  // Agar managerId bo'lsa, faqat shu manager'ga SMS yuborish
                  // Agar bo'lmasa, barcha ACTIVE manager'larga SMS yuborish
                  const managersToNotify = group.managerId
                    ? allManagers.filter((m) => m.id === group.managerId)
                    : allManagers;

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

        console.log("📝 Before Promise.all(smsPromises)...");
        await Promise.all(smsPromises);
        console.log(
          "📝 After Promise.all(smsPromises) - SMS promises completed!"
        );
      } catch (error: any) {
        // Log error but don't fail the order creation
        console.log("💥 [SMS ERROR]:", error.message);
        this.logger.error(
          `Error sending SMS notifications: ${
            error?.message || "Unknown error"
          }`
        );
      }

      console.log("📝 Step 2.9: SMS section complete, moving to EMAIL...");
      console.log("📝 Step 3: Reached EMAIL notification section");

      // Send Email notification to supplier manager
      // Email yuborish supplier-backend API muvaffaqiyatli bo'lgan yoki bo'lmaganidan qat'iy nazar
      // (chunki email address mavjud bo'lsa, email yuborish kerak)
      try {
        // 🔍 DEBUG: Check what data we have
        console.log("\n🔍 [EMAIL DEBUG] ===== START =====");
        console.log("🔍 supplierManager:", supplierManager);
        console.log("🔍 supplierWithEmail:", supplierWithEmail);
        console.log("🔍 clinicSupplierManager:", clinicSupplierManager);

        // Get supplier email (priority: supplierManager.email1 > supplierManager.email2 > supplier.company_email > clinicSupplierManager.company_email > clinicSupplierManager.email1 > clinicSupplierManager.email2)
        const supplierEmail =
          supplierManager?.email1 ||
          supplierManager?.email2 ||
          supplierWithEmail?.company_email ||
          clinicSupplierManager?.company_email ||
          clinicSupplierManager?.email1 ||
          clinicSupplierManager?.email2 ||
          null;

        console.log("🔍 Resolved supplierEmail:", supplierEmail);

        if (supplierEmail) {
          console.log("✅ Email found! Attempting to send...");
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

          const emailSent = await this.emailService.sendOrderNotificationEmail(
            supplierEmail,
            finalClinicName,
            order.order_no,
            order.total_amount,
            totalQuantity,
            clinicManagerName,
            products
          );

          console.log("📧 Email send result:", emailSent);

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
          console.log("❌ No email found! Skipping email notification");
          this.logger.warn(
            `No email address found for supplier ${order.supplier_id} (checked SupplierManager.email1, SupplierManager.email2, Supplier.company_email, ClinicSupplierManager.company_email, ClinicSupplierManager.email1, ClinicSupplierManager.email2), skipping email notification`
          );
        }
        console.log("🔍 [EMAIL DEBUG] ===== END =====\n");
      } catch (emailError: any) {
        // Log error but don't fail the order creation
        console.log("💥 [EMAIL ERROR]:", emailError);
        this.logger.error(
          `Failed to send email notification to supplier: ${
            emailError?.message || "Unknown error"
          }`
        );
      }
    } catch (error: any) {
      console.log("💥 [OUTER ERROR] Function failed:", error.message);
      console.log("💥 Error stack:", error.stack);
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

      // If there are adjustments, log them for visibility
      if (adjustmentCount > 0) {
        adjustments.forEach((adj: any, idx: number) => {
          const product = order.items.find(
            (item: any) => item.id === adj.itemId
          )?.product;
          const productName = product?.name || adj.productName || "Unknown";
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

      // Filter out rejected orders that have already been confirmed
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

      const filteredOrders = orders.filter((order: any) => {
        if (
          order.status === "rejected" &&
          confirmedRejectedOrderIds.has(order.id)
        ) {
          return false;
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
            confirmedPrice: adjustment?.actualPrice || item.unit_price,
            quantityReason: adjustment?.quantityChangeReason || null,
            priceReason: adjustment?.priceChangeReason || null,
            expiryMonths: item.product?.expiry_months || null,
            expiryUnit: item.product?.expiry_unit || null,
            alertDays: item.product?.alert_days || null,
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

  private clearProductsForOrderCache(tenantId: string): void {
    const key = `products-for-order:${tenantId}`;
    this.productsForOrderCache.delete(key);
  }

  async getPendingInboundOrders(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const cached = this.getCachedPendingInbound(tenantId);
    if (cached) {
      if (cached.isStale) {
        this.refreshPendingInboundCacheInBackground(tenantId).catch(() => {});
      }
      return cached.data; // ✅ Stale yoki fresh
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
            } else {
              // Manual supplier - use denormalized fields from ClinicSupplierManager
              supplierInfo.companyName =
                clinicSupplierManager.company_name || "알 수 없음";
              supplierInfo.managerName = clinicSupplierManager.name || "";
              supplierInfo.managerPosition =
                clinicSupplierManager.position || "";
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

    // Cache the result
    this.setCachedPendingInbound(tenantId, result);

    return result;
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

    // Invalidate caches
    this.clearPendingInboundCache(tenantId);
    this.clearProductsForOrderCache(tenantId);

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
