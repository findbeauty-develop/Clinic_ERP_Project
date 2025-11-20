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
import { OrderProductsQueryDto } from "../dto/order-products-query.dto";

export interface ProductWithRisk {
  id: string;
  productName: string;
  brand: string;
  supplierId: string | null;
  supplierName: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  unitPrice: number | null;
  currentStock: number;
  minStock: number;
  safeStock: number; // minStock bilan bir xil yoki config'dan
  stockRatio: number; // SR
  expiryRatio: number; // ER
  riskScore: number; // R
  riskLevel: "high" | "medium" | "low";
  riskColor: string;
  batches: Array<{
    id: string;
    batchNo: string;
    expiryDate: string | null;
    qty: number;
    purchasePrice: number | null;
  }>;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  // Risk score hisoblash uchun koeffitsientlar (config'dan olish mumkin)
  private readonly ALPHA = parseFloat(process.env.ORDER_RISK_ALPHA || "0.6"); // Stock ratio weight
  private readonly BETA = parseFloat(process.env.ORDER_RISK_BETA || "0.4"); // Expiry ratio weight
  private readonly DRAFT_EXPIRY_HOURS = 24; // Draft expiration time

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository
  ) {}

  /**
   * Mahsulotlar ro'yxatini risk score bilan chiqarish
   */
  async getProductsForOrder(
    tenantId: string,
    query: OrderProductsQueryDto
  ): Promise<ProductWithRisk[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Barcha product'larni olish (batches va supplierProducts bilan)
    const products = await this.prisma.executeWithRetry(async () => {
      const where: Prisma.ProductWhereInput = {
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

      return this.prisma.product.findMany({
        where,
        include: {
          batches: {
            where: {
              qty: { gt: 0 }, // Faqat zaxirasi bor batch'lar
            },
            orderBy: [
              { expiry_date: "asc" }, // FEFO: eng yaqin muddatli batch birinchi
              { created_at: "asc" },
            ],
          },
          supplierProducts: {
            orderBy: { created_at: "desc" },
            take: 1, // Eng so'nggi supplier
          },
        },
        orderBy: { created_at: "desc" },
      });
    });

    // Har bir product uchun risk score hisoblash
    const productsWithRisk: (ProductWithRisk | null)[] = products.map((product) => {
      const latestBatch = product.batches?.[0];
      const supplier = product.supplierProducts?.[0];

      // Safe stock = minStock (yoki config'dan olish mumkin)
      const safeStock = product.min_stock || 0;

      // Stock Ratio (SR) = current_stock / safeStock
      const stockRatio =
        safeStock > 0 ? product.current_stock / safeStock : 0;

      // Expiry Ratio (ER) hisoblash
      let expiryRatio = 1; // Default: muddati uzoq
      if (latestBatch?.expiry_date) {
        const now = new Date();
        const expiryDate = new Date(latestBatch.expiry_date);
        const totalDays =
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        // Agar batch'ning manufacture_date bo'lsa, umumiy yaroqlilik kunlarini hisoblash
        if (latestBatch.manufacture_date) {
          const manufactureDate = new Date(latestBatch.manufacture_date);
          const totalExpiryDays =
            (expiryDate.getTime() - manufactureDate.getTime()) /
            (1000 * 60 * 60 * 24);
          if (totalExpiryDays > 0) {
            expiryRatio = Math.max(0, Math.min(1, totalDays / totalExpiryDays));
          }
        } else {
          // Agar manufacture_date yo'q bo'lsa, default 365 kun deb olamiz
          const defaultTotalDays = 365;
          expiryRatio = Math.max(0, Math.min(1, totalDays / defaultTotalDays));
        }
      }

      // Risk Score (R) = α × (1 - SR) + β × (1 - ER)
      const riskScore =
        this.ALPHA * (1 - stockRatio) + this.BETA * (1 - expiryRatio);

      // Risk level va color aniqlash
      let riskLevel: "high" | "medium" | "low";
      let riskColor: string;

      if (riskScore >= 0.7) {
        riskLevel = "high";
        riskColor = "red"; // Yuqori xavf
      } else if (riskScore >= 0.4) {
        riskLevel = "medium";
        riskColor = "yellow"; // O'rta xavf
      } else {
        riskLevel = "low";
        riskColor = "green"; // Past xavf
      }

      // Risk score filter
      if (query.minRiskScore !== undefined && riskScore < query.minRiskScore) {
        return null;
      }
      if (query.maxRiskScore !== undefined && riskScore > query.maxRiskScore) {
        return null;
      }
      if (query.riskLevel && riskLevel !== query.riskLevel) {
        return null;
      }

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        supplierId: supplier?.supplier_id ?? null,
        supplierName: supplier?.supplier_id ?? null,
        batchNo: latestBatch?.batch_no ?? null,
        expiryDate: latestBatch?.expiry_date
          ? latestBatch.expiry_date.toISOString().split("T")[0]
          : null,
        unitPrice: supplier?.purchase_price ?? product.purchase_price ?? null,
        currentStock: product.current_stock,
        minStock: product.min_stock,
        safeStock: safeStock,
        stockRatio: stockRatio,
        expiryRatio: expiryRatio,
        riskScore: riskScore,
        riskLevel: riskLevel,
        riskColor: riskColor,
        batches: product.batches.map((batch) => ({
          id: batch.id,
          batchNo: batch.batch_no,
          expiryDate: batch.expiry_date
            ? batch.expiry_date.toISOString().split("T")[0]
            : null,
          qty: batch.qty,
          purchasePrice: batch.purchase_price ?? null,
        })),
      };
    });

    // Null'larni olib tashlash va risk score bo'yicha tartiblash
    const filteredProducts = productsWithRisk
      .filter((p): p is ProductWithRisk => p !== null)
      .sort((a, b) => b.riskScore - a.riskScore); // Yuqori risk birinchi

    return filteredProducts;
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
      items[existingItemIndex] = {
        ...items[existingItemIndex],
        quantity: items[existingItemIndex].quantity + dto.quantity,
        totalPrice:
          (items[existingItemIndex].quantity + dto.quantity) * unitPrice,
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

    return this.formatDraftResponse(updatedDraft);
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

        const supplierId = product.supplierProducts?.[0]?.supplier_id || null;

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

    // Order number yaratish
    const orderNo = await this.generateOrderNumber(tenantId);

    // Order yaratish
    const order = await this.prisma.$transaction(async (tx: any) => {
      const order = await (tx as any).order.create({
        data: {
          tenant_id: tenantId,
          order_no: orderNo,
          status: "pending",
          supplier_id: dto.supplierId ?? null,
          total_amount: draft.total_amount,
          expected_delivery_date: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : null,
          created_by: createdBy ?? null,
          memo: dto.memo ?? null,
        },
      });

      // Order items yaratish
      await Promise.all(
        items.map((item: any) =>
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

      // Draft'ni o'chirish
      await (tx as any).orderDraft.delete({
        where: {
          tenant_id_session_id: {
            tenant_id: tenantId,
            session_id: sessionId,
          },
        },
      });

      return order;
    });

    return this.orderRepository.findById(order.id, tenantId);
  }

  /**
   * Order number yaratish
   */
  private async generateOrderNumber(tenantId: string): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    const count = await (this.prisma as any).order.count({
      where: {
        tenant_id: tenantId,
        order_no: {
          startsWith: `ORDER-${dateStr}`,
        },
      },
    });

    return `ORDER-${dateStr}-${String(count + 1).padStart(4, "0")}`;
  }

  /**
   * Draft response formatlash
   */
  private formatDraftResponse(draft: any): any {
    const items = Array.isArray(draft.items) ? draft.items : [];

    // Supplier bo'yicha grouping
    const supplierGroups: Record<string, any> = {};
    let totalAmount = 0;

    for (const item of items) {
      const supplierId = item.supplierId || "unknown";
      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          supplierId: supplierId,
          items: [],
          totalAmount: 0,
        };
      }
      supplierGroups[supplierId].items.push(item);
      supplierGroups[supplierId].totalAmount += item.totalPrice || 0;
      totalAmount += item.totalPrice || 0;
    }

    return {
      id: draft.id,
      sessionId: draft.session_id,
      items: items,
      totalAmount: totalAmount,
      groupedBySupplier: Object.values(supplierGroups),
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
      expiresAt: draft.expires_at,
    };
  }
}

