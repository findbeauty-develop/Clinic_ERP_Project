"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";

type BatchDetail = {
  batchId: string;
  batchNo: string;
  outboundId: string;
  outboundQty: number;
  returnedQty: number;
  availableQty: number;
  outboundDate: string;
  managerName: string;
};

type AvailableProduct = {
  productId: string;
  productName: string;
  brand: string;
  unit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  storageLocation: string | null;
  unreturnedQty: number;
  emptyBoxes?: number; // 사용 단위 mantiqi: bo'sh box'lar soni
  refundAmount: number;
  batches: BatchDetail[];
};

type SelectedReturnItem = {
  productId: string;
  productName: string;
  brand: string;
  batchId: string;
  batchNo: string;
  outboundId: string;
  supplierId: string | null;
  supplierName: string | null;
  managerName: string | null; // Outbound'dan olinadi
  returnQty: number;
  refundAmount: number;
  totalRefund: number;
};

type GroupedReturnItem = {
  supplierId: string | null;
  supplierName: string | null;
  managerName: string | null;
  items: SelectedReturnItem[];
  totalAmount: number;
};

export default function ReturnsPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [products, setProducts] = useState<AvailableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  
  // Return processing state
  const [managerName, setManagerName] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedReturnItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (memberData) {
      const member = JSON.parse(memberData);
      setManagerName(member.full_name || member.member_id || "");
    }
  }, []);

  useEffect(() => {
    fetchAvailableProducts();
  }, [apiUrl, debouncedSearchQuery]);

  const fetchAvailableProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParam = debouncedSearchQuery ? `?search=${encodeURIComponent(debouncedSearchQuery)}` : "";
      const data = await apiGet<AvailableProduct[]>(`${apiUrl}/returns/available-products${searchParam}`);
      setProducts(data || []);
    } catch (err) {
      setError("반납 가능한 제품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };


  const handleQuantityChange = (productId: string, delta: number) => {
    const product = products.find((p) => p.productId === productId);
    if (!product) return;

    // emptyBoxes mavjud bo'lsa, uni ishlatish, aks holda unreturnedQty
    const maxQty = product.emptyBoxes !== undefined ? product.emptyBoxes : product.unreturnedQty;

    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === productId
      );

      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const newQty = Math.max(0, Math.min(existing.returnQty + delta, maxQty));
        
        if (newQty === 0) {
          // Remove item if quantity is 0
          return prev.filter((_, i) => i !== existingIndex);
        }

        const updated = {
          ...existing,
          returnQty: newQty,
          totalRefund: newQty * existing.refundAmount,
        };
        const newItems = [...prev];
        newItems[existingIndex] = updated;
        return newItems;
      } else {
        // Add new item
        if (delta > 0) {
          // Use first batch for initial item (will be distributed later)
          const firstBatch = product.batches[0];
          if (!firstBatch) return prev;

          // emptyBoxes mavjud bo'lsa, uni ishlatish, aks holda unreturnedQty
          const maxQty = product.emptyBoxes !== undefined ? product.emptyBoxes : product.unreturnedQty;

          const newItem: SelectedReturnItem = {
            productId: product.productId,
            productName: product.productName,
            brand: product.brand,
            batchId: firstBatch.batchId,
            batchNo: firstBatch.batchNo,
            outboundId: firstBatch.outboundId,
            supplierId: product.supplierId,
            supplierName: product.supplierName,
            managerName: firstBatch.managerName || null,
            returnQty: Math.min(delta, maxQty),
            refundAmount: product.refundAmount,
            totalRefund: Math.min(delta, maxQty) * product.refundAmount,
          };
          return [...prev, newItem];
        }
        return prev;
      }
    });
  };

  const removeSelectedItem = (productId: string) => {
    setSelectedItems((prev) => {
      return prev.filter((item) => item.productId !== productId);
    });
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, GroupedReturnItem> = {};

    selectedItems.forEach((item) => {
      // Group by manager only
      const key = item.managerName || "unknown";
      if (!groups[key]) {
        groups[key] = {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          managerName: item.managerName,
          items: [],
          totalAmount: 0,
        };
      }
      groups[key].items.push(item);
      groups[key].totalAmount += item.totalRefund;
    });

    // Sort groups by manager name
    return Object.values(groups).sort((a, b) => {
      return (a.managerName || "").localeCompare(b.managerName || "");
    });
  }, [selectedItems]);

  const totalItems = selectedItems.length;
  const totalAmount = selectedItems.reduce((sum, item) => sum + item.totalRefund, 0);

  const handleProcessReturn = async () => {
    if (!managerName.trim()) {
      alert("담당자 이름을 입력해주세요.");
      return;
    }

    if (selectedItems.length === 0) {
      alert("반납할 제품을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      // Distribute return quantity across batches (FEFO - First Expired First Out)
      const returnItems: Array<{
        productId: string;
        batchId: string;
        outboundId: string;
        returnQty: number;
      }> = [];

      selectedItems.forEach((selectedItem) => {
        const product = products.find((p) => p.productId === selectedItem.productId);
        if (!product) return;

        // Sort batches by expiry date (FEFO) - oldest first
        const sortedBatches = [...product.batches].sort((a, b) => {
          const dateA = new Date(a.outboundDate).getTime();
          const dateB = new Date(b.outboundDate).getTime();
          return dateA - dateB;
        });

        let remainingQty = selectedItem.returnQty;

        // Distribute quantity across batches
        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;

          const batchReturnQty = Math.min(remainingQty, batch.availableQty);
          if (batchReturnQty > 0) {
            returnItems.push({
              productId: selectedItem.productId,
              batchId: batch.batchId,
              outboundId: batch.outboundId,
              returnQty: batchReturnQty,
            });
            remainingQty -= batchReturnQty;
          }
        }
      });

      // Backend'da har bir item uchun empty box return ekanligini avtomatik tekshiradi
      const response = await apiPost(`${apiUrl}/returns/process`, {
        managerName: managerName.trim(),
        memo: "", // Backend'da avtomatik aniqlanadi
        items: returnItems,
      });

      if (response.success) {
        alert("반납이 성공적으로 처리되었습니다.");
        
        // Clear selected items
        setSelectedItems([]);
        
        // Refresh products from backend (real data) - optimistic update'ni olib tashladik, faqat backend'dan olamiz
        await fetchAvailableProducts();
      } else {
        alert(`반납 처리 중 오류가 발생했습니다: ${response.message || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`반납 처리 중 오류가 발생했습니다: ${err.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReturn = () => {
    if (selectedItems.length > 0) {
      if (confirm("반납을 취소하시겠습니까?")) {
        setSelectedItems([]);
      }
    }
  };

  return (
    <div className="h-screen bg-slate-50 p-6 dark:bg-slate-900 overflow-hidden">
      <div className="mx-auto max-w-7xl h-full flex flex-col">
        {/* Header */}
        <header className="mb-6 flex-shrink-0">
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
        <div className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="px-4 py-2 text-sm font-semibold border-b-2 border-sky-500 text-sky-600 dark:text-sky-400">
            반납 처리
          </div>
          <Link
            href="/returns/history"
            className="px-4 py-2 text-sm font-semibold transition border-b-2 border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            반납 내역
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-0">
            {/* Left Panel - Product List */}
            <div className="lg:col-span-2 flex flex-col min-h-0">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Information Box */}
                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                  최근 30일 내 출고된 '팁' 카테고리 제품 및 반납 가능으로 설정된 제품들이 자동으로 표시됩니다.
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
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Product List */}
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                    {error}
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-slate-500 dark:text-slate-400">
                      반납 가능한 제품이 없습니다.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200 dark:[&::-webkit-scrollbar-thumb]:border-slate-700">
                    {products
                      .filter((product) => {
                        // Agar 미반납 수량 0 bo'lsa, product'ni ko'rsatma
                        const displayQty = product.emptyBoxes !== undefined ? product.emptyBoxes : product.unreturnedQty;
                        return displayQty > 0;
                      })
                      .map((product) => {
                      // Calculate total selected quantity for this product
                      const totalSelectedQty = selectedItems
                        .filter((item) => item.productId === product.productId)
                        .reduce((sum, item) => sum + item.returnQty, 0);

                      return (
                        <div
                          key={product.productId}
                          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="flex items-start gap-4">
                            {/* Left Column - Product Info */}
                            <div className="flex-1">
                              {/* Product Name with Quantity Controls */}
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-lg font-bold text-slate-900 dark:text-white">
                                  {product.productName}
                                </span>
                                
                                <div className="flex items-center gap-3">
                                  {/* Unreturned Quantity Badge */}
                                  <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                    미반납 수량: {product.emptyBoxes !== undefined ? product.emptyBoxes : product.unreturnedQty}
                                    {product.unit || "개"}
                                  </span>
                                  
                                  {/* Quantity Controls */}
                                  <div className="flex items-center gap-2">
                                  {(() => {
                                    const selectedItem = selectedItems.find(
                                      (item) => item.productId === product.productId
                                    );
                                    const currentQty = selectedItem?.returnQty || 0;
                                    // emptyBoxes mavjud bo'lsa, uni ishlatish, aks holda unreturnedQty
                                    const maxQty = product.emptyBoxes !== undefined ? product.emptyBoxes : product.unreturnedQty;

                                    return (
                                      <>
                                        <button
                                          onClick={() => handleQuantityChange(product.productId, -1)}
                                          disabled={currentQty === 0}
                                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                        >
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                          </svg>
                                        </button>
                                        <input
                                          type="number"
                                          min="0"
                                          max={maxQty}
                                          value={currentQty === 0 ? 0 : currentQty}
                                          onChange={(e) => {
                                            const inputValue = e.target.value;
                                            if (inputValue === "") {
                                              // Allow empty input for user to type
                                              if (currentQty > 0) {
                                                removeSelectedItem(product.productId);
                                              }
                                              return;
                                            }
                                            const newQty = Math.max(0, Math.min(parseInt(inputValue) || 0, maxQty));
                                            if (newQty === 0) {
                                              removeSelectedItem(product.productId);
                                            } else {
                                              const delta = newQty - currentQty;
                                              if (delta !== 0) {
                                                handleQuantityChange(product.productId, delta);
                                              }
                                            }
                                          }}
                                          className="h-9 w-20 rounded-lg border border-slate-300 bg-white text-center text-sm font-medium text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                        <button
                                          onClick={() => handleQuantityChange(product.productId, 1)}
                                          disabled={currentQty >= maxQty}
                                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                        >
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                          </svg>
                                        </button>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                          {product.unit || "개"}
                                        </span>
                                      </>
                                    );
                                  })()}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Product Details Row */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                                <span>브랜드: {product.brand}</span>
                                
                                {product.batches[0]?.managerName && (
                                  <span>담당자: {product.batches[0].managerName}</span>
                                )}
                                
                                <span>개당 금액: {product.refundAmount.toLocaleString()}원</span>
                                
                                <span>반납품 위치: {product.storageLocation || "-"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Return Processing */}
            <div className="lg:col-span-1 flex flex-col min-h-0">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 flex-1 flex flex-col min-h-0">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">반납 처리</h2>
                  </div>
              
                </div>

                {/* Manager Input */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      반납 담당자
                    </label>
                    <button className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                      성함 선택
                    </button>
                  </div>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="담당자 이름 입력"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Selected Items - Order Processing */}
                {selectedItems.length === 0 ? (
                  <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800 flex-1 flex items-center justify-center">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      반납할 제품을 선택해주세요.
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 flex-1 space-y-4 overflow-y-auto pr-2 min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200 dark:[&::-webkit-scrollbar-thumb]:border-slate-700">
                    <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      주문 처리
                    </div>
                    {groupedItems.map((group, groupIndex) => (
                      <div
                        key={groupIndex}
                        className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-700">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate flex-1 min-w-0">
                            {group.supplierName || "공급처 없음"} {group.managerName || ""}
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white underline flex-shrink-0 ml-2">
                            총 {group.totalAmount.toLocaleString()}원
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {group.items.map((item, itemIndex) => (
                            <div
                              key={itemIndex}
                              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                            >
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                                  {item.brand} {item.productName} <span className="text-slate-500 dark:text-slate-400">({item.returnQty}개)</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  {item.totalRefund.toLocaleString()}원
                                </span>
                                <button
                                  onClick={() =>
                                    removeSelectedItem(item.productId)
                                  }
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-red-300 hover:text-red-500 dark:border-slate-600 dark:bg-slate-800 flex-shrink-0"
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-slate-200 pt-4 dark:border-slate-700 flex-shrink-0">
                  <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                    총 {totalItems}항목
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleProcessReturn}
                      disabled={submitting || selectedItems.length === 0 || !managerName.trim()}
                      className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                      {submitting ? "처리 중..." : "반납 하기"}
                    </button>
                    <button
                      onClick={handleCancelReturn}
                      disabled={selectedItems.length === 0}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      반납 취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

