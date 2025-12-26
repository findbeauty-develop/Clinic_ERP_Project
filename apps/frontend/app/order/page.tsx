"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Scrollbar styling
const scrollbarStyles = `
  /* Webkit browsers (Chrome, Safari, Edge) */
  .order-page-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .order-page-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .order-page-scrollbar::-webkit-scrollbar-thumb {
    background: white;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  .order-page-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #f3f4f6;
  }
  /* Firefox */
  .order-page-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: white transparent;
  }
`;

type ProductWithRisk = {
  id: string;
  productName: string;
  brand: string;
  supplierId: string | null;
  supplierName: string | null;
  managerName: string | null; // 담당자명
  managerPosition?: string | null; // 담당자 직함
  batchNo: string | null;
  expiryDate: string | null;
  unitPrice: number | null;
  currentStock: number;
  minStock: number;
  isLowStock: boolean; // 재고 부족 여부
  batches: Array<{
    id: string;
    batchNo: string;
    expiryDate: string | null;
    qty: number;
    purchasePrice: number | null;
    isExpiringSoon: boolean; // 유효기한 임박 여부
    daysUntilExpiry: number | null; // 만료까지 남은 일수
  }>;
};

type DraftItem = {
  id: string;
  productId: string;
  batchId?: string;
  supplierId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  memo?: string;
  isHighlighted?: boolean;
};

type DraftResponse = {
  id: string;
  sessionId: string;
  items: DraftItem[];
  totalAmount: number;
  groupedBySupplier: Array<{
    supplierId: string;
    items: DraftItem[];
    totalAmount: number;
  }>;
  itemIdMap: Record<
    string,
    {
      productId: string;
      batchId: string | null;
      supplierId: string;
      itemId: string;
    }
  >;
};

type FilterTab = "low" | "expiring" | "all";

