import { Injectable } from "@nestjs/common";
import { CacheManager } from "../../../common/cache";
import { mapProductToListRow } from "../mappers/product-list.mapper";

/**
 * In-memory list cache for products per tenant (same behavior as previous ProductsService cache).
 */
@Injectable()
export class ProductCacheService {
  private readonly productsCache: CacheManager<any>;

  constructor() {
    this.productsCache = new CacheManager({
      maxSize: 100,
      ttl: 0,
      cleanupInterval: 60000,
      name: "ProductCacheService",
    });
  }

  private getCacheKey(tenantId: string): string {
    return `products:${tenantId}`;
  }

  setCachedData(tenantId: string, data: any): void {
    const key = this.getCacheKey(tenantId);
    this.productsCache.set(key, data);
  }

  /** ETag / cache metadata helper */
  getCacheTimestamp(tenantId: string): number {
    const key = this.getCacheKey(tenantId);
    const cached = this.productsCache.getWithStaleCheck(key);
    return cached ? Date.now() : 0;
  }

  clearProductsCache(tenantId: string): void {
    const key = this.getCacheKey(tenantId);
    this.productsCache.delete(key);
  }

  /**
   * Used when product data may have changed (same as clearProductsCache for this store).
   */
  invalidateProductsCache(tenantId: string): void {
    this.clearProductsCache(tenantId);
  }

  /**
   * Merge one product into cached list shape (getAllProducts row), or clear tenant cache if cold.
   */
  addProductToCache(tenantId: string, product: any): void {
    const key = this.getCacheKey(tenantId);
    const result = this.productsCache.getWithStaleCheck(key);

    if (result && result.data) {
      const cached = result.data;
      const returnPolicy = product.returnPolicy;
      const productSupplier = product.productSupplier?.[0];
      const supplierManager = productSupplier?.clinicSupplierManager;
      const formattedProduct = mapProductToListRow(
        product,
        returnPolicy?.note ?? null,
        supplierManager,
        {
          taxRate: product.tax_rate,
          batches: product.batches || [],
        }
      );

      const existingIndex = cached.findIndex((p: any) => p.id === product.id);

      if (existingIndex >= 0) {
        cached[existingIndex] = formattedProduct;
      } else {
        cached.unshift(formattedProduct);
      }

      this.productsCache.set(key, cached);
    } else {
      this.clearProductsCache(tenantId);
    }
  }

  removeProductFromCache(tenantId: string, productId: string): void {
    const key = this.getCacheKey(tenantId);
    const result = this.productsCache.getWithStaleCheck(key);

    if (result && result.data) {
      const filteredData = result.data.filter((p: any) => p.id !== productId);
      this.productsCache.set(key, filteredData);
    } else {
      this.clearProductsCache(tenantId);
    }
  }

  /** Clears all tenant entries (e.g. bulk import). */
  clearAll(): void {
    this.productsCache.clear();
  }
}
