import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { CreateBatchDto, CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { ClinicSupplierHelperService } from "../../supplier/services/clinic-supplier-helper.service";
import { CacheManager } from "../../../common/cache";

@Injectable()
export class ProductsService {
  // ✅ Replaced Map with CacheManager - automatic cleanup, size limits, LRU eviction
  private productsCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicSupplierHelper: ClinicSupplierHelperService,
    @Inject(
      forwardRef(() => {
        // Lazy import to avoid circular dependency
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {
          OutboundService,
        } = require("../../outbound/services/outbound.service");
        return OutboundService;
      })
    )
    private readonly outboundService?: any
  ) {
    // Initialize CacheManager with auto-cleanup
    this.productsCache = new CacheManager({
      maxSize: 100, // Max 100 tenants cached
      ttl: 30000, // 30 seconds
      cleanupInterval: 60000, // Cleanup every minute
      name: "ProductsService",
    });
  }

  // Cache helper methods
  private getCacheKey(tenantId: string): string {
    return `products:${tenantId}`;
  }

  private getCachedData(
    tenantId: string
  ): { data: any; isStale: boolean } | null {
    const key = this.getCacheKey(tenantId);
    const result = this.productsCache.getWithStaleCheck(key);
    return result;
  }
  private async refreshProductsCacheInBackground(
    tenantId: string
  ): Promise<void> {
    try {
      // Parallel fetching - 3 ta query bir vaqtda (3x tezroq)
      const [products, returnPolicies, productSuppliers] = await Promise.all([
        // 1. Products va batches
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma.product.findMany as any)({
            where: { tenant_id: tenantId },
            select: {
              id: true,
              name: true,
              brand: true,
              barcode: true,
              image_url: true,
              category: true,
              status: true,
              current_stock: true,
              min_stock: true,
              purchase_price: true,
              sale_price: true,
              unit: true,
              usage_capacity: true,
              capacity_unit: true,
              capacity_per_product: true,
              storage: true,
              expiry_months: true,
              expiry_unit: true,
              alert_days: true,
              created_at: true,
              batches: {
                select: {
                  id: true,
                  batch_no: true,
                  qty: true,
                  expiry_date: true,
                  storage: true,
                  alert_days: true,
                  created_at: true,
                },
                orderBy: { created_at: "desc" },
                take: 1, // Faqat eng so'nggi batch
              },
            },
            orderBy: { created_at: "desc" },
          });
        }),

        // 2. ReturnPolicies (parallel)
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma.returnPolicy.findMany as any)({
            where: { tenant_id: tenantId },
            select: {
              product_id: true,
              note: true,
            },
          });
        }),

        // 3. ProductSuppliers va ClinicSupplierManagers (parallel)
        this.prisma.executeWithRetry(async () => {
          return await (this.prisma.productSupplier.findMany as any)({
            where: { tenant_id: tenantId },
            select: {
              product_id: true,
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
          });
        }),
      ]);

      // In-memory mapping (tezroq)
      const returnPolicyMap = new Map(
        returnPolicies.map((rp: any) => [rp.product_id, rp])
      );
      const supplierMap = new Map(
        productSuppliers.map((ps: any) => [ps.product_id, ps])
      );

      // Format products
      const formattedProducts = products.map((product: any) => {
        const latestBatch = product.batches?.[0];
        const returnPolicy: any = returnPolicyMap.get(product.id);
        const productSupplier: any = supplierMap.get(product.id);
        const supplierManager: any = productSupplier?.clinicSupplierManager;

        return {
          id: product.id,
          productName: product.name,
          brand: product.brand,
          barcode: product.barcode,
          productImage: product.image_url,
          category: product.category,
          status: product.status,
          currentStock: product.current_stock,
          minStock: product.min_stock,
          purchasePrice: product.purchase_price,
          salePrice: product.sale_price,
          unit: product.unit,
          usageCapacity: product.usage_capacity,
          usageCapacityUnit: product.capacity_unit,
          capacityPerProduct: product.capacity_per_product,
          capacityUnit: product.capacity_unit,
          supplierName: supplierManager?.company_name ?? null,
          managerName: supplierManager?.name ?? null,
          supplierId: supplierManager?.id ?? null,
          expiryDate: latestBatch?.expiry_date ?? null,
          storageLocation: latestBatch?.storage ?? product.storage ?? null,
          productStorage: product.storage ?? null,
          memo: returnPolicy?.note ?? null,
          expiryMonths: product.expiry_months ?? null,
          expiryUnit: product.expiry_unit ?? null,
          isLowStock: product.current_stock < product.min_stock,
          batches: product.batches || [],
        };
      });

      // Cache'ga saqlash
      this.setCachedData(tenantId, formattedProducts);
    } catch (error) {
      // Error handling (user'ga ko'rsatilmaydi)
    }
  }

  private setCachedData(tenantId: string, data: any): void {
    const key = this.getCacheKey(tenantId);
    this.productsCache.set(key, data);
  }

  // ETag uchun cache timestamp olish
  getCacheTimestamp(tenantId: string): number {
    const key = this.getCacheKey(tenantId);
    const cached = this.productsCache.getWithStaleCheck(key);
    return cached ? Date.now() : 0; // Return current time if cached, 0 if not
  }

  private clearProductsCache(tenantId: string): void {
    const key = this.getCacheKey(tenantId);
    this.productsCache.delete(key);
  }

  /**
   * Format a single product for cache (same format as getAllProducts)
   */
  private formatProductForCache(
    product: any,
    returnPolicy?: any,
    productSupplier?: any
  ): any {
    const latestBatch = product.batches?.[0];
    const supplierManager: any = productSupplier?.clinicSupplierManager;

    return {
      id: product.id,
      productName: product.name,
      brand: product.brand,
      barcode: product.barcode,
      productImage: product.image_url,
      category: product.category,
      status: product.status,
      currentStock: product.current_stock,
      minStock: product.min_stock,
      purchasePrice: product.purchase_price,
      salePrice: product.sale_price,
      unit: product.unit,
      usageCapacity: product.usage_capacity,
      usageCapacityUnit: product.capacity_unit,
      capacityPerProduct: product.capacity_per_product,
      capacityUnit: product.capacity_unit,
      supplierName: supplierManager?.company_name ?? null,
      managerName: supplierManager?.name ?? null,
      supplierId: supplierManager?.id ?? null,
      expiryDate: latestBatch?.expiry_date ?? null,
      storageLocation: latestBatch?.storage ?? product.storage ?? null,
      productStorage: product.storage ?? null,
      memo: returnPolicy?.note ?? null,
      expiryMonths: product.expiry_months ?? null,
      expiryUnit: product.expiry_unit ?? null,
      isLowStock: product.current_stock < product.min_stock,
      batches: product.batches || [],
    };
  }

  /**
   * Add new product to cache instead of invalidating (optimized approach)
   */
  private addProductToCache(tenantId: string, product: any): void {
    const key = this.getCacheKey(tenantId);
    const result = this.productsCache.getWithStaleCheck(key);

    if (result && result.data) {
      const cached = result.data;
      // Format new product
      const returnPolicy = product.returnPolicy;
      const productSupplier = product.productSupplier?.[0];
      const formattedProduct = this.formatProductForCache(
        product,
        returnPolicy,
        productSupplier
      );

      // Check if product already exists in cache (update case)
      const existingIndex = cached.findIndex((p: any) => p.id === product.id);

      if (existingIndex >= 0) {
        // Update existing product
        cached[existingIndex] = formattedProduct;
      } else {
        // Add new product at the beginning (most recent first)
        cached.unshift(formattedProduct);
      }

      // Update cache with modified data
      this.productsCache.set(key, cached);
    } else {
      // Cache doesn't exist, invalidate to force refresh on next request
      this.clearProductsCache(tenantId);
    }
  }

  /**
   * Remove product from cache instead of invalidating (optimized approach)
   */
  private removeProductFromCache(tenantId: string, productId: string): void {
    const key = this.getCacheKey(tenantId);
    const result = this.productsCache.getWithStaleCheck(key);

    if (result && result.data) {
      // Remove product from cache array
      const filteredData = result.data.filter((p: any) => p.id !== productId);

      // Update cache with filtered data
      this.productsCache.set(key, filteredData);
    } else {
      // Cache doesn't exist, invalidate to force refresh on next request
      this.clearProductsCache(tenantId);
    }
  }

  async createProduct(dto: CreateProductDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    let imageUrl: string | undefined;

    if (dto.image) {
      const [savedImage] = await saveBase64Images(
        "product",
        [dto.image],
        tenantId
      );
      imageUrl = savedImage;
    }

    const createdProductFromTransaction = await this.prisma.$transaction(
      async (tx: any) => {
        const resolvedStatus =
          dto.status ?? (dto.isActive === false ? "단종" : "활성");
        const resolvedIsActive =
          dto.isActive ??
          (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

        // ✅ NEW: Find or create ClinicSupplierManager
        let clinicSupplierManagerId: string;

        if (dto.suppliers && dto.suppliers.length > 0) {
          const s = dto.suppliers[0]; // Birinchi supplier olinadi

          const supplierManager =
            await this.clinicSupplierHelper.findOrCreateSupplierManager(
              tenantId,
              {
                supplier_id: s.supplier_id,
                company_name: s.company_name,
                business_number: s.business_number,
                company_phone: s.company_phone,
                company_email: s.company_email,
                company_address: s.company_address,
                contact_name: s.contact_name,
                contact_phone: s.contact_phone,
                contact_email: s.contact_email,
              }
            );

          clinicSupplierManagerId = supplierManager.id;
        } else {
          // Default supplier manager
          const defaultSupplier =
            await this.clinicSupplierHelper.findOrCreateDefaultSupplierManager(
              tenantId
            );
          clinicSupplierManagerId = defaultSupplier.id;
        }

        const product = await tx.product.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            brand: dto.brand,
            barcode: dto.barcode,
            image_url: imageUrl,
            category: dto.category,
            storage: dto.storage ?? null, // 보관 위치 (Storage location)
            status: resolvedStatus,
            is_active: resolvedIsActive,
            unit: dto.unit ?? null,
            purchase_price: dto.purchasePrice ?? null, // Default/fallback price
            sale_price: dto.salePrice ?? null,
            current_stock: dto.currentStock ?? 0,
            min_stock: dto.minStock ?? 0,
            capacity_per_product: dto.capacityPerProduct ?? null,
            capacity_unit: dto.capacityUnit ?? null,
            usage_capacity: dto.usageCapacity ?? null,
            // Product-level expiry defaults
            expiry_months: dto.expiryMonths ?? null,
            expiry_unit: dto.expiryUnit ?? null,
            alert_days: dto.alertDays ?? null,
            inbound_manager: dto.inboundManager ?? null,
            // Packaging unit conversion
            has_different_packaging_quantity:
              dto.hasDifferentPackagingQuantity ?? false,
            packaging_from_quantity: dto.packagingFromQuantity ?? null,
            packaging_from_unit: dto.packagingFromUnit ?? null,
            packaging_to_quantity: dto.packagingToQuantity ?? null,
            packaging_to_unit: dto.packagingToUnit ?? null,
            returnPolicy: dto.returnPolicy
              ? {
                  create: {
                    tenant_id: tenantId,
                    is_returnable: dto.returnPolicy.is_returnable,
                    refund_amount: dto.returnPolicy.refund_amount ?? 0,
                    return_storage: dto.returnPolicy.return_storage ?? null,
                    note: dto.returnPolicy.note ?? null,
                  },
                }
              : undefined,
          } as any,
          include: {
            returnPolicy: true,
            batches: true,
            productSupplier: {
              include: {
                clinicSupplierManager: {
                  include: {
                    linkedManager: {
                      select: {
                        id: true,
                        name: true,
                        phone_number: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        // ✅ NEW: Create ProductSupplier mapping (using transaction client)
        if (dto.suppliers && dto.suppliers.length > 0) {
          const s = dto.suppliers[0];
          await tx.productSupplier.upsert({
            where: {
              tenant_id_product_id: {
                tenant_id: tenantId,
                product_id: product.id,
              },
            },
            create: {
              tenant_id: tenantId,
              product_id: product.id,
              clinic_supplier_manager_id: clinicSupplierManagerId,
              purchase_price: s.purchase_price ?? dto.purchasePrice,
              moq: s.moq,
              lead_time_days: s.lead_time_days,
              note: s.note,
            },
            update: {
              clinic_supplier_manager_id: clinicSupplierManagerId,
              purchase_price: s.purchase_price ?? dto.purchasePrice,
              moq: s.moq,
              lead_time_days: s.lead_time_days,
              note: s.note,
            },
          });
        } else {
          // Default ProductSupplier mapping
          await tx.productSupplier.upsert({
            where: {
              tenant_id_product_id: {
                tenant_id: tenantId,
                product_id: product.id,
              },
            },
            create: {
              tenant_id: tenantId,
              product_id: product.id,
              clinic_supplier_manager_id: clinicSupplierManagerId,
              purchase_price: dto.purchasePrice,
            },
            update: {
              clinic_supplier_manager_id: clinicSupplierManagerId,
              purchase_price: dto.purchasePrice,
            },
          });
        }

        // Create batches
        if (dto.initial_batches?.length) {
          for (const batch of dto.initial_batches) {
            // Avtomatik batch_no yaratish (agar berilmagan bo'lsa)
            const batchNo =
              batch.batch_no ||
              (await this.generateBatchNo(product.id, tenantId, tx));

            await tx.batch.create({
              data: {
                tenant_id: tenantId,
                product_id: product.id,
                batch_no: batchNo,
                qty: batch.qty, // 입고 수량 (Inbound quantity)
                expiry_months: batch.expiry_months ?? null, // 유형 기간 (Expiry period)
                expiry_unit: batch.expiry_unit ?? null,
                manufacture_date: batch.manufacture_date
                  ? new Date(batch.manufacture_date)
                  : null, // 제조일 (Manufacture date)
                storage: batch.storage ?? null, // 보관 위치 (Storage location)
                purchase_price: batch.purchase_price ?? null, // 구매원가 (Purchase price)
                inbound_manager: (batch as any).inbound_manager ?? null, // 입고 담당자 (Inbound manager)
                sale_price: batch.sale_price ?? null,
                expiry_date: batch.expiry_date
                  ? new Date(batch.expiry_date)
                  : null,
                alert_days:
                  batch.alert_days && batch.alert_days.trim() !== ""
                    ? batch.alert_days
                    : product.alert_days && product.alert_days.trim() !== ""
                    ? product.alert_days
                    : null,
              } as any,
            });
          }
        }

        // Return product with all related data
        const productWithRelations = await tx.product.findUnique({
          where: { id: product.id },
          include: {
            returnPolicy: true,
            batches: {
              select: {
                id: true,
                batch_no: true,
                qty: true,
                expiry_date: true,
                storage: true,
                alert_days: true,
                created_at: true,
              },
              orderBy: { created_at: "desc" },
              take: 1,
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
        });

        return productWithRelations;
      },
      {
        timeout: 60000, // 60 seconds (default 5 seconds)
        maxWait: 10000, // 10 seconds max wait
      }
    );

    // ✅ Optimized: Add new product to cache instead of invalidating
    // This prevents performance degradation on VPS
    // Use the product returned from transaction for cache
    if (createdProductFromTransaction) {
      this.addProductToCache(tenantId, createdProductFromTransaction);
      return createdProductFromTransaction;
    }

    // Fallback: if product not found, invalidate cache
    this.clearProductsCache(tenantId);
    return null;
  }

  async getProduct(productId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const product = await (this.prisma.product.findFirst as any)({
      where: { id: productId, tenant_id: tenantId },
      include: {
        returnPolicy: true,
        batches: {
          orderBy: { created_at: "desc" },
        },
        productSupplier: {
          include: {
            clinicSupplierManager: {
              include: {
                linkedManager: {
                  select: {
                    id: true,
                    name: true,
                    phone_number: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const latestBatch = (product.batches as any[])?.[0];

    // alertDays ni batch'dan yoki product'dan olish
    // Agar batch'da alert_days bo'lsa, uni ishlatish, aks holda null
    const alertDays = latestBatch?.alert_days ?? null;

    // ✅ NEW: Get supplier info from ProductSupplier
    const productSupplier = product.productSupplier;
    const supplierManager = productSupplier?.clinicSupplierManager;
    const purchasePrice =
      productSupplier?.purchase_price ?? product.purchase_price; // Source of truth

    return {
      id: product.id,
      productName: product.name,
      brand: product.brand,
      barcode: product.barcode ?? null, // ✅ Qo'shildi
      productImage: product.image_url,
      category: product.category,
      status: product.status,
      currentStock: product.current_stock,
      minStock: product.min_stock,
      purchasePrice: purchasePrice, // ProductSupplier.purchase_price or Product.purchase_price
      salePrice: product.sale_price,
      unit: product.unit,
      capacityPerProduct: product.capacity_per_product,
      capacityUnit: product.capacity_unit,
      usageCapacity: product.usage_capacity,
      supplierId: supplierManager?.id ?? null, // ClinicSupplierManager ID
      supplierName: supplierManager?.company_name ?? null,
      managerName: supplierManager?.name ?? null,
      contactPhone: supplierManager?.phone_number ?? null,
      contactEmail: supplierManager?.email1 ?? null,
      // Full supplier details for edit page
      supplierCompanyAddress: supplierManager?.company_address ?? null,
      supplierBusinessNumber: supplierManager?.business_number ?? null,
      supplierCompanyPhone: supplierManager?.company_phone ?? null,
      supplierCompanyEmail: supplierManager?.company_email ?? null,
      supplierPosition: supplierManager?.position ?? null,
      supplierEmail2: supplierManager?.email2 ?? null,
      supplierResponsibleProducts: supplierManager?.responsible_products ?? [],
      supplierMemo: supplierManager?.memo ?? null,
      expiryDate: latestBatch?.expiry_date ?? null,
      storageLocation: latestBatch?.storage ?? product.storage ?? null, // Batch level yoki Product level
      productStorage: product.storage ?? null, // Product level storage (fallback uchun)
      inboundManager: product.inbound_manager ?? null, // 입고 담당자
      memo: product.returnPolicy?.note ?? null,
      isReturnable: product.returnPolicy?.is_returnable ?? false,
      refundAmount: product.returnPolicy?.refund_amount ?? null,
      returnStorage: product.returnPolicy?.return_storage ?? null,
      alertDays: product.alert_days ?? null,
    };
  }

  async getAllProducts(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const cached = this.getCachedData(tenantId);
    if (cached) {
      // Background'da yangilash (stale bo'lsa)
      if (cached.isStale) {
        // Background refresh (await qilmaymiz)
        this.refreshProductsCacheInBackground(tenantId).catch(() => {
          // Error handling (user'ga ko'rsatilmaydi)
        });
      }
      return cached.data; // ✅ Stale yoki fresh, lekin har doim data
    }

    // Parallel fetching - 3 ta query bir vaqtda (3x tezroq)
    const [products, returnPolicies, productSuppliers] = await Promise.all([
      // 1. Products va batches
      this.prisma.executeWithRetry(async () => {
        return await (this.prisma.product.findMany as any)({
          where: { tenant_id: tenantId },
          select: {
            id: true,
            name: true,
            brand: true,
            barcode: true,
            image_url: true,
            category: true,
            status: true,
            current_stock: true,
            min_stock: true,
            purchase_price: true,
            sale_price: true,
            unit: true,
            usage_capacity: true,
            capacity_unit: true,
            capacity_per_product: true,
            storage: true,
            expiry_months: true,
            expiry_unit: true,
            alert_days: true,
            created_at: true,
            batches: {
              select: {
                id: true,
                batch_no: true,
                qty: true,
                expiry_date: true,
                storage: true,
                alert_days: true,
                created_at: true,
              },
              orderBy: { created_at: "desc" },
              take: 1, // Faqat eng so'nggi batch
            },
          },
          orderBy: { created_at: "desc" },
        });
      }),

      // 2. ReturnPolicies (parallel)
      this.prisma.executeWithRetry(async () => {
        return await (this.prisma.returnPolicy.findMany as any)({
          where: { tenant_id: tenantId },
          select: {
            product_id: true,
            note: true,
          },
        });
      }),

      // 3. ProductSuppliers va ClinicSupplierManagers (parallel)
      this.prisma.executeWithRetry(async () => {
        return await (this.prisma.productSupplier.findMany as any)({
          where: { tenant_id: tenantId },
          select: {
            product_id: true,
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
        });
      }),
    ]);

    // In-memory mapping (tezroq)
    const returnPolicyMap = new Map(
      returnPolicies.map((rp: any) => [rp.product_id, rp])
    );
    const supplierMap = new Map(
      productSuppliers.map((ps: any) => [ps.product_id, ps])
    );

    // Format products
    const formattedProducts = products.map((product: any) => {
      const latestBatch = product.batches?.[0];
      const returnPolicy: any = returnPolicyMap.get(product.id);
      const productSupplier: any = supplierMap.get(product.id);
      const supplierManager: any = productSupplier?.clinicSupplierManager;

      return {
        id: product.id,
        productName: product.name,
        brand: product.brand,
        barcode: product.barcode,
        productImage: product.image_url,
        category: product.category,
        status: product.status,
        currentStock: product.current_stock,
        minStock: product.min_stock,
        purchasePrice: product.purchase_price,
        salePrice: product.sale_price,
        unit: product.unit,
        usageCapacity: product.usage_capacity,
        usageCapacityUnit: product.capacity_unit,
        capacityPerProduct: product.capacity_per_product,
        capacityUnit: product.capacity_unit,
        supplierName: supplierManager?.company_name ?? null,
        managerName: supplierManager?.name ?? null,
        supplierId: supplierManager?.id ?? null,
        expiryDate: latestBatch?.expiry_date ?? null,
        storageLocation: latestBatch?.storage ?? product.storage ?? null,
        productStorage: product.storage ?? null,
        memo: returnPolicy?.note ?? null,
        expiryMonths: product.expiry_months ?? null,
        expiryUnit: product.expiry_unit ?? null,
        isLowStock: product.current_stock < product.min_stock,
        batches: product.batches || [],
      };
    });

    // Cache'ga saqlash
    this.setCachedData(tenantId, formattedProducts);

    return formattedProducts;
  }

  async updateProduct(id: string, dto: UpdateProductDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.prisma.product.findFirst({
      where: { id, tenant_id: tenantId },
      include: { returnPolicy: true },
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    let imageUrl = existing.image_url;

    // Image handling: agar null yuborilgan bo'lsa, image'ni o'chirish
    // Agar yangi image yuborilgan bo'lsa, yangi image'ni saqlash
    if (dto.image !== undefined) {
      if (dto.image === null || dto.image === "") {
        // Image o'chirilmoqda
        imageUrl = null;
      } else if (
        dto.image &&
        typeof dto.image === "string" &&
        dto.image.length > 0
      ) {
        // Yangi image yuklanmoqda (base64 format'da)
        const [savedImage] = await saveBase64Images(
          "product",
          [dto.image],
          tenantId
        );
        imageUrl = savedImage;
      }
    }
    // Agar dto.image undefined bo'lsa, eski image saqlanadi (image o'zgarmagan)

    const resolvedStatus = dto.status ?? existing.status;
    const resolvedIsActive =
      dto.isActive ??
      (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

    await this.prisma.$transaction(
      async (tx: any) => {
        await tx.product.update({
          where: { id },
          data: {
            name: dto.name ?? existing.name,
            brand: dto.brand ?? existing.brand,
            barcode: dto.barcode ?? existing.barcode,
            image_url: imageUrl,
            category: dto.category ?? existing.category,
            status: resolvedStatus,
            is_active: resolvedIsActive,
            unit: dto.unit ?? existing.unit,
            purchase_price: dto.purchasePrice ?? existing.purchase_price,
            sale_price: dto.salePrice ?? existing.sale_price,
            current_stock: dto.currentStock ?? existing.current_stock,
            min_stock: dto.minStock ?? existing.min_stock,
            capacity_per_product:
              dto.capacityPerProduct ?? (existing as any).capacity_per_product,
            capacity_unit: dto.capacityUnit ?? (existing as any).capacity_unit,
            usage_capacity:
              dto.usageCapacity ?? (existing as any).usage_capacity,
            storage: dto.storage !== undefined ? dto.storage : undefined, // Update storage
            inbound_manager:
              dto.inboundManager !== undefined ? dto.inboundManager : undefined, // Update inbound manager
          } as any,
        });

        if (dto.returnPolicy) {
          await tx.returnPolicy.upsert({
            where: { product_id: id },
            update: {
              is_returnable: dto.returnPolicy.is_returnable,
              refund_amount:
                dto.returnPolicy.refund_amount ??
                existing.returnPolicy?.refund_amount ??
                0,
              return_storage: dto.returnPolicy.return_storage ?? null,
              note: dto.returnPolicy.note ?? null,
            },
            create: {
              tenant_id: tenantId,
              product_id: id,
              is_returnable: dto.returnPolicy.is_returnable,
              refund_amount: dto.returnPolicy.refund_amount ?? 0,
              return_storage: dto.returnPolicy.return_storage ?? null,
              note: dto.returnPolicy.note ?? null,
            },
          });
        }

        // ✅ ClinicSupplierManager table'ni yangilash va ProductSupplier'ni yangilash
        if (dto.suppliers && dto.suppliers.length > 0) {
          const supplier = dto.suppliers[0];

          // Supplier ma'lumotlari bo'lsa, ClinicSupplierManager'ni yangilash
          if (supplier.contact_name || supplier.contact_phone) {
            let clinicSupplierManagerId: string;

            // 1. Avval ClinicSupplierManager'ni topish (phone_number yoki business_number bo'yicha)
            let existingClinicSupplierManager = null;

            if (supplier.contact_phone) {
              existingClinicSupplierManager =
                await tx.clinicSupplierManager.findFirst({
                  where: {
                    tenant_id: tenantId,
                    phone_number: supplier.contact_phone,
                  },
                });
            }

            if (!existingClinicSupplierManager && supplier.business_number) {
              existingClinicSupplierManager =
                await tx.clinicSupplierManager.findFirst({
                  where: {
                    tenant_id: tenantId,
                    business_number: supplier.business_number,
                  },
                });
            }

            // 2. Agar topilsa, yangilash (UPDATE)
            if (existingClinicSupplierManager) {
              await tx.clinicSupplierManager.update({
                where: { id: existingClinicSupplierManager.id },
                data: {
                  company_name:
                    supplier.company_name ||
                    existingClinicSupplierManager.company_name,
                  business_number:
                    supplier.business_number ||
                    existingClinicSupplierManager.business_number,
                  company_phone:
                    supplier.company_phone ||
                    existingClinicSupplierManager.company_phone,
                  company_email:
                    supplier.company_email ||
                    existingClinicSupplierManager.company_email,
                  company_address:
                    supplier.company_address ||
                    existingClinicSupplierManager.company_address,
                  name:
                    supplier.contact_name || existingClinicSupplierManager.name,
                  phone_number:
                    supplier.contact_phone ||
                    existingClinicSupplierManager.phone_number,
                  email1:
                    supplier.contact_email ||
                    existingClinicSupplierManager.email1,
                },
              });
              clinicSupplierManagerId = existingClinicSupplierManager.id;
            } else {
              // 3. Agar topilmasa, yangi yaratish (CREATE)
              const newClinicSupplierManager =
                await tx.clinicSupplierManager.create({
                  data: {
                    tenant_id: tenantId,
                    company_name: supplier.company_name || "공급업체 없음",
                    business_number: supplier.business_number || null,
                    company_phone: supplier.company_phone || null,
                    company_email: supplier.company_email || null,
                    company_address: supplier.company_address || null,
                    name: supplier.contact_name || "담당자 없음",
                    phone_number: supplier.contact_phone || "000-0000-0000",
                    email1: supplier.contact_email || null,
                    // linked_supplier_manager_id ni faqat supplier_id UUID bo'lsa qo'shish
                    linked_supplier_manager_id:
                      supplier.supplier_id &&
                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                        supplier.supplier_id
                      )
                        ? supplier.supplier_id
                        : null,
                  },
                });
              clinicSupplierManagerId = newClinicSupplierManager.id;
            }

            // 4. ProductSupplier'ni upsert qilish (mapping table)
            await tx.productSupplier.upsert({
              where: {
                tenant_id_product_id: {
                  tenant_id: tenantId,
                  product_id: id,
                },
              },
              create: {
                tenant_id: tenantId,
                product_id: id,
                clinic_supplier_manager_id: clinicSupplierManagerId,
                purchase_price:
                  supplier.purchase_price ?? dto.purchasePrice ?? null,
                moq: supplier.moq ?? null,
                lead_time_days: supplier.lead_time_days ?? null,
                note: supplier.note ?? null,
              },
              update: {
                clinic_supplier_manager_id: clinicSupplierManagerId,
                purchase_price:
                  supplier.purchase_price ?? dto.purchasePrice ?? null,
                moq: supplier.moq ?? null,
                lead_time_days: supplier.lead_time_days ?? null,
                note: supplier.note ?? null,
              },
            });
          }
        }

        if (dto.initial_batches) {
          await tx.batch.deleteMany({
            where: { product_id: id, tenant_id: tenantId },
          });

          for (const batch of dto.initial_batches) {
            // Avtomatik batch_no yaratish (agar berilmagan bo'lsa)
            const batchNo =
              batch.batch_no || (await this.generateBatchNo(id, tenantId, tx));

            await tx.batch.create({
              data: {
                tenant_id: tenantId,
                product_id: id,
                batch_no: batchNo,
                qty: batch.qty, // 입고 수량 (Inbound quantity)
                expiry_months: batch.expiry_months ?? null, // 유형 기간 (Expiry period)
                expiry_unit: batch.expiry_unit ?? null,
                manufacture_date: batch.manufacture_date
                  ? new Date(batch.manufacture_date)
                  : null, // 제조일 (Manufacture date)
                storage: batch.storage ?? null, // 보관 위치 (Storage location)
                purchase_price: batch.purchase_price ?? null, // 구매원가 (Purchase price)
                inbound_manager: batch.inbound_manager ?? null, // 입고 담당자 (Inbound manager)
                sale_price: batch.sale_price ?? null,
                expiry_date: batch.expiry_date
                  ? new Date(batch.expiry_date)
                  : null,
                alert_days:
                  batch.alert_days && batch.alert_days.trim() !== ""
                    ? batch.alert_days
                    : null,
              } as any,
            });
          }
        }
      },
      {
        timeout: 60000, // 60 seconds
        maxWait: 10000, // 10 seconds max wait
      }
    );

    // ✅ Optimized: Update product in cache instead of invalidating
    // Fetch updated product with all relations and update cache
    const updatedProduct = await this.prisma.product.findUnique({
      where: { id },
      include: {
        returnPolicy: true,
        batches: {
          select: {
            id: true,
            batch_no: true,
            qty: true,
            expiry_date: true,
            storage: true,
            alert_days: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
          take: 1,
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
    });

    if (updatedProduct) {
      this.addProductToCache(tenantId, updatedProduct);
    } else {
      // Fallback: invalidate if product not found
      this.clearProductsCache(tenantId);
    }

    return this.getProduct(id, tenantId);
  }

  async deleteProduct(id: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.prisma.product.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    await this.prisma.$transaction(
      async (tx: any) => {
        await tx.batch.deleteMany({
          where: { product_id: id, tenant_id: tenantId },
        });
        await tx.productSupplier.deleteMany({
          where: { product_id: id, tenant_id: tenantId },
        });
        await tx.returnPolicy.deleteMany({
          where: { product_id: id, tenant_id: tenantId },
        });
        await tx.product.delete({ where: { id } });
      },
      {
        timeout: 60000, // 60 seconds
        maxWait: 10000, // 10 seconds max wait
      }
    );

    // ✅ Optimized: Remove product from cache instead of invalidating
    // This prevents performance degradation on VPS
    this.removeProductFromCache(tenantId, id);

    // ✅ Also invalidate OutboundService cache since outbound page uses products
    if (this.outboundService) {
      try {
        const outboundService = this.outboundService as any;
        if (outboundService.invalidateProductsCache) {
          outboundService.invalidateProductsCache(tenantId);
          console.log(
            `[ProductsService] OutboundService cache invalidated for tenant: ${tenantId}`
          );
        }
      } catch (error) {
        console.warn(
          `[ProductsService] Could not invalidate OutboundService cache:`,
          error
        );
      }
    }

    return { success: true };
  }

  /**
   * Product'ning barcha batch'larini olish
   * @param productId - Product ID
   * @param tenantId - Tenant ID
   * @returns Batch'lar ro'yxati: batch_no, 유효기간, 보관 위치, created_at, 입고 수량
   */
  async getProductBatches(productId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Product mavjudligini tekshirish
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Product'ning barcha batch'larini olish
    // IMPORTANT: Faqat qty > 0 bo'lgan batch'larni ko'rsatish (0ga yetgan batch'lar ochib ketadi)
    const batches = await this.prisma.batch.findMany({
      where: {
        product_id: productId,
        tenant_id: tenantId,
        qty: { gt: 0 }, // Faqat qty > 0 bo'lgan batch'lar
      },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        batch_no: true,
        expiry_date: true,
        expiry_months: true,
        expiry_unit: true,
        alert_days: true,
        storage: true,
        created_at: true,
        qty: true,
      },
    });

    // Formatlash: 유효기간 ni yaratish (expiry_date yoki expiry_months + expiry_unit)
    return batches.map(
      (batch: {
        id: string;
        batch_no: string;
        expiry_date: Date | null;
        expiry_months: number | null;
        expiry_unit: string | null;
        alert_days: string | null;
        storage: string | null;
        created_at: Date;
        qty: number;
      }) => ({
        id: batch.id,
        batch_no: batch.batch_no,
        유효기간: batch.expiry_date
          ? batch.expiry_date.toISOString().split("T")[0]
          : batch.expiry_months && batch.expiry_unit
          ? `${batch.expiry_months} ${batch.expiry_unit}`
          : null,
        보관위치: batch.storage ?? null,
        "입고 수량": batch.qty,
        created_at: batch.created_at,
        // Raw fields for batch copying (입고 대기 page uchun)
        expiry_months: batch.expiry_months,
        expiry_unit: batch.expiry_unit,
        alert_days: batch.alert_days,
        storage: batch.storage,
        qty: batch.qty,
      })
    );
  }

  /**
   * Mavjud productga batch yaratish
   * @param productId - Product ID
   * @param dto - Batch ma'lumotlari
   * @param tenantId - Tenant ID
   */
  async createBatchForProduct(
    productId: string,
    dto: CreateBatchDto,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Product mavjudligini tekshirish
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.prisma.$transaction(
      async (tx: any) => {
        // Avtomatik batch_no yaratish
        const batchNo = await this.generateBatchNo(productId, tenantId, tx);

        // Product'ni olish (storage uchun)
        const product = await tx.product.findFirst({
          where: { id: productId, tenant_id: tenantId },
          select: { storage: true },
        });

        // Batch yaratish
        const batch = await tx.batch.create({
          data: {
            tenant_id: tenantId,
            product_id: productId,
            batch_no: batchNo,
            qty: dto.qty,
            expiry_months: dto.expiry_months ?? null,
            expiry_unit: dto.expiry_unit ?? null,
            manufacture_date: dto.manufacture_date
              ? new Date(dto.manufacture_date)
              : null,
            // 보관 위치: DTO'dan yoki Product level'dan (fallback)
            storage: dto.storage ?? (product as any)?.storage ?? null,
            purchase_price: dto.purchase_price ?? null,
            inbound_manager: dto.inbound_manager ?? null,
            sale_price: dto.sale_price ?? null,
            expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
            alert_days: dto.alert_days ?? (product as any).alert_days ?? null,
          } as any,
        });

        // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
        const totalStock = await tx.batch.aggregate({
          where: { product_id: productId, tenant_id: tenantId },
          _sum: { qty: true },
        });

        await tx.product.update({
          where: { id: productId },
          data: {
            current_stock: totalStock._sum.qty ?? 0,
          } as any,
        });

        // Return the created batch directly (with batch_no)
        return batch;
      },
      {
        timeout: 60000, // 60 seconds
        maxWait: 10000, // 10 seconds max wait
      }
    );

    // ✅ Optimized: Update product in cache to reflect new batch
    // Fetch product with updated batches and relations
    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        returnPolicy: true,
        batches: {
          select: {
            id: true,
            batch_no: true,
            qty: true,
            expiry_date: true,
            storage: true,
            alert_days: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
          take: 1,
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
    });

    if (updatedProduct) {
      this.addProductToCache(tenantId, updatedProduct);
    } else {
      // Fallback: invalidate if product not found
      this.clearProductsCache(tenantId);
    }
  }

  /**
   * Avtomatik batch_no yaratish
   * Format: {9xonalik random raqam}-{3xonalik tartib raqami}
   * Masalan: 123456789-001, 987654321-002
   */
  private async generateBatchNo(
    productId: string,
    tenantId: string,
    tx: any
  ): Promise<string> {
    // 9 xonalik random raqam yaratish (100000000 - 999999999)
    const random9Digits = Math.floor(
      100000000 + Math.random() * 900000000
    ).toString();

    try {
      // ✅ Validate transaction client before using it
      if (!tx || typeof tx.batch?.count !== "function") {
        // Fallback: use regular prisma client if transaction is invalid
        console.warn(
          `[ProductsService] Transaction client invalid in generateBatchNo, using fallback for productId: ${productId}`
        );
        const existingBatchesCount = await this.prisma.batch.count({
          where: { product_id: productId, tenant_id: tenantId },
        });

        const sequenceNumber = (existingBatchesCount + 1)
          .toString()
          .padStart(3, "0");

        return `${random9Digits}-${sequenceNumber}`;
      }

      // Product'ning mavjud batch'lari sonini topish
      const existingBatchesCount = await tx.batch.count({
        where: { product_id: productId, tenant_id: tenantId },
      });

      // Keyingi tartib raqamini hisoblash (001, 002, 003, ...)
      const sequenceNumber = (existingBatchesCount + 1)
        .toString()
        .padStart(3, "0");

      // Formatlash: {random9digit}-{3digitSequence}
      return `${random9Digits}-${sequenceNumber}`;
    } catch (error: any) {
      // ✅ Fallback: if transaction fails, use regular prisma client
      console.error(
        `[ProductsService] Transaction failed in generateBatchNo:`,
        error.message
      );
      console.warn(
        `[ProductsService] Using fallback for productId: ${productId}`
      );

      const existingBatchesCount = await this.prisma.batch.count({
        where: { product_id: productId, tenant_id: tenantId },
      });

      const sequenceNumber = (existingBatchesCount + 1)
        .toString()
        .padStart(3, "0");

      return `${random9Digits}-${sequenceNumber}`;
    }
  }

  /**
   * Batch'larni FEFO bo'yicha sortlash
   * 정렬 우선순위: ① 유효기간 → ② 미량 재고 (qty) → ③ 배치번호
   */
  private sortBatchesByFEFO(batches: any[]): any[] {
    return [...batches].sort((a, b) => {
      // 1. 유효기간 (expiry_date) bo'yicha sortlash - oldre olan batches birinchi
      if (a.expiry_date && b.expiry_date) {
        const dateDiff = a.expiry_date.getTime() - b.expiry_date.getTime();
        if (dateDiff !== 0) return dateDiff; // Eng eski (yaqin expiry) birinchi
      } else if (a.expiry_date && !b.expiry_date) {
        return -1; // a.expiry_date bor, b.expiry_date yo'q → a birinchi
      } else if (!a.expiry_date && b.expiry_date) {
        return 1; // b.expiry_date bor, a.expiry_date yo'q → b birinchi
      }

      // 2. 미량 재고 우선 (qty 적은 것 먼저 소진) - kam qty birinchi
      if (a.qty !== b.qty) {
        return a.qty - b.qty; // Kam miqdor birinchi
      }

      // 3. 배치번호 bo'yicha sortlash
      return a.batch_no.localeCompare(b.batch_no);
    });
  }

  /**
   * 유효기간 임박 hisoblash
   * @param expiryDate - 유효기간 sanasi
   * @param alertDays - Ogohlantirish kuni (optional, default: 30)
   * @returns true agar 유효기간 임박 bo'lsa
   */
  private calculateExpiringSoon(
    expiryDate: Date,
    alertDays?: string | null
  ): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Kun boshiga

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // alert_days ni parse qilish (default: 30 kun)
    const alertDaysNum = alertDays ? parseInt(alertDays, 10) : 30;

    // Agar NaN bo'lsa, 30 kun ishlatish
    const finalAlertDays = isNaN(alertDaysNum) ? 30 : alertDaysNum;

    // Agar 유효기간 kelajakda va alert_days ichida bo'lsa → 임박
    return diffDays > 0 && diffDays <= finalAlertDays;
  }

  /**
   * 유효기간 gacha qolgan kunlarni hisoblash
   * @param expiryDate - 유효기간 sanasi
   * @returns Qolgan kunlar soni (agar o'tgan bo'lsa, manfiy raqam)
   */
  private calculateDaysUntilExpiry(expiryDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get distinct storage locations for a tenant
   * @param tenantId - Tenant ID
   * @returns Array of distinct storage location strings
   */
  async getStorages(tenantId: string): Promise<string[]> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Get warehouse locations from WarehouseLocation table
    const warehouseLocations = await this.prisma.warehouseLocation.findMany({
      where: {
        tenant_id: tenantId,
      },
      select: {
        name: true,
      },
    });

    // Get distinct storage values from Batch table
    const batches = await this.prisma.batch.findMany({
      where: {
        tenant_id: tenantId,
        storage: {
          not: null,
        },
      },
      select: {
        storage: true,
      },
      distinct: ["storage"],
    });

    // Combine both sources
    const warehouseNames = new Set<string>(
      warehouseLocations.map((w: any) => w.name)
    );
    const batchStorages = batches
      .map((batch) => batch.storage)
      .filter((storage): storage is string => {
        return (
          storage !== null && storage !== undefined && storage.trim() !== ""
        );
      });

    // Merge and deduplicate
    const allStorages = new Set<string>([...warehouseNames, ...batchStorages]);

    // Sort alphabetically
    return Array.from<string>(allStorages).sort((a: string, b: string) =>
      a.localeCompare(b, "ko", { sensitivity: "base" })
    );
  }

  /**
   * Get all warehouse locations with full data
   * @param tenantId - Tenant ID
   * @returns Array of warehouse locations with category and items
   */
  async getWarehouseLocations(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const warehouses = await this.prisma.warehouseLocation.findMany({
      where: {
        tenant_id: tenantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return warehouses.map((w: any) => ({
      id: w.id,
      name: w.name,
      category: w.category,
      items: w.items || [],
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    }));
  }

  /**
   * Add new warehouse location
   * @param tenantId - Tenant ID
   * @param name - Warehouse name
   * @param category - Warehouse category (수면실, 레이저 실, 창고, 기타)
   * @param items - Items in warehouse (A 침대, B 침대, etc.)
   */
  async addWarehouseLocation(
    tenantId: string,
    name: string,
    category: string | null,
    items: string[]
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!name || !name.trim()) {
      throw new BadRequestException("창고 이름은 필수입니다");
    }

    // Check if warehouse already exists
    const existing = await this.prisma.warehouseLocation.findUnique({
      where: {
        tenant_id_name: {
          tenant_id: tenantId,
          name: name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException("이미 존재하는 창고 위치입니다");
    }

    // Create warehouse location
    const warehouse = await this.prisma.warehouseLocation.create({
      data: {
        tenant_id: tenantId,
        name: name.trim(),
        category: category || null,
        items: items || [],
      },
    });

    return {
      success: true,
      message: "창고 위치가 추가되었습니다",
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        category: warehouse.category,
        items: warehouse.items || [],
        createdAt: warehouse.created_at,
        updatedAt: warehouse.updated_at,
      },
    };
  }
}
