"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface Product {
  id: string;
  productName: string;
  brand: string;
  barcode?: string;
  purchasePrice?: number;
  salePrice?: number;
  unitPrice?: number;
  unit?: string;
  batchNo?: string;
  qty?: number;
  batches?: Array<{
    batch_no: string;
    qty: number;
    inbound_qty: number;
  }>;
}

export default function BulkPricingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(true);
  const [editedPrices, setEditedPrices] = useState<
    Record<string, { purchasePrice?: string; salePrice?: string }>
  >({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // const apiUrl =
  //   typeof window !== "undefined"
  //     ? localStorage.getItem("api_url") || "https://api.jaclit.com"
  //     : "https://api.jaclit.com";

  // Fetch products from API
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { apiGet } = await import("../../../lib/api");
      const data = await apiGet(`/products`);

      // Map products and add first batch info
      const mappedProducts = (data || []).map((product: any) => ({
        ...product,
        batchNo: product.batches?.[0]?.batch_no || null,
        qty: product.batches?.[0]?.qty || 0,
      }));

      setProducts(mappedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      alert("제품 목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter logic
  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (showOnlyMissing) {
      filtered = filtered.filter((p) => {
        const purchasePrice = p.purchasePrice || p.unitPrice || 0;
        const salePrice = p.salePrice || 0;
        return (
          !purchasePrice || !salePrice || purchasePrice === 0 || salePrice === 0
        );
      });
    }

    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.productName?.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query) ||
          p.barcode?.toLowerCase().includes(query) ||
          p.batchNo?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [products, showOnlyMissing, debouncedSearchQuery]);

  // Clear search function
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
  }, []);

  // Handle price change
  const handlePriceChange = (
    productId: string,
    field: "purchasePrice" | "salePrice",
    value: string
  ) => {
    setEditedPrices((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  // Handle save
  const handleSave = async (productId: string) => {
    const prices = editedPrices[productId];
    if (!prices) return;

    // Validation
    if (!prices.purchasePrice?.trim() && !prices.salePrice?.trim()) {
      alert("구매가 또는 판매가를 입력해주세요");
      return;
    }

    setSavingIds((prev) => new Set(prev).add(productId));

    try {
      const { apiPut } = await import("../../../lib/api");
      await apiPut(`/products/${productId}`, {
        purchasePrice: prices.purchasePrice
          ? Number(prices.purchasePrice.replace(/,/g, ""))
          : null,
        salePrice: prices.salePrice
          ? Number(prices.salePrice.replace(/,/g, ""))
          : null,
      });

      alert("가격이 저장되었습니다");

      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                purchasePrice: prices.purchasePrice
                  ? Number(prices.purchasePrice.replace(/,/g, ""))
                  : p.purchasePrice,
                salePrice: prices.salePrice
                  ? Number(prices.salePrice.replace(/,/g, ""))
                  : p.salePrice,
              }
            : p
        )
      );

      // Clear edited state
      setEditedPrices((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
    } catch (error) {
      console.error("Save failed:", error);
      alert("저장 실패");
    } finally {
      setSavingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  // Format number with Korean locale
  const formatNumber = (value: string | number | undefined): string => {
    if (!value) return "";
    const numValue =
      typeof value === "string" ? value.replace(/,/g, "") : value;
    return Number(numValue).toLocaleString("ko-KR");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            제품 가격 일괄 수정
          </h1>
          <button
            onClick={() => setShowOnlyMissing(!showOnlyMissing)}
            className={`rounded-lg px-4 py-2 font-medium transition ${
              showOnlyMissing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            }`}
          >
            {showOnlyMissing ? "전체 표시" : "가격 미입력만"}
          </button>
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색: 제품명, 브랜드, 바코드, 배치번호..."
              className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-10 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:ring-blue-800"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label="검색 지우기"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              검색 결과:{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {filteredProducts.length}
              </span>
              개 제품
            </div>
          )}
        </div>

        {/* Product List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-slate-800">
            <svg
              className="mx-auto mb-4 h-16 w-16 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              {showOnlyMissing
                ? "가격이 없는 제품이 없습니다"
                : "제품이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table Header */}
            <div className="hidden rounded-lg bg-slate-200 px-6 py-3 dark:bg-slate-800 md:grid md:grid-cols-12 md:items-center md:gap-4">
              <div className="col-span-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                제품명
              </div>
              <div className="col-span-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                구매가
              </div>
              <div className="col-span-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                판매가
              </div>
              <div className="col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                저장
              </div>
            </div>

            {/* Product Rows */}
            {filteredProducts.map((product) => {
              const currentPurchasePrice =
                product.purchasePrice || product.unitPrice || 0;
              const currentSalePrice = product.salePrice || 0;
              const edited = editedPrices[product.id];
              const isSaving = savingIds.has(product.id);
              const hasChanges =
                edited && (edited.purchasePrice || edited.salePrice);

              return (
                <div
                  key={product.id}
                  className="grid grid-cols-1 gap-4 rounded-lg bg-white p-6 shadow transition hover:shadow-md dark:bg-slate-800 md:grid-cols-12 md:items-center"
                >
                  {/* Product Info */}
                  <div className="col-span-1 md:col-span-4 flex flex-col gap-1">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {debouncedSearchQuery ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: product.productName.replace(
                              new RegExp(`(${debouncedSearchQuery})`, "gi"),
                              '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
                            ),
                          }}
                        />
                      ) : (
                        product.productName
                      )}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      제조사:{" "}
                      {debouncedSearchQuery ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: product.brand.replace(
                              new RegExp(`(${debouncedSearchQuery})`, "gi"),
                              '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
                            ),
                          }}
                        />
                      ) : (
                        product.brand
                      )}
                      {product.qty !== undefined &&
                        product.qty > 0 &&
                        `  재고: ${product.qty}`}
                      {product.unit && ` ${product.unit}`}
                    </div>
                    {product.batchNo && (
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        배치:{" "}
                        {debouncedSearchQuery ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: product.batchNo.replace(
                                new RegExp(`(${debouncedSearchQuery})`, "gi"),
                                '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
                              ),
                            }}
                          />
                        ) : (
                          product.batchNo
                        )}
                      </div>
                    )}
                    {product.barcode && (
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        바코드:{" "}
                        {debouncedSearchQuery ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: product.barcode.replace(
                                new RegExp(`(${debouncedSearchQuery})`, "gi"),
                                '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
                              ),
                            }}
                          />
                        ) : (
                          product.barcode
                        )}
                      </div>
                    )}
                  </div>

                  {/* Purchase Price Input */}
                  <div className="col-span-1 md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400 md:hidden">
                      구매가
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={
                          edited?.purchasePrice !== undefined
                            ? formatNumber(edited.purchasePrice)
                            : formatNumber(currentPurchasePrice)
                        }
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, "");
                          if (value === "" || /^\d+$/.test(value)) {
                            handlePriceChange(
                              product.id,
                              "purchasePrice",
                              value
                            );
                          }
                        }}
                        placeholder="구매가 입력"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:ring-blue-800"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>

                  {/* Sale Price Input */}
                  <div className="col-span-1 md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400 md:hidden">
                      판매가
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={
                          edited?.salePrice !== undefined
                            ? formatNumber(edited.salePrice)
                            : formatNumber(currentSalePrice)
                        }
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, "");
                          if (value === "" || /^\d+$/.test(value)) {
                            handlePriceChange(product.id, "salePrice", value);
                          }
                        }}
                        placeholder="판매가 입력"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:ring-blue-800"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="col-span-1 md:col-span-2">
                    <button
                      onClick={() => handleSave(product.id)}
                      disabled={!hasChanges || isSaving}
                      className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                        hasChanges && !isSaving
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-500"
                      }`}
                    >
                      {isSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
