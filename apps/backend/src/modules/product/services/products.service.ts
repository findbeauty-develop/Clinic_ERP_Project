import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { CreateBatchDto, CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { ImportProductRowDto } from "../dto/import-products.dto";
import { ClinicSupplierHelperService } from "../../supplier/services/clinic-supplier-helper.service";
import { CacheManager } from "../../../common/cache";

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
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
      ttl: 5000, // 30 seconds
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
                  inbound_qty: true,
                  used_count: true, // ✅ Add for availableQuantity calculation
                  // available_quantity: true, // ✅ Will be available after migration
                  unit: true,
                  min_stock: true,
                  expiry_date: true,
                  storage: true,
                  alert_days: true,
                  created_at: true,
                },
                orderBy: { created_at: "desc" },
                // ✅ Hamma batch'lar olinadi (qty > 0 bo'lganlar frontend'da filter qilinadi)
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
   * Public method to invalidate products cache
   * Used by other services (e.g., PackageService) to clear cache when products might have changed
   */
  public invalidateProductsCache(tenantId: string): void {
    this.clearProductsCache(tenantId);
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
      managerPosition: supplierManager?.position ?? null, // ✅ 직책 (Position)
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
                inbound_qty: batch.qty, // ✅ Original qty from inbound (immutable)
                unit: product.unit ?? null, // ✅ Copy unit from product
                min_stock: product.min_stock, // ✅ Copy min_stock from product (immutable, can be 0, null, or any number)
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

          // ✅ Set Product's inbound_qty from first batch (one-time only)
          if (dto.initial_batches.length > 0) {
            const firstBatchQty = dto.initial_batches[0].qty;
            await tx.product.update({
              where: { id: product.id },
              data: { inbound_qty: firstBatchQty },
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
      inboundQty: product.inbound_qty ?? null, // ✅ Original qty from first inbound
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
      expiryDate: product.expiry_date ?? latestBatch?.expiry_date ?? null, // Product level first, then batch
      storageLocation: product.storage ?? latestBatch?.storage ?? null, // Product level first, then batch
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
                inbound_qty: true,
                used_count: true, // ✅ 사용 단위 mantiqi uchun kerak
                // available_quantity: true, // ✅ Will be available after migration
                unit: true,
                min_stock: true,
                expiry_date: true,
                storage: true,
                alert_days: true,
                created_at: true,
                is_separate_purchase: true, // ✅ Added
              },
            orderBy: { created_at: "desc" },
              // ✅ Hamma batch'lar olinadi (qty > 0 bo'lganlar frontend'da filter qilinadi)
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
                position: true, // ✅ 직책 (Position)
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
        managerPosition: supplierManager?.position ?? null, // ✅ 직책 (Position)
        supplierId: supplierManager?.id ?? null,
        expiryDate: latestBatch?.expiry_date ?? null,
        storageLocation: latestBatch?.storage ?? product.storage ?? null,
        productStorage: product.storage ?? null,
        memo: returnPolicy?.note ?? null,
        expiryMonths: product.expiry_months ?? null,
        expiryUnit: product.expiry_unit ?? null,
        alertDays: product.alert_days ?? null,
        isLowStock: product.current_stock < product.min_stock,
        batches: product.batches || [],
      };
    });

    // 🔍 DEBUG LOG - First 3 products
    if (formattedProducts.length > 0) {
      this.logger.log(`[getAllProducts] First 3 products currentStock:`, 
        formattedProducts.slice(0, 3).map((p: any) => `${p.productName}: ${p.currentStock}`)
      );
    }

    // Cache'ga saqlash
    this.setCachedData(tenantId, formattedProducts);

    return formattedProducts;
  }

  /**
   * Find product by barcode (GTIN)
   * Used for USB barcode scanner functionality
   */
  async findByBarcode(barcode: string, tenantId: string) {
    if (!barcode || !tenantId) {
      throw new BadRequestException('Barcode and tenant ID are required');
    }

    const product = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).product.findFirst({
        where: {
          tenant_id: tenantId,
          barcode: barcode,
          is_active: true,
        },
        include: {
          productSupplier: {
            include: { 
              clinicSupplierManager: true,
              product: true,
            },
          },
          returnPolicy: true,
          batches: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });
    });

    if (!product) {
      throw new NotFoundException(`Product with barcode ${barcode} not found`);
    }

    // Return full product details using existing getProduct method
    return this.getProduct(product.id, tenantId);
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

    const newCurrentStock =
      dto.currentStock !== undefined
        ? dto.currentStock
        : existing.current_stock;

    // ✅ Update inbound_qty ONLY if user explicitly changed the stock field
    // If currentStock is different from existing, user edited it manually on edit page
    const stockWasChanged =
      dto.currentStock !== undefined &&
      dto.currentStock !== existing.current_stock;
    const newInboundQty = stockWasChanged
      ? dto.currentStock
      : (existing as any).inbound_qty;

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
            current_stock: newCurrentStock, // Use the computed value
            inbound_qty: newInboundQty, // ✅ Update ONLY if user manually edited stock
            min_stock:
              dto.minStock !== undefined ? dto.minStock : existing.min_stock, // Allow 0
            capacity_per_product:
              dto.capacityPerProduct ?? (existing as any).capacity_per_product,
          capacity_unit: dto.capacityUnit ?? (existing as any).capacity_unit,
            usage_capacity:
              dto.usageCapacity ?? (existing as any).usage_capacity,
            ...(dto.storage !== undefined && { storage: dto.storage }), // Update storage (allows null)
            ...(dto.inboundManager !== undefined && {
              inbound_manager: dto.inboundManager,
            }), // Update inbound manager (allows null)
            ...(dto.alertDays !== undefined && { alert_days: dto.alertDays }), // Update alert days
            ...(dto.expiryDate !== undefined && {
              expiry_date: dto.expiryDate ? new Date(dto.expiryDate) : null,
            }), // Update expiry date (allows null)
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

          // ✅ Check if supplier has meaningful data (not empty object)
          const hasSupplierData =
            supplier.contact_name ||
            supplier.contact_phone ||
            supplier.company_name;

          if (!hasSupplierData) {
          } else {
            // Supplier ma'lumotlari bo'lsa, ClinicSupplierManager'ni yangilash
            if (supplier.contact_name || supplier.contact_phone) {
              let clinicSupplierManagerId: string;

              // 1. Faqat phone_number bo'yicha qidirish (manager unique identifier)
              // Business number bir xil bo'lishi mumkin (bir kompaniyada ko'p manager)
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

              // ❌ REMOVED: Business number search
              // Business number is company identifier, not manager identifier
              // One company can have multiple managers!

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
                      supplier.contact_name ||
                      existingClinicSupplierManager.name,
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

                // ✅ Validation: Check uniqueness before creating

                // Check if phone number already exists (phone is unique per manager)
                if (supplier.contact_phone) {
                  const phoneExists = await tx.clinicSupplierManager.findFirst({
                    where: {
                      tenant_id: tenantId,
                      phone_number: supplier.contact_phone,
                    },
                  });

                  if (phoneExists) {
                  }
                }

                // ❌ REMOVED: Business number uniqueness check
                // Business number is company identifier, not manager identifier
                // Multiple managers can have the same business_number (same company)

                // Proceed with CREATE

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
        }

        // ✅ Update first (oldest) batch when manually editing
        // Find the FIRST batch (oldest, created with product)
        const firstBatch = await tx.batch.findFirst({
          where: { product_id: id, tenant_id: tenantId },
          orderBy: { created_at: "asc" }, // ASC = oldest first
        });

        if (firstBatch) {
          const batchUpdateData: any = {};

          // ✅ Update inbound_qty ONLY if user explicitly changed stock on edit page
          if (stockWasChanged) {
            batchUpdateData.inbound_qty = dto.currentStock;
          }

          // Update purchase_price if price changed
          if (dto.purchasePrice !== undefined) {
            batchUpdateData.purchase_price = dto.purchasePrice;
          }

          // Update storage if changed
          if (dto.storage !== undefined) {
            batchUpdateData.storage = dto.storage;
          }

          // Update inbound_manager if changed
          if (dto.inboundManager !== undefined) {
            batchUpdateData.inbound_manager = dto.inboundManager;
          }

          // Update unit if changed
          if (dto.unit !== undefined) {
            batchUpdateData.unit = dto.unit;
          }

          // Update expiry_date if changed
          if (dto.expiryDate !== undefined) {
            batchUpdateData.expiry_date = dto.expiryDate
              ? new Date(dto.expiryDate)
              : null;
          }

          // Only update if there are changes
          if (Object.keys(batchUpdateData).length > 0) {
            await tx.batch.update({
              where: { id: firstBatch.id },
              data: batchUpdateData,
            });
          }
        }

        // ✅ Update ProductSupplier purchase_price if changed
        if (dto.purchasePrice !== undefined) {
          const existingProductSupplier = await tx.productSupplier.findFirst({
            where: { product_id: id, tenant_id: tenantId },
          });

          if (existingProductSupplier) {
            await tx.productSupplier.update({
              where: { id: existingProductSupplier.id },
              data: { purchase_price: dto.purchasePrice },
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
    const batches = await (this.prisma.batch.findMany as any)({
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
        inbound_qty: true,
        used_count: true, // ✅ Add for availableQuantity calculation
        // available_quantity: true, // ✅ Will be available after migration
        unit: true,
        min_stock: true,
        purchase_price: true, // ✅ 구매가 (Purchase price)
        is_separate_purchase: true, // ✅ 별도 구매 여부
      },
    });

    // Formatlash: 유효기간 ni yaratish (expiry_date yoki expiry_months + expiry_unit)
    return batches.map((batch: any) => ({
      id: batch.id,
        batch_no: batch.batch_no,
        유효기간: batch.expiry_date
        ? batch.expiry_date.toISOString().split("T")[0]
          : batch.expiry_months && batch.expiry_unit
          ? `${batch.expiry_months} ${batch.expiry_unit}`
          : null,
        보관위치: batch.storage ?? null,
      "입고 수량": batch.qty, // ✅ Current stock (for display in inbound page)
      inbound_qty: batch.inbound_qty ?? null, // ✅ Original immutable inbound qty
      unit: batch.unit ?? null,
      min_stock: batch.min_stock ?? null, // ✅ Minimum stock from product (immutable)
      purchase_price: batch.purchase_price ?? null, // ✅ 구매가 (Purchase price)
        created_at: batch.created_at,
      is_separate_purchase: batch.is_separate_purchase ?? false, // ✅ 별도 구매 여부
      // Raw fields for batch copying (입고 대기 page uchun)
      expiry_months: batch.expiry_months,
      expiry_unit: batch.expiry_unit,
      alert_days: batch.alert_days,
      storage: batch.storage,
      qty: batch.qty,
    }));
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
      // ✅ Use frontend's batch_no if provided, otherwise auto-generate BTX-XXX
      const batchNo = dto.batch_no && dto.batch_no.trim() !== ""
        ? dto.batch_no
        : await this.generateBatchNo(productId, tenantId, tx);

        // Product'ni olish (storage, unit, expiry_months, expiry_unit, alert_days, sale_price, min_stock uchun)
        const product = await tx.product.findFirst({
          where: { id: productId, tenant_id: tenantId },
          select: {
            storage: true,
            unit: true,
            expiry_months: true,
            expiry_unit: true,
            alert_days: true,
            sale_price: true,
            min_stock: true,
          },
        });

        if (!product) {
          throw new NotFoundException("Product not found");
        }

      // Batch yaratish
        // ✅ min_stock: Product'dan olish (0 yoki null bo'lsa ham, product'ning qiymatini saqlash)
        // product.min_stock qiymatini to'g'ridan-to'g'ri ishlatish (0 ham to'g'ri qiymat)
        const productMinStock = product.min_stock;

        // Debug: Product'ning min_stock'ini log qilish

      const batch = await tx.batch.create({
        data: {
          tenant_id: tenantId,
          product_id: productId,
          batch_no: batchNo,
            qty: dto.qty,
            inbound_qty: dto.qty, // ✅ Original qty from inbound (immutable)
            unit: (product as any)?.unit ?? null, // ✅ Copy unit from product
            min_stock: productMinStock, // ✅ Copy min_stock from product (immutable, can be 0, null, or any number)
            // ✅ Expiry info: DTO'dan yoki Product level'dan (fallback)
            // !== undefined ishlatish kerak, chunki 0 yoki null ham to'g'ri qiymatlar
            expiry_months:
              dto.expiry_months !== undefined
                ? dto.expiry_months
                : ((product as any)?.expiry_months ?? null),
            expiry_unit:
              dto.expiry_unit !== undefined
                ? dto.expiry_unit
                : ((product as any)?.expiry_unit ?? null),
          manufacture_date: dto.manufacture_date
            ? new Date(dto.manufacture_date)
              : null,
            // 보관 위치: DTO'dan yoki Product level'dan (fallback)
            storage: dto.storage ?? (product as any)?.storage ?? null,
            purchase_price: dto.purchase_price ?? null,
            inbound_manager: dto.inbound_manager ?? null,
            // ✅ Sale price: DTO'dan yoki Product level'dan (fallback)
            sale_price: dto.sale_price ?? (product as any)?.sale_price ?? null,
          expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
            // ✅ Alert days: DTO'dan yoki Product level'dan (fallback)
            alert_days: dto.alert_days ?? (product as any)?.alert_days ?? null,
            // ✅ 별도 구매 여부
            is_separate_purchase: dto.is_separate_purchase ?? false,
        } as any,
      });

        // Debug: Yaratilgan batch'ning min_stock'ini log qilish

        // ✅ Check if this is the FIRST batch for this product
        const existingBatches = await tx.batch.count({
          where: { product_id: productId, tenant_id: tenantId },
        });

        // If this is the first batch, set Product's inbound_qty
        if (existingBatches === 1) {
          // Count includes the just-created batch
          await tx.product.update({
            where: { id: productId, tenant_id: tenantId },
            data: { inbound_qty: dto.qty },
          });
        }

      // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
      const totalStock = await tx.batch.aggregate({
        where: { product_id: productId, tenant_id: tenantId },
        _sum: { qty: true },
      });

        const newCurrentStock = totalStock._sum.qty ?? 0;
        
        // 🔍 DEBUG LOG
        this.logger.log(`[UPDATE CURRENT_STOCK] Product ${productId}: ${newCurrentStock} (from ${await tx.batch.count({ where: { product_id: productId, tenant_id: tenantId } })} batches)`);

      await tx.product.update({
        where: { id: productId },
        data: {
            current_stock: newCurrentStock,
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
  /**
   * Generate custom batch number in BTX-XXX format
   * Always uses custom format (ignores GS1 batch numbers)
   */
  private async generateBatchNo(
    productId: string,
    tenantId: string,
    tx: any
  ): Promise<string> {
    const productPrefix = 'BTX'; // Custom prefix for all products
    
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

        return `${productPrefix}-${sequenceNumber}`;
      }

    // Product'ning mavjud batch'lari sonini topish
    const existingBatchesCount = await tx.batch.count({
      where: { product_id: productId, tenant_id: tenantId },
    });

    // Keyingi tartib raqamini hisoblash (001, 002, 003, ...)
    const sequenceNumber = (existingBatchesCount + 1)
      .toString()
      .padStart(3, "0");

    // Formatlash: BTX-001, BTX-002, BTX-003, ...
    return `${productPrefix}-${sequenceNumber}`;
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

      return `${productPrefix}-${sequenceNumber}`;
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

  /**
   * Preview CSV Import - Validate data before actual import
   * @param tenantId - Tenant ID
   * @param rows - Parsed CSV rows
   * @returns Validation results with errors
   */
  async previewImport(tenantId: string, rows: ImportProductRowDto[]) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!rows || rows.length === 0) {
      throw new BadRequestException("No data to import");
    }

    // Safety limit - max 10,000 rows
    if (rows.length > 10000) {
      throw new BadRequestException(
        `Maximum 10,000 rows allowed. You have ${rows.length} rows.`
      );
    }

    const validationResults = [];
    const barcodes = new Set<string>();
    const duplicateBarcodes = new Set<string>();

    // Fetch existing barcodes from database in one query
    const existingProducts = await this.prisma.product.findMany({
      where: {
        tenant_id: tenantId,
        barcode: { not: null },
      },
      select: {
        barcode: true,
      },
    });

    const existingBarcodes = new Set(
      existingProducts.map((p: any) => p.barcode?.trim()).filter(Boolean)
    );

    for (const [index, row] of rows.entries()) {
      const errors: string[] = [];

      // Validate required fields
      if (!row.name?.trim()) errors.push("Name is required");
      if (!row.brand?.trim()) errors.push("Brand is required");
      if (!row.category?.trim()) errors.push("Category is required");
      if (!row.unit?.trim()) errors.push("Unit is required");
      if (row.inbound_qty === undefined || row.inbound_qty === null)
        errors.push("Inbound quantity is required");
      if (row.min_stock === undefined || row.min_stock === null)
        errors.push("Min stock is required");
      if (
        row.capacity_per_product === undefined ||
        row.capacity_per_product === null
      )
        errors.push("Capacity per product is required");
      if (!row.capacity_unit?.trim()) errors.push("Capacity unit is required");
      if (row.usage_capacity === undefined || row.usage_capacity === null)
        errors.push("Usage capacity is required");
      if (!row.expiry_date?.trim()) errors.push("Expiry date is required");
      if (row.alert_days === undefined || row.alert_days === null)
        errors.push("Alert days is required");
      if (!row.storage?.trim()) errors.push("Storage location is required");

      // Validate expiry date format
      if (row.expiry_date) {
        const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
        const usDatePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/; // MM/DD/YYYY

        if (
          !isoDatePattern.test(row.expiry_date) &&
          !usDatePattern.test(row.expiry_date)
        ) {
          errors.push("Expiry date must be in YYYY-MM-DD or MM/DD/YYYY format");
        } else {
          // Validate if it's a valid date
          let date: Date;
          if (isoDatePattern.test(row.expiry_date)) {
            date = new Date(row.expiry_date);
          } else {
            // Convert MM/DD/YYYY to YYYY-MM-DD
            const parts = row.expiry_date.split("/");
            const month = parts[0].padStart(2, "0");
            const day = parts[1].padStart(2, "0");
            const year = parts[2];
            date = new Date(`${year}-${month}-${day}`);
          }

          if (isNaN(date.getTime())) {
            errors.push("Invalid expiry date");
          }
        }
      }

      // Validate numeric fields
      if (row.inbound_qty < 0)
        errors.push("Inbound quantity cannot be negative");
      if (row.min_stock < 0) errors.push("Min stock cannot be negative");
      if (row.capacity_per_product < 0)
        errors.push("Capacity per product cannot be negative");
      if (row.usage_capacity < 0)
        errors.push("Usage capacity cannot be negative");
      if (row.alert_days < 0) errors.push("Alert days cannot be negative");

      // Validate optional prices
      if (
        row.purchase_price !== undefined &&
        row.purchase_price !== null &&
        row.purchase_price < 0
      ) {
        errors.push("Purchase price cannot be negative");
      }
      if (
        row.sale_price !== undefined &&
        row.sale_price !== null &&
        row.sale_price < 0
      ) {
        errors.push("Sale price cannot be negative");
      }

      // Check duplicate barcode (optional field)
      if (row.barcode?.trim()) {
        const trimmedBarcode = row.barcode.trim();

        // Check against existing database
        if (existingBarcodes.has(trimmedBarcode)) {
          errors.push(`Barcode "${trimmedBarcode}" already exists in database`);
        }

        // Check duplicates within CSV
        if (barcodes.has(trimmedBarcode)) {
          duplicateBarcodes.add(trimmedBarcode);
          errors.push(
            `Barcode "${trimmedBarcode}" appears multiple times in CSV`
          );
        } else {
          barcodes.add(trimmedBarcode);
        }
      }

      validationResults.push({
        row: index + 1,
        data: row,
        valid: errors.length === 0,
        errors,
      });
    }

    const validCount = validationResults.filter((r) => r.valid).length;
    const errorCount = validationResults.filter((r) => !r.valid).length;

    return {
      total: rows.length,
      valid: validCount,
      errors: errorCount,
      results: validationResults,
    };
  }

  /**
   * Confirm CSV Import - Actually import validated data
   * Strict Mode: All or nothing (transaction)
   * Flexible Mode: Import valid rows only
   * @param tenantId - Tenant ID
   * @param rows - Validated CSV rows
   * @param mode - 'strict' (all or nothing) or 'flexible' (import valid only)
   * @returns Import results
   */
  async confirmImport(
    tenantId: string,
    rows: ImportProductRowDto[],
    mode: "strict" | "flexible" = "strict",
    inboundManager: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!inboundManager?.trim()) {
      throw new BadRequestException("입고 담당자는 필수입니다");
    }

    if (!rows || rows.length === 0) {
      throw new BadRequestException("No data to import");
    }

    // Re-validate before import
    const preview = await this.previewImport(tenantId, rows);

    if (mode === "strict" && preview.errors > 0) {
      throw new BadRequestException(
        `Cannot import in strict mode with ${preview.errors} validation errors. Use flexible mode or fix errors.`
      );
    }

    // Filter valid rows for flexible mode
    const validRows =
      mode === "flexible"
        ? preview.results.filter((r) => r.valid).map((r) => r.data)
        : rows;

    if (validRows.length === 0) {
      throw new BadRequestException("No valid rows to import");
    }

    const imported: any[] = [];
    const failed: any[] = [];
    const BATCH_SIZE = 100; // Process 100 rows at a time
    const BATCH_DELAY = 100; // 100ms delay between batches

    // Process in batches with transaction per batch
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      try {
        // Use transaction for each batch
        const batchResults = await this.prisma.$transaction(
          async (tx: any) => {
            const results: any[] = [];

            for (const row of batch) {
              try {
                // Generate unique ID
                const productId = this.generateProductId();

                // STEP 1: Find supplier if contact_phone provided
                let supplierId: string | null = null;
                let supplierName: string | null = null;

                if (row.contact_phone?.trim()) {
                  const supplier = await this.findSupplierByPhone(
                    tenantId,
                    row.contact_phone,
                    tx
                  );

                  if (supplier) {
                    supplierId = supplier.id;
                    supplierName = supplier.company_name;
                  } else {
                    this.logger.warn(
                      `📞 No supplier found for phone: ${row.contact_phone}`
                    );
                  }
                }

                // STEP 2: Create product
                const product = await (tx.product.create as any)({
                  data: {
                    id: productId,
                    tenant_id: tenantId,
                    name: row.name.trim(),
                    brand: row.brand.trim(),
                    barcode: row.barcode?.trim() || null,
                    category: row.category.trim(),
                    unit: row.unit.trim(),
                    min_stock: row.min_stock,
                    purchase_price: row.purchase_price ?? null,
                    sale_price: row.sale_price ?? null,
                    usage_capacity: row.usage_capacity,
                    capacity_unit: row.capacity_unit.trim(),
                    capacity_per_product: row.capacity_per_product,
                    storage: row.storage.trim(),
                    alert_days: row.alert_days.toString(), // Convert to string for database
                    current_stock: row.inbound_qty,
                    inbound_qty: row.inbound_qty, // ✅ Added: CSV inbound quantity
                    inbound_manager: inboundManager.trim(), // ✅ Added: CSV import manager
                    status: "active",
                  },
                });

                // STEP 3: Create ProductSupplier link if supplier found
                if (supplierId) {
                  await (tx.productSupplier.create as any)({
                    data: {
                      tenant_id: tenantId,
                      product_id: productId,
                      clinic_supplier_manager_id: supplierId,
                      purchase_price: row.purchase_price ?? null,
                    },
                  });
                }

                // STEP 4: Create initial batch
                const batchId = this.generateBatchId();

                // Generate batch_no using the same logic as inbound new (9-digit random + sequence)
                const batchNo = await this.generateBatchNo(
                  productId,
                  tenantId,
                  tx
                );

                await (tx.batch.create as any)({
                  data: {
                    id: batchId,
                    tenant_id: tenantId,
                    product_id: productId,
                    batch_no: batchNo, // Format: 123456789-001
                    qty: row.inbound_qty,
                    inbound_qty: row.inbound_qty,
                    used_count: 0,
                    unit: row.unit.trim(),
                    min_stock: row.min_stock,
                    purchase_price: row.purchase_price ?? null, // ✅ Added: CSV purchase price
                    sale_price: row.sale_price ?? null, // ✅ Added: CSV sale price
                    expiry_date: this.parseExpiryDate(row.expiry_date),
                    storage: row.storage.trim(),
                    alert_days: row.alert_days.toString(), // Convert to string for database
                    inbound_manager: inboundManager.trim(), // CSV Import manager
                  },
                });

                results.push({
                  success: true,
                  product,
                  supplierLinked: !!supplierId,
                  supplierName: supplierName,
                });
              } catch (error: any) {
                this.logger.error(
                  `Failed to import row: ${JSON.stringify(row)}`,
                  error.stack
                );
                results.push({
                  success: false,
                  row,
                  error: error.message || "Unknown error",
                });
              }
            }

            return results;
          },
          {
            maxWait: 10000, // 10 seconds max wait
            timeout: 300000, // 5 minutes timeout
          }
        );

        // Separate successful and failed imports
        for (const result of batchResults) {
          if (result.success) {
            imported.push(result.product);
          } else {
            failed.push({
              row: result.row,
              error: result.error,
            });
          }
        }

        // Delay between batches to avoid overwhelming database
        if (i + BATCH_SIZE < validRows.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      } catch (error: any) {
        // If batch transaction fails, mark all batch rows as failed
        for (const row of batch) {
          failed.push({
            row,
            error: error.message || "Batch transaction failed",
          });
        }
      }
    }

    // Clear cache after import
    this.productsCache.clear();

    return {
      success: true,
      total: rows.length,
      imported: imported.length,
      failed: failed.length,
      failures: failed.length > 0 ? failed : undefined,
    };
  }

  /**
   * Generate unique product ID
   */
  private generateProductId(): string {
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");
    return `P${timestamp}${random}`;
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");
    return `B${timestamp}${random}`;
  }

  /**
   * Convert expiry date from MM/DD/YYYY or YYYY-MM-DD to Date object
   */
  private parseExpiryDate(dateString: string): Date {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
    const usDatePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/; // MM/DD/YYYY

    if (isoDatePattern.test(dateString)) {
      return new Date(dateString);
    } else if (usDatePattern.test(dateString)) {
      // Convert MM/DD/YYYY to YYYY-MM-DD
      const parts = dateString.split("/");
      const month = parts[0].padStart(2, "0");
      const day = parts[1].padStart(2, "0");
      const year = parts[2];
      return new Date(`${year}-${month}-${day}`);
    }

    // Fallback to default parsing
    return new Date(dateString);
  }

  /**
   * Normalize phone number for matching
   * Removes all non-digit characters: 010-1234-5678 → 01012345678
   * @param phone - Raw phone number
   * @returns Normalized phone number (digits only)
   */
  private normalizePhoneNumber(phone: string): string {
    if (!phone) return "";
    return phone.replace(/\D/g, ""); // Remove all non-digits
  }

  /**
   * Find ClinicSupplierManager by normalized phone number
   * Supports various formats: 010-1234-5678, 01012345678, +82-10-1234-5678
   * @param tenantId - Tenant ID
   * @param contactPhone - Contact phone from CSV
   * @param tx - Optional transaction client
   * @returns ClinicSupplierManager or null
   */
  private async findSupplierByPhone(
    tenantId: string,
    contactPhone: string,
    tx?: any
  ): Promise<any | null> {
    if (!contactPhone?.trim()) return null;

    const normalizedInput = this.normalizePhoneNumber(contactPhone);
    if (!normalizedInput) return null;

    const client = tx ?? this.prisma;

    // Get all suppliers for tenant
    const suppliers = await (client.clinicSupplierManager.findMany as any)({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        phone_number: true,
        company_name: true,
        name: true,
      },
    });

    // Match by normalized phone
    return (
      suppliers.find(
        (s: any) =>
          this.normalizePhoneNumber(s.phone_number) === normalizedInput
      ) || null
    );
  }
}
