"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ProductDetail = {
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
  supplierId?: string | null;
  supplierName?: string | null;
  managerName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
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
          expiryDate: data.expiryDate || data.expiry_date,
          storageLocation: data.storageLocation || data.storage_location,
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
                        const { apiRequest } = await import("../../../lib/api");
                        const response = await apiRequest(
                          `${apiUrl}/products/${params.id}`,
                          {
                            method: "DELETE",
                          }
                        );
                        if (!response.ok) {
                          const error = await response.json().catch(() => ({}));
                          throw new Error(
                            error?.message || "제품 삭제에 실패했습니다."
                          );
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
                          label="상태"
                          value={
                            <span
                              className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                product.status === "재고 부족"
                                  ? "bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"
                                  : product.status === "단종"
                                    ? "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
                                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                              }`}
                            >
                              {product.status || "—"}
                            </span>
                          }
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
                      product.purchasePrice
                        ? `${product.purchasePrice.toLocaleString()} 원`
                        : "—"
                    }
                  />
                  <ReadOnlyField
                    label="판매가"
                    value={
                      product.salePrice
                        ? `${product.salePrice.toLocaleString()} 원`
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
              {(product.storageLocation || product.memo) && (
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
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 dark:text-white">
                              Batch:
                            </span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-white">
                              {batch.batch_no}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
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
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white ml-auto">
                              {batch.qty.toLocaleString()}{" "}
                              {product.unit || "EA"}
                            </span>
                          </div>
                        </div>
                      ))}
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
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: product.productName || "",
    brand: product.brand || "",
    category: product.category || "",
    status: product.status || "활성",
    unit: product.unit || "",
    purchasePrice: product.purchasePrice?.toString() || "",
    salePrice: product.salePrice?.toString() || "",
    currentStock: product.currentStock?.toString() || "0",
    minStock: product.minStock?.toString() || "0",
    capacityPerProduct: product.capacityPerProduct?.toString() || "",
    capacityUnit: product.capacityUnit || "",
    usageCapacity: product.usageCapacity?.toString() || "",
    image: product.productImage || "",
    imageFile: null as File | null,
    expiryDate: product.expiryDate
      ? new Date(product.expiryDate).toISOString().split("T")[0]
      : "",
    storageLocation: product.storageLocation || "",
    memo: product.memo || "",
    isReturnable: product.isReturnable || false,
    refundAmount: product.refundAmount?.toString() || "",
    returnStorage: product.returnStorage || "",
    alertDays: product.alertDays?.toString() || "",
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted", formData);
    setLoading(true);

    try {
      const { apiPut } = await import("../../../lib/api");
      const payload: any = {
        name: formData.name,
        brand: formData.brand,
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
          product.storageLocation,
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
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    상태
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      handleInputChange("status", e.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
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
                  value={formData.unit}
                  onChange={(e) => handleInputChange("unit", e.target.value)}
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
                  value={formData.unit}
                  onChange={(e) => handleInputChange("unit", e.target.value)}
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
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              사용 단위
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={formData.usageCapacity || ""}
                onChange={(e) =>
                  handleInputChange("usageCapacity", e.target.value)
                }
                placeholder="전체 사용 아닌 경우, 실제 사용량을 입력하세요"
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
            <input
              type="number"
              value={formData.purchasePrice}
              onChange={(e) =>
                handleInputChange("purchasePrice", e.target.value)
              }
              onWheel={(e) => e.currentTarget.blur()}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  판매가
                </label>
                <input
                  type="number"
                  value={formData.salePrice}
                  onChange={(e) =>
                    handleInputChange("salePrice", e.target.value)
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {/* Unit Display Card */}
              {(formData.capacityPerProduct || formData.usageCapacity) && (
                <div className="mt-7 flex-shrink-0">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {formData.usageCapacity &&
                      formData.usageCapacity.trim() !== ""
                        ? "사용 단위"
                        : "제품 용량"}
                    </div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {formData.usageCapacity &&
                      formData.usageCapacity.trim() !== ""
                        ? `${formData.usageCapacity} ${formData.capacityUnit || ""}`
                        : formData.capacityPerProduct &&
                            formData.capacityPerProduct.trim() !== ""
                          ? `${formData.capacityPerProduct} ${formData.capacityUnit || ""}`
                          : "-"}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
