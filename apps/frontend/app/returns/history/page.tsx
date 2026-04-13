"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "../../../lib/api";
import { useDebounce } from "../../../hooks/useDebounce";

type ReturnHistoryItem = {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  batchNo: string;
  returnQty: number;
  refundAmount: number;
  totalRefund: number;
  managerName: string; // Return qilgan manager nomi
  returnDate: string;
  supplierName?: string | null; // Supplier company name
  supplierManagerName?: string | null; // Supplier manager name
  supplierManagerPosition?: string | null; // Supplier manager position
  outboundDate?: string | null;
  outboundManager?: string | null;
  supplierStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null; // Supplier notification status
  supplierUsesPlatform?: boolean;
  clinicConfirmedAt?: string | null;
  acceptedAt?: string | null; // SupplierReturnNotification.accepted_at
  cancelledAt?: string | null;
};

type GroupedReturnHistory = {
  supplierName: string | null;
  supplierManagerName: string | null; // Supplier manager name
  supplierManagerPosition: string | null; // Supplier manager position
  managerName: string | null; // Return qilgan manager nomi
  outboundDate: string | null;
  outboundManager: string | null;
  returnDate: string | null;
  items: ReturnHistoryItem[];
  totalAmount: number;
  supplierStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null; // Group status (all items must be ACCEPTED to show 완료)
  supplierUsesPlatform?: boolean;
  clinicConfirmedAt?: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
};

