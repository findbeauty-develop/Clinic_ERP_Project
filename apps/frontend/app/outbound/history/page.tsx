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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  useEffect(() => {
    // Search query o'zgarganda API chaqirish va page'ni reset qilish
    setCurrentPage(1);
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearchQuery]);

  useEffect(() => {
    // Page o'zgarganda API chaqirish
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      // Alohida history API endpoint ishlatish
      const queryParams = new URLSearchParams();
      if (historySearchQuery) {
        queryParams.append("search", historySearchQuery);
      }
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", itemsPerPage.toString());

      const url = `${apiUrl}/outbound/history?${queryParams.toString()}`;
      console.log("Fetching history from:", url);

      const data = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(url);

      console.log("History API response:", data);
      setHistoryData(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalItems(data.total || 0);
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
      // Backend response uses camelCase: outboundDate, managerName, etc.
      const outboundDateValue = item.outboundDate || item.outbound_date;
      if (!outboundDateValue) {
        return; // Skip items without date
      }

      const outboundDate = new Date(outboundDateValue);

      // Check if date is valid
      if (isNaN(outboundDate.getTime())) {
        return; // Skip invalid dates
      }

      const date = outboundDate.toISOString().split("T")[0];
      const time = outboundDate.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const manager = item.managerName || item.manager_name || "Unknown";
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header with Back Button */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Back Button */}
              <Link
                href="/outbound"
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>

              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                  출고 내역
                </h1>
                <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                  출고 내역을 조회하고 관리합니다.
                </p>
              </div>
            </div>
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
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                            {date} {time} {managerText}
                          </h3>
                          {/* 패키지 출고와 단품 출고 구분 표시 */}
                          {(items[0]?.outboundType ||
                            items[0]?.outbound_type) && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                (items[0].outboundType ||
                                  items[0].outbound_type) === "패키지"
                                  ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
                                  : (items[0].outboundType ||
                                        items[0].outbound_type) === "바코드"
                                    ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
                                    : "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                              }`}
                            >
                              {(items[0].outboundType ||
                                items[0].outbound_type) === "패키지"
                                ? `${items[0]?.packageName || items[0]?.package_name ? `: ${items[0].packageName || items[0].package_name}님 출고` : ""}`
                                : (items[0].outboundType ||
                                      items[0].outbound_type) === "바코드"
                                  ? "바코드 출고"
                                  : "단품 출고"}
                            </span>
                          )}
                        </div>
                        {(items[0]?.memo?.includes("교육") ||
                          items[0]?.memo?.includes("테스트")) && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            {items[0]?.memo?.includes("교육")
                              ? "교육용"
                              : "테스트"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {items.map((item: any) => {
                        const product = item.product;
                        const batch = item.batch;
                        // Backend response uses camelCase
                        const outboundDateValue =
                          item.outboundDate || item.outbound_date;
                        const outboundDate = outboundDateValue
                          ? new Date(outboundDateValue)
                          : new Date();
                        // Check if date is valid
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

                        // Calculate price (assuming salePrice * quantity)
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
                                  {/* 패키지 출고인 경우 패키지명 표시 */}
                                  {(item.outboundType || item.outbound_type) ===
                                    "패키지" &&
                                    (item.packageName || item.package_name) && (
                                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                        패키지:{" "}
                                        {item.packageName || item.package_name}
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
                                      {item.managerName || item.manager_name}에
                                      의한 출고
                                    </span>
                                    {(batch?.batchNo || batch?.batch_no) && (
                                      <span>
                                        (배치: {batch.batchNo || batch.batch_no}
                                        )
                                      </span>
                                    )}
                                    {(item.patientName ||
                                      item.patient_name) && (
                                      <span>
                                        - 환자:{" "}
                                        {item.patientName || item.patient_name}
                                      </span>
                                    )}
                                    {(item.chartNumber ||
                                      item.chart_number) && (
                                      <span>
                                        (차트번호:{" "}
                                        {item.chartNumber || item.chart_number})
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
          {totalPages > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                {/* Page Info */}
                <div className="text-sm">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {currentPage}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {" "}
                    / {totalPages} 페이지
                  </span>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
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
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
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

                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
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
      </div>
    </main>
  );
}
