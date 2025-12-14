"use client";

import { useEffect, useMemo, useState, ChangeEvent, useCallback } from "react";
import Link from "next/link";

const inboundFilters = [
  { label: "최근 업데이트순", value: "recent" },
  { label: "최근 등록순", value: "newest" },
  { label: "이름순", value: "name" },
];

const categories = ["전체 카테고리", "스킨케어", "바디케어", "헤어케어"];
const statuses = ["전체 상태", "입고 완료", "입고 대기", "재고 부족"];
const suppliers = ["전체 공급업체", "뷰티랩", "글로우웰", "퍼스트메드"];

type ProductBatch = {
  batch_no: string;
  유효기간: string | null;
  보관위치: string | null;
  "입고 수량": number;
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
  expiryDate?: string | null;
  storageLocation?: string | null;
  memo?: string | null;
  expiryMonths?: number | null;
  expiryUnit?: string | null;
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
  const itemsPerPage = 5;

  // Fetch products for "빠른 입고" tab
  useEffect(() => {
    if (activeTab !== "quick") return;

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const { apiGet } = await import("../../../lib/api");
        const data = await apiGet<any[]>(`${apiUrl}/products`);

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
    };

    fetchProducts();
  }, [apiUrl, activeTab]);

  // Fetch pending orders function
  const fetchPendingOrders = useCallback(async () => {
    if (activeTab !== "pending") return;

    setLoading(true);
    setError(null);
    try {
      const { apiGet } = await import("../../../lib/api");
      const groupedData = await apiGet<any[]>(`${apiUrl}/order/pending-inbound`);
      
      // Flatten grouped data: each supplier group has an array of orders
      const flatOrders: any[] = [];
      groupedData.forEach((supplierGroup: any) => {
        supplierGroup.orders?.forEach((order: any) => {
          flatOrders.push({
            ...order,
            supplierName: supplierGroup.supplierName,
            managerName: supplierGroup.managerName,
          });
        });
      });
      
      setPendingOrders(flatOrders);
    } catch (err) {
      console.error("Failed to load pending orders", err);
      setError("입고 대기 주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeTab]);

  // Fetch pending orders for "입고 대기" tab
  useEffect(() => {
    fetchPendingOrders();
  }, [fetchPendingOrders]);

  // Pagination calculations
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = products.slice(startIndex, endIndex);

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
            전체 제품
            </h1>
            
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
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
                  />
                </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:w-auto">
                  <FilterChip
                    label="정렬"
                    options={inboundFilters}
                    defaultValue="최근 업데이트순"
                  />
                  <FilterChip
                    label="카테고리"
                    options={categories}
                    defaultValue="전체 카테고리"
                  />
                  <FilterChip
                    label="상태"
                    options={statuses}
                    defaultValue="전체 상태"
                  />
                  <FilterChip
                    label="공급업체"
                    options={suppliers}
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
                  총 {products.length.toLocaleString()}개의 제품
                </h2>
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
                  <FunnelIcon className="h-4 w-4" />
                  필터 저장
                </button>
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
              onRefresh={fetchPendingOrders}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function ProductCard({
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

  // Initialize inboundManager from localStorage (current logged-in member)
  useEffect(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (memberData && !batchForm.inboundManager) {
      const member = JSON.parse(memberData);
      setBatchForm(prev => ({
        ...prev,
        inboundManager: member.full_name || member.member_id || ""
      }));
    }
  }, [batchForm.inboundManager]);
  
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const isLowStock = product.currentStock <= product.minStock;

  useEffect(() => {
    const fetchBatches = async () => {
      if (!isExpanded) return; // Faqat expanded bo'lganda fetch qil

      setLoadingBatches(true);
      try {
        const { apiGet } = await import("../../../lib/api");
        const data = await apiGet<ProductBatch[]>(
          `${apiUrl}/products/${product.id}/batches`
        );
        setBatches(data);
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
    if (batchForm.manufactureDate && product.expiryMonths && product.expiryUnit) {
      const mfgDate = new Date(batchForm.manufactureDate);
      let calculatedDate = new Date(mfgDate);
      
      if (product.expiryUnit === "months") {
        calculatedDate.setMonth(calculatedDate.getMonth() + Number(product.expiryMonths));
      } else if (product.expiryUnit === "days") {
        calculatedDate.setDate(calculatedDate.getDate() + Number(product.expiryMonths));
      } else if (product.expiryUnit === "years") {
        calculatedDate.setFullYear(calculatedDate.getFullYear() + Number(product.expiryMonths));
      }
      
      // Format: YYYY-MM-DD
      const calculatedExpiryDate = calculatedDate.toISOString().split('T')[0];
      
      // Only update if expiry date is empty or was previously calculated
      if (!batchForm.expiryDate || batchForm.expiryDate === calculatedExpiryDate) {
        setBatchForm(prev => ({ ...prev, expiryDate: calculatedExpiryDate }));
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
      const token = localStorage.getItem("erp_access_token") || localStorage.getItem("token");
      const tenantId = localStorage.getItem("erp_tenant_id") || localStorage.getItem("tenantId");

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
      if (batchForm.storageLocation) {
        payload.storage = batchForm.storageLocation;
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

      // Refresh batches list
      const { apiGet } = await import("../../../lib/api");
      const updatedBatches = await apiGet<ProductBatch[]>(
        `${apiUrl}/products/${product.id}/batches`
      );
      setBatches(updatedBatches);

      alert("배치가 성공적으로 추가되었습니다.");
    } catch (error: any) {
      console.error("Error creating batch:", error);
      alert(`배치 생성 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`);
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
    <span className="inline-flex items-center gap-1">
      <WonIcon className="h-4 w-4 text-emerald-500" />
      구매: ₩{(product.purchasePrice ?? 0).toLocaleString()}
    </span>
    {product.supplierName && (
      <span className="inline-flex items-center gap-1">
        <TruckIcon className="h-4 w-4 text-indigo-500" />
        {product.supplierName}
      </span>
    )}
    {product.expiryDate && (
      <span className="inline-flex items-center gap-1">
        <CalendarIcon className="h-4 w-4" />
        {new Date(product.expiryDate).toLocaleDateString()}
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
          <button
            onClick={handleButtonClick}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
          >
            🧾 1개 배치
          </button>
          
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
                      {new Date(batch.created_at).toLocaleDateString()}
                    </span>
                    {batch.유효기간 && (
                      <span className="inline-flex items-center gap-1">
                        유효기간: {batch.유효기간}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {batch["입고 수량"]?.toLocaleString() ?? 0}
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
              <Link
                href={`/products/${product.id}`}
                onClick={handleButtonClick}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                상세 보기
              </Link>
            </div>

            {/* 입고 담당자 - read-only (current logged-in member) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                입고 담당자: <span className="bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                  {batchForm.inboundManager || "알 수 없음"}
                </span>
              </label>
              <div className="flex items-center gap-3">
                
               
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InlineField 
                label="제조일 (선택)" 
                type="date"
                value={batchForm.manufactureDate}
                onChange={(value) => setBatchForm({ ...batchForm, manufactureDate: value })}
              />
              <InlineField
                label="구매원가 (원)"
                placeholder="구매원가를 입력하세요"
                type="number"
                value={batchForm.purchasePrice}
                onChange={(value) => setBatchForm({ ...batchForm, purchasePrice: value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <QuantityField
                value={batchQuantity}
                onChange={setBatchQuantity}
              />
              <div>
                <InlineField 
                  label="유효 기간 *" 
                  type="date"
                  value={batchForm.expiryDate}
                  onChange={(value) => setBatchForm({ ...batchForm, expiryDate: value })}
                />
                {batchForm.manufactureDate && product.expiryMonths && product.expiryUnit && (
                  <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                    계산된 유통기한: {batchForm.expiryDate || "계산 중..."}
                  </p>
                )}
              </div>
            </div>

            {/* 보관 위치 - to'liq width */}
            <InlineField
              label="보관 위치 (선택)"
              placeholder="예: 창고 A-3, 냉장실 1번"
              value={batchForm.storageLocation}
              onChange={(value) => setBatchForm({ ...batchForm, storageLocation: value })}
            />

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
}

interface FilterChipProps {
  label: string;
  options: string[] | { label: string; value: string }[];
  defaultValue: string;
}

function FilterChip({ label, options, defaultValue }: FilterChipProps) {
  const resolvedOptions = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

  return (
    <button className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        {defaultValue}
      </span>
      <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
    </button>
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
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700"
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
function PendingOrdersList({
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

  // Initialize edited items when orders change
  useEffect(() => {
    const initialEdits: Record<string, any> = {};
    orders.forEach((order) => {
      order.items?.forEach((item: any) => {
        // Use original ordered quantity from clinic (not supplier's confirmed qty)
        const originalQty = item.orderedQuantity;
        const finalPrice = item.confirmedPrice || item.orderedPrice;
        
        initialEdits[item.id] = {
          quantity: "",
          expiryDate: "",
          storageLocation: "",
          purchasePrice: "", 
        };
      });
    });
    setEditedItems(initialEdits);
  }, [orders]);

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
    if (!confirm(`주문번호 ${order.orderNo}를 입고 처리하시겠습니까?`)) {
      return;
    }

    setProcessing(order.orderId);
    try {
      const token = localStorage.getItem("erp_access_token") || localStorage.getItem("token");
      const tenantId = localStorage.getItem("erp_tenant_id") || localStorage.getItem("tenantId");

      if (!token || !tenantId) {
        alert("로그인이 필요합니다.");
        return;
      }

      // Process each item in the order
      const { apiPost, apiGet } = await import("../../../lib/api");
      
      // Get current member info for inbound_manager
      const memberData = localStorage.getItem("erp_member_data");
      const memberInfo = memberData ? JSON.parse(memberData) : {};
      const inboundManager = memberInfo.member_id || memberInfo.full_name || "자동입고"; // Use member_id for return_manager

      // Group items by productId
      const itemsByProduct = new Map<string, any[]>();
      order.items?.forEach((item: any) => {
        const existing = itemsByProduct.get(item.productId) || [];
        existing.push(item);
        itemsByProduct.set(item.productId, existing);
      });

      // Validate all items have expiry date
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
        const confirmedQty = firstItem.confirmedQuantity || firstItem.orderedQuantity;
        
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
        if (editedFirstItem?.storageLocation) batchPayload.storage = editedFirstItem.storageLocation;

        // Create batch
        const createdBatch = await apiPost<any>(`${apiUrl}/products/${productId}/batches`, batchPayload);
        
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
          alert(`반품 생성 중 오류가 발생했습니다: ${returnError.message || "알 수 없는 오류"}\n입고 처리는 계속됩니다.`);
        }
      }

      // Update order status to completed
      try {
        await apiPost(`${apiUrl}/order/${order.orderId}/complete`, {});
      } catch (completeError: any) {
        console.error(`Failed to complete order:`, completeError);
        throw new Error(`주문 완료 처리 중 오류가 발생했습니다: ${completeError.message || "알 수 없는 오류"}`);
      }

      // Show success message and optionally redirect to order-returns if returns were created
      if (returnItems.length > 0) {
        if (confirm(`입고 처리가 완료되었습니다.\n${returnItems.length}개의 반품이 생성되었습니다.\n반품 관리 페이지로 이동하시겠습니까?`)) {
          window.location.href = "/order-returns";
          return; // Exit early to prevent onRefresh() call
        }
      } else {
        alert("입고 처리가 완료되었습니다.");
      }
      
      onRefresh();
    } catch (err: any) {
      console.error("Failed to process order:", err);
      const errorMessage = err.message || "알 수 없는 오류";
      
      // Check if it's a network error
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        alert(`네트워크 오류가 발생했습니다.\n서버에 연결할 수 없습니다.\n\n오류: ${errorMessage}\n\n다시 시도해주세요.`);
      } else {
        alert(`입고 처리 중 오류가 발생했습니다: ${errorMessage}`);
      }
    } finally {
      setProcessing(null);
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
      </div>

      <div className="space-y-4">
        {orders.map((order) => {
          // Get current member info for inbound manager
          const memberData = typeof window !== 'undefined' ? localStorage.getItem("erp_member_data") : null;
          const memberInfo = memberData ? JSON.parse(memberData) : {};
          const inboundManagerName = memberInfo.full_name || memberInfo.member_id || "알 수 없음";

          // Determine order status
          const isPending = order.status === "pending";
          const isSupplierConfirmed = order.status === "supplier_confirmed";
          const isRejected = order.status === "rejected";

          return (
            <div key={order.orderId} className="space-y-2">
              {/* Badge - Above Card */}
              <div className="flex items-start">
                {isPending ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    주문 요청
                  </span>
                ) : isRejected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    주문 거절
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    주문 진행
                  </span>
                )}
              </div>

              {/* Card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">

              {/* Order Info - 3 Columns */}
              <div className="mb-4 grid grid-cols-1 gap-4 border-b border-slate-200 pb-4 dark:border-slate-700 lg:grid-cols-3">
                {/* Left: 공급업체 + Manager */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TruckIcon className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {order.supplierName || "알 수 없음"}
                    </h3>
                  </div>
                  {order.managerName && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      담당자: {order.managerName}
                    </p>
                  )}
                </div>

                {/* Center: 주문번호 */}
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-2 dark:bg-sky-500/10">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">주문번호</span>
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
                      주문자: {order.createdByName || "알 수 없음"}
                    </span>
                  </div>
                </div>
              </div>

            {/* Order Items - Editable Form */}
            <div className="space-y-4">
              {order.items?.map((item: any, index: number) => {
                const edited = editedItems[item.id] || {};
                const hasQtyChange = item.confirmedQuantity !== item.orderedQuantity;
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
                            onChange={(e) => updateItemField(item.id, "quantity", parseInt(e.target.value) || 0)}
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
                          onChange={(e) => updateItemField(item.id, "expiryDate", e.target.value)}
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
                          onChange={(e) => updateItemField(item.id, "storageLocation", e.target.value)}
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
                          onChange={(e) => updateItemField(item.id, "purchasePrice", parseInt(e.target.value) || "")}
                          disabled={isPending || isRejected}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        />
                        {(isSupplierConfirmed || isRejected) && hasPriceChange && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            공급업체 조정: {item.orderedPrice.toLocaleString()}원 → {item.confirmedPrice.toLocaleString()}원
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
                        if (!confirm(`주문번호 ${order.orderNo}의 거절 상황을 확인하시겠습니까?`)) {
                          return;
                        }

                        try {
                          const { apiPost } = await import("../../../lib/api");
                          const memberData = typeof window !== 'undefined' ? localStorage.getItem("erp_member_data") : null;
                          const memberInfo = memberData ? JSON.parse(memberData) : {};
                          const memberName = memberInfo.full_name || memberInfo.member_id || "알 수 없음";

                          // Prepare items array with product info
                          const items = order.items?.map((item: any) => ({
                            productName: item.productName || "알 수 없음",
                            productBrand: item.brand || null,
                            qty: item.orderedQuantity || item.confirmedQuantity || 0,
                          })) || [];

                          const endpoint = `${apiUrl}/order/rejected-order/confirm`;
                          console.log("Calling endpoint:", endpoint);
                          await apiPost(endpoint, {
                            orderId: order.orderId,
                            orderNo: order.orderNo,
                            companyName: order.supplierName || "알 수 없음",
                            managerName: order.managerName || "알 수 없음",
                            memberName: memberName,
                            items: items,
                          });

                          alert("거절 상황이 확인되었습니다.");
                          // Refresh the orders list to remove the confirmed rejected order
                          if (onRefresh) {
                            onRefresh();
                          }
                          // Trigger a custom event to notify order page to refresh rejected orders
                          window.dispatchEvent(new CustomEvent('rejectedOrderConfirmed', { 
                            detail: { orderNo: order.orderNo } 
                          }));
                          // Also trigger a page visibility refresh to ensure data is updated
                          window.dispatchEvent(new Event('visibilitychange'));
                        } catch (err: any) {
                          console.error("Failed to confirm rejection:", err);
                          alert(`거절 확인 중 오류가 발생했습니다: ${err.message || "알 수 없는 오류"}`);
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