export default function ReturnHistoryPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  const [historyData, setHistoryData] = useState<ReturnHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Cache for return history to prevent duplicate requests
  const historyCacheRef = useRef<{
    data: ReturnHistoryItem[];
    totalPages: number;
    timestamp: number;
    page: number;
    searchQuery: string;
  } | null>(null);
  const CACHE_TTL = 0; // ✅ Cache disabled for real-time data accuracy

  // Cache invalidation helper
  const invalidateCache = useCallback(() => {
    historyCacheRef.current = null;
  }, []);

  const fetchHistory = useCallback(async () => {
    const cacheKey = debouncedSearchQuery.trim() || "";
    // Check cache first
    if (
      historyCacheRef.current &&
      historyCacheRef.current.page === page &&
      historyCacheRef.current.searchQuery === cacheKey &&
      Date.now() - historyCacheRef.current.timestamp < CACHE_TTL
    ) {
      setHistoryData(historyCacheRef.current.data);
      setTotalPages(historyCacheRef.current.totalPages);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const searchParam = debouncedSearchQuery
        ? `&search=${encodeURIComponent(debouncedSearchQuery)}`
        : "";

      // ✅ Universal cache busting for all browsers
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);

      const response = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(
        `${apiUrl}/returns/history?page=${page}&limit=${limit}${searchParam}&_t=${timestamp}&_r=${random}`
      );

      // Format history items
      const formattedItems: ReturnHistoryItem[] = response.items.map(
        (item: any) => {
          // Get supplier notification status (latest notification)
          const latestNotification = item.supplierReturnNotifications?.[0];
          const supplierStatus = latestNotification?.status || null;
          const acceptedAtRaw = latestNotification?.accepted_at;

          return {
            id: item.id,
            productId: item.product_id || item.productId,
            productName: item.product?.name || item.productName || "Unknown",
            brand: item.product?.brand || item.brand || "",
            batchNo: item.batch?.batch_no || item.batch_no || "",
            returnQty: item.return_qty || item.returnQty || 0,
            refundAmount: item.refund_amount || item.refundAmount || 0,
            totalRefund: item.total_refund || item.totalRefund || 0,
            managerName: item.manager_name || item.managerName || "", // Return qilgan manager nomi
            returnDate: item.return_date || item.returnDate || "",
            supplierName: item.supplier_name || item.supplierName || null, // Supplier company name
            supplierManagerName: item.supplier_manager_name || null, // Supplier manager name
            supplierManagerPosition: item.supplier_manager_position || null, // Supplier manager position
            outboundDate:
              item.outbound?.outbound_date || item.outboundDate || null,
            outboundManager:
              item.outbound?.manager_name || item.outboundManager || null,
            supplierStatus: supplierStatus,
            supplierUsesPlatform: item.supplier_uses_platform === true,
            clinicConfirmedAt: item.clinic_confirmed_at
              ? String(item.clinic_confirmed_at)
              : null,
            acceptedAt: acceptedAtRaw ? String(acceptedAtRaw) : null,
            cancelledAt: item.cancelled_at ? String(item.cancelled_at) : null,
          };
        }
      );

      setHistoryData(formattedItems);
      setTotalPages(response.totalPages || 1);
      // Update cache
      historyCacheRef.current = {
        data: formattedItems,
        totalPages: response.totalPages || 1,
        timestamp: Date.now(),
        page,
        searchQuery: cacheKey,
      };
    } catch (err) {
      console.error("Failed to load return history", err);
      setError("반납 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, page, debouncedSearchQuery, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ✅ Safari bfcache handler: Force refresh when page restored from back/forward cache
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page loaded from bfcache (Safari back button)
        console.log("[Returns History] Loaded from bfcache - forcing refresh");
        invalidateCache();
        fetchHistory();
      }
    };

    const handlePageHide = () => {
      // Mark page as potentially cached
      if (typeof window !== "undefined") {
        sessionStorage.setItem("returns_history_was_cached", "true");
      }
    };

    window.addEventListener("pageshow", handlePageShow as EventListener);
    window.addEventListener("pagehide", handlePageHide);

    // Check if returning from cache or force refresh flag
    if (typeof window !== "undefined") {
      const wasCached = sessionStorage.getItem("returns_history_was_cached");
      const forceRefresh = sessionStorage.getItem(
        "returns_history_force_refresh"
      );

      if (wasCached === "true") {
        sessionStorage.removeItem("returns_history_was_cached");
        invalidateCache();
        fetchHistory();
      }

      if (forceRefresh === "true") {
        sessionStorage.removeItem("returns_history_force_refresh");
        invalidateCache();
        fetchHistory();
      }
    }

    return () => {
      window.removeEventListener("pageshow", handlePageShow as EventListener);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [fetchHistory, invalidateCache]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, GroupedReturnHistory> = {};

    historyData.forEach((item) => {
      // Group by return ID - har bir return transaction alohida card'da
      // Agar bir xil return ID bo'lsa, bitta card'da ko'rsatiladi (bir vaqtda return qilingan maxsulotlar)
      // Har bir yangi return transaction yangi card'da ko'rinadi
      const key = item.id; // Use return ID as the grouping key

      if (!groups[key]) {
        groups[key] = {
          supplierName: item.supplierName ?? null,
          supplierManagerName: item.supplierManagerName ?? null,
          supplierManagerPosition: item.supplierManagerPosition ?? null,
          managerName: item.managerName ?? null, // Return qilgan manager nomi
          outboundDate: item.outboundDate ?? null,
          outboundManager: item.outboundManager ?? null,
          returnDate: item.returnDate ?? null,
          items: [],
          totalAmount: 0,
          supplierStatus: null,
          supplierUsesPlatform: item.supplierUsesPlatform ?? false,
          clinicConfirmedAt: item.clinicConfirmedAt ?? null,
          acceptedAt: item.acceptedAt ?? null,
          cancelledAt: item.cancelledAt ?? null,
        };
      }
      groups[key].items.push(item);
      if (item.cancelledAt) {
        groups[key].cancelledAt = item.cancelledAt;
      }
      groups[key].totalAmount += item.totalRefund;

      // Update group status: if ANY item is ACCEPTED, show ACCEPTED; otherwise show PENDING if any is PENDING
      const allStatuses = groups[key].items
        .map((i) => i.supplierStatus)
        .filter((s) => s !== null && s !== undefined);

      if (allStatuses.length > 0) {
        const anyAccepted = allStatuses.some((s) => s === "ACCEPTED");
        const anyPending = allStatuses.some((s) => s === "PENDING");

        // Priority: If ANY item is ACCEPTED, show ACCEPTED (완료)
        // Otherwise, if ANY is PENDING, show PENDING (요청중)
        if (anyAccepted) {
          groups[key].supplierStatus = "ACCEPTED";
        } else if (anyPending) {
          groups[key].supplierStatus = "PENDING";
        } else {
          groups[key].supplierStatus = allStatuses[0] as any;
        }
      }
    });

    // Sort groups by return date (newest first)
    return Object.values(groups).sort((a, b) => {
      const dateA = a.returnDate ? new Date(a.returnDate).getTime() : 0;
      const dateB = b.returnDate ? new Date(b.returnDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [historyData]);

  const formatShortDone = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const isReturnComplete = (g: GroupedReturnHistory) =>
    g.supplierStatus === "ACCEPTED" || !!g.clinicConfirmedAt;

  const showManualReturnActions = (g: GroupedReturnHistory) =>
    g.supplierUsesPlatform === false && !isReturnComplete(g) && !g.cancelledAt;

  const handleManualComplete = async (returnId: string) => {
    if (!confirm("반납을 완료 처리할까요?")) return;
    setActionLoadingId(returnId);
    try {
      await apiPost(`${apiUrl}/returns/${returnId}/manual-complete`, {});
      invalidateCache();
      await fetchHistory();
    } catch (e: any) {
      alert(e?.message || "처리에 실패했습니다.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleManualCancel = async (returnId: string) => {
    if (
      !confirm("반납을 취소하면 미반납 수량에 다시 반영됩니다. 취소할까요?")
    ) {
      return;
    }
    setActionLoadingId(returnId);
    try {
      await apiPost(`${apiUrl}/returns/${returnId}/manual-cancel`, {});
      invalidateCache();
      await fetchHistory();
    } catch (e: any) {
      alert(e?.message || "처리에 실패했습니다.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                반납 관리
              </h1>
              <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                팁 제품 반납을 처리하고 할인을 적용합니다.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Refresh Button */}
              <button
                onClick={() => {
                  invalidateCache();
                  fetchHistory();
                }}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600"
                title="데이터 새로고침"
              >
                <svg
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {loading ? "새로고침 중..." : "새로고침"}
              </button>

              <div className="text-sm text-slate-500 dark:text-slate-400">
                마지막 업데이트:{" "}
                {new Date().toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800">
          <Link
            href="/returns"
            className="px-4 py-2 text-sm font-semibold transition border-b-2 border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            반납 처리
          </Link>
          <div className="px-4 py-2 text-sm font-semibold border-b-2 border-sky-500 text-sky-600 dark:text-sky-400">
            반납 내역
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
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
            <input
              type="text"
              placeholder="제품명, 브랜드로 검색..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // Reset to first page when search changes (debounced)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        {/* History List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : groupedHistory.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500 dark:text-slate-400">
              반납 내역이 없습니다.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedHistory.map((group, groupIndex) => {
              const returnRowId = group.items[0]?.id;
              const cancelled = !!group.cancelledAt;
              const complete = isReturnComplete(group);
              const manualActions = showManualReturnActions(group);
              const doneAt = group.acceptedAt || group.clinicConfirmedAt;

              return (
                <div
                  key={groupIndex}
                  className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
                >
                  {/* Sana va 출고 담당자 - yonma-yon */}
                  <div className="mb-0.1 flex items-center gap-3">
                    {group.returnDate && (
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {new Date(group.returnDate).toLocaleDateString(
                          "ko-KR",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          }
                        )}
                      </div>
                    )}
                    {group.managerName && (
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {group.managerName}님 출고
                      </div>
                    )}
                  </div>

                  {/* 공급처 va 총 반납 금액 - qarama-qarshi */}
                  <div className="mb-4 flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                    <div>
                      공급처: {group.supplierName || "공급처 없음"}{" "}
                      {group.supplierManagerName && (
                        <>
                          {group.supplierManagerName}
                          {group.supplierManagerPosition
                            ? ` ${group.supplierManagerPosition}`
                            : " 대리"}
                        </>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div>
                        {cancelled ? (
                          <span className="inline-flex rounded-full bg-red-500 px-3 py-1 text-sm font-semibold text-white dark:bg-red-600">
                            {" "}
                            반납 취소
                          </span>
                        ) : complete ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            반납 완료
                          </span>
                        ) : group.supplierStatus === "REJECTED" ? (
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium dark:bg-red-900/30 dark:text-red-400">
                            반려
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium dark:bg-yellow-900/30 dark:text-yellow-400">
                            반납 진행중
                          </span>
                        )}
                      </div>
                      <div className="text-right text-sm font-semibold">
                        총 반납 금액: {group.totalAmount.toLocaleString()}원
                      </div>
                      {cancelled && group.cancelledAt ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          취소 {formatShortDone(group.cancelledAt)}
                        </p>
                      ) : complete && doneAt ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          완료 {formatShortDone(doneAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Items List - Card ichida */}
                  <div className="space-y-2">
                    {group.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900/50"
                      >
                        <div className="flex items-center justify-between gap-x-4">
                          {/* Maxsulot nomi */}
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.productName}
                          </div>

                          {/* Brend */}
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            브랜드: {item.brand}
                          </div>

                          {/* Har birining narxi */}
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            개당 금액: {item.refundAmount.toLocaleString()}
                          </div>

                          {/* Qaytarilish miqdori */}
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            반납 수량: {item.returnQty}개
                          </div>

                          {/* Qaytarilganda hammasining narxi */}
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            총 반납 금액: {item.totalRefund.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {manualActions && returnRowId ? (
                    <div className="mt-4 flex flex-col items-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-600">
                      {actionLoadingId === returnRowId ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          처리 중...
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === returnRowId}
                          onClick={() => handleManualCancel(returnRowId)}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          반납 취소
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === returnRowId}
                          onClick={() => handleManualComplete(returnRowId)}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        >
                          반납 완료
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination - Page oxirida */}
        {!loading && !error && groupedHistory.length > 0 && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            >
              이전
            </button>
            <span className="px-4 text-sm font-medium text-slate-600 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
