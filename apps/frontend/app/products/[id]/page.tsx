"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const positionOptions = [
  "직함 선택",
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
];

type ProductDetail = {
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
  supplierId?: string | null;
  supplierName?: string | null;
  managerName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  supplierCompanyAddress?: string | null;
  supplierBusinessNumber?: string | null;
  supplierCompanyPhone?: string | null;
  supplierCompanyEmail?: string | null;
  supplierPosition?: string | null;
  supplierEmail2?: string | null;
  supplierResponsibleProducts?: string[];
  supplierMemo?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
  inboundManager?: string | null;
  memo?: string | null;
  isReturnable?: boolean;
  refundAmount?: number | null;
  capacityPerProduct?: number | null;
  capacityUnit?: string | null;
  usageCapacity?: number | null;
  returnStorage?: string | null;
  alertDays?: string | number | null;
  batches?: {
    id: string;
    batch_no: string;
    storage?: string | null;
    qty: number;
    expiry_date?: string | null;
    purchase_price?: number | null;
    sale_price?: number | null;
    manufacture_date?: string | null;
    created_at: string;
  }[];
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [batches, setBatches] = useState<ProductDetail["batches"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params?.id) return;

      setLoading(true);
      setError(null);
      try {
        const { apiGet } = await import("../../../lib/api");
        const data = await apiGet<any>(`${apiUrl}/products/${params.id}`);

        // Helper function to format image URL (relative path -> full URL)
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

        // Transform backend response to frontend ProductDetail format
        const rawImageUrl = data.productImage || data.image_url;
        const formattedImageUrl = formatImageUrl(rawImageUrl);

        const formattedProduct: ProductDetail = {
          id: data.id,
          productName: data.productName || data.name,
          brand: data.brand,
          barcode: data.barcode || null,
          productImage: formattedImageUrl,

          category: data.category,
          status: data.status,
          currentStock: data.currentStock || data.current_stock,
          minStock: data.minStock || data.min_stock,
          unit: data.unit,
          purchasePrice: data.purchasePrice || data.purchase_price,
          salePrice: data.salePrice || data.sale_price,
          supplierId: data.supplierId || null,
          supplierName: data.supplierName,
          managerName: data.managerName,
          contactPhone: data.contactPhone || data.contact_phone,
          contactEmail: data.contactEmail || data.contact_email,
          supplierCompanyAddress: data.supplierCompanyAddress || null,
          supplierBusinessNumber: data.supplierBusinessNumber || null,
          supplierCompanyPhone: data.supplierCompanyPhone || null,
          supplierCompanyEmail: data.supplierCompanyEmail || null,
          supplierPosition: data.supplierPosition || null,
          supplierEmail2: data.supplierEmail2 || null,
          supplierResponsibleProducts: data.supplierResponsibleProducts || [],
          supplierMemo: data.supplierMemo || null,
          expiryDate: data.expiryDate || data.expiry_date,
          storageLocation: data.storageLocation || data.storage_location,
          inboundManager: data.inboundManager || data.inbound_manager || null,
          memo: data.memo,
          isReturnable: data.isReturnable ?? false,
          refundAmount: data.refundAmount || data.refund_amount || null,
          capacityPerProduct:
            data.capacityPerProduct || data.capacity_per_product || null,
          capacityUnit: data.capacityUnit || data.capacity_unit || null,
          usageCapacity: data.usageCapacity || data.usage_capacity || null,
          returnStorage: data.returnStorage || data.return_storage || null,
          alertDays: data.alertDays || data.alert_days || null,
          batches: data.batches,
        };

        setProduct(formattedProduct);
      } catch (err) {
        console.error("Failed to load product", err);
        setError("제품 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [apiUrl, params?.id]);

  // Fetch batches separately
  useEffect(() => {
    const fetchBatches = async () => {
      if (!params?.id || !product) return;

      try {
        const { apiGet } = await import("../../../lib/api");
        const batchesData = await apiGet<any[]>(
          `${apiUrl}/products/${params.id}/batches`
        );

        // Map API response (Korean field names) to expected format
        const formattedBatches: ProductDetail["batches"] = batchesData.map(
          (batch: any) => ({
            id: batch.id,
            batch_no: batch.batch_no,
            storage: batch.보관위치 || null,
            qty: batch["입고 수량"] || 0,
            expiry_date: batch.유효기간 || null,
            purchase_price: null,
            sale_price: null,
            manufacture_date: null,
            created_at: batch.created_at || new Date().toISOString(),
          })
        );

        setBatches(formattedBatches);
      } catch (err) {
        console.error("Failed to load batches", err);
        setBatches([]);
      }
    };

    fetchBatches();
  }, [apiUrl, params?.id, product?.id]);

  if (!loading && !product) {
    notFound();
  }

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              제품 상세 정보
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/inventory/products"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                {product?.productName || "제품 정보"}
              </h1>
            </div>
          </div>
          {product && (
            <div className="flex flex-wrap gap-2">
              {isEditing ? (
                <button
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                >
                  취소
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                  >
                    <PencilIcon className="h-4 w-4" />
                    수정
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !confirm(
                          "정말 이 제품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                        )
                      )
                        return;
                      try {
                        // ✅ Use apiDelete instead of apiRequest for automatic cache invalidation and event dispatch
                        const { apiDelete } = await import("../../../lib/api");
                        await apiDelete(`${apiUrl}/products/${params.id}`);
                        
                        // ✅ Additional event dispatch to ensure inbound page gets notified
                        // (apiDelete already does this, but we do it here too for redundancy)
                        if (typeof window !== "undefined") {
                          sessionStorage.setItem("inbound_force_refresh", "true");
                          window.dispatchEvent(
                            new CustomEvent("productDeleted", {
                              detail: { productId: params.id },
                            })
                          );
                          console.log("[ProductDetail] Product deleted event dispatched:", params.id);
                        }
                        
                        alert("제품이 성공적으로 삭제되었습니다.");
                        router.push("/inventory/products");
                      } catch (err) {
                        console.error("Failed to delete product", err);
                        alert(
                          err instanceof Error
                            ? err.message
                            : "제품 삭제에 실패했습니다."
                        );
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 dark:border-rose-500/60 dark:text-rose-200"
                  >
                    <TrashIcon className="h-4 w-4" />
                    삭제
                  </button>
                </>
              )}
            </div>
          )}
        </header>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : product ? (
          isEditing ? (
            <ProductEditForm
              product={product}
              apiUrl={apiUrl}
              onCancel={() => setIsEditing(false)}
              onSuccess={(updatedProduct) => {
                setProduct(updatedProduct);
                setIsEditing(false);
              }}
            />
          ) : (
            <section className="space-y-6">
              {/* 제품 정보 Section */}
              <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <InfoIcon className="h-5 w-5 text-sky-500" />
                제품 정보
              </h2>
              <div className="rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
                <div className="p-6 sm:p-10">
                  <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
                    {/* Left Side - Image Display */}
                    <div className="flex flex-col gap-3">
                      <div className="relative flex h-96 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-0 overflow-hidden dark:border-slate-700 dark:bg-slate-900/60">
                        {product.productImage ? (
                          <img
                            src={product.productImage}
                            alt={product.productName}
                            className="h-full w-full object-cover rounded-xl"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 w-full h-full p-6">
                            <svg
                              className="h-12 w-12 text-slate-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                              이미지 없음
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Side - Product Details */}
                    <div className="flex flex-col gap-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <ReadOnlyField
                          label="제품명"
                          value={product.productName || "—"}
                        />
                        <ReadOnlyField
                          label="브랜드"
                          value={product.brand || "—"}
                        />
                        <ReadOnlyField
                          label="카테고리"
                          value={product.category || "—"}
                        />
                        <ReadOnlyField
                          label="바코드 번호"
                          value={product.barcode || "-"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 배치 목록 Section */}
              {batches && Array.isArray(batches) && batches.length > 0 && (
                <>
                  <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <BoxIcon className="h-5 w-5 text-slate-500" />
                    배치 목록
                  </h2>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="space-y-3">
                      {batches.map((batch) => (
                        <div
                          key={batch.id}
                          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50"
                        >
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            {" "}
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                                Batch:
                              </span>
                              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                                {batch.batch_no}
                              </span>
                            </div>
                            {batch.storage && (
                              <span className="inline-flex items-center gap-1">
                                <WarehouseIcon className="h-3.5 w-3.5" />
                                보관위치: {batch.storage}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              입고 날짜:{" "}
                              {new Date(batch.created_at).toLocaleDateString()}
                            </span>
                            {batch.expiry_date && (
                              <span className="inline-flex items-center gap-1">
                                유효기간:{" "}
                                {typeof batch.expiry_date === "string"
                                  ? batch.expiry_date
                                  : new Date(batch.expiry_date)
                                      .toISOString()
                                      .split("T")[0]}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-2 ml-auto">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                현재:
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {batch.qty.toLocaleString()} {product.unit || "EA"}
                              </span>
                              {batch.inbound_qty && (
                                <>
                                  <span className="text-slate-300 dark:text-slate-600">|</span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    입고수량:
                                  </span>
                                  <span className="font-semibold text-sky-600 dark:text-sky-400">
                                    {batch.inbound_qty.toLocaleString()} {product.unit || "EA"}
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 수량 및 용량 Section */}
              <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <InfoIcon className="h-5 w-5 text-sky-500" />
                수량 및 용량
              </h2>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid grid-cols-2 gap-4">
                  <ReadOnlyField
                    label="제품 재고 수량"
                    value={`${(product.currentStock || 0).toLocaleString()} ${product.unit || "EA"}`}
                  />
                  <ReadOnlyField
                    label="최소 제품 재고"
                    value={`${(product.minStock || 0).toLocaleString()} ${product.unit || "EA"}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  {product.capacityPerProduct && (
                    <ReadOnlyField
                      label="제품 용량"
                      value={`${product.capacityPerProduct} ${product.capacityUnit || "EA"}`}
                    />
                  )}
                  {product.usageCapacity && (
                    <ReadOnlyField
                      label="사용 단위"
                      value={`${product.usageCapacity} ${product.capacityUnit || "EA"}`}
                    />
                  )}
                </div>
              </div>

              {/* 가격 정보 Section */}
              <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <DollarIcon className="h-5 w-5 text-emerald-500" />
                가격 정보
              </h2>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid gap-6 md:grid-cols-2">
                  <ReadOnlyField
                    label="구매가"
                    value={
                      product.purchasePrice !== null &&
                      product.purchasePrice !== undefined
                        ? `${product.purchasePrice.toLocaleString()} 원${product.unit ? ` / ${product.unit}` : ""}`
                        : "—"
                    }
                  />
                  <ReadOnlyField
                    label="판매가"
                    value={
                      product.salePrice !== null &&
                      product.salePrice !== undefined
                        ? `${product.salePrice.toLocaleString()} 원${product.unit ? ` / ${product.unit}` : ""}`
                        : "—"
                    }
                  />
                </div>
              </div>

              {/* 반납 관리 Section */}
              {product.isReturnable && (
                <>
                  <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <RefreshIcon className="h-5 w-5 text-amber-500" />
                    반납 관리
                  </h2>
                  <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-lg shadow-amber-200/40 dark:border-amber-500/40 dark:bg-amber-500/10">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
                        <svg
                          className="h-3 w-3"
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
                      <span className="text-sm text-amber-700 dark:text-amber-200">
                        이 제품은 반납 가능한 제품입니다.
                      </span>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <ReadOnlyField
                        label="반납 시 할인 금액 (개당, 원)"
                        value={
                          product.refundAmount
                            ? `${product.refundAmount.toLocaleString()} 원`
                            : "—"
                        }
                      />
                      <ReadOnlyField
                        label="반납품 보관 위치"
                        value={product.returnStorage || "—"}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 유통기한 정보 Section */}
              <>
                <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                  <CalendarIcon className="h-5 w-5 text-emerald-500" />
                  유통기한 정보
                </h2>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="grid gap-6 md:grid-cols-2">
                    <ReadOnlyField
                      label="유통기한"
                      value={
                        product.expiryDate
                          ? new Date(product.expiryDate).toLocaleDateString()
                          : "—"
                      }
                    />
                    <ReadOnlyField
                      label="유통기한 임박 알림 기준"
                      value={
                        product.alertDays
                          ? typeof product.alertDays === "string" &&
                            product.alertDays.includes("일전")
                            ? product.alertDays
                            : `${product.alertDays}일전`
                          : "—"
                      }
                    />
                  </div>
                </div>
              </>

              {/* 공급업체 정보 Section */}
              {product.supplierName && (
                <>
                  <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <TruckIcon className="h-5 w-5 text-indigo-500" />
                    공급업체 정보
                  </h2>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="grid gap-6 md:grid-cols-2">
                      <ReadOnlyField
                        label="회사명"
                        value={product.supplierName || "—"}
                      />
                      <ReadOnlyField
                        label="담당자"
                        value={product.managerName || "—"}
                      />
                      <ReadOnlyField
                        label="담당자 연락처"
                        value={product.contactPhone || "—"}
                      />
                      <ReadOnlyField
                        label="이메일"
                        value={product.contactEmail || "—"}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 보관 정보 Section */}
              {(product.storageLocation ||
                product.inboundManager ||
                product.memo) && (
                <>
                  <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <WarehouseIcon className="h-5 w-5 text-slate-500" />
                    보관 정보
                  </h2>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="space-y-4">
                      {product.storageLocation && (
                        <ReadOnlyField
                          label="보관 위치"
                          value={product.storageLocation}
                        />
                      )}
                      {product.inboundManager && (
                        <ReadOnlyField
                          label="입고 담당자"
                          value={product.inboundManager}
                        />
                      )}
                      {product.memo && (
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            보관 메모
                          </span>
                          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {product.memo}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )
        ) : null}
      </div>
    </main>
  );
}

// Product Edit Form Component
interface ProductEditFormProps {
  product: ProductDetail;
  apiUrl: string;
  onCancel: () => void;
  onSuccess: (updatedProduct: ProductDetail) => void;
}

function ProductEditForm({
  product,
  apiUrl,
  onCancel,
  onSuccess,
}: ProductEditFormProps) {
  const unitOptions = [
    "cc / mL",
    "unit / U",
    "mg",
    "vial/bottel",
    "shot",
    "ea",
    "box",
    "set",
    "roll",
  ];

  const [loading, setLoading] = useState(false);

  // Supplier state
  const [supplierViewMode, setSupplierViewMode] = useState<
    "search" | "table" | "results"
  >("search");
  const [supplierSearchCompanyName, setSupplierSearchCompanyName] =
    useState("");
  const [supplierSearchManagerName, setSupplierSearchManagerName] =
    useState("");
  const [supplierSearchPhoneNumber, setSupplierSearchPhoneNumber] =
    useState("");
  const [supplierSearchResults, setSupplierSearchResults] = useState<any[]>([]);
  const [supplierSearchLoading, setSupplierSearchLoading] = useState(false);
  const [showSupplierEditModal, setShowSupplierEditModal] = useState(false);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [showNewSupplierConfirmModal, setShowNewSupplierConfirmModal] =
    useState(false);
  const [pendingSupplierPhone, setPendingSupplierPhone] = useState<string>("");
  const [phoneSearchNoResults, setPhoneSearchNoResults] = useState(false);

  // New supplier form state
  const [newSupplierForm, setNewSupplierForm] = useState({
    companyName: "",
    companyAddress: "",
    businessNumber: "",
    companyPhone: "",
    companyEmail: "",
    responsibleProducts: "",
    memo: "",
  });

  // Certificate upload and verification states
  const [certificateImage, setCertificateImage] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [certificateUrl, setCertificateUrl] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isBusinessValid, setIsBusinessValid] = useState<boolean | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [selectedSupplierDetails, setSelectedSupplierDetails] = useState<{
    id?: string;
    supplierId?: string;
    clinicSupplierManagerId?: string;
    companyName: string;
    companyAddress: string | null;
    businessNumber: string;
    companyPhone: string | null;
    companyEmail: string;
    managerId: string;
    managerName: string;
    position: string | null;
    phoneNumber: string;
    email1: string | null;
    email2: string | null;
    responsibleProducts: string[];
  } | null>(
    product.supplierName && product.managerName
      ? {
          companyName: product.supplierName,
          companyAddress: product.supplierCompanyAddress || null,
          businessNumber: product.supplierBusinessNumber || "",
          companyPhone: product.supplierCompanyPhone || null,
          companyEmail: product.supplierCompanyEmail || "",
          managerId: product.supplierId || "",
          managerName: product.managerName,
          position: product.supplierPosition || null,
          phoneNumber: product.contactPhone || "",
          email1: product.contactEmail || null,
          email2: product.supplierEmail2 || null,
          responsibleProducts: product.supplierResponsibleProducts || [],
          supplierId: product.supplierId || undefined,
        }
      : null
  );

  // Initialize search fields when supplier exists
  useEffect(() => {
    if (selectedSupplierDetails) {
      setSupplierSearchCompanyName(selectedSupplierDetails.companyName);
      setSupplierSearchManagerName(selectedSupplierDetails.managerName);
      setSupplierSearchPhoneNumber(selectedSupplierDetails.phoneNumber);
      // Agar supplier mavjud bo'lsa, table format'ni ko'rsatish
      setSupplierViewMode("table");
    }
  }, [selectedSupplierDetails]);
  const [editingSupplierDetails, setEditingSupplierDetails] = useState<{
    companyName: string;
    companyAddress: string;
    businessNumber: string;
    companyPhone: string;
    companyEmail: string;
    managerName: string;
    position: string;
    phoneNumber: string;
    email1: string;
    memo: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: product.productName || "",
    brand: product.brand || "",
    barcode: product.barcode || "",
    category: product.category || "",
    status: product.status || "활성",
    unit: product.unit || "",
    // Separate unit fields for synchronization
    currentStockUnit: product.unit || unitOptions[0] || "cc / mL",
    minStockUnit: product.unit || unitOptions[0] || "cc / mL",
    purchasePriceUnit: product.unit || unitOptions[0] || "cc / mL",
    capacityUnit: product.capacityUnit || unitOptions[0] || "cc / mL",
    usageCapacityUnit: product.capacityUnit || unitOptions[0] || "cc / mL",
    salePriceUnit: product.capacityUnit || unitOptions[0] || "cc / mL",
    purchasePrice: product.purchasePrice?.toString() || "",
    salePrice: product.salePrice?.toString() || "",
    currentStock: product.currentStock?.toString() || "0",
    minStock: product.minStock?.toString() || "0",
    capacityPerProduct: product.capacityPerProduct?.toString() || "",
    usageCapacity: product.usageCapacity?.toString() || "",
    enableUsageCapacity: !!product.usageCapacity,
    image: product.productImage || "",
    imageFile: null as File | null,
    expiryDate: product.expiryDate
      ? new Date(product.expiryDate).toISOString().split("T")[0]
      : "",
    storageLocation: product.storageLocation || "",
    inboundManager: product.inboundManager || "",
    memo: product.memo || "",
    isReturnable: product.isReturnable || false,
    refundAmount: product.refundAmount?.toString() || "",
    returnStorage: product.returnStorage || "",
    alertDays: product.alertDays?.toString() || "",
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      // 제품 재고 수량, 최소 제품 재고, 구매가 unit'lari bir-biriga bog'langan
      const syncedUnitFields = [
        "currentStockUnit",
        "minStockUnit",
        "purchasePriceUnit",
      ];

      if (syncedUnitFields.includes(field)) {
        syncedUnitFields.forEach((unitField) => {
          if (unitField !== field) {
            (newData as Record<string, any>)[unitField] = value;
          }
        });
        // Also update the main unit field
        newData.unit = value;
      }

      // 제품 용량 unit o'zgarganda, 판매가 unit ham o'zgaradi (readonly)
      // Faqat "사용 단위" checkbox o'chirilgan bo'lsa
      if (field === "capacityUnit") {
        // Agar "사용 단위" checkbox o'chirilgan bo'lsa, 판매가 unit 제품 용량 unit'iga o'zgaradi
        if (!prev.enableUsageCapacity) {
          newData.salePriceUnit = value;
        }
      }

      // 사용 단위 unit o'zgarganda, 판매가 unit ham o'zgaradi (readonly)
      // Faqat "사용 단위" checkbox yoqilgan bo'lsa
      if (field === "usageCapacityUnit") {
        // Agar "사용 단위" checkbox yoqilgan bo'lsa, 판매가 unit 사용 단위 unit'iga o'zgaradi
        if (prev.enableUsageCapacity) {
          newData.salePriceUnit = value;
        }
      }

      // 사용 단위 checkbox bosilganda, 판매가 unit mos ravishda o'zgaradi
      if (field === "enableUsageCapacity") {
        if (value === true) {
          // Checkbox yoqilganda, 판매가 unit 사용 단위 unit'iga o'zgaradi
          newData.salePriceUnit = prev.usageCapacityUnit;
        } else {
          // Checkbox o'chirilganda, 판매가 unit 제품 용량 unit'iga qaytadi
          newData.salePriceUnit = prev.capacityUnit;
        }
      }

      return newData;
    });
  };

  // Supplier search function
  const searchSuppliers = async (
    companyName?: string,
    managerName?: string,
    phoneNumber?: string
  ): Promise<any[]> => {
    if (!companyName && !managerName && !phoneNumber) {
      setSupplierSearchResults([]);
      return [];
    }

    setSupplierSearchLoading(true);
    try {
      const token =
        localStorage.getItem("erp_access_token") ||
        localStorage.getItem("token");
      const tenantId =
        localStorage.getItem("erp_tenant_id") ||
        localStorage.getItem("tenantId");

      const params = new URLSearchParams();
      if (companyName) params.append("companyName", companyName);
      if (managerName) params.append("managerName", managerName);
      if (phoneNumber) params.append("phoneNumber", phoneNumber);

      // Phone number bo'lsa, search-by-phone endpoint'ini ishlatish
      const endpoint = phoneNumber
        ? `${apiUrl}/supplier/search-by-phone?${params.toString()}`
        : `${apiUrl}/supplier/search?${params.toString()}`;

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const results = data.map((item: any) => ({
          companyName: item.companyName || "",
          companyAddress: item.companyAddress || null,
          businessNumber: item.businessNumber || "",
          companyPhone: item.companyPhone || null,
          companyEmail: item.companyEmail || "",
          managerId: item.managerId || "",
          managerName: item.managerName || "",
          position: item.position || null,
          phoneNumber: item.phoneNumber || "",
          email1: item.email1 || null,
          email2: item.email2 || null,
          responsibleProducts: item.responsibleProducts || [],
          supplierId: item.supplierId || item.id || null,
        }));
        setSupplierSearchResults(results);
        // supplierViewMode ni bu yerda o'zgartirmaymiz, chunki handleSupplierSearch yoki handleSupplierSearchByPhone funksiyalari buni boshqaradi
        return results;
      } else {
        setSupplierSearchResults([]);
        // supplierViewMode ni bu yerda o'zgartirmaymiz, chunki handleSupplierSearch yoki handleSupplierSearchByPhone funksiyalari buni boshqaradi
        return [];
      }
    } catch (error) {
      console.error("Error searching suppliers:", error);
      setSupplierSearchResults([]);
      // supplierViewMode ni bu yerda o'zgartirmaymiz, chunki handleSupplierSearch yoki handleSupplierSearchByPhone funksiyalari buni boshqaradi
      return [];
    } finally {
      setSupplierSearchLoading(false);
    }
  };

  const handleSupplierSearch = async () => {
    if (supplierSearchCompanyName && supplierSearchManagerName) {
      const results = await searchSuppliers(
        supplierSearchCompanyName,
        supplierSearchManagerName,
        undefined
      );
      if (results && results.length > 0) {
        setSupplierViewMode("results");
      } else {
        // Natija chiqmadi - search form'da qolish va phone search ko'rsatish
        setSupplierViewMode("search");
      }
    } else {
      setSupplierSearchResults([]);
      setSupplierViewMode("search");
    }
  };

  const handleSupplierSearchByPhone = async () => {
    if (!supplierSearchPhoneNumber) return;

    setSupplierSearchLoading(true);
    try {
      // searchSuppliers funksiyasini chaqirish va natijani kutish
      const results = await searchSuppliers(
        undefined,
        undefined,
        supplierSearchPhoneNumber
      );

      // Natijalarni tekshirish
      if (results && results.length > 0) {
        // Supplier topildi - malumotlarni ko'rsatish
        setSupplierViewMode("results");
        setPhoneSearchNoResults(false);
      } else {
        // Supplier topilmadi - oddiy modal ochish (imagdagiday)
        setPhoneSearchNoResults(true);
        setPendingSupplierPhone(supplierSearchPhoneNumber);
        setShowNewSupplierConfirmModal(true);
      }
    } catch (error) {
      console.error("Error searching suppliers by phone:", error);
      setSupplierSearchResults([]);
      setPhoneSearchNoResults(true);
      setPendingSupplierPhone(supplierSearchPhoneNumber);
      setShowNewSupplierConfirmModal(true);
    } finally {
      setSupplierSearchLoading(false);
    }
  };

  const handleSupplierSelect = (result: any) => {
    setSelectedSupplierDetails(result);
    setEditingSupplierDetails({
      companyName: result.companyName,
      companyAddress: result.companyAddress || "",
      businessNumber: result.businessNumber,
      companyPhone: result.companyPhone || "",
      companyEmail: result.companyEmail || "",
      managerName: result.managerName,
      position: result.position || "",
      phoneNumber: result.phoneNumber,
      email1: result.email1 || "",
      memo: "",
    });
    setShowSupplierEditModal(true);
    setSupplierSearchResults([]);
  };

  const handleSupplierEditSave = () => {
    if (editingSupplierDetails && selectedSupplierDetails) {
      setSelectedSupplierDetails({
        ...selectedSupplierDetails,
        companyName: editingSupplierDetails.companyName,
        companyAddress: editingSupplierDetails.companyAddress,
        businessNumber: editingSupplierDetails.businessNumber,
        companyPhone: editingSupplierDetails.companyPhone,
        companyEmail: editingSupplierDetails.companyEmail,
        managerName: editingSupplierDetails.managerName,
        position: editingSupplierDetails.position,
        phoneNumber: editingSupplierDetails.phoneNumber,
        email1: editingSupplierDetails.email1,
      });
      setShowSupplierEditModal(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        handleInputChange("image", base64String);
      };
      reader.readAsDataURL(file);
      handleInputChange("imageFile", file);
    }
  };

  // Handle certificate upload with OCR and business verification
  const handleCertificateUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setCertificatePreview(reader.result as string);
      setCertificateImage(file);
    };
    reader.readAsDataURL(file);

    // Upload to server with OCR and verification
    setUploading(true);
    setOcrResult(null);
    setVerificationResult(null);
    setIsBusinessValid(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const supplierApiUrl =
        process.env.NEXT_PUBLIC_SUPPLIER_API_URL || "http://localhost:3002";
      const response = await fetch(
        `${supplierApiUrl}/supplier/manager/upload-certificate`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("파일 업로드에 실패했습니다");
      }

      const data = await response.json();
      setCertificateUrl(data.fileUrl);
      setOcrResult(data.ocrResult);

      // Auto-fill form fields from OCR if available
      if (data.ocrResult?.parsedFields) {
        const fields = data.ocrResult.parsedFields;
        setNewSupplierForm((prev) => ({
          ...prev,
          companyName: fields.companyName || prev.companyName,
          companyAddress: fields.address || prev.companyAddress,
          businessNumber: fields.businessNumber || prev.businessNumber,
        }));
      }

      // Check verification result
      if (
        data.ocrResult?.verification &&
        typeof data.ocrResult.verification === "object"
      ) {
        const verification = data.ocrResult.verification;
        setVerificationResult(verification);
        setIsBusinessValid(verification.isValid === true);
        setShowVerificationModal(true);
      } else if (
        data.ocrResult?.verification === null ||
        data.ocrResult?.verification === undefined
      ) {
        setIsBusinessValid(false);
        setVerificationResult({ error: "사업자 정보를 확인할 수 없습니다" });
        setShowVerificationModal(true);
      }
    } catch (error: any) {
      console.error("Error uploading certificate:", error);
      alert(error.message || "파일 업로드에 실패했습니다");
      setIsBusinessValid(false);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted", formData);
    setLoading(true);

    try {
      const { apiPut } = await import("../../../lib/api");
      const payload: any = {
        name: formData.name,
        brand: formData.brand,
        barcode: formData.barcode || undefined,
        category: formData.category,
        status: formData.status,
        unit: formData.unit || undefined,
        purchasePrice: formData.purchasePrice
          ? Number(formData.purchasePrice)
          : undefined,
        salePrice: formData.salePrice ? Number(formData.salePrice) : undefined,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
      };

      // Capacity fields
      if (formData.capacityPerProduct) {
        payload.capacityPerProduct = Number(formData.capacityPerProduct);
      }
      if (formData.capacityUnit) {
        payload.capacityUnit = formData.capacityUnit;
      }
      if (formData.usageCapacity) {
        payload.usageCapacity = Number(formData.usageCapacity);
      }

      // Image handling
      if (formData.imageFile) {
        payload.image = formData.image;
      } else if (formData.image === "" || formData.image === null) {
        payload.image = null;
      }

      // Return policy - always include if isReturnable is true or refundAmount/returnStorage exists
      if (
        formData.isReturnable ||
        formData.refundAmount ||
        formData.returnStorage
      ) {
        payload.returnPolicy = {
          is_returnable: formData.isReturnable || false,
          refund_amount: formData.refundAmount
            ? Number(formData.refundAmount)
            : 0,
          return_storage: formData.returnStorage || null,
        };
      }

      // Alert days - must be string, not number (backend expects string)
      if (formData.alertDays) {
        payload.alertDays = formData.alertDays.toString();
      }

      // Storage location
      if (formData.storageLocation !== undefined) {
        payload.storage = formData.storageLocation || null;
      }

      // Inbound manager
      if (formData.inboundManager !== undefined) {
        payload.inboundManager = formData.inboundManager || null;
      }

      // ✅ Supplier information (ProductSupplier table uchun)
      if (selectedSupplierDetails) {
        payload.suppliers = [
          {
            supplier_id:
              selectedSupplierDetails.supplierId ||
              selectedSupplierDetails.clinicSupplierManagerId ||
              null,
            company_name: selectedSupplierDetails.companyName,
            business_number: selectedSupplierDetails.businessNumber,
            company_phone: selectedSupplierDetails.companyPhone,
            company_email: selectedSupplierDetails.companyEmail,
            company_address: selectedSupplierDetails.companyAddress,
            contact_name: selectedSupplierDetails.managerName,
            contact_phone: selectedSupplierDetails.phoneNumber,
            contact_email: selectedSupplierDetails.email1,
            purchase_price: formData.purchasePrice
              ? Number(formData.purchasePrice)
              : undefined,
            moq: undefined, // MOQ edit qilish mumkin emas
            lead_time_days: undefined, // Lead time edit qilish mumkin emas
            note: undefined, // Note edit qilish mumkin emas
          },
        ];
      }

      console.log("Sending payload:", payload);
      console.log("API URL:", `${apiUrl}/products/${product.id}`);
      const updatedProductResponse = await apiPut<any>(
        `${apiUrl}/products/${product.id}`,
        payload
      );
      console.log("Update response:", updatedProductResponse);

      // Refresh product data
      let finalProductResponse = updatedProductResponse;
      if (formData.imageFile) {
        try {
          const { apiGet } = await import("../../../lib/api");
          finalProductResponse = await apiGet<any>(
            `${apiUrl}/products/${product.id}`
          );
        } catch (refreshErr) {
          console.error(
            "Failed to refresh product after image upload",
            refreshErr
          );
        }
      }

      // Format image URL
      const formatImageUrl = (
        imageUrl: string | null | undefined
      ): string | null => {
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

      const rawImageUrl =
        finalProductResponse.productImage ||
        finalProductResponse.image_url ||
        product.productImage;
      const formattedImageUrl = formatImageUrl(rawImageUrl);

      const updatedProduct: ProductDetail = {
        id: finalProductResponse.id || product.id,
        productName:
          finalProductResponse.productName ||
          finalProductResponse.name ||
          product.productName,
        brand: finalProductResponse.brand || product.brand,
        productImage: formattedImageUrl,
        category: finalProductResponse.category || product.category,
        status: finalProductResponse.status || product.status,
        currentStock:
          finalProductResponse.currentStock ||
          finalProductResponse.current_stock ||
          product.currentStock,
        minStock:
          finalProductResponse.minStock ||
          finalProductResponse.min_stock ||
          product.minStock,
        unit: finalProductResponse.unit || product.unit,
        purchasePrice:
          finalProductResponse.purchasePrice ||
          finalProductResponse.purchase_price ||
          product.purchasePrice,
        salePrice:
          finalProductResponse.salePrice ||
          finalProductResponse.sale_price ||
          product.salePrice,
        supplierId: finalProductResponse.supplierId || product.supplierId,
        supplierName: finalProductResponse.supplierName || product.supplierName,
        managerName: finalProductResponse.managerName || product.managerName,
        contactPhone:
          finalProductResponse.contactPhone ||
          finalProductResponse.contact_phone ||
          product.contactPhone,
        contactEmail:
          finalProductResponse.contactEmail ||
          finalProductResponse.contact_email ||
          product.contactEmail,
        expiryDate:
          finalProductResponse.expiryDate ||
          finalProductResponse.expiry_date ||
          product.expiryDate,
        storageLocation:
          finalProductResponse.storageLocation ||
          finalProductResponse.storage_location ||
          finalProductResponse.storage ||
          product.storageLocation,
        inboundManager:
          finalProductResponse.inboundManager ||
          finalProductResponse.inbound_manager ||
          product.inboundManager,
        memo: finalProductResponse.memo || product.memo,
        isReturnable:
          finalProductResponse.isReturnable ?? product.isReturnable ?? false,
        refundAmount:
          finalProductResponse.refundAmount ||
          finalProductResponse.refund_amount ||
          product.refundAmount ||
          null,
        capacityPerProduct:
          finalProductResponse.capacityPerProduct ||
          finalProductResponse.capacity_per_product ||
          product.capacityPerProduct ||
          null,
        capacityUnit:
          finalProductResponse.capacityUnit ||
          finalProductResponse.capacity_unit ||
          product.capacityUnit ||
          null,
        usageCapacity:
          finalProductResponse.usageCapacity ||
          finalProductResponse.usage_capacity ||
          product.usageCapacity ||
          null,
        returnStorage:
          finalProductResponse.returnStorage ||
          finalProductResponse.return_storage ||
          product.returnStorage ||
          null,
        alertDays:
          finalProductResponse.alertDays ||
          finalProductResponse.alert_days ||
          product.alertDays ||
          null,
        batches: finalProductResponse.batches || product.batches,
      };

      alert("제품이 성공적으로 업데이트되었습니다.");
      onSuccess(updatedProduct);
    } catch (err: any) {
      console.error("Failed to update product", err);
      const errorMessage =
        err?.message || err?.toString() || "제품 업데이트에 실패했습니다.";
      console.error("Error details:", {
        message: errorMessage,
        error: err,
        stack: err?.stack,
      });
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = ["활성", "재고 부족", "만료", "단종"];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 제품 정보 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <InfoIcon className="h-5 w-5 text-sky-500" />
        제품 정보 수정
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <div className="p-6 sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
            {/* Left Side - Image Upload */}
            <div className="flex flex-col gap-3">
              <div className="relative flex h-96 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-0 overflow-hidden transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60">
                {formData.image ? (
                  <>
                    <img
                      src={formData.image}
                      alt="Preview"
                      className="h-full w-full object-cover rounded-xl"
                    />
                    <label className="absolute inset-0 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleInputChange("image", "")}
                      className="absolute top-2 right-2 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition z-10"
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
                  </>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 cursor-pointer w-full h-full p-6">
                    <svg
                      className="h-12 w-12 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      사진 첨부
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Right Side - Form Fields */}
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <InputField
                  label="제품명"
                  placeholder="이름"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
                <InputField
                  label="브랜드"
                  placeholder="브랜드"
                  value={formData.brand}
                  onChange={(e) => handleInputChange("brand", e.target.value)}
                />
                <InputField
                  label="카테고리"
                  placeholder="카테고리"
                  value={formData.category}
                  onChange={(e) =>
                    handleInputChange("category", e.target.value)
                  }
                />
                <InputField
                  label="바코드 번호"
                  placeholder="바코드 번호"
                  value={formData.barcode}
                  onChange={(e) => handleInputChange("barcode", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 수량 및 용량 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <InfoIcon className="h-5 w-5 text-sky-500" />
        수량 및 용량
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              제품 재고 수량
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={formData.currentStock}
                onChange={(e) =>
                  handleInputChange("currentStock", e.target.value)
                }
                placeholder="0"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="relative w-28">
                <select
                  value={formData.currentStockUnit}
                  onChange={(e) =>
                    handleInputChange("currentStockUnit", e.target.value)
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">단위 선택</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              최소 제품 재고
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={formData.minStock}
                onChange={(e) => handleInputChange("minStock", e.target.value)}
                placeholder="0"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="relative w-28">
                <select
                  value={formData.minStockUnit}
                  onChange={(e) =>
                    handleInputChange("minStockUnit", e.target.value)
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">단위 선택</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              제품 용량
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                value={formData.capacityPerProduct || ""}
                onChange={(e) =>
                  handleInputChange("capacityPerProduct", e.target.value)
                }
                placeholder="0"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="relative w-28">
                <select
                  value={formData.capacityUnit}
                  onChange={(e) =>
                    handleInputChange("capacityUnit", e.target.value)
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">단위 선택</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                사용 단위
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enableUsageCapacity}
                  onChange={(e) =>
                    handleInputChange("enableUsageCapacity", e.target.checked)
                  }
                  className="
        h-5 w-5 shrink-0 rounded
        appearance-none bg-white
        border border-white-300
        checked:bg-white-500 checked:border-white-500
        focus:outline-none focus:ring-2 focus:ring-white-500
        dark:bg-white
        relative
        after:content-['']
        after:absolute after:left-1/2 after:top-1/2
        after:h-2.5 after:w-1.5
        after:-translate-x-1/2 after:-translate-y-1/2
        after:rotate-45
        after:border-r-2 after:border-b-2
        after:border-black
        after:opacity-0
        checked:after:opacity-100
      "
                />

                <span className="text-xs text-slate-600 dark:text-slate-400">
                  사용 단위 활성화
                </span>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={formData.usageCapacity || ""}
                onChange={(e) =>
                  handleInputChange("usageCapacity", e.target.value)
                }
                disabled={!formData.enableUsageCapacity}
                placeholder="전체 사용 아닌 경우, 실제 사용량을 입력하세요"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="relative w-28">
                <select
                  value={formData.usageCapacityUnit}
                  onChange={(e) =>
                    handleInputChange("usageCapacityUnit", e.target.value)
                  }
                  disabled={!formData.enableUsageCapacity}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  <option value="">단위 선택</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 가격 정보 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <DollarIcon className="h-5 w-5 text-emerald-500" />
        가격 정보
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              구매가
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={formData.purchasePrice}
                onChange={(e) =>
                  handleInputChange("purchasePrice", e.target.value)
                }
                onWheel={(e) => e.currentTarget.blur()}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="relative w-28">
                <select
                  value={formData.purchasePriceUnit}
                  onChange={(e) =>
                    handleInputChange("purchasePriceUnit", e.target.value)
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">단위 선택</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              판매가
            </label>
            <div className="flex items-start gap-3">
              <div className="flex-1 flex gap-2">
                <input
                  type="number"
                  value={formData.salePrice}
                  onChange={(e) =>
                    handleInputChange("salePrice", e.target.value)
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {/* <div className="relative w-28">
                  <select
                    value={formData.salePriceUnit}
                    onChange={() => {}} // Read-only, synced automatically
                    disabled
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-100 px-3 pr-8 text-sm text-slate-500 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                    title={
                      formData.enableUsageCapacity
                        ? `사용 단위: ${formData.usageCapacityUnit || "—"}`
                        : `제품 용량: ${formData.capacityUnit || "—"}`
                    }
                  >
                    <option value={formData.salePriceUnit}>
                      {formData.salePriceUnit || "단위 선택"}
                    </option>
                  </select>
                  <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    <svg
                      className="h-4 w-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div> */}
              </div>
              {/* Unit Display Card */}
              {(formData.enableUsageCapacity && formData.usageCapacity) ||
              formData.capacityPerProduct ? (
                <div className="mt-0 flex-shrink-0">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formData.enableUsageCapacity && formData.usageCapacity
                          ? "사용 단위"
                          : "제품 용량"}
                      </div>

                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-right">
                        {formData.enableUsageCapacity && formData.usageCapacity
                          ? `${formData.usageCapacity} ${formData.usageCapacityUnit || ""}`
                          : formData.capacityPerProduct
                            ? `${formData.capacityPerProduct} ${formData.capacityUnit || ""}`
                            : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {/* {formData.salePriceUnit && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {formData.enableUsageCapacity
                  ? `사용 단위와 동기화됨 (${formData.usageCapacityUnit})`
                  : `제품 용량과 동기화됨 (${formData.capacityUnit})`}
              </p>
            )} */}
          </div>
        </div>
      </div>

      {/* 반납 관리 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <RefreshIcon className="h-5 w-5 text-amber-500" />
        반납 관리
      </h2>
      <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-lg shadow-amber-200/40 dark:border-amber-500/40 dark:bg-amber-500/10">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={formData.isReturnable}
            onChange={(e) =>
              handleInputChange("isReturnable", e.target.checked)
            }
            className="h-5 w-5 rounded border-amber-300 bg-white text-amber-600 focus:ring-2 focus:ring-amber-500 checked:bg-amber-500 checked:border-amber-500"
          />
          <span className="text-sm text-amber-700 dark:text-amber-200">
            이 제품은 반납 가능한 제품입니다.
          </span>
        </label>
        {formData.isReturnable && (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <InputField
              label="반납 시 할인 금액 (개당, 원)"
              type="number"
              value={formData.refundAmount}
              onChange={(e) =>
                handleInputChange("refundAmount", e.target.value)
              }
            />
            <InputField
              label="반납품 보관 위치"
              value={formData.returnStorage}
              onChange={(e) =>
                handleInputChange("returnStorage", e.target.value)
              }
              placeholder="보관 위치 입력하거나 선택하세요"
            />
          </div>
        )}
      </div>

      {/* 유통기한 정보 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <CalendarIcon className="h-5 w-5 text-emerald-500" />
        유통기한 정보
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="grid gap-6 md:grid-cols-2">
          <InputField
            label="유효기간"
            type="date"
            value={formData.expiryDate}
            onChange={(e) => handleInputChange("expiryDate", e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              유통기한 임박 알림 기준
            </label>
            <div className="relative">
              <select
                value={formData.alertDays || ""}
                onChange={(e) => handleInputChange("alertDays", e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">선택(30일전/60일전/90일전)</option>
                <option value="30">30일전</option>
                <option value="60">60일전</option>
                <option value="90">90일전</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 공급업체 정보 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <TruckIcon className="h-5 w-5 text-indigo-500" />
        공급업체 정보 *
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        {supplierViewMode === "table" && selectedSupplierDetails ? (
          /* 2-rasm: Table Format - Faqat ko'rsatish */
          <div className="relative">
            {/* 수정 button - o'ng tarafda burchakda */}
            <div className="absolute right-0 top-0">
              <button
                type="button"
                onClick={() => {
                  // Table'dan search form'ga o'tish (2-rasm)
                  console.log(
                    "Table 수정 button clicked",
                    selectedSupplierDetails
                  );
                  if (selectedSupplierDetails) {
                    // Input'larni to'ldirish
                    setSupplierSearchCompanyName(
                      selectedSupplierDetails.companyName
                    );
                    setSupplierSearchManagerName(
                      selectedSupplierDetails.managerName
                    );
                    setSupplierSearchPhoneNumber(
                      selectedSupplierDetails.phoneNumber
                    );
                    // Search form'ni ko'rsatish
                    console.log("Setting supplierViewMode to search");
                    setSupplierViewMode("search");
                    console.log(
                      "After setting, supplierViewMode should be search"
                    );
                  }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                수정
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      회사명
                    </th>
                    <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      이름
                    </th>
                    <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      직함
                    </th>
                    <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      핸드폰 번호
                    </th>
                    <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      담당자 ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedSupplierDetails.companyName}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedSupplierDetails.managerName}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedSupplierDetails.position || "-"}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedSupplierDetails.phoneNumber}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedSupplierDetails.managerId || "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : supplierViewMode === "results" &&
          supplierSearchResults.length > 0 ? (
          /* 3-rasm: Search Results Table */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    회사명
                  </th>
                  <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    이름
                  </th>
                  <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    직함
                  </th>
                  <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    핸드폰 번호
                  </th>
                  <th className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    담당자 ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {supplierSearchResults.map((result, index) => (
                  <tr
                    key={index}
                    onClick={() => handleSupplierSelect(result)}
                    className="cursor-pointer transition hover:bg-blue-50 dark:hover:bg-slate-700"
                  >
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {result.companyName}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {result.managerName}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {result.position || "-"}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {result.phoneNumber}
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-slate-900 dark:text-slate-100">
                      {result.managerId || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : showNewSupplierModal ? (
          /* New Supplier Registration Card - inbound/new pagedagiday */
          <div className="space-y-6">
            {/* Header with back button */}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400"
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
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  담당자님 정보 없습니다. 입력 부탁드립니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewSupplierModal(false);
                  setPendingSupplierPhone("");
                  setPhoneSearchNoResults(false);
                  // Clear form and certificate data
                  setNewSupplierForm({
                    companyName: "",
                    companyAddress: "",
                    businessNumber: "",
                    companyPhone: "",
                    companyEmail: "",
                    responsibleProducts: "",
                    memo: "",
                  });
                  setCertificateImage(null);
                  setCertificatePreview("");
                  setCertificateUrl("");
                  setOcrResult(null);
                  setVerificationResult(null);
                  setIsBusinessValid(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                뒤로
              </button>
            </div>

            {/* Form Content - Placeholder for now (same as modal) */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당자 이름*
                  </label>
                  <input
                    type="text"
                    placeholder="성함"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    사업자등록증
                  </label>
                  <div className="space-y-3">
                    {!certificatePreview ? (
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-blue-600 dark:hover:bg-slate-800">
                        <svg
                          className="mb-3 h-12 w-12 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <span className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          사업자등록증 이미지 업로드
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          PNG, JPG, WEBP (최대 10MB)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCertificateUpload}
                          disabled={uploading}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="relative">
                        <img
                          src={certificatePreview}
                          alt="Certificate preview"
                          className="h-128 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCertificateImage(null);
                            setCertificatePreview("");
                            setCertificateUrl("");
                            setOcrResult(null);
                            setVerificationResult(null);
                            setIsBusinessValid(null);
                            // Clear auto-filled form fields
                            setNewSupplierForm((prev) => ({
                              ...prev,
                              companyName: "",
                              companyAddress: "",
                              businessNumber: "",
                            }));
                          }}
                          className="absolute top-2 right-2 rounded-full bg-red-500 p-1.5 text-white transition hover:bg-red-600"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                        {uploading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                            <div className="text-center text-white">
                              <svg
                                className="mx-auto h-8 w-8 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              <p className="mt-2 text-sm">OCR 처리 중...</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Business Verification Status */}
                    {/* {isBusinessValid === true && (
                      <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        <div className="flex items-center gap-2">
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="font-medium">
                            ✅ 사업자 정보 확인 완료
                          </span>
                        </div>
                        {verificationResult?.businessStatus && (
                          <p className="mt-1 text-xs">
                            상태: {verificationResult.businessStatus}
                          </p>
                        )}
                      </div>
                    )}
                    {isBusinessValid === false && (
                      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        <div className="flex items-center gap-2">
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          <span className="font-medium">
                            ⚠️ 사업자 정보 확인 실패
                          </span>
                        </div>
                        <p className="mt-1 text-xs">
                          수동으로 정보를 입력해주세요
                        </p>
                      </div>
                    )} */}
                    {uploading && (
                      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-5 w-5 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span className="font-medium">
                            사업자 정보 확인 중...
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    핸드폰 번호*
                  </label>
                  <input
                    type="tel"
                    value={pendingSupplierPhone}
                    readOnly
                    placeholder="-없이 입력해주세요."
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사명 *
                  </label>
                  <input
                    type="text"
                    value={newSupplierForm.companyName}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        companyName: e.target.value,
                      }))
                    }
                    placeholder="회사명"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사 주소 *
                  </label>
                  <input
                    type="text"
                    value={newSupplierForm.companyAddress}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        companyAddress: e.target.value,
                      }))
                    }
                    placeholder="주소를 입력해주세요"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    사업자 등록번호 *
                  </label>
                  <input
                    type="text"
                    value={newSupplierForm.businessNumber}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        businessNumber: e.target.value,
                      }))
                    }
                    placeholder="00-000-0000"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사 전화번호 *
                  </label>
                  <input
                    type="tel"
                    placeholder="00-0000-0000"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    이메일 *
                  </label>
                  <input
                    type="email"
                    placeholder="이메일을 입력해주세요"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당 제품 *
                  </label>
                  <input
                    type="text"
                    placeholder="제품을 입력해주세요"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    메모
                  </label>
                  <textarea
                    placeholder="메모를 입력하세요"
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowNewSupplierModal(false);
                  setPendingSupplierPhone("");
                  setPhoneSearchNoResults(false);
                  // Clear form and certificate data
                  setNewSupplierForm({
                    companyName: "",
                    companyAddress: "",
                    businessNumber: "",
                    companyPhone: "",
                    companyEmail: "",
                    responsibleProducts: "",
                    memo: "",
                  });
                  setCertificateImage(null);
                  setCertificatePreview("");
                  setCertificateUrl("");
                  setOcrResult(null);
                  setVerificationResult(null);
                  setIsBusinessValid(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement save logic
                  console.log("저장 및 등록 clicked");
                  setShowNewSupplierModal(false);
                }}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                저장 및 등록
              </button>
            </div>
          </div>
        ) : (
          /* Search Fields - 1-rasm: Search Form */
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  공급업체명
                </label>
                <input
                  type="text"
                  value={supplierSearchCompanyName}
                  onChange={(e) => setSupplierSearchCompanyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      supplierSearchCompanyName &&
                      supplierSearchManagerName
                    ) {
                      handleSupplierSearch();
                    }
                  }}
                  readOnly={false}
                  placeholder="공급업체명을 입력해주세요."
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  담당자
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={supplierSearchManagerName}
                    onChange={(e) =>
                      setSupplierSearchManagerName(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        supplierSearchCompanyName &&
                        supplierSearchManagerName &&
                        !selectedSupplierDetails
                      ) {
                        handleSupplierSearch();
                      }
                    }}
                    readOnly={false}
                    placeholder="담당자 이름"
                    className="h-12 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  {supplierViewMode === "search" && (
                    <button
                      type="button"
                      onClick={handleSupplierSearch}
                      disabled={
                        supplierSearchLoading ||
                        !supplierSearchCompanyName ||
                        !supplierSearchManagerName
                      }
                      className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      title="검색"
                    >
                      {supplierSearchLoading ? (
                        <svg
                          className="h-5 w-5 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
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
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Warning Message */}

            {/* Warning Message */}
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <svg
                className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400"
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
              <p className="text-sm text-amber-800 dark:text-amber-300">
                담당자님 못 찾은 경우, 핸드폰 입력하시고 한번 더 검색해 보세요.
              </p>
            </div>

            {/* Phone Search */}
            {supplierViewMode === "search" && (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      핸드폰 번호
                    </label>
                    <input
                      type="text"
                      value={supplierSearchPhoneNumber}
                      onChange={(e) =>
                        setSupplierSearchPhoneNumber(e.target.value)
                      }
                      placeholder="000-0000-0000"
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleSupplierSearchByPhone}
                      disabled={
                        supplierSearchLoading || !supplierSearchPhoneNumber
                      }
                      className="h-12 rounded-lg bg-slate-600 px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-500 dark:hover:bg-slate-600"
                    >
                      검색하기
                    </button>
                  </div>
                </div>

                {/* Phone Search No Results - 새로 등록 Button */}
                {phoneSearchNoResults && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowNewSupplierModal(true)}
                      className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      새로 등록
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Supplier Edit Modal */}
      {showSupplierEditModal && editingSupplierDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="p-6">
              <h3 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">
                공급업체 상세 정보
              </h3>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      회사명
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.companyName}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          companyName: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      회사 주소
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.companyAddress}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          companyAddress: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      이름
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.managerName}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          managerName: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      직함
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.position}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          position: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      이메일
                    </label>
                    <input
                      type="email"
                      value={editingSupplierDetails.email1}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          email1: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      사업자 등록번호
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.businessNumber}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          businessNumber: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      회사 전화번호
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.companyPhone}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          companyPhone: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  {/* <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      담당자 ID
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      {selectedSupplierDetails?.managerId || "-"}
                    </div>
                  </div> */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      핸드폰 번호
                    </label>
                    <input
                      type="text"
                      value={editingSupplierDetails.phoneNumber}
                      onChange={(e) =>
                        setEditingSupplierDetails({
                          ...editingSupplierDetails,
                          phoneNumber: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      담당 제품
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      {selectedSupplierDetails?.responsibleProducts &&
                      selectedSupplierDetails.responsibleProducts.length > 0
                        ? selectedSupplierDetails.responsibleProducts.join(", ")
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 메모 - Full Width */}
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  메모
                </label>
                <textarea
                  rows={4}
                  value={editingSupplierDetails.memo}
                  onChange={(e) =>
                    setEditingSupplierDetails({
                      ...editingSupplierDetails,
                      memo: e.target.value,
                    })
                  }
                  placeholder="메모를 입력하세요"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSupplierEditModal(false)}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSupplierEditSave}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  확인하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Supplier Confirm Modal - Oddiy modal (imagdagiday) */}
      {showNewSupplierConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="p-6">
              {/* Close Icon */}
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSupplierConfirmModal(false);
                    setPendingSupplierPhone("");
                    setPhoneSearchNoResults(false);
                  }}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
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

              {/* Message */}
              <div className="mb-6 text-center">
                <p className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  담당자님 정보 없습니다.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  입력 부탁드립니다.
                </p>
              </div>

              {/* Action Button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    // "직접 입력" button bosilganda, to'liq form modal'ni ochish
                    setShowNewSupplierConfirmModal(false);
                    setShowNewSupplierModal(true);
                  }}
                  className="rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  직접 입력
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 보관 정보 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <WarehouseIcon className="h-5 w-5 text-slate-500" />
        보관 정보
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="grid gap-6">
          <InputField
            label="보관 위치"
            value={formData.storageLocation}
            onChange={(e) =>
              handleInputChange("storageLocation", e.target.value)
            }
          />
          <InputField
            label="입고 담당자"
            value={formData.inboundManager}
            onChange={(e) =>
              handleInputChange("inboundManager", e.target.value)
            }
            placeholder="입고 담당자 이름을 입력하세요"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
          disabled={loading}
        >
          취소
        </button>
        <button
          type="submit"
          onClick={(e) => {
            console.log("Submit button clicked");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Business Verification Result Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="text-center">
              {isBusinessValid ? (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg
                      className="h-8 w-8 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                    사업자 정보 확인 완료
                  </h3>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    유효한 사업자등록번호입니다
                  </p>
                  {verificationResult?.businessStatus && (
                    <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700">
                      <p className="text-slate-700 dark:text-slate-300">
                        상태: {verificationResult.businessStatus}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <svg
                      className="h-8 w-8 text-red-600 dark:text-red-400"
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
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                    사업자 정보 확인 실패
                  </h3>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    {verificationResult?.error ||
                      "사업자등록번호를 확인할 수 없습니다"}
                  </p>
                  <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                    수동으로 정보를 입력하여 계속 진행할 수 있습니다
                  </p>
                </>
              )}
              <button
                onClick={() => setShowVerificationModal(false)}
                className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// Input Field Component
function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onWheel={type === "number" ? (e) => e.currentTarget.blur() : undefined}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

// Read-only field component
function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {value ?? "—"}
      </div>
    </div>
  );
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
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
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25h1.5v5.25h-1.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75h.008v.008H12z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
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
        d="M12 3v18m4.5-13.5A3.75 3.75 0 0012 3.75h-.75a3.75 3.75 0 000 7.5h1.5a3.75 3.75 0 010 7.5H12a3.75 3.75 0 01-4.5-3.75"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
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
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
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
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
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
        d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h4.5V10.75M8.25 21H3.375c-.621 0-1.125-.504-1.125-1.125V3.545c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v16.33c0 .621-.504 1.125-1.125 1.125z"
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
        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
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

function TrashIcon({ className }: { className?: string }) {
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
        d="M6 7.5h12M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5m-7.5 0V18a2.25 2.25 0 002.25 2.25h4.5A2.25 2.25 0 0017.25 18V7.5"
      />
    </svg>
  );
}
