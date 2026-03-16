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
import { CreateBatchDto, CreateProductDto, UpdateBatchDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { ImportProductRowDto } from "../dto/import-products.dto";
import { ClinicSupplierHelperService } from "../../supplier/services/clinic-supplier-helper.service";
import { CacheManager } from "../../../common/cache";
import { StorageService } from "../../../core/storage/storage.service";

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  // ✅ Replaced Map with CacheManager - automatic cleanup, size limits, LRU eviction
  private productsCache: CacheManager<any>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicSupplierHelper: ClinicSupplierHelperService,
    private readonly storageService: StorageService,
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
      ttl: 0, // Disabled - inventory data must be real-time (was 5 seconds)
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
              current_stock: true,
              min_stock: true,
              purchase_price: true,
              sale_price: true,
              unit: true,
              usage_capacity: true,
              capacity_unit: true,
              capacity_per_product: true,
              alert_days: true,
              created_at: true,
              batches: {
                select: {
                  id: true,
                  batch_no: true,
                  qty: true,
                  inbound_qty: true,
                  used_count: true,
                  available_quantity: true,
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
                  position: true, // ✅ Added for managerPosition
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
          status: null, // status field removed from Product table
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
          managerPosition: supplierManager?.position ?? null, // ✅ Added
          expiryDate: latestBatch?.expiry_date ?? null,
          storageLocation: latestBatch?.storage ?? null, // Only from batch now
          productStorage: latestBatch?.storage ?? null, // Fallback to batch storage
          memo: returnPolicy?.note ?? null,
          expiryMonths: null, // Removed from Product table
          expiryUnit: null, // Removed from Product table
          isLowStock: product.current_stock < product.min_stock,
          updated_at: product.updated_at, // ✅ For image cache busting
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
      status: null, // status field removed from Product table
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
      storageLocation: latestBatch?.storage ?? null, // Only from batch now
      productStorage: latestBatch?.storage ?? null, // Fallback to batch storage
      memo: returnPolicy?.note ?? null,
      expiryMonths: null, // Removed from Product table
      expiryUnit: null, // Removed from Product table
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

    const gtin = dto.barcode?.trim();
    if (gtin) {
      const existingGtin = await (this.prisma as any).productGTIN.findUnique({
        where: { tenant_id_gtin: { tenant_id: tenantId, gtin } },
        select: { product_id: true },
      });
      if (existingGtin) {
        const existingProduct = await this.getProduct(
          existingGtin.product_id,
          tenantId
        );
        if (existingProduct) {
          return {
            ...existingProduct,
            existingForBarcode: true,
            code: "PRODUCT_ALREADY_EXISTS_FOR_THIS_BARCODE",
          } as any;
        }
      }
    }

    let imageUrl: string | undefined;

    if (dto.image) {
      const [savedImage] = await saveBase64Images(
        "product",
        [dto.image],
        tenantId,
        this.storageService
      );
      imageUrl = savedImage;
    }

    let createdProductFromTransaction: any;
    try {
      createdProductFromTransaction = await this.prisma.$transaction(
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
              // status field removed from Product table
              is_active: resolvedIsActive,
              unit: dto.unit ?? null,
              purchase_price: dto.purchasePrice ?? null, // Default/fallback price
              sale_price: dto.salePrice ?? null,
              current_stock: dto.currentStock ?? 0,
              min_stock: dto.minStock ?? 0,
              capacity_per_product: dto.capacityPerProduct ?? null,
              capacity_unit: dto.capacityUnit ?? null,
              usage_capacity: dto.usageCapacity ?? null,
              alert_days: dto.alertDays ?? null,
              has_expiry_period: dto.hasExpiryPeriod ?? false,
              // All removed fields: expiry_months, expiry_unit, inbound_manager, storage
              // has_different_packaging_quantity, packaging_from_unit, packaging_to_unit, etc.
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

          // ✅ GTIN: link barcode to product for duplicate prevention (unique per tenant)
          if (gtin) {
            await (tx as any).productGTIN.create({
              data: {
                tenant_id: tenantId,
                product_id: product.id,
                gtin,
                barcode_package_type: (dto as any).barcodePackageType ?? "BOX",
              },
            });
          }

          // Additional barcodes
          if ((dto as any).additionalBarcodes?.length) {
            for (const ab of (dto as any).additionalBarcodes) {
              if (ab.gtin?.trim()) {
                await (tx as any).productGTIN.create({
                  data: {
                    tenant_id: tenantId,
                    product_id: product.id,
                    gtin: ab.gtin.trim(),
                    barcode_package_type: ab.barcode_package_type ?? "BOX",
                  },
                });
              }
            }
          }

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
              // Agar barcode-dan batch_no kelgan bo'lsa, unga tartib raqam qo'shamiz
              let batchNo: string;
              if (batch.batch_no && batch.batch_no.trim() !== "") {
                // Barcode-dan kelgan batch number: tartib raqam qo'shish kerak
                batchNo = await this.generateBatchNo(
                  product.id,
                  tenantId,
                  tx,
                  batch.batch_no.trim()
                );
              } else {
                // Random batch number yaratish: 9ta random raqam - 001
                batchNo = await this.generateBatchNo(product.id, tenantId, tx);
              }

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

            // inbound_qty field removed from Product table - no longer needed
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
    } catch (e: any) {
      if (e?.code === "P2002" && gtin) {
        const existingGtin = await (this.prisma as any).productGTIN.findUnique({
          where: { tenant_id_gtin: { tenant_id: tenantId, gtin } },
          select: { product_id: true },
        });
        if (existingGtin) {
          const existingProduct = await this.getProduct(
            existingGtin.product_id,
            tenantId
          );
          if (existingProduct) {
            return {
              ...existingProduct,
              existingForBarcode: true,
              code: "PRODUCT_ALREADY_EXISTS_FOR_THIS_BARCODE",
            } as any;
          }
        }
      }
      throw e;
    }

    // ✅ Optimized: Add new product to cache instead of invalidating
    // This prevents performance degradation on VPS
    // Use the product returned from transaction for cache
    if (createdProductFromTransaction) {
      this.addProductToCache(tenantId, createdProductFromTransaction);
      // ✅ Cache invalidation: Force full cache refresh after create
      this.clearProductsCache(tenantId);
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
        productGtins: {
          orderBy: { id: "asc" as const },
        },
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
      barcode: product.barcode ?? null,
      barcodes: (product.productGtins ?? []).map((g: any) => ({
        id: g.id,
        gtin: g.gtin,
        barcode_package_type: g.barcode_package_type ?? "BOX",
      })),
      productImage: product.image_url,
      category: product.category,
      status: null, // status field removed from Product table
      currentStock: product.current_stock,
      inboundQty: null, // inbound_qty removed from Product table - should get from first Batch if needed
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
      expiryDate: latestBatch?.expiry_date ?? null, // Only from batch now
      storageLocation: latestBatch?.storage ?? null, // Only from batch now
      productStorage: latestBatch?.storage ?? null, // Fallback to batch storage
      inboundManager: null, // Removed from Product table
      memo: product.returnPolicy?.note ?? null,
      isReturnable: product.returnPolicy?.is_returnable ?? false,
      refundAmount: product.returnPolicy?.refund_amount ?? null,
      returnStorage: product.returnPolicy?.return_storage ?? null,
      alertDays: product.alert_days ?? null,
      hasExpiryPeriod: (product as any).has_expiry_period ?? false,
    };
  }

  async getAllProducts(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // ✅ DISABLED CACHE: Always fetch fresh data from database
    // Cache disabled for real-time inventory accuracy (qty, available_quantity)
    // Previous issue: Stale cache returned old data even with TTL=0

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
            current_stock: true,
            min_stock: true,
            purchase_price: true,
            sale_price: true,
            unit: true,
            usage_capacity: true,
            capacity_unit: true,
            capacity_per_product: true,
            alert_days: true,
            has_expiry_period: true,
            created_at: true,
            batches: {
              select: {
                id: true,
                batch_no: true,
                qty: true,
                inbound_qty: true,
                used_count: true,
                outbound_count: true,
                available_quantity: true,
                unit: true,
                min_stock: true,
                expiry_date: true,
                storage: true,
                alert_days: true,
                created_at: true,
                is_separate_purchase: true,
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
        status: null, // status field removed from Product table
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
        storageLocation: latestBatch?.storage ?? null, // Only from batch now
        productStorage: latestBatch?.storage ?? null, // Fallback to batch storage
        memo: returnPolicy?.note ?? null,
        expiryMonths: null, // Removed from Product table
        expiryUnit: null, // Removed from Product table
        alertDays: product.alert_days ?? null,
        hasExpiryPeriod: (product as any).has_expiry_period ?? false,
        isLowStock: product.current_stock < product.min_stock,
        batches: (product.batches || []).map((batch: any) => {
          const expiryDate = batch.expiry_date
            ? new Date(batch.expiry_date)
            : null;
          const alertDays = batch.alert_days ?? product.alert_days ?? null;
          const daysUntilExpiry = expiryDate
            ? this.calculateDaysUntilExpiry(expiryDate)
            : null;
          const isExpiringSoon = expiryDate
            ? this.calculateExpiringSoon(expiryDate, alertDays)
            : false;
          return {
            ...batch,
            daysUntilExpiry,
            isExpiringSoon,
          };
        }),
      };
    });

    // 🔍 DEBUG LOG - First 3 products
    if (formattedProducts.length > 0) {
      this.logger.log(
        `[getAllProducts] First 3 products currentStock:`,
        formattedProducts
          .slice(0, 3)
          .map((p: any) => `${p.productName}: ${p.currentStock}`)
      );
    }

    // Cache'ga saqlash
    this.setCachedData(tenantId, formattedProducts);

    return formattedProducts;
  }

  /**
   * Find product by barcode (GTIN)
   * Used for USB barcode scanner functionality. Looks up via ProductGTIN first, then Product.barcode fallback.
   */
  async findByBarcode(barcode: string, tenantId: string) {
    if (!barcode || !tenantId) {
      throw new BadRequestException("Barcode and tenant ID are required");
    }

    const gtin = barcode.trim();
    const gtinRecord = await (this.prisma as any).productGTIN
      .findUnique({
        where: { tenant_id_gtin: { tenant_id: tenantId, gtin } },
        select: { product_id: true },
      })
      .catch(() => null);

    if (gtinRecord) {
      return this.getProduct(gtinRecord.product_id, tenantId);
    }

    const product = await this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).product.findFirst({
        where: {
          tenant_id: tenantId,
          barcode: gtin,
          is_active: true,
        },
        select: { id: true },
      });
    });

    if (product) {
      return this.getProduct(product.id, tenantId);
    }

    throw new NotFoundException(`Product with barcode ${barcode} not found`);
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
          tenantId,
          this.storageService
        );
        imageUrl = savedImage;
      }
    }
    // Agar dto.image undefined bo'lsa, eski image saqlanadi (image o'zgarmagan)

    // const resolvedStatus = dto.status ?? existing.status;
    // const resolvedIsActive =
    //   dto.isActive ??
    //   (resolvedStatus === "활성" || resolvedStatus === "재고 부족");

    const newCurrentStock =
      dto.currentStock !== undefined
        ? dto.currentStock
        : existing.current_stock;

    // ✅ Track if user manually changed stock (for batch update later).
    // Product table no longer has inbound_qty column (removed in 20260217).
    const stockWasChanged =
      dto.currentStock !== undefined &&
      dto.currentStock !== existing.current_stock;

    const newBarcode =
      dto.barcode !== undefined
        ? dto.barcode?.trim() || null
        : existing.barcode?.trim() || null;
    if (newBarcode && newBarcode !== (existing.barcode?.trim() || null)) {
      const other = await (this.prisma as any).productGTIN.findUnique({
        where: { tenant_id_gtin: { tenant_id: tenantId, gtin: newBarcode } },
        select: { product_id: true },
      });
      if (other && other.product_id !== id) {
        throw new BadRequestException(
          "Bu 바코드(GTIN)는 이미 다른 제품에 등록되어 있습니다."
        );
      }
    }

    // ✅ Additional barcodes duplicate check
    const additionalBarcodesPayload = (dto as any).additionalBarcodes ?? [];
    for (const ab of additionalBarcodesPayload) {
      const abGtin = ab.gtin?.trim();
      if (!abGtin || abGtin === newBarcode) continue;
      const existing_ab = await (this.prisma as any).productGTIN.findUnique({
        where: { tenant_id_gtin: { tenant_id: tenantId, gtin: abGtin } },
        select: { product_id: true },
      });
      if (existing_ab && existing_ab.product_id !== id) {
        throw new BadRequestException(
          `추가 바코드 ${abGtin}는 이미 다른 제품에 등록되어 있습니다.`
        );
      }
    }

    await this.prisma.$transaction(
      async (tx: any) => {
        await tx.product.update({
          where: { id },
          data: {
            name: dto.name ?? existing.name,
            brand: dto.brand ?? existing.brand,
            barcode: newBarcode ?? dto.barcode ?? existing.barcode,
            image_url: imageUrl,
            category: dto.category ?? existing.category,
            // status: resolvedStatus,
            // is_active: resolvedIsActive,
            unit: dto.unit ?? existing.unit,
            purchase_price: dto.purchasePrice ?? existing.purchase_price,
            sale_price: dto.salePrice ?? existing.sale_price,
            current_stock: newCurrentStock, // Use the computed value
            min_stock:
              dto.minStock !== undefined ? dto.minStock : existing.min_stock, // Allow 0
            capacity_per_product:
              dto.capacityPerProduct ?? (existing as any).capacity_per_product,
            capacity_unit: dto.capacityUnit ?? (existing as any).capacity_unit,
            usage_capacity:
              dto.usageCapacity ?? (existing as any).usage_capacity,
            // Product table no longer has storage, inbound_manager, expiry_date, inbound_qty (removed in 20260217)
            ...(dto.alertDays !== undefined && { alert_days: dto.alertDays }),
            ...(dto.hasExpiryPeriod !== undefined && {
              has_expiry_period: !!dto.hasExpiryPeriod,
            }),
            updated_at: new Date(),
          } as any,
        });

        // ✅ GTIN sync: recreate all ProductGTIN records on update
        await (tx as any).productGTIN.deleteMany({ where: { product_id: id } });
        if (newBarcode) {
          await (tx as any).productGTIN.create({
            data: {
              tenant_id: tenantId,
              product_id: id,
              gtin: newBarcode,
              barcode_package_type: (dto as any).barcodePackageType ?? "BOX",
            },
          });
        }
        // Additional barcodes
        if ((dto as any).additionalBarcodes?.length) {
          for (const ab of (dto as any).additionalBarcodes) {
            if (ab.gtin?.trim() && ab.gtin.trim() !== newBarcode) {
              await (tx as any).productGTIN.create({
                data: {
                  tenant_id: tenantId,
                  product_id: id,
                  gtin: ab.gtin.trim(),
                  barcode_package_type: ab.barcode_package_type ?? "BOX",
                },
              });
            }
          }
        }

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

              const isUuid =
                supplier.supplier_id &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  supplier.supplier_id
                );

              // 0. Agar frontend mavjud supplier id yuborsa (product edit: 수정) — shu yozuvni UPDATE qilish
              let existingClinicSupplierManager = null;
              if (isUuid) {
                existingClinicSupplierManager =
                  await tx.clinicSupplierManager.findFirst({
                    where: {
                      id: supplier.supplier_id,
                      tenant_id: tenantId,
                    },
                  });
              }

              if (existingClinicSupplierManager) {
                // Mavjud ClinicSupplierManager — faqat UPDATE (telefon/ism va boshqalar yangilanadi)
                await tx.clinicSupplierManager.update({
                  where: { id: existingClinicSupplierManager.id },
                  data: {
                    company_name:
                      supplier.company_name ??
                      existingClinicSupplierManager.company_name,
                    business_number:
                      supplier.business_number ??
                      existingClinicSupplierManager.business_number,
                    company_phone:
                      supplier.company_phone ??
                      existingClinicSupplierManager.company_phone,
                    company_email:
                      supplier.company_email ??
                      existingClinicSupplierManager.company_email,
                    company_address:
                      supplier.company_address ??
                      existingClinicSupplierManager.company_address,
                    name:
                      supplier.contact_name ??
                      existingClinicSupplierManager.name,
                    phone_number:
                      supplier.contact_phone ??
                      existingClinicSupplierManager.phone_number,
                    email1:
                      supplier.contact_email ??
                      existingClinicSupplierManager.email1,
                  },
                });
                clinicSupplierManagerId = existingClinicSupplierManager.id;
              } else {
                // Mavjud id yo'q — telefon bo'yicha qidirish yoki yangi yaratish
                if (supplier.contact_phone) {
                  existingClinicSupplierManager =
                    await tx.clinicSupplierManager.findFirst({
                      where: {
                        tenant_id: tenantId,
                        phone_number: supplier.contact_phone,
                      },
                    });
                }

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
                  // Yangi ClinicSupplierManager yaratish
                  let linkedSupplierManagerId: string | null = null;
                  if (isUuid) {
                    const existingBySupplierId =
                      await tx.clinicSupplierManager.findFirst({
                        where: {
                          id: supplier.supplier_id,
                          tenant_id: tenantId,
                        },
                        select: { linked_supplier_manager_id: true },
                      });
                    if (existingBySupplierId?.linked_supplier_manager_id) {
                      linkedSupplierManagerId =
                        existingBySupplierId.linked_supplier_manager_id;
                    }
                  }

                  const newClinicSupplierManager =
                    await tx.clinicSupplierManager.create({
                      data: {
                        tenant_id: tenantId,
                        company_name:
                          supplier.company_name || "공급업체 없음",
                        business_number: supplier.business_number || null,
                        company_phone: supplier.company_phone || null,
                        company_email: supplier.company_email || null,
                        company_address: supplier.company_address || null,
                        name: supplier.contact_name || "담당자 없음",
                        phone_number:
                          supplier.contact_phone || "000-0000-0000",
                        email1: supplier.contact_email || null,
                        linked_supplier_manager_id: linkedSupplierManagerId,
                      },
                    });

                  clinicSupplierManagerId = newClinicSupplierManager.id;
                }
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

        // ✅ capacity_per_product o'zgarganda barcha batch'larning available_quantity ni qayta hisoblash
        const existingCap = Number((existing as any).capacity_per_product ?? 0);
        const newCapacity = dto.capacityPerProduct;
        const capacityChanged =
          newCapacity !== undefined && Number(newCapacity) !== existingCap;

        if (capacityChanged) {
          const allBatches = await tx.batch.findMany({
            where: { product_id: id },
            select: { id: true, qty: true },
          });
          const cap = Number(newCapacity);
          for (const batch of allBatches) {
            const av = cap > 0 ? cap * batch.qty : batch.qty;
            await tx.batch.update({
              where: { id: batch.id },
              data: { available_quantity: av, updated_at: new Date() },
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
            // Agar barcode-dan batch_no kelgan bo'lsa, unga tartib raqam qo'shamiz
            let batchNo: string;
            if (batch.batch_no && batch.batch_no.trim() !== "") {
              // Barcode-dan kelgan batch number: tartib raqam qo'shish kerak
              batchNo = await this.generateBatchNo(
                id,
                tenantId,
                tx,
                batch.batch_no.trim()
              );
            } else {
              // Random batch number yaratish: 9ta random raqam - 001
              batchNo = await this.generateBatchNo(id, tenantId, tx);
            }

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
      // ✅ Cache invalidation: Force full cache refresh after update
      this.clearProductsCache(tenantId);
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
        manufacture_date: true,
        alert_days: true,
        storage: true,
        created_at: true,
        qty: true,
        inbound_qty: true,
        used_count: true,
        outbound_count: true,
        unit: true,
        min_stock: true,
        purchase_price: true,
        is_separate_purchase: true,
        inbound_manager: true,
        reason_for_modification: true,
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
      "입고 수량": batch.qty,
      inbound_qty: batch.inbound_qty ?? null,
      unit: batch.unit ?? null,
      min_stock: batch.min_stock ?? null,
      purchase_price: batch.purchase_price ?? null,
      created_at: batch.created_at,
      is_separate_purchase: batch.is_separate_purchase ?? false,
      manufacture_date: batch.manufacture_date
        ? batch.manufacture_date.toISOString().split("T")[0]
        : null,
      expiry_date: batch.expiry_date
        ? batch.expiry_date.toISOString().split("T")[0]
        : null,
      inbound_manager: batch.inbound_manager ?? null,
      reason_for_modification: batch.reason_for_modification ?? null,
      expiry_months: batch.expiry_months,
      expiry_unit: batch.expiry_unit,
      alert_days: batch.alert_days,
      storage: batch.storage,
      qty: batch.qty,
    }));
  }

  /**
   * Product batch history: barcha batchlar (qty 0 ham), created_at so'nggi N oy
   */
  async getProductBatchHistory(
    productId: string,
    tenantId: string,
    months: number = 3
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const batches = await (this.prisma.batch.findMany as any)({
      where: {
        product_id: productId,
        tenant_id: tenantId,
        created_at: { gte: since },
      },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        batch_no: true,
        expiry_date: true,
        expiry_months: true,
        expiry_unit: true,
        manufacture_date: true,
        alert_days: true,
        storage: true,
        created_at: true,
        qty: true,
        inbound_qty: true,
        used_count: true,
        outbound_count: true,
        unit: true,
        min_stock: true,
        purchase_price: true,
        is_separate_purchase: true,
        inbound_manager: true,
        reason_for_modification: true,
      },
    });

    return batches.map((batch: any) => ({
      id: batch.id,
      batch_no: batch.batch_no,
      유효기간: batch.expiry_date
        ? batch.expiry_date.toISOString().split("T")[0]
        : batch.expiry_months && batch.expiry_unit
          ? `${batch.expiry_months} ${batch.expiry_unit}`
          : null,
      보관위치: batch.storage ?? null,
      "입고 수량": batch.qty,
      inbound_qty: batch.inbound_qty ?? null,
      unit: batch.unit ?? null,
      min_stock: batch.min_stock ?? null,
      purchase_price: batch.purchase_price ?? null,
      created_at: batch.created_at,
      is_separate_purchase: batch.is_separate_purchase ?? false,
      manufacture_date: batch.manufacture_date
        ? batch.manufacture_date.toISOString().split("T")[0]
        : null,
      expiry_date: batch.expiry_date
        ? batch.expiry_date.toISOString().split("T")[0]
        : null,
      inbound_manager: batch.inbound_manager ?? null,
      reason_for_modification: batch.reason_for_modification ?? null,
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
        // ✅ Use frontend's batch_no if provided (from barcode), otherwise auto-generate
        // Agar barcode-dan batch_no kelgan bo'lsa, unga tartib raqam qo'shamiz
        let batchNo: string;
        if (dto.batch_no && dto.batch_no.trim() !== "") {
          // Barcode-dan kelgan batch number: tartib raqam qo'shish kerak
          // Format: barcode_batch_number - 001
          batchNo = await this.generateBatchNo(
            productId,
            tenantId,
            tx,
            dto.batch_no.trim()
          );
        } else {
          // Random batch number yaratish: 9ta random raqam - 001
          batchNo = await this.generateBatchNo(productId, tenantId, tx);
        }

        // Product'ni olish (storage, unit, expiry_months, expiry_unit, alert_days, sale_price, min_stock uchun)
        const product = await tx.product.findFirst({
          where: { id: productId, tenant_id: tenantId },
          select: {
            unit: true,
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

        // inbound_qty field removed from Product table - no longer needed

        // Product'ning current_stock'ini yangilash (barcha batch'larning qty yig'indisi)
        const totalStock = await tx.batch.aggregate({
          where: { product_id: productId, tenant_id: tenantId },
          _sum: { qty: true },
        });

        const newCurrentStock = totalStock._sum.qty ?? 0;

        // 🔍 DEBUG LOG
        this.logger.log(
          `[UPDATE CURRENT_STOCK] Product ${productId}: ${newCurrentStock} (from ${await tx.batch.count({ where: { product_id: productId, tenant_id: tenantId } })} batches)`
        );

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
      // ✅ Cache invalidation: Force full cache refresh after batch create
      this.clearProductsCache(tenantId);
    } else {
      // Fallback: invalidate if product not found
      this.clearProductsCache(tenantId);
    }
  }

  /**
   * Update an existing batch (no new batch created).
   */
  async updateBatchForProduct(
    productId: string,
    batchId: string,
    dto: UpdateBatchDto,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const batch = await this.prisma.batch.findFirst({
      where: {
        id: batchId,
        product_id: productId,
        tenant_id: tenantId,
      },
    });

    if (!batch) {
      throw new NotFoundException("Batch not found");
    }

    const updateData: any = { updated_at: new Date() };
    if (dto.qty !== undefined) {
      updateData.qty = dto.qty;
      if (dto.inbound_qty === undefined) updateData.inbound_qty = dto.qty;
    }
    if (dto.inbound_qty !== undefined) updateData.inbound_qty = dto.inbound_qty;
    if (dto.expiry_date !== undefined) {
      updateData.expiry_date = dto.expiry_date
        ? new Date(dto.expiry_date)
        : null;
    }
    if (dto.manufacture_date !== undefined) {
      updateData.manufacture_date = dto.manufacture_date
        ? new Date(dto.manufacture_date)
        : null;
    }
    if (dto.purchase_price !== undefined) updateData.purchase_price = dto.purchase_price;
    if (dto.storage !== undefined) updateData.storage = dto.storage;
    if (dto.inbound_manager !== undefined)
      updateData.inbound_manager = dto.inbound_manager;
    if (dto.reason_for_modification !== undefined)
      updateData.reason_for_modification = dto.reason_for_modification;

    await this.prisma.$transaction(async (tx: any) => {
      await tx.batch.update({
        where: { id: batchId },
        data: updateData,
      });

      const totalStock = await tx.batch.aggregate({
        where: { product_id: productId, tenant_id: tenantId },
        _sum: { qty: true },
      });
      const newCurrentStock = totalStock._sum.qty ?? 0;
      await tx.product.update({
        where: { id: productId },
        data: { current_stock: newCurrentStock } as any,
      });
    });

    return this.prisma.batch.findUnique({
      where: { id: batchId },
    });
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
    tx: any,
    customPrefix?: string // Optional: barcode-dan kelgan batch number uchun
  ): Promise<string> {
    // ✅ Generate 9 random digits
    const randomDigits = Math.floor(
      100000000 + Math.random() * 900000000
    ).toString();

    try {
      // ✅ Validate transaction client before using it
      if (!tx || typeof tx.batch?.count !== "function") {
        // Fallback: use regular prisma client if transaction is invalid
        console.warn(
          `[ProductsService] Transaction client invalid in generateBatchNo, using fallback for productId: ${productId}`
        );
        const existingBatchesCount = await this.countBatchesForPrefix(
          this.prisma,
          productId,
          tenantId,
          customPrefix
        );
        const sequenceNumber = (existingBatchesCount + 1)
          .toString()
          .padStart(3, "0");
        const prefix = customPrefix || randomDigits;
        return `${prefix}-${sequenceNumber}`;
      }

      // Lot (customPrefix) bo'yicha suffix: 1234K56 → 1234K56-001, keyin 1234K56-002
      const existingBatchesCount = await this.countBatchesForPrefix(
        tx,
        productId,
        tenantId,
        customPrefix
      );
      const sequenceNumber = (existingBatchesCount + 1)
        .toString()
        .padStart(3, "0");
      const prefix = customPrefix || randomDigits;
      return `${prefix}-${sequenceNumber}`;
    } catch (error: any) {
      // ✅ Fallback: if transaction fails, use regular prisma client
      console.error(
        `[ProductsService] Transaction failed in generateBatchNo:`,
        error.message
      );
      console.warn(
        `[ProductsService] Using fallback for productId: ${productId}`
      );

      const existingBatchesCount = await this.countBatchesForPrefix(
        this.prisma,
        productId,
        tenantId,
        customPrefix
      );
      const sequenceNumber = (existingBatchesCount + 1)
        .toString()
        .padStart(3, "0");
      const prefix = customPrefix || randomDigits;
      return `${prefix}-${sequenceNumber}`;
    }
  }

  /**
   * Count batches for sequence: per product when no prefix, per lot prefix when customPrefix given.
   * e.g. customPrefix "1234K56" → count batch_no starting with "1234K56-" for this product.
   */
  private async countBatchesForPrefix(
    prismaOrTx: any,
    productId: string,
    tenantId: string,
    customPrefix?: string
  ): Promise<number> {
    const where: any = { product_id: productId, tenant_id: tenantId };
    if (customPrefix && customPrefix.trim() !== "") {
      where.batch_no = { startsWith: `${customPrefix.trim()}-` };
    }
    return prismaOrTx.batch.count({ where });
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

    // Fetch existing barcodes (GTINs) from ProductGTIN and Product.barcode
    const [gtinRows, existingProducts] = await Promise.all([
      (this.prisma as any).productGTIN.findMany({
        where: { tenant_id: tenantId },
        select: { gtin: true },
      }),
      this.prisma.product.findMany({
        where: {
          tenant_id: tenantId,
          barcode: { not: null },
        },
        select: { barcode: true },
      }),
    ]);
    const existingBarcodes = new Set([
      ...gtinRows.map((r: any) => r.gtin?.trim()).filter(Boolean),
      ...existingProducts.map((p: any) => p.barcode?.trim()).filter(Boolean),
    ]);

    for (const [index, row] of rows.entries()) {
      const errors: string[] = [];

      // Required: name, brand, category, unit, min_stock, capacity_per_product, capacity_unit, usage_capacity, alert_days, contact_phone, barcode
      if (!row.name?.trim()) errors.push("Name is required");
      if (!row.brand?.trim()) errors.push("Brand is required");
      if (!row.category?.trim()) errors.push("Category is required");
      if (!row.unit?.trim()) errors.push("Unit is required");
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
      if (row.alert_days === undefined || row.alert_days === null)
        errors.push("Alert days is required");
      if (row.has_expiry_period === undefined || row.has_expiry_period === null)
        errors.push("유효기간 있음 (has_expiry_period) is required");
      // barcode_package_type: default to "BOX" if missing/empty
      if (!(row as any).barcode_package_type?.trim()) {
        (row as any).barcode_package_type = "BOX";
      } else {
        const bpt = (row as any).barcode_package_type.trim().toUpperCase();
        if (!["BOX", "AMPULE", "VIAL", "UNIT", "SYRINGE", "BOTTLE", "OTHER"].includes(bpt)) {
          (row as any).barcode_package_type = "BOX";
        } else {
          (row as any).barcode_package_type = bpt;
        }
      }
      if (!row.contact_phone?.trim()) errors.push("Contact phone is required");
      if (!row.barcode?.trim()) errors.push("Barcode is required");

      // Numeric bounds
      if (row.min_stock !== undefined && row.min_stock < 0)
        errors.push("Min stock cannot be negative");
      if (
        row.capacity_per_product !== undefined &&
        row.capacity_per_product < 0
      )
        errors.push("Capacity per product cannot be negative");
      if (row.usage_capacity !== undefined && row.usage_capacity < 0)
        errors.push("Usage capacity cannot be negative");
      if (row.alert_days !== undefined && row.alert_days < 0)
        errors.push("Alert days cannot be negative");

      // Optional: purchase_price, sale_price, refund_amount (must be >= 0 if present)
      if (
        row.purchase_price !== undefined &&
        row.purchase_price !== null &&
        row.purchase_price < 0
      )
        errors.push("Purchase price cannot be negative");
      if (
        row.sale_price !== undefined &&
        row.sale_price !== null &&
        row.sale_price < 0
      )
        errors.push("Sale price cannot be negative");
      if (
        row.refund_amount !== undefined &&
        row.refund_amount !== null &&
        row.refund_amount < 0
      )
        errors.push("Refund amount cannot be negative");

      // Duplicate barcode check (barcode is required)
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
   * Strict only: all rows must pass validation (all or nothing).
   * @param tenantId - Tenant ID
   * @param rows - Validated CSV rows
   * @param mode - ignored; kept for API compatibility (strict only)
   * @returns Import results
   */
  async confirmImport(
    tenantId: string,
    rows: ImportProductRowDto[],
    mode: "strict" | "flexible" = "strict",
    inboundManager: string = ""
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!rows || rows.length === 0) {
      throw new BadRequestException("No data to import");
    }

    // Re-validate before import
    const preview = await this.previewImport(tenantId, rows);

    if (mode === "strict" && preview.errors > 0) {
      throw new BadRequestException(
        `유효성 검사 오류가 ${preview.errors}건 발생하여 입고할 수 없습니다. CSV 파일에서 오류를 수정한 뒤 다시 시도해 주세요.`
      );
    }

    // Strict only: use all rows (validation already enforced above)
    const validRows = rows;

    if (validRows.length === 0) {
      throw new BadRequestException("No valid rows to import");
    }

    const imported: any[] = [];
    const failed: any[] = [];
    let existingProductCount = 0;
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
                const gtin = row.barcode?.trim();
                const existingGtin = gtin
                  ? await tx.productGTIN.findUnique({
                      where: { tenant_id_gtin: { tenant_id: tenantId, gtin } },
                      select: { product_id: true },
                    })
                  : null;

                let product: any;
                let productId: string;
                let supplierId: string | null = null;
                let supplierName: string | null = null;

                if (existingGtin) {
                  productId = existingGtin.product_id;
                  product = await tx.product.findUnique({
                    where: { id: productId, tenant_id: tenantId },
                  });
                  if (!product) {
                    results.push({
                      success: false,
                      row,
                      error: "Existing product for barcode not found",
                    });
                    continue;
                  }
                  // No inbound_qty: no stock update for existing product
                } else {
                  productId = this.generateProductId();

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

                  product = await (tx.product.create as any)({
                    data: {
                      id: productId,
                      tenant_id: tenantId,
                      name: row.name.trim(),
                      brand: row.brand.trim(),
                      barcode: gtin || null,
                      category: row.category.trim(),
                      unit: row.unit.trim(),
                      min_stock: row.min_stock,
                      purchase_price: row.purchase_price ?? null,
                      sale_price: row.sale_price ?? null,
                      usage_capacity: row.usage_capacity,
                      capacity_unit: row.capacity_unit.trim(),
                      capacity_per_product: row.capacity_per_product,
                      alert_days: row.alert_days.toString(),
                      has_expiry_period: !!row.has_expiry_period,
                      current_stock: 0,
                    },
                  });

                  if (gtin) {
                    try {
                      await tx.productGTIN.create({
                        data: {
                          tenant_id: tenantId,
                          product_id: productId,
                          gtin,
                          barcode_package_type: (row as any).barcode_package_type?.trim().toUpperCase() ?? "BOX",
                        },
                      });
                    } catch (gtinErr: any) {
                      if (gtinErr?.code === "P2002") {
                        const existing = await tx.productGTIN.findUnique({
                          where: {
                            tenant_id_gtin: { tenant_id: tenantId, gtin },
                          },
                          select: { product_id: true },
                        });
                        if (existing) {
                          await tx.product.delete({ where: { id: productId } });
                          productId = existing.product_id;
                          product = await tx.product.findUnique({
                            where: { id: productId, tenant_id: tenantId },
                          });
                        } else throw gtinErr;
                      } else throw gtinErr;
                    }
                  }

                  if (supplierId) {
                    await (tx.productSupplier.upsert as any)({
                      where: {
                        tenant_id_product_id: {
                          tenant_id: tenantId,
                          product_id: productId,
                        },
                      },
                      create: {
                        tenant_id: tenantId,
                        product_id: productId,
                        clinic_supplier_manager_id: supplierId,
                        purchase_price: row.purchase_price ?? null,
                      },
                      update: {
                        clinic_supplier_manager_id: supplierId,
                        purchase_price: row.purchase_price ?? null,
                      },
                    });
                  }

                  if (
                    row.refund_amount !== undefined &&
                    row.refund_amount !== null
                  ) {
                    await tx.returnPolicy.upsert({
                      where: { product_id: productId },
                      create: {
                        tenant_id: tenantId,
                        product_id: productId,
                        is_returnable: true,
                        refund_amount: Number(row.refund_amount),
                      },
                      update: { refund_amount: Number(row.refund_amount) },
                    });
                  }
                }

                // No batch created from CSV (inbound_qty, storage, expiry_date removed)

                results.push({
                  success: true,
                  product,
                  supplierLinked: !!supplierId,
                  supplierName,
                  existingProduct: !!existingGtin,
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
            if (result.existingProduct) existingProductCount++;
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
      existingProductCount,
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
