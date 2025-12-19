"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet, apiPost } from "../../../lib/api";

type Batch = {
  id: string;
  batchNo: string;
  qty: number;
  expiryDate?: string | null;
  storage?: string | null;
  isExpiringSoon?: boolean;
  daysUntilExpiry?: number | null;
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
  batches: Batch[];
};

type ScheduledItem = {
  productId: string;
  productName: string;
  batchId: string;
  batchNo: string;
  quantity: number;
  unit: string;
  packageId: string;
  packageName: string;
  isPackageItem: boolean;
};

export default function PackageOutboundPage() {
  const pathname = usePathname();
  const isPackageOutbound = pathname === "/outbound/package";

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [packages, setPackages] = useState<PackageForOutbound[]>([]);
  const [selectedPackageItems, setSelectedPackageItems] = useState<
    PackageItemForOutbound[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Cache for package expiry info (packageId -> earliest expiry date timestamp)
  const [packageExpiryCache, setPackageExpiryCache] = useState<
    Record<string, number | null>
  >({});

  // Outbound processing form state
  const [managerName, setManagerName] = useState("");
  const [isDamaged, setIsDamaged] = useState(false);
  const [isDefective, setIsDefective] = useState(false);
  const [additionalMemo, setAdditionalMemo] = useState("");
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failedItems, setFailedItems] = useState<ScheduledItem[]>([]);
  const [packageCounts, setPackageCounts] = useState<Record<string, number>>(
    {}
  );

  useEffect(() => {
    fetchPackages();
  }, []);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  const handlePackageSelect = async (pkg: PackageForOutbound) => {
    await fetchPackageItems(pkg.id);
  };

  const handleAddToOutbound = async (pkg: PackageForOutbound) => {
    // Check if package already exists in scheduled items
    const existingPackageItems = scheduledItems.filter(
      (item) => item.packageId === pkg.id
    );

    if (existingPackageItems.length > 0) {
      // Package already exists, just increment count (don't add duplicate items)
      setPackageCounts((prev) => ({
        ...prev,
        [pkg.id]: (prev[pkg.id] || 0) + 1,
      }));
      // Don't add more items - just update the count
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

      // Update package count immediately
      setPackageCounts((prev) => ({
        ...prev,
        [pkg.id]: (prev[pkg.id] || 0) + 1,
      }));

      // Fetch batch information in background and update (non-blocking)
      apiGet<PackageItemForOutbound[]>(`${apiUrl}/packages/${pkg.id}/items`)
        .then((itemsWithBatches) => {
          // Update scheduled items with real batch information
          setScheduledItems((prev) => {
            return prev.map((scheduledItem) => {
              // Find matching optimistic item by packageId and productId
              if (
                scheduledItem.packageId === pkg.id &&
                scheduledItem.batchId.startsWith(`temp-${pkg.id}-`)
              ) {
                const itemWithBatch = itemsWithBatches.find(
                  (item) => item.productId === scheduledItem.productId
                );

                if (itemWithBatch) {
                  const firstBatch = itemWithBatch.batches[0];
                  if (firstBatch && firstBatch.qty > 0) {
                    return {
                      ...scheduledItem,
                      batchId: firstBatch.id,
                      batchNo: firstBatch.batchNo,
                      quantity: itemWithBatch.packageQuantity, // Use package quantity from API
                    };
                  }
                }
              }
              return scheduledItem;
            });
          });
        })
        .catch((err) => {
          console.error("Failed to load package items with batches", err);
          // Keep optimistic items, user can still proceed
        });
    }
  };

  const handleQuantityChange = (
    productId: string,
    batchId: string,
    batchNo: string,
    unit: string,
    delta: number
  ) => {
    setScheduledItems((prev) => {
      const existing = prev.find(
        (item) => item.productId === productId && item.batchId === batchId
      );

      if (existing) {
        const newQuantity = Math.max(0, existing.quantity + delta);
        if (newQuantity === 0) {
          return prev.filter(
            (item) =>
              !(item.productId === productId && item.batchId === batchId)
          );
        }
        return prev.map((item) =>
          item.productId === productId && item.batchId === batchId
            ? { ...item, quantity: newQuantity }
            : item
        );
      }

      return prev;
    });
  };

  const removeScheduledItem = (productId: string, batchId: string) => {
    setScheduledItems((prev) =>
      prev.filter(
        (item) => !(item.productId === productId && item.batchId === batchId)
      )
    );
  };

  const handleSubmit = async () => {
    if (scheduledItems.length === 0) {
      alert("출고할 패키지를 선택해주세요.");
      return;
    }

    if (!managerName.trim()) {
      alert("담당자를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      // Group items by package to multiply quantity by package count
      const itemsByPackage = scheduledItems.reduce(
        (acc, item) => {
          const key = `${item.packageId}-${item.productId}-${item.batchId}`;
          if (!acc[key]) {
            acc[key] = {
              ...item,
              quantity: item.quantity * (packageCounts[item.packageId] || 1), // Multiply by package count
            };
          }
          return acc;
        },
        {} as Record<string, ScheduledItem & { quantity: number }>
      );

      // Use unified outbound API for package outbound
      const payload = {
        outboundType: "패키지",
        managerName: managerName.trim(),
        memo: additionalMemo.trim() || undefined,
        items: Object.values(itemsByPackage).map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          outboundQty: item.quantity, // Already multiplied by package count
          packageId: item.packageId, // 패키지 ID 포함
        })),
      };

      const response = await apiPost(`${apiUrl}/outbound/unified`, payload);

      // 출고 후 목록 초기화 및 로그 기록
      console.log("패키지 출고 완료:", {
        timestamp: new Date().toISOString(),
        manager: managerName.trim(),
        items: scheduledItems.length,
        itemsDetail: scheduledItems,
      });

      // 성공한 항목과 실패한 항목 분리
      if (response && response.failedItems && response.failedItems.length > 0) {
        const failed = scheduledItems.filter((item) =>
          response.failedItems.some(
            (failed: any) =>
              failed.productId === item.productId &&
              failed.batchId === item.batchId
          )
        );
        setFailedItems(failed);
        const successCount = scheduledItems.length - failed.length;
        alert(
          `${successCount}개 항목 출고 완료, ${failed.length}개 항목 실패했습니다.`
        );
      } else {
        alert("패키지 출고가 완료되었습니다.");
        setFailedItems([]);
        // Clear form
        setScheduledItems([]);
        setManagerName("");
        setAdditionalMemo("");
        setIsDamaged(false);
        setIsDefective(false);
        setPackageCounts({});
      }

      // 성공한 항목만 제거
      if (response && response.failedItems && response.failedItems.length > 0) {
        const failedIds = new Set(
          response.failedItems.map((f: any) => `${f.productId}-${f.batchId}`)
        );
        setScheduledItems((prev) =>
          prev.filter(
            (item) => !failedIds.has(`${item.productId}-${item.batchId}`)
          )
        );
      }
    } catch (err: any) {
      console.error("Failed to process outbound", err);
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "출고 처리 중 오류가 발생했습니다.";
      alert(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailed = async (item: ScheduledItem) => {
    setSubmitting(true);
    try {
      const payload = {
        outboundType: "패키지",
        managerName: managerName.trim(),
        memo: additionalMemo.trim() || undefined,
        items: [
          {
            productId: item.productId,
            batchId: item.batchId,
            outboundQty: item.quantity,
            packageId: item.packageId,
          },
        ],
      };

      await apiPost(`${apiUrl}/outbound/unified`, payload);
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
      const payload = {
        outboundType: "패키지",
        managerName: managerName.trim(),
        memo: additionalMemo.trim() || undefined,
        items: failedItems.map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          outboundQty: item.quantity,
          packageId: item.packageId,
        })),
      };

      const response = await apiPost(`${apiUrl}/outbound/unified`, payload);
      if (response && response.failedItems && response.failedItems.length > 0) {
        const failed = failedItems.filter((item) =>
          response.failedItems.some(
            (failed: any) =>
              failed.productId === item.productId &&
              failed.batchId === item.batchId
          )
        );
        setFailedItems(failed);
        alert(
          `${failedItems.length - failed.length}개 항목 재시도 성공, ${failed.length}개 항목 실패`
        );
      } else {
        setFailedItems([]);
        setScheduledItems((prev) =>
          prev.filter(
            (i) =>
              !failedItems.some(
                (f) => f.productId === i.productId && f.batchId === i.batchId
              )
          )
        );
        alert("모든 항목 재시도 성공");
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || "재시도 실패");
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            출고 관리
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
            필요한 제품을 바로 출고해보세요.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Left Panel - Package List */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              {/* Segmented Control - Product/Package Outbound */}
              <div className="mb-4 flex items-center gap-0 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                <Link
                  href="/outbound"
                  className={`relative flex-1 rounded-md px-4 py-2 text-center text-sm font-semibold transition ${
                    !isPackageOutbound
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  제품 출고
                </Link>
                <Link
                  href="/outbound/package"
                  className={`relative flex-1 rounded-md px-4 py-2 text-center text-sm font-semibold transition ${
                    isPackageOutbound
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  패키지 출고
                </Link>
              </div>

              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                전체 패키지
              </h2>

              {/* Search Bar and New Package Registration Button */}
              <div className="mb-4 flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="패키지명, 제품명으로 검색..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
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
                <Link
                  href="/packages/new"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 flex items-center justify-center whitespace-nowrap"
                >
                  새 패키지등록
                </Link>
              </div>

              {loading ? (
                <div className="py-8 text-center text-slate-500">
                  로딩 중...
                </div>
              ) : error ? (
                <div className="py-8 text-center text-red-500">{error}</div>
              ) : filteredPackages.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  패키지가 없습니다.
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedPackages.map((pkg) => {
                      // Get package count from state
                      const packageCount = packageCounts[pkg.id] || 0;

                      const handleDecreasePackage = () => {
                        if (packageCount > 0) {
                          // Remove one instance of this package from scheduled items
                          const packageItems = scheduledItems.filter(
                            (item) => item.packageId === pkg.id
                          );
                          if (packageItems.length > 0) {
                            // Group items by their unique combination to remove one complete set
                            const itemsToRemove = new Set<string>();
                            const seen = new Set<string>();

                            // Find one complete set of package items to remove
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
                              const removeCount: Record<string, number> = {};

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

                            // Update package count
                            setPackageCounts((prev) => ({
                              ...prev,
                              [pkg.id]: Math.max(0, (prev[pkg.id] || 0) - 1),
                            }));
                          }
                        }
                      };

                      return (
                        <div
                          key={pkg.id}
                          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                  {pkg.name}
                                </h3>
                                <Link
                                  href={`/packages/${pkg.id}/edit`}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  수정
                                </Link>
                              </div>
                              {pkg.items && pkg.items.length > 0 && (
                                <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                  {pkg.items.map((item, idx) => {
                                    // Format: "productName-quantity unit"
                                    // Example: "필러-1cc", "생리식염수-10ml", "주사기 1ml-1개", "니들 27GI-1 개"
                                    const quantityStr =
                                      item.quantity > 0
                                        ? `${item.quantity}${item.unit || ""}`
                                        : "";
                                    const itemText = quantityStr
                                      ? `${item.productName}-${quantityStr}`
                                      : item.productName;

                                    return (
                                      <span key={`${item.productId}-${idx}`}>
                                        {itemText}
                                        {idx < pkg.items!.length - 1 && " "}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="ml-4 flex items-center gap-2">
                              <button
                                onClick={handleDecreasePackage}
                                disabled={packageCount === 0}
                                className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                -
                              </button>
                              <span className="w-12 text-center text-sm font-semibold text-slate-900 dark:text-white">
                                {packageCount}
                              </span>
                              <button
                                onClick={() => handleAddToOutbound(pkg)}
                                className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {Math.ceil(filteredPackages.length / itemsPerPage) > 0 && (
                    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between">
                        {/* Page Info */}
                        <div className="text-sm">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {currentPage}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {" "}
                            /{" "}
                            {Math.ceil(
                              filteredPackages.length / itemsPerPage
                            )}{" "}
                            페이지
                          </span>
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center gap-2">
                          {/* Previous Button */}
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

                          {/* Page Numbers */}
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

                          {/* Next Button */}
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
                              Math.ceil(filteredPackages.length / itemsPerPage)
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
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Outbound Processing */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white">
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </div>
                  출고 처리
                </h2>
              </div>

              <div className="space-y-4">
                {/* Manager */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당자 *
                  </label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    required
                  />
                </div>

                {/* Status Checkboxes */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    상태
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={isDamaged}
                          onChange={(e) => setIsDamaged(e.target.checked)}
                          className="h-4 w-4 appearance-none rounded border border-slate-300 bg-white checked:bg-sky-500 checked:border-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0"
                        />
                        {isDamaged && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        파손
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={isDefective}
                          onChange={(e) => setIsDefective(e.target.checked)}
                          className="h-4 w-4 appearance-none rounded border border-slate-300 bg-white checked:bg-sky-500 checked:border-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0"
                        />
                        {isDefective && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        불량
                      </span>
                    </label>
                  </div>
                </div>

                {/* Additional Memo */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    추가 메모
                  </label>
                  <input
                    type="text"
                    value={additionalMemo}
                    onChange={(e) => setAdditionalMemo(e.target.value)}
                    placeholder="추가 메모를 입력하세요"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>

                {/* Scheduled Outbound List */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    출고 예정 목록 ({scheduledItems.length}개)
                  </h3>
                  {scheduledItems.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      패키지를 선택해주세요
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {(() => {
                        // Group items by package
                        const groupedByPackage = scheduledItems.reduce(
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
                              packageId: string;
                              packageName: string;
                              items: ScheduledItem[];
                            }
                          >
                        );

                        // Get packages in order (newest first) based on when they were added
                        // Since we add new items to the beginning of scheduledItems array,
                        // the first occurrence of each packageId represents the newest package
                        const packageOrder: string[] = [];
                        scheduledItems.forEach((item) => {
                          if (
                            item.packageId &&
                            !packageOrder.includes(item.packageId)
                          ) {
                            packageOrder.push(item.packageId);
                          }
                        });

                        // packageOrder already has newest first (because scheduledItems has newest items first)
                        // So we don't need to reverse - just map in the same order
                        const orderedPackages = packageOrder
                          .map((pkgId) => groupedByPackage[pkgId])
                          .filter(Boolean);

                        return orderedPackages.map((group, groupIdx) => {
                          // Count packages - use packageCounts to show how many times package was added
                          const packageCount =
                            packageCounts[group.packageId] || 1;
                          // Show only unique items (first occurrence of each product-batch combination)
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
                              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                            >
                              {/* Package Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {group.packageName}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-600 dark:text-slate-400">
                                    {packageCount}
                                    {unit}
                                  </span>
                                  <button
                                    onClick={() => {
                                      // Remove all items from this package
                                      setScheduledItems((prev) =>
                                        prev.filter(
                                          (item) =>
                                            item.packageId !== group.packageId
                                        )
                                      );
                                      setPackageCounts((prev) => ({
                                        ...prev,
                                        [group.packageId]: 0,
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

                              {/* Package Items (Components) */}
                              {Object.values(uniqueItems).length > 0 && (
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
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    scheduledItems.length === 0 ||
                    !managerName.trim()
                  }
                  className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "처리 중..." : "출고 처리"}
                </button>

                {/* Failed Items */}
                {failedItems.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">
                        실패한 항목 ({failedItems.length}개)
                      </h4>
                      <button
                        onClick={handleRetryAllFailed}
                        className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        전체 재시도
                      </button>
                    </div>
                    <div className="space-y-2">
                      {failedItems.map((item, idx) => (
                        <div
                          key={`failed-${item.productId}-${item.batchId}-${idx}`}
                          className="flex items-center justify-between rounded border border-red-200 bg-white p-2 dark:border-red-800 dark:bg-slate-900"
                        >
                          <span className="text-xs text-red-700 dark:text-red-400">
                            {item.packageName} - {item.productName}
                          </span>
                          <button
                            onClick={() => handleRetryFailed(item)}
                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400"
                          >
                            재시도
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
