"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { apiGet } from "../../../lib/api";

type PackageOutboundHistoryItem = {
  id: string;
  outboundType: string;
  outboundDate: string;
  managerName: string;
  chartNumber?: string | null;
  packageQty: number;
  packageName?: string | null;
  packageItems: {
    productId: string;
    productName: string;
    brand: string;
    unit: string;
    quantity: number;
    salePrice: number;
  }[];
};

export default function OutboundHistoryPage() {
  const pathname = usePathname();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [historyData, setHistoryData] = useState<PackageOutboundHistoryItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchHistory();
  }, [apiUrl, currentPage, searchQuery]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("outboundType", "패키지"); // Only package outbounds
      if (searchQuery) {
        queryParams.append("search", searchQuery);
      }
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", itemsPerPage.toString());

      const url = `${apiUrl}/outbound/history?${queryParams.toString()}`;
      const data = await apiGet<{
        items: PackageOutboundHistoryItem[];
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

  // Calculate total price for a package outbound
  const calculateTotalPrice = (item: PackageOutboundHistoryItem) => {
    return item.packageItems.reduce((total, pkgItem) => {
      return total + pkgItem.salePrice * pkgItem.quantity * item.packageQty;
    }, 0);
  };

  // Group package outbounds by date, time (rounded to nearest minute), manager, and chart number
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: PackageOutboundHistoryItem[] } = {};

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

              // Calculate total package quantity for the group
              const totalPackageQty = items.reduce((sum, item) => {
                return sum + (item.packageQty || 1);
              }, 0);

              // Calculate total price for the group
              const totalPrice = items.reduce((sum, item) => {
                return sum + calculateTotalPrice(item);
              }, 0);

              // Collect all unique package items from all items in the group
              // Show product quantity per package (not multiplied by packageQty)
              const allPackageItems: {
                productId: string;
                productName: string;
                brand: string;
                unit: string;
                quantity: number;
                salePrice: number;
              }[] = [];

              items.forEach((item) => {
                item.packageItems.forEach((pkgItem) => {
                  const existingItem = allPackageItems.find(
                    (p) => p.productId === pkgItem.productId
                  );
                  if (existingItem) {
                    // If product already exists, add quantity (per package, not multiplied)
                    existingItem.quantity += pkgItem.quantity;
                  } else {
                    // Add new product item (quantity per package)
                    allPackageItems.push({
                      ...pkgItem,
                      quantity: pkgItem.quantity,
                    });
                  }
                });
              });

              return (
                <div
                  key={groupKey}
                  className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70 overflow-hidden"
                >
                  {/* Header */}
                  <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                    <div className="text-base font-semibold text-slate-900 dark:text-white">
                      {formatDateTime(firstItem.outboundDate)} {manager}님 출고
                      {chartNumber && <> 차트번호: {chartNumber}</>}
                    </div>
                  </div>

                  {/* Body - Package Items with Quantity and Price */}
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-wrap flex-1">
                        {allPackageItems.map((pkgItem, idx) => (
                          <div
                            key={`${pkgItem.productId}-${idx}`}
                            className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap"
                          >
                            <span className="font-medium">
                              {pkgItem.productName}
                            </span>
                            {pkgItem.brand && (
                              <span className="text-slate-500 dark:text-slate-400">
                                {" "}
                                ({pkgItem.brand})
                              </span>
                            )}
                            <span className="ml-1 text-slate-600 dark:text-slate-400">
                              {pkgItem.quantity} {pkgItem.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Total Quantity and Price (right aligned) */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          -{totalPackageQty}개
                        </div>
                        {totalPrice > 0 && (
                          <div className="text-base font-semibold text-slate-600 dark:text-slate-400">
                            ₩{totalPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
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
      </div>
    </main>
  );
}
