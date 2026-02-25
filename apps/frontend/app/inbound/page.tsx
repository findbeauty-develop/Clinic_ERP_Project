"use client";

import {
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  useCallback,
  useRef,
  memo,
} from "react";
import Link from "next/link";
import Papa from "papaparse";
import { getAccessToken, getTenantId } from "../../lib/api";

const inboundFilters = [
  { label: "최근 업데이트순", value: "recent" },
  { label: "최근 등록순", value: "newest" },
  { label: "이름순", value: "name" },
];

// Helper functions to get dynamic options from products
const getCategories = (products: ProductListItem[]): string[] => {
  const cats = new Set<string>();
  products.forEach((p) => {
    if (p.category) cats.add(p.category);
  });
  return ["전체 카테고리", ...Array.from(cats).sort()];
};

const getStatuses = (products: ProductListItem[]): string[] => {
  const stats = new Set<string>();
  products.forEach((p) => {
    if (p.status) stats.add(p.status);
  });
  return ["전체 상태", ...Array.from(stats).sort()];
};

const getSuppliers = (products: ProductListItem[]): string[] => {
  const supps = new Set<string>();
  products.forEach((p) => {
    if (p.supplierName) supps.add(p.supplierName);
  });
  return ["전체 공급업체", ...Array.from(supps).sort()];
};

type ProductBatch = {
  batch_no: string;
  유효기간: string | null;
  보관위치: string | null;
  "입고 수량": number;
  purchase_price?: number | null;
  qty?: number; // Original qty from inbound (immutable)
  created_at: string;
  is_separate_purchase?: boolean; // 별도 구매 여부
};

type ProductListItem = {
  id: string;
  productName: string;
  brand: string;
  barcode?: string | null;
  productImage?: string | null;
  category: string;
  status: string;
  currentStock: number;
  minStock: number;
  unit?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  supplierName?: string | null;
  managerName?: string | null;
  managerPosition?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
  memo?: string | null;
  expiryMonths?: number | null;
  expiryUnit?: string | null;
  alertDays?: string | null;
  productStorage?: string | null;
};

export default function InboundPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );
  const [activeTab, setActiveTab] = useState<"quick" | "pending">("quick");
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // ✅ Optimistic UI
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const itemsPerPage = 10;

  // ✅ State for barcode scan success modal
  const [scanSuccessModal, setScanSuccessModal] = useState<{
    show: boolean;
    productName: string;
    batchNumber: string;
    expiryDate: string;
  }>({
    show: false,
    productName: "",
    batchNumber: "",
    expiryDate: "",
  });

  // ✅ State for keyboard warning modal (Korean keyboard detection)
  const [showKeyboardWarning, setShowKeyboardWarning] = useState(false);

  // ✅ State for barcode not found modal
  const [barcodeNotFoundModal, setBarcodeNotFoundModal] = useState<{
    show: boolean;
    barcode: string;
    gtin: string;
  }>({
    show: false,
    barcode: "",
    gtin: "",
  });

  // ✅ Use ref to track activeTab in event listener (avoid closure issues)
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Cache for pending orders to prevent duplicate requests
  const pendingOrdersCacheRef = useRef<{
    data: any[];
    timestamp: number;
  } | null>(null);
  const PENDING_ORDERS_CACHE_TTL = 0; // ✅ DISABLED: No cache for real-time updates

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedCategory, setSelectedCategory] = useState("전체 카테고리");
  const [selectedStatus, setSelectedStatus] = useState("전체 상태");
  const [selectedSupplier, setSelectedSupplier] = useState("전체 공급업체");
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);

  // Fetch products for "빠른 입고" tab - memoized to prevent duplicate requests
  const fetchProducts = useCallback(
    async (forceRefresh = false) => {
      if (activeTab !== "quick") return;

      setLoading(true);
      setError(null);
      try {
        const { apiGet, clearCache } = await import("../../lib/api");

        // ✅ Force refresh: Clear cache before fetching if requested
        if (forceRefresh) {
          clearCache("/products");
          clearCache("products");
        }

        // Add cache-busting parameter to bypass browser HTTP cache when force refresh
        const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : "";
        const data = await apiGet<any[]>(`${apiUrl}/products${cacheBuster}`, {
          headers: forceRefresh
            ? {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
              }
            : {},
        });

        // Helper function to format image URL (relative path -> full URL)
        const formatImageUrl = (
          imageUrl: string | null | undefined
        ): string | null => {
          if (!imageUrl) return null;
          // Agar to'liq URL bo'lsa (http:// yoki https:// bilan boshlansa), o'zgartirmaslik
          if (
            imageUrl.startsWith("http://") ||
            imageUrl.startsWith("https://")
          ) {
            return imageUrl;
          }
          // Agar base64 bo'lsa, o'zgartirmaslik
          if (imageUrl.startsWith("data:image")) {
            return imageUrl;
          }
          // Relative path bo'lsa, apiUrl qo'shish
          if (imageUrl.startsWith("/")) {
            return `${apiUrl}${imageUrl}`;
          }
          return imageUrl;
        };

        // Format image URLs for all products
        const formattedProducts: ProductListItem[] = data.map(
          (product: any) => ({
            ...product,
            productImage: formatImageUrl(
              product.productImage || product.image_url
            ),
          })
        );

        // 🔍 DEBUG LOG - Check currentStock in frontend

        setProducts(formattedProducts);
      } catch (err) {
        console.error("Failed to load products", err);
        setError("제품 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, activeTab]
  );

  useEffect(() => {
    // Check if we should force refresh (e.g., after product creation/deletion)
    const shouldForceRefresh =
      sessionStorage.getItem("inbound_force_refresh") === "true";
    if (shouldForceRefresh) {
      sessionStorage.removeItem("inbound_force_refresh");
      fetchProducts(true); // Force refresh
    } else {
      fetchProducts();
    }
  }, [fetchProducts]);

  // ✅ Global barcode scanner handler - works even when cards are collapsed
  const handleGlobalBarcodeScanned = useCallback(
    async (scannedBarcode: string) => {
      try {
        const { parseGS1Barcode } = await import("../../utils/barcodeParser");
        const parsed = parseGS1Barcode(scannedBarcode);

        if (!parsed.gtin) {
          alert("잘못된 바코드 형식입니다.");
          return;
        }

        // Find product by GTIN in the current product list
        const matchedProduct = products.find((p) => p.barcode === parsed.gtin);

        if (!matchedProduct) {
          alert(
            `⚠️ 제품을 찾을 수 없습니다.\nGTIN: ${parsed.gtin}\n\n제품을 먼저 등록하세요.`
          );
          return;
        }

        // Auto expand the matched product
        setExpandedCardId(matchedProduct.id);

        // Wait for card to expand, then dispatch fill event
        setTimeout(() => {
          // Trigger batch form fill via custom event
          window.dispatchEvent(
            new CustomEvent("fillBatchForm", {
              detail: {
                productId: matchedProduct.id,
                batchNumber: parsed.batchNumber,
                expiryDate: parsed.expiryDate,
              },
            })
          );
        }, 200); // Wait 200ms for card expansion

        // Scroll to the product card
        setTimeout(() => {
          const element = document.getElementById(
            `product-card-${matchedProduct.id}`
          );
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 300);

        // Show success modal instead of alert
        setScanSuccessModal({
          show: true,
          productName: matchedProduct.productName,
          batchNumber: parsed.batchNumber || "(없음)",
          expiryDate: parsed.expiryDate || "(없음)",
        });
      } catch (error) {
        console.error("Global barcode scan error:", error);
      }
    },
    [products]
  );

  // ✅ Listen for product deletion events and update state immediately
  useEffect(() => {
    const handleProductDeleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{ productId: string }>;
      const { productId } = customEvent.detail;

      // Use ref to get current activeTab value (avoid closure issues)
      const currentActiveTab = activeTabRef.current;

      if (!productId) {
        console.warn("[Inbound] No productId in event detail");
        return;
      }

      // ✅ Always remove product from local state immediately (optimistic update)
      // Don't check activeTab - we want to update state regardless of tab
      setProducts((prevProducts) => {
        const filtered = prevProducts.filter((p) => p.id !== productId);

        return filtered;
      });

      // Clear cache to ensure consistency
      const { clearCache } = require("../../lib/api");
      clearCache("/products");
      clearCache("products");

      // ✅ Force refresh from API to bypass browser HTTP cache
      // Add cache-busting parameter to ensure fresh data
      if (currentActiveTab === "quick") {
        try {
          const { apiGet } = await import("../../lib/api");

          const freshData = await apiGet<any[]>(
            `${apiUrl}/products?_t=${Date.now()}`,
            {
              headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
              },
            }
          );

          // Update state with fresh data from API
          const formatImageUrl = (
            imageUrl: string | null | undefined
          ): string | null => {
            if (!imageUrl) return null;
            if (
              imageUrl.startsWith("http://") ||
              imageUrl.startsWith("https://")
            ) {
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

          const formattedProducts: ProductListItem[] = freshData.map(
            (product: any) => ({
              ...product,
              productImage: formatImageUrl(
                product.productImage || product.image_url
              ),
            })
          );

          setProducts(formattedProducts);
        } catch (err) {
          console.error(
            "[Inbound] Failed to refresh products after deletion",
            err
          );
          // Keep the optimistic update even if refresh fails
        }
      }
    };

    const handleProductCreated = () => {
      if (activeTab === "quick") {
        // Force refresh to show new product
        fetchProducts(true);
      }
    };

    const handleBatchCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const productId = customEvent.detail?.productId;
      if (!productId) return;

      // ✅ Clear cache for products list (current_stock might have changed)
      import("../../lib/api").then(({ clearCache }) => {
        clearCache("/products");
        clearCache("products");
      });

      // ✅ Force refresh product list to show updated current_stock
      if (activeTab === "quick") {
        fetchProducts(true);
      }
    };

    window.addEventListener("productDeleted", handleProductDeleted);
    window.addEventListener("productCreated", handleProductCreated);
    window.addEventListener("batchCreated", handleBatchCreated);

    return () => {
      window.removeEventListener("productDeleted", handleProductDeleted);
      window.removeEventListener("productCreated", handleProductCreated);
      window.removeEventListener("batchCreated", handleBatchCreated);
    };
  }, [apiUrl]); // Only apiUrl in dependencies - activeTab is accessed via ref to avoid closure issues

  // ✅ Global USB Scanner - works even when all cards are collapsed
  useEffect(() => {
    // Only active on "quick" tab
    if (activeTab !== "quick") return;

    let buffer = "";
    let lastTime = 0;
    let timeout: NodeJS.Timeout;

    // ✅ Track keyboard layout warnings to avoid spam
    let lastGlobalKeyboardWarning = 0;
    let globalKoreanCharDetected = false;

    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // ✅ CRITICAL: Detect Korean/IME input BEFORE ignoring it
      if (e.isComposing || e.keyCode === 229) {
        if (!globalKoreanCharDetected) {
          setShowKeyboardWarning(true); // ✅ Show modal instead of alert
          globalKoreanCharDetected = true;
          setTimeout(() => {
            globalKoreanCharDetected = false;
          }, 5000);
        }
        buffer = "";
        return;
      }

      const now = Date.now();

      // USB scanner types very fast (< 100ms between chars)
      if (now - lastTime > 100) buffer = "";

      if (e.key === "Enter" && buffer.length >= 8) {
        // ✅ STRICT: Only allow alphanumeric characters (GS1 standard)
        const cleanedBarcode = buffer.replace(/[^0-9A-Za-z]/g, "");

        handleGlobalBarcodeScanned(cleanedBarcode);
        buffer = "";
      } else if (e.key.length === 1) {
        // ✅ STRICT: Only accept digits and letters (0-9, A-Z, a-z)
        if (/[0-9A-Za-z]/.test(e.key)) {
          buffer += e.key;
          lastTime = now;

          clearTimeout(timeout);
          timeout = setTimeout(() => {
            buffer = "";
          }, 500);
        } else {
          // ✅ Non-alphanumeric detected - likely Korean keyboard
          if (!globalKoreanCharDetected) {
            setShowKeyboardWarning(true); // ✅ Show modal instead of alert
            globalKoreanCharDetected = true;
            setTimeout(() => {
              globalKoreanCharDetected = false;
            }, 5000);
          }
          buffer = "";
          console.warn(
            "[Global Barcode Scanner] ⚠️ Ignored non-alphanumeric:",
            e.key,
            "charCode:",
            e.key.charCodeAt(0)
          );
        }
      }
    };

    window.addEventListener("keypress", handleGlobalKeyPress);
    return () => {
      window.removeEventListener("keypress", handleGlobalKeyPress);
      clearTimeout(timeout);
    };
  }, [activeTab, handleGlobalBarcodeScanned]);

  // ✅ Refresh products when page becomes visible (after product deletion from other pages)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeTab === "quick") {
        // Check if force refresh flag is set
        const shouldForceRefresh =
          sessionStorage.getItem("inbound_force_refresh") === "true";
        if (shouldForceRefresh) {
          sessionStorage.removeItem("inbound_force_refresh");
          fetchProducts(true); // Force refresh
        }
      }
    };

    const handleFocus = () => {
      if (activeTab === "quick") {
        const shouldForceRefresh =
          sessionStorage.getItem("inbound_force_refresh") === "true";
        if (shouldForceRefresh) {
          sessionStorage.removeItem("inbound_force_refresh");
          fetchProducts(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [activeTab, fetchProducts]);

  // Fetch pending orders function - memoized to prevent duplicate requests
  const fetchPendingOrders = useCallback(
    async (forceRefresh = false) => {
      if (activeTab !== "pending") return;

      // ✅ NO CACHE: Always fetch fresh data
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      try {
        const { apiGet } = await import("../../lib/api");
        // Add cache-busting parameter for real-time updates
        const groupedData = await apiGet<any[]>(
          `${apiUrl}/order/pending-inbound?_t=${Date.now()}`,
          {
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            },
          }
        );

        // Flatten grouped data: each supplier group has an array of orders
        const flatOrders: any[] = [];
        groupedData.forEach((supplierGroup: any) => {
          supplierGroup.orders?.forEach((order: any) => {
            flatOrders.push({
              ...order,
              id: order.id || order.orderId, // ✅ Ensure id exists (backend should have it)
              orderId: order.id, // ✅ ADD: Map id to orderId for backward compatibility
              supplierName: supplierGroup.supplierName,
              managerName: supplierGroup.managerName,
              managerPosition: supplierGroup.managerPosition,
              isPlatformSupplier: supplierGroup.isPlatformSupplier, // ✅ NEW
            });
          });
        });

        setPendingOrders(flatOrders);
        // ✅ NO CACHE: Don't store in cache
      } catch (err) {
        console.error("Failed to load pending orders", err);
        setError("입고 대기 주문을 불러오지 못했습니다.");
      } finally {
        if (forceRefresh) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [apiUrl, activeTab]
  );

  // Fetch pending orders for "입고 대기" tab - only when tab is active
  useEffect(() => {
    if (activeTab === "pending") {
      fetchPendingOrders();
    }
  }, [activeTab, fetchPendingOrders]);

  // Filter and sort products
  const filteredAndSortedProducts = useMemo(() => {
    let filtered = [...products];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.productName?.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query) ||
          p.id?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory !== "전체 카테고리") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Status filter
    if (selectedStatus !== "전체 상태") {
      filtered = filtered.filter((p) => p.status === selectedStatus);
    }

    // Supplier filter
    if (selectedSupplier !== "전체 공급업체") {
      filtered = filtered.filter((p) => p.supplierName === selectedSupplier);
    }

    // Sort
    switch (sortBy) {
      case "recent":
        // Keep original order (already sorted by backend)
        break;
      case "newest":
        // Sort by newest (by id)
        filtered.sort((a, b) => {
          return b.id.localeCompare(a.id);
        });
        break;
      case "name":
        // Sort by name
        filtered.sort((a, b) => {
          const nameA = a.productName?.toLowerCase() || "";
          const nameB = b.productName?.toLowerCase() || "";
          return nameA.localeCompare(nameB);
        });
        break;
    }

    return filtered;
  }, [
    products,
    searchQuery,
    sortBy,
    selectedCategory,
    selectedStatus,
    selectedSupplier,
  ]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredAndSortedProducts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, selectedCategory, selectedStatus, selectedSupplier]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCardToggle = (productId: string) => {
    setExpandedCardId((prev) => (prev === productId ? null : productId));
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
              입고 관리
            </h1>
            <p className="text-base text-slate-500 dark:text-slate-300">
              제품의 입고를 기록하고 재고를 관리합니다
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* CSV 등록 button hide */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCSVImportModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span className="text-xm">📦</span>
                CSV 입고
              </button>
            </div>
            <Link
              href="/inbound/new"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <PlusIcon className="h-5 w-5" />
              신제품 등록
            </Link>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("quick")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "quick"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            빠른 입고
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "pending"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            입고 대기
            {pendingOrders.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {pendingOrders.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === "quick" && (
          <>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm backdrop-blur sm:p-6 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 items-center rounded-xl border border-transparent bg-slate-100 px-4 py-3 transition focus-within:border-sky-400 focus-within:bg-white dark:bg-slate-800 dark:focus-within:border-sky-500 dark:focus-within:bg-slate-900">
                  <SearchIcon className="mr-3 h-5 w-5 text-slate-400" />
                  <input
                    aria-label="제품 검색"
                    placeholder="제품명, 브랜드, 입고번호 등을 검색하세요"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
                  />
                </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:w-auto">
                  <FilterChip
                    label="정렬"
                    options={inboundFilters}
                    value={sortBy}
                    onChange={(value) => setSortBy(value)}
                    defaultValue="최근 업데이트순"
                  />
                  <FilterChip
                    label="카테고리"
                    options={getCategories(products)}
                    value={selectedCategory}
                    onChange={(value) => setSelectedCategory(value)}
                    defaultValue="전체 카테고리"
                  />
                  <FilterChip
                    label="상태"
                    options={getStatuses(products)}
                    value={selectedStatus}
                    onChange={(value) => setSelectedStatus(value)}
                    defaultValue="전체 상태"
                  />
                  <FilterChip
                    label="공급업체"
                    options={getSuppliers(products)}
                    value={selectedSupplier}
                    onChange={(value) => setSelectedSupplier(value)}
                    defaultValue="전체 공급업체"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <section className="space-y-4">
          {activeTab === "quick" && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  총 {filteredAndSortedProducts.length.toLocaleString()}개의
                  제품
                </h2>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    불러오는 중...
                  </div>
                ) : products.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    등록된 제품이 없습니다. 새로운 제품을 추가해보세요.
                  </div>
                ) : filteredAndSortedProducts.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    검색 조건에 맞는 제품이 없습니다.
                  </div>
                ) : (
                  <>
                    {currentProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isExpanded={expandedCardId === product.id}
                        onToggle={() => handleCardToggle(product.id)}
                      />
                    ))}
                    {totalPages > 1 && (
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === "pending" && (
            <PendingOrdersList
              orders={pendingOrders}
              loading={loading}
              isRefreshing={isRefreshing}
              error={error}
              apiUrl={apiUrl}
              setShowKeyboardWarning={setShowKeyboardWarning}
              setBarcodeNotFoundModal={setBarcodeNotFoundModal}
              onRefresh={() => {
                pendingOrdersCacheRef.current = null;
                fetchPendingOrders(true);
                // ✅ 스캔 입고 / 입고 완료 후 products·batches yangilansin (inbound pageda ko'rinsin)
                import("../../lib/api").then(({ clearCache }) => {
                  clearCache("/products");
                  clearCache("products");
                });
                if (typeof window !== "undefined") {
                  try {
                    localStorage.removeItem("jaclit-batches-cache");
                  } catch (_) {}
                }
                globalBatchesCache.clear();
                fetchProducts(true);
              }}
            />
          )}
        </section>
      </section>

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={showCSVImportModal}
        onClose={() => setShowCSVImportModal(false)}
        onImport={() => {
          setShowCSVImportModal(false);
          // Refresh products after import
          if (activeTab === "quick") {
            fetchProducts(true);
          }
        }}
      />

      {/* ✅ Barcode Scan Success Modal */}
      {scanSuccessModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-8 shadow-2xl dark:border-emerald-500/30 dark:bg-slate-900">
            {/* Success Icon */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
              <svg
                className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            {/* Title */}
            <h3 className="mb-6 text-center text-2xl font-bold text-slate-900 dark:text-white">
              ✅ 제품 찾음!
            </h3>

            {/* Info Grid */}
            <div className="space-y-4 rounded-2xl bg-slate-50 p-6 dark:bg-slate-800/50">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  제품명:
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  {scanSuccessModal.productName}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    배치번호:
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-sm font-mono font-semibold text-indigo-600 dark:bg-slate-900 dark:text-indigo-400">
                    {scanSuccessModal.batchNumber}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    유효기간:
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-sm font-mono font-semibold text-emerald-600 dark:bg-slate-900 dark:text-emerald-400">
                    {scanSuccessModal.expiryDate}
                  </div>
                </div>
              </div>
            </div>

            {/* OK Button */}
            <button
              onClick={() =>
                setScanSuccessModal({
                  show: false,
                  productName: "",
                  batchNumber: "",
                  expiryDate: "",
                })
              }
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white transition hover:bg-emerald-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ✅ Keyboard Warning Modal - Korean keyboard detected */}
      {showKeyboardWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
            {/* Icon */}
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
                <svg
                  className="h-12 w-12 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="mb-4 text-center text-2xl font-bold text-slate-900 dark:text-white">
              키보드 설정 오류
            </h3>

            {/* Message */}
            <div className="mb-6 space-y-3 text-center">
              <p className="text-base text-slate-700 dark:text-slate-300">
                키보드가{" "}
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  한글(Hangul)
                </span>
                로 설정되어 있습니다.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                바코드 스캐너를 사용하려면 키보드를
                <br />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  영어(English)
                </span>
                로 전환하세요.
              </p>
            </div>

            {/* Instructions */}
            <div className="mb-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50">
              <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⌨️</span>
                  <span>
                    <kbd className="rounded bg-white px-2 py-1 text-xs font-semibold shadow dark:bg-slate-800">
                      Shift
                    </kbd>{" "}
                    +{" "}
                    <kbd className="rounded bg-white px-2 py-1 text-xs font-semibold shadow dark:bg-slate-800">
                      Space
                    </kbd>{" "}
                    또는
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🌐</span>
                  <span>우측 상단 입력 소스에서 변경</span>
                </div>
              </div>
            </div>

            {/* OK Button */}
            <button
              onClick={() => setShowKeyboardWarning(false)}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}

      {/* ✅ Barcode Not Found Modal */}
      {/* {barcodeNotFoundModal.show && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
           
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
                <svg className="h-12 w-12 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>

          
            <h3 className="mb-4 text-center text-2xl font-bold text-slate-900 dark:text-white">
              바코드를 찾을 수 없습니다
            </h3>

           
            <div className="mb-6 space-y-3">
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">스캔된 바코드:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{barcodeNotFoundModal.barcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">GTIN:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{barcodeNotFoundModal.gtin}</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                주문에 해당 제품이 있는지 확인하세요.
              </p>
            </div>

           
            <button
              onClick={() => setBarcodeNotFoundModal({ show: false, barcode: '', gtin: '' })}
              className="w-full rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            >
              확인
            </button>
          </div>
        </div>
      )} */}
    </main>
  );
}

// ✅ Global cache for batches (shared across all ProductCard instances)
// This prevents data loss when navigating between pages and on force refresh
const CACHE_TTL = 5 * 1000; // 5 seconds
const CACHE_STORAGE_KEY = "jaclit-batches-cache";

// Initialize cache from localStorage on first load
const initializeCache = (): Map<
  string,
  { data: ProductBatch[]; timestamp: number }
> => {
  if (typeof window === "undefined") return new Map();

  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error("Failed to load batches cache from localStorage:", error);
  }
  return new Map();
};

const globalBatchesCache = initializeCache();

// Save cache to localStorage whenever it changes
const saveCacheToStorage = () => {
  if (typeof window === "undefined") return;

  try {
    const cacheObject = Object.fromEntries(globalBatchesCache.entries());
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheObject));
  } catch (error) {
    console.error("Failed to save batches cache to localStorage:", error);
  }
};

