"use client";

import {
  useEffect,
  useMemo,
  useState,
  Suspense,
  useCallback,
  useRef,
  memo,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost, apiDelete, clearCache } from "../../lib/api";

type Batch = {
  id: string;
  batch_no: string;
  qty: number;
  inbound_qty?: number | null;
  expiry_date?: string | null;
  storage?: string | null;
  isExpiringSoon?: boolean;
  daysUntilExpiry?: number | null;
};

type ProductForOutbound = {
  id: string;
  productName: string;
  brand: string;
  barcode?: string | null;
  productImage?: string | null;
  category: string;
  unit?: string | null;
  usageCapacity?: number | null;
  usageCapacityUnit?: string | null;
  capacityPerProduct?: number | null;
  capacityUnit?: string | null;
  batches: Batch[];
  isLowStock?: boolean;
  minStock?: number;
  currentStock?: number;
  supplierName?: string | null;
  storageLocation?: string | null;
};

type ScheduledItem = {
  productId: string;
  productName: string;
  batchId: string;
  batchNo: string;
  quantity: number;
  unit: string;
  packageId?: string; // 패키지 출고인 경우
  packageName?: string; // 패키지명
  isPackageItem?: boolean; // 패키지 구성품인지 여부
};

type PackageForOutbound = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  items?: {
    productId: string;
    productName: string;
    brand: string;
    unit: string;
    quantity: number;
  }[];
};

type PackageItemForOutbound = {
  productId: string;
  productName: string;
  brand: string;
  unit: string;
  packageQuantity: number; // 패키지당 수량
  currentStock: number;
  minStock: number;
  batches: {
    id: string;
    batchNo: string;
    qty: number;
    expiryDate?: string | null;
    storage?: string | null;
    isExpiringSoon?: boolean;
    daysUntilExpiry?: number | null;
  }[];
};

function OutboundPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Rejim o'zgarishi - segmentli control orqali
  const [isPackageMode, setIsPackageMode] = useState(
    pathname === "/outbound/package"
  );

  // Update isPackageMode when pathname changes
  useEffect(() => {
    setIsPackageMode(pathname === "/outbound/package");
  }, [pathname]);

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  // Product outbound state
  const [products, setProducts] = useState<ProductForOutbound[]>([]);

  // Package outbound state
  const [packages, setPackages] = useState<PackageForOutbound[]>([]);
  const [selectedPackageItems, setSelectedPackageItems] = useState<
    PackageItemForOutbound[]
  >([]);
  const [packageCounts, setPackageCounts] = useState<Record<string, number>>(
    {}
  );
  const [packageExpiryCache, setPackageExpiryCache] = useState<
    Record<string, number | null>
  >({});

  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Outbound processing form state (ikkala rejim uchun umumiy)
  const [managerName, setManagerName] = useState("");
  const [statusType, setStatusType] = useState<"damaged" | "defective" | null>(
    null
  );
  const [chartNumber, setChartNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failedItems, setFailedItems] = useState<ScheduledItem[]>([]); // 출고 실패 항목

  // Manager name should be empty on page load - user must enter it manually

  // Cache for products and packages to prevent duplicate requests
  const productsCacheRef = useRef<{
    data: ProductForOutbound[];
    timestamp: number;
    searchQuery: string;
  } | null>(null);
  const packagesCacheRef = useRef<{
    data: PackageForOutbound[];
    timestamp: number;
  } | null>(null);
  const CACHE_TTL = 30000; // 30 seconds

  const fetchProducts = useCallback(
    async (forceRefresh = false) => {
      // Check cache first (unless force refresh)
      const cacheKey = searchQuery || "";
      if (
        !forceRefresh &&
        productsCacheRef.current &&
        productsCacheRef.current.searchQuery === cacheKey &&
        Date.now() - productsCacheRef.current.timestamp < CACHE_TTL
      ) {
        setProducts(productsCacheRef.current.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Add cache-busting parameter when force refresh
        const cacheBuster = forceRefresh ? `&_t=${Date.now()}` : "";
        const searchParam = searchQuery
          ? `?search=${encodeURIComponent(searchQuery)}`
          : "?";
        const data = await apiGet<ProductForOutbound[]>(
          `${apiUrl}/outbound/products${searchParam}${cacheBuster}`,
          forceRefresh
            ? {
                headers: {
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                  Pragma: "no-cache",
                },
              }
            : {}
        );

        // Format image URLs and filter out products with 0 stock
        const formattedProducts = data
          .map((product) => ({
            ...product,
            productImage: formatImageUrl(product.productImage),
            // Filter out batches with 0 quantity
            batches: product.batches.filter((batch) => batch.qty > 0),
          }))
          // Filter out products that have no batches with stock
          .filter((product) => product.batches.length > 0);

        setProducts(formattedProducts);
        // Update cache
        productsCacheRef.current = {
          data: formattedProducts,
          timestamp: Date.now(),
          searchQuery: cacheKey,
        };
      } catch (err) {
        console.error("Failed to load products", err);
        setError("제품 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, searchQuery]
  );

  const fetchPackages = useCallback(
    async (forceRefresh = false) => {
      // Check cache first (unless force refresh)
      if (
        !forceRefresh &&
        packagesCacheRef.current &&
        Date.now() - packagesCacheRef.current.timestamp < CACHE_TTL
      ) {
        setPackages(packagesCacheRef.current.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Add cache-busting parameter when force refresh
        const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : "";
        const data = await apiGet<PackageForOutbound[]>(
          `${apiUrl}/packages${cacheBuster}`,
          forceRefresh
            ? {
                headers: {
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                  Pragma: "no-cache",
                },
              }
            : {}
        );

        setPackages(data);

        // Fetch expiry info for each package in parallel (for sorting)
        const expiryPromises = data.map(async (pkg) => {
          try {
            const items = await apiGet<PackageItemForOutbound[]>(
              `${apiUrl}/packages/${pkg.id}/items`
            );

            // Find earliest expiry date from all batches
            let earliestExpiry: number | null = null;

            items.forEach((item) => {
              item.batches?.forEach((batch) => {
                if (batch.expiryDate) {
                  const expiryDate = new Date(batch.expiryDate).getTime();
                  if (earliestExpiry === null || expiryDate < earliestExpiry) {
                    earliestExpiry = expiryDate;
                  }
                }
              });
            });

            return { packageId: pkg.id, expiry: earliestExpiry };
          } catch (err) {
            console.error(
              `Failed to load expiry info for package ${pkg.id}`,
              err
            );
            return { packageId: pkg.id, expiry: null };
          }
        });

        // Wait for all expiry info to load
        const expiryResults = await Promise.all(expiryPromises);

        // Update cache
        const newCache: Record<string, number | null> = {};
        expiryResults.forEach(({ packageId, expiry }) => {
          newCache[packageId] = expiry;
        });
        setPackageExpiryCache(newCache);

        // Update packages cache
        packagesCacheRef.current = { data, timestamp: Date.now() };
      } catch (err) {
        console.error("Failed to load packages", err);
        setError("패키지 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    if (isPackageMode) {
      fetchPackages();
    } else {
      fetchProducts();
    }
    setCurrentPage(1); // Reset to first page when search changes
  }, [isPackageMode, searchQuery, fetchProducts, fetchPackages]);

  // ✅ Listen for product deletion events and update state immediately
  useEffect(() => {
    const handleProductDeleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{ productId: string }>;
      const { productId } = customEvent.detail;

      console.log("[Outbound] Product deleted event received:", productId);

      if (!productId) {
        console.warn("[Outbound] No productId in event detail");
        return;
      }

      // ✅ Always remove product from local state immediately (optimistic update)
      setProducts((prevProducts) => {
        const filtered = prevProducts.filter((p) => p.id !== productId);
        console.log(
          "[Outbound] Products before:",
          prevProducts.length,
          "after:",
          filtered.length,
          "removed productId:",
          productId
        );
        return filtered;
      });

      // Clear cache to ensure consistency
      const { clearCache } = await import("../../lib/api");
      clearCache("/outbound/products");
      clearCache("outbound/products");
      clearCache(`${apiUrl}/outbound/products`);

      // ✅ Also clear component-level cache refs BEFORE fetching
      productsCacheRef.current = null;

      // ✅ Small delay to ensure cache is cleared
      await new Promise((resolve) => setTimeout(resolve, 100));

      // ✅ Force refresh from API to bypass browser HTTP cache
      if (!isPackageMode) {
        try {
          await fetchProducts(true);
          console.log("[Outbound] Products refreshed after deletion");
        } catch (err) {
          console.error(
            "[Outbound] Failed to refresh products after deletion",
            err
          );
          // Keep the optimistic update even if refresh fails
        }
      }
    };

    window.addEventListener("productDeleted", handleProductDeleted);

    return () => {
      window.removeEventListener("productDeleted", handleProductDeleted);
    };
  }, [apiUrl, isPackageMode, fetchProducts]);

  // Handle highlight from URL parameter (when navigating from package mode)
  useEffect(() => {
    const highlightProductId = searchParams.get("highlight");
    if (highlightProductId && !isPackageMode && pathname === "/outbound") {
      // Find which page the product is on
      const productIndex = products.findIndex(
        (p) => p.id === highlightProductId
      );
      if (productIndex !== -1) {
        const productPage = Math.floor(productIndex / itemsPerPage) + 1;
        if (productPage !== currentPage) {
          setCurrentPage(productPage);
        }
      }

      // Wait for products to load and page to change, then scroll and highlight
      const highlightProduct = () => {
        const productElement = document.getElementById(
          `product-card-${highlightProductId}`
        );
        if (productElement) {
          productElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          productElement.style.border = "2px solid rgb(14 165 233)";
          productElement.style.backgroundColor = "rgb(240 249 255)";
          productElement.style.borderRadius = "0.75rem";
          productElement.style.boxSizing = "border-box";
          productElement.style.position = "relative";
          productElement.style.zIndex = "10";
          setTimeout(() => {
            productElement.style.border = "";
            productElement.style.backgroundColor = "";
            productElement.style.borderRadius = "";
            productElement.style.boxSizing = "";
            productElement.style.position = "";
            productElement.style.zIndex = "";
            // Remove highlight parameter from URL
            router.replace("/outbound", { scroll: false });
          }, 2000);
          return true;
        }
        return false;
      };

      // Try multiple times with increasing delays
      const tryHighlight = (attempt = 0) => {
        if (attempt > 5) return; // Max 5 attempts

        setTimeout(
          () => {
            if (!highlightProduct() && attempt < 5) {
              tryHighlight(attempt + 1);
            }
          },
          attempt === 0 ? 300 : attempt * 200
        );
      };

      // Start trying after products are loaded
      if (products.length > 0 && !loading) {
        tryHighlight();
      } else {
        // Wait for products to load first
        setTimeout(() => {
          if (products.length > 0) {
            tryHighlight();
          }
        }, 500);
      }
    }
  }, [
    searchParams,
    isPackageMode,
    pathname,
    products,
    loading,
    router,
    currentPage,
    itemsPerPage,
  ]);

  const handleDeletePackage = async (
    packageId: string,
    packageName: string
  ) => {
    if (!confirm(`정말로 "${packageName}" 패키지를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await apiDelete(`${apiUrl}/packages/${packageId}`);
      // Remove from scheduled items if exists
      setScheduledItems((prev) =>
        prev.filter((item) => item.packageId !== packageId)
      );
      // Remove from package counts
      setPackageCounts((prev) => {
        const updated = { ...prev };
        delete updated[packageId];
        return updated;
      });
      // Refresh packages list and clear cache
      packagesCacheRef.current = null;
      fetchPackages();
    } catch (error: any) {
      alert(`패키지 삭제 실패: ${error.message || "알 수 없는 오류"}`);
    }
  };

  // Cache for package items to prevent duplicate requests
  const packageItemsCacheRef = useRef<
    Map<string, { data: PackageItemForOutbound[]; timestamp: number }>
  >(new Map());
  const PACKAGE_ITEMS_CACHE_TTL = 30000; // 30 seconds

  const fetchPackageItems = useCallback(
    async (packageId: string) => {
      // Check cache first
      const cached = packageItemsCacheRef.current.get(packageId);
      if (cached && Date.now() - cached.timestamp < PACKAGE_ITEMS_CACHE_TTL) {
        setSelectedPackageItems(cached.data);
        return;
      }

      try {
        const data = await apiGet<PackageItemForOutbound[]>(
          `${apiUrl}/packages/${packageId}/items`
        );
        setSelectedPackageItems(data);
        // Update cache
        packageItemsCacheRef.current.set(packageId, {
          data,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("Failed to load package items", err);
        alert("패키지 구성품 정보를 불러오지 못했습니다.");
      }
    },
    [apiUrl]
  );

  const handlePackageSelect = async (pkg: PackageForOutbound) => {
    await fetchPackageItems(pkg.id);
  };

  // Helper function to update scheduled items with batch information
  const updateScheduledItemsWithBatches = useCallback(
    (itemsWithBatches: PackageItemForOutbound[], pkg: PackageForOutbound) => {
      // Track items that couldn't be mapped to batches
      const unmappedItems: string[] = [];

      // Update scheduled items with real batch information
      setScheduledItems((prev) => {
        const updated = prev
          .map((scheduledItem) => {
            // Find matching optimistic item by packageId and productId
            if (
              scheduledItem.packageId === pkg.id &&
              scheduledItem.batchId.startsWith(`temp-${pkg.id}-`)
            ) {
              const itemWithBatch = itemsWithBatches.find(
                (item) => item.productId === scheduledItem.productId
              );

              if (
                itemWithBatch &&
                itemWithBatch.batches &&
                itemWithBatch.batches.length > 0
              ) {
                // Backend already sorted by FEFO + qty (kam qolgan birinchi)
                // Find first batch with available stock
                const availableBatch = itemWithBatch.batches.find(
                  (b: any) => b.qty > 0
                );

                if (availableBatch) {
                  return {
                    ...scheduledItem,
                    batchId: availableBatch.id,
                    batchNo: availableBatch.batchNo,
                    quantity: itemWithBatch.packageQuantity, // Use package quantity from API
                  };
                } else {
                  // No available batch - mark for removal
                  unmappedItems.push(itemWithBatch.productName);
                  return null; // Will be filtered out
                }
              } else {
                // No batch data - mark for removal
                unmappedItems.push(scheduledItem.productName);
                return null; // Will be filtered out
              }
            }
            return scheduledItem;
          })
          .filter((item): item is ScheduledItem => item !== null); // Remove null items

        // Check if package has any valid items left
        const packageItemsLeft = updated.filter(
          (item) => item.packageId === pkg.id
        );

        if (packageItemsLeft.length === 0) {
          // No valid items for this package - remove from cart
          setPackageCounts((prev) => {
            const newCounts = { ...prev };
            delete newCounts[pkg.id];
            return newCounts;
          });
        }

        return updated;
      });

      if (unmappedItems.length > 0) {
        alert(
          `다음 제품의 재고가 부족하여 패키지에서 제외되었습니다:\n${unmappedItems.join(", ")}`
        );
      }
    },
    [setScheduledItems, setPackageCounts]
  );

  const handleAddPackageToOutbound = async (pkg: PackageForOutbound) => {
    // Get current package count
    const currentCount = packageCounts[pkg.id] || 0;
    const newCount = currentCount + 1;

    // Update package count
    setPackageCounts((prev) => ({
      ...prev,
      [pkg.id]: newCount,
    }));

    // If package is not in cart yet, add items immediately (optimistic update)
    if (currentCount === 0 && pkg.items && pkg.items.length > 0) {
      const timestamp = Date.now();
      const optimisticItems: ScheduledItem[] = pkg.items.map((item, idx) => ({
        productId: item.productId,
        productName: item.productName,
        batchId: `temp-${pkg.id}-${item.productId}-${timestamp}-${idx}`, // Unique temporary batch ID
        batchNo: "로딩중...", // Will be updated when batch info loads
        quantity: item.quantity,
        unit: item.unit,
        packageId: pkg.id,
        packageName: pkg.name,
        isPackageItem: true,
      }));

      // Add items to the beginning of the list (newest first)
      setScheduledItems((prev) => [...optimisticItems, ...prev]);

      // Fetch batch information in background and update (non-blocking)
      // Check cache first, then fetch if needed
      const cached = packageItemsCacheRef.current.get(pkg.id);
      if (cached && Date.now() - cached.timestamp < PACKAGE_ITEMS_CACHE_TTL) {
        // Use cached data
        const itemsWithBatches = cached.data;
        updateScheduledItemsWithBatches(itemsWithBatches, pkg);
      } else {
        // Fetch and cache
        apiGet<PackageItemForOutbound[]>(`${apiUrl}/packages/${pkg.id}/items`)
          .then((itemsWithBatches) => {
            // Update cache
            packageItemsCacheRef.current.set(pkg.id, {
              data: itemsWithBatches,
              timestamp: Date.now(),
            });
            updateScheduledItemsWithBatches(itemsWithBatches, pkg);
          })
          .catch((err) => {
            console.error("Failed to load package items for outbound", err);
          });
      }
    } else if (currentCount > 0 && pkg.items && pkg.items.length > 0) {
      // If package is already in cart, duplicate the items
      // Check cache first
      const cached = packageItemsCacheRef.current.get(pkg.id);
      if (cached && Date.now() - cached.timestamp < PACKAGE_ITEMS_CACHE_TTL) {
        // Use cached data
        const itemsWithBatches = cached.data;
        const newItems: ScheduledItem[] = [];
        itemsWithBatches.forEach((itemWithBatch) => {
          if (itemWithBatch.batches && itemWithBatch.batches.length > 0) {
            const availableBatch = itemWithBatch.batches.find(
              (b: any) => b.qty > 0
            );

            if (availableBatch) {
              newItems.push({
                productId: itemWithBatch.productId,
                productName: itemWithBatch.productName || "",
                batchId: availableBatch.id,
                batchNo: availableBatch.batchNo,
                quantity: itemWithBatch.packageQuantity,
                unit: itemWithBatch.unit,
                packageId: pkg.id,
                packageName: pkg.name,
                isPackageItem: true,
              });
            }
          }
        });

        // Add duplicate items to scheduled items
        if (newItems.length > 0) {
          setScheduledItems((prev) => [...newItems, ...prev]);
        }
      } else {
        // Fetch batch information and add duplicate items
        try {
          const itemsWithBatches = await apiGet<PackageItemForOutbound[]>(
            `${apiUrl}/packages/${pkg.id}/items`
          );

          // Update cache
          packageItemsCacheRef.current.set(pkg.id, {
            data: itemsWithBatches,
            timestamp: Date.now(),
          });

          const newItems: ScheduledItem[] = [];
          itemsWithBatches.forEach((itemWithBatch) => {
            if (itemWithBatch.batches && itemWithBatch.batches.length > 0) {
              const availableBatch = itemWithBatch.batches.find(
                (b: any) => b.qty > 0
              );

              if (availableBatch) {
                newItems.push({
                  productId: itemWithBatch.productId,
                  productName: itemWithBatch.productName || "",
                  batchId: availableBatch.id,
                  batchNo: availableBatch.batchNo,
                  quantity: itemWithBatch.packageQuantity,
                  unit: itemWithBatch.unit,
                  packageId: pkg.id,
                  packageName: pkg.name,
                  isPackageItem: true,
                });
              }
            }
          });

          // Add duplicate items to scheduled items
          if (newItems.length > 0) {
            setScheduledItems((prev) => [...newItems, ...prev]);
          }
        } catch (err) {
          console.error("Failed to load package items", err);
        }
      }
    }
  };

  const formatImageUrl = (
    imageUrl: string | null | undefined
  ): string | null => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }
    if (imageUrl.startsWith("data:image")) {
      return imageUrl;
    }
    if (imageUrl.startsWith("/")) {
      return `${apiUrl}${imageUrl}`;
    }
    return imageUrl;
  };

  const handleQuantityChange = (
    productId: string,
    batchId: string,
    batchNo: string,
    productName: string,
    unit: string,
    newQuantity: number,
    maxQuantity?: number
  ) => {
    // 재고 부족 체크: 최대 재고량을 초과할 수 없음
    if (maxQuantity !== undefined && newQuantity > maxQuantity) {
      alert(
        `재고가 부족합니다. 최대 ${maxQuantity}${unit}까지 출고 가능합니다.`
      );
      return;
    }

    if (newQuantity <= 0) {
      // Remove from scheduled items (faqat product items, package items emas!)
      setScheduledItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.productId === productId &&
              item.batchId === batchId &&
              !item.isPackageItem // ✅ Faqat product items o'chiriladi
            )
        )
      );
      return;
    }

    // Update or add to scheduled items (faqat product items)
    setScheduledItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === productId &&
          item.batchId === batchId &&
          !item.isPackageItem // ✅ Faqat product items topiladi
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQuantity,
        };
        return updated;
      }

      return [
        ...prev,
        {
          productId,
          productName,
          batchId,
          batchNo,
          quantity: newQuantity,
          unit,
          isPackageItem: false, // ✅ Product item (not package)
        },
      ];
    });
  };

  const removeScheduledItem = (productId: string, batchId: string) => {
    // Faqat product items o'chiriladi (package items emas!)
    setScheduledItems((prev) =>
      prev.filter(
        (item) =>
          !(
            item.productId === productId &&
            item.batchId === batchId &&
            !item.isPackageItem // ✅ Faqat product items
          )
      )
    );
  };

  const handleSubmit = async () => {
    if (scheduledItems.length === 0) {
      alert(
        isPackageMode
          ? "출고할 패키지를 선택해주세요."
          : "출고할 제품을 선택해주세요."
      );
      return;
    }

    if (!managerName.trim()) {
      alert("담당자를 입력해주세요.");
      return;
    }

    // 파손 yoki 불량 tanlanganida 메모 majburiy
    if (statusType && !memo.trim()) {
      alert("메모를 입력해주세요.");
      return;
    }

    // Check for temporary batch IDs (package items not fully loaded)
    const packageItems = scheduledItems.filter((item) => item.isPackageItem);
    const hasTemporaryBatchIds = packageItems.some(
      (item) => item.batchId.startsWith("temp-") || item.batchNo === "로딩중..."
    );

    if (hasTemporaryBatchIds) {
      alert("패키지 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    // 재고 부족 체크: Product items uchun (Package items alohida tekshiriladi)
    const productItems = scheduledItems.filter((item) => !item.isPackageItem);
    if (productItems.length > 0) {
      const stockCheck = productItems.every((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return false;
        const batch = product.batches?.find((b) => b.id === item.batchId);
        if (!batch) return false;
        return item.quantity <= batch.qty;
      });

      if (!stockCheck) {
        alert("재고가 부족한 제품이 있습니다. 수량을 확인해주세요.");
        return;
      }
    }

    setSubmitting(true);
    try {
      // Product items va Package items'ni ajratish
      const productItems = scheduledItems.filter((item) => !item.isPackageItem);
      const packageItems = scheduledItems.filter((item) => item.isPackageItem);

      // Ikkala rejim uchun ham 출고 qilish
      const promises: Promise<any>[] = [];

      // 1. Product items 출고 (agar mavjud bo'lsa)
      if (productItems.length > 0) {
        const productPayload = {
          items: productItems.map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            outboundQty: item.quantity,
            managerName: managerName.trim(),
            chartNumber: chartNumber.trim() || undefined,
            memo: memo.trim() || undefined,
            isDamaged: statusType === "damaged",
            isDefective: statusType === "defective",
          })),
        };
        promises.push(apiPost(`${apiUrl}/outbound/bulk`, productPayload));
      }

      // 2. Package items 출고 (agar mavjud bo'lsa)
      if (packageItems.length > 0) {
        // Group items by package and calculate total quantity based on packageCounts
        const itemsByPackage = packageItems.reduce(
          (acc, item) => {
            const key = `${item.packageId}-${item.productId}-${item.batchId}`;
            const packageCount = packageCounts[item.packageId || ""] || 1;

            if (!acc[key]) {
              acc[key] = {
                ...item,
                quantity: item.quantity * packageCount, // Multiply by package count
                packageQty: packageCount, // Store package qty for backend
              };
            } else {
              // If same item exists, add quantity (shouldn't happen but just in case)
              acc[key].quantity += item.quantity * packageCount;
            }
            return acc;
          },
          {} as Record<
            string,
            ScheduledItem & { quantity: number; packageQty: number }
          >
        );

        const packagePayload = {
          outboundType: "패키지",
          managerName: managerName.trim(),
          chartNumber: chartNumber.trim() || undefined,
          memo: memo.trim() || undefined,
          isDamaged: statusType === "damaged",
          isDefective: statusType === "defective",
          items: Object.values(itemsByPackage).map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            outboundQty: item.quantity, // This now includes packageCount multiplication
            packageId: item.packageId,
            packageQty: item.packageQty, // Send package qty to backend
          })),
        };
        promises.push(apiPost(`${apiUrl}/outbound/unified`, packagePayload));
      }

      // Ikkala 출고'ni bir vaqtda amalga oshirish
      const responses = await Promise.allSettled(promises);

      let allSuccess = true;
      let allFailed: ScheduledItem[] = [];
      let successCount = 0;
      let failedCount = 0;

      responses.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const response = result.value;
          if (
            response &&
            response.failedItems &&
            response.failedItems.length > 0
          ) {
            allSuccess = false;
            const items = index === 0 ? productItems : packageItems;
            const failed = items.filter((item) =>
              response.failedItems.some(
                (failed: any) =>
                  failed.productId === item.productId &&
                  failed.batchId === item.batchId
              )
            );
            allFailed.push(...failed);
            failedCount += failed.length;
            successCount += items.length - failed.length;
          } else {
            const items = index === 0 ? productItems : packageItems;
            successCount += items.length;
          }
        } else {
          allSuccess = false;
          const items = index === 0 ? productItems : packageItems;
          allFailed.push(...items);
          failedCount += items.length;
        }
      });

      // Natijalarni ko'rsatish
      if (allSuccess) {
        alert("출고가 완료되었습니다.");
        setFailedItems([]);
        setScheduledItems([]);
        setChartNumber("");
        setMemo("");
        setStatusType(null);
        setChartNumber("");
        setPackageCounts({});

        // ✅ Clear ALL caches (frontend API cache + component cache)
        // Clear with different endpoint formats to ensure all variants are cleared
        clearCache("/outbound/products");
        clearCache("outbound/products");
        clearCache(`${apiUrl}/outbound/products`);
        clearCache("/packages");
        clearCache("packages");
        clearCache(`${apiUrl}/packages`);

        // ✅ Also clear component-level cache refs BEFORE fetching
        productsCacheRef.current = null;
        packagesCacheRef.current = null;

        // ✅ Force clear all pending requests for outbound endpoints to prevent stale data
        // This ensures fresh request is made
        // Note: We don't clear ALL cache, only outbound-related cache

        // ✅ Small delay to ensure cache is cleared and backend cache is invalidated
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Refresh products and packages list to remove 0-stock items (force refresh)
        if (isPackageMode) {
          await fetchPackages(true);
        } else {
          await fetchProducts(true);
        }
      } else if (allFailed.length > 0) {
        setFailedItems(allFailed);
        alert(
          `${successCount}개 항목 출고 완료, ${failedCount}개 항목 실패했습니다. 실패한 항목만 재시도할 수 있습니다.`
        );

        // Failed items'larni scheduledItems'dan olib tashlash
        const failedIds = new Set(
          allFailed.map((f) => `${f.productId}-${f.batchId}`)
        );
        setScheduledItems((prev) =>
          prev.filter(
            (item) => !failedIds.has(`${item.productId}-${item.batchId}`)
          )
        );

        // ✅ Clear ALL caches (frontend API cache + component cache)
        // Clear with different endpoint formats to ensure all variants are cleared
        clearCache("/outbound/products");
        clearCache("outbound/products");
        clearCache(`${apiUrl}/outbound/products`);
        clearCache("/packages");
        clearCache("packages");
        clearCache(`${apiUrl}/packages`);

        // ✅ Also clear component-level cache refs BEFORE fetching
        productsCacheRef.current = null;
        packagesCacheRef.current = null;

        // ✅ Small delay to ensure cache is cleared
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Refresh products/packages list even for partial success (force refresh)
        if (isPackageMode) {
          await fetchPackages(true);
        } else {
          await fetchProducts(true);
        }
      }
    } catch (err: any) {
      console.error("Failed to process outbound", err);
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "출고 처리 중 오류가 발생했습니다.";
      setFailedItems([...scheduledItems]);
      alert(`출고 실패: ${errorMessage}\n실패한 항목만 재시도할 수 있습니다.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (scheduledItems.length === 0) return;
    if (confirm("출고를 취소하시겠습니까?")) {
      setScheduledItems([]);
      setChartNumber("");
      setMemo("");
      setStatusType(null);
      setPackageCounts({});
    }
  };

  // Product'ni chap panel'da ko'rsatish va scroll qilish
  const scrollToProduct = (productId: string) => {
    // Agar package mode'da bo'lsa, avval 제품 출고 pagega o'tish
    if (isPackageMode) {
      // URL parameter bilan productId'ni uzatish
      router.push(`/outbound?highlight=${productId}`);
      return;
    }

    // Product card'ni topish
    const productElement = document.getElementById(`product-card-${productId}`);
    if (productElement) {
      // Scroll qilish
      productElement.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight qilish (vaqtinchalik) - card'ning o'lchamiga mos
      productElement.style.border = "2px solid rgb(14 165 233)";
      productElement.style.backgroundColor = "rgb(240 249 255)";
      productElement.style.borderRadius = "0.75rem";
      productElement.style.boxSizing = "border-box";
      productElement.style.position = "relative";
      productElement.style.zIndex = "10";
      setTimeout(() => {
        productElement.style.border = "";
        productElement.style.backgroundColor = "";
        productElement.style.borderRadius = "";
        productElement.style.boxSizing = "";
        productElement.style.position = "";
        productElement.style.zIndex = "";
      }, 2000);
    }
  };

  // Package'ni chap panel'da ko'rsatish va scroll qilish
  const scrollToPackage = (packageId: string) => {
    // Package card'ni topish
    const packageElement = document.getElementById(`package-card-${packageId}`);
    if (packageElement) {
      // Scroll qilish
      packageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight qilish (vaqtinchalik) - card'ning o'lchamiga mos
      packageElement.style.border = "2px solid rgb(14 165 233)";
      packageElement.style.backgroundColor = "rgb(240 249 255)";
      packageElement.style.borderRadius = "0.75rem";
      packageElement.style.boxSizing = "border-box";
      packageElement.style.position = "relative";
      packageElement.style.zIndex = "10";
      setTimeout(() => {
        packageElement.style.border = "";
        packageElement.style.backgroundColor = "";
        packageElement.style.borderRadius = "";
        packageElement.style.boxSizing = "";
        packageElement.style.position = "";
        packageElement.style.zIndex = "";
      }, 2000);
    }
  };

  const handleRetryFailed = async (item: ScheduledItem) => {
    setSubmitting(true);
    try {
      if (item.isPackageItem) {
        // Package item uchun
        const payload = {
          outboundType: "패키지",
          managerName: managerName.trim(),
          chartNumber: chartNumber.trim() || undefined,
          memo: memo.trim() || undefined,
          items: [
            {
              productId: item.productId,
              batchId: item.batchId,
              outboundQty:
                item.quantity * (packageCounts[item.packageId || ""] || 1),
              packageId: item.packageId,
            },
          ],
        };
        await apiPost(`${apiUrl}/outbound/unified`, payload);
      } else {
        // Product item uchun
        const payload = {
          items: [
            {
              productId: item.productId,
              batchId: item.batchId,
              outboundQty: item.quantity,
              managerName: managerName.trim(),
              chartNumber: chartNumber.trim() || undefined,
              memo: memo.trim() || undefined,
              isDamaged: statusType === "damaged",
              isDefective: statusType === "defective",
            },
          ],
        };
        await apiPost(`${apiUrl}/outbound/bulk`, payload);
      }
      setFailedItems((prev) =>
        prev.filter(
          (i) => !(i.productId === item.productId && i.batchId === item.batchId)
        )
      );
      setScheduledItems((prev) =>
        prev.filter(
          (i) => !(i.productId === item.productId && i.batchId === item.batchId)
        )
      );
      alert("재시도 성공");

      // ✅ Clear ALL caches (frontend API cache + component cache)
      // Clear with different endpoint formats to ensure all variants are cleared
      clearCache("/outbound/products");
      clearCache("outbound/products");
      clearCache(`${apiUrl}/outbound/products`);
      clearCache("/packages");
      clearCache("packages");
      clearCache(`${apiUrl}/packages`);

      // ✅ Also clear component-level cache refs BEFORE fetching
      productsCacheRef.current = null;
      packagesCacheRef.current = null;

      // ✅ Small delay to ensure cache is cleared
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (isPackageMode) {
        fetchPackages(true);
      } else {
        fetchProducts(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || "재시도 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryAllFailed = async () => {
    if (failedItems.length === 0) return;
    setSubmitting(true);
    try {
      const productFailed = failedItems.filter((item) => !item.isPackageItem);
      const packageFailed = failedItems.filter((item) => item.isPackageItem);

      const promises: Promise<any>[] = [];

      if (productFailed.length > 0) {
        const payload = {
          items: productFailed.map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            outboundQty: item.quantity,
            managerName: managerName.trim(),
            chartNumber: chartNumber.trim() || undefined,
            memo: memo.trim() || undefined,
            isDamaged: statusType === "damaged",
            isDefective: statusType === "defective",
          })),
        };
        promises.push(apiPost(`${apiUrl}/outbound/bulk`, payload));
      }

      if (packageFailed.length > 0) {
        const itemsByPackage = packageFailed.reduce(
          (acc, item) => {
            const key = `${item.packageId}-${item.productId}-${item.batchId}`;
            if (!acc[key]) {
              acc[key] = {
                ...item,
                quantity:
                  item.quantity * (packageCounts[item.packageId || ""] || 1),
              };
            }
            return acc;
          },
          {} as Record<string, ScheduledItem & { quantity: number }>
        );

        const payload = {
          outboundType: "패키지",
          managerName: managerName.trim(),
          chartNumber: chartNumber.trim() || undefined,
          memo: memo.trim() || undefined,
          items: Object.values(itemsByPackage).map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            outboundQty: item.quantity,
            packageId: item.packageId,
          })),
        };
        promises.push(apiPost(`${apiUrl}/outbound/unified`, payload));
      }

      const responses = await Promise.allSettled(promises);

      let allSuccess = true;
      let remainingFailed: ScheduledItem[] = [];

      responses.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const response = result.value;
          const items = index === 0 ? productFailed : packageFailed;
          if (
            response &&
            response.failedItems &&
            response.failedItems.length > 0
          ) {
            allSuccess = false;
            const failed = items.filter((item) =>
              response.failedItems.some(
                (failed: any) =>
                  failed.productId === item.productId &&
                  failed.batchId === item.batchId
              )
            );
            remainingFailed.push(...failed);
          }
        } else {
          allSuccess = false;
          const items = index === 0 ? productFailed : packageFailed;
          remainingFailed.push(...items);
        }
      });

      if (allSuccess) {
        setFailedItems([]);
        // Failed items'ni scheduled items'dan o'chirish (product/package farqi bilan)
        setScheduledItems((prev) =>
          prev.filter(
            (i) =>
              !failedItems.some(
                (f) =>
                  f.productId === i.productId &&
                  f.batchId === i.batchId &&
                  f.isPackageItem === i.isPackageItem // ✅ Package/Product farqi
              )
          )
        );
        alert("모든 항목 재시도 성공");
      } else {
        setFailedItems(remainingFailed);
        alert(
          `${failedItems.length - remainingFailed.length}개 항목 재시도 성공, ${remainingFailed.length}개 항목 실패`
        );
      }

      // ✅ Clear ALL caches (frontend API cache + component cache)
      // Clear with different endpoint formats to ensure all variants are cleared
      clearCache("/outbound/products");
      clearCache("outbound/products");
      clearCache(`${apiUrl}/outbound/products`);
      clearCache("/packages");
      clearCache("packages");
      clearCache(`${apiUrl}/packages`);

      // ✅ Also clear component-level cache refs BEFORE fetching
      productsCacheRef.current = null;
      packagesCacheRef.current = null;

      // ✅ Small delay to ensure cache is cleared
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (isPackageMode) {
        fetchPackages(true);
      } else {
        fetchProducts(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || "재시도 실패");
    } finally {
      setSubmitting(false);
    }
  };

  // Package filtering and pagination
  const filteredPackages = useMemo(() => {
    let filtered = packages;

    // Filter by search query if provided
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = packages.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(query) ||
          pkg.description?.toLowerCase().includes(query) ||
          pkg.items?.some(
            (item) =>
              item.productName.toLowerCase().includes(query) ||
              item.brand.toLowerCase().includes(query)
          )
      );
    }

    // Sort by expiry date: packages with expiring products first (FEFO)
    return filtered.sort((a, b) => {
      const aExpiry = packageExpiryCache[a.id];
      const bExpiry = packageExpiryCache[b.id];

      // Packages with expiry dates come first
      if (aExpiry !== null && bExpiry === null) return -1;
      if (aExpiry === null && bExpiry !== null) return 1;

      // Both have expiry dates: sort by earliest expiry (FEFO)
      if (aExpiry !== null && bExpiry !== null) {
        return aExpiry - bExpiry;
      }

      // Neither has expiry date: sort by name
      return a.name.localeCompare(b.name);
    });
  }, [packages, searchQuery, packageExpiryCache]);

  const paginatedPackages = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPackages.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPackages, currentPage, itemsPerPage]);

  // Product Pagination calculations
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = products.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-10 sm:px-6 lg:px-8 lg:pb-4">
        {/* Header */}
        <header className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
              출고 관리
            </h1>
            <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
              필요한 제품을 바로 출고해보세요.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
            <Link
              href="/outbound"
              className={`px-4 py-2 text-sm font-semibold transition ${
                pathname === "/outbound"
                  ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              출고 처리
            </Link>
            <Link
              href="/outbound/history"
              className={`px-4 py-2 text-sm font-semibold transition ${
                pathname === "/outbound/history"
                  ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              출고 내역
            </Link>
          </div>

          {/* Quick Outbound Bar */}
        </header>

        <div>
          <div className="grid gap-6 lg:grid-cols-[1fr,420px] lg:h-[calc(100vh-10rem)]">
            {/* Left Panel - Product/Package List */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 flex flex-col overflow-hidden">
                {/* Fixed Header Section */}
                <div className="flex-shrink-0">
                  {/* Segmented Control - Product/Package Outbound */}
                  <div className="mb-4 flex items-center gap-0 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                    <button
                      onClick={() => setIsPackageMode(false)}
                      className={`relative flex-1 rounded-md px-4 py-2 text-center text-sm font-semibold transition ${
                        !isPackageMode
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      제품 출고
                    </button>
                    <button
                      onClick={() => setIsPackageMode(true)}
                      className={`relative flex-1 rounded-md px-4 py-2 text-center text-sm font-semibold transition ${
                        isPackageMode
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      패키지 출고
                    </button>
                  </div>

                  <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                    {isPackageMode ? "전체 패키지" : "전체 제품"}
                  </h2>

                  {/* Search Bar */}
                  <div className="mb-4 flex gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder={
                          isPackageMode
                            ? "패키지명, 제품명으로 검색..."
                            : "제품명, 브랜드로 검색"
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pl-10 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <svg
                        className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    {isPackageMode && (
                      <Link
                        href="/packages/new"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 flex items-center justify-center whitespace-nowrap"
                      >
                        새 패키지등록
                      </Link>
                    )}
                  </div>

                  {/* FIFO Warning - faqat product rejimida */}
                  {!isPackageMode && (
                    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                      <div className="flex items-start gap-3">
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                          <span className="text-xs font-bold">i</span>
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          유효기한이 임박한 배치가 먼저 표시됩니다.
                          선입선출(FIFO)을 위해 상단의 배치부터 출고해주세요.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable Product or Package List */}
                <div className="flex-1 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200 dark:[&::-webkit-scrollbar-thumb]:border-slate-700">
                  {loading ? (
                    <div className="py-8 text-center text-slate-500">
                      로딩 중...
                    </div>
                  ) : error ? (
                    <div className="py-8 text-center text-red-500">{error}</div>
                  ) : isPackageMode ? (
                    // Package List
                    filteredPackages.length === 0 ? (
                      <div className="py-8 text-center text-slate-500">
                        패키지가 없습니다.
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          {paginatedPackages.map((pkg) => {
                            const packageCount = packageCounts[pkg.id] || 0;

                            const handleDecreasePackage = () => {
                              const currentCount = packageCounts[pkg.id] || 0;
                              if (currentCount <= 1) {
                                // Remove all items if count reaches 0
                                setScheduledItems((prev) =>
                                  prev.filter(
                                    (item) => item.packageId !== pkg.id
                                  )
                                );
                                setPackageCounts((prev) => {
                                  const updated = { ...prev };
                                  delete updated[pkg.id];
                                  return updated;
                                });
                              } else {
                                // Decrease count and remove one set of items
                                const newCount = currentCount - 1;
                                setPackageCounts((prev) => ({
                                  ...prev,
                                  [pkg.id]: newCount,
                                }));

                                // Remove one set of package items
                                const packageItems = scheduledItems.filter(
                                  (item) => item.packageId === pkg.id
                                );

                                // Group items by productId-batchId to remove one complete set
                                const itemsToRemove = new Set<string>();
                                const seen = new Set<string>();

                                packageItems.forEach((item) => {
                                  const key = `${item.productId}-${item.batchId}`;
                                  if (!seen.has(key)) {
                                    seen.add(key);
                                    itemsToRemove.add(key);
                                  }
                                });

                                // Remove one instance of each item
                                setScheduledItems((prev) => {
                                  const result: ScheduledItem[] = [];
                                  const removeCount: Record<string, number> =
                                    {};

                                  prev.forEach((item) => {
                                    if (
                                      item.packageId === pkg.id &&
                                      itemsToRemove.has(
                                        `${item.productId}-${item.batchId}`
                                      )
                                    ) {
                                      const key = `${item.productId}-${item.batchId}`;
                                      removeCount[key] =
                                        (removeCount[key] || 0) + 1;
                                      if (removeCount[key] === 1) {
                                        // Remove first occurrence
                                        return; // Skip this item
                                      }
                                    }
                                    result.push(item);
                                  });

                                  return result;
                                });
                              }
                            };

                            return (
                              <div
                                key={pkg.id}
                                id={`package-card-${pkg.id}`}
                                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                        {pkg.name}
                                      </h3>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeletePackage(
                                              pkg.id,
                                              pkg.name
                                            )
                                          }
                                          className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-900/20"
                                        >
                                          삭제
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            // Save package ID to sessionStorage for edit mode
                                            sessionStorage.setItem(
                                              "editing_package_id",
                                              pkg.id
                                            );
                                            window.location.href =
                                              "/packages/new";
                                          }}
                                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                        >
                                          수정
                                        </button>
                                      </div>
                                    </div>
                                    {pkg.items && pkg.items.length > 0 && (
                                      <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                        {pkg.items.map((item, idx) => {
                                          const quantityStr =
                                            item.quantity > 0
                                              ? `${item.quantity}${item.unit || ""}`
                                              : "";
                                          const itemText = quantityStr
                                            ? `${item.productName}-${quantityStr}`
                                            : item.productName;

                                          return (
                                            <span
                                              key={`${item.productId}-${idx}`}
                                            >
                                              {itemText}
                                              {idx < pkg.items!.length - 1 &&
                                                " "}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <div className="ml-4 flex items-center gap-2">
                                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                      <button
                                        type="button"
                                        onClick={handleDecreasePackage}
                                        disabled={packageCount === 0}
                                        className="flex h-8 w-8 items-center justify-center rounded-l-lg text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-200 dark:hover:bg-slate-700"
                                      >
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M20 12H4"
                                          />
                                        </svg>
                                      </button>
                                      <div className="flex h-8 min-w-[3rem] items-center justify-center border-x border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                                        {packageCount}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleAddPackageToOutbound(pkg)
                                        }
                                        className="flex h-8 w-8 items-center justify-center rounded-r-lg text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                      >
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 4v16m8-8H4"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Package Pagination */}
                        {Math.ceil(filteredPackages.length / itemsPerPage) >
                          1 && (
                          <div className="mt-6 flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                              }
                              disabled={currentPage === 1}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 19l-7-7 7-7"
                                />
                              </svg>
                            </button>
                            {Array.from(
                              {
                                length: Math.ceil(
                                  filteredPackages.length / itemsPerPage
                                ),
                              },
                              (_, i) => i + 1
                            ).map((page) => (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                                  page === currentPage
                                    ? "bg-blue-500 text-white"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() =>
                                setCurrentPage((p) =>
                                  Math.min(
                                    Math.ceil(
                                      filteredPackages.length / itemsPerPage
                                    ),
                                    p + 1
                                  )
                                )
                              }
                              disabled={
                                currentPage >=
                                Math.ceil(
                                  filteredPackages.length / itemsPerPage
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                      </>
                    )
                  ) : products.length === 0 ? (
                    <div className="py-8 text-center text-slate-500">
                      제품이 없습니다.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        {currentProducts.map((product) => (
                          <div
                            key={product.id}
                            id={`product-card-${product.id}`}
                            className="transition-all duration-300"
                          >
                            <ProductCard
                              product={product}
                              scheduledItems={scheduledItems}
                              onQuantityChange={handleQuantityChange}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-center gap-2">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                              />
                            </svg>
                          </button>

                          {Array.from(
                            { length: totalPages },
                            (_, i) => i + 1
                          ).map((page) => {
                            // Show first page, last page, current page, and pages around current
                            if (
                              page === 1 ||
                              page === totalPages ||
                              (page >= currentPage - 1 &&
                                page <= currentPage + 1)
                            ) {
                              return (
                                <button
                                  key={page}
                                  onClick={() => handlePageChange(page)}
                                  className={`h-10 w-10 rounded-lg border font-semibold transition ${
                                    currentPage === page
                                      ? "border-sky-500 bg-sky-500 text-white"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                            } else if (
                              page === currentPage - 2 ||
                              page === currentPage + 2
                            ) {
                              return (
                                <span
                                  key={page}
                                  className="h-10 w-10 flex items-center justify-center text-slate-400"
                                >
                                  ...
                                </span>
                              );
                            }
                            return null;
                          })}

                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Page Info */}
                      {totalPages > 1 && (
                        <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                          {startIndex + 1}-{Math.min(endIndex, products.length)}{" "}
                          / {products.length}개 제품
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Outbound Processing */}
            <div className="flex flex-col ">
              <div className="flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 flex flex-col overflow-hidden">
                {/* Header - Fixed */}
                <div className="mb-4 flex items-center  justify-between flex-shrink-0">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                    출고 처리
                  </h2>
                  {/* 출고 담당자 */}
                  <div className="flex items-center ">
                    <label className="w-42 shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">
                      출고 담당자 <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="text"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      placeholder="담당자 이름"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-1 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
                    />
                  </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200 dark:[&::-webkit-scrollbar-thumb]:border-slate-700">
                  {/* Status - Radio Buttons */}
                  <div className="space-y-4">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      상태
                    </label>
                    <div className="flex gap-4">
                      {/* 파손 */}
                      <label
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStatusType(
                            statusType === "damaged" ? null : "damaged"
                          );
                        }}
                      >
                        <div className="relative flex h-4 w-4 items-center justify-center">
                          <input
                            type="radio"
                            name="status"
                            checked={statusType === "damaged"}
                            readOnly
                            className="h-4 w-4 appearance-none rounded-full border-2 border-slate-300 bg-white checked:border-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 pointer-events-none"
                          />
                          {statusType === "damaged" && (
                            <div className="absolute h-2 w-2 rounded-full bg-sky-500"></div>
                          )}
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          파손
                        </span>
                      </label>

                      {/* 불량 */}
                      <label
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStatusType(
                            statusType === "defective" ? null : "defective"
                          );
                        }}
                      >
                        <div className="relative flex h-4 w-4 items-center justify-center">
                          <input
                            type="radio"
                            name="status"
                            checked={statusType === "defective"}
                            readOnly
                            className="h-4 w-4 appearance-none rounded-full border-2 border-slate-300 bg-white checked:border-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 pointer-events-none"
                          />
                          {statusType === "defective" && (
                            <div className="absolute h-2 w-2 rounded-full bg-sky-500"></div>
                          )}
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          불량
                        </span>
                      </label>
                    </div>

                    {/* Memo Field - faqat 파손 yoki 불량 tanlanganida */}
                    {statusType && (
                      <div className="mt-4">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                          메모 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          placeholder="상태가 나쁜 이유를 입력하세요"
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </div>
                    )}

                    {/* 차트번호 Field - faqat 파손 yoki 불량 tanlanmaganida */}
                    {!statusType && (
                      <div className="mt-4">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                          차트번호
                        </label>
                        <input
                          type="text"
                          placeholder="차트번호"
                          value={chartNumber}
                          onChange={(e) => setChartNumber(e.target.value)}
                          className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </div>
                    )}
                  </div>

                  {/* Scheduled Outbound List */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      출고 예정 목록 ({scheduledItems.length}개)
                    </h3>
                    {scheduledItems.length === 0 && failedItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                        {isPackageMode
                          ? "패키지를 선택해주세요"
                          : "출고할 제품을 선택해주세요."}
                      </div>
                    ) : (
                      <div
                        className="space-y-3 flex-1 min-h-0 overflow-y-auto
  [&::-webkit-scrollbar]:w-1
  [&::-webkit-scrollbar-track]:bg-slate-100
  [&::-webkit-scrollbar-thumb]:bg-slate-300
  [&::-webkit-scrollbar-thumb]:rounded-full
  dark:[&::-webkit-scrollbar-track]:bg-slate-800
  dark:[&::-webkit-scrollbar-thumb]:bg-slate-600
"
                      >
                        {/* 실패한 항목 표시 */}
                        {failedItems.length > 0 && (
                          <div className="mb-3 rounded-lg border-2 border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                                출고 실패 항목 ({failedItems.length}개)
                              </span>
                            </div>
                            <div className="space-y-1">
                              {failedItems.map((item) => (
                                <div
                                  key={`failed-${item.productId}-${item.batchId}`}
                                  onClick={() =>
                                    !item.packageName &&
                                    scrollToProduct(item.productId)
                                  }
                                  className={`flex items-center justify-between rounded border border-red-200 bg-white px-2 py-1 text-sm dark:border-red-800 dark:bg-slate-900/60 ${
                                    !item.packageName
                                      ? "cursor-pointer transition hover:bg-red-50 dark:hover:bg-red-900/30"
                                      : ""
                                  }`}
                                >
                                  <span className="text-red-700 dark:text-red-300">
                                    {item.packageName
                                      ? `${item.packageName} - `
                                      : ""}
                                    {item.productName} {item.batchNo}{" "}
                                    {item.quantity}
                                    {item.unit || "개"}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setScheduledItems((prev) => {
                                        // Product item va package item alohida (ikkovini ham qo'shish mumkin)
                                        const exists = prev.some(
                                          (i) =>
                                            i.productId === item.productId &&
                                            i.batchId === item.batchId &&
                                            i.isPackageItem ===
                                              item.isPackageItem // ✅ Package/Product farqi
                                        );
                                        if (exists) return prev;
                                        return [...prev, item];
                                      });
                                      setFailedItems((prev) =>
                                        prev.filter(
                                          (f) =>
                                            !(
                                              (
                                                f.productId ===
                                                  item.productId &&
                                                f.batchId === item.batchId &&
                                                f.isPackageItem ===
                                                  item.isPackageItem
                                              ) // ✅ Package/Product farqi
                                            )
                                        )
                                      );
                                    }}
                                    className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-600"
                                  >
                                    재시도
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => {
                                setScheduledItems((prev) => {
                                  // Product item va package item alohida (unique key'ga isPackageItem qo'shish)
                                  const existingIds = new Set(
                                    prev.map(
                                      (i) =>
                                        `${i.productId}-${i.batchId}-${i.isPackageItem ? "pkg" : "prod"}`
                                    )
                                  );
                                  const newItems = failedItems.filter(
                                    (f) =>
                                      !existingIds.has(
                                        `${f.productId}-${f.batchId}-${f.isPackageItem ? "pkg" : "prod"}`
                                      )
                                  );
                                  return [...prev, ...newItems];
                                });
                                setFailedItems([]);
                              }}
                              className="mt-2 w-full rounded bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600"
                            >
                              전체 재시도
                            </button>
                          </div>
                        )}

                        {/* Scheduled Items - Product va Package items'ni ajratish */}
                        {(() => {
                          const productItems = scheduledItems.filter(
                            (item) => !item.isPackageItem
                          );
                          const packageItems = scheduledItems.filter(
                            (item) => item.isPackageItem
                          );

                          // Package items'ni guruhlash
                          if (packageItems.length > 0) {
                            const groupedByPackage = packageItems.reduce(
                              (acc, item) => {
                                const key = item.packageId || "single";
                                if (!acc[key]) {
                                  acc[key] = {
                                    packageId: item.packageId,
                                    packageName:
                                      item.packageName || item.productName,
                                    items: [],
                                  };
                                }
                                acc[key].items.push(item);
                                return acc;
                              },
                              {} as Record<
                                string,
                                {
                                  packageId?: string;
                                  packageName?: string;
                                  items: ScheduledItem[];
                                }
                              >
                            );

                            const packageOrder: string[] = [];
                            packageItems.forEach((item) => {
                              if (
                                item.packageId &&
                                !packageOrder.includes(item.packageId)
                              ) {
                                packageOrder.push(item.packageId);
                              }
                            });

                            const orderedPackages = packageOrder
                              .map((pkgId) => groupedByPackage[pkgId])
                              .filter(Boolean);

                            return (
                              <>
                                {/* Package items */}
                                {orderedPackages.map((group, groupIdx) => {
                                  const packageCount =
                                    packageCounts[group.packageId || ""] || 1;
                                  const uniqueItems = group.items.reduce(
                                    (acc, item) => {
                                      const key = `${item.productId}-${item.batchId}`;
                                      if (!acc[key]) {
                                        acc[key] = item;
                                      }
                                      return acc;
                                    },
                                    {} as Record<string, ScheduledItem>
                                  );
                                  const firstItem = group.items[0];
                                  const unit = firstItem.unit || "세트";

                                  return (
                                    <div
                                      key={`package-${group.packageId}-${groupIdx}`}
                                      onClick={() =>
                                        group.packageId &&
                                        scrollToPackage(group.packageId)
                                      }
                                      className="rounded-lg border border-slate-200 bg-white p-3 cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="font-semibold text-slate-900 dark:text-white">
                                            {group.packageName}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm text-slate-600 dark:text-slate-400">
                                            {packageCount} {unit}
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setScheduledItems((prev) =>
                                                prev.filter(
                                                  (item) =>
                                                    item.packageId !==
                                                    group.packageId
                                                )
                                              );
                                              setPackageCounts((prev) => ({
                                                ...prev,
                                                [group.packageId || ""]: 0,
                                              }));
                                            }}
                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                          >
                                            <svg
                                              className="h-4 w-4"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M20 12H4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                      {Object.values(uniqueItems).length >
                                        0 && (
                                        <div className="mt-2 ml-2 space-y-1">
                                          {Object.values(uniqueItems).map(
                                            (item, itemIdx) => (
                                              <div
                                                key={`${item.productId}-${item.batchId}-${itemIdx}`}
                                                className="flex items-center justify-between text-sm"
                                              >
                                                <div className="flex items-center gap-2 flex-1">
                                                  <span className="text-slate-600 dark:text-slate-400">
                                                    -
                                                  </span>
                                                  <span className="text-slate-700 dark:text-slate-300">
                                                    {item.productName}
                                                  </span>
                                                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                    {item.batchNo}
                                                  </span>
                                                </div>
                                                <span className="text-sm text-slate-600 dark:text-slate-400">
                                                  {item.quantity * packageCount}
                                                  {item.unit}
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* Product items */}
                                {productItems.map((item) => {
                                  const isFailed = failedItems.some(
                                    (f) =>
                                      f.productId === item.productId &&
                                      f.batchId === item.batchId
                                  );
                                  return (
                                    <div
                                      key={`${item.productId}-${item.batchId}`}
                                      onClick={() =>
                                        scrollToProduct(item.productId)
                                      }
                                      className={`flex items-center justify-between rounded-lg border px-3 py-4  cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                                        isFailed
                                          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60"
                                      }`}
                                    >
                                      <span
                                        className={`text-sm flex-1 ${
                                          isFailed
                                            ? "text-red-700 dark:text-red-300"
                                            : "text-slate-700 dark:text-slate-200"
                                        }`}
                                      >
                                        {item.productName} {item.batchNo}{" "}
                                        {item.quantity} {"   "}
                                        {item.unit || "개"}
                                        {isFailed && (
                                          <span className="ml-2 text-xs text-red-600 dark:text-red-400 ">
                                            (실패)
                                          </span>
                                        )}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuantityChange(
                                            item.productId,
                                            item.batchId,
                                            item.batchNo,
                                            item.productName,
                                            item.unit || "개",
                                            item.quantity - 1
                                          );
                                        }}
                                        className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                      >
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M20 12H4"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  );
                                })}
                              </>
                            );
                          }

                          // Faqat product items
                          return productItems.map((item) => {
                            const isFailed = failedItems.some(
                              (f) =>
                                f.productId === item.productId &&
                                f.batchId === item.batchId
                            );
                            return (
                              <div
                                key={`${item.productId}-${item.batchId}`}
                                onClick={() => scrollToProduct(item.productId)}
                                className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                                  isFailed
                                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60"
                                }`}
                              >
                                <span
                                  className={`text-sm flex-1 ${
                                    isFailed
                                      ? "text-red-700 dark:text-red-300"
                                      : "text-slate-700 dark:text-slate-200"
                                  }`}
                                >
                                  {item.productName} {item.batchNo}{" "}
                                  {item.quantity}
                                  {item.unit || "개"}
                                  {isFailed && (
                                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                                      (실패)
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuantityChange(
                                      item.productId,
                                      item.batchId,
                                      item.batchNo,
                                      item.productName,
                                      item.unit || "개",
                                      item.quantity - 1
                                    );
                                  }}
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M20 12H4"
                                    />
                                  </svg>
                                </button>
                              </div>
                            );
                          });
                        })()}
                        <div className="pt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          총 {scheduledItems.length}항목
                          {failedItems.length > 0 && (
                            <span className="ml-2 text-red-600 dark:text-red-400">
                              (실패: {failedItems.length}개)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Memo Field */}
                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0 mt-4">
                  <button
                    onClick={handleSubmit}
                    disabled={
                      submitting ||
                      scheduledItems.length === 0 ||
                      !managerName.trim() ||
                      (statusType && !memo.trim()) ||
                      scheduledItems.some((item) => {
                        // Package items uchun tekshiruv yo'q
                        if (item.isPackageItem) return false;
                        // Product items uchun tekshiruv
                        const product = products.find(
                          (p) => p.id === item.productId
                        );
                        if (!product) return true;
                        const batch = product.batches?.find(
                          (b) => b.id === item.batchId
                        );
                        if (!batch) return true;
                        return item.quantity > batch.qty || item.quantity <= 0;
                      })
                    }
                    className="flex-1 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "처리 중..." : "출고 하기"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={scheduledItems.length === 0}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    출고 취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Product Card Component
const ProductCard = memo(function ProductCard({
  product,
  scheduledItems,
  onQuantityChange,
}: {
  product: ProductForOutbound;
  scheduledItems: ScheduledItem[];
  onQuantityChange: (
    productId: string,
    batchId: string,
    batchNo: string,
    productName: string,
    unit: string,
    quantity: number,
    maxQuantity?: number
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {product.batches && product.batches.length > 0 && (
        <>
          {[...product.batches]
            // 정렬 우선순위: ① 유효기간 → ② 배치번호
            .sort((a, b) => {
              // 1. 유효기간으로 정렬 (오래된 것 먼저 - FEFO)
              const dateA = a.expiry_date
                ? new Date(a.expiry_date).getTime()
                : 0;
              const dateB = b.expiry_date
                ? new Date(b.expiry_date).getTime()
                : 0;
              if (dateA !== dateB) {
                return dateA - dateB;
              }
              // 2. 배치번호로 정렬 (같은 유효기간일 경우)
              return (a.batch_no || "").localeCompare(b.batch_no || "");
            })
            .map((batch) => {
              // Faqat product items'ni hisobga olish (package items emas!)
              const scheduledItem = scheduledItems.find(
                (item) =>
                  item.productId === product.id &&
                  item.batchId === batch.id &&
                  !item.isPackageItem // ✅ Package items exclude
              );
              const quantity = scheduledItem?.quantity || 0;

              // Format expiry date
              const expiryDateStr = batch.expiry_date
                ? new Date(batch.expiry_date)
                    .toLocaleDateString("ko-KR", {
                      year: "2-digit",
                      month: "2-digit",
                      day: "2-digit",
                    })

                    .replace(/\s/g, "-")
                    .replace(/\./g, "")
                : "00-00-00";

              // Check if THIS batch has low stock (batch.qty <= minStock)
              const isBatchLowStock = product.minStock
                ? batch.qty <= product.minStock
                : false;

              // Unit logic: if usageCapacity exists, use usageCapacityUnit, otherwise use unit
              const displayUnit =
                product.usageCapacity && product.usageCapacityUnit
                  ? product.usageCapacityUnit
                  : product.unit || "단위";

              return (
                <div
                  key={batch.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  {/* Left Section - Product Info */}
                  <div className="min-w-0 flex-1">
                    {/* Top Line - Product Name and Batch */}
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">
                        {product.productName}
                      </h3>
                      <span className="flex-shrink-0 text-base font-bold text-slate-900 dark:text-white">
                        {batch.batch_no}
                      </span>
                      {batch.isExpiringSoon && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
                          유효기간 임박
                        </span>
                      )}
                      {isBatchLowStock && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                          재고부족
                        </span>
                      )}
                    </div>

                    {/* Bottom Line - Details */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <span
                        className={
                          isBatchLowStock
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : ""
                        }
                      >
                        재고: {batch.qty.toString().padStart(2, "0")}{" "}
                        {product.unit || "단위"}
                      </span>
                      {batch.inbound_qty && (
                        <span className="text-sky-600 dark:text-sky-400">
                          입고수량: {batch.inbound_qty.toLocaleString()}{" "}
                          {product.unit || "단위"}
                        </span>
                      )}
                      {product.supplierName && (
                        <span>공급처: {product.supplierName}</span>
                      )}
                      <span
                        className={
                          batch.isExpiringSoon
                            ? "font-semibold text-yellow-600 dark:text-yellow-400"
                            : ""
                        }
                      >
                        유효기한: {expiryDateStr}
                      </span>
                      {batch.storage && <span>위치:{batch.storage}</span>}
                    </div>
                  </div>

                  {/* Right Section - Quantity Controls + minStock */}
                  <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                    <button
                      onClick={() =>
                        onQuantityChange(
                          product.id,
                          batch.id,
                          batch.batch_no,
                          product.productName,
                          displayUnit,
                          Math.max(0, quantity - 1),
                          batch.qty
                        )
                      }
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max={batch.qty}
                      value={quantity}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value) || 0;
                        onQuantityChange(
                          product.id,
                          batch.id,
                          batch.batch_no,
                          product.productName,
                          displayUnit,
                          Math.min(newQty, batch.qty),
                          batch.qty
                        );
                      }}
                      className="h-10 w-20 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() =>
                        onQuantityChange(
                          product.id,
                          batch.id,
                          batch.batch_no,
                          product.productName,
                          displayUnit,
                          Math.min(quantity + 1, batch.qty),
                          batch.qty
                        )
                      }
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                    <span className="ml-2 flex-shrink-0 whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200">
                      {product.minStock?.toLocaleString() ?? 0} {displayUnit}
                    </span>
                  </div>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
});

ProductCard.displayName = "ProductCard";

export default function OutboundPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading...
        </div>
      }
    >
      <OutboundPageContent />
    </Suspense>
  );
}