export default function OrderPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [activeTab, setActiveTab] = useState<"processing" | "history">(
    "processing"
  );
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [products, setProducts] = useState<ProductWithRisk[]>([]);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, number>
  >({}); // Return qilinadigan miqdorlar
  const [returnChecked, setReturnChecked] = useState<Record<string, boolean>>(
    {}
  ); // Return checkbox holati
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderMemos, setOrderMemos] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [rejectedOrders, setRejectedOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const debouncedOrderSearchQuery = useDebounce(orderSearchQuery, 500);
  const [showOrderFormModal, setShowOrderFormModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderFormMemo, setOrderFormMemo] = useState<string>("");
  const [supplierDetails, setSupplierDetails] = useState<any | null>(null);
  const [loadingSupplierDetails, setLoadingSupplierDetails] = useState(false);
  const orderFormRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [clinicData, setClinicData] = useState<any | null>(null);

  // Current logged-in member name (read-only)
  const [orderManagerName, setOrderManagerName] = useState("");

  // Session ID'ni client-side'da initialize qilish (hydration error'dan qochish uchun)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const existingSessionId = localStorage.getItem("order_session_id");
      const newSessionId = existingSessionId || `session-${Date.now()}`;
      setSessionId(newSessionId);
      localStorage.setItem("order_session_id", newSessionId);
    }
  }, []);

  // Initialize manager name from localStorage (current logged-in member)
  useEffect(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (memberData) {
      const member = JSON.parse(memberData);
      setOrderManagerName(member.full_name || member.member_id || "");
    }
  }, []);

  // Fetch clinic data
  useEffect(() => {
    const fetchClinicData = async () => {
      try {
        // Get tenant_id from localStorage
        const tenantId =
          typeof window !== "undefined"
            ? localStorage.getItem("erp_tenant_id")
            : null;
        const url = tenantId
          ? `${apiUrl}/iam/members/clinics?tenantId=${encodeURIComponent(tenantId)}`
          : `${apiUrl}/iam/members/clinics`;

        console.log("Fetching clinic data from:", url);
        const clinics = await apiGet<any[]>(url);
        console.log("Fetched clinics:", clinics);
        console.log("Number of clinics:", clinics?.length || 0);

        if (clinics && clinics.length > 0) {
          // Get the first clinic (or match by tenant_id if available)
          const clinic = clinics[0];
          console.log("Selected clinic data:", clinic);
          console.log("Clinic name:", clinic.name);
          console.log("Clinic location:", clinic.location);
          console.log("Clinic phone_number:", clinic.phone_number);
          console.log("All clinic fields:", Object.keys(clinic));
          setClinicData(clinic);
        } else {
          console.warn("No clinics found. Response:", clinics);
        }
      } catch (err: any) {
        console.error("Failed to load clinic data", err);
        console.error("Error details:", err.message, err.stack);
      }
    };
    fetchClinicData();
  }, [apiUrl]);

  // Order form modal ochilganda memo'ni yangilash
  useEffect(() => {
    if (selectedOrder) {
      setOrderFormMemo(selectedOrder.memo || "");
    }
  }, [selectedOrder]);

  // Products olish - Backend에서 모든 제품 가져오기
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend에서 모든 제품 가져오기 (filtering은 frontend에서)
      const data = await apiGet<any[]>(`${apiUrl}/order/products`);
      console.log("Fetched products:", data.length);
      setProducts(data);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("제품 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Refresh products when page becomes visible (after inbound processing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Page became visible, refresh products to get updated stock
        fetchProducts();
      }
    };

    const handleFocus = () => {
      // Window gained focus, refresh products
      fetchProducts();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchProducts]);

  // Draft olish (loading bilan)
  const fetchDraft = useCallback(async () => {
    if (!sessionId) return; // SessionId tayyor bo'lmaguncha kutish

    setDraftLoading(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("erp_access_token")
          : null;

      const response = await fetch(`${apiUrl}/order/draft`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-session-id": sessionId,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch draft");

      const data = await response.json();
      setDraft(data);

      // Quantities'ni yangilash (itemId va productId ikkalasini ham)
      const newQuantities: Record<string, number> = {};
      data.items?.forEach((item: DraftItem) => {
        const itemId = item.batchId
          ? `${item.productId}-${item.batchId}`
          : item.productId;
        newQuantities[itemId] = item.quantity; // itemId bo'yicha
        newQuantities[item.productId] = item.quantity; // productId bo'yicha (backward compatibility)
      });
      setQuantities(newQuantities);
    } catch (err) {
      console.error("Failed to load draft", err);
    } finally {
      setDraftLoading(false);
    }
  }, [apiUrl, sessionId]);

  // Silent draft fetch (loading ko'rsatmasdan, quantities'ni yangilamaydi)
  const fetchDraftSilent = useCallback(async () => {
    if (!sessionId) return null; // SessionId tayyor bo'lmaguncha kutish

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("erp_access_token")
          : null;

      const response = await fetch(`${apiUrl}/order/draft`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-session-id": sessionId,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch draft");

      const data = await response.json();
      // Faqat draft'ni qaytaramiz, quantities'ni yangilamaymiz
      // Chunki optimistic update allaqachon qilingan
      return data;
    } catch (err) {
      console.error("Failed to load draft silently", err);
      return null;
    }
  }, [apiUrl, sessionId]);

  // Draft'ni faqat sessionId tayyor bo'lganda fetch qilish
  useEffect(() => {
    if (sessionId) {
      fetchDraft();
    }
  }, [fetchDraft, sessionId]);

  // Orders olish (History uchun)
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("erp_access_token")
          : null;

      const queryParams = new URLSearchParams();
      if (debouncedOrderSearchQuery.trim()) {
        queryParams.append("search", debouncedOrderSearchQuery.trim());
      }

      const response = await fetch(
        `${apiUrl}/order?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch orders");

      const data = await response.json();
      console.log("Fetched orders:", data);
      console.log("First order supplierDetails:", data[0]?.supplierDetails);
      console.log(
        "Order statuses:",
        data.map((o: any) => ({ orderNo: o.orderNo, status: o.status }))
      );
      setOrders(data || []);
    } catch (err) {
      console.error("Failed to load orders", err);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [apiUrl, debouncedOrderSearchQuery]);

  // Fetch rejected orders
  const fetchRejectedOrders = useCallback(async () => {
    try {
      const rejectedData = await apiGet<any[]>(
        `${apiUrl}/order/rejected-orders`
      );
      console.log("Fetched rejected orders:", rejectedData);
      setRejectedOrders(rejectedData || []);
    } catch (err) {
      console.error("Failed to load rejected orders", err);
      setRejectedOrders([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchOrders();
      fetchRejectedOrders();
    }
  }, [activeTab, fetchOrders, fetchRejectedOrders]);

  // Refresh rejected orders when a rejection is confirmed in inbound page
  useEffect(() => {
    const handleRejectedOrderConfirmed = () => {
      console.log(
        "Rejected order confirmed event received, refreshing rejected orders..."
      );
      // When a rejected order is confirmed in inbound page, refresh rejected orders
      // Always refresh, even if not on history tab, so data is ready when user switches
      fetchRejectedOrders();
    };

    window.addEventListener(
      "rejectedOrderConfirmed",
      handleRejectedOrderConfirmed
    );

    return () => {
      window.removeEventListener(
        "rejectedOrderConfirmed",
        handleRejectedOrderConfirmed
      );
    };
  }, [fetchRejectedOrders]);

  // Refresh data when page becomes visible (e.g., after confirming rejection in inbound page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeTab === "history") {
        fetchOrders();
        fetchRejectedOrders();
      }
    };

    const handleFocus = () => {
      if (activeTab === "history") {
        fetchOrders();
        fetchRejectedOrders();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [activeTab, fetchOrders, fetchRejectedOrders]);

  // Search products
  useEffect(() => {
    const searchProducts = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const data = await apiGet<{
          products: any[];
          pagination: any;
        }>(
          `${apiUrl}/order/products/search?search=${encodeURIComponent(debouncedSearchQuery)}&page=1&limit=10`
        );
        setSearchResults(data.products || []);
      } catch (err) {
        console.error("Failed to search products", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    searchProducts();
  }, [apiUrl, debouncedSearchQuery]);

  // Quantity o'zgartirish (Optimistic update bilan)
  const handleQuantityChange = useCallback(
    (productId: string, batchId: string | undefined, newQuantity: number) => {
      // Sanitize quantity - faqat musbat butun son bo'lishi kerak
      const sanitizedQuantity = Math.max(0, Math.floor(newQuantity));
      if (isNaN(sanitizedQuantity) || sanitizedQuantity < 0) return;

      // Product ma'lumotlarini topish
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      const itemId = batchId ? `${productId}-${batchId}` : productId;
      const unitPrice = product.unitPrice || 0;
      const supplierId = product.supplierId || "unknown";

      // 🔍 DEBUG: Product va supplier ma'lumotlarini ko'rish
      console.log("🔍 handleQuantityChange:", {
        productId,
        productName: product.productName,
        supplierId,
        supplierName: product.supplierName,
        quantity: sanitizedQuantity,
        fullProduct: product,
      });

      // Local state update - darhol quantities'ni yangilash
      setQuantities((prev) => ({
        ...prev,
        [productId]: sanitizedQuantity, // Product card uchun
        [itemId]: sanitizedQuantity, // Draft item uchun
      }));

      // Local draft state update - "주문 요약" uchun
      setDraft((prevDraft) => {
        // Agar draft yo'q bo'lsa, yangi draft yaratish
        if (!prevDraft) {
          if (sanitizedQuantity === 0) return null;

          return {
            id: "local-draft",
            sessionId: "local",
            items: [
              {
                id: itemId,
                productId,
                batchId,
                supplierId,
                quantity: sanitizedQuantity,
                unitPrice,
                totalPrice: sanitizedQuantity * unitPrice,
                isHighlighted: true,
              },
            ],
            totalAmount: sanitizedQuantity * unitPrice,
            groupedBySupplier: [
              {
                supplierId,
                items: [
                  {
                    id: itemId,
                    productId,
                    batchId,
                    supplierId,
                    quantity: sanitizedQuantity,
                    unitPrice,
                    totalPrice: sanitizedQuantity * unitPrice,
                  },
                ],
                totalAmount: sanitizedQuantity * unitPrice,
              },
            ],
            itemIdMap: {},
          };
        }

        const items = [...(prevDraft.items || [])];
        const existingItemIndex = items.findIndex((item) => item.id === itemId);

        if (sanitizedQuantity === 0) {
          // Item'ni o'chirish
          if (existingItemIndex >= 0) {
            items.splice(existingItemIndex, 1);
          }
        } else {
          // Item qo'shish yoki yangilash
          const newItem = {
            id: itemId,
            productId,
            batchId,
            supplierId,
            quantity: sanitizedQuantity,
            unitPrice,
            totalPrice: sanitizedQuantity * unitPrice,
            isHighlighted: existingItemIndex < 0, // Yangi item bo'lsa highlight
          };

          if (existingItemIndex >= 0) {
            items[existingItemIndex] = {
              ...items[existingItemIndex],
              ...newItem,
              isHighlighted: false,
            };
          } else {
            items.push(newItem);
          }
        }

        // Total amount hisoblash
        const totalAmount = items.reduce(
          (sum, item) => sum + item.totalPrice,
          0
        );

        // Supplier bo'yicha grouping
        const groupedBySupplier: Record<string, any> = {};
        items.forEach((item) => {
          const supId = item.supplierId || "unknown";
          if (!groupedBySupplier[supId]) {
            groupedBySupplier[supId] = {
              supplierId: supId,
              items: [],
              totalAmount: 0,
            };
          }
          groupedBySupplier[supId].items.push(item);
          groupedBySupplier[supId].totalAmount += item.totalPrice;
        });

        // 🔍 DEBUG: Grouped suppliers
        console.log("🔍 Grouped by supplier:", {
          totalSuppliers: Object.keys(groupedBySupplier).length,
          suppliers: Object.entries(groupedBySupplier).map(([id, group]) => ({
            supplierId: id,
            itemCount: group.items.length,
            items: group.items.map((i: any) => ({
              productId: i.productId,
              supplierId: i.supplierId,
            })),
          })),
        });

        return {
          ...prevDraft,
          items,
          totalAmount,
          groupedBySupplier: Object.values(groupedBySupplier),
        };
      });

      // ESKI BACKEND CALL'LAR O'CHIRILDI - Faqat local state ishlaydi
      // Backend'ga faqat "주문서 생성" tugmasi bosilganda yuboriladi
    },
    [products]
  );

  // Sort and filter products with client-side calculations
  const filteredProducts = useMemo(() => {
    // Add calculated fields to products
    const productsWithCalcs = products.map((product: any) => {
      // Calculate isLowStock
      const isLowStock = product.currentStock <= (product.minStock || 0);

      // Calculate batch expiry info
      const batchesWithExpiry =
        product.batches?.map((batch: any) => {
          if (!batch.expiryDate) {
            return {
              ...batch,
              isExpiringSoon: false,
              daysUntilExpiry: null,
            };
          }

          const daysUntilExpiry = Math.floor(
            (new Date(batch.expiryDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          );
          const isExpiringSoon = daysUntilExpiry <= 30;

          return {
            ...batch,
            isExpiringSoon,
            daysUntilExpiry,
          };
        }) || [];

      return {
        ...product,
        isLowStock,
        batches: batchesWithExpiry,
      };
    });

    // Filter: faqat low stock productlar (currentStock <= minStock)
    // "재고 부족 제품" section uchun
    // IMPORTANT: Expiring batch bo'lsa ham, agar currentStock > minStock bo'lsa, ko'rinmaydi
    const filtered = productsWithCalcs.filter((product) => {
      // Faqat currentStock <= minStock bo'lgan productlar ko'rsatiladi
      return product.isLowStock;
    });

    // Sort products: 재고 부족 먼저, 그 다음 유효기한 임박
    const sorted = [...filtered].sort((a, b) => {
      // 1순위: 재고 부족 (isLowStock)
      const aLowStock = a.isLowStock ? 1 : 0;
      const bLowStock = b.isLowStock ? 1 : 0;
      if (aLowStock !== bLowStock) {
        return bLowStock - aLowStock; // 재고 부족이 먼저
      }

      // 2순위: 유효기한 임박 (가장 빨리 만료되는 batch 기준)
      const aEarliestExpiry = a.batches?.[0]?.daysUntilExpiry ?? Infinity;
      const bEarliestExpiry = b.batches?.[0]?.daysUntilExpiry ?? Infinity;
      if (aEarliestExpiry !== bEarliestExpiry) {
        return aEarliestExpiry - bEarliestExpiry; // 빨리 만료되는 것이 먼저
      }

      // 3순위: 제품명 알파벳 순
      return a.productName.localeCompare(b.productName);
    });

    return sorted;
  }, [products]);

  return (
    <>
      <style jsx global>{`
        /* Webkit browsers (Chrome, Safari, Edge) */
        .order-page-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .order-page-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .order-page-scrollbar::-webkit-scrollbar-thumb {
          background: white;
          border-radius: 4px;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .order-page-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #f3f4f6;
        }
        /* Firefox */
        .order-page-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: white transparent;
        }
      `}</style>
      <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                주문관리
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                재고 부족 및 유효기한 임박 제품을 주문하고 관리하세요
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchProducts()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="제품 목록 새로고침"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                새로고침
              </button>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                마지막 업데이트: {new Date().toLocaleString("ko-KR")}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-2 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab("processing")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "processing"
                  ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              주문 처리
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "history"
                  ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              주문 내역
            </button>
          </div>
        </header>

        {activeTab === "processing" ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Products List */}
            <div className="flex w-2/3 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              {/* 재고 부족 제품 Card - faqat search query bo'sh bo'lsa ko'rsatish */}
              {!debouncedSearchQuery.trim() && (
                <div className="flex flex-1 flex-col overflow-hidden border-b border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-slate-900 dark:text-white">
                        재고 부족 제품
                      </h2>
                    </div>
                  </div>

                  <div className="order-page-scrollbar flex-1 overflow-y-auto p-6">
                    {loading ? (
                      <div className="text-center text-slate-500 dark:text-slate-400">
                        불러오는 중...
                      </div>
                    ) : error ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                        {error}
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="text-center text-slate-500 dark:text-slate-400">
                        제품이 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredProducts.map((product) => {
                          const latestBatch = product.batches?.[0];
                          const itemId = latestBatch?.id
                            ? `${product.id}-${latestBatch.id}`
                            : product.id;
                          const currentQty =
                            quantities[itemId] || quantities[product.id] || 0;
                          const unitPrice = product.unitPrice || 0;

                          return (
                            <div
                              key={product.id}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
                            >
                              {/* 1-chi qator: Product nomi, badges, quantity input */}
                              <div className="mb-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white underline">
                                    {product.productName}
                                  </h3>
                                  {/* 재고 부족 Badge */}
                                  {product.isLowStock && (
                                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                                      재고부족
                                    </span>
                                  )}
                                  {/* 유효기한 임박 Badge */}
                                  {product.batches?.[0]?.isExpiringSoon && (
                                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
                                      유효기한 임박
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      const itemId = latestBatch?.id
                                        ? `${product.id}-${latestBatch.id}`
                                        : product.id;
                                      const currentQtyValue =
                                        quantities[itemId] ||
                                        quantities[product.id] ||
                                        0;
                                      handleQuantityChange(
                                        product.id,
                                        latestBatch?.id,
                                        Math.max(0, currentQtyValue - 1)
                                      );
                                    }}
                                    className="flex h-8 w-8 mt-4 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                  >
                                    -
                                  </button>
                                  <input
                                    placeholder="0"
                                    type="number"
                                    min="0"
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0,
                                        Math.floor(
                                          parseInt(e.target.value) || 0
                                        )
                                      );
                                      handleQuantityChange(
                                        product.id,
                                        latestBatch?.id,
                                        val
                                      );
                                    }}
                                    className="h-8 w-20 mt-4 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    onClick={() => {
                                      const itemId = latestBatch?.id
                                        ? `${product.id}-${latestBatch.id}`
                                        : product.id;
                                      const currentQtyValue =
                                        quantities[itemId] ||
                                        quantities[product.id] ||
                                        0;
                                      handleQuantityChange(
                                        product.id,
                                        latestBatch?.id,
                                        Math.max(0, currentQtyValue + 1)
                                      );
                                    }}
                                    className="flex h-8 w-8 mt-4 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                  >
                                    +
                                  </button>
                                  <span className="ml-1 mt-4 text-sm text-slate-600 dark:text-slate-400">
                                    단위
                                  </span>
                                </div>
                              </div>

                              {/* 2-chi qator: Brend, supplier, 담당자, 단가 */}
                              <div className="mb-3 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                                <span>
                                  <span className="font-medium">브랜드:</span>{" "}
                                  {product.brand}
                                </span>
                                <span>
                                  <span className="font-medium">공급처:</span>{" "}
                                  {product.supplierName || "없음"}
                                </span>
                                <span>
                                  <span className="font-medium">담당자:</span>{" "}
                                  {product.managerName || "없음"}
                                </span>
                                <span>
                                  <span className="font-medium">단가:</span>{" "}
                                  {unitPrice.toLocaleString()}원
                                </span>
                              </div>

                              {/* 재고 정보 */}
                              <div className="mb-2 flex items-center gap-3 text-sm">
                                <span
                                  className={`font-semibold ${product.isLowStock ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}
                                >
                                  현재고: {product.currentStock || 0}개
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                  최소재고: {product.minStock || 0}개
                                </span>
                              </div>

                              {/* Batch'lar ro'yxati - Combined total */}
                              {product.batches &&
                                product.batches.length > 0 && (
                                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        총 재고량:
                                      </span>
                                      <span
                                        className={`text-sm font-semibold ${product.currentStock <= (product.minStock || 0) ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}
                                      >
                                        {product.batches.reduce(
                                          (total: number, batch: any) =>
                                            total + (batch.qty || 0),
                                          0
                                        )}{" "}
                                        개
                                      </span>
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 기타 제품 추가 Card - Search bar va search natijalari */}
              <div
                className={`flex flex-col border-t border-slate-200 dark:border-slate-800 ${!debouncedSearchQuery.trim() ? "mt-auto" : ""}`}
              >
                <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    기타 제품 추가
                  </h3>
                </div>
                <div className="p-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="시스템에 표시되지 않은 제품을 추가하려면 검색하세요..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 pl-10 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>

                  {/* Search natijalari - faqat search query bo'lsa ko'rsatish */}
                  {debouncedSearchQuery.trim() && (
                    <div className="order-page-scrollbar mt-4 max-h-full overflow-y-auto">
                      {isSearching ? (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                          검색 중...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div className="space-y-4">
                          {searchResults.map((product: any) => {
                            const latestBatch = product.batches?.[0];
                            const itemId = latestBatch?.id
                              ? `${product.id}-${latestBatch.id}`
                              : product.id;
                            const currentQty =
                              quantities[itemId] || quantities[product.id] || 0;
                            const unitPrice = product.unitPrice || 0;

                            return (
                              <div
                                key={product.id}
                                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
                              >
                                {/* 1-chi qator: Product nomi, badges, quantity input */}
                                <div className="mb-3 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white underline">
                                      {product.productName}
                                    </h3>
                                    {/* 재고 부족 Badge */}
                                    {product.isLowStock && (
                                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                                        재고부족
                                      </span>
                                    )}
                                    {/* 유효기한 임박 Badge */}
                                    {product.batches?.[0]?.isExpiringSoon && (
                                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
                                        유효기한 임박
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        const itemId = latestBatch?.id
                                          ? `${product.id}-${latestBatch.id}`
                                          : product.id;
                                        const currentQtyValue =
                                          quantities[itemId] ||
                                          quantities[product.id] ||
                                          0;
                                        handleQuantityChange(
                                          product.id,
                                          latestBatch?.id,
                                          Math.max(0, currentQtyValue - 1)
                                        );
                                      }}
                                      className="flex h-8 w-8 mt-4 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                    >
                                      -
                                    </button>
                                    <input
                                      placeholder="0"
                                      type="number"
                                      min="0"
                                      onChange={(e) => {
                                        const val = Math.max(
                                          0,
                                          Math.floor(
                                            parseInt(e.target.value) || 0
                                          )
                                        );
                                        handleQuantityChange(
                                          product.id,
                                          latestBatch?.id,
                                          val
                                        );
                                      }}
                                      className="h-8 w-20 mt-4 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      onClick={() => {
                                        const itemId = latestBatch?.id
                                          ? `${product.id}-${latestBatch.id}`
                                          : product.id;
                                        const currentQtyValue =
                                          quantities[itemId] ||
                                          quantities[product.id] ||
                                          0;
                                        handleQuantityChange(
                                          product.id,
                                          latestBatch?.id,
                                          Math.max(0, currentQtyValue + 1)
                                        );
                                      }}
                                      className="flex h-8 w-8 mt-4 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                    >
                                      +
                                    </button>
                                    <span className="ml-1 mt-4 text-sm text-slate-600 dark:text-slate-400">
                                      단위
                                    </span>
                                  </div>
                                </div>

                                {/* 2-chi qator: Brend, supplier, 담당자, 단가 */}
                                <div className="mb-3 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                                  <span>
                                    <span className="font-medium">브랜드:</span>{" "}
                                    {product.brand}
                                  </span>
                                  <span>
                                    <span className="font-medium">공급처:</span>{" "}
                                    {product.supplierName || "없음"}
                                  </span>
                                  <span>
                                    <span className="font-medium">담당자:</span>{" "}
                                    {product.managerName || "없음"}
                                  </span>
                                  <span>
                                    <span className="font-medium">단가:</span>{" "}
                                    {unitPrice.toLocaleString()}원
                                  </span>
                                </div>

                                {/* 재고 정보 */}
                                <div className="mb-2 flex items-center gap-3 text-sm">
                                  <span
                                    className={`font-semibold ${
                                      (product.batches?.reduce(
                                        (total: number, batch: any) =>
                                          total + (batch.qty || 0),
                                        0
                                      ) || 0) <= (product.minStock || 0)
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-slate-700 dark:text-slate-300"
                                    }`}
                                  >
                                    현재고:{" "}
                                    {product.batches?.reduce(
                                      (total: number, batch: any) =>
                                        total + (batch.qty || 0),
                                      0
                                    ) || 0}
                                    개
                                  </span>
                                  <span className="text-slate-600 dark:text-slate-400">
                                    최소재고: {product.minStock || 0}개
                                  </span>
                                </div>

                                {/* Batch'lar ro'yxati */}
                                {product.batches &&
                                  product.batches.length > 0 && (
                                    <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                          총 재고량:
                                        </span>
                                        <span
                                          className={`text-sm font-semibold ${product.currentStock <= (product.minStock || 0) ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}
                                        >
                                          {product.batches.reduce(
                                            (total: number, batch: any) =>
                                              total + (batch.qty || 0),
                                            0
                                          )}{" "}
                                          개
                                        </span>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                          검색 결과가 없습니다.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Order Summary */}
            <div className="flex w-1/3 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
              <div className="border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    주문 요약
                  </h2>

                  {/* 주문 담당자 (현재 로그인한 사용자) */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      주문 담당자
                    </label>
                    <input
                      type="text"
                      value={orderManagerName}
                      onChange={(e) => setOrderManagerName(e.target.value)}
                      placeholder="주문 담당자 이름을 입력하세요"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
                    />
                  </div>
                </div>
              </div>

              <div className="order-page-scrollbar flex-1 overflow-y-auto p-6">
                {draftLoading ? (
                  <div className="text-center text-slate-500 dark:text-slate-400">
                    불러오는 중...
                  </div>
                ) : !draft || draft.items.length === 0 ? (
                  <div className="text-center text-slate-500 dark:text-slate-400">
                    주문 항목이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {draft.groupedBySupplier.map((group) => {
                      // Supplier name'ni topish
                      const firstItem = group.items[0];
                      const firstProduct = products.find(
                        (p) => p.id === firstItem?.productId
                      );
                      const supplierName =
                        firstProduct?.supplierName ||
                        group.supplierId ||
                        "공급업체 없음";
                      // Manager name hozircha yo'q, lekin kelajakda qo'shilishi mumkin
                      const managerName = ""; // TODO: Backend'dan manager name kelganda qo'shish

                      return (
                        <div
                          key={group.supplierId}
                          className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
                        >
                          {/* Supplier nomi, manager nomi va umumiy qiymat */}
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              {supplierName}
                              {managerName && ` ${managerName}`}
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              총 {group.totalAmount.toLocaleString()}원
                            </div>
                          </div>

                          {/* Product'lar ro'yxati */}
                          <div className="space-y-2">
                            {group.items.map((item) => {
                              const product = products.find(
                                (p) => p.id === item.productId
                              );
                              const productName =
                                product?.productName || item.productId;
                              // Item ID yoki productId bo'yicha quantity topish
                              const currentQty =
                                quantities[item.id] ||
                                quantities[item.productId] ||
                                item.quantity;

                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-2 rounded-lg border p-2 ${
                                    item.isHighlighted
                                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
                                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                                  }`}
                                >
                                  {/* Product name */}
                                  <div className="flex-1 text-xs font-medium text-slate-900 dark:text-white">
                                    {productName}
                                    {item.isHighlighted && (
                                      <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">
                                        (신규)
                                      </span>
                                    )}
                                  </div>

                                  {/* Qty input */}
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      min="0"
                                      value={currentQty}
                                      onChange={(e) => {
                                        const val = Math.max(
                                          0,
                                          parseInt(e.target.value) || 0
                                        );
                                        handleQuantityChange(
                                          item.productId,
                                          item.batchId,
                                          val
                                        );
                                      }}
                                      className="h-6 w-12 rounded border border-slate-300 bg-white px-1 text-center text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                      개
                                    </span>
                                  </div>

                                  {/* Unit price */}
                                  <div className="text-xs text-slate-600 dark:text-slate-400">
                                    {item.unitPrice.toLocaleString()}원
                                  </div>

                                  {/* Total (unit price × qty) */}
                                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                                    {(
                                      item.unitPrice * currentQty
                                    ).toLocaleString()}
                                    원
                                  </div>

                                  {/* Minus button */}
                                  <button
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.productId,
                                        item.batchId,
                                        0
                                      )
                                    }
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                  >
                                    <svg
                                      className="h-3 w-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Total and Actions */}
              <div className="border-t border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 text-right">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    총 {draft?.totalAmount.toLocaleString() || 0}원
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!draft || draft.items.length === 0) {
                        alert("주문 항목이 없습니다.");
                        return;
                      }
                      setShowOrderModal(true);
                    }}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    주문서 작성
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const token =
                          typeof window !== "undefined"
                            ? localStorage.getItem("erp_access_token")
                            : null;

                        await fetch(`${apiUrl}/order/draft`, {
                          method: "DELETE",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "x-session-id": sessionId,
                          },
                        });
                        await fetchDraft();
                        setQuantities({});
                      } catch (err) {
                        console.error("Failed to cancel order", err);
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  >
                    주문 취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="제품명, 브랜드, 공급처, 날짜(00-00-00)로 검색..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 pl-10 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:ring-blue-800"
                />
                <svg
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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

            {/* Order List */}
            {ordersLoading ? (
              <div className="text-center text-slate-500 dark:text-slate-400">
                주문 내역을 불러오는 중...
              </div>
            ) : orders.length === 0 && rejectedOrders.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400">
                주문 내역이 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Regular orders - filter out rejected orders (they should only appear in rejectedOrders list after confirmation) */}
                {orders
                  .filter((order) => order.status !== "rejected")
                  .map((order) => {
                    // Date format: YYYY-MM-DD HH:MM
                    const orderDate = new Date(order.createdAt);
                    const dateStr = orderDate.toISOString().split("T")[0]; // YYYY-MM-DD
                    const timeStr = orderDate
                      .toTimeString()
                      .split(" ")[0]
                      .slice(0, 5); // HH:MM
                    const formattedDate = `${dateStr} ${timeStr}`;

                    // Manager name (supplierDetails'dan olish)
                    const managerName =
                      order.supplierDetails?.managerName ||
                      order.managerName ||
                      "담당자";

                    // Badge logic based on order status (priority: completed > rejected > supplier_confirmed > pending)
                    const isCompleted =
                      order.status === "completed" ||
                      order.status === "inbound_completed";
                    const isRejected =
                      !isCompleted &&
                      (order.status === "rejected" ||
                        order.status === "cancelled");
                    const isSupplierConfirmed =
                      !isCompleted &&
                      !isRejected &&
                      (order.status === "supplier_confirmed" ||
                        order.status === "confirmed");
                    const isPending =
                      !isCompleted &&
                      !isRejected &&
                      !isSupplierConfirmed &&
                      order.status === "pending";

                    // Extract rejection reasons from items
                    const rejectionReasons =
                      order.items
                        ?.map((item: any) => {
                          if (item.memo && item.memo.includes("[거절 사유:")) {
                            const match = item.memo.match(
                              /\[거절 사유:\s*([^\]]+)\]/
                            );
                            return match ? match[1].trim() : null;
                          }
                          return null;
                        })
                        .filter((reason: any) => reason !== null) || [];

                    return (
                      <div
                        key={order.id}
                        className="rounded-lg border-2 border-dashed border-purple-300 bg-slate-50 p-4 dark:border-purple-600 dark:bg-slate-800/50"
                      >
                        {/* Order Header */}
                        <div className="mb-3 flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-600 dark:bg-slate-700">
                          <div className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
                            <span>
                              공급처:{" "}
                              {order.supplierDetails?.companyName ||
                                order.supplierName ||
                                "공급업체 없음"}{" "}
                              담당자:{" "}
                              {order.supplierDetails?.managerName ||
                                order.managerName ||
                                "담당자 없음"}
                              {order.supplierDetails?.position &&
                                ` ${order.supplierDetails.position}`}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              주문번호 {order.orderNo}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <button
                                onClick={async () => {
                                  if (!confirm("정말 주문을 취소하시겠습니까?"))
                                    return;
                                  try {
                                    await apiPut(
                                      `/order/${order.id}/cancel`,
                                      {}
                                    );
                                    // Remove from local state
                                    setOrders(
                                      orders.filter(
                                        (o: any) => o.id !== order.id
                                      )
                                    );
                                    alert("주문이 취소되었습니다.");
                                  } catch (err: any) {
                                    console.error(
                                      "Failed to cancel order",
                                      err
                                    );
                                    alert(
                                      `주문 취소 중 오류가 발생했습니다: ${err.message || "Unknown error"}`
                                    );
                                  }
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                주문 취소
                              </button>
                            )}
                            {/* Badge */}
                            {isPending && (
                              <span className="inline-flex items-center rounded border border-slate-400 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:border-slate-400 dark:text-emerald-400">
                                주문 요청
                              </span>
                            )}
                            {isSupplierConfirmed && (
                              <span className="inline-flex items-center rounded border border-slate-400 bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:border-slate-400 dark:text-yellow-400">
                                주문 진행
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center rounded border border-slate-400 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:border-slate-400 dark:text-red-400">
                                주문 거절
                              </span>
                            )}
                            {isCompleted && (
                              <span className="inline-flex items-center rounded border border-slate-400 bg-slate-500 px-3 py-1 text-xs font-semibold text-white">
                                주문 완료
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rejection Reasons */}
                        {isRejected && rejectionReasons.length > 0 && (
                          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 dark:bg-red-900/20 dark:border-red-800">
                            <div className="text-xs font-semibold text-red-700 dark:text-red-400">
                              거절 사유:{" "}
                              {rejectionReasons.map(
                                (reason: string, idx: number) => (
                                  <span key={idx}>
                                    {reason}
                                    {idx < rejectionReasons.length - 1 && (
                                      <span className="mx-2">•</span>
                                    )}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Product List */}
                        <div className="mb-3 space-y-2">
                          {order.items.map((item: any) => {
                            // Extract rejection reason and memo for this item
                            let itemRejectionReason = null;
                            let itemRejectionMemo = null;

                            if (item.memo) {
                              const memoText = item.memo.trim();

                              // Check if memo contains rejection reason format: [거절 사유: ...]
                              if (memoText.includes("[거절 사유:")) {
                                // Extract rejection reason
                                const reasonMatch = memoText.match(
                                  /\[거절 사유:\s*([^\]]+)\]/
                                );
                                itemRejectionReason = reasonMatch
                                  ? reasonMatch[1].trim()
                                  : null;

                                // Extract memo (everything except [거절 사유: ...])
                                // Remove all [거절 사유: ...] patterns
                                let cleanMemo = memoText
                                  .replace(/\[거절 사유:[^\]]+\]/g, "")
                                  .trim();

                                // Also remove newlines and extra spaces
                                cleanMemo = cleanMemo
                                  .replace(/\n+/g, " ")
                                  .replace(/\s+/g, " ")
                                  .trim();

                                // If there's memo text left, use it; otherwise use full memo
                                itemRejectionMemo = cleanMemo || memoText;
                              } else {
                                // No rejection reason format, show full memo
                                itemRejectionMemo = memoText;
                              }
                            }

                            return (
                              <div
                                key={item.id}
                                className="rounded-lg bg-white shadow-sm dark:bg-slate-800"
                              >
                                <div className="flex items-center justify-between gap-4 px-4 py-3">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {item.productName}
                                  </div>
                                  <div className="text-sm text-slate-600 dark:text-slate-400">
                                    브랜드: {item.brand}
                                  </div>
                                  {!isRejected && (
                                    <>
                                      <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                                        <span>입고수량: {item.quantity}</span>
                                        <span className="text-slate-400">
                                          |
                                        </span>
                                        <span>{item.quantity}개</span>
                                      </div>
                                      <div className="text-sm text-slate-600 dark:text-slate-400">
                                        단가 {item.unitPrice.toLocaleString()}
                                      </div>
                                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                        총금액:{" "}
                                        {item.totalPrice.toLocaleString()}
                                      </div>
                                    </>
                                  )}
                                  {isRejected && (
                                    <>
                                      <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                                        <span>입고수량: {item.quantity}</span>
                                        <span className="text-slate-400">
                                          |
                                        </span>
                                        <span>{item.quantity}개</span>
                                      </div>
                                      <span className="text-sm text-slate-600 dark:text-slate-400">
                                        <span className="text-slate-400">
                                          단가:
                                        </span>{" "}
                                        {item.unitPrice.toLocaleString()}원
                                      </span>
                                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                        총금액: 0
                                      </div>
                                    </>
                                  )}
                                </div>
                                {/* Memo field for rejected orders - always show */}
                              </div>
                            );
                          })}
                        </div>

                        {/* Total */}
                        <div className="mb-3 flex justify-end">
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            총{" "}
                            {isRejected
                              ? 0
                              : order.totalAmount.toLocaleString()}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2">
                          {!isPending && !isSupplierConfirmed && (
                            <button
                              onClick={async () => {
                                if (
                                  !confirm("정말 이 주문을 삭제하시겠습니까?")
                                )
                                  return;
                                try {
                                  await apiDelete(`/order/${order.id}`);
                                  // Remove from local state
                                  setOrders(
                                    orders.filter((o: any) => o.id !== order.id)
                                  );
                                  alert("주문이 삭제되었습니다.");
                                } catch (err: any) {
                                  console.error("Failed to delete order", err);
                                  alert(
                                    `주문 삭제 중 오류가 발생했습니다: ${err.message || "Unknown error"}`
                                  );
                                }
                              }}
                              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-red-900/20"
                              title="주문 삭제"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              // Redirect to 주문 처리 tab
                              setActiveTab("processing");
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          >
                            재주문
                          </button>
                          <button
                            onClick={async () => {
                              console.log("Selected order:", order);
                              console.log(
                                "Supplier details:",
                                order.supplierDetails
                              );

                              // Ensure clinic data is loaded before opening modal
                              if (!clinicData) {
                                try {
                                  // Get tenant_id from localStorage
                                  const tenantId =
                                    typeof window !== "undefined"
                                      ? localStorage.getItem("erp_tenant_id")
                                      : null;
                                  const url = tenantId
                                    ? `${apiUrl}/iam/members/clinics?tenantId=${encodeURIComponent(tenantId)}`
                                    : `${apiUrl}/iam/members/clinics`;

                                  console.log("Loading clinic data from:", url);
                                  const clinics = await apiGet<any[]>(url);
                                  console.log("Loaded clinics:", clinics);
                                  if (clinics && clinics.length > 0) {
                                    console.log(
                                      "Loaded clinic data:",
                                      clinics[0]
                                    );
                                    setClinicData(clinics[0]);
                                  } else {
                                    console.warn(
                                      "No clinics found when opening modal"
                                    );
                                  }
                                } catch (err: any) {
                                  console.error(
                                    "Failed to load clinic data",
                                    err
                                  );
                                  console.error("Error details:", err.message);
                                }
                              } else {
                                console.log(
                                  "Clinic data already loaded:",
                                  clinicData
                                );
                              }

                              setSelectedOrder(order);
                              setOrderFormMemo(order.memo || "");
                              setShowOrderFormModal(true);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          >
                            주문서 보기
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* Rejected Orders */}
                {rejectedOrders &&
                  rejectedOrders.length > 0 &&
                  rejectedOrders.map((rejectedOrder) => {
                    if (!rejectedOrder || !rejectedOrder.orderNo) return null;

                    console.log("Rendering rejected order:", rejectedOrder);

                    return (
                      <div
                        key={rejectedOrder.orderNo}
                        className="rounded-lg border-2 border-dashed border-purple-300 bg-slate-50 p-4 dark:border-purple-600 dark:bg-slate-800/50"
                      >
                        {/* Order Header */}
                        <div className="mb-3 flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-600 dark:bg-slate-700">
                          <div className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
                            <span>
                              공급처:{" "}
                              {rejectedOrder.companyName || "공급업체 없음"}{" "}
                              담당자:{" "}
                              {rejectedOrder.managerName || "담당자 없음"}
                              {rejectedOrder.managerPosition &&
                                ` ${rejectedOrder.managerPosition}`}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              주문번호 {rejectedOrder.orderNo}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Badge */}
                            <span className="inline-flex items-center rounded border border-slate-400 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:border-slate-400 dark:text-red-400">
                              주문 거절
                            </span>
                          </div>
                        </div>

                        {/* Product List */}
                        <div className="mb-3 space-y-2">
                          {rejectedOrder.items &&
                          Array.isArray(rejectedOrder.items) &&
                          rejectedOrder.items.length > 0 ? (
                            rejectedOrder.items.map(
                              (item: any, index: number) => (
                                <div
                                  key={index}
                                  className="rounded-lg bg-white shadow-sm dark:bg-slate-800"
                                >
                                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                                      {item.productName || "알 수 없음"}
                                    </div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400">
                                      브랜드: {item.productBrand || ""}
                                    </div>
                                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                                      <span>입고수량: {item.qty || 0}</span>
                                      <span className="text-slate-400">|</span>
                                      <span>{item.qty || 0}개</span>
                                    </div>
                                    <span className="text-sm text-slate-600 dark:text-slate-400">
                                      <span className="text-slate-400">
                                        단가:
                                      </span>{" "}
                                      0원
                                    </span>
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                      총금액: 0
                                    </div>
                                  </div>
                                </div>
                              )
                            )
                          ) : (
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              제품 정보가 없습니다.
                            </div>
                          )}
                        </div>

                        {/* Total */}
                        <div className="mb-3 flex justify-end">
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            총 0
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  "정말 이 거절 주문을 삭제하시겠습니까?"
                                )
                              )
                                return;
                              try {
                                // Delete rejected orders by orderId
                                await apiDelete(
                                  `/order/${rejectedOrder.orderId}`
                                );
                                // Remove from local state
                                setRejectedOrders(
                                  rejectedOrders.filter(
                                    (ro: any) =>
                                      ro.orderNo !== rejectedOrder.orderNo
                                  )
                                );
                                alert("거절 주문이 삭제되었습니다.");
                              } catch (err: any) {
                                console.error(
                                  "Failed to delete rejected order",
                                  err
                                );
                                alert(
                                  `거절 주문 삭제 중 오류가 발생했습니다: ${err.message || "Unknown error"}`
                                );
                              }
                            }}
                            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-red-900/20"
                            title="거절 주문 삭제"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              // Redirect to 주문 처리 tab
                              setActiveTab("processing");
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          >
                            재주문
                          </button>
                          <button
                            onClick={() => {
                              console.log(
                                "Selected rejected order:",
                                rejectedOrder
                              );
                              // TODO: Show order form modal for rejected order
                              alert("주문서 보기 기능은 곧 추가될 예정입니다.");
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          >
                            주문서 보기
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Order Confirmation Modal */}
        {showOrderModal && draft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
              {/* Header */}
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  주문서 확인 및 생성
                </h2>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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

              {/* Info Banner */}
              <div className="border-b border-slate-200 bg-blue-50 px-6 py-3 dark:border-slate-700 dark:bg-blue-900/20">
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  <span>
                    정보 공유에 동의한 공급업체는 자동으로 주문 내역을 받게
                    됩니다.
                  </span>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="max-h-[calc(90vh-200px)] overflow-y-auto p-6 order-page-scrollbar">
                <div className="space-y-6">
                  {draft.groupedBySupplier.map((group, groupIndex) => {
                    // Supplier name va manager name'ni topish
                    const firstItem = group.items[0];
                    const firstProduct = products.find(
                      (p) => p.id === firstItem?.productId
                    );
                    const supplierName =
                      firstProduct?.supplierName ||
                      group.supplierId ||
                      "공급업체 없음";

                    // Manager name'ni topish (product'dan yoki supplier'dan)
                    // Product'lardan supplier manager name + position topish
                    const managerData = group.items
                      .map((item) => {
                        const product = products.find(
                          (p) => p.id === item.productId
                        );
                        if (!product?.managerName) return null;

                        return {
                          name: product.managerName,
                          position: product.managerPosition || "", // Backend'dan position olish
                        };
                      })
                      .filter(Boolean);

                    const supplierManager = managerData[0];
                    const supplierManagerName = supplierManager?.name || "";
                    const supplierManagerPosition =
                      supplierManager?.position || "";

                    // Get logged-in member info (name + position) - for order creator
                    const memberData =
                      typeof window !== "undefined"
                        ? localStorage.getItem("erp_member_data")
                        : null;
                    let memberPosition = "";
                    let memberFullName = orderManagerName || "알 수 없음";
                    if (memberData) {
                      try {
                        const member = JSON.parse(memberData);
                        memberPosition = member.role || ""; // Position/role
                        memberFullName =
                          member.full_name || member.member_id || "알 수 없음";
                      } catch (e) {
                        console.error("Failed to parse member data:", e);
                      }
                    }

                    // Generate order number: YYYYMMDD000000XXXXXX (20 digits)
                    const generateOrderNumber = () => {
                      const now = new Date();
                      const year = now.getFullYear();
                      const month = String(now.getMonth() + 1).padStart(2, "0");
                      const day = String(now.getDate()).padStart(2, "0");
                      const datePrefix = `${year}${month}${day}`; // YYYYMMDD (8 digits)

                      const random = Math.floor(Math.random() * 1000000)
                        .toString()
                        .padStart(6, "0"); // Random 6 digits
                      return `${datePrefix}${random}`; // Total 20 digits
                    };
                    const orderNumber = generateOrderNumber();

                    // Subtotal va VAT hisoblash
                    const subtotal = group.totalAmount;
                    const vat = Math.floor(subtotal * 0.1); // 10% VAT

                    return (
                      <div
                        key={group.supplierId}
                        className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50 ${
                          groupIndex > 0
                            ? "mt-6 border-t-2 border-t-slate-300 dark:border-t-slate-600"
                            : ""
                        }`}
                      >
                        {/* Supplier Header */}
                        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-5 w-5 text-slate-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                              />
                            </svg>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                {supplierName}
                              </div>
                              {supplierManagerName && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  [담당자]{" "}
                                  {supplierManagerPosition && (
                                    <span className="font-medium text-slate-600 dark:text-slate-400">
                                      {supplierManagerPosition}{" "}
                                    </span>
                                  )}
                                  {supplierManagerName}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right side: Order info */}
                          <div className="text-right">
                            <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              주문번호: {orderNumber}
                            </div>
                          </div>
                        </div>

                        {/* Product List */}
                        <div className="mb-4 space-y-2">
                          {group.items.map((item) => {
                            const product = products.find(
                              (p) => p.id === item.productId
                            );
                            const productName =
                              product?.productName || "제품명 없음";
                            const brand = product?.brand || "";
                            const quantity = item.quantity;
                            const unitPrice = item.unitPrice;
                            const total = item.totalPrice;

                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
                              >
                                <div className="flex-1">
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {brand}
                                  </div>
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {productName}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                                  <span>{quantity}개</span>
                                  <span>X {unitPrice.toLocaleString()}원</span>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    = {total.toLocaleString()}원
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary */}
                        <div className="mb-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                          <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                            총 {group.items.length}항목
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">
                              합계:
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {subtotal.toLocaleString()}원
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">
                              VAT (10%):
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {vat.toLocaleString()}원
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-700">
                            <span className="text-slate-900 dark:text-white">
                              총액:
                            </span>
                            <span className="text-slate-900 dark:text-white">
                              {(subtotal + vat).toLocaleString()}원
                            </span>
                          </div>
                        </div>

                        {/* Order Memo */}
                        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            주문서 메모
                          </label>
                          <textarea
                            value={orderMemos[group.supplierId] || ""}
                            onChange={(e) =>
                              setOrderMemos((prev) => ({
                                ...prev,
                                [group.supplierId]: e.target.value,
                              }))
                            }
                            placeholder="주문서 메모를 입력하세요..."
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:ring-blue-800"
                            rows={3}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">
                    총액:{" "}
                    {(() => {
                      const totalSubtotal = draft.totalAmount;
                      const totalVAT = Math.floor(totalSubtotal * 0.1);
                      return (totalSubtotal + totalVAT).toLocaleString();
                    })()}
                    원
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowOrderModal(false)}
                      className="rounded-lg border border-slate-300 bg-white px-6 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      취소
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const token =
                            typeof window !== "undefined"
                              ? localStorage.getItem("erp_access_token")
                              : null;

                          // Local draft'dan order yaratish
                          const response = await fetch(`${apiUrl}/order`, {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "x-session-id": sessionId,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              supplierMemos: orderMemos, // Supplier ID bo'yicha memo'lar
                              items: draft?.items || [], // Local draft items
                              clinicManagerName: orderManagerName || null, // 클리닉 담당자 이름
                            }),
                          });

                          if (response.ok) {
                            alert("주문서가 생성되었습니다.");
                            setShowOrderModal(false);
                            setOrderMemos({});
                            // Local draft'ni tozalash
                            setDraft(null);
                            setQuantities({});
                            // Order history'ni yangilash va tab'ga o'tish
                            setActiveTab("history");
                            await fetchOrders();
                          } else {
                            const errorData = await response.json();
                            console.error("Order creation failed:", errorData);
                            alert(
                              `주문서 생성에 실패했습니다: ${errorData.message || "Unknown error"}`
                            );
                          }
                        } catch (err) {
                          console.error("Failed to create order", err);
                          alert("주문서 생성에 실패했습니다.");
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      주문서 생성
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Form Modal */}
        {showOrderFormModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 p-4">
            <div
              ref={orderFormRef}
              className="relative w-full max-w-5xl max-h-[95vh] bg-white shadow-2xl border border-blue-200 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-blue-200 bg-white px-6 py-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const orderDate = new Date(selectedOrder.createdAt);
                    const dateStr = orderDate.toISOString().split("T")[0];
                    const timeStr = orderDate
                      .toTimeString()
                      .split(" ")[0]
                      .slice(0, 5);
                    return (
                      <>
                        <div className="text-base font-semibold text-slate-900">
                          {dateStr} {timeStr}
                        </div>
                        <div className="text-base text-slate-900">
                          {clinicData?.name || "클리닉"}
                        </div>
                        <div className="text-base text-slate-900">
                          {selectedOrder.createdByName ||
                            orderManagerName ||
                            "담당자"}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!orderFormRef.current) return;

                      try {
                        // Hide buttons and close button before capturing
                        const buttons =
                          orderFormRef.current.querySelectorAll("button");
                        buttons.forEach((btn) => {
                          (btn as HTMLElement).style.display = "none";
                        });

                        // Capture the element as canvas
                        const canvas = await html2canvas(orderFormRef.current, {
                          scale: 2,
                          useCORS: true,
                          logging: false,
                          backgroundColor: "#ffffff",
                        });

                        // Show buttons again
                        buttons.forEach((btn: Element) => {
                          (btn as HTMLElement).style.display = "";
                        });

                        // Create PDF
                        const imgData = canvas.toDataURL("image/png");
                        const pdf = new jsPDF("p", "mm", "a4");

                        const pdfWidth = pdf.internal.pageSize.getWidth();
                        const pdfHeight = pdf.internal.pageSize.getHeight();
                        const imgWidth = canvas.width;
                        const imgHeight = canvas.height;
                        const ratio = Math.min(
                          pdfWidth / imgWidth,
                          pdfHeight / imgHeight
                        );
                        const imgX = (pdfWidth - imgWidth * ratio) / 2;
                        const imgY = 0;

                        pdf.addImage(
                          imgData,
                          "PNG",
                          imgX,
                          imgY,
                          imgWidth * ratio,
                          imgHeight * ratio
                        );

                        // Generate filename
                        const orderDate = new Date(selectedOrder.createdAt);
                        const dateStr = orderDate.toISOString().split("T")[0];
                        const filename = `주문서_${selectedOrder.orderNo || dateStr}_${Date.now()}.pdf`;

                        // Save PDF
                        pdf.save(filename);
                      } catch (error) {
                        console.error("PDF 생성 중 오류 발생:", error);
                        alert("PDF 저장에 실패했습니다. 다시 시도해주세요.");
                      }
                    }}
                    className="flex items-center gap-2 rounded border border-blue-500 bg-white px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    주문서 PDF 저장
                  </button>
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="flex items-center gap-2 rounded border border-blue-500 bg-white px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    주문서 출력
                  </button>
                  <button
                    onClick={() => {
                      setShowOrderFormModal(false);
                      setSelectedOrder(null);
                      setOrderFormMemo("");
                    }}
                    className="ml-2 text-slate-400 hover:text-slate-600"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
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
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                <div className="space-y-4">
                  {/* 주문처 and 공급처 Information */}
                  <div className="grid grid-cols-2 gap-0 border border-blue-200 bg-white">
                    {/* 주문처 (Orderer) */}
                    <div className="border-r border-blue-200 p-4">
                      <div className="text-xl font-bold text-slate-900 mb-3">
                        {clinicData?.name ? clinicData.name : "클리닉"}
                      </div>
                      <div className="text-sm text-slate-700 mb-1">
                        [구매 주문번호] {selectedOrder.orderNo || "-"}
                      </div>
                      <div className="text-sm text-slate-700 mb-3">
                        주문처: {clinicData?.name ? clinicData.name : "클리닉"}
                      </div>
                      <div className="text-xs text-slate-600 mb-1">
                        [담당자]{" "}
                        {selectedOrder.createdByName ||
                          orderManagerName ||
                          "성함"}
                      </div>
                    </div>

                    {/* 공급처 (Supplier) */}
                    <div className="p-4">
                      <div className="text-sm font-semibold text-slate-900 mb-3">
                        공급처:{" "}
                        {selectedOrder.supplierDetails?.companyName ||
                          selectedOrder.supplierName ||
                          "A사"}
                      </div>
                      <div className="text-xs text-slate-600 mb-1">
                        [회사주소]{" "}
                        {selectedOrder.supplierDetails?.companyAddress ||
                          "자동 작성"}
                      </div>
                      <div className="text-xs text-slate-600 mb-1">
                        [전화번호]{" "}
                        {selectedOrder.supplierDetails?.companyPhone ||
                          "자동 작성"}
                      </div>

                      <div className="text-xs text-slate-600 mb-1">
                        [담당자]{" "}
                        {selectedOrder.supplierDetails?.managerName ||
                          selectedOrder.managerName ||
                          "성함"}
                        {selectedOrder.supplierDetails?.position &&
                          ` (${selectedOrder.supplierDetails.position})`}
                      </div>
                      <div className="text-xs text-slate-600 mb-1">
                        [이메일]{" "}
                        {selectedOrder.supplierDetails?.managerEmail ||
                          selectedOrder.supplierDetails?.companyEmail ||
                          "자동 작성"}
                      </div>
                      <div className="text-xs text-slate-600">
                        [연락처]{" "}
                        {selectedOrder.supplierDetails?.managerPhone ||
                          "자동 작성"}
                      </div>
                      {/* Debug info - remove after testing */}
                    </div>
                  </div>

                  {/* Product Table */}
                  <div className="border border-blue-200 bg-white overflow-hidden">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                            브랜드
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                            제품
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                            배치번호
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-semibold text-slate-700">
                            수량
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-right text-xs font-semibold text-slate-700">
                            단가
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-right text-xs font-semibold text-slate-700">
                            금액
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-right text-xs font-semibold text-slate-700">
                            할인
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                            비고
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items &&
                        selectedOrder.items.length > 0 ? (
                          selectedOrder.items.map(
                            (item: any, index: number) => (
                              <tr key={item.id || index} className="bg-white">
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-900">
                                  {item.brand || "-"}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-900">
                                  {item.productName || "-"}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-600">
                                  {item.batchNo || "-"}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-900 text-center">
                                  {item.quantity || 0}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-900 text-right">
                                  {item.unitPrice
                                    ? item.unitPrice.toLocaleString()
                                    : "0"}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-900 text-right">
                                  {item.totalPrice
                                    ? item.totalPrice.toLocaleString()
                                    : "0"}
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-600 text-right">
                                  0
                                </td>
                                <td className="border border-slate-300 px-3 py-2 text-sm text-slate-600">
                                  {item.memo || "-"}
                                </td>
                              </tr>
                            )
                          )
                        ) : (
                          <tr>
                            <td
                              colSpan={8}
                              className="border border-slate-300 px-3 py-4 text-center text-sm text-slate-500"
                            >
                              주문 항목이 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer: Memo and Total */}
                  <div className="grid grid-cols-2 gap-0 border border-blue-200 bg-white">
                    {/* Memo Section */}
                    <div className="border-r border-blue-200 p-4">
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        [메모]
                      </div>
                      <textarea
                        value={orderFormMemo}
                        onChange={(e) => setOrderFormMemo(e.target.value)}
                        className="w-full h-24 border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="메모를 입력하세요..."
                      />
                    </div>

                    {/* Total Section */}
                    <div className="p-4 flex flex-col justify-end">
                      {(() => {
                        const totalAmount = selectedOrder.totalAmount || 0;
                        const vatAmount = Math.floor(totalAmount * 0.1);
                        const grandTotal = totalAmount + vatAmount;
                        return (
                          <>
                            <div className="text-sm text-slate-700 mb-2">
                              [총금액] {totalAmount.toLocaleString()}
                            </div>
                            <div className="text-sm text-slate-700 mb-2">
                              [+VAT금액] {vatAmount.toLocaleString()}
                            </div>
                            <div className="text-sm font-semibold text-slate-900 border-t border-slate-300 pt-2 mt-2">
                              합계: {grandTotal.toLocaleString()}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
