"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete } from "../../../lib/api";

type OutboundHistoryItem = {
  id: string;
  outboundType: string; // "패키지" or "제품"
  outboundDate: string;
  managerName: string;
  chartNumber?: string | null;
  packageQty?: number; // Only for package outbounds
  packageName?: string | null; // Only for package outbounds
  packageId?: string | null; // Package ID for package outbounds
  packageItems?: {
    productId: string;
    productName: string;
    brand: string;
    unit: string;
    quantity: number;
    salePrice: number;
  }[]; // Only for package outbounds
  // For regular outbounds
  outboundQty?: number;
  isDamaged?: boolean;
  isDefective?: boolean;
  product?: {
    id: string;
    name: string;
    brand: string;
    category: string;
    salePrice: number;
    unit: string;
  };
  batch?: {
    id: string;
    batchNo: string;
    expiryDate?: string | null;
  };
};

export default function OutboundHistoryPage() {
  const pathname = usePathname();
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [historyData, setHistoryData] = useState<OutboundHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Cancel outbound modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{
    outboundDate: string;
    managerName: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [apiUrl, currentPage, searchQuery]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      // Remove outboundType filter to get all outbounds (both package and regular)
      if (searchQuery) {
        queryParams.append("search", searchQuery);
      }
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", itemsPerPage.toString());

      const url = `${apiUrl}/outbound/history?${queryParams.toString()}`;
      const data = await apiGet<{
        items: OutboundHistoryItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(url);

      setHistoryData(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      console.error("Failed to load history", err);
      setError("출고 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // Format date and time
  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hour = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hour}:${minute}`;
    } catch {
      return dateString;
    }
  };

  // Format date only (YYYY-MM-DD)
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return dateString;
    }
  };

  // Format time only (HH:MM)
  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const hour = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      return `${hour}:${minute}`;
    } catch {
      return "";
    }
  };

  // Format product ID/code for display
  const formatProductId = (productId: string): string => {
    if (!productId) return "[000000000-001]";
    // Format UUID to shorter code: take first 9 chars and last 3 chars
    // Remove hyphens and format as [000000000-001]
    const cleaned = productId.replace(/-/g, "");
    if (cleaned.length >= 12) {
      const firstPart = cleaned.substring(0, 9).padStart(9, "0");
      const lastPart = cleaned.substring(cleaned.length - 3).padStart(3, "0");
      return `[${firstPart}-${lastPart}]`;
    }
    // Fallback: use first 12 chars
    return `[${cleaned.substring(0, 12).padStart(12, "0")}]`;
  };

  // Calculate total price for an outbound item
  const calculateTotalPrice = (item: OutboundHistoryItem) => {
    if (
      item.outboundType === "패키지" &&
      item.packageItems &&
      item.packageQty
    ) {
      // Package outbound
      return item.packageItems.reduce((total, pkgItem) => {
        return total + pkgItem.salePrice * pkgItem.quantity * item.packageQty!;
      }, 0);
    } else if (
      item.outboundType === "제품" &&
      item.product &&
      item.outboundQty
    ) {
      // Regular outbound
      return item.product.salePrice * item.outboundQty;
    }
    return 0;
  };

  // Handle cancel outbound
  const handleCancelOutbound = (outboundDate: string, managerName: string) => {
    setCancelTarget({ outboundDate, managerName });
    setShowCancelModal(true);
  };

  // Confirm cancel outbound
  const confirmCancelOutbound = async () => {
    if (!cancelTarget) return;

    setCancelling(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("outboundTimestamp", cancelTarget.outboundDate);
      queryParams.append("managerName", cancelTarget.managerName);

      await apiDelete(`${apiUrl}/outbound/cancel?${queryParams.toString()}`);

      // Close modal and redirect to outbound page
      setShowCancelModal(false);
      setCancelTarget(null);
      router.push("/outbound");
    } catch (err: any) {
      console.error("Failed to cancel outbound", err);
      alert(err?.message || "출고 취소 중 오류가 발생했습니다.");
    } finally {
      setCancelling(false);
    }
  };

  // Group outbounds by date, time (rounded to nearest minute), manager, and chart number
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: OutboundHistoryItem[] } = {};

    historyData.forEach((item) => {
      const outboundDate = new Date(item.outboundDate);
      if (isNaN(outboundDate.getTime())) return;

      // Round time to nearest minute for grouping
      const roundedTime = new Date(outboundDate);
      roundedTime.setSeconds(0, 0);
      roundedTime.setMilliseconds(0);

      const dateStr = roundedTime.toISOString().split("T")[0];
      const timeStr = roundedTime.toISOString().split("T")[1].substring(0, 5); // HH:MM
      const manager = item.managerName || "Unknown";
      const chartNumber = item.chartNumber || "";

      // Group key: date + time + manager + chart number
      const groupKey = `${dateStr} ${timeStr}|||${manager}|||${chartNumber}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    // Sort groups by date (newest first)
    return Object.entries(groups).sort((a, b) => {
      return b[0].localeCompare(a[0]);
    });
  }, [historyData]);

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

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="제품명, 담당자명, 차트번호로 검색..."
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
        </header>

        {/* History List */}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-slate-500">로딩 중...</div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-red-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            {error}
          </div>
        ) : groupedHistory.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-slate-500">출고 내역이 없습니다.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedHistory.map(([groupKey, items]) => {
              // Extract date, time, manager, and chart number from group key
              const [dateTimeStr, manager, chartNumber] = groupKey.split("|||");
              const firstItem = items[0];

              // Check if this is a package outbound group or regular outbound group
              const isPackageOutbound = firstItem.outboundType === "패키지";

              // Calculate total quantity for the group
              let totalQty = 0;
              if (isPackageOutbound) {
                // Package outbound: sum package quantities
                totalQty = items.reduce((sum, item) => {
                  return sum + (item.packageQty || 1);
                }, 0);
              } else {
                // Regular outbound: sum outbound quantities
                totalQty = items.reduce((sum, item) => {
                  return sum + (item.outboundQty || 0);
                }, 0);
              }

              // Calculate total price for the group
              const totalPrice = items.reduce((sum, item) => {
                return sum + calculateTotalPrice(item);
              }, 0);

              // Collect items for display
              const displayItems: {
                productId: string;
                productName: string;
                brand: string;
                unit: string;
                quantity: number;
                salePrice: number;
              }[] = [];

              if (isPackageOutbound) {
                // Package outbound: collect package items
                items.forEach((item) => {
                  if (item.packageItems) {
                    item.packageItems.forEach((pkgItem) => {
                      const existingItem = displayItems.find(
                        (p) => p.productId === pkgItem.productId
                      );
                      if (existingItem) {
                        existingItem.quantity += pkgItem.quantity;
                      } else {
                        displayItems.push({
                          ...pkgItem,
                          quantity: pkgItem.quantity,
                        });
                      }
                    });
                  }
                });
              } else {
                // Regular outbound: collect product items
                items.forEach((item) => {
                  if (item.product && item.outboundQty) {
                    const existingItem = displayItems.find(
                      (p) => p.productId === item.product!.id
                    );
                    if (existingItem) {
                      existingItem.quantity += item.outboundQty;
                    } else {
                      displayItems.push({
                        productId: item.product.id,
                        productName: item.product.name,
                        brand: item.product.brand || "",
                        unit: item.product.unit || "",
                        quantity: item.outboundQty,
                        salePrice: item.product.salePrice || 0,
                      });
                    }
                  }
                });
              }

              // Separate date and time for header display
              const outboundDate = formatDate(firstItem.outboundDate);
              const outboundTime = formatTime(firstItem.outboundDate);

              return (
                <div
                  key={groupKey}
                  className="rounded-xl border-2 border-blue-200 bg-white shadow-sm dark:border-blue-800 dark:bg-slate-900/70 overflow-hidden"
                >
                  {/* Header */}
                  <div className="border-b border-blue-100 px-6 py-4 dark:border-blue-900">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap flex-1">
                        {/* Date and Time */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {outboundDate}
                          </span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {outboundTime}
                          </span>
                        </div>

                        {/* Manager Name in Light Blue Box */}
                        <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-lg dark:bg-blue-900/30 dark:text-blue-300">
                          {manager}님
                        </span>

                        {/* Chart Number */}
                        {chartNumber && (
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            차트번호 {chartNumber}
                          </span>
                        )}

                        {/* Badges */}
                        {firstItem.isDefective && (
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            불량
                          </span>
                        )}

                        {firstItem.isDamaged && (
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                            파손
                          </span>
                        )}

                        {isPackageOutbound && (
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            패키지
                          </span>
                        )}
                      </div>

                      {/* Cancel Button */}
                      <button
                        onClick={() =>
                          handleCancelOutbound(firstItem.outboundDate, manager)
                        }
                        className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
                      >
                        출고 취소
                      </button>
                    </div>
                  </div>

                  {/* Body - Items displayed vertically */}
                  <div className="px-6 py-4 space-y-4">
                    {isPackageOutbound ? (
                      // Package outbound: Show package name and nested items
                      <>
                        {items.map((item, itemIdx) => {
                          if (!item.packageName || !item.packageItems)
                            return null;

                          return (
                            <div
                              key={`package-${itemIdx}`}
                              className="space-y-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0 pb-3 last:pb-0"
                            >
                              {/* Package Main Item */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="font-bold text-base text-slate-900 dark:text-white">
                                    {item.packageName}
                                  </span>
                                  {item.packageId && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {formatProductId(item.packageId)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-bold text-base text-slate-900 dark:text-white">
                                    {item.packageQty || 1}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    패키지 Set
                                  </span>
                                </div>
                              </div>

                              {/* Package Sub-items with bullet points */}
                              {item.packageItems &&
                                item.packageItems.length > 0 && (
                                  <div className="pl-4 space-y-1.5 mt-2">
                                    {item.packageItems.map(
                                      (pkgItem, pkgItemIdx) => (
                                        <div
                                          key={`pkg-item-${pkgItemIdx}`}
                                          className="flex items-center justify-between"
                                        >
                                          <div className="flex items-center gap-2 flex-1">
                                            <span className="text-slate-600 dark:text-slate-400 text-sm">
                                              •
                                            </span>
                                            <span className="text-sm text-slate-700 dark:text-slate-300">
                                              {pkgItem.productName}
                                            </span>
                                            {pkgItem.productId && (
                                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {formatProductId(
                                                  pkgItem.productId
                                                )}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                              {pkgItem.quantity}
                                            </span>
                                            {pkgItem.unit && (
                                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {pkgItem.unit}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      // Regular outbound: Show products vertically
                      <>
                        {displayItems.map((item, idx) => (
                          <div
                            key={`${item.productId}-${idx}`}
                            className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-b-0 pb-3 last:pb-0"
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-bold text-base text-slate-900 dark:text-white">
                                {item.productName}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatProductId(item.productId)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-base text-slate-900 dark:text-white">
                                -{item.quantity} {item.unit}
                              </span>
                              {/* {item.unit && (
                                
                                  {item.unit}
                               
                              )} */}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-bold text-slate-900 dark:text-white">
                  {currentPage}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  / {totalPages} 페이지
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
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
                  )
                )}

                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
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

        {/* Cancel Outbound Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4 dark:bg-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                출고 취소 확인
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                정말로 이 출고를 취소하시겠습니까?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelTarget(null);
                  }}
                  disabled={cancelling}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                >
                  취소
                </button>
                <button
                  onClick={confirmCancelOutbound}
                  disabled={cancelling}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancelling ? "처리 중..." : "확인"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
