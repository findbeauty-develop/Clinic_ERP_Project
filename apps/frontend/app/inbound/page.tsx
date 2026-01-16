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
  qty?: number; // Original qty from inbound (immutable)
  created_at: string;
};

type ProductListItem = {
  id: string;
  productName: string;
  brand: string;
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
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const [activeTab, setActiveTab] = useState<"quick" | "pending">("quick");
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const itemsPerPage = 10;

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
  const PENDING_ORDERS_CACHE_TTL = 30000; // 30 seconds

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedCategory, setSelectedCategory] = useState("전체 카테고리");
  const [selectedStatus, setSelectedStatus] = useState("전체 상태");
  const [selectedSupplier, setSelectedSupplier] = useState("전체 공급업체");

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

  // ✅ Listen for product deletion events and update state immediately
  useEffect(() => {
    const handleProductDeleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{ productId: string }>;
      const { productId } = customEvent.detail;

      // Use ref to get current activeTab value (avoid closure issues)
      const currentActiveTab = activeTabRef.current;
      console.log(
        "[Inbound] Product deleted event received:",
        productId,
        "activeTab:",
        currentActiveTab
      );

      if (!productId) {
        console.warn("[Inbound] No productId in event detail");
        return;
      }

      // ✅ Always remove product from local state immediately (optimistic update)
      // Don't check activeTab - we want to update state regardless of tab
      setProducts((prevProducts) => {
        const filtered = prevProducts.filter((p) => p.id !== productId);
        console.log(
          "[Inbound] Products before:",
          prevProducts.length,
          "after:",
          filtered.length,
          "removed productId:",
          productId
        );
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
          console.log("[Inbound] Fetching fresh products from API...");
          const freshData = await apiGet<any[]>(
            `${apiUrl}/products?_t=${Date.now()}`,
            {
              headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
              },
            }
          );

          console.log("[Inbound] Fresh products received:", freshData.length);

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
          console.log("[Inbound] Products updated:", formattedProducts.length);
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
  const fetchPendingOrders = useCallback(async () => {
    if (activeTab !== "pending") return;

    // Check cache first
    const cached = pendingOrdersCacheRef.current;
    if (cached && Date.now() - cached.timestamp < PENDING_ORDERS_CACHE_TTL) {
      setPendingOrders(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { apiGet } = await import("../../lib/api");
      const groupedData = await apiGet<any[]>(
        `${apiUrl}/order/pending-inbound`
      );

      // Flatten grouped data: each supplier group has an array of orders
      const flatOrders: any[] = [];
      groupedData.forEach((supplierGroup: any) => {
        supplierGroup.orders?.forEach((order: any) => {
          flatOrders.push({
            ...order,
            supplierName: supplierGroup.supplierName,
            managerName: supplierGroup.managerName,
            managerPosition: supplierGroup.managerPosition,
            isPlatformSupplier: supplierGroup.isPlatformSupplier, // ✅ NEW
          });
        });
      });

      setPendingOrders(flatOrders);
      // Update cache
      pendingOrdersCacheRef.current = {
        data: flatOrders,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error("Failed to load pending orders", err);
      setError("입고 대기 주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
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
            {/* <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
              <UploadIcon className="h-5 w-5" />
              CSV로 대량 등록
            </button> */}
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
              error={error}
              apiUrl={apiUrl}
              onRefresh={() => {
                // Clear cache before refresh
                pendingOrdersCacheRef.current = null;
                fetchPendingOrders();
              }}
            />
          )}
        </section>
      </section>
    </main>
  );
}

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
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const isLowStock = product.currentStock <= product.minStock;

  // Cache for batches to prevent duplicate requests
  const batchesCacheRef = useRef<
    Map<string, { data: ProductBatch[]; timestamp: number }>
  >(new Map());
  const CACHE_TTL = 30000; // 30 seconds

  useEffect(() => {
    const fetchBatches = async () => {
      if (!isExpanded) {
        // Don't clear batches when collapsed, just don't fetch
        return;
      }

      // Check cache first
      const cacheKey = `${product.id}`;
      const cached = batchesCacheRef.current.get(cacheKey);
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
        batchesCacheRef.current.set(cacheKey, { data, timestamp: Date.now() });
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
      const token =
        localStorage.getItem("erp_access_token") ||
        localStorage.getItem("token");
      const tenantId =
        localStorage.getItem("erp_tenant_id") ||
        localStorage.getItem("tenantId");

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
      });
      setBatchQuantity(1);

      // ✅ Clear cache va force refresh batches list
      const { apiGet, clearCache } = await import("../../lib/api");

      // Clear API cache for batches endpoint
      clearCache(`/products/${product.id}/batches`);
      clearCache(`products/${product.id}/batches`);

      // Clear local batches cache
      const cacheKey = `${product.id}`;
      batchesCacheRef.current.delete(cacheKey);

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
      batchesCacheRef.current.set(cacheKey, {
        data: updatedBatches,
        timestamp: Date.now(),
      });

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
                {product.currentStock.toLocaleString()} /{" "}
                {product.minStock.toLocaleString()} {product.unit ?? "EA"}
              </span>

              {product.supplierName && (
                <span className="inline-flex items-center gap-1">
                  <TruckIcon className="h-4 w-4 text-indigo-500" />
                  {product.supplierName}
                </span>
              )}

              {product.storageLocation && (
                <span className="inline-flex items-center gap-1">
                  <WarehouseIcon className="h-4 w-4" />
                  {product.storageLocation}
                </span>
              )}
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

          <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-500/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                새 배치 입고 처리
              </div>
            </div>

            {/* 입고 담당자 - Editable input field */}
            <div className="flex items-center">
              <label className="w-28 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                입고 담당자 *
              </label>

              <input
                type="text"
                placeholder="입고 담당자 이름을 입력하세요"
                value={batchForm.inboundManager}
                onChange={(e) =>
                  setBatchForm({ ...batchForm, inboundManager: e.target.value })
                }
                onClick={(e) => e.stopPropagation()}
                className="rounded-xl border border-slate-200 bg-white px-1 w-full  max-w-sm py-2 text-sm text-slate-800
               focus:border-sky-400 focus:outline-none
               dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200
               dark:focus:border-sky-500"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <QuantityField
                value={batchQuantity}
                onChange={setBatchQuantity}
              />
              <InlineField
                label="구매원가 (원)"
                placeholder="구매원가를 입력하세요"
                type="text"
                value={
                  batchForm.purchasePrice
                    ? Number(batchForm.purchasePrice).toLocaleString()
                    : ""
                }
                onChange={(value) => {
                  // Remove commas and keep only numbers
                  const numericValue = value.replace(/,/g, "");
                  setBatchForm({ ...batchForm, purchasePrice: numericValue });
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <InlineField
                  label="유효 기간 *"
                  type="date"
                  value={batchForm.expiryDate}
                  onChange={(value) =>
                    setBatchForm({ ...batchForm, expiryDate: value })
                  }
                />
                {batchForm.manufactureDate &&
                  product.expiryMonths &&
                  product.expiryUnit && (
                    <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                      계산된 유통기한: {batchForm.expiryDate || "계산 중..."}
                    </p>
                  )}
              </div>
              {/* 보관 위치 - to'liq width */}
              <InlineField
                label="보관 위치"
                placeholder="예: 창고 A-3, 냉장실 1번"
                value={batchForm.storageLocation}
                onChange={(value) =>
                  setBatchForm({ ...batchForm, storageLocation: value })
                }
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCreateBatch}
                disabled={submittingBatch}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingBatch ? "처리 중..." : "+ 입고"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

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
  error,
  apiUrl,
  onRefresh,
}: {
  orders: any[];
  loading: boolean;
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
    // Debug log

    // Validation checks first
    const token =
      localStorage.getItem("erp_access_token") || localStorage.getItem("token");
    const tenantId =
      localStorage.getItem("erp_tenant_id") || localStorage.getItem("tenantId");

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
    setProcessing(order.orderId);
    try {
      const token =
        localStorage.getItem("erp_access_token") ||
        localStorage.getItem("token");
      const tenantId =
        localStorage.getItem("erp_tenant_id") ||
        localStorage.getItem("tenantId");

      if (!token || !tenantId) {
        alert("로그인이 필요합니다.");
        return;
      }

      // Validate orderId
      if (!order.orderId) {
        console.error("Order ID is missing:", order);
        alert("주문 정보가 올바르지 않습니다. 페이지를 새로고침해주세요.");
        return;
      }

      // Process each item in the order
      const { apiPost, apiGet } = await import("../../lib/api");

      // Get current member info for inbound_manager
      const memberData = localStorage.getItem("erp_member_data");
      const memberInfo = memberData ? JSON.parse(memberData) : {};
      const inboundManager =
        memberInfo.member_id || memberInfo.full_name || "자동입고"; // Use member_id for return_manager

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
            orderId: order.orderId,
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
          console.log("Completing order:", order.orderId); // Debug log
          await apiPost(`${apiUrl}/order/${order.orderId}/complete`, {});
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

    const { order, items } = modalData;

    console.log("handlePartialInbound called:", {
      orderId: order.orderId,
      orderNo: order.orderNo,
      totalItems: order.items?.length,
    });

    // Filter items that have sufficient quantity
    const validItems = order.items.filter((item: any) => {
      const edited = editedItems[item.id];
      const confirmedQty = item.confirmedQuantity || item.orderedQuantity;
      const inboundQty = edited?.quantity || 0;
      return inboundQty >= confirmedQty;
    });

    console.log("Valid items filtered:", {
      validItemsCount: validItems.length,
      validItems: validItems.map((i: any) => ({
        id: i.id,
        productName: i.productName,
        confirmedQty: i.confirmedQuantity || i.orderedQuantity,
        inboundQty: editedItems[i.id]?.quantity,
      })),
    });

    if (validItems.length === 0) {
      alert("입고 가능한 제품이 없습니다.");
      return;
    }

    setShowInboundModal(false);

    // Process only valid items (partial inbound)
    await processInboundOrder(order, validItems, true);

    const processedCount = validItems.length;
    const remainingCount = order.items.length - validItems.length;

    if (remainingCount > 0) {
      alert(
        `${processedCount}개 제품이 입고되었습니다.\n${remainingCount}개 제품은 재입고 대기 중입니다.`
      );
    } else {
      alert(`${processedCount}개 제품이 입고되었습니다.`);
    }
  };

  // Handler for navigating to returns page (반품 및 교환 진행)
  const navigateToReturns = async () => {
    if (!modalData) return;

    const { order } = modalData;

    setShowInboundModal(false);
    setProcessing(order.orderId);

    try {
      const { apiPost } = await import("../../lib/api");

      // Get current member info for inbound_manager
      const memberData = localStorage.getItem("erp_member_data");
      const memberInfo = memberData ? JSON.parse(memberData) : {};
      const inboundManager =
        memberInfo.member_id || memberInfo.full_name || "자동입고";

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
            orderId: order.orderId,
            orderNo: order.orderNo,
            items: returnItems,
            inboundManager: inboundManager,
          });

          // Mark order as completed
          await apiPost(`${apiUrl}/order/${order.orderId}/complete`, {});

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
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="주문 목록 새로고침"
        >
          <svg
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
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
        {currentOrders.map((order) => (
          <OrderCard
            key={order.orderId}
            order={order}
            editedItems={editedItems}
            updateItemField={updateItemField}
            handleProcessOrder={handleProcessOrder}
            processing={processing}
            inboundManagerName={inboundManagerName}
            onRefresh={onRefresh}
            apiUrl={apiUrl}
          />
        ))}
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
                일부 상품의 입고 수량이 부족합니다
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
                부족한 수량은 추후 재입고 예정인가요?
                <br />
                재입고가 어려운 경우, 반품 절차를 통해 처리됩니다.
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
  onRefresh,
  apiUrl,
}: {
  order: any;
  editedItems: Record<string, any>;
  updateItemField: (itemId: string, field: string, value: any) => void;
  handleProcessOrder: (order: any) => void;
  processing: string | null;
  inboundManagerName: string;
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
                      {item.quantityReason && (
                        <span className="text-xs text-rose-600 dark:text-rose-400">
                          ⚠ 수량 변경: {item.quantityReason}
                        </span>
                      )}
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
                        {item.orderedQuantity}개
                      </span>
                    </div>
                    {(isSupplierConfirmed || isRejected) && hasQtyChange && (
                      <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">
                        공급업체 조정: {item.confirmedQuantity}개
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                입고 담당자:
              </span>
              <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                {inboundManagerName}
              </span>
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
