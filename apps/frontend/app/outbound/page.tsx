"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (memberData) {
      const member = JSON.parse(memberData);
      setManagerName(member.full_name || member.member_id || "");
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    setCurrentPage(1); // Reset to first page when search changes
  }, [apiUrl, searchQuery]);

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
    newQuantity: number
  ) => {
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

      await apiPost(`${apiUrl}/outbound/bulk`, payload);
      
      alert("출고가 완료되었습니다.");
      
      // Reset form
      setScheduledItems([]);
      setAdditionalMemo("");
      setMemo("");
      setIsDamaged(false);
      setIsDefective(false);
      
      // Refresh products
      fetchProducts();
    } catch (err: any) {
      console.error("Failed to process outbound", err);
      alert(err.message || "출고 처리 중 오류가 발생했습니다.");
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
            {/* Left Panel - Product List */}
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                  전체 제품
                </h2>

                {/* Search Bar */}
                <div className="mb-4">
                  <div className="relative">
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
                        <input
                          type="checkbox"
                          checked={isDamaged}
                          onChange={(e) => setIsDamaged(e.target.checked)}
                          className="h-4 w-4 rounded border border-slate-300 bg-white text-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          파손
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isDefective}
                          onChange={(e) => setIsDefective(e.target.checked)}
                          className="h-4 w-4 rounded border border-slate-300 bg-white text-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0"
                        />
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
                      출고 예정 목록
                    </h3>
                    {scheduledItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                        출고할 제품을 선택해주세요.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scheduledItems.map((item, index) => (
                          <div
                            key={`${item.productId}-${item.batchId}`}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                          >
                            <span className="text-sm text-slate-700 dark:text-slate-200">
                              {item.productName} {item.batchNo} {item.quantity}
                              {item.unit || "개"}
                            </span>
                            <button
                              onClick={() =>
                                removeScheduledItem(item.productId, item.batchId)
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                        <div className="pt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          총 {scheduledItems.length}항목
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Memo Field */}
              

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || scheduledItems.length === 0}
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
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              출고 내역
            </h2>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              출고 내역 기능은 곧 추가될 예정입니다.
            </p>
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
    quantity: number
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {product.batches && product.batches.length > 0 && (
        <>
          {product.batches.map((batch) => {
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
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
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
                        Math.max(0, quantity - 1)
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
                        Math.min(newQty, batch.qty)
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
                        Math.min(quantity + 1, batch.qty)
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

