import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { OrderRepository } from "../repositories/order.repository";
import { CreateOrderDto } from "../dto/create-order.dto";
import {
  UpdateOrderDraftDto,
  AddOrderDraftItemDto,
  UpdateOrderDraftItemDto,
} from "../dto/update-order-draft.dto";
import { SearchProductsQueryDto } from "../dto/search-products-query.dto";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository
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
        supplierName: supplier?.supplier_id ?? null,
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

    const supplierId = null; // Supplier ID - optional field

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
      items[existingItemIndex] = {
        ...items[existingItemIndex],
        quantity: items[existingItemIndex].quantity + dto.quantity,
        totalPrice:
          (items[existingItemIndex].quantity + dto.quantity) * unitPrice,
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
    const draft = await this.orderRepository.findDraftBySession(
      sessionId,
      tenantId
    );

    if (!draft) {
      throw new NotFoundException("Draft not found");
    }

    const items = Array.isArray(draft.items) ? draft.items : [];

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
    }

    // Draft'ni o'chirish (barcha order'lar yaratilgandan keyin)
    await this.prisma.$transaction(async (tx: any) => {
      await (tx as any).orderDraft.delete({
        where: {
          tenant_id_session_id: {
            tenant_id: tenantId,
            session_id: sessionId,
          },
        },
      });
    });

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

    // Format orders for frontend
    // First, collect all unique supplier IDs
    const supplierIds = new Set<string>();
    orders.forEach((order: any) => {
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

    return orders.map((order: any) => {
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
        
        // Manager ma'lumotlarini topish
        if (supplier.managers && supplier.managers.length > 0) {
          const manager = supplier.managers[0];
          managerName = manager.name || "";
          supplierDetails.managerName = manager.name || "";
          supplierDetails.managerPhone = manager.phone_number || manager.phoneNumber || null;
          supplierDetails.managerEmail = manager.email1 || manager.email || null;
          supplierDetails.position = manager.position || null;
        } else if (order.items && order.items.length > 0) {
          const firstItem = order.items[0];
          if (firstItem.product && firstItem.product.supplierProducts && firstItem.product.supplierProducts.length > 0) {
            managerName = firstItem.product.supplierProducts[0].contact_name || "";
            supplierDetails.managerName = managerName;
            supplierDetails.managerPhone = firstItem.product.supplierProducts[0].contact_phone || null;
            supplierDetails.managerEmail = firstItem.product.supplierProducts[0].contact_email || null;
          }
        }
      } else {
        // Fallback: try to get from supplierProducts
        if (order.items && order.items.length > 0) {
          const firstItem = order.items[0];
          if (firstItem.product && firstItem.product.supplierProducts && firstItem.product.supplierProducts.length > 0) {
            const supplierProduct = firstItem.product.supplierProducts[0];
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
              
              if (supplier.managers && supplier.managers.length > 0) {
                const manager = supplier.managers[0];
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
}

