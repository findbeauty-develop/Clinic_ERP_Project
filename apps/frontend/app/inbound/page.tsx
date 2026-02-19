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
  const handleGlobalBarcodeScanned = useCallback(async (scannedBarcode: string) => {
    try {
      const { parseGS1Barcode } = await import('../../utils/barcodeParser');
      const parsed = parseGS1Barcode(scannedBarcode);
      
      if (!parsed.gtin) {
        alert('잘못된 바코드 형식입니다.');
        return;
      }
      
      // Find product by GTIN in the current product list
      const matchedProduct = products.find(p => p.barcode === parsed.gtin);
      
      if (!matchedProduct) {
        alert(`⚠️ 제품을 찾을 수 없습니다.\nGTIN: ${parsed.gtin}\n\n제품을 먼저 등록하세요.`);
        return;
      }
      
      // Auto expand the matched product
      setExpandedCardId(matchedProduct.id);
      
      // Wait for card to expand, then dispatch fill event
      setTimeout(() => {
        // Trigger batch form fill via custom event
        window.dispatchEvent(new CustomEvent('fillBatchForm', {
          detail: {
            productId: matchedProduct.id,
            batchNumber: parsed.batchNumber,
            expiryDate: parsed.expiryDate,
          }
        }));
      }, 200); // Wait 200ms for card expansion
      
      // Scroll to the product card
      setTimeout(() => {
        const element = document.getElementById(`product-card-${matchedProduct.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      
      // Show success modal instead of alert
      setScanSuccessModal({
        show: true,
        productName: matchedProduct.productName,
        batchNumber: parsed.batchNumber || '(없음)',
        expiryDate: parsed.expiryDate || '(없음)',
      });
    } catch (error) {
      console.error('Global barcode scan error:', error);
    }
  }, [products]);

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
    
    let buffer = '';
    let lastTime = 0;
    let timeout: NodeJS.Timeout;
    
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      const now = Date.now();
      
      // USB scanner types very fast (< 100ms between chars)
      if (now - lastTime > 100) buffer = '';
      
      if (e.key === 'Enter' && buffer.length >= 8) {
        handleGlobalBarcodeScanned(buffer);
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
        lastTime = now;
        
        clearTimeout(timeout);
        timeout = setTimeout(() => { buffer = ''; }, 500);
      }
    };
    
    window.addEventListener('keypress', handleGlobalKeyPress);
    return () => {
      window.removeEventListener('keypress', handleGlobalKeyPress);
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
  const fetchPendingOrders = useCallback(async (forceRefresh = false) => {
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

      // ✅ DEBUG: Log first order to check structure
      if (flatOrders.length > 0) {
        console.log('[fetchPendingOrders] First order structure:', {
          id: flatOrders[0].id,
          orderId: flatOrders[0].orderId,
          orderNo: flatOrders[0].orderNo,
        });
      }

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
  }, [apiUrl, activeTab]);

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
              onRefresh={() => {
                // Clear cache before refresh
                pendingOrdersCacheRef.current = null;
                fetchPendingOrders(true); // ✅ Pass forceRefresh=true
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
              <svg className="h-12 w-12 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
              onClick={() => setScanSuccessModal({ show: false, productName: "", batchNumber: "", expiryDate: "" })}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white transition hover:bg-emerald-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ✅ Global cache for batches (shared across all ProductCard instances)
// This prevents data loss when navigating between pages and on force refresh
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (prevents data loss on page navigation)
const CACHE_STORAGE_KEY = 'jaclit-batches-cache';

// Initialize cache from localStorage on first load
const initializeCache = (): Map<string, { data: ProductBatch[]; timestamp: number }> => {
  if (typeof window === 'undefined') return new Map();
  
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('Failed to load batches cache from localStorage:', error);
  }
  return new Map();
};

const globalBatchesCache = initializeCache();

// Save cache to localStorage whenever it changes
const saveCacheToStorage = () => {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheObject = Object.fromEntries(globalBatchesCache.entries());
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheObject));
  } catch (error) {
    console.error('Failed to save batches cache to localStorage:', error);
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
    
    let buffer = '';
    let lastTime = 0;
    let timeout: NodeJS.Timeout;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isExpanded) return;
      
      const now = Date.now();
      if (now - lastTime > 100) buffer = '';
      
      if (e.key === 'Enter' && buffer.length >= 8) {
        handleBatchBarcodeScanned(buffer);
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
        lastTime = now;
        
        clearTimeout(timeout);
        timeout = setTimeout(() => { buffer = ''; }, 500);
      }
    };
    
    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
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
      const { parseGS1Barcode } = await import('../../utils/barcodeParser');
      const parsed = parseGS1Barcode(scannedBarcode);
      
      // Verify GTIN matches current product
      if (parsed.gtin && parsed.gtin !== product.barcode) {
        alert('⚠️ 잘못된 바코드입니다. 다른 제품의 바코드입니다.');
        return;
      }
      
      // Auto-fill batch number (LOT) from GS1
      if (parsed.batchNumber) {
        setBatchForm(prev => ({
          ...prev,
          batchNumber: parsed.batchNumber || "",
        }));
      }
      
      // Auto-fill expiry date from GS1
      if (parsed.expiryDate) {
        setBatchForm(prev => ({
          ...prev,
          expiryDate: parsed.expiryDate || prev.expiryDate,
        }));
      }
      
      // Auto-calculate manufacture date
      if (parsed.expiryDate && product.expiryMonths) {
        const expiry = new Date(parsed.expiryDate);
        const mfg = new Date(expiry);
        
        if (product.expiryUnit === 'months') {
          mfg.setMonth(mfg.getMonth() - product.expiryMonths);
        } else {
          mfg.setDate(mfg.getDate() - product.expiryMonths);
        }
        
        setBatchForm(prev => ({
          ...prev,
          manufactureDate: mfg.toISOString().split('T')[0],
        }));
      }
      
      alert(
        `✅ 배치 스캔 완료!\n` +
        `배치번호: ${parsed.batchNumber || '(없음)'}\n` +
        `유효기간: ${parsed.expiryDate || '(없음)'}`
      );
    } catch (error) {
      console.error('Barcode parsing error:', error);
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
      const calculatedManufactureDate = calculatedMfgDate.toISOString().split("T")[0];

      setBatchForm((prev) => ({ ...prev, manufactureDate: calculatedManufactureDate }));
    }
  }, [batchForm.expiryDate, product.expiryMonths, product.expiryUnit, batchForm.manufactureDate]);

  // ✅ Listen for global barcode scan events to auto-fill batch form
  useEffect(() => {
    const handleFillBatchForm = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { productId, batchNumber, expiryDate } = customEvent.detail;
      
      // Only fill if this is the target product
      if (productId !== product.id) return;
      
      // Only fill if card is expanded
      if (!isExpanded) return;
      
      console.log('[fillBatchForm] Filling form for product:', productId, { batchNumber, expiryDate });
      
      // Fill batch form
      setBatchForm(prev => ({
        ...prev,
        batchNumber: batchNumber || "",
        expiryDate: expiryDate || prev.expiryDate,
      }));
      
      // Auto-calculate manufacture date if possible
      if (expiryDate && product.expiryMonths) {
        const expiry = new Date(expiryDate);
        const mfg = new Date(expiry);
        
        if (product.expiryUnit === 'months') {
          mfg.setMonth(mfg.getMonth() - product.expiryMonths);
        } else if (product.expiryUnit === 'days') {
          mfg.setDate(mfg.getDate() - product.expiryMonths);
        } else if (product.expiryUnit === 'years') {
          mfg.setFullYear(mfg.getFullYear() - product.expiryMonths);
        }
        
        setBatchForm(prev => ({
          ...prev,
          manufactureDate: mfg.toISOString().split('T')[0],
        }));
      }
    };
    
    // Always add listener (not conditional on isExpanded)
    window.addEventListener('fillBatchForm', handleFillBatchForm);
    return () => {
      window.removeEventListener('fillBatchForm', handleFillBatchForm);
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
                      setBatchForm({ ...batchForm, isSeparatePurchase: e.target.checked });
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
                <span className="font-semibold">Jaclit을 통해 주문한 제품은</span> : 「입고」 → 「입고 대기」 에서 입고 처리를 진행합니다.
              </p>
            </div>

            {/* Row 1: 배치번호 + 입고 수량 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 배치번호 (선택가능) */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  배치번호
                  <span className="text-xs font-normal text-slate-500">(선택가능)</span>
                </label>
                <input
                  type="text"
                  placeholder="자동 생성됩니다 (BTX-XXX) 또는 바코드 스캔"
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
                    onChange={(e) => setBatchQuantity(Number(e.target.value) || 0)}
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
                    {product.unit || 'box'}
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
                    setBatchForm({ ...batchForm, manufactureDate: e.target.value });
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
                      setBatchForm({ ...batchForm, purchasePrice: numericValue });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  {product.purchasePrice && (
                    <div className="text-xs text-slate-500">
                      전구매가 {Number(product.purchasePrice).toLocaleString()} / {product.unit || 'box'}
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
                    setBatchForm({ ...batchForm, storageLocation: e.target.value });
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
                    setBatchForm({ ...batchForm, inboundManager: e.target.value });
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
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
  const [importMode, setImportMode] = useState<"strict" | "flexible">("strict");
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

  const parseCSV = (file: File) => {
    setLoading(true);
    setPreview(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep all fields as strings
      complete: async (results) => {
        try {
          // ✅ getAccessToken() ishlatish (localStorage emas)
          const token = await getAccessToken();
          if (!token) {
            alert("로그인이 필요합니다.");
            setLoading(false);
            return;
          }

          // Send to backend for preview
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/products/import/preview`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ rows: results.data }),
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

    if (!inboundManager.trim()) {
      alert("입고 담당자를 입력하세요.");
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
            mode: importMode,
            inboundManager: inboundManager.trim(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status} error`);
      }

      const result = await response.json();

      alert(
        `✅ Import 완료!\n\n` +
          `전체: ${result.total}개\n` +
          `성공: ${result.imported}개\n` +
          `실패: ${result.failed}개`
      );

      // Reset and close
      setFile(null);
      setPreview(null);
      setImportMode("strict");
      setInboundManager(""); // Reset inbound manager
      onImport();
      onClose();
    } catch (error: any) {
      console.error("Import error:", error);
      alert(`Import 실패: ${error.message}`);
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
      "name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,storage,barcode,purchase_price,sale_price,contact_phone",
      "시럽A,브랜드A,의약품,100,EA,10,50,ml,5,2026-12-31,30,냉장,1234567890,5000,8000,010-1234-5678",
      "주사기B,브랜드B,의료기기,200,BOX,20,100,개,10,12/31/2027,60,상온,0987654321,7000,12000,",
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
              {preview.errors > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
                    ⚠️ 오류가 발견되었습니다
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="strict"
                        checked={importMode === "strict"}
                        onChange={(e) =>
                          setImportMode(e.target.value as "strict")
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          Strict Mode (전체 또는 없음)
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          모든 데이터가 유효해야 Import 진행
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="flexible"
                        checked={importMode === "flexible"}
                        onChange={(e) =>
                          setImportMode(e.target.value as "flexible")
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          Flexible Mode (유효한 데이터만)
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          오류가 있는 행은 건너뛰고 유효한 행만 Import
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Error List (show first 20 errors) */}
              {preview.errors > 0 && (
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
              )}

              {/* Success Message */}
              {preview.errors === 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="font-semibold text-green-900 dark:text-green-100">
                    모든 데이터가 유효합니다!
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {preview.valid}개 제품을 Import할 준비가 되었습니다.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          {/* Inbound Manager Input */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              입고 담당자*
            </label>
            <input
              type="text"
              value={inboundManager}
              onChange={(e) => setInboundManager(e.target.value)}
              placeholder="입고 담당자 이름을 입력하세요"
              disabled={importing}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setInboundManager("");
                setImportMode("strict");
                onClose();
              }}
              disabled={importing}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={
                !preview ||
                !inboundManager.trim() ||
                importing ||
                (importMode === "strict" && preview.errors > 0)
              }
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing
                ? "Import 중..."
                : `Import (${preview?.valid || 0}개 제품)`}
            </button>
          </div>
        </div>
      </div>
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
}: {
  orders: any[];
  loading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  apiUrl: string;
  onRefresh: () => void;
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

  const inboundManagerName = useMemo(
    () => memberInfo?.full_name || memberInfo?.member_id || "알 수 없음",
    [memberInfo]
  );

  // ✅ ADD: State for inbound managers per order
  const [inboundManagers, setInboundManagers] = useState<Record<string, string>>({});

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
  }, [orders, inboundManagerName]);

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
    console.log('[handleProcessOrder] Order data:', {
      id: order.id,
      orderId: order.orderId,
      orderNo: order.orderNo,
    });

    // ✅ Use id or orderId as fallback
    const orderIdToUse = order.id || order.orderId;

    if (!orderIdToUse) {
      console.error('[handleProcessOrder] ERROR: No order ID found!');
      alert('주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.');
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

    // Validate all items have required data
    for (const item of order.items) {
      const edited = editedItems[item.id];
      if (!edited?.expiryDate) {
        alert(`${item.productName}의 유통기한을 입력해주세요.`);
        return;
      }
      if (!edited?.quantity || edited.quantity <= 0) {
        alert(`${item.productName}의 수량을 입력해주세요.`);
        return;
      }
      if (!edited?.purchasePrice || edited.purchasePrice <= 0) {
        alert(`${item.productName}의 구매가를 입력해주세요.`);
        return;
      }
    }

    // Check for quantity discrepancies
    const insufficientItems = [];
    for (const item of order.items) {
      const edited = editedItems[item.id];
      const confirmedQty = item.confirmedQuantity || item.orderedQuantity;
      const inboundQty = edited?.quantity || 0;

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
      console.error('[processInboundOrder] ERROR: No order ID found!', order);
      alert('주문 정보가 올바르지 않습니다. 페이지를 새로고침해주세요.');
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

      // ✅ Use inboundManagers state instead of localStorage
      const inboundManager = inboundManagers[orderIdToUse] || inboundManagerName || "자동입고";

      // Group items by productId
      const itemsByProduct = new Map<string, any[]>();
      itemsToProcess.forEach((item: any) => {
        const existing = itemsByProduct.get(item.productId) || [];
        existing.push(item);
        itemsByProduct.set(item.productId, existing);
      });

      // Create batches and returns for each product
      const returnItems: any[] = [];

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

        // Calculate excess (ortiqcha)
        const excessQty = confirmedQty - inboundQty;

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

        const batchPayload: any = {
          qty: inboundQty,
          purchase_price: editedFirstItem?.purchasePrice || 0,
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
        // Backend returns batch object directly with batch_no
        const batchNo = createdBatch.batch_no || "";

        // If excess, prepare return item
        if (excessQty > 0) {
          returnItems.push({
            productId: firstItem.productId,
            productName: firstItem.productName,
            brand: firstItem.brand || "",
            batchNo: batchNo,
            returnQuantity: excessQty,
            totalQuantity: confirmedQty,
            unitPrice: editedFirstItem?.purchasePrice || 0,
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
        alert("입고 처리가 완료되었습니다.");
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
    console.log('[Partial Inbound] Order data:', {
      id: order.id,
      orderId: order.orderId,
      orderNo: order.orderNo,
    });

    if (!order.id && !order.orderId) {
      console.error('[Partial Inbound] ERROR: No order ID found!');
      alert('주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.');
      return;
    }

    // ✅ Use orderId as fallback if id is missing
    const orderIdToUse = order.id || order.orderId;
    
    // ✅ Order'dan barcha item'larni ko'rib chiqish (qisman va to'liq inbound qilinadigan item'lar ham)
    const validItems = order.items.filter((item: any) => {
      const edited = editedItems[item.id];
      const inboundQty = edited?.quantity || 0;
      return inboundQty > 0; // ✅ Barcha inbound qilinadigan item'lar (Product A 80ta, Product B 100ta)
    });

    // ✅ Debug: validItems ni ko'rsatish
    console.log('[Partial Inbound] Valid items:', validItems.map((item: any) => ({
      id: item.id,
      productId: item.productId || item.product_id,
      productName: item.productName,
      inboundQty: editedItems[item.id]?.quantity || 0,
    })));

    if (validItems.length === 0) {
      alert("입고 가능한 제품이 없습니다.");
      return;
    }

    setShowInboundModal(false);
    setProcessing(order.orderId);

    try {
      const { apiPost } = await import("../../lib/api");

      // ✅ Use inboundManagers state instead of localStorage
      const inboundManager = inboundManagers[orderIdToUse] || inboundManagerName || "자동입고";

      // Create batches for valid items
      for (const item of validItems) {
        const editedItem = editedItems[item.id];
        const inboundQty = editedItem?.quantity || 0;

        if (inboundQty <= 0) continue;

        // ✅ Get productId from item (productId or product_id)
        const productId = item.productId || item.product_id;
        if (!productId) {
          console.error(`[Partial Inbound] Product ID not found for item ${item.id}`);
          continue;
        }

        // Get expiry info from product
        const expiryMonths = item.expiryMonths;
        const expiryUnit = item.expiryUnit || "months";
        const alertDays = item.alertDays;

        // Calculate manufacture date
        let manufactureDate = null;
        if (editedItem?.expiryDate && expiryMonths) {
          const expiryDateObj = new Date(editedItem.expiryDate);
          if (expiryUnit === "days") {
            expiryDateObj.setDate(expiryDateObj.getDate() - expiryMonths);
          } else {
            expiryDateObj.setMonth(expiryDateObj.getMonth() - expiryMonths);
          }
          manufactureDate = expiryDateObj.toISOString().split("T")[0];
        }

        const batchPayload: any = {
          qty: inboundQty,
          purchase_price: editedItem?.purchasePrice || 0,
          expiry_date: editedItem?.expiryDate,
          inbound_manager: inboundManager,
        };

        if (manufactureDate) batchPayload.manufacture_date = manufactureDate;
        if (expiryMonths) batchPayload.expiry_months = expiryMonths;
        if (expiryUnit) batchPayload.expiry_unit = expiryUnit;
        if (alertDays) batchPayload.alert_days = alertDays;
        if (editedItem?.storageLocation)
          batchPayload.storage = editedItem.storageLocation;

        // Create batch
        await apiPost<any>(
          `${apiUrl}/products/${productId}/batches`,
          batchPayload
        );
      }

      // ✅ Call partial inbound API - item'ning bir qismini inbound qilish, qolgan qismini order'da qoldirish
      const inboundedItems = validItems.map((item: any) => {
        const inboundQty = editedItems[item.id]?.quantity || 0;
        
        // ✅ Debug log
        console.log(`[Partial Inbound] Item ${item.id} (${item.productName || item.productId}): inboundQty=${inboundQty}, originalQty=${item.confirmedQuantity || item.orderedQuantity || item.quantity}`);
        
        return {
          itemId: item.id,
          productId: item.productId || item.product_id, // ✅ productId yoki product_id
          inboundQty: inboundQty, // ✅ 입고수량 (80ta yoki 100ta)
        };
      });

      // ✅ Debug: inboundedItems ni ko'rsatish
      console.log('[Partial Inbound] InboundedItems:', inboundedItems);
      console.log('[Partial Inbound] Order ID to use:', orderIdToUse);

      const result = await apiPost(
        `${apiUrl}/order/${orderIdToUse}/partial-inbound`, // ✅ Use fallback ID
        {
          inboundedItems,
          inboundManager,
        }
      );

      // ✅ FIXED: Calculate remaining quantity correctly
      // remaining = confirmedQty - (already inbound) - (new inbound)
      const totalRemainingQty = order.items.reduce((sum: number, item: any) => {
        const edited = editedItems[item.id];
        const confirmedQty = item.confirmedQuantity || item.orderedQuantity || 0;
        const alreadyInbound = item.inboundQuantity || 0; // ✅ Already inbound from database
        const newInbound = edited?.quantity || 0; // ✅ New inbound from user input
        const totalInbound = alreadyInbound + newInbound; // ✅ Total inbound
        const remaining = confirmedQty - totalInbound; // ✅ Real remaining
        return sum + (remaining > 0 ? remaining : 0);
      }, 0);

      // ✅ Better alert messages
      const inboundProductNames = validItems.map((item: any) => item.productName).join(", ");
      const totalInboundQty = validItems.reduce((sum: number, item: any) => 
        sum + (editedItems[item.id]?.quantity || 0), 0
      );

      if (totalRemainingQty > 0) {
        alert(
          `${inboundProductNames}\n${totalInboundQty}개 입고 완료되었습니다.\n남은 ${totalRemainingQty}개 제품은 재입고 대기 중입니다.`
        );
      } else {
        alert(`${inboundProductNames}\n남은 ${totalInboundQty}개 입고 완료되었습니다.`);
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

    // ✅ DEBUG: Check order ID
    console.log('[navigateToReturns] Order data:', {
      id: order.id,
      orderId: order.orderId,
      orderNo: order.orderNo,
    });

    if (!order.id && !order.orderId) {
      console.error('[navigateToReturns] ERROR: No order ID found!');
      alert('주문 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.');
      return;
    }

    // ✅ Use id or orderId as fallback
    const orderIdToUse = order.id || order.orderId;

    setShowInboundModal(false);
    setProcessing(orderIdToUse);

    try {
      const { apiPost } = await import("../../lib/api");

      // ✅ Use inboundManagers state instead of localStorage
      const inboundManager = inboundManagers[orderIdToUse] || inboundManagerName || "자동입고";

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

          const batchPayload: any = {
            qty: inboundQty,
            purchase_price: editedFirstItem?.purchasePrice || 0,
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
              unitPrice: editedFirstItem?.purchasePrice || 0,
            });
          }
        } else if (shortageQty > 0) {
          // No inbound, but shortage exists - create return without batch
          returnItems.push({
            productId: firstItem.productId,
            productName: firstItem.productName,
            brand: firstItem.brand || "",
            batchNo: "",
            returnQuantity: shortageQty,
            totalQuantity: confirmedQty,
            unitPrice: editedFirstItem?.purchasePrice || 0,
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
                  const hasPartialInbound = modalData.order.items.some((item: any) => {
                    const inboundQty = item.inboundQuantity || 0;
                    const confirmedQty = item.confirmedQuantity || item.orderedQuantity || 0;
                    return inboundQty > 0 && inboundQty < confirmedQty;
                  });
                  
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
                  const hasPartialInbound = modalData.order.items.some((item: any) => {
                    const inboundQty = item.inboundQuantity || 0;
                    const confirmedQty = item.confirmedQuantity || item.orderedQuantity || 0;
                    return inboundQty > 0 && inboundQty < confirmedQty;
                  });
                  
                  return hasPartialInbound
                    ? "입고 처리를 진행하시겠습니까?" // Qolgan pending
                    : (
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
                const hasPartialInbound = modalData.order.items.some((item: any) => {
                  const inboundQty = item.inboundQuantity || 0;
                  const confirmedQty = item.confirmedQuantity || item.orderedQuantity || 0;
                  return inboundQty > 0 && inboundQty < confirmedQty;
                });

                // ✅ Agar partial inbound bo'lsa → Qolgan pending → Bitta "입고 완료" button
                if (hasPartialInbound) {
                  return (
                    <button
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      onClick={handlePartialInbound}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

                {/* Editable Fields - Read-only for pending orders */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* 입고수량 (Editable with original qty shown) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      입고수량:
                    </label>
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
                    {(isSupplierConfirmed || isRejected) && hasQtyChange && (
                      <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">
                        요청 수량: {item.orderedQuantity}개 {item.quantityReason && (
                        <span className="text-xs text-rose-600 dark:text-rose-400">
                          (⚠ 수량 변경: {item.quantityReason})
                        </span>
                      )}
                      </p>
                    )}
                  </div>

                  {/* 유통기간: (Editable) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      유통기간:
                    </label>
                    <input
                      type="date"
                      value={edited.expiryDate || ""}
                      onChange={(e) =>
                        updateItemField(item.id, "expiryDate", e.target.value)
                      }
                      disabled={isPending || isRejected}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                    />
                  </div>

                  {/* 보관위치 (Editable) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      보관위치
                    </label>
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
                  </div>

                  {/* 이번 구매가 (Editable) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      이번 구매가
                    </label>
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
                    {(isSupplierConfirmed || isRejected) && hasPriceChange && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        공급업체 조정: {item.orderedPrice.toLocaleString()}원 →{" "}
                        {item.confirmedPrice.toLocaleString()}원
                      </p>
                    )}
                  </div>
                </div>
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
            <button
              onClick={() => handleProcessOrder(order)}
              disabled={processing === order.orderId}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing === order.orderId ? "처리 중..." : "✓ 입고 처리"}
            </button>
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

