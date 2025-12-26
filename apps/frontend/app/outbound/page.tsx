"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost } from "../../lib/api";

type Batch = {
  id: string;
  batch_no: string;
  qty: number;
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

export default function OutboundPage() {
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
  // Tab o'zgarishi - 출고 처리 yoki 출고 내역
  const [activeTab, setActiveTab] = useState<"processing" | "history">(
    "processing"
  );

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

  // History state
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalItems, setHistoryTotalItems] = useState(0);
  const historyItemsPerPage = 20;

  // Manager name should be empty on page load - user must enter it manually

  useEffect(() => {
    if (activeTab === "processing") {
      if (isPackageMode) {
        fetchPackages();
      } else {
        fetchProducts();
      }
      setCurrentPage(1); // Reset to first page when search changes
    } else {
      fetchHistory();
    }
  }, [apiUrl, searchQuery, isPackageMode, activeTab]);

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

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [historyPage, historySearchQuery]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParam = searchQuery
        ? `?search=${encodeURIComponent(searchQuery)}`
        : "";
      const data = await apiGet<ProductForOutbound[]>(
        `${apiUrl}/outbound/products${searchParam}`
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
    } catch (err) {
      console.error("Failed to load products", err);
      setError("제품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<PackageForOutbound[]>(`${apiUrl}/packages`);

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
    } catch (err) {
      console.error("Failed to load packages", err);
      setError("패키지 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPackageItems = async (packageId: string) => {
    try {
      const data = await apiGet<PackageItemForOutbound[]>(
        `${apiUrl}/packages/${packageId}/items`
      );
      setSelectedPackageItems(data);
    } catch (err) {
      console.error("Failed to load package items", err);
      alert("패키지 구성품 정보를 불러오지 못했습니다.");
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const queryParams = new URLSearchParams();
      if (historySearchQuery) {
        queryParams.append("search", historySearchQuery);
      }
      queryParams.append("page", historyPage.toString());
      queryParams.append("limit", historyItemsPerPage.toString());

      const url = `${apiUrl}/outbound/history?${queryParams.toString()}`;
      const data = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(url);

      setHistoryData(data.items || []);
      setHistoryTotalPages(data.totalPages || 1);
      setHistoryTotalItems(data.total || 0);
    } catch (err) {
      console.error("Failed to load history", err);
      setHistoryError("출고 내역을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Group history by exact timestamp and manager
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: any[] } = {};

    historyData.forEach((item) => {
      const outboundDateValue = item.outboundDate || item.outbound_date;
      if (!outboundDateValue) {
        return;
      }

      const outboundDate = new Date(outboundDateValue);

      if (isNaN(outboundDate.getTime())) {
        return;
      }

      const manager = item.managerName || item.manager_name || "Unknown";
      // Use full ISO timestamp as groupKey for exact grouping
      const groupKey = `${outboundDate.toISOString()}|||${manager}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    return Object.entries(groups).sort((a, b) => {
      return b[0].localeCompare(a[0]);
    });
  }, [historyData]);

  const handlePackageSelect = async (pkg: PackageForOutbound) => {
    await fetchPackageItems(pkg.id);
  };

  const handleAddPackageToOutbound = async (pkg: PackageForOutbound) => {
    // Check if package already exists in scheduled items
    const existingPackageItems = scheduledItems.filter(
      (item) => item.packageId === pkg.id
    );

    if (existingPackageItems.length > 0) {
      // Package already in cart - 1개만 가능 (패키지는 1개만 생성됨)
      alert("이미 추가된 패키지입니다. 패키지는 1개만 출고 가능합니다.");
      return;
    }

    // New package - add items immediately (optimistic update)
    if (pkg.items && pkg.items.length > 0) {
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

      // Initialize package count to 1
      setPackageCounts((prev) => ({
        ...prev,
        [pkg.id]: 1, // First time adding = 1
      }));

      console.log("New package added:", pkg.name);

      // Fetch batch information in background and update (non-blocking)
      apiGet<PackageItemForOutbound[]>(`${apiUrl}/packages/${pkg.id}/items`)
        .then((itemsWithBatches) => {
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

              setTimeout(() => {
                alert(
                  `패키지 "${pkg.name}"의 모든 제품이 재고 부족으로 출고 불가능합니다.`
                );
              }, 500);
            } else if (unmappedItems.length > 0) {
              // Show warning if some items couldn't be added
              setTimeout(() => {
                alert(
                  `재고가 부족한 제품이 있어 패키지에서 제외되었습니다:\n${unmappedItems.join(", ")}`
                );
              }, 500);
            }

            return updated;
          });
        })
        .catch((err) => {
          console.error("Failed to load package items with batches", err);
          alert("패키지 정보를 불러오는 중 오류가 발생했습니다.");
          // Remove all items for this package
          setScheduledItems((prev) =>
            prev.filter((item) => item.packageId !== pkg.id)
          );
        });
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

      console.log("출고 시작:", {
        productItems: productItems.length,
        packageItems: packageItems.length,
        total: scheduledItems.length,
      });

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
        // Package는 1개만 출고 (packageCount는 항상 1)
        const itemsByPackage = packageItems.reduce(
          (acc, item) => {
            const key = `${item.packageId}-${item.productId}-${item.batchId}`;
            if (!acc[key]) {
              acc[key] = {
                ...item,
                quantity: item.quantity, // Package count = 1 (no multiplication)
              };
            }
            return acc;
          },
          {} as Record<string, ScheduledItem & { quantity: number }>
        );

        const packagePayload = {
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

      // Log
      console.log("출고 완료:", {
        timestamp: new Date().toISOString(),
        manager: managerName.trim(),
        productItems: productItems.length,
        packageItems: packageItems.length,
        successCount,
        failedCount,
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

        // Refresh products and packages list to remove 0-stock items
        if (isPackageMode) {
          await fetchPackages();
        } else {
          await fetchProducts();
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

        // Refresh products/packages list even for partial success
        if (isPackageMode) {
          await fetchPackages();
        } else {
          await fetchProducts();
        }
      }

      // Refresh data
      if (isPackageMode) {
        fetchPackages();
      } else {
        fetchProducts();
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

      // Refresh data
      if (isPackageMode) {
        fetchPackages();
      } else {
        fetchProducts();
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

      // Refresh data
      if (isPackageMode) {
        fetchPackages();
      } else {
        fetchProducts();
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
            <button
              onClick={() => setActiveTab("processing")}
              className={`px-4 py-2 text-sm font-semibold transition ${
                activeTab === "processing"
                  ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              출고 처리
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 text-sm font-semibold transition ${
                activeTab === "history"
                  ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              출고 내역
            </button>
          </div>

          {/* Quick Outbound Bar - faqat processing tab'da */}
        </header>

        {activeTab === "processing" ? (
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
                            const isInCart = scheduledItems.some(
                              (item) => item.packageId === pkg.id
                            );
                            const packageCount = isInCart ? 1 : 0; // 패키지는 항상 1개만

                            const handleDecreasePackage = () => {
                              // 패키지는 1개만 가능 - remove only
                              setScheduledItems((prev) =>
                                prev.filter((item) => item.packageId !== pkg.id)
                              );
                              setPackageCounts((prev) => {
                                const updated = { ...prev };
                                delete updated[pkg.id];
                                return updated;
                              });
                              console.log(
                                "Package removed from cart:",
                                pkg.name
                              );
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
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                      >
                                        수정
                                      </button>
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
                                    {packageCount === 0 ? (
                                      <button
                                        onClick={() =>
                                          handleAddPackageToOutbound(pkg)
                                        }
                                        className="flex h-8 items-center gap-1 rounded border border-blue-500 bg-blue-50 px-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-400"
                                      >
                                        <span>+</span>
                                        <span>추가</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={handleDecreasePackage}
                                        className="flex h-8 items-center gap-1 rounded border border-red-500 bg-red-50 px-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-400 dark:bg-red-500/10 dark:text-red-400"
                                      >
                                        <span>✓</span>
                                        <span>추가됨</span>
                                      </button>
                                    )}
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
        ) : (
          // History Tab Content
          <div className="space-y-4">
            {/* History Header */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-500/20">
                    <svg
                      className="h-5 w-5 text-sky-600 dark:text-sky-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    최근 출고 내역
                  </h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {historyTotalItems}건
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  마지막 업데이트: {new Date().toLocaleString("ko-KR")}
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="제품명, 출고자명, 출고상태..."
                  value={historySearchQuery}
                  onChange={(e) => {
                    setHistorySearchQuery(e.target.value);
                    setHistoryPage(1);
                  }}
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
            </div>

            {/* History List */}
            {historyLoading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-slate-500">로딩 중...</div>
              </div>
            ) : historyError ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-red-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                {historyError}
              </div>
            ) : groupedHistory.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-slate-500">출고 내역이 없습니다.</div>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedHistory.map(([groupKey, items]) => {
                  const [isoTimestamp, manager] = groupKey.split("|||");
                  const firstItem = items[0];
                  const chartNumber =
                    firstItem?.chartNumber || firstItem?.chart_number;
                  const outboundDateValue =
                    firstItem?.outboundDate || firstItem?.outbound_date;

                  // Format timestamp with manager name first
                  const formatDisplayText = (
                    timestamp: string,
                    managerName: string
                  ) => {
                    try {
                      const dateObj = new Date(timestamp);
                      const year = dateObj.getFullYear();
                      const month = String(dateObj.getMonth() + 1).padStart(
                        2,
                        "0"
                      );
                      const day = String(dateObj.getDate()).padStart(2, "0");
                      const hour = String(dateObj.getHours()).padStart(2, "0");
                      const minute = String(dateObj.getMinutes()).padStart(
                        2,
                        "0"
                      );

                      return `${managerName}님 출고 ${year}-${month}-${day} ${hour}:${minute}`;
                    } catch {
                      return `${managerName}님 출고 ${timestamp}`;
                    }
                  };

                  return (
                    <div
                      key={groupKey}
                      className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                    >
                      {/* Group Header */}
                      <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-base font-semibold text-slate-900 dark:text-white">
                              {formatDisplayText(isoTimestamp, manager)}
                            </span>
                            {chartNumber && (
                              <span className="text-base font-semibold text-slate-900 dark:text-white">
                                차트번호: {chartNumber}
                              </span>
                            )}
                            {/* 패키지 출고와 바코드 출고 구분 표시 */}
                            {(firstItem?.outboundType ||
                              firstItem?.outbound_type) === "패키지" && (
                              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                {firstItem?.packageName ||
                                firstItem?.package_name
                                  ? `${firstItem.packageName || firstItem.package_name}`
                                  : "패키지 출고"}
                              </span>
                            )}
                            {(firstItem?.outboundType ||
                              firstItem?.outbound_type) === "바코드" && (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                                바코드 출고
                              </span>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              // 취소 전에 정보 표시
                              console.log("=== 출고 취소 시작 ===");
                              console.log(
                                "그룹:",
                                formatDisplayText(isoTimestamp, manager)
                              );
                              console.log(
                                "Timestamp (from groupKey):",
                                isoTimestamp
                              );
                              console.log("Manager:", manager);
                              console.log("취소될 항목 수:", items.length);

                              if (
                                confirm(
                                  `이 출고를 취소하시겠습니까?\n\n${formatDisplayText(isoTimestamp, manager)}\n${items.length}개 항목이 취소되고 재고가 복원됩니다.`
                                )
                              ) {
                                try {
                                  const response = await fetch(
                                    `${apiUrl}/outbound/cancel?outboundTimestamp=${encodeURIComponent(isoTimestamp)}&managerName=${encodeURIComponent(manager)}`,
                                    {
                                      method: "DELETE",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${localStorage.getItem("erp_access_token")}`,
                                      },
                                    }
                                  );

                                  if (response.ok) {
                                    const result = await response.json();
                                    console.log("=== 출고 취소 성공 ===");
                                    console.log("결과:", result);
                                    alert(
                                      result.message || "출고가 취소되었습니다."
                                    );
                                    // Refresh history
                                    fetchHistory();
                                  } else {
                                    const error = await response.json();
                                    console.error("=== 출고 취소 실패 ===");
                                    console.error("Error:", error);
                                    throw new Error(
                                      error.message ||
                                        "출고 취소에 실패했습니다."
                                    );
                                  }
                                } catch (error: any) {
                                  console.error(
                                    "Failed to cancel outbound:",
                                    error
                                  );
                                  alert(
                                    error.message || "출고 취소에 실패했습니다."
                                  );
                                }
                              }
                            }}
                            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-600 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            출고 취소
                          </button>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {items.map((item: any) => {
                          const product = item.product;
                          const batch = item.batch;
                          const outboundDateValue =
                            item.outboundDate || item.outbound_date;
                          const outboundDate = outboundDateValue
                            ? new Date(outboundDateValue)
                            : new Date();
                          const isValidDate = !isNaN(outboundDate.getTime());
                          const month = isValidDate
                            ? outboundDate.getMonth() + 1
                            : new Date().getMonth() + 1;
                          const day = isValidDate
                            ? outboundDate.getDate()
                            : new Date().getDate();
                          const isDamaged =
                            item.isDamaged || item.is_damaged || false;
                          const isDefective =
                            item.isDefective || item.is_defective || false;
                          const hasSpecialNote =
                            isDamaged || isDefective || item.memo;
                          const specialNote = isDamaged
                            ? "파손"
                            : isDefective
                              ? "불량"
                              : item.memo?.includes("떨어뜨림")
                                ? "떨어뜨림"
                                : item.memo?.includes("반품")
                                  ? "반품"
                                  : item.memo || null;

                          const outboundQty =
                            item.outboundQty || item.outbound_qty || 0;
                          const salePrice =
                            product?.salePrice || product?.sale_price || 0;
                          const price = salePrice
                            ? salePrice * outboundQty
                            : null;

                          return (
                            <div
                              key={item.id}
                              className="px-6 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/50"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="mb-2 flex items-center gap-2">
                                    <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                                      {product?.name || "Unknown Product"}
                                    </h4>
                                    {(item.outboundType ||
                                      item.outbound_type) === "패키지" &&
                                      (item.packageName ||
                                        item.package_name) && (
                                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                          패키지:{" "}
                                          {item.packageName ||
                                            item.package_name}
                                        </span>
                                      )}
                                    {(batch?.batchNo || batch?.batch_no) && (
                                      <span className="text-sm text-slate-500 dark:text-slate-400">
                                        ({batch.batchNo || batch.batch_no})
                                      </span>
                                    )}
                                    {hasSpecialNote && (
                                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                                        <span className="text-xs font-bold">
                                          !
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-sm text-slate-600 dark:text-slate-400">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span>
                                        {month}월 {day}일
                                      </span>
                                      <span>
                                        {item.managerName || item.manager_name}
                                        에 의한 출고
                                      </span>
                                      {(batch?.batchNo || batch?.batch_no) && (
                                        <span>
                                          ({batch.batchNo || batch.batch_no})
                                        </span>
                                      )}
                                      {(item.patientName ||
                                        item.patient_name) && (
                                        <span>
                                          - 환자:{" "}
                                          {item.patientName ||
                                            item.patient_name}
                                        </span>
                                      )}
                                      {(item.chartNumber ||
                                        item.chart_number) && (
                                        <span>
                                          (차트번호:{" "}
                                          {item.chartNumber ||
                                            item.chart_number}
                                          )
                                        </span>
                                      )}
                                      {item.memo &&
                                        !isDamaged &&
                                        !isDefective && (
                                          <span>- {item.memo}</span>
                                        )}
                                      {specialNote && (
                                        <span className="font-semibold text-red-600 dark:text-red-400">
                                          특이사항 {specialNote}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  <div className="text-base font-bold text-slate-900 dark:text-white">
                                    -{outboundQty}
                                    {product?.unit || "개"}
                                  </div>
                                  {price && (
                                    <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                      ₩{price.toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {historyTotalPages > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {historyPage}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {" "}
                      / {historyTotalPages} 페이지
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
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
                      { length: historyTotalPages },
                      (_, i) => i + 1
                    ).map((page) => (
                      <button
                        key={page}
                        onClick={() => setHistoryPage(page)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                          page === historyPage
                            ? "bg-blue-500 text-white"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      onClick={() =>
                        setHistoryPage((p) =>
                          Math.min(historyTotalPages, p + 1)
                        )
                      }
                      disabled={historyPage === historyTotalPages}
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// Product Card Component
function ProductCard({
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
                  <div className="flex-1">
                    {/* Top Line - Product Name and Batch */}
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {product.productName}
                      </h3>
                      <span className="text-base font-bold text-slate-900 dark:text-white">
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

                  {/* Right Section - Quantity Controls */}
                  <div className="ml-4 flex items-center gap-2">
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
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
                      className="h-10 w-16 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                    <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {displayUnit}
                    </span>
                  </div>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}
