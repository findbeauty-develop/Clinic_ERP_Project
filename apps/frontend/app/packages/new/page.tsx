"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "../../../lib/api";

type Product = {
  id: string;
  productName: string;
  brand: string;
  barcode?: string | null;
  category: string;
  unit?: string | null;
  currentStock?: number;
};

type SelectedItem = {
  productId: string;
  productName: string;
  brand: string;
  unit: string;
  quantity: number;
};

export default function PackageNewPage() {
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [packageName, setPackageName] = useState("");
  const [packageNameSuggestions, setPackageNameSuggestions] = useState<
    string[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Load package data if in edit mode
  useEffect(() => {
    const loadPackageForEdit = async () => {
      const packageId = sessionStorage.getItem("editing_package_id");
      if (packageId) {
        setEditingPackageId(packageId);
        setIsEditMode(true);

        try {
          // Load package details
          const packageData = await apiGet<any>(
            `${apiUrl}/packages/${packageId}`
          );
          setPackageName(packageData.name || "");

          // Load package items
          const itemsData = await apiGet<any[]>(
            `${apiUrl}/packages/${packageId}/items`
          );
          const formattedItems = itemsData.map((item: any) => ({
            productId: item.productId || item.product_id,
            productName: item.productName || item.product?.name || "",
            brand: item.brand || item.product?.brand || "",
            unit: item.unit || item.product?.unit || "개",
            quantity: item.quantity || 0,
          }));
          setSelectedItems(formattedItems);
        } catch (err) {
          console.error("Failed to load package for edit:", err);
          alert("패키지 정보를 불러오지 못했습니다.");
        }
      }
    };

    loadPackageForEdit();

    // Cleanup: Clear sessionStorage when component unmounts
    return () => {
      // Only clear if not redirecting to outbound
      if (!window.location.pathname.includes("/outbound")) {
        sessionStorage.removeItem("editing_package_id");
      }
    };
  }, [apiUrl]);

  useEffect(() => {
    fetchProducts();
  }, [apiUrl]);

  useEffect(() => {
    if (packageName.trim() && packageName.length >= 2) {
      fetchPackageNameSuggestions(packageName);
    } else {
      setPackageNameSuggestions([]);
      setShowSuggestions(false);
    }
  }, [packageName, apiUrl]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all products for package creation
      // Use getAllProducts endpoint which returns products with all necessary fields
      const data = await apiGet<any[]>(`${apiUrl}/products`);

      // Format products
      const formattedProducts = data.map((product: any) => ({
        id: product.id,
        productName: product.productName || product.name,
        brand: product.brand,
        barcode: product.barcode,
        category: product.category,
        unit: product.unit || "개",
        currentStock: product.currentStock || product.current_stock || 0,
      }));

      setProducts(formattedProducts);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("제품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPackageNameSuggestions = async (query: string) => {
    try {
      const data = await apiGet<{ name: string }[]>(
        `${apiUrl}/packages/search/names?q=${encodeURIComponent(query)}&limit=10`
      );
      setPackageNameSuggestions(data.map((p) => p.name));
      setShowSuggestions(true);
    } catch (err) {
      console.error("Failed to load package name suggestions", err);
      setPackageNameSuggestions([]);
    }
  };

  const handleQuantityChange = (
    productId: string,
    productName: string,
    brand: string,
    unit: string,
    newQuantity: number
  ) => {
    if (newQuantity <= 0) {
      // Remove from selected items
      setSelectedItems((prev) =>
        prev.filter((item) => item.productId !== productId)
      );
      return;
    }

    // Update or add to selected items
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === productId
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQuantity,
        };
        return updated;
      }

      return [
        ...prev,
        {
          productId,
          productName,
          brand,
          unit,
          quantity: newQuantity,
        },
      ];
    });
  };

  const decreaseSelectedItem = (item: SelectedItem) => {
    const newQuantity = item.quantity - 1;
    if (newQuantity <= 0) {
      // Remove from selected items if quantity reaches 0
      setSelectedItems((prev) =>
        prev.filter((selectedItem) => selectedItem.productId !== item.productId)
      );
      // Also reset quantity in products list
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        handleQuantityChange(
          item.productId,
          item.productName,
          item.brand,
          item.unit,
          0
        );
      }
    } else {
      // Decrease quantity by 1
      handleQuantityChange(
        item.productId,
        item.productName,
        item.brand,
        item.unit,
        newQuantity
      );
    }
  };

  const handlePackageNameSelect = (suggestion: string) => {
    setPackageName(suggestion);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!packageName.trim()) {
      alert("패키지 이름을 입력해주세요.");
      return;
    }

    if (selectedItems.length === 0) {
      alert("패키지에 포함할 제품을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      // Skip duplicate checks in edit mode
      if (!isEditMode) {
        // Check for duplicate package name
        const nameCheck = await apiPost<{
          exists: boolean;
          existingPackage?: { id: string; name: string };
        }>(`${apiUrl}/packages/check-name`, {
          name: packageName.trim(),
        });

        if (nameCheck.exists) {
          alert(
            "동일한 이름의 패키지를 생성할 수 없습니다. 다른 패키지 이름을 입력해주세요."
          );
          setSubmitting(false);
          return;
        }

        // Check for duplicate package composition
        const duplicateCheck = await apiPost<{
          isDuplicate: boolean;
          existingPackage?: { id: string; name: string };
        }>(`${apiUrl}/packages/check-duplicate`, {
          name: packageName.trim(),
          items: selectedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        });

        if (duplicateCheck.isDuplicate) {
          const confirmMessage = `동일 구성의 패키지가 이미 존재합니다: ${duplicateCheck.existingPackage?.name}\n그래도 등록하시겠습니까?`;
          if (!confirm(confirmMessage)) {
            setSubmitting(false);
            return;
          }
        }
      }

      // Prepare payload
      const payload = {
        name: packageName.trim(),
        description: null,
        items: selectedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      };

      // Update or create package
      if (isEditMode && editingPackageId) {
        const { apiPut } = await import("../../../lib/api");
        await apiPut(`${apiUrl}/packages/${editingPackageId}`, payload);
        alert("패키지가 성공적으로 수정되었습니다.");
      } else {
        await apiPost(`${apiUrl}/packages`, payload);
        alert("패키지가 성공적으로 등록되었습니다.");
      }

      // Clear sessionStorage
      sessionStorage.removeItem("editing_package_id");

      // Redirect to outbound page with package outbound tab
      router.push("/outbound?type=package");
    } catch (err: any) {
      console.error("Failed to save package", err);
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "패키지 저장 중 오류가 발생했습니다.";
      alert(`패키지 저장 실패: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;

    const query = searchQuery.toLowerCase();
    return products.filter(
      (product) =>
        product.productName.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                출고 관리
              </h1>
              <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                필요한 제품을 바로 출고해보세요.
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              마지막 업데이트: {new Date().toLocaleString("ko-KR")}
            </span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Left Panel - Product List */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                {isEditMode ? "패키지 수정" : "새 패키지등록"}
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

              {/* Product List */}
              {loading ? (
                <div className="py-8 text-center text-slate-500">
                  로딩 중...
                </div>
              ) : error ? (
                <div className="py-8 text-center text-red-500">{error}</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  제품이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredProducts.map((product) => {
                    const selectedItem = selectedItems.find(
                      (item) => item.productId === product.id
                    );
                    const quantity = selectedItem?.quantity || 0;

                    return (
                      <div
                        key={product.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60"
                      >
                        <div className="flex-1">
                          <div className="mb-1">
                            <span className="text-base font-bold text-slate-900 dark:text-white">
                              {product.productName}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            제조사:{product.brand}
                          </div>
                        </div>
                        <div className="ml-4 flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleQuantityChange(
                                product.id,
                                product.productName,
                                product.brand,
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
                            value={quantity}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 0;
                              handleQuantityChange(
                                product.id,
                                product.productName,
                                product.brand,
                                product.unit || "개",
                                newQty
                              );
                            }}
                            className="h-10 w-16 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() =>
                              handleQuantityChange(
                                product.id,
                                product.productName,
                                product.brand,
                                product.unit || "개",
                                quantity + 1
                              )
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            +
                          </button>
                          <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                            단위
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Package Info */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                패키지 이름
              </h2>

              {/* Package Name Input with Auto-complete */}
              <div className="mb-6 relative">
                <input
                  type="text"
                  placeholder="패키지 이름 입력"
                  value={packageName}
                  onChange={(e) => {
                    setPackageName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    if (packageNameSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className="h-11 w-full rounded-xl border-2 border-red-500 bg-white px-4 text-sm text-slate-700 transition focus:border-red-600 focus:outline-none dark:border-red-500 dark:bg-slate-900 dark:text-slate-200"
                />
                {showSuggestions && packageNameSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {" "}
                    {packageNameSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePackageNameSelect(suggestion)}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Items List */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  선택된 제품
                </h3>
                {selectedItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    패키지에 포함할 제품을 선택해주세요.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {selectedItems.map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                      >
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {item.productName}
                          </span>
                          <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                            {item.quantity}
                            {item.unit}
                          </span>
                        </div>
                        <button
                          onClick={() => decreaseSelectedItem(item)}
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
                    ))}
                  </div>
                )}
              </div>

              {/* Register Button */}
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !packageName.trim() ||
                  selectedItems.length === 0
                }
                className="mt-6 w-full rounded-xl border-2 border-red-500 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-500 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-red-500/10"
              >
                {submitting
                  ? isEditMode
                    ? "수정 중..."
                    : "등록 중..."
                  : isEditMode
                    ? "패키지 수정하기"
                    : "패키지 등록하기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
