"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../../../lib/api";

export default function OutboundHistoryPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  // History state
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  useEffect(() => {
    fetchHistory();
  }, [apiUrl]);

  useEffect(() => {
    // Search query o'zgarganda API chaqirish
    fetchHistory();
  }, [historySearchQuery]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      // Alohida history API endpoint ishlatish
      const data = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${apiUrl}/outbound/history?${historySearchQuery ? `search=${encodeURIComponent(historySearchQuery)}&` : ''}page=1&limit=100`);
      setHistoryData(data.items || []);
    } catch (err) {
      console.error("Failed to load history", err);
      setHistoryError("출고 내역을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Group history by date and manager
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    
    historyData.forEach((item) => {
      // Check if outbound_date exists and is valid
      if (!item.outbound_date) {
        return; // Skip items without date
      }

      const outboundDate = new Date(item.outbound_date);
      
      // Check if date is valid
      if (isNaN(outboundDate.getTime())) {
        return; // Skip invalid dates
      }

      const date = outboundDate.toISOString().split("T")[0];
      const time = outboundDate.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const manager = item.manager_name || "Unknown";
      const groupKey = `${date} ${time} ${manager}님 출고`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    return Object.entries(groups).sort((a, b) => {
      // Sort by date (newest first)
      return b[0].localeCompare(a[0]);
    });
  }, [historyData]);

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                출고 내역
              </h1>
              <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                출고 내역을 조회하고 관리합니다.
              </p>
            </div>
            <Link
              href="/outbound"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              출고 처리로 이동
            </Link>
          </div>
        </header>

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
                  {historyData.length}건
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
                onChange={(e) => setHistorySearchQuery(e.target.value)}
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
                const [date, time, managerText] = groupKey.split(" ");
                const manager = managerText.replace("님 출고", "");
                
                return (
                  <div
                    key={groupKey}
                    className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    {/* Group Header */}
                    <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                          {date} {time} {managerText}
                        </h3>
                        {(items[0]?.memo?.includes("교육") || items[0]?.memo?.includes("테스트")) && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            {items[0]?.memo?.includes("교육") ? "교육용" : "테스트"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {items.map((item: any) => {
                        const product = item.product;
                        const batch = item.batch;
                        const outboundDate = item.outbound_date ? new Date(item.outbound_date) : new Date();
                        // Check if date is valid
                        const isValidDate = !isNaN(outboundDate.getTime());
                        const month = isValidDate ? outboundDate.getMonth() + 1 : new Date().getMonth() + 1;
                        const day = isValidDate ? outboundDate.getDate() : new Date().getDate();
                        const hasSpecialNote = item.is_damaged || item.is_defective || item.memo;
                        const specialNote = item.is_damaged
                          ? "파손"
                          : item.is_defective
                          ? "불량"
                          : item.memo?.includes("떨어뜨림")
                          ? "떨어뜨림"
                          : item.memo?.includes("반품")
                          ? "반품"
                          : item.memo || null;

                        // Calculate price (assuming sale_price * quantity)
                        const price = product?.sale_price
                          ? product.sale_price * item.outbound_qty
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
                                  {batch?.batch_no && (
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                      ({batch.batch_no})
                                    </span>
                                  )}
                                  {hasSpecialNote && (
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                                      <span className="text-xs font-bold">!</span>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                                  <div>
                                    {month}월 {day}일
                                  </div>
                                  <div>
                                    {item.manager_name}에 의한 출고
                                    {batch?.batch_no && ` (배치: ${batch.batch_no})`}
                                    {item.patient_name && ` - 환자: ${item.patient_name}`}
                                    {item.chart_number && ` (차트번호: ${item.chart_number})`}
                                    {item.memo && !item.is_damaged && !item.is_defective && ` - ${item.memo}`}
                                  </div>
                                  {specialNote && (
                                    <div className="font-semibold text-red-600 dark:text-red-400">
                                      특이사항 {specialNote}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                <div className="text-base font-bold text-slate-900 dark:text-white">
                                  -{item.outbound_qty}
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
        </div>
      </div>
    </main>
  );
}

