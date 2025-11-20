"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../../../lib/api";
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
  managerName: string;
  returnDate: string;
  supplierName?: string | null;
  outboundDate?: string | null;
  outboundManager?: string | null;
};

type GroupedReturnHistory = {
  supplierName: string | null;
  managerName: string | null;
  outboundDate: string | null;
  outboundManager: string | null;
  returnDate: string | null;
  items: ReturnHistoryItem[];
  totalAmount: number;
};

export default function ReturnHistoryPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [historyData, setHistoryData] = useState<ReturnHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  useEffect(() => {
    fetchHistory();
  }, [apiUrl, page, debouncedSearchQuery]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParam = debouncedSearchQuery ? `&search=${encodeURIComponent(debouncedSearchQuery)}` : "";
      const response = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${apiUrl}/returns/history?page=${page}&limit=${limit}${searchParam}`);

      // Format history items
      const formattedItems: ReturnHistoryItem[] = response.items.map((item: any) => ({
        id: item.id,
        productId: item.product_id || item.productId,
        productName: item.product?.name || item.productName || "Unknown",
        brand: item.product?.brand || item.brand || "",
        batchNo: item.batch?.batch_no || item.batch_no || "",
        returnQty: item.return_qty || item.returnQty || 0,
        refundAmount: item.refund_amount || item.refundAmount || 0,
        totalRefund: item.total_refund || item.totalRefund || 0,
        managerName: item.manager_name || item.managerName || "",
        returnDate: item.return_date || item.returnDate || "",
        supplierName: item.product?.supplierProducts?.[0]?.supplier_id || item.supplier_id || item.supplier_name || item.supplierName || null,
        outboundDate: item.outbound?.outbound_date || item.outboundDate || null,
        outboundManager: item.outbound?.manager_name || item.outboundManager || null,
      }));

      setHistoryData(formattedItems);
      setTotalPages(response.totalPages || 1);
    } catch (err) {
      console.error("Failed to load return history", err);
      setError("반납 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const groupedHistory = useMemo(() => {
    const groups: Record<string, GroupedReturnHistory> = {};

    historyData.forEach((item) => {
      // Group by return date (bir vaqtda return qilingan maxsulotlar bitta card'da)
      // Agar return date bir xil bo'lsa, bitta card'da ko'rsatiladi
      const returnDateKey = item.returnDate 
        ? new Date(item.returnDate).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
        : "unknown";
      
      const key = `${returnDateKey}-${item.supplierName || "unknown"}-${item.managerName || "unknown"}`;
      
      if (!groups[key]) {
        groups[key] = {
          supplierName: item.supplierName ?? null,
          managerName: item.managerName ?? null,
          outboundDate: item.outboundDate ?? null,
          outboundManager: item.outboundManager ?? null,
          returnDate: item.returnDate ?? null,
          items: [],
          totalAmount: 0,
        };
      }
      groups[key].items.push(item);
      groups[key].totalAmount += item.totalRefund;
    });

    // Sort groups by return date (newest first)
    return Object.values(groups).sort((a, b) => {
      const dateA = a.returnDate ? new Date(a.returnDate).getTime() : 0;
      const dateB = b.returnDate ? new Date(b.returnDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [historyData]);

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
            <div className="text-sm text-slate-500 dark:text-slate-400">
              마지막 업데이트: {new Date().toLocaleString("ko-KR", { 
                year: "numeric", 
                month: "2-digit", 
                day: "2-digit", 
                hour: "2-digit", 
                minute: "2-digit" 
              })}
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
            <div className="text-slate-500 dark:text-slate-400">반납 내역이 없습니다.</div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedHistory.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
              >
                {/* Sana va 출고 담당자 - yonma-yon */}
                <div className="mb-4 flex items-center gap-3">
                  {group.returnDate && (
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(group.returnDate).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </div>
                  )}
                  {group.outboundManager && (
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {group.outboundManager}님 출고
                    </div>
                  )}
                </div>

                {/* 공급처 va 총 반납 금액 - qarama-qarshi */}
                <div className="mb-4 flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                  <div>
                    공급처: {group.supplierName || "공급처 없음"} {group.managerName || ""}
                  </div>
                  <div>
                    총 반납 금액: {group.totalAmount.toLocaleString()}원
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
              </div>
            ))}
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