const ProductCard = memo(function ProductCard({
  product,
  isExpanded,
  onToggle,
}: {
  product: ProductListItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Batch form state
  const [batchForm, setBatchForm] = useState({
    inboundManager: "", // Will be auto-filled from localStorage
    manufactureDate: "",
    purchasePrice: "",
    expiryDate: "",
    storageLocation: "",
    batchNumber: "", // LOT from barcode scan
    isSeparatePurchase: false, // 별도 구매 여부
  });

  // ✅ Avtomatik to'ldirish o'chirildi - placeholder har doim bo'sh bo'lishi kerak
  // Ref removed - no longer needed since auto-fill is disabled
  // Initialize inboundManager from localStorage (current logged-in member)
  // NOTE: Disabled - user wants placeholder to always be empty
  // useEffect(() => {
  //   if (hasInitialized.current) return;

  //   const memberData = localStorage.getItem("erp_member_data");
  //   if (memberData) {
  //     const member = JSON.parse(memberData);
  //     setBatchForm((prev) => ({
  //       ...prev,
  //       inboundManager: member.full_name || member.member_id || "",
  //     }));
  //     hasInitialized.current = true;
  //   }
  // }, []); // Empty dependency array

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  // ✅ Update cache whenever batches state changes
  useEffect(() => {
    if (batches.length > 0) {
      const cacheKey = `${product.id}`;
      globalBatchesCache.set(cacheKey, {
        data: batches,
        timestamp: Date.now(),
      });
      // Save to localStorage for persistence across page refreshes
      saveCacheToStorage();
    }
  }, [batches, product.id]);

  // ✅ Calculate currentStock from batches (more accurate than Product table)
  const calculatedCurrentStock = useMemo(() => {
    // If batches are loaded in state, use them (most accurate)
    if (batches.length > 0) {
      return batches.reduce((sum, batch) => sum + (batch.qty || 0), 0);
    }

    // If batches not in state, try cache (works when card is collapsed or after navigation)
    const cacheKey = `${product.id}`;
    const cached = globalBatchesCache.get(cacheKey);

    // ✅ Use cache without expiration check for display purposes
    // This ensures data persists even after long page navigation
    if (cached?.data && cached.data.length > 0) {
      return cached.data.reduce((sum, batch) => sum + (batch.qty || 0), 0);
    }

    // If no batches available, use product.currentStock from API
    // This ensures we always show a value, even when card is collapsed
    return product.currentStock ?? 0;
  }, [batches, product.currentStock, product.id]);

  const isLowStock = calculatedCurrentStock <= product.minStock;

  // USB Barcode Scanner for Batch
  useEffect(() => {
    if (!isExpanded) return;

    let buffer = "";
    let lastTime = 0;
    let timeout: NodeJS.Timeout;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isExpanded) return;

      const now = Date.now();
      if (now - lastTime > 100) buffer = "";

      if (e.key === "Enter" && buffer.length >= 8) {
        handleBatchBarcodeScanned(buffer);
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
        lastTime = now;

        clearTimeout(timeout);
        timeout = setTimeout(() => {
          buffer = "";
        }, 500);
      }
    };

    window.addEventListener("keypress", handleKeyPress);
    return () => {
      window.removeEventListener("keypress", handleKeyPress);
      clearTimeout(timeout);
    };
  }, [isExpanded, product.barcode]);

  // ✅ Load batches from cache on mount (even if not expanded)
  // This ensures data persists after page navigation
  useEffect(() => {
    const cacheKey = `${product.id}`;
    const cached = globalBatchesCache.get(cacheKey);

    // Load from cache without expiration check to preserve data across navigation
    if (cached?.data && cached.data.length > 0) {
      setBatches(cached.data);
    }
  }, [product.id]);

  const handleBatchBarcodeScanned = async (scannedBarcode: string) => {
    try {
      const { parseGS1Barcode } = await import("../../utils/barcodeParser");
      const parsed = parseGS1Barcode(scannedBarcode);

      // Verify GTIN matches current product
      if (parsed.gtin && parsed.gtin !== product.barcode) {
        alert("⚠️ 잘못된 바코드입니다. 다른 제품의 바코드입니다.");
        return;
      }

      // Auto-fill batch number (LOT) from GS1
      if (parsed.batchNumber) {
        setBatchForm((prev) => ({
          ...prev,
          batchNumber: parsed.batchNumber || "",
        }));
      }

      // Auto-fill expiry date from GS1
      if (parsed.expiryDate) {
        setBatchForm((prev) => ({
          ...prev,
          expiryDate: parsed.expiryDate || prev.expiryDate,
        }));
      }

      // Auto-calculate manufacture date
      if (parsed.expiryDate && product.expiryMonths) {
        const expiry = new Date(parsed.expiryDate);
        const mfg = new Date(expiry);

        if (product.expiryUnit === "months") {
          mfg.setMonth(mfg.getMonth() - product.expiryMonths);
        } else {
          mfg.setDate(mfg.getDate() - product.expiryMonths);
        }

        setBatchForm((prev) => ({
          ...prev,
          manufactureDate: mfg.toISOString().split("T")[0],
        }));
      }

      alert(
        `✅ 배치 스캔 완료!\n` +
          `배치번호: ${parsed.batchNumber || "(없음)"}\n` +
          `유효기간: ${parsed.expiryDate || "(없음)"}`
      );
    } catch (error) {
      console.error("Barcode parsing error:", error);
    }
  };

  useEffect(() => {
    const fetchBatches = async () => {
      if (!isExpanded) {
        // Don't clear batches when collapsed, just don't fetch
        return;
      }

      // Check cache first
      const cacheKey = `${product.id}`;
      const cached = globalBatchesCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setBatches(cached.data);
        return;
      }

      setLoadingBatches(true);
      try {
        const { apiGet } = await import("../../lib/api");
        const data = await apiGet<ProductBatch[]>(
          `${apiUrl}/products/${product.id}/batches`
        );
        setBatches(data);
        // Update cache
        globalBatchesCache.set(cacheKey, { data, timestamp: Date.now() });
        saveCacheToStorage(); // Save to localStorage
      } catch (err) {
        console.error("Failed to load batches", err);
        setBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchBatches();
  }, [product.id, isExpanded, apiUrl]);

  // Calculate expiry date when manufacture date changes
  useEffect(() => {
    if (
      batchForm.manufactureDate &&
      product.expiryMonths &&
      product.expiryUnit
    ) {
      const mfgDate = new Date(batchForm.manufactureDate);
      let calculatedDate = new Date(mfgDate);

      if (product.expiryUnit === "months") {
        calculatedDate.setMonth(
          calculatedDate.getMonth() + Number(product.expiryMonths)
        );
      } else if (product.expiryUnit === "days") {
        calculatedDate.setDate(
          calculatedDate.getDate() + Number(product.expiryMonths)
        );
      } else if (product.expiryUnit === "years") {
        calculatedDate.setFullYear(
          calculatedDate.getFullYear() + Number(product.expiryMonths)
        );
      }

      // Format: YYYY-MM-DD
      const calculatedExpiryDate = calculatedDate.toISOString().split("T")[0];

      // Only update if expiry date is empty or was previously calculated
      if (
        !batchForm.expiryDate ||
        batchForm.expiryDate === calculatedExpiryDate
      ) {
        setBatchForm((prev) => ({ ...prev, expiryDate: calculatedExpiryDate }));
      }
    }
  }, [batchForm.manufactureDate, product.expiryMonths, product.expiryUnit]);

  // Calculate manufacture date when expiry date changes (reverse calculation)
  useEffect(() => {
    if (
      batchForm.expiryDate &&
      product.expiryMonths &&
      product.expiryUnit &&
      !batchForm.manufactureDate // Only auto-calculate if manufacture date is empty
    ) {
      const expiryDate = new Date(batchForm.expiryDate);
      let calculatedMfgDate = new Date(expiryDate);

      if (product.expiryUnit === "months") {
        calculatedMfgDate.setMonth(
          calculatedMfgDate.getMonth() - Number(product.expiryMonths)
        );
      } else if (product.expiryUnit === "days") {
        calculatedMfgDate.setDate(
          calculatedMfgDate.getDate() - Number(product.expiryMonths)
        );
      } else if (product.expiryUnit === "years") {
        calculatedMfgDate.setFullYear(
          calculatedMfgDate.getFullYear() - Number(product.expiryMonths)
        );
      }

      // Format: YYYY-MM-DD
      const calculatedManufactureDate = calculatedMfgDate
        .toISOString()
        .split("T")[0];

      setBatchForm((prev) => ({
        ...prev,
        manufactureDate: calculatedManufactureDate,
      }));
    }
  }, [
    batchForm.expiryDate,
    product.expiryMonths,
    product.expiryUnit,
    batchForm.manufactureDate,
  ]);

  // ✅ Listen for global barcode scan events to auto-fill batch form
  useEffect(() => {
    const handleFillBatchForm = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { productId, batchNumber, expiryDate } = customEvent.detail;

      // Only fill if this is the target product
      if (productId !== product.id) return;

      // Only fill if card is expanded
      if (!isExpanded) return;

      // Fill batch form
      setBatchForm((prev) => ({
        ...prev,
        batchNumber: batchNumber || "",
        expiryDate: expiryDate || prev.expiryDate,
      }));

      // Auto-calculate manufacture date if possible
      if (expiryDate && product.expiryMonths) {
        const expiry = new Date(expiryDate);
        const mfg = new Date(expiry);

        if (product.expiryUnit === "months") {
          mfg.setMonth(mfg.getMonth() - product.expiryMonths);
        } else if (product.expiryUnit === "days") {
          mfg.setDate(mfg.getDate() - product.expiryMonths);
        } else if (product.expiryUnit === "years") {
          mfg.setFullYear(mfg.getFullYear() - product.expiryMonths);
        }

        setBatchForm((prev) => ({
          ...prev,
          manufactureDate: mfg.toISOString().split("T")[0],
        }));
      }
    };

    // Always add listener (not conditional on isExpanded)
    window.addEventListener("fillBatchForm", handleFillBatchForm);
    return () => {
      window.removeEventListener("fillBatchForm", handleFillBatchForm);
    };
  }, [isExpanded, product.id, product.expiryMonths, product.expiryUnit]);

  const handleCardClick = () => {
    onToggle();
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle batch creation
  const handleCreateBatch = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Validation
    if (!batchForm.inboundManager.trim()) {
      alert("입고 담당자 이름을 입력해주세요.");
      return;
    }

    if (!batchForm.expiryDate) {
      alert("유효 기간을 입력해주세요.");
      return;
    }

    if (batchQuantity < 1) {
      alert("입고 수량은 1개 이상이어야 합니다.");
      return;
    }

    setSubmittingBatch(true);
    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      const tenantId = getTenantId();

      if (!token || !tenantId) {
        alert("로그인이 필요합니다. 다시 로그인해주세요.");
        return;
      }

      const payload: any = {
        qty: batchQuantity,
        expiry_date: batchForm.expiryDate,
        inbound_manager: batchForm.inboundManager,
      };

      // Optional fields
      if (batchForm.manufactureDate) {
        payload.manufacture_date = batchForm.manufactureDate;
      }
      if (batchForm.purchasePrice) {
        payload.purchase_price = parseInt(batchForm.purchasePrice);
      }

      // ✅ Optional: Batch Number (LOT from barcode scan)
      if (batchForm.batchNumber && batchForm.batchNumber.trim() !== "") {
        payload.batch_no = batchForm.batchNumber;
      }

      // ✅ 별도 구매 여부
      payload.is_separate_purchase = batchForm.isSeparatePurchase;

      // ✅ Product'dan sale_price, expiry_months, expiry_unit, alert_days ni olib yuborish
      // Backend fallback qiladi agar frontend'dan yuborilmasa
      if (product.salePrice !== null && product.salePrice !== undefined) {
        payload.sale_price = product.salePrice;
      }
      // expiry_months va expiry_unit - product'dan olish (0 ham to'g'ri qiymat)
      // Agar undefined yoki null bo'lsa, backend product'dan fallback qiladi
      if (product.expiryMonths !== null && product.expiryMonths !== undefined) {
        payload.expiry_months = Number(product.expiryMonths);
      }
      if (product.expiryUnit !== null && product.expiryUnit !== undefined) {
        payload.expiry_unit = product.expiryUnit;
      }
      if (product.alertDays !== null && product.alertDays !== undefined) {
        payload.alert_days = product.alertDays;
      }

      // 보관 위치: User input yoki Product level storage (fallback)
      const storageLocation = batchForm.storageLocation.trim()
        ? batchForm.storageLocation
        : product.productStorage || product.storageLocation || null;

      if (storageLocation) {
        payload.storage = storageLocation;
      }

      const response = await fetch(`${apiUrl}/products/${product.id}/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error creating batch:", errorText);
        throw new Error(`배치 생성에 실패했습니다: ${response.status}`);
      }

      const result = await response.json();

      // Reset form
      setBatchForm({
        inboundManager: "",
        manufactureDate: "",
        purchasePrice: "",
        expiryDate: "",
        storageLocation: "",
        batchNumber: "", // Reset batch number
        isSeparatePurchase: false, // Reset separate purchase flag
      });
      setBatchQuantity(1);

      // ✅ Clear cache va force refresh batches list
      const { apiGet, clearCache } = await import("../../lib/api");

      // Clear API cache for batches endpoint
      clearCache(`/products/${product.id}/batches`);
      clearCache(`products/${product.id}/batches`);

      // Clear local batches cache
      const cacheKey = `${product.id}`;
      globalBatchesCache.delete(cacheKey);
      saveCacheToStorage(); // Update localStorage

      // Fetch fresh batches with cache-busting
      const updatedBatches = await apiGet<ProductBatch[]>(
        `${apiUrl}/products/${product.id}/batches?_t=${Date.now()}`,
        {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );

      setBatches(updatedBatches);

      // Update local cache with fresh data
      globalBatchesCache.set(cacheKey, {
        data: updatedBatches,
        timestamp: Date.now(),
      });
      saveCacheToStorage(); // Save to localStorage

      // ✅ Dispatch event to refresh product list (for current_stock update)
      window.dispatchEvent(
        new CustomEvent("batchCreated", {
          detail: { productId: product.id },
        })
      );

      alert("배치가 성공적으로 추가되었습니다.");
    } catch (error: any) {
      console.error("Error creating batch:", error);
      alert(
        `배치 생성 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`
      );
    } finally {
      setSubmittingBatch(false);
    }
  };

  return (
    <div
      id={`product-card-${product.id}`}
      onClick={handleCardClick}
      className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-sky-200 cursor-pointer dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/50">
            {product.productImage ? (
              <img
                src={product.productImage}
                alt={product.productName}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                No Image
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {product.category}
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {product.productName}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {product.brand}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <BoxIcon className="h-4 w-4" />
                {calculatedCurrentStock.toLocaleString()} /{" "}
                {product.minStock.toLocaleString()} {product.unit ?? "EA"}
              </span>

              {product.supplierName && (
                <span className="inline-flex items-center gap-1">
                  <TruckIcon className="h-4 w-4 text-indigo-500" />
                  {product.supplierName}
                </span>
              )}
              {product.managerName && (
                <span className="inline-flex items-center gap-1">
                  {product.managerName} {product.managerPosition}
                </span>
              )}
              {/* {product.managerPosition && (
                <span className="inline-flex items-center gap-1">
                  
                </span>
              )} */}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {isLowStock && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              재고부족
            </span>
          )}
          <Link
            href={`/products/${product.id}`}
            onClick={handleButtonClick}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            상세 보기
          </Link>

          <button
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "" : ""}
            <ChevronIcon
              className={`h-3 w-3 transition ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
              <BoxIcon className="h-4 w-4" />
              기존 배치 목록
            </div>
            {loadingBatches ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                불러오는 중...
              </p>
            ) : batches.length > 0 ? (
              batches.map((batch, index) => (
                <div
                  key={`${batch.batch_no}-${index}`}
                  className="mb-3 flex flex-col gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 last:mb-0 dark:bg-slate-900/70 dark:text-slate-300"
                >
                  {/* Batch raqami - alohida row */}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-white">
                      Batch:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-white">
                      {batch.batch_no}
                    </span>
                    {/* 별도 구매 Badge */}
                    {batch.is_separate_purchase && (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        별도 구매
                      </span>
                    )}
                  </div>

                  {/* Barcha ma'lumotlar bitta row'da */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {batch.보관위치 && (
                      <span className="inline-flex items-center gap-1">
                        <WarehouseIcon className="h-3.5 w-3.5" />
                        보관위치: {batch.보관위치}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      입고 날짜:{" "}
                      {new Date(batch.created_at).toISOString().split("T")[0]}
                    </span>
                    {batch.유효기간 && (
                      <span className="inline-flex items-center gap-1">
                        유효기간: {batch.유효기간}
                      </span>
                    )}
                    {batch.purchase_price && (
                      <span className="inline-flex items-center gap-1">
                        구매가: {batch.purchase_price.toLocaleString()}원
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        현재수량:
                      </span>
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {batch.qty?.toLocaleString() ?? 0}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {product.unit ?? "EA"}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                등록된 배치가 없습니다.
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-6 dark:border-sky-500/30 dark:bg-sky-500/5">
            {/* Title + Switch */}
            <div className="flex items-center justify-between border-b border-sky-200 pb-3 dark:border-sky-500/30">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {batchForm.isSeparatePurchase ? "별도 구매" : "바코드 입고"}
              </h3>

              {/* Toggle Switch */}
              <div
                className="flex items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  별도 구매
                </span>
                <label
                  className="relative inline-flex cursor-pointer items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={batchForm.isSeparatePurchase}
                    onChange={(e) => {
                      e.stopPropagation();
                      setBatchForm({
                        ...batchForm,
                        isSeparatePurchase: e.target.checked,
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-indigo-800"></div>
                </label>
              </div>
            </div>

            {/* Note: 배치번호는 Jaclit을 통한 주문이 아닌 제품의 입고를 의미합니다 */}
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <p>
                {batchForm.isSeparatePurchase
                  ? "별도 구매는 Jaclit을 통한 주문이 아닌 제품의 입고를 의미합니다."
                  : "바코드 입고는 Supplier에서 주문한 제품의 입고를 의미합니다."}
              </p>
              <p className="mt-1">
                <span className="font-semibold">
                  Jaclit을 통해 주문한 제품은
                </span>{" "}
                : 「입고」 → 「입고 대기」 에서 입고 처리를 진행합니다.
              </p>
            </div>

            {/* Row 1: 배치번호 + 입고 수량 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 배치번호 (선택가능) */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  배치번호
                  <span className="text-xs font-normal text-slate-500">
                    (선택가능)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="제품의 LOT 배치번호 [QR 코드 옆에 (10) 다음 숫자]를 입력해주세요"
                  value={batchForm.batchNumber}
                  onChange={(e) => {
                    e.stopPropagation();
                    setBatchForm({ ...batchForm, batchNumber: e.target.value });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>

              {/* 입고 수량 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  입고 수량 *
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBatchQuantity(Math.max(0, batchQuantity - 1));
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={batchQuantity}
                    onChange={(e) =>
                      setBatchQuantity(Number(e.target.value) || 0)
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBatchQuantity(batchQuantity + 1);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    +
                  </button>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {product.unit || "box"}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: 제조일 + 유효 기간 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 제조일 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  제조일 *
                </label>
                <input
                  type="date"
                  value={batchForm.manufactureDate}
                  onChange={(e) => {
                    e.stopPropagation();
                    setBatchForm({
                      ...batchForm,
                      manufactureDate: e.target.value,
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>

              {/* 유효 기간 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  유효 기간 *
                </label>
                <input
                  type="date"
                  value={batchForm.expiryDate}
                  onChange={(e) => {
                    e.stopPropagation();
                    setBatchForm({ ...batchForm, expiryDate: e.target.value });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Row 3: 구매가 + 보관 위치 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 구매가 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  구매가 *
                </label>
                <div className="space-y-1">
                  <input
                    type="text"
                    placeholder="0"
                    value={
                      batchForm.purchasePrice
                        ? Number(batchForm.purchasePrice).toLocaleString()
                        : ""
                    }
                    onChange={(e) => {
                      e.stopPropagation();
                      const numericValue = e.target.value.replace(/,/g, "");
                      setBatchForm({
                        ...batchForm,
                        purchasePrice: numericValue,
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  {product.purchasePrice && (
                    <div className="text-xs text-slate-500">
                      전구매가 {Number(product.purchasePrice).toLocaleString()}{" "}
                      / {product.unit || "box"}
                    </div>
                  )}
                </div>
              </div>

              {/* 보관 위치 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  보관 위치
                </label>
                <input
                  type="text"
                  placeholder="보관 위치를 입력"
                  value={batchForm.storageLocation}
                  onChange={(e) => {
                    e.stopPropagation();
                    setBatchForm({
                      ...batchForm,
                      storageLocation: e.target.value,
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Row 4: 입고 직원 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  입고 직원 *
                </label>
                <input
                  type="text"
                  placeholder="이름 입력"
                  value={batchForm.inboundManager}
                  onChange={(e) => {
                    e.stopPropagation();
                    setBatchForm({
                      ...batchForm,
                      inboundManager: e.target.value,
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div className="space-y-2 ml-auto mt-8">
                <button
                  onClick={handleCreateBatch}
                  disabled={submittingBatch}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {submittingBatch ? "처리 중..." : "바코드 입고"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface ValidationError {
  row: number;
  data: any;
  valid: boolean;
  errors: string[];
}

interface PreviewData {
  total: number;
  valid: number;
  errors: number;
  results: ValidationError[];
}

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
}

function CSVImportModal({ isOpen, onClose, onImport }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [inboundManager, setInboundManager] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      alert("CSV 파일만 업로드 가능합니다.");
      return;
    }

    setFile(selectedFile);
    parseCSV(selectedFile);
  };

  const [showDuplicateGtinModal, setShowDuplicateGtinModal] = useState(false);
  const [showRequiredErrorModal, setShowRequiredErrorModal] = useState(false);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<
    { row: number; missingFields: string[] }[]
  >([]);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);

  /** Required fields and Korean labels for error modal */
  const REQUIRED_FIELDS_CSV: { label: string; check: (d: any) => boolean }[] = [
    { label: "제품명", check: (d) => !String(d?.name ?? "").trim() },
    { label: "제조사/유통사", check: (d) => !String(d?.brand ?? "").trim() },
    { label: "카테고리", check: (d) => !String(d?.category ?? "").trim() },
    { label: "재고 수량_단위", check: (d) => !String(d?.unit ?? "").trim() },
    {
      label: "최소 제품 수량",
      check: (d) => {
        const v = d?.min_stock;
        return v === undefined || v === null || Number(v) < 0;
      },
    },
    {
      label: "제품 용량",
      check: (d) => {
        const v = d?.capacity_per_product;
        return v === undefined || v === null || Number(v) < 0;
      },
    },
    {
      label: "사용 용량_단위",
      check: (d) => !String(d?.capacity_unit ?? "").trim(),
    },
    {
      label: "사용 용량",
      check: (d) => {
        const v = d?.usage_capacity;
        return v === undefined || v === null || Number(v) < 0;
      },
    },
    {
      label: "유효기간 임박 알림",
      check: (d) => {
        const v = d?.alert_days;
        return v === undefined || v === null || Number(v) < 0;
      },
    },
    {
      label: "유효기간 있음",
      check: (d) =>
        d?.has_expiry_period === undefined || d?.has_expiry_period === null,
    },
    {
      label: "담당자 핸드폰번호",
      check: (d) => !String(d?.contact_phone ?? "").trim(),
    },
    { label: "바코드", check: (d) => !String(d?.barcode ?? "").trim() },
  ];

  const getRequiredFieldErrors = (): {
    row: number;
    missingFields: string[];
  }[] => {
    if (!preview?.results?.length) return [];
    const list: { row: number; missingFields: string[] }[] = [];
    preview.results.forEach((r) => {
      const missing = REQUIRED_FIELDS_CSV.filter((f) => f.check(r.data)).map(
        (f) => f.label
      );
      if (missing.length > 0) list.push({ row: r.row, missingFields: missing });
    });
    return list;
  };

  // CSV 내 중복 GTIN 목록 (한 모달에 모아서 표시)
  const duplicateGtinList = (() => {
    if (!preview?.results?.length)
      return [] as { gtin: string; rows: number[]; name: string }[];
    const map = new Map<string, { rows: number[]; name: string }>();
    preview.results.forEach((r) => {
      const gtin = r.data?.barcode?.trim();
      const name = (r.data?.name ?? "")?.trim() || "—";
      if (gtin) {
        if (!map.has(gtin)) map.set(gtin, { rows: [], name });
        map.get(gtin)!.rows.push(r.row);
      }
    });
    return [...map.entries()]
      .filter(([, v]) => v.rows.length > 1)
      .map(([gtin, v]) => ({ gtin, rows: v.rows, name: v.name }));
  })();

  const parseCSV = (file: File) => {
    setLoading(true);
    setPreview(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep all fields as strings
      complete: async (results) => {
        try {
          const token = await getAccessToken();
          if (!token) {
            alert("로그인이 필요합니다.");
            setLoading(false);
            return;
          }

          const parseHasExpiryPeriod = (val: unknown): boolean | undefined => {
            const s = String(val ?? "").trim().toLowerCase();
            if (s === "") return undefined;
            if (s === "예" || s === "1" || s === "true" || s === "y" || s === "yes") return true;
            if (s === "아니오" || s === "0" || s === "false" || s === "n" || s === "no") return false;
            return undefined;
          };
          const mapCsvRowToEnglish = (row: any): any => {
            const get = (en: string, kr: string) => row[en] ?? row[kr] ?? "";
            const num = (en: string, kr: string) => {
              const v = row[en] ?? row[kr];
              if (v === "" || v === undefined || v === null) return undefined;
              const n = Number(String(v).replace(/[,\s]/g, ""));
              return isNaN(n) ? undefined : n;
            };
            const hasExpiryRaw = get("has_expiry_period", "유효기간 있음*");
            return {
              name: String(get("name", "제품명*")).trim(),
              brand: String(get("brand", "제조사/유통사*")).trim(),
              category: String(get("category", "카테고리*")).trim(),
              unit: String(get("unit", "재고 수량_단위*")).trim(),
              min_stock: num("min_stock", "최소 제품 수량*") ?? 0,
              capacity_per_product:
                num("capacity_per_product", "제품 용량*") ?? 0,
              capacity_unit: String(
                get("capacity_unit", "사용 용량_단위*")
              ).trim(),
              usage_capacity: num("usage_capacity", "사용 용량*") ?? 0,
              alert_days: num("alert_days", "유효기간 임박 알림*") ?? 0,
              has_expiry_period: parseHasExpiryPeriod(hasExpiryRaw),
              contact_phone: String(
                get("contact_phone", "담당자 핸드폰번호*")
              ).trim(),
              barcode: String(get("barcode", "바코드")).trim(),
              refund_amount: num("refund_amount", "반납가"),
              purchase_price: num("purchase_price", "구매가"),
              sale_price: num("sale_price", "판매가"),
            };
          };

          const { parseGS1Barcode } = await import("../../utils/barcodeParser");
          const normalizeToGtin = (barcode: string): string => {
            if (!barcode?.trim()) return "";
            try {
              const parsed = parseGS1Barcode(barcode.trim());
              return parsed?.gtin?.trim() || barcode.trim();
            } catch {
              return barcode.trim();
            }
          };
          const rawRows = (results.data as any[]).map(mapCsvRowToEnglish);
          const rows = rawRows.map((row: any) => ({
            ...row,
            barcode: normalizeToGtin(row.barcode || ""),
          }));

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/products/import/preview`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ rows }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.message || `HTTP ${response.status} error`
            );
          }

          const previewData = await response.json();
          setPreview(previewData);
        } catch (error: any) {
          console.error("Preview error:", error);
          alert(`미리보기 실패: ${error.message}`);
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        alert(`CSV 파일 파싱 실패: ${error.message}`);
        setLoading(false);
      },
    });
  };

  const handleConfirm = async () => {
    if (!preview || !file) return;

    const requiredErrors = getRequiredFieldErrors();
    if (requiredErrors.length > 0) {
      setRequiredFieldErrors(requiredErrors);
      setShowRequiredErrorModal(true);
      return;
    }

    setImporting(true);

    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      if (!token) {
        alert("로그인이 필요합니다.");
        setImporting(false);
        return;
      }

      // Send to backend for import
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/products/import/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rows: preview.results.map((r) => r.data),
            mode: "strict",
            inboundManager: inboundManager.trim(),
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = result?.message;
        const message = Array.isArray(msg)
          ? msg.join(". ")
          : (msg && String(msg).trim()) ||
            response.statusText ||
            (response.status === 400
              ? "유효성 검사 오류가 발생했습니다. CSV 파일에서 오류를 수정한 뒤 다시 시도해 주세요."
              : `요청 실패 (${response.status})`);
        setImportErrorMsg(message);
        setImporting(false);
        return;
      }

      const existingMsg =
        result.existingProductCount > 0
          ? `\n기존 제품 입고 추가: ${result.existingProductCount}건`
          : "";
      alert(
        `✅ Import 완료!\n\n` +
          `전체: ${result.total}개\n` +
          `성공: ${result.imported}개\n` +
          `실패: ${result.failed}개` +
          existingMsg
      );

      // Reset and close
      setFile(null);
      setPreview(null);
      setInboundManager(""); // Reset inbound manager
      onImport();
      onClose();
    } catch (error: any) {
      console.error("Import error:", error);
      const msg =
        error?.message ?? error?.response?.data?.message ?? "Import 실패";
      setImportErrorMsg(
        typeof msg === "string"
          ? msg
          : Array.isArray(msg)
            ? msg.join(". ")
            : "Import 실패"
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = [
      "제품명*,제조사/유통사*,카테고리,재고 수량_단위*,최소 제품 수량*,제품 용량*,사용 용량_단위*,사용 용량*,유효기간 임박 알림*,유효기간 있음*,담당자 핸드폰번호*,반납가,구매가,판매가,바코드",
      "제오민,멀츠 에스테틱스 코리아,보톡스,box,10,2,ea,1,30,예,01012345678,5000,000.000,0000,238947239843249234234",
      "제오민,멀츠 에스테틱스 코리아,보톡스,box,10,2,ea,1,30,아니오,01012345678,5000,000.000,0000,238947239843249234234",
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "products_template.csv";
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            📦 CSV 입고
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Template Download */}
          <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                📄 CSV 템플릿 다운로드
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                올바른 형식의 CSV 파일을 작성하려면 템플릿을 다운로드하세요.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              템플릿 다운로드
            </button>
          </div>

          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) handleFileSelect(selectedFile);
              }}
              className="hidden"
            />

            <div className="space-y-4">
              <div className="text-6xl">📂</div>
              <div>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                  {file ? file.name : "CSV 파일을 드래그하거나 클릭하세요"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  최대 10,000개 제품까지 업로드 가능
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                파일 선택
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">
                파일 검증 중...
              </p>
            </div>
          )}

          {/* Preview Results */}
          {preview && !loading && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {preview.total}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    전체
                  </div>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {preview.valid}
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-500 mt-1">
                    성공
                  </div>
                </div>
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {preview.errors}
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-500 mt-1">
                    오류
                  </div>
                </div>
              </div>

              {/* Import Mode Selection (if errors exist) */}
              {/* 중복 GTIN 한 모달로 보기 */}
              {duplicateGtinList.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateGtinModal(true)}
                    className="text-sm font-medium text-amber-800 hover:underline dark:text-amber-200"
                  >
                    중복 GTIN {duplicateGtinList.length}건 보기
                  </button>
                </div>
              )}

              {/* Error List (show first 20 errors) */}
              {/* {preview.errors > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <h4 className="font-semibold text-red-600 dark:text-red-400">
                    오류 목록 (최대 20개 표시):
                  </h4>
                  {preview.results
                    .filter((r) => !r.valid)
                    .slice(0, 20)
                    .map((error, idx) => (
                      <div
                        key={idx}
                        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm"
                      >
                        <div className="font-semibold text-red-900 dark:text-red-100">
                          행 {error.row}:
                        </div>
                        <ul className="mt-1 space-y-1 text-red-700 dark:text-red-300">
                          {error.errors.map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                        </ul>
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto">
                          {JSON.stringify(error.data, null, 2)}
                        </div>
                      </div>
                    ))}
                  {preview.errors > 20 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                      ... 그리고 {preview.errors - 20}개 오류 더
                    </p>
                  )}
                </div>
              )} */}

              {/* Success Message */}
              {preview.errors === 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="font-semibold text-green-900 dark:text-green-100">
                    모든 데이터가 유효합니다!
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {preview.valid}개 제품을 입고할 준비가 되었습니다.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setInboundManager("");
                onClose();
              }}
              disabled={importing}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!preview || importing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing
                ? "Import 중..."
                : `Import (${preview?.valid || 0}개 제품)`}
            </button>
          </div>
        </div>
      </div>

      {/* 중복 GTIN 모달 (CSV 내 동일 바코드) */}
      {showDuplicateGtinModal && duplicateGtinList.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDuplicateGtinModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-amber-200 bg-white shadow-xl dark:border-amber-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                CSV 내 중복 GTIN
              </h3>
              <button
                type="button"
                onClick={() => setShowDuplicateGtinModal(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                아래 GTIN이 파일 내에서 2회 이상 사용되었습니다. 행 번호를
                확인하세요.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      GTIN
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      제품명
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      행 번호
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateGtinList.map(({ gtin, rows, name }, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 font-mono text-slate-900 dark:text-slate-100">
                        {gtin}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {name}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {rows.sort((a, b) => a - b).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowDuplicateGtinModal(false)}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 필수 입력 누락 Error Alert 모달 */}
      {showRequiredErrorModal && requiredFieldErrors.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowRequiredErrorModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="font-semibold text-red-700 dark:text-red-300">
                필수 입력 누락
              </h3>
              <button
                type="button"
                onClick={() => setShowRequiredErrorModal(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                아래 행에서 필수 항목이 비어 있습니다. 해당 행을 수정한 뒤 다시
                시도하세요.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      행 번호
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      누락된 항목
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requiredFieldErrors.map(({ row, missingFields }, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 font-mono text-slate-900 dark:text-slate-100">
                        {row}
                      </td>
                      <td className="py-2 text-red-600 dark:text-red-400">
                        {missingFields.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowRequiredErrorModal(false)}
                className="w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import 실패 Error Modal */}
      {importErrorMsg && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setImportErrorMsg(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </span>
                <h3 className="font-semibold text-red-700 dark:text-red-300">
                  CSV 입고 실패!
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setImportErrorMsg(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="닫기"
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
            </div>
            <div className="px-4 py-4">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {importErrorMsg}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                오류를 수정한 뒤 CSV 파일을 다시 업로드해 주세요.
              </p>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setImportErrorMsg(null)}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  options: string[] | { label: string; value: string }[];
  value?: string;
  onChange?: (value: string) => void;
  defaultValue: string;
}

function FilterChip({
  label,
  options,
  value,
  onChange,
  defaultValue,
}: FilterChipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const resolvedOptions = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

  const displayValue = value || defaultValue;
  const selectedOption = resolvedOptions.find(
    (opt) => opt.value === displayValue
  );

  const handleSelect = (optionValue: string) => {
    if (onChange) {
      onChange(optionValue);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
      >
        <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {selectedOption?.label || displayValue}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="max-h-60 overflow-auto py-1">
              {resolvedOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full px-4 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    displayValue === option.value
                      ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      // Agar barcha sahifalar ko'rsatilishi mumkin bo'lsa
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Agar ko'p sahifalar bo'lsa
      if (currentPage <= 3) {
        // Boshida
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Oxirida
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // O'rtada
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {currentPage}
        </span>
        {" / "}
        <span className="text-slate-500 dark:text-slate-400">{totalPages}</span>
        {" 페이지"}
      </div>

      <div className="flex items-center gap-2">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800"
          aria-label="이전 페이지"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === "...") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="flex h-10 w-10 items-center justify-center text-slate-500 dark:text-slate-400"
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-medium transition ${
                  isActive
                    ? "border-sky-500 bg-sky-500 text-white shadow-sm hover:bg-sky-600 hover:border-sky-600"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                }`}
                aria-label={`${pageNum} 페이지`}
                aria-current={isActive ? "page" : undefined}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800"
          aria-label="다음 페이지"
        >
          <ChevronIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 19.5L8.25 12l7.5-7.5"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isComplete = status === "입고 완료";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        isComplete
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
      }`}
    >
      {status}
    </span>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1115 6.75a7.5 7.5 0 011.65 9.9z"
      />
    </svg>
  );
}

function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4.5h12M8.25 9h7.5M10.5 13.5h3M9 18h6"
      />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5l9 4.5 9-4.5M3 7.5l9-4.5 9 4.5M3 7.5v9l9 4.5m0-13.5v9l9-4.5v-9"
      />
    </svg>
  );
}

function WonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5h4.5L9 16l3-8.5 3 8.5 1.5-8.5H21M3 12h18M3 16.5h18"
      />
    </svg>
  );
}

function WarehouseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5l9-4.5 9 4.5v10.5a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V7.5z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5h6V21H9z" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 9h18M4.5 7.5h15a1.5 1.5 0 011.5 1.5v11.25A1.5 1.5 0 0119.5 21H4.5A1.5 1.5 0 013 19.5V9a1.5 1.5 0 011.5-1.5z"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function InlineField({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  // Number input uchun scroll/spinner'ni yashirish
  const numberInputClasses =
    type === "number"
      ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
      : "";

  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        className={`h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 ${numberInputClasses}`}
      />
    </div>
  );
}

function QuantityField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const handleDecrement = () => {
    onChange(Math.max(1, value - 1));
  };

  const handleIncrement = () => {
    onChange(value + 1);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isNaN(next) && next > 0) {
      onChange(next);
    }
  };

  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        입고 수량 *
      </label>
      <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700">
        <button
          type="button"
          onClick={handleDecrement}
          className="h-11 w-12 border-r border-slate-200 bg-white text-lg font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700"
        >
          -
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={handleInputChange}
          className="h-11 flex-1 appearance-none border-0 bg-white text-center text-base font-semibold text-slate-800 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
        <button
          type="button"
          onClick={handleIncrement}
          className="h-11 w-12 border-l border-slate-200 bg-white text-lg font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 7.125L16.875 4.5"
      />
    </svg>
  );
}

// Pending Orders List Component
const PendingOrdersList = memo(function PendingOrdersList({
  orders,
  loading,
  isRefreshing,
  error,
  apiUrl,
  onRefresh,
  setShowKeyboardWarning,
  setBarcodeNotFoundModal,
}: {
  orders: any[];
  loading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  apiUrl: string;
  onRefresh: () => void;
  setShowKeyboardWarning: (show: boolean) => void;
  setBarcodeNotFoundModal: (data: {
    show: boolean;
    barcode: string;
    gtin: string;
  }) => void;
}) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [editedItems, setEditedItems] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states for quantity mismatch
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [modalData, setModalData] = useState<any>(null);

  // Extract member data once with useMemo
  const memberInfo = useMemo(() => {
    if (typeof window === "undefined") return null;
    const memberData = localStorage.getItem("erp_member_data");
    return memberData ? JSON.parse(memberData) : {};
  }, []);

  // ✅ REMOVED: Auto-fill inbound manager name - user should fill manually
  // const inboundManagerName = useMemo(
  //   () => memberInfo?.full_name || memberInfo?.member_id || "알 수 없음",
  //   [memberInfo]
  // );

  // ✅ ADD: State for inbound managers per order
  const [inboundManagers, setInboundManagers] = useState<
    Record<string, string>
  >({});

  // ✅ NEW: Barcode Scanner Modal States
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanModalOrderId, setScanModalOrderId] = useState<string | null>(null); // Only show products for this order
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [showProductConfirm, setShowProductConfirm] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [activeItemId, setActiveItemId] = useState<number | null>(null); // Track active product by itemId
  const [scanModalInboundStaff, setScanModalInboundStaff] = useState("");
  // Manual lot panel (스캐너 없이): which product's form is open
  const [expandedManualLotItemId, setExpandedManualLotItemId] = useState<
    number | null
  >(null);
  const [manualLotForm, setManualLotForm] = useState<{
    lotNumber: string;
    productionDate: string;
    expiryDate: string;
    quantity: number;
  }>({
    lotNumber: "",
    productionDate: "",
    expiryDate: "",
    quantity: 0,
  });

  // ✅ Ref so handleBarcodeScan always sees latest scannedItems (avoids stale closure + double setState overwrite)
  const scannedItemsRef = useRef<any[]>([]);
  const scanModalOpenRef = useRef(false);
  const scanModalOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    scannedItemsRef.current = scannedItems;
  }, [scannedItems]);
  useEffect(() => {
    scanModalOpenRef.current = scanModalOpen;
    scanModalOrderIdRef.current = scanModalOrderId;
  }, [scanModalOpen, scanModalOrderId]);

  // 🔍 Debug: scannedItems o‘zgarganda (입고 수량 0 ga tushishini kuzatish)
  useEffect(() => {
    if (!scanModalOpen || scannedItems.length === 0) return;
    const summary = scannedItems.map((p) => ({
      name: p.productName,
      quantity: p.quantity,
      status: p.status,
    }));
  }, [scannedItems, scanModalOpen]);

  // ✅ Order bo‘yicha skan modal uchun mahsulotlar ro‘yxatini qaytaradi (sync, ref/state dan oldin to‘ldirish uchun)
  const getPendingProductsForOrder = useCallback(
    (orderId: string) => {
      const allProducts: any[] = [];
      const seenIds = new Set<string>();
      const ordersToUse = orders.filter((o) => (o.id || o.orderId) === orderId);

      ordersToUse.forEach((order) => {
        if (
          order.status === "supplier_confirmed" ||
          order.status === "pending_inbound"
        ) {
          order.items?.forEach((item: any) => {
            const confirmedQty =
              item.confirmedQuantity || item.orderedQuantity || 0;
            const alreadyInbound = item.inboundQuantity || 0;
            const remainingQty = confirmedQty - alreadyInbound;

            if (remainingQty > 0) {
              const uniqueId = `${order.id}-${item.id}`;
              if (seenIds.has(uniqueId)) return;
              seenIds.add(uniqueId);

              allProducts.push({
                id: uniqueId,
                orderId: order.id,
                orderNo: order.orderNo,
                itemId: item.id,
                productId: item.productId,
                productName: item.productName,
                brand: item.brand || "",
                barcode: item.product?.barcode || "",
                quantity: 0,
                lotQuantities: {} as Record<string, number>,
                lotDetails: {} as Record<
                  string,
                  { manufactureDate?: string; expiryDate?: string }
                >,
                expiryDate: "",
                productionDate: "",
                storageLocation: "",
                batchNumber: "",
                manufactureDate: "",
                lotNumber: "",
                remainingQty,
                order,
                item,
                status: "pending",
              });
            }
          });
        }
      });

      return allProducts;
    },
    [orders]
  );

  // ✅ Load products for barcode modal (useEffect backup — asosan openBarcodeScanForOrder da sync to‘ldiramiz)
  const loadPendingProducts = useCallback(
    (orderId?: string) => {
      if (!orderId) return;
      const allProducts = getPendingProductsForOrder(orderId);
      setScannedItems(allProducts);
      scannedItemsRef.current = allProducts;
    },
    [getPendingProductsForOrder]
  );

  // ✅ Modal ochilganda agar ro‘yxat bo‘sh bo‘lsa (masalan, boshqa tabdan keldi) — backup load
  useEffect(() => {
    const shouldLoad =
      scanModalOpen &&
      scanModalOrderId &&
      orders.length > 0 &&
      scannedItems.length === 0;

    if (shouldLoad) {
      loadPendingProducts(scanModalOrderId);
    }
  }, [
    scanModalOpen,
    scanModalOrderId,
    orders.length,
    scannedItems.length,
    loadPendingProducts,
  ]);

  // ✅ Modal ochilganda darhol ro‘yxatni to‘ldiramiz (birinchi skan "0 items" bo‘lmasin)
  const openBarcodeScanForOrder = useCallback(
    (orderId: string) => {
      // Modal allaqachon shu order uchun ochiq va ro‘yxat bor bo‘lsa — ustiga yozma (입고 수량 0 ga tushmasin)
      if (
        scanModalOpenRef.current &&
        scanModalOrderIdRef.current === orderId &&
        scannedItemsRef.current.length > 0
      ) {
        console.log(
          "[ScanModal] openBarcodeScanForOrder: modal allaqachon ochiq, ro‘yxatni saqlab qolamiz"
        );
        setScanModalOrderId(orderId);
        setScanModalOpen(true);
        return;
      }
      const products = getPendingProductsForOrder(orderId);

      setScannedItems(products);
      scannedItemsRef.current = products;
      setScanModalOrderId(orderId);
      setScanModalOpen(true);
    },
    [getPendingProductsForOrder]
  );

  // ✅ Close modal and reset state
  const closeScanModal = () => {
    console.trace("[ScanModal] closeScanModal call stack");
    setScanModalOpen(false);
    setScanModalOrderId(null);
    setScannedItems([]);
    scannedItemsRef.current = [];
    setActiveItemId(null);
    setScanModalInboundStaff("");
    setExpandedManualLotItemId(null);
    setManualLotForm({
      lotNumber: "",
      productionDate: "",
      expiryDate: "",
      quantity: 0,
    });
  };

  // Initialize edited items when orders change - optimized with useMemo
  const initialEditedItems = useMemo(() => {
    const initialEdits: Record<string, any> = {};
    orders.forEach((order) => {
      order.items?.forEach((item: any) => {
        initialEdits[item.id] = {
          quantity: "",
          expiryDate: "",
          storageLocation: "",
          purchasePrice: "",
        };
      });
    });
    return initialEdits;
  }, [orders]);

  // Sync editedItems with initialEditedItems when orders change
  useEffect(() => {
    setEditedItems(initialEditedItems);
  }, [initialEditedItems]);

  // ✅ ADD: Initialize inboundManagers when orders change
  useEffect(() => {
    if (orders.length > 0) {
      setInboundManagers((prev) => {
        const updated: Record<string, string> = { ...prev };
        let hasChanges = false;

        orders.forEach((order: any) => {
          const orderId = order.id || order.orderId;
          if (orderId && !updated[orderId]) {
            // ✅ Initialize with empty string (user must enter manually)
            updated[orderId] = "";
            hasChanges = true;
          }
        });

        return hasChanges ? updated : prev;
      });
    }
  }, [orders]);

  // Pagination calculations
  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentOrders = orders.slice(startIndex, endIndex);

  // Reset to page 1 when orders change
  useEffect(() => {
    setCurrentPage(1);
  }, [orders.length]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ✅ NEW: GS1 Barcode Parser
  // ✅ Import production-level GS1 barcode parser
  const parseGS1Barcode = async (barcode: string) => {
    try {
      const { parseGS1Barcode: parse } = await import("../../utils/gs1Parser");
      const parsed = parse(barcode, { mode: "lenient" });

      // Create comprehensive GTIN variants for matching
      const gtinVariants: string[] = [];

      if (parsed.primary_gtin) {
        const gtin14 = parsed.primary_gtin;
        gtinVariants.push(gtin14);

        // EAN-13: Remove first digit
        if (gtin14.length === 14) {
          gtinVariants.push(gtin14.substring(1));
          // UPC-12: Remove first 2 digits
          gtinVariants.push(gtin14.substring(2));
          // Zero-padded EAN-13
          gtinVariants.push("0" + gtin14.substring(1));
        }
      }

      // Convert to compatible format
      const expiryDate = parsed.expiry || "";

      return {
        gtin: parsed.primary_gtin || "",
        gtinVariants,
        expiryDate,
        productionDate: parsed.prod_date || "", // ✅ AI 11
        batchNumber: parsed.batch || "",
        originalBarcode: barcode,
        errors: parsed.errors,
        raw_tail: parsed.raw_tail,
      };
    } catch (error) {
      console.error("[parseGS1Barcode] Error:", error);
      // Fallback to empty
      return {
        gtin: "",
        gtinVariants: [],
        expiryDate: "",
        productionDate: "", // ✅ AI 11
        batchNumber: "",
        originalBarcode: barcode,
        errors: [],
      };
    }
  };

  // ✅ NEW: Find order by barcode - prioritize items already in scannedItems
  const findOrderByBarcode = async (barcode: string) => {
    const parsed = await parseGS1Barcode(barcode);
    const searchVariants = [
      barcode,
      parsed.gtin,
      ...parsed.gtinVariants,
    ].filter(Boolean);

    // First, try to find matching product in scannedItems (ref = always latest)
    const currentList = scannedItemsRef.current;
    const pendingOrActive = currentList.find((p) => {
      if (p.status !== "pending" && p.status !== "active") return false;

      return searchVariants.some(
        (variant) =>
          p.barcode === variant ||
          p.product?.barcode === variant ||
          p.productId === variant
      );
    });

    if (pendingOrActive) {
      // Return the order and item from scannedItems
      return {
        order: pendingOrActive.order,
        item: pendingOrActive.item,
        parsed,
      };
    }

    // If not found in scannedItems, search in orders
    for (const order of orders) {
      for (const item of order.items || []) {
        const productBarcode = item.product?.barcode || item.barcode;

        if (searchVariants.some((variant) => productBarcode === variant)) {
          return {
            order,
            item,
            parsed,
            fromCatalog: false,
          };
        }
      }
    }

    // Not in order: try product catalog by GTIN (product/new da qo‘shilgan mahsulot)
    for (const gtin of searchVariants) {
      if (!gtin) continue;
      try {
        const { apiGet } = await import("../../lib/api");
        const product = await apiGet<any>(
          `${apiUrl}/products/barcode/${encodeURIComponent(gtin)}`
        );
        if (product && product.id) {
          const currentOrder = scanModalOrderId
            ? orders.find((o) => (o.id || o.orderId) === scanModalOrderId)
            : orders[0];
          const syntheticItem = {
            id: product.id,
            productId: product.id,
            productName: product.productName ?? product.name ?? "알 수 없음",
            brand: product.brand ?? "",
            product: { barcode: product.barcode ?? gtin },
            confirmedQuantity: 0,
            orderedQuantity: 0,
            unit_price: product.purchasePrice ?? 0,
          };
          return {
            order: currentOrder ?? null,
            item: syntheticItem,
            parsed,
            fromCatalog: true,
          };
        }
      } catch (_) {
        // barcode endpoint returns 404 if not found
      }
    }

    return null;
  };

  // ✅ NEW: USB Barcode Scanner Listener (only when modal is open)
  useEffect(() => {
    if (!scanModalOpen) return;

    let buffer = "";
    let lastTime = 0;
    let timeout: NodeJS.Timeout;

    // ✅ Track keyboard layout warnings to avoid spam
    let lastKeyboardWarning = 0;
    let koreanCharDetected = false;

    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ignore if typing in input field
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // ✅ CRITICAL: Detect Korean/IME input BEFORE ignoring it
      if (e.isComposing || e.keyCode === 229) {
        if (!koreanCharDetected) {
          setShowKeyboardWarning(true); // ✅ Show modal instead of alert
          koreanCharDetected = true;
          setTimeout(() => {
            koreanCharDetected = false;
          }, 5000);
        }
        buffer = "";
        return;
      }

      const now = Date.now();

      // Reset buffer if too much time passed (scanner is faster)
      if (now - lastTime > 100) {
        buffer = "";
      }

      // Enter = scan complete
      if (e.key === "Enter" && buffer.length > 0) {
        e.preventDefault();
        // ✅ STRICT: Only allow alphanumeric characters (GS1 standard)
        const cleanedBarcode = buffer.trim().replace(/[^0-9A-Za-z]/g, "");

        handleBarcodeScan(cleanedBarcode);
        buffer = "";
      } else if (e.key.length === 1) {
        // ✅ STRICT: Only accept digits and letters (0-9, A-Z, a-z)
        if (/[0-9A-Za-z]/.test(e.key)) {
          buffer += e.key;
          lastTime = now;

          clearTimeout(timeout);
          timeout = setTimeout(() => {
            buffer = "";
          }, 500);
        } else {
          // ✅ Non-alphanumeric detected - likely Korean keyboard
          if (!koreanCharDetected) {
            setShowKeyboardWarning(true); // ✅ Show modal instead of alert
            koreanCharDetected = true;
            setTimeout(() => {
              koreanCharDetected = false;
            }, 5000);
          }
          buffer = "";
          console.warn(
            "[Barcode Scanner] ⚠️ Ignored non-alphanumeric:",
            e.key,
            "charCode:",
            e.key.charCodeAt(0)
          );
        }
      }
    };

    window.addEventListener("keypress", handleKeyPress);
    return () => {
      window.removeEventListener("keypress", handleKeyPress);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanModalOpen]); // handleBarcodeScan uses latest scannedItems via closure

  // ✅ NEW: Handle barcode scan
  const handleBarcodeScan = async (barcode: string) => {
    const parsed = await parseGS1Barcode(barcode);

    const searchVariants = [
      barcode,
      parsed.gtin,
      ...parsed.gtinVariants,
    ].filter(Boolean);

    // STEP 1: Read latest scannedItems from ref (sync) — avoid setState-for-read which causes double update / overwrite
    const prevItems = scannedItemsRef.current;
    const existingItem = prevItems.find((p) => {
      if (p.status !== "pending" && p.status !== "active") return false;
      return (
        searchVariants.some(
          (variant) =>
            p.product?.barcode === variant ||
            p.barcode === variant ||
            p.productId === variant
        ) ||
        p.productId === parsed.gtin ||
        p.itemId === parsed.gtin
      );
    });

    if (existingItem) {
      setActiveItemId(existingItem.itemId);
      setScannedItems((prev) => {
        if (prev.length === 0) return prev; // loadPendingProducts hali commit bo‘lmagan bo‘lishi mumkin
        const next = prev.map((p) => {
          if (p.itemId !== existingItem.itemId) {
            if (p.status === "active") return { ...p, status: "pending" };
            return p;
          }
          const lotKey = (parsed.batchNumber || "").trim() || "__default";
          const prevLots = p.lotQuantities || {};
          const lotQuantities = {
            ...prevLots,
            [lotKey]: (prevLots[lotKey] ?? 0) + 1,
          };
          const newQty = (Object.values(lotQuantities) as number[]).reduce(
            (a, b) => a + b,
            0
          );
          const maxQty = existingItem.remainingQty ?? newQty;
          const cappedQty = Math.min(newQty, maxQty);
          let finalLotQuantities = lotQuantities;
          if (cappedQty < newQty && lotQuantities[lotKey] > 0) {
            const diff = newQty - cappedQty;
            finalLotQuantities = {
              ...lotQuantities,
              [lotKey]: Math.max(0, lotQuantities[lotKey] - diff),
            };
          }
          const finalQty = (
            Object.values(finalLotQuantities) as number[]
          ).reduce((a, b) => a + b, 0);
          const prevDetails = p.lotDetails || {};
          const lotDetails = {
            ...prevDetails,
            [lotKey]: {
              manufactureDate:
                parsed.productionDate || prevDetails[lotKey]?.manufactureDate,
              expiryDate: parsed.expiryDate || prevDetails[lotKey]?.expiryDate,
            },
          };
          const itemExpiry = parsed.expiryDate || p.expiryDate;

          return {
            ...p,
            lotQuantities: finalLotQuantities,
            lotDetails,
            quantity: finalQty,
            expiryDate: itemExpiry,
            productionDate: parsed.productionDate || p.productionDate,
            batchNumber: parsed.batchNumber || p.batchNumber,
            lotNumber: parsed.batchNumber || p.lotNumber,
            barcode: parsed.originalBarcode,
            status: "active",
          };
        });
        scannedItemsRef.current = next;
        const updatedItem = next.find((x) => x.itemId === existingItem.itemId);

        return next;
      });

      return;
    }

    // STEP 2: If not in scannedItems, find in orders
    const result = await findOrderByBarcode(barcode);

    if (!result) {
      // Debug: Show all product barcodes in orders

      setBarcodeNotFoundModal({
        show: true,
        barcode: barcode,
        gtin: parsed.gtin || "없음",
      });
      return;
    }

    const { order, item, fromCatalog } = result;
    const isFromCatalog = !!fromCatalog;

    // Catalog product: no order limit; order item: remaining from order
    const confirmedQty = item.confirmedQuantity ?? item.orderedQuantity ?? 0;
    const alreadyInbound = item.inboundQuantity ?? 0;
    const remainingQty = isFromCatalog
      ? 99999
      : Math.max(0, confirmedQty - alreadyInbound);

    if (!isFromCatalog) {
      console.warn(
        "⚠️ Product found in order but not in scannedItems - adding as fallback"
      );
    }

    // Check if this ID already exists in scannedItems (prevent duplicate)
    setScannedItems((prev) => {
      const proposedId = order
        ? `${order.id}-${item.id}`
        : `catalog-${item.productId}`;
      const alreadyExists = prev.some((p) => p.id === proposedId);

      if (alreadyExists) {
        const existingIndex = prev.findIndex((p) => p.id === proposedId);
        if (existingIndex !== -1) {
          setActiveItemId(prev[existingIndex].itemId);
          const next = prev.map((p, i) => {
            if (i === existingIndex) {
              const lotKey = (parsed.batchNumber || "").trim() || "__default";
              const prevLots = p.lotQuantities || {};
              const lotQuantities = {
                ...prevLots,
                [lotKey]: (prevLots[lotKey] ?? 0) + 1,
              };
              const newQty = (Object.values(lotQuantities) as number[]).reduce(
                (a, b) => a + b,
                0
              );
              const cappedQty = Math.min(newQty, remainingQty);
              let finalLotQuantities = lotQuantities;
              if (cappedQty < newQty && lotQuantities[lotKey] > 0) {
                const diff = newQty - cappedQty;
                finalLotQuantities = {
                  ...lotQuantities,
                  [lotKey]: Math.max(0, lotQuantities[lotKey] - diff),
                };
              }
              const finalQty = (
                Object.values(finalLotQuantities) as number[]
              ).reduce((a, b) => a + b, 0);
              const prevDetails = p.lotDetails || {};
              const lotDetails = {
                ...prevDetails,
                [lotKey]: {
                  manufactureDate:
                    parsed.productionDate ||
                    prevDetails[lotKey]?.manufactureDate,
                  expiryDate:
                    parsed.expiryDate || prevDetails[lotKey]?.expiryDate,
                },
              };
              return {
                ...p,
                lotQuantities: finalLotQuantities,
                lotDetails,
                quantity: finalQty,
                expiryDate: parsed.expiryDate || p.expiryDate,
                batchNumber: parsed.batchNumber || p.batchNumber,
                lotNumber: parsed.batchNumber || p.lotNumber,
                barcode: parsed.originalBarcode,
                status: "active",
              };
            }
            if (p.status === "active") {
              return { ...p, status: "pending" };
            }
            return p;
          });
          scannedItemsRef.current = next;
          return next;
        }
        return prev;
      }

      const lotKey = (parsed.batchNumber || "").trim() || "__default";
      const newProduct = {
        id: proposedId,
        orderId: order?.id ?? null,
        orderNo: order?.orderNo ?? "",
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        brand: item.brand ?? "",
        barcode: parsed.originalBarcode,
        quantity: 1,
        lotQuantities: { [lotKey]: 1 } as Record<string, number>,
        lotDetails: {
          [lotKey]: {
            manufactureDate: parsed.productionDate,
            expiryDate: parsed.expiryDate,
          },
        } as Record<string, { manufactureDate?: string; expiryDate?: string }>,
        expiryDate: parsed.expiryDate,
        productionDate: parsed.productionDate,
        storageLocation: "",
        batchNumber: parsed.batchNumber,
        manufactureDate: "",
        lotNumber: parsed.batchNumber,
        remainingQty,
        order: order ?? null,
        item,
        product: item.product,
        status: "active",
        fromCatalog: isFromCatalog,
      };

      setActiveItemId(item.id);

      // Set all existing active items to pending and add new product
      const next = [
        ...prev.map((p) =>
          p.status === "active" ? { ...p, status: "pending" } : p
        ),
        newProduct,
      ];
      scannedItemsRef.current = next;
      return next;
    });
  };

  // ✅ NEW: Update scanned product data by itemId
  const updateScannedProduct = (itemId: number, updates: Partial<any>) => {
    setScannedItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, ...updates } : item
      )
    );
  };

  // ✅ Update one lot's quantity for a scanned product; recalc total quantity
  const updateScannedProductLotQty = (
    itemId: number,
    lotKey: string,
    qty: number
  ) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        const lotQuantities = {
          ...(item.lotQuantities || {}),
          [lotKey]: Math.max(0, qty),
        };
        const quantity = (Object.values(lotQuantities) as number[]).reduce(
          (a, b) => a + b,
          0
        );
        return { ...item, lotQuantities, quantity };
      })
    );
  };

  // ✅ Update one lot's dates (제조일, 유효기간)
  const updateScannedProductLotDetails = (
    itemId: number,
    lotKey: string,
    details: { manufactureDate?: string; expiryDate?: string }
  ) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        const lotDetails = {
          ...(item.lotDetails || {}),
          [lotKey]: { ...(item.lotDetails?.[lotKey] || {}), ...details },
        };
        return { ...item, lotDetails };
      })
    );
  };

  // ✅ Remove one lot from a product (X button on sub-card); recalc quantity
  const removeScannedProductLot = (itemId: number, lotKey: string) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        const lotQuantities = { ...(item.lotQuantities || {}) };
        delete lotQuantities[lotKey];
        const lotDetails = { ...(item.lotDetails || {}) };
        delete lotDetails[lotKey];
        const quantity = (Object.values(lotQuantities) as number[]).reduce(
          (a, b) => a + b,
          0
        );
        return { ...item, lotQuantities, lotDetails, quantity };
      })
    );
  };

  // ✅ Manual lot 추가 (모달 내 스캐너 없이 수동 입력) — same logic as barcode scan
  const addManualLotToScannedItem = (
    itemId: number,
    data: {
      lotNumber: string;
      productionDate: string;
      expiryDate: string;
      quantity: number;
    }
  ) => {
    const qty = Math.max(0, data.quantity || 0);
    if (qty <= 0) return;
    const trimmedLot = (data.lotNumber || "").trim();
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        const prevLots = item.lotQuantities || {};
        const hasExistingLots =
          Object.keys(prevLots).length > 0 &&
          (Object.values(prevLots) as number[]).some((n) => Number(n) > 0);
        const existingQty = item.quantity ?? 0;
        const prevDetails = item.lotDetails || {};
        let lotKey: string;
        if (trimmedLot) {
          lotKey = trimmedLot;
        } else {
          lotKey = `__manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
        let baseLots = { ...prevLots };
        let baseDetails = { ...prevDetails };
        if (!hasExistingLots && existingQty > 0) {
          baseLots = { __default: existingQty };
          if (item.productionDate || item.expiryDate) {
            baseDetails = {
              ...prevDetails,
              __default: {
                manufactureDate: item.productionDate,
                expiryDate: item.expiryDate,
              },
            };
          }
        }
        const lotQuantities = {
          ...baseLots,
          [lotKey]: (baseLots[lotKey] ?? 0) + qty,
        };
        let newQty = (Object.values(lotQuantities) as number[]).reduce(
          (a, b) => a + b,
          0
        );
        const remainingQty = item.remainingQty ?? 99999;
        if (newQty > remainingQty) {
          const diff = newQty - remainingQty;
          const cur = lotQuantities[lotKey] ?? 0;
          lotQuantities[lotKey] = Math.max(0, cur - diff);
          newQty = (Object.values(lotQuantities) as number[]).reduce(
            (a, b) => a + b,
            0
          );
        }
        const lotDetails = {
          ...baseDetails,
          [lotKey]: {
            manufactureDate:
              data.productionDate || baseDetails[lotKey]?.manufactureDate,
            expiryDate: data.expiryDate || baseDetails[lotKey]?.expiryDate,
          },
        };
        return {
          ...item,
          lotQuantities: { ...lotQuantities },
          lotDetails,
          quantity: newQty,
          expiryDate: data.expiryDate || item.expiryDate,
          productionDate: data.productionDate || item.productionDate,
          batchNumber: data.lotNumber || item.batchNumber,
          lotNumber: data.lotNumber || item.lotNumber,
          status: "active" as const,
        };
      })
    );
    setActiveItemId(itemId);
  };

  // ✅ Mark product as completed (xuddi skaner — faqat status)
  const completeCurrentProduct = () => {
    if (!activeItemId) return;
    setScannedItems((prev) =>
      prev.map((item) =>
        item.itemId === activeItemId
          ? { ...item, status: "completed" as const }
          : item
      )
    );
    setActiveItemId(null);
  };

  // ✅ NEW: Remove scanned product by itemId
  const removeScannedProduct = (itemId: number) => {
    setScannedItems((prev) => prev.filter((item) => item.itemId !== itemId));
    if (activeItemId === itemId) {
      setActiveItemId(null);
    }
  };

  // ✅ NEW: Submit all scanned items (batch inbound)
  const submitAllScannedItems = async () => {
    if (scannedItems.length === 0) {
      alert("스캔된 제품이 없습니다.");
      return;
    }
    const inboundStaff = scanModalInboundStaff.trim();
    if (!inboundStaff) {
      alert("입고 직원 이름을 입력해주세요.");
      return;
    }
    setInboundManagers((prev) => {
      const next = { ...prev };
      scannedItems.forEach((it) => {
        const oid = it.orderId;
        if (oid) next[oid] = inboundStaff;
      });
      return next;
    });

    try {
      const catalogItems = scannedItems.filter((it) => it.fromCatalog);
      const orderItems = scannedItems.filter((it) => !it.fromCatalog);

      // Catalog mahsulotlar uchun to‘g‘ridan-to‘g‘ri batch yaratish (GTIN orqali qo‘shilgan)
      if (catalogItems.length > 0) {
        const { apiPost } = await import("../../lib/api");
        for (const it of catalogItems) {
          const productId = it.productId;
          const purchasePrice = Number(it.item?.unit_price) || 0;
          const lotQuantities = it.lotQuantities || {};
          const lotDetails = (it.lotDetails || {}) as Record<
            string,
            { manufactureDate?: string; expiryDate?: string }
          >;
          const hasMultipleLots =
            Object.keys(lotQuantities).filter((k) => k !== "__default").length >
            0;

          if (hasMultipleLots) {
            for (const [lotKey, qtyVal] of Object.entries(lotQuantities)) {
              const qtyNum = Number(qtyVal);
              if (qtyNum <= 0) continue;
              const batchNo =
                lotKey === "__default" ? (it.lotNumber || "").trim() : lotKey;
              const perLotExpiry =
                lotDetails[lotKey]?.expiryDate ?? it.expiryDate;
              const perLotManufacture = lotDetails[lotKey]?.manufactureDate;
              const payload: any = {
                qty: qtyNum,
                purchase_price: purchasePrice,
                expiry_date: perLotExpiry,
                inbound_manager: inboundStaff,
              };
              if (batchNo) payload.batch_no = batchNo;
              if (perLotManufacture)
                payload.manufacture_date = perLotManufacture;
              if (it.storageLocation) payload.storage = it.storageLocation;
              await apiPost<any>(
                `${apiUrl}/products/${productId}/batches`,
                payload
              );
            }
          } else {
            const qty =
              it.quantity ??
              (Object.values(lotQuantities) as number[]).reduce(
                (a, b) => a + b,
                0
              );
            if (qty <= 0) continue;
            const payload: any = {
              qty,
              purchase_price: purchasePrice,
              expiry_date: it.expiryDate,
              inbound_manager: inboundStaff,
            };
            if (it.lotNumber?.trim()) payload.batch_no = it.lotNumber.trim();
            if (it.productionDate) payload.manufacture_date = it.productionDate;
            if (it.storageLocation) payload.storage = it.storageLocation;
            await apiPost<any>(
              `${apiUrl}/products/${productId}/batches`,
              payload
            );
          }
        }
      }

      // Order mahsulotlar: editedItems ga yozib, "입고 완료" ni bosishni aytamiz
      const groupedByOrder = orderItems.reduce(
        (acc, item) => {
          const oid = item.orderId ?? "none";
          if (!acc[oid]) {
            acc[oid] = { order: item.order, items: [] };
          }
          acc[oid].items.push(item);
          return acc;
        },
        {} as Record<string, any>
      );

      for (const [_orderId, data] of Object.entries(groupedByOrder)) {
        if ((data as any).order == null) continue;
        for (const item of (data as any).items) {
          updateItemField(item.itemId, "quantity", item.quantity);
          updateItemField(item.itemId, "expiryDate", item.expiryDate);
          updateItemField(item.itemId, "storageLocation", item.storageLocation);
          updateItemField(
            item.itemId,
            "purchasePrice",
            item.item?.unit_price ?? ""
          );
          if (item.lotNumber?.trim()) {
            updateItemField(item.itemId, "lotNumber", item.lotNumber);
          }
          if (
            item.lotQuantities &&
            Object.keys(item.lotQuantities).length > 0
          ) {
            updateItemField(item.itemId, "lotQuantities", item.lotQuantities);
          }
          if (
            item.lotDetails &&
            typeof item.lotDetails === "object" &&
            Object.keys(item.lotDetails).length > 0
          ) {
            updateItemField(item.itemId, "lotDetails", item.lotDetails);
          }
        }
      }

      const catalogDone =
        catalogItems.length > 0
          ? `\n카탈로그 제품 ${catalogItems.length}건 입고 완료.`
          : "";
      alert(
        `✅ ${scannedItems.length}개 제품 정보가 입력되었습니다!${catalogDone}\n\n` +
          (orderItems.length > 0
            ? `각 주문의 "입고 완료" 버튼을 눌러 입고를 완료하세요.`
            : "")
      );

      closeScanModal();
    } catch (error: any) {
      console.error("Auto-fill error:", error);
      alert(`입력 처리 중 오류: ${error.message || "알 수 없는 오류"}`);
    }
  };

  const updateItemField = (itemId: string, field: string, value: any) => {
    setEditedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleProcessOrder = async (order: any) => {
    // ✅ DEBUG: Check order ID

    // ✅ Use id or orderId as fallback
    const orderIdToUse = order.id || order.orderId;

    if (!orderIdToUse) {
      console.error("[handleProcessOrder] ERROR: No order ID found!");
      alert("주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    // Validation checks first
    // ✅ getAccessToken() ishlatish (localStorage emas)
    const token = await getAccessToken();
    const tenantId = getTenantId();

    if (!token || !tenantId) {
      alert("로그인이 필요합니다.");
      return;
    }

    const resolveInboundQty = (edited: any) => {
      if (
        edited?.lotQuantities &&
        typeof edited.lotQuantities === "object" &&
        Object.keys(edited.lotQuantities).length > 0
      ) {
        return (Object.values(edited.lotQuantities) as number[]).reduce(
          (a, b) => a + b,
          0
        );
      }
      return edited?.quantity || 0;
    };

    for (const item of order.items) {
      const edited = editedItems[item.id];
      if (!edited?.expiryDate) {
        alert(`${item.productName}의 유통기한을 입력해주세요.`);
        return;
      }
      if (resolveInboundQty(edited) <= 0) {
        alert(`${item.productName}의 수량을 입력해주세요.`);
        return;
      }
      // 구매가: 사용자 입력 또는 supplier 확정가(confirmedPrice) 사용
      const effectivePrice =
        edited?.purchasePrice != null && edited.purchasePrice !== ""
          ? Number(edited.purchasePrice)
          : item.confirmedPrice != null
            ? Number(item.confirmedPrice)
            : 0;
      if (!effectivePrice || effectivePrice <= 0) {
        alert(`${item.productName}의 구매가를 입력해주세요.`);
        return;
      }
    }

    const insufficientItems = [];
    for (const item of order.items) {
      const edited = editedItems[item.id];
      const confirmedQty = item.confirmedQuantity || item.orderedQuantity;
      const inboundQty = resolveInboundQty(edited);

      if (inboundQty !== confirmedQty) {
        insufficientItems.push({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          brand: item.brand,
          ordered: confirmedQty,
          inbound: inboundQty,
          shortage: confirmedQty - inboundQty,
          expiryMonths: item.expiryMonths,
          expiryUnit: item.expiryUnit,
          alertDays: item.alertDays,
        });
      }
    }

    // If there are quantity discrepancies, show modal
    if (insufficientItems.length > 0) {
      setModalData({
        order,
        items: insufficientItems,
      });
      setShowInboundModal(true);
      return;
    }

    // If no discrepancies, proceed with confirmation
    if (!confirm(`주문번호 ${order.orderNo}를 입고 처리하시겠습니까?`)) {
      return;
    }

    // Process the order (existing logic)
    await processInboundOrder(order, order.items, false);
  };

  // Separate function for actual inbound processing
  const processInboundOrder = async (
    order: any,
    itemsToProcess: any[],
    isPartial: boolean = false
  ) => {
    // ✅ Use id or orderId as fallback
    const orderIdToUse = order.id || order.orderId;

    if (!orderIdToUse) {
      console.error("[processInboundOrder] ERROR: No order ID found!", order);
      alert("주문 정보가 올바르지 않습니다. 페이지를 새로고침해주세요.");
      return;
    }

    setProcessing(orderIdToUse);
    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      const tenantId = getTenantId();

      if (!token || !tenantId) {
        alert("로그인이 필요합니다.");
        return;
      }

      // Process each item in the order
      const { apiPost, apiGet } = await import("../../lib/api");

      // ✅ Use inboundManagers state (no auto-fill, user must enter manually)
      const inboundManager = inboundManagers[orderIdToUse] || "";

      // Group items by productId
      const itemsByProduct = new Map<string, any[]>();
      itemsToProcess.forEach((item: any) => {
        const existing = itemsByProduct.get(item.productId) || [];
        existing.push(item);
        itemsByProduct.set(item.productId, existing);
      });

      const returnItems: any[] = [];
      const batchSummaryLines: string[] = [];

      for (const [productId, items] of itemsByProduct.entries()) {
        const firstItem = items[0];
        const editedFirstItem = editedItems[firstItem.id];

        // Inbound qty: from lotQuantities sum or from quantity
        const inboundQty = (() => {
          const lots = editedFirstItem?.lotQuantities;
          if (
            lots &&
            typeof lots === "object" &&
            Object.keys(lots).length > 0
          ) {
            return (Object.values(lots) as number[]).reduce((a, b) => a + b, 0);
          }
          return items.reduce(
            (sum: number, item: any) =>
              sum + (editedItems[item.id]?.quantity || 0),
            0
          );
        })();

        const confirmedQty =
          firstItem.confirmedQuantity || firstItem.orderedQuantity;
        const excessQty = confirmedQty - inboundQty;

        const expiryMonths = firstItem.expiryMonths;
        const expiryUnit = firstItem.expiryUnit || "months";
        const alertDays = firstItem.alertDays;

        let manufactureDate: string | null = null;
        if (editedFirstItem?.expiryDate && expiryMonths) {
          const expiryDateObj = new Date(editedFirstItem.expiryDate);
          if (expiryUnit === "days") {
            expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
          } else {
            expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
          }
          manufactureDate = expiryDateObj.toISOString().split("T")[0];
        }

        const purchasePrice =
          editedFirstItem?.purchasePrice != null &&
          editedFirstItem.purchasePrice !== ""
            ? Number(editedFirstItem.purchasePrice)
            : firstItem.confirmedPrice != null
              ? Number(firstItem.confirmedPrice)
              : 0;

        const lotQuantities = editedFirstItem?.lotQuantities;
        const hasMultipleLots =
          lotQuantities &&
          typeof lotQuantities === "object" &&
          Object.keys(lotQuantities).filter((k) => k !== "__default").length >
            0;

        const createdBatchNos: string[] = [];

        const lotDetailsFirst = editedFirstItem?.lotDetails as
          | Record<string, { manufactureDate?: string; expiryDate?: string }>
          | undefined;
        if (hasMultipleLots && lotQuantities) {
          // Har bir lot uchun alohida batch — har biriga o‘zining expiry_date / manufacture_date (DB ga yoziladi)
          for (const [lotKey, qtyVal] of Object.entries(lotQuantities)) {
            const qtyNum = Number(qtyVal);
            if (qtyNum <= 0) continue;
            const batchNoFromBarcode =
              lotKey === "__default"
                ? (editedFirstItem?.lotNumber || "").trim()
                : lotKey;
            const perLotExpiry =
              lotDetailsFirst?.[lotKey]?.expiryDate ??
              editedFirstItem?.expiryDate;
            const perLotManufacture =
              lotDetailsFirst?.[lotKey]?.manufactureDate;
            let lotManufactureDate: string | null = perLotManufacture || null;
            if (!lotManufactureDate && perLotExpiry && expiryMonths) {
              const expiryDateObj = new Date(perLotExpiry);
              if (expiryUnit === "days") {
                expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
              } else {
                expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
              }
              lotManufactureDate = expiryDateObj.toISOString().split("T")[0];
            }
            const payload: any = {
              qty: qtyNum,
              purchase_price: purchasePrice,
              expiry_date: perLotExpiry,
              inbound_manager: inboundManager,
            };
            if (batchNoFromBarcode) payload.batch_no = batchNoFromBarcode;
            if (lotManufactureDate)
              payload.manufacture_date = lotManufactureDate;
            if (expiryMonths) payload.expiry_months = expiryMonths;
            if (expiryUnit) payload.expiry_unit = expiryUnit;
            if (alertDays) payload.alert_days = alertDays;
            if (editedFirstItem?.storageLocation)
              payload.storage = editedFirstItem.storageLocation;

            const created = await apiPost<any>(
              `${apiUrl}/products/${productId}/batches`,
              payload
            );
            const no = created?.batch_no || "";
            if (no) createdBatchNos.push(`${no} ${qtyNum}개`);
          }
          batchSummaryLines.push(...createdBatchNos);
        } else {
          // Bir xil lot yoki lotQuantities yo'q: bitta batch
          const batchPayload: any = {
            qty: inboundQty,
            purchase_price: purchasePrice,
            expiry_date: editedFirstItem?.expiryDate,
            inbound_manager: inboundManager,
          };
          if (
            editedFirstItem?.lotNumber &&
            editedFirstItem.lotNumber.trim() !== ""
          ) {
            batchPayload.batch_no = editedFirstItem.lotNumber.trim();
          }
          if (manufactureDate) batchPayload.manufacture_date = manufactureDate;
          if (expiryMonths) batchPayload.expiry_months = expiryMonths;
          if (expiryUnit) batchPayload.expiry_unit = expiryUnit;
          if (alertDays) batchPayload.alert_days = alertDays;
          if (editedFirstItem?.storageLocation)
            batchPayload.storage = editedFirstItem.storageLocation;

          const createdBatch = await apiPost<any>(
            `${apiUrl}/products/${productId}/batches`,
            batchPayload
          );
          const batchNo = createdBatch?.batch_no || "";
          if (batchNo) createdBatchNos.push(`${batchNo} ${inboundQty}개`);
        }
        batchSummaryLines.push(...createdBatchNos);

        const batchNoForReturn = createdBatchNos[0]?.split(" ")[0] || "";

        if (excessQty > 0) {
          returnItems.push({
            productId: firstItem.productId,
            productName: firstItem.productName,
            brand: firstItem.brand || "",
            batchNo: batchNoForReturn,
            returnQuantity: excessQty,
            totalQuantity: confirmedQty,
            unitPrice: purchasePrice,
          });
        }
      }

      // Create returns if any excess
      if (returnItems.length > 0) {
        try {
          await apiPost(`${apiUrl}/order-returns/create-from-inbound`, {
            orderId: orderIdToUse, // ✅ FIXED: Use orderIdToUse
            orderNo: order.orderNo,
            items: returnItems,
            inboundManager: inboundManager, // Add inbound manager
          });
        } catch (returnError: any) {
          console.error(`Failed to create returns:`, returnError);
          // Don't throw - continue with order completion even if returns fail
          alert(
            `반품 생성 중 오류가 발생했습니다: ${returnError.message || "알 수 없는 오류"}\n입고 처리는 계속됩니다.`
          );
        }
      }

      // Update order status to completed only if not partial
      if (!isPartial) {
        try {
          await apiPost(`${apiUrl}/order/${orderIdToUse}/complete`, {}); // ✅ FIXED: Use orderIdToUse
        } catch (completeError: any) {
          console.error(`Failed to complete order:`, completeError);
          throw new Error(
            `주문 완료 처리 중 오류가 발생했습니다: ${completeError.message || "알 수 없는 오류"}`
          );
        }
      }

      // Show success message and optionally redirect to order-returns if returns were created
      if (!isPartial && returnItems.length > 0) {
        if (
          confirm(
            `입고 처리가 완료되었습니다.\n${returnItems.length}개의 반품이 생성되었습니다.\n반품 관리 페이지로 이동하시겠습니까?`
          )
        ) {
          window.location.href = "/order-returns";
          return; // Exit early to prevent onRefresh() call
        }
      } else if (!isPartial) {
        const msg =
          batchSummaryLines.length > 0
            ? `입고 처리가 완료되었습니다.\n\n배치:\n${batchSummaryLines.join("\n")}`
            : "입고 처리가 완료되었습니다.";
        alert(msg);
      }

      onRefresh();
    } catch (err: any) {
      console.error("Failed to process order:", err);
      const errorMessage = err.message || "알 수 없는 오류";

      // Check if it's a network error
      if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError")
      ) {
        alert(
          `네트워크 오류가 발생했습니다.\n서버에 연결할 수 없습니다.\n\n오류: ${errorMessage}\n\n다시 시도해주세요.`
        );
      } else {
        alert(`입고 처리 중 오류가 발생했습니다: ${errorMessage}`);
      }
    } finally {
      setProcessing(null);
    }
  };

  // Handler for partial inbound (재입고 예정)
  const handlePartialInbound = async () => {
    if (!modalData) return;

    const { order } = modalData;

    // ✅ DEBUG: Check order.id before API call

    if (!order.id && !order.orderId) {
      console.error("[Partial Inbound] ERROR: No order ID found!");
      alert("주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    // ✅ Use orderId as fallback if id is missing
    const orderIdToUse = order.id || order.orderId;

    const getInboundQty = (edited: any) => {
      const lots = edited?.lotQuantities;
      if (lots && typeof lots === "object" && Object.keys(lots).length > 0) {
        return (Object.values(lots) as number[]).reduce((a, b) => a + b, 0);
      }
      return edited?.quantity || 0;
    };

    const validItems = order.items.filter((item: any) => {
      const edited = editedItems[item.id];
      return getInboundQty(edited) > 0;
    });

    // ✅ Debug: validItems ni ko'rsatish

    if (validItems.length === 0) {
      alert("입고 가능한 제품이 없습니다.");
      return;
    }

    setShowInboundModal(false);
    setProcessing(order.orderId);

    try {
      const { apiPost } = await import("../../lib/api");

      // ✅ Use inboundManagers state (no auto-fill, user must enter manually)
      const inboundManager = inboundManagers[orderIdToUse] || "";

      for (const item of validItems) {
        const editedItem = editedItems[item.id];
        const inboundQty = getInboundQty(editedItem);
        if (inboundQty <= 0) continue;

        const productId = item.productId || item.product_id;
        if (!productId) continue;

        const expiryMonths = item.expiryMonths;
        const expiryUnit = item.expiryUnit || "months";
        const alertDays = item.alertDays;
        let manufactureDate: string | null = null;
        if (editedItem?.expiryDate && expiryMonths) {
          const expiryDateObj = new Date(editedItem.expiryDate);
          if (expiryUnit === "days") {
            expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
          } else {
            expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
          }
          manufactureDate = expiryDateObj.toISOString().split("T")[0];
        }
        const itemPurchasePrice =
          editedItem?.purchasePrice != null && editedItem.purchasePrice !== ""
            ? Number(editedItem.purchasePrice)
            : item.confirmedPrice != null
              ? Number(item.confirmedPrice)
              : 0;

        const lotQuantities = editedItem?.lotQuantities;
        const hasMultipleLots =
          lotQuantities &&
          typeof lotQuantities === "object" &&
          Object.keys(lotQuantities).filter((k) => k !== "__default").length >
            0;

        const lotDetailsItem = editedItem?.lotDetails as
          | Record<string, { manufactureDate?: string; expiryDate?: string }>
          | undefined;
        if (hasMultipleLots && lotQuantities) {
          for (const [lotKey, qty] of Object.entries(lotQuantities)) {
            if (Number(qty) <= 0) continue;
            const batchNoFromBarcode =
              lotKey === "__default"
                ? (editedItem?.lotNumber || "").trim()
                : lotKey;
            const perLotExpiry =
              lotDetailsItem?.[lotKey]?.expiryDate ?? editedItem?.expiryDate;
            const perLotManufacture = lotDetailsItem?.[lotKey]?.manufactureDate;
            let lotManufactureDate: string | null = perLotManufacture || null;
            if (!lotManufactureDate && perLotExpiry && expiryMonths) {
              const expiryDateObj = new Date(perLotExpiry);
              if (expiryUnit === "days") {
                expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
              } else {
                expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
              }
              lotManufactureDate = expiryDateObj.toISOString().split("T")[0];
            }
            const payload: any = {
              qty: Number(qty),
              purchase_price: itemPurchasePrice,
              expiry_date: perLotExpiry,
              inbound_manager: inboundManager,
            };
            if (batchNoFromBarcode) payload.batch_no = batchNoFromBarcode;
            if (lotManufactureDate)
              payload.manufacture_date = lotManufactureDate;
            if (expiryMonths) payload.expiry_months = expiryMonths;
            if (expiryUnit) payload.expiry_unit = expiryUnit;
            if (alertDays) payload.alert_days = alertDays;
            if (editedItem?.storageLocation)
              payload.storage = editedItem.storageLocation;
            await apiPost<any>(
              `${apiUrl}/products/${productId}/batches`,
              payload
            );
          }
        } else {
          const batchPayload: any = {
            qty: inboundQty,
            purchase_price: itemPurchasePrice,
            expiry_date: editedItem?.expiryDate,
            inbound_manager: inboundManager,
          };
          if (editedItem?.lotNumber && editedItem.lotNumber.trim() !== "") {
            batchPayload.batch_no = editedItem.lotNumber.trim();
          }
          if (manufactureDate) batchPayload.manufacture_date = manufactureDate;
          if (expiryMonths) batchPayload.expiry_months = expiryMonths;
          if (expiryUnit) batchPayload.expiry_unit = expiryUnit;
          if (alertDays) batchPayload.alert_days = alertDays;
          if (editedItem?.storageLocation)
            batchPayload.storage = editedItem.storageLocation;
          await apiPost<any>(
            `${apiUrl}/products/${productId}/batches`,
            batchPayload
          );
        }
      }

      const inboundedItems = validItems.map((item: any) => {
        const inboundQty = getInboundQty(editedItems[item.id]);

        return {
          itemId: item.id,
          productId: item.productId || item.product_id, // ✅ productId yoki product_id
          inboundQty: inboundQty, // ✅ 입고수량 (80ta yoki 100ta)
        };
      });

      const result = await apiPost(
        `${apiUrl}/order/${orderIdToUse}/partial-inbound`, // ✅ Use fallback ID
        {
          inboundedItems,
          inboundManager,
        }
      );

      const totalRemainingQty = order.items.reduce((sum: number, item: any) => {
        const edited = editedItems[item.id];
        const confirmedQty =
          item.confirmedQuantity || item.orderedQuantity || 0;
        const alreadyInbound = item.inboundQuantity || 0;
        const newInbound = getInboundQty(edited);
        const totalInbound = alreadyInbound + newInbound;
        const remaining = confirmedQty - totalInbound;
        return sum + (remaining > 0 ? remaining : 0);
      }, 0);

      const inboundProductNames = validItems
        .map((item: any) => item.productName)
        .join(", ");
      const totalInboundQty = validItems.reduce(
        (sum: number, item: any) => sum + getInboundQty(editedItems[item.id]),
        0
      );

      if (totalRemainingQty > 0) {
        alert(
          `${inboundProductNames}\n${totalInboundQty}개 입고 완료되었습니다.\n남은 ${totalRemainingQty}개 제품은 재입고 대기 중입니다.`
        );
      } else {
        alert(
          `${inboundProductNames}\n남은 ${totalInboundQty}개 입고 완료되었습니다.`
        );
      }

      onRefresh();
    } catch (err: any) {
      console.error("Failed to process partial inbound:", err);
      alert(
        `입고 처리 중 오류가 발생했습니다: ${err.message || "알 수 없는 오류"}`
      );
    } finally {
      setProcessing(null);
    }
  };

  // Handler for navigating to returns page (반품 및 교환 진행)
  const navigateToReturns = async () => {
    if (!modalData) return;

    const { order } = modalData;

    if (!order.id && !order.orderId) {
      console.error("[navigateToReturns] ERROR: No order ID found!");
      alert("주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    // ✅ Use id or orderId as fallback
    const orderIdToUse = order.id || order.orderId;

    setShowInboundModal(false);
    setProcessing(orderIdToUse);

    try {
      const { apiPost } = await import("../../lib/api");

      // ✅ Use inboundManagers state (no auto-fill, user must enter manually)
      const inboundManager = inboundManagers[orderIdToUse] || "";

      // Process all items and create returns for shortages
      const returnItems: any[] = [];

      // Group items by productId
      const itemsByProduct = new Map<string, any[]>();
      order.items.forEach((item: any) => {
        const existing = itemsByProduct.get(item.productId) || [];
        existing.push(item);
        itemsByProduct.set(item.productId, existing);
      });

      for (const [productId, items] of itemsByProduct.entries()) {
        // Use edited quantity from form
        const inboundQty = items.reduce((sum: number, item: any) => {
          const edited = editedItems[item.id];
          return sum + (edited?.quantity || 0);
        }, 0);

        // Use edited values from first item
        const firstItem = items[0];
        const editedFirstItem = editedItems[firstItem.id];

        // Get confirmed quantity from supplier
        const confirmedQty =
          firstItem.confirmedQuantity || firstItem.orderedQuantity;

        // Calculate shortage (kam kelgan)
        const shortageQty = confirmedQty - inboundQty;

        // Create batch for inbounded quantity
        if (inboundQty > 0) {
          // Get expiry info from product
          const expiryMonths = firstItem.expiryMonths;
          const expiryUnit = firstItem.expiryUnit || "months";
          const alertDays = firstItem.alertDays;

          // Calculate manufacture date
          let manufactureDate = null;
          if (editedFirstItem?.expiryDate && expiryMonths) {
            const expiryDateObj = new Date(editedFirstItem.expiryDate);
            if (expiryUnit === "days") {
              expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
            } else {
              expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
            }
            manufactureDate = expiryDateObj.toISOString().split("T")[0];
          }

          const shortagePrice =
            editedFirstItem?.purchasePrice != null &&
            editedFirstItem.purchasePrice !== ""
              ? Number(editedFirstItem.purchasePrice)
              : firstItem.confirmedPrice != null
                ? Number(firstItem.confirmedPrice)
                : 0;
          const batchPayload: any = {
            qty: inboundQty,
            purchase_price: shortagePrice,
            expiry_date: editedFirstItem?.expiryDate,
            inbound_manager: inboundManager,
          };

          if (manufactureDate) batchPayload.manufacture_date = manufactureDate;
          if (expiryMonths) batchPayload.expiry_months = expiryMonths;
          if (expiryUnit) batchPayload.expiry_unit = expiryUnit;
          if (alertDays) batchPayload.alert_days = alertDays;
          if (editedFirstItem?.storageLocation)
            batchPayload.storage = editedFirstItem.storageLocation;

          // Create batch
          const createdBatch = await apiPost<any>(
            `${apiUrl}/products/${productId}/batches`,
            batchPayload
          );

          // Get batch_no from the created batch
          const batchNo = createdBatch.batch_no || "";

          // If shortage, prepare return item
          if (shortageQty > 0) {
            returnItems.push({
              productId: firstItem.productId,
              productName: firstItem.productName,
              brand: firstItem.brand || "",
              batchNo: batchNo,
              returnQuantity: shortageQty,
              totalQuantity: confirmedQty,
              unitPrice: shortagePrice,
            });
          }
        } else if (shortageQty > 0) {
          // No inbound, but shortage exists - create return without batch
          const shortagePrice =
            editedFirstItem?.purchasePrice != null &&
            editedFirstItem.purchasePrice !== ""
              ? Number(editedFirstItem.purchasePrice)
              : firstItem.confirmedPrice != null
                ? Number(firstItem.confirmedPrice)
                : 0;
          returnItems.push({
            productId: firstItem.productId,
            productName: firstItem.productName,
            brand: firstItem.brand || "",
            batchNo: "",
            returnQuantity: shortageQty,
            totalQuantity: confirmedQty,
            unitPrice: shortagePrice,
          });
        }
      }

      // Create returns if any shortage
      if (returnItems.length > 0) {
        try {
          await apiPost(`${apiUrl}/order-returns/create-from-inbound`, {
            orderId: orderIdToUse, // ✅ FIXED: Use orderIdToUse
            orderNo: order.orderNo,
            items: returnItems,
            inboundManager: inboundManager,
          });

          // Mark order as completed
          await apiPost(`${apiUrl}/order/${orderIdToUse}/complete`, {});

          // Navigate to order-returns page
          alert(
            `입고 처리가 완료되었습니다.\n${returnItems.length}개의 반품이 생성되었습니다.`
          );
          window.location.href = "/order-returns";
        } catch (error: any) {
          console.error("Failed to create returns:", error);
          alert(
            `반품 생성 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`
          );
        }
      } else {
        alert("반품할 제품이 없습니다.");
      }
    } catch (err: any) {
      console.error("Failed to process returns:", err);
      alert(`처리 중 오류가 발생했습니다: ${err.message || "알 수 없는 오류"}`);
    } finally {
      setProcessing(null);
      onRefresh();
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        입고 대기 중인 주문이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          입고 대기 중인 주문 ({orders.length}건)
        </h2>

        <div className="flex items-center gap-2">
          {/* 🆕 Manual Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="주문 목록 새로고침"
          >
            <svg
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
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
            {loading ? "새로고침 중..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {currentOrders.map((order) => {
          const orderId = order.id || order.orderId;
          return (
            <OrderCard
              key={orderId || `order-${order.orderNo || Math.random()}`}
              order={order}
              editedItems={editedItems}
              updateItemField={updateItemField}
              handleProcessOrder={handleProcessOrder}
              processing={processing}
              inboundManagerName={inboundManagers[orderId] ?? ""}
              onInboundManagerChange={(value: string) => {
                if (orderId) {
                  setInboundManagers((prev) => ({ ...prev, [orderId]: value }));
                }
              }}
              onRefresh={onRefresh}
              apiUrl={apiUrl}
              onOpenBarcodeScan={openBarcodeScanForOrder}
            />
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {/* Quantity Mismatch Modal */}
      {showInboundModal && modalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInboundModal(false);
            }
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {(() => {
                  // ✅ FIXED: Check based on order.items' inboundQuantity (database), not editedItems
                  // Agar biror item allaqachon partial inbound qilingan bo'lsa (inboundQuantity > 0 va < confirmedQuantity)
                  const hasPartialInbound = modalData.order.items.some(
                    (item: any) => {
                      const inboundQty = item.inboundQuantity || 0;
                      const confirmedQty =
                        item.confirmedQuantity || item.orderedQuantity || 0;
                      return inboundQty > 0 && inboundQty < confirmedQty;
                    }
                  );

                  // Agar partial inbound bo'lmasa (birinchi marta shortage) → Ikki button
                  // Agar partial inbound bo'lsa (qolgan pending) → Bitta button
                  return hasPartialInbound
                    ? "입고 처리" // "Inbound Processing" - qolgan pending
                    : "일부 상품의 입고 수량이 부족합니다"; // Birinchi marta shortage
                })()}
              </h2>
              <button
                onClick={() => setShowInboundModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg
                  className="w-6 h-6"
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

            {/* Body - Description */}
            <div className="mb-6">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                {(() => {
                  // ✅ Same logic for description
                  const hasPartialInbound = modalData.order.items.some(
                    (item: any) => {
                      const inboundQty = item.inboundQuantity || 0;
                      const confirmedQty =
                        item.confirmedQuantity || item.orderedQuantity || 0;
                      return inboundQty > 0 && inboundQty < confirmedQty;
                    }
                  );

                  return hasPartialInbound ? (
                    "입고 처리를 진행하시겠습니까?" // Qolgan pending
                  ) : (
                    <>
                      부족한 수량은 추후 재입고 예정인가요?
                      <br />
                      재입고가 어려운 경우, 반품 절차를 통해 처리됩니다.
                    </>
                  );
                })()}
              </p>

              {/* Product Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">
                        제품명
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                        주문수량
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                        입고수량
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                        차이
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalData.items.map((item: any) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 dark:border-slate-700/50"
                      >
                        <td className="px-3 py-3 text-sm text-slate-800 dark:text-slate-200">
                          {item.productName}
                          {item.brand && (
                            <span className="text-slate-500 dark:text-slate-400 ml-1">
                              ({item.brand})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-slate-700 dark:text-slate-300">
                          {item.ordered}개
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-slate-700 dark:text-slate-300">
                          {item.inbound}개
                        </td>
                        <td
                          className={`px-3 py-3 text-center text-sm font-semibold ${
                            item.shortage > 0
                              ? "text-red-600 dark:text-red-400"
                              : item.shortage < 0
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {item.shortage > 0
                            ? `-${item.shortage}개`
                            : item.shortage < 0
                              ? `+${Math.abs(item.shortage)}개`
                              : "✓"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer - Action Buttons */}
            <div className="flex gap-3 justify-end">
              {(() => {
                // ✅ FIXED: Check if any item has partial inbound already (database state)
                const hasPartialInbound = modalData.order.items.some(
                  (item: any) => {
                    const inboundQty = item.inboundQuantity || 0;
                    const confirmedQty =
                      item.confirmedQuantity || item.orderedQuantity || 0;
                    return inboundQty > 0 && inboundQty < confirmedQty;
                  }
                );

                // ✅ Agar partial inbound bo'lsa → Qolgan pending → Bitta "입고 완료" button
                if (hasPartialInbound) {
                  return (
                    <button
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      onClick={handlePartialInbound}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      입고 완료
                    </button>
                  );
                }

                // ✅ Partial inbound yo'q → Birinchi marta shortage → Ikki button
                return (
                  <>
                    <button
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                      onClick={handlePartialInbound}
                    >
                      재입고 예정
                    </button>
                    <button
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      onClick={navigateToReturns}
                    >
                      반품 및 교환 진행
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ✅ NEW: Barcode Scanner Modal - Design per reference image */}
      {scanModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeScanModal();
            }
          }}
        >
          <div className="bg-white ml-80 dark:bg-slate-800 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                바코드 입고
                {scanModalOrderId &&
                  (() => {
                    const scanOrder = orders.find(
                      (o) => (o.id || o.orderId) === scanModalOrderId
                    );
                    return scanOrder?.orderNo
                      ? ` (주문번호 ${scanOrder.orderNo})`
                      : "";
                  })()}
              </h2>
              <button
                type="button"
                onClick={() => {
                  closeScanModal();
                }}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="닫기"
              >
                <svg
                  className="w-5 h-5"
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

            {/* Info bar: company name, supplier manager, order no, date */}
            {scannedItems.length > 0 &&
              (() => {
                const first = scannedItems[0];
                const order = first?.order;
                const companyName =
                  order?.supplierName ??
                  order?.supplier?.name ??
                  order?.companyName ??
                  "(유) 공급처";
                const managerName =
                  order?.managerName ?? order?.supplier?.managerName ?? "";
                const managerPosition =
                  order?.managerPosition ??
                  order?.supplier?.managerPosition ??
                  "";
                const managerText = [managerName, managerPosition]
                  .filter(Boolean)
                  .join(" ");
                const orderNo = first?.orderNo ?? "000000-000000";
                const dateStr = new Date().toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <div className="flex flex-row gap-2 min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {companyName}
                        </span>
                        {managerText && (
                          <span className="text-slate-600 dark:text-slate-400 truncate">
                            {managerText}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 shrink-0">
                        주문번호 {orderNo}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 shrink-0">
                        {dateStr}
                      </span>
                    </div>
                  </div>
                );
              })()}

            {/* Body - Scrollable product list */}
            <div className="flex-1 overflow-y-auto p-5">
              {scannedItems.length > 0 ? (
                <div className="space-y-3">
                  {scannedItems
                    .slice()
                    .sort((a, b) => {
                      const statusOrder: { [key: string]: number } = {
                        active: 0,
                        pending: 1,
                        completed: 2,
                      };
                      return (
                        (statusOrder[a.status] ?? 1) -
                        (statusOrder[b.status] ?? 1)
                      );
                    })
                    .map((item) => {
                      const isActive = item.status === "active";
                      const isCompleted = item.status === "completed";
                      const isPending = item.status === "pending";
                      const purchasePrice =
                        item.item?.unit_price ?? item.item?.confirmedPrice ?? 0;
                      const capacity =
                        item.item?.quantity ??
                        item.item?.confirmedQuantity ??
                        0;
                      const hasLots =
                        item.lotQuantities &&
                        Object.keys(item.lotQuantities).length > 0 &&
                        (Object.values(item.lotQuantities) as number[]).some((n) => Number(n) > 0);
                      const totalQty =
                        hasLots
                          ? (Object.values(item.lotQuantities) as number[]).reduce(
                              (a, b) => a + Number(b),
                              0
                            )
                          : Number(item.quantity ?? 0) || 0;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border overflow-hidden transition-all ${
                            isActive
                              ? "border-2 border-dashed border-violet-400 dark:border-violet-500 shadow-md"
                              : isCompleted
                                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                          }`}
                        >
                          {/* Card row: status circle + image placeholder + name/brand + details */}
                          <div
                            className={`flex items-center gap-4 p-4 cursor-pointer ${
                              isActive
                                ? "bg-violet-50/50 dark:bg-violet-900/10"
                                : isCompleted
                                  ? "bg-emerald-50/30 dark:bg-emerald-900/20"
                                  : "bg-white dark:bg-slate-800"
                            }`}
                            onClick={() => {
                              if (!isCompleted) {
                                setScannedItems((prev) =>
                                  prev.map((p) => ({
                                    ...p,
                                    status:
                                      p.itemId === item.itemId &&
                                      p.status !== "completed"
                                        ? "active"
                                        : p.status === "active"
                                          ? "pending"
                                          : p.status,
                                  }))
                                );
                                setActiveItemId(item.itemId);
                              }
                            }}
                          >
                            {/* Status circle */}
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                isActive
                                  ? "bg-blue-500 text-white"
                                  : isCompleted
                                    ? "bg-emerald-500 text-white"
                                    : "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {isActive
                                ? "진행"
                                : isCompleted
                                  ? "완료"
                                  : "대기"}
                            </span>
                            {/* Image placeholder */}
                            {/* <div className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                              {item.product?.image_url ? (
                                <img
                                  src={item.product.image_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500 text-xs">
                                  이미지
                                </span>
                              )}
                            </div> */}
                            {/* Name + brand + quantity (always visible on all screens) */}
                            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                              <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {item.productName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {item.brand ?? ""}
                              </div>
                              {/* 총 입고수량 + lot breakdown — always visible (was hidden on mobile) */}
                              <div className="flex flex-col text-xs text-slate-600 dark:text-slate-400 gap-0.5 mt-0.5">
                                {/* {item.lotQuantities &&
                                  Object.keys(item.lotQuantities).length >
                                    0 && (
                                    <span className="text-violet-600 dark:text-violet-400">
                                      {Object.entries(item.lotQuantities)
                                        .filter(([k, q]) => Number(q) > 0)
                                        .map(([lot, q]) =>
                                          lot === "__default"
                                            ? `스캔 ${q}개`
                                            : `${lot} ${q}개`
                                        )
                                        .join(", ")}
                                    </span>
                                  )} */}
                              </div>
                            </div>
                            {/* Right: 구매가 (desktop) */}
                            <div className="hidden sm:flex flex-row justify-between gap-72 items-center text-xs text-slate-600 dark:text-slate-400 shrink-0">
                              <span>
                                총 입고수량 {totalQty} | {capacity}개
                              </span>
                              <span>
                                구매가 {Number(purchasePrice).toLocaleString()}
                              </span>
                            </div>
                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeScannedProduct(item.itemId);
                                }}
                                className="text-slate-400 hover:text-red-600 text-sm shrink-0"
                              >
                                삭제
                              </button>
                            )}
                            {isCompleted && (
                              <span className="text-emerald-600 dark:text-emerald-400 text-lg shrink-0">
                                ✓
                              </span>
                            )}
                          </div>

                          {/* Expanded: Lot ozgarganda — har bir lot uchun sub-card (2-rasma dizayni) */}
                          {isActive && !isCompleted && (
                            <div className="p-4 bg-white  dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                              {/* Lot sub-cards: when multiple lots, show one card per lot below main card */}
                              {item.lotQuantities &&
                              Object.entries(item.lotQuantities).filter(
                                ([, q]) => Number(q) > 0
                              ).length > 0 ? (
                                <div className="space-y-3">
                                  {Object.entries(item.lotQuantities)
                                    .filter(([, q]) => Number(q) > 0)
                                    .map(([lotKey]) => {
                                      const qty = Number(
                                        item.lotQuantities[lotKey] ?? 0
                                      );
                                      const details =
                                        item.lotDetails?.[lotKey] || {};
                                      const batchLabel =
                                        lotKey === "__default"
                                          ? "스캔"
                                          : lotKey.startsWith("__manual_")
                                            ? "수동"
                                            : lotKey;
                                      return (
                                        <div
                                          key={lotKey}
                                          className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/50 p-3"
                                        >
                                          <div className="w-full">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                              Lot 배치번호
                                            </label>
                                            <div className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm">
                                              {batchLabel}
                                            </div>
                                          </div>
                                          <div className="w-full">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                              제조일
                                            </label>
                                            <input
                                              type="date"
                                              value={
                                                details.manufactureDate ??
                                                item.productionDate ??
                                                ""
                                              }
                                              onChange={(e) =>
                                                updateScannedProductLotDetails(
                                                  item.itemId,
                                                  lotKey,
                                                  {
                                                    manufactureDate:
                                                      e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                            />
                                          </div>
                                          <div className="w-full">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                              유효기간
                                            </label>
                                            <input
                                              type="date"
                                              value={
                                                details.expiryDate ??
                                                item.expiryDate ??
                                                ""
                                              }
                                              onChange={(e) =>
                                                updateScannedProductLotDetails(
                                                  item.itemId,
                                                  lotKey,
                                                  {
                                                    expiryDate: e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                            />
                                          </div>
                                          <div className="w-full">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                              입고수량
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              value={qty}
                                              onChange={(e) =>
                                                updateScannedProductLotQty(
                                                  item.itemId,
                                                  lotKey,
                                                  parseInt(
                                                    e.target.value,
                                                    10
                                                  ) || 0
                                                )
                                              }
                                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-200 dark:border-blue-800"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeScannedProductLot(
                                                item.itemId,
                                                lotKey
                                              )
                                            }
                                            className="p-2 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300 shrink-0"
                                            aria-label="이 Lot 삭제"
                                          >
                                            <svg
                                              className="w-5 h-5"
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
                                      );
                                    })}
                                </div>
                              ) : (
                                /* Single lot / no lots: original single form */
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                      Lot 번호
                                    </label>
                                    <input
                                      type="text"
                                      value={item.lotNumber || ""}
                                      onChange={(e) =>
                                        updateScannedProduct(item.itemId, {
                                          lotNumber: e.target.value,
                                        })
                                      }
                                      placeholder="0000000000001"
                                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                      제조일
                                    </label>
                                    <input
                                      type="date"
                                      value={item.productionDate || ""}
                                      onChange={(e) =>
                                        updateScannedProduct(item.itemId, {
                                          productionDate: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                      유효기간
                                    </label>
                                    <input
                                      type="date"
                                      value={item.expiryDate || ""}
                                      onChange={(e) =>
                                        updateScannedProduct(item.itemId, {
                                          expiryDate: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                      입고수량
                                    </label>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={item.quantity}
                                        onChange={(e) =>
                                          updateScannedProduct(item.itemId, {
                                            quantity:
                                              parseInt(e.target.value) || 0,
                                          })
                                        }
                                        className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateScannedProduct(item.itemId, {
                                            quantity: 0,
                                          })
                                        }
                                        className="p-2 text-slate-400 hover:text-slate-600 rounded"
                                        aria-label="지우기"
                                      >
                                        <svg
                                          className="w-4 h-4"
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
                                  </div>
                                </div>
                              )}
                              <div className="mt-3">
                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                  보관위치
                                </label>
                                <input
                                  type="text"
                                  value={item.storageLocation || ""}
                                  onChange={(e) =>
                                    updateScannedProduct(item.itemId, {
                                      storageLocation: e.target.value,
                                    })
                                  }
                                  placeholder="예: 창고 A-3, 냉장고"
                                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={completeCurrentProduct}
                                disabled={
                                  !item.quantity ||
                                  item.quantity <= 0 ||
                                  !item.storageLocation
                                }
                                className="mt-4 w-full py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                              >
                                입력 완료
                              </button>
                            </div>
                          )}

                          {/* Lot 배치번호 추가 — har bir product ostida, skaner bilan bir xil */}
                          {!isCompleted && (
                            <div
                              className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {expandedManualLotItemId !== item.itemId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedManualLotItemId(item.itemId);
                                    setManualLotForm({
                                      lotNumber: "",
                                      productionDate: "",
                                      expiryDate: "",
                                      quantity: 0,
                                    });
                                  }}
                                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#426bff] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#3658e0] focus:outline-none focus:ring-2 focus:ring-[#426bff] focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                >
                                  <span className="text-lg leading-none">+</span>
                                  Lot 배치번호 추가
                                </button>
                              ) : (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50">
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Lot 번호
                                      </label>
                                      <input
                                        type="text"
                                        value={manualLotForm.lotNumber}
                                        onChange={(e) =>
                                          setManualLotForm((f) => ({
                                            ...f,
                                            lotNumber: e.target.value,
                                          }))
                                        }
                                        placeholder="0000000000001"
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        제조일
                                      </label>
                                      <input
                                        type="date"
                                        value={manualLotForm.productionDate}
                                        onChange={(e) =>
                                          setManualLotForm((f) => ({
                                            ...f,
                                            productionDate: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        유효기간
                                      </label>
                                      <input
                                        type="date"
                                        value={manualLotForm.expiryDate}
                                        onChange={(e) =>
                                          setManualLotForm((f) => ({
                                            ...f,
                                            expiryDate: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        입고수량
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          value={manualLotForm.quantity || ""}
                                          onChange={(e) =>
                                            setManualLotForm((f) => ({
                                              ...f,
                                              quantity:
                                                parseInt(e.target.value) || 0,
                                            }))
                                          }
                                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setManualLotForm((f) => ({
                                              ...f,
                                              quantity: 0,
                                            }))
                                          }
                                          className="rounded p-2 text-slate-400 hover:text-slate-600"
                                          aria-label="지우기"
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
                                    </div>
                                  </div>
                                  <div className="mt-3 flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (manualLotForm.quantity > 0) {
                                          addManualLotToScannedItem(item.itemId, {
                                            lotNumber: manualLotForm.lotNumber,
                                            productionDate: manualLotForm.productionDate,
                                            expiryDate: manualLotForm.expiryDate,
                                            quantity: manualLotForm.quantity,
                                          });
                                          setManualLotForm({
                                            lotNumber: "",
                                            productionDate: "",
                                            expiryDate: "",
                                            quantity: 0,
                                          });
                                        }
                                      }}
                                      disabled={manualLotForm.quantity <= 0}
                                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#426bff] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#3658e0] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <span className="text-lg leading-none">+</span>
                                      Lot 배치번호 추가
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedManualLotItemId(null);
                                        setManualLotForm({
                                          lotNumber: "",
                                          productionDate: "",
                                          expiryDate: "",
                                          quantity: 0,
                                        });
                                      }}
                                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                      닫기
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">스캔된 제품이 없습니다</p>
                  <p className="text-xs mt-2">바코드를 스캔하세요</p>
                </div>
              )}

              {scannedItems.length > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <svg
                    className="w-4 h-4 animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  추가 제품을 스캔하세요
                </div>
              )}
            </div>

            {/* Footer: 입고 직원* + 입고 하기 (image design) */}
            <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  입고 직원*
                </label>
                <input
                  type="text"
                  value={scanModalInboundStaff}
                  onChange={(e) => setScanModalInboundStaff(e.target.value)}
                  placeholder="이름 입력"
                  className="flex-1 min-w-0 max-w-xs px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={submitAllScannedItems}
                disabled={
                  scannedItems.length === 0 ||
                  scannedItems.some((i) => i.status !== "completed")
                }
                className="shrink-0 px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
              >
                입고 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Order Card Component - Memoized
const OrderCard = memo(function OrderCard({
  order,
  editedItems,
  updateItemField,
  handleProcessOrder,
  processing,
  inboundManagerName,
  onInboundManagerChange,
  onRefresh,
  apiUrl,
  onOpenBarcodeScan,
}: {
  order: any;
  editedItems: Record<string, any>;
  updateItemField: (itemId: string, field: string, value: any) => void;
  handleProcessOrder: (order: any) => void;
  processing: string | null;
  inboundManagerName: string;
  onInboundManagerChange: (value: string) => void;
  onRefresh: () => void;
  apiUrl: string;
  onOpenBarcodeScan?: (orderId: string) => void;
}) {
  // Determine order status
  const isPending = order.status === "pending";
  const isSupplierConfirmed = order.status === "supplier_confirmed";
  const isRejected = order.status === "rejected";

  // Extract rejection reasons from order items
  const rejectionReasons =
    order.items
      ?.map((item: any) => {
        if (item.memo && item.memo.includes("[거절 사유:")) {
          const match = item.memo.match(/\[거절 사유:\s*([^\]]+)\]/);
          return match ? match[1].trim() : null;
        }
        return null;
      })
      .filter((reason: any) => reason !== null) || [];

  return (
    <div className="space-y-2">
      {/* Badge - Above Card */}
      <div className="flex items-start">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            주문 요청
            {order.isPlatformSupplier && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                />
              </svg>
            )}
          </span>
        ) : isRejected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-400">
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
            주문 거절
            {order.isPlatformSupplier && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                />
              </svg>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            주문 진행
            {order.isPlatformSupplier && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                />
              </svg>
            )}
          </span>
        )}
      </div>

      {/* Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        {/* Order Info - 3 Columns */}
        <div className="mb-4 grid grid-cols-1 gap-0.9 border-b border-slate-200 pb-4 dark:border-slate-700 lg:grid-cols-3">
          {/* Left: 공급업체 + Manager */}
          <div className="space-y-1">
            <div className="mt-3">
              <div className="flex items-center gap-1">
                <TruckIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-900 dark:text-white">
                  {order.supplierName || "알 수 없음"}
                </h3>
                {order.managerName && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 ml-2">
                    담당자: {order.managerName}
                    {order.managerPosition && `${order.managerPosition}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Center: 주문번호 */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-2 dark:bg-sky-500/10">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                주문번호
              </span>
              <span className="text-base font-bold text-sky-600 dark:text-sky-400">
                {order.orderNo}
              </span>
            </div>
          </div>

          {/* Right: 확인일/거절일 + 주문자 */}
          <div className="space-y-2 lg:text-right">
            {isSupplierConfirmed && order.confirmedAt && (
              <div className="flex items-center gap-2 lg:justify-end">
                <CalendarIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  확인일: {new Date(order.confirmedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {isRejected && order.confirmedAt && (
              <div className="flex items-center gap-2 lg:justify-end">
                <CalendarIcon className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-600 dark:text-red-400">
                  거절일: {new Date(order.confirmedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {isPending && order.orderDate && (
              <div className="flex items-center gap-2 lg:justify-end">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  주문일: {new Date(order.orderDate).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 lg:justify-end">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                주문자: {order.createdByName || "알 수 없음"}님
              </span>
            </div>
          </div>
        </div>

        {/* Order Items - Editable Form */}
        <div className="space-y-4">
          {order.items?.map((item: any, index: number) => {
            const edited = editedItems[item.id] || {};
            const hasQtyChange =
              item.confirmedQuantity !== item.orderedQuantity;
            const hasPriceChange = item.confirmedPrice !== item.orderedPrice;

            return (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30"
              >
                {/* Product Name + Reasons */}
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                      {item.productName || "알 수 없음"}
                    </h4>
                    {item.brand && (
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {item.brand}
                      </span>
                    )}
                  </div>
                  {(isSupplierConfirmed || isRejected) && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {item.priceReason && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          💰 가격 변경: {item.priceReason}
                        </span>
                      )}
                      {isRejected && item.memo && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          ❌ 거절 사유: {item.memo}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 주문 진행: read-only (입고 담당자 + 이번 구매가 tashqari). 주문 요청/거절: inputlar ma'lumot bilan, disabled */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* 입고수량 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      입고수량:
                    </label>
                    {isSupplierConfirmed ? (
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-900/50">
                        <span className="text-sm text-slate-800 dark:text-slate-100">
                          {edited.quantity !== "" && edited.quantity !== undefined
                            ? Number(edited.quantity)
                            : "-"}
                        </span>
                        <span className="text-sm text-slate-400">|</span>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          {item.pendingQuantity ?? item.confirmedQuantity}개
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={edited.quantity || ""}
                          onChange={(e) =>
                            updateItemField(
                              item.id,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={isPending || isRejected}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        />
                        <span className="text-sm text-slate-400">|</span>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          {item.pendingQuantity ?? item.confirmedQuantity}개
                        </span>
                      </div>
                    )}
                    {(isSupplierConfirmed || isRejected) && hasQtyChange && (
                      <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">
                        요청 수량: {item.orderedQuantity}개{" "}
                        {item.quantityReason && (
                          <span className="text-xs text-rose-600 dark:text-rose-400">
                            (⚠ 수량 변경: {item.quantityReason})
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* 유통기간 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      유통기간:
                    </label>
                    {isSupplierConfirmed ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100">
                        {edited.expiryDate || "-"}
                      </div>
                    ) : (
                      <input
                        type="date"
                        value={edited.expiryDate || ""}
                        onChange={(e) =>
                          updateItemField(item.id, "expiryDate", e.target.value)
                        }
                        disabled={isPending || isRejected}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                      />
                    )}
                  </div>

                  {/* 보관위치 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      보관위치
                    </label>
                    {isSupplierConfirmed ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100">
                        {edited.storageLocation || "-"}
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="창고 A-3, 냉장실 선반 1"
                        value={edited.storageLocation || ""}
                        onChange={(e) =>
                          updateItemField(
                            item.id,
                            "storageLocation",
                            e.target.value
                          )
                        }
                        disabled={isPending || isRejected}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                      />
                    )}
                  </div>

                  {/* 이번 구매가 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      이번 구매가
                    </label>
                    {order.isPlatformSupplier ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.confirmedPrice.toLocaleString()}원
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            제품 등록가: {item.orderedPrice.toLocaleString()}원
                          </div>
                          {item.confirmedPrice !== item.orderedPrice && (
                            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <svg
                                className="h-3 w-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              공급업체 가격 조정
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                          type="number"
                          min="0"
                          placeholder="구매가 입력"
                          value={edited.purchasePrice || ""}
                          onChange={(e) =>
                            updateItemField(
                              item.id,
                              "purchasePrice",
                              parseInt(e.target.value) || ""
                            )
                          }
                          disabled={isPending || isRejected}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        />
                        {(isSupplierConfirmed || isRejected) &&
                          hasPriceChange && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                              공급업체 조정:{" "}
                              {item.orderedPrice.toLocaleString()}원 →{" "}
                              {item.confirmedPrice.toLocaleString()}원
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </div>

                {/* Read-only Lot card — faqat 바코드 입고 modalida 입고 하기 bosilgandan keyin (inboundQuantity > 0) */}
                {isSupplierConfirmed && (item.inboundQuantity ?? 0) > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          Lot 번호
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {item.lotNumber || item.batchNumber || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          제조일
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {item.productionDate || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          유효기간
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {edited.expiryDate || item.expiryDate || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          입고수량
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {item.inboundQuantity ?? "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer - 입고 담당자 + Button */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
          {(isSupplierConfirmed || isRejected) && (
            <div className="flex items-center gap-2 flex-1 mr-4">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                입고 담당자:
              </label>
              <input
                type="text"
                value={inboundManagerName}
                onChange={(e) => onInboundManagerChange(e.target.value)}
                placeholder="입고 담당자 이름을 입력하세요"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 
                           focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200
                           dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200
                           dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
              />
            </div>
          )}
          {isPending ? (
            <button
              disabled
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-600 shadow-sm cursor-not-allowed dark:bg-slate-600 dark:text-slate-300"
            >
              요청중
            </button>
          ) : isRejected ? (
            <button
              onClick={async () => {
                if (
                  !confirm(
                    `주문번호 ${order.orderNo}의 거절 상황을 확인하시겠습니까?`
                  )
                ) {
                  return;
                }

                try {
                  const { apiPost } = await import("../../lib/api");
                  const memberData =
                    typeof window !== "undefined"
                      ? localStorage.getItem("erp_member_data")
                      : null;
                  const memberInfo = memberData ? JSON.parse(memberData) : {};
                  const memberName =
                    memberInfo.full_name ||
                    memberInfo.member_id ||
                    "알 수 없음";

                  // Prepare items array with product info
                  const items =
                    order.items?.map((item: any) => ({
                      productName: item.productName || "알 수 없음",
                      productBrand: item.brand || null,
                      qty: item.orderedQuantity || item.confirmedQuantity || 0,
                    })) || [];

                  const endpoint = `${apiUrl}/order/rejected-order/confirm`;

                  await apiPost(endpoint, {
                    orderId: order.orderId,
                    orderNo: order.orderNo,
                    // ✅ Removed: companyName and managerName - backend will fetch from database
                    memberName: memberName,
                    items: items,
                  });

                  alert("거절 상황이 확인되었습니다.");
                  // Refresh the orders list to remove the confirmed rejected order
                  if (onRefresh) {
                    onRefresh();
                  }
                  // Trigger a custom event to notify order page to refresh rejected orders
                  window.dispatchEvent(
                    new CustomEvent("rejectedOrderConfirmed", {
                      detail: { orderNo: order.orderNo },
                    })
                  );
                  // Also trigger a page visibility refresh to ensure data is updated
                  window.dispatchEvent(new Event("visibilitychange"));
                } catch (err: any) {
                  console.error("Failed to confirm rejection:", err);
                  alert(
                    `거절 확인 중 오류가 발생했습니다: ${err.message || "알 수 없는 오류"}`
                  );
                }
              }}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
            >
              상황 확인
            </button>
          ) : (
            <>
              {onOpenBarcodeScan && (order.id || order.orderId) && (
                <button
                  type="button"
                  onClick={() => onOpenBarcodeScan(order.id || order.orderId)}
                  className="inline-flex items-center mr-4 gap-2 rounded-xl border border-emerald-500 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  title="바코드 스캔 입고"
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
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  바코드 스캔 입고
                </button>
              )}
              <button
                onClick={() => handleProcessOrder(order)}
                disabled={processing === order.orderId}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing === order.orderId ? "처리 중..." : "✓ 입고 처리"}
              </button>
            </>
          )}
        </div>

        {/* Order Memo - Show ONLY for rejected orders with reasons OR if order has memo */}
        {(isRejected && rejectionReasons.length > 0) || order.memo ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              메모
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
              {isRejected && rejectionReasons.length > 0 ? (
                <>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    [거절 사유]
                  </span>
                  <br />
                  {rejectionReasons.map((reason: string, idx: number) => (
                    <span key={idx}>
                      • {reason}
                      {idx < rejectionReasons.length - 1 && <br />}
                    </span>
                  ))}
                  {order.memo && (
                    <>
                      <br />
                      <br />
                      <span className="font-semibold">[주문 메모]</span>
                      <br />
                      {order.memo}
                    </>
                  )}
                </>
              ) : (
                order.memo
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
