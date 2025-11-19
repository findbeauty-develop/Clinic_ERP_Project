"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  batches: Batch[];
  isLowStock?: boolean;
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


export default function OutboundPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  
  const [activeTab, setActiveTab] = useState<"processing" | "history">("processing");
  const [products, setProducts] = useState<ProductForOutbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  
  // Outbound processing form state
  const [managerName, setManagerName] = useState("");
  const [isDamaged, setIsDamaged] = useState(false);
  const [isDefective, setIsDefective] = useState(false);
  const [additionalMemo, setAdditionalMemo] = useState("");
  const [memo, setMemo] = useState("");
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failedItems, setFailedItems] = useState<ScheduledItem[]>([]); // 출고 실패 항목

  // History tab state
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  useEffect(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (memberData) {
      const member = JSON.parse(memberData);
      setManagerName(member.full_name || member.member_id || "");
    }
  }, []);

  useEffect(() => {
    if (activeTab === "processing") {
      fetchProducts();
      setCurrentPage(1); // Reset to first page when search changes
    } else if (activeTab === "history") {
      fetchHistory();
    }
  }, [apiUrl, searchQuery, activeTab]);

  useEffect(() => {
    if (activeTab === "history" && historySearchQuery) {
      // Filter history data by search query
      filterHistory();
    } else if (activeTab === "history") {
      fetchHistory();
    }
  }, [historySearchQuery]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParam = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
      const data = await apiGet<ProductForOutbound[]>(`${apiUrl}/outbound/products${searchParam}`);
      
      // Format image URLs
      const formattedProducts = data.map((product) => ({
        ...product,
        productImage: formatImageUrl(product.productImage),
      }));
      
      setProducts(formattedProducts);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("제품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };


  const formatImageUrl = (imageUrl: string | null | undefined): string | null => {
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
      alert(`재고가 부족합니다. 최대 ${maxQuantity}${unit}까지 출고 가능합니다.`);
      return;
    }

    if (newQuantity <= 0) {
      // Remove from scheduled items
      setScheduledItems((prev) =>
        prev.filter(
          (item) => !(item.productId === productId && item.batchId === batchId)
        )
      );
      return;
    }

    // Update or add to scheduled items
    setScheduledItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === productId && item.batchId === batchId
      );
      
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQuantity };
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
        },
      ];
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
      alert("출고할 제품을 선택해주세요.");
      return;
    }

    if (!managerName.trim()) {
      alert("담당자를 입력해주세요.");
      return;
    }

    // 재고 부족 체크: 각 항목의 출고 수량이 재고를 초과하지 않는지 확인
    const stockCheck = scheduledItems.every((item) => {
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

    setSubmitting(true);
    try {
      const payload = {
        items: scheduledItems.map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          outboundQty: item.quantity,
          managerName: managerName.trim(),
          memo: memo.trim() || undefined,
          isDamaged,
          isDefective,
        })),
      };

      const response = await apiPost(`${apiUrl}/outbound/bulk`, payload);
      
      // 출고 후 목록 초기화 및 로그 기록
      console.log("출고 완료:", {
        timestamp: new Date().toISOString(),
        manager: managerName.trim(),
        items: scheduledItems.length,
        itemsDetail: scheduledItems,
      });
      
      // 성공한 항목과 실패한 항목 분리
      if (response && response.failedItems && response.failedItems.length > 0) {
        // 일부 항목만 실패한 경우
        const failed = scheduledItems.filter((item) =>
          response.failedItems.some(
            (failed: any) =>
              failed.productId === item.productId && failed.batchId === item.batchId
          )
        );
        setFailedItems(failed);
        const successCount = scheduledItems.length - failed.length;
        alert(`${successCount}개 항목 출고 완료, ${failed.length}개 항목 실패했습니다. 실패한 항목만 재시도할 수 있습니다.`);
      } else {
        // 모든 항목 성공
        alert("출고가 완료되었습니다.");
        setFailedItems([]);
      }
      
      // 성공한 항목만 제거, 실패한 항목은 유지
      if (response && response.failedItems && response.failedItems.length > 0) {
        const failedIds = new Set(
          response.failedItems.map((f: any) => `${f.productId}-${f.batchId}`)
        );
        setScheduledItems((prev) =>
          prev.filter(
            (item) => !failedIds.has(`${item.productId}-${item.batchId}`)
          )
        );
      } else {
        // 모든 항목 성공 시 초기화
        setScheduledItems([]);
        setAdditionalMemo("");
        setMemo("");
        setIsDamaged(false);
        setIsDefective(false);
      }
      
      // Refresh data
      fetchProducts();
    } catch (err: any) {
      console.error("Failed to process outbound", err);
      // 출고 실패 시 오류 메시지
      const errorMessage = err.response?.data?.message || err.message || "출고 처리 중 오류가 발생했습니다.";
      
      // 전체 실패 시 모든 항목을 실패 목록에 추가
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
      setAdditionalMemo("");
      setMemo("");
      setIsDamaged(false);
      setIsDefective(false);
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = products.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await apiGet<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${apiUrl}/outbound/history`);
      setHistoryData(data.items || []);
    } catch (err) {
      console.error("Failed to load history", err);
      setHistoryError("출고 내역을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const filterHistory = () => {
    if (!historySearchQuery.trim()) {
      fetchHistory();
      return;
    }
    // Filter will be handled by backend, but for now we can filter client-side
    fetchHistory();
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

          {/* Quick Outbound Bar */}
          {activeTab === "processing" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              바코드 스캐너로 빠른 출고
            </div>
          )}
        </header>

        {activeTab === "processing" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
            {/* Left Panel - Product/Package List */}
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                  전체 제품
                </h2>

                {/* Search Bar and Package Outbound Button */}
                <div className="mb-4 flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="제품명, 브랜드, 배치번호로 검색..."
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
                  <Link
                    href="/outbound/package"
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 flex items-center justify-center whitespace-nowrap"
                  >
                    패키지 출고
                  </Link>
                </div>

                {/* FIFO Warning */}
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                      <span className="text-xs font-bold">i</span>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      유효기한이 임박한 배치가 먼저 표시됩니다. 선입선출(FIFO)을 위해 상단의 배치부터 출고해주세요.
                    </p>
                  </div>
                </div>

                {/* Product List */}
                {loading ? (
                  <div className="py-8 text-center text-slate-500">로딩 중...</div>
                ) : error ? (
                  <div className="py-8 text-center text-red-500">{error}</div>
                ) : products.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    제품이 없습니다.
                  </div>
                ) : (
                    <>
                      <div className="space-y-4">
                        {currentProducts.map((product) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            scheduledItems={scheduledItems}
                            onQuantityChange={handleQuantityChange}
                          />
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

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // Show first page, last page, current page, and pages around current
                          if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
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
                        {startIndex + 1}-{Math.min(endIndex, products.length)} / {products.length}개 제품
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    마지막 업데이트: {new Date().toLocaleString("ko-KR")}
                  </span>
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


                  {/* Memo Field */}
          

                  {/* Scheduled Outbound List */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      출고 예정 목록
                    </h3>
                    {scheduledItems.length === 0 && failedItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                        출고할 제품을 선택해주세요.
                      </div>
                    ) : (
                      <div className="space-y-2">
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
                                  className="flex items-center justify-between rounded border border-red-200 bg-white px-2 py-1 text-sm dark:border-red-800 dark:bg-slate-900/60"
                                >
                                  <span className="text-red-700 dark:text-red-300">
                                    {item.productName} {item.batchNo} {item.quantity}
                                    {item.unit || "개"}
                                  </span>
                                  <button
                                    onClick={() => {
                                      // 실패한 항목을 다시 scheduledItems에 추가
                                      setScheduledItems((prev) => {
                                        const exists = prev.some(
                                          (i) =>
                                            i.productId === item.productId &&
                                            i.batchId === item.batchId
                                        );
                                        if (exists) return prev;
                                        return [...prev, item];
                                      });
                                      // 실패 목록에서 제거
                                      setFailedItems((prev) =>
                                        prev.filter(
                                          (f) =>
                                            !(
                                              f.productId === item.productId &&
                                              f.batchId === item.batchId
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
                                // 모든 실패 항목을 다시 scheduledItems에 추가
                                setScheduledItems((prev) => {
                                  const existingIds = new Set(
                                    prev.map(
                                      (i) => `${i.productId}-${i.batchId}`
                                    )
                                  );
                                  const newItems = failedItems.filter(
                                    (f) =>
                                      !existingIds.has(`${f.productId}-${f.batchId}`)
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

                        {/* 정상 출고 예정 목록 */}
                        {scheduledItems.map((item, index) => {
                          const isFailed = failedItems.some(
                            (f) =>
                              f.productId === item.productId &&
                              f.batchId === item.batchId
                          );
                          return (
                            <div
                              key={`${item.productId}-${item.batchId}`}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                                isFailed
                                  ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60"
                              }`}
                            >
                              <span
                                className={`text-sm ${
                                  isFailed
                                    ? "text-red-700 dark:text-red-300"
                                    : "text-slate-700 dark:text-slate-200"
                                }`}
                              >
                                {item.productName} {item.batchNo} {item.quantity}
                                {item.unit || "개"}
                                {isFailed && (
                                  <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                                    (실패)
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() =>
                                  handleQuantityChange(
                                    item.productId,
                                    item.batchId,
                                    item.batchNo,
                                    item.productName,
                                    item.unit || "개",
                                    item.quantity - 1
                                  )
                                }
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
              

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={
                        submitting ||
                        scheduledItems.length === 0 ||
                        scheduledItems.some((item) => {
                          const product = products.find((p) => p.id === item.productId);
                          if (!product) return true;
                          const batch = product.batches?.find((b) => b.id === item.batchId);
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
        ) : (
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
                        {items.map((item) => {
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
              const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
              const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
              if (dateA !== dateB) {
                return dateA - dateB;
              }
              // 2. 배치번호로 정렬 (같은 유효기간일 경우)
              return (a.batch_no || "").localeCompare(b.batch_no || "");
            })
            .map((batch) => {
            const scheduledItem = scheduledItems.find(
              (item) =>
                item.productId === product.id && item.batchId === batch.id
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
                  .replace(/\./g, "-")
                  .replace(/\s/g, "")
              : "00-00-00";

            return (
              <div
                key={batch.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60"
              >
                {/* Left Section - Product Info */}
                <div className="flex-1">
                  {/* Top Line - Product Name and Batch */}
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {product.productName}
                    </h3>
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      배치:{batch.batch_no}
                    </span>
                    {batch.isExpiringSoon && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                        유효기간 임박
                      </span>
                    )}
                    {product.isLowStock && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                        재고부족
                      </span>
                    )}
                  </div>

                  {/* Bottom Line - Details */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <span>
                      재고: {batch.qty.toString().padStart(2, "0")} {product.unit || "단위"}
                    </span>
                    {product.supplierName && (
                      <span>공급처:{product.supplierName}</span>
                    )}
                    <span>유효기한:{expiryDateStr}</span>
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
                        product.unit || "개",
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
                        product.unit || "개",
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
                        product.unit || "개",
                        Math.min(quantity + 1, batch.qty),
                        batch.qty
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    +
                  </button>
                  <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {product.unit || "단위"}
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
