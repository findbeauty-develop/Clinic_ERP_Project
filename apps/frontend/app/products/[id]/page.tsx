"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken, getTenantId } from "../../../lib/api";
import { position } from "html2canvas/dist/types/css/property-descriptors/position";

const positionOptions = [
  "직함 선택",
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
  "대표",
  "이사",
  "담당자",
];

const formatDateToYYYYMMDD = (
  date: string | Date | null | undefined
): string => {
  if (!date) return "";

  if (typeof date === "string") {
    return date.split("T")[0];
  }

  return new Date(date).toISOString().split("T")[0];
};

type BarcodeItem = {
  id?: string;
  gtin: string;
  barcode_package_type: string;
};

type PurchasePathDetail = {
  id: string;
  pathType: "MANAGER" | "SITE" | "OTHER";
  /** Backend sort_order — read-only guruhlarda tartib uchun */
  sortOrder?: number;
  isDefault?: boolean;
  siteName?: string | null;
  siteUrl?: string | null;
  normalizedDomain?: string | null;
  otherText?: string | null;
  clinicSupplierManagerId?: string | null;
  manager?: {
    id: string;
    companyName: string;
    name: string;
    position?: string | null;
    phoneNumber?: string | null;
    /** 플랫폼 SupplierManager 와 연결됨 (없으면 클리닉 수동 담당자) */
    platformLinked?: boolean;
    businessNumber?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyAddress?: string | null;
    email1?: string | null;
    email2?: string | null;
    responsibleProducts?: string[];
    responsibleRegions?: string[];
    memo?: string | null;
  } | null;
};

type ProductDetail = {
  id: string;
  productName: string;
  brand: string;
  barcode?: string | null;
  barcodes?: BarcodeItem[];
  productImage?: string | null;
  category: string;
  status: string;
  currentStock: number;
  inboundQty?: number | null;
  minStock: number;
  unit?: string | null;
  purchasePrice?: number | null;
  taxRate?: number | null;
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
  hasExpiryPeriod?: boolean;
  purchasePaths?: PurchasePathDetail[];
  batches?: {
    id: string;
    batch_no: string;
    storage?: string | null;
    qty: number;
    inbound_qty?: number | null;
    unit?: string | null;
    expiry_date?: string | null;
    purchase_price?: number | null;
    sale_price?: number | null;
    manufacture_date?: string | null;
    created_at: string;
    is_separate_purchase?: boolean;
    reason_for_modification?: string | null;
    inbound_manager?: string | null;
  }[];
};

function mapPurchasePathApiRow(raw: any): PurchasePathDetail {
  const m =
    raw.clinicSupplierManager ?? raw.clinic_supplier_manager ?? raw.manager;
  const ptRaw = raw.path_type ?? raw.pathType;
  let pathType: PurchasePathDetail["pathType"] = "OTHER";
  if (typeof ptRaw === "string") {
    const u = ptRaw.toUpperCase();
    if (u === "MANAGER" || u === "SITE" || u === "OTHER") {
      pathType = u as PurchasePathDetail["pathType"];
    }
  }
  return {
    id: raw.id,
    pathType,
    sortOrder:
      typeof raw.sort_order === "number"
        ? raw.sort_order
        : typeof raw.sortOrder === "number"
          ? raw.sortOrder
          : 0,
    isDefault: raw.is_default ?? raw.isDefault,
    siteName: raw.site_name ?? raw.siteName ?? null,
    siteUrl: raw.site_url ?? raw.siteUrl ?? null,
    normalizedDomain: raw.normalized_domain ?? raw.normalizedDomain ?? null,
    otherText: raw.other_text ?? raw.otherText ?? null,
    clinicSupplierManagerId:
      raw.clinic_supplier_manager_id ?? raw.clinicSupplierManagerId ?? null,
    manager: m
      ? {
          id: m.id,
          companyName: m.company_name ?? m.companyName ?? "",
          name: m.name ?? "",
          position: m.position ?? null,
          phoneNumber: m.phone_number ?? m.phoneNumber ?? null,
          platformLinked:
            typeof m.platformLinked === "boolean"
              ? m.platformLinked
              : !!(m.linked_supplier_manager_id ?? m.linkedSupplierManagerId),
          businessNumber: m.business_number ?? m.businessNumber ?? null,
          companyPhone: m.company_phone ?? m.companyPhone ?? null,
          companyEmail: m.company_email ?? m.companyEmail ?? null,
          companyAddress: m.company_address ?? m.companyAddress ?? null,
          email1: m.email1 ?? null,
          email2: m.email2 ?? null,
          responsibleProducts: Array.isArray(
            m.responsible_products ?? m.responsibleProducts
          )
            ? (m.responsible_products ?? m.responsibleProducts)
            : [],
          responsibleRegions: Array.isArray(
            m.responsible_regions ?? m.responsibleRegions
          )
            ? (m.responsible_regions ?? m.responsibleRegions)
            : [],
          memo: m.memo ?? null,
        }
      : null,
  };
}

/** Detail GET ichidagi purchasePaths ba'zan to'liq emas — list API bilan id bo'yicha birlashtiramiz. */
async function mergePurchasePathsForProduct(
  apiUrl: string,
  productId: string,
  embeddedRows: any[]
): Promise<PurchasePathDetail[]> {
  const { apiGet } = await import("../../../lib/api");
  const embedded = (embeddedRows ?? []).map((r) => mapPurchasePathApiRow(r));
  const byId = new Map<string, PurchasePathDetail>();
  for (const p of embedded) {
    if (p.id) byId.set(p.id, p);
  }
  try {
    const list = await apiGet<any[]>(
      `${apiUrl}/products/${productId}/purchase-paths`
    );
    if (Array.isArray(list)) {
      for (const row of list) {
        const p = mapPurchasePathApiRow(row);
        if (p.id) byId.set(p.id, p);
      }
    }
  } catch {
    /* faqat embedded */
  }
  return Array.from(byId.values()).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [batches, setBatches] = useState<ProductDetail["batches"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [managerSupplierDetailModal, setManagerSupplierDetailModal] =
    useState<PurchasePathDetail | null>(null);

  const purchasePathGroups = useMemo(() => {
    const paths = product?.purchasePaths ?? [];
    const manager = paths.filter((p) => p.pathType === "MANAGER");
    const site = paths.filter((p) => p.pathType === "SITE");
    const other = paths.filter((p) => p.pathType === "OTHER");
    return {
      manager,
      site,
      other,
      rawCount: paths.length,
    };
  }, [product?.purchasePaths]);

  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [batchHistoryMonths, setBatchHistoryMonths] = useState(3);
  const [batchHistoryList, setBatchHistoryList] = useState<any[]>([]);
  const [loadingBatchHistory, setLoadingBatchHistory] = useState(false);

  const [editingBatch, setEditingBatch] = useState<{
    batch: NonNullable<ProductDetail["batches"]>[number];
    product: ProductDetail;
  } | null>(null);
  const [batchEditForm, setBatchEditForm] = useState({
    qty: 0,
    expiryDate: "",
    manufactureDate: "",
    purchasePrice: 0,
    storage: "",
    reasonForModification: "",
    inboundManager: "",
  });
  const [submittingBatchEdit, setSubmittingBatchEdit] = useState(false);
  const [showBatchEditStorageSuggestions, setShowBatchEditStorageSuggestions] =
    useState(false);
  const [showBatchEditStaffSuggestions, setShowBatchEditStaffSuggestions] =
    useState(false);

  const [recentStorageLocations, setRecentStorageLocations] = useState<
    string[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("inbound_recent_storage_locations");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [recentInboundStaff, setRecentInboundStaff] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("inbound_recent_inbound_staff");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const addRecentBatchValues = useCallback(
    (payload: { storageLocation?: string; inboundManager?: string }) => {
      const add = (
        key: string,
        setter: React.Dispatch<React.SetStateAction<string[]>>,
        value: string
      ) => {
        const v = value.trim();
        if (!v) return;
        setter((prev) => {
          const next = [v, ...prev.filter((x) => x !== v)].slice(0, 10);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(key, JSON.stringify(next));
            } catch (_) {}
          }
          return next;
        });
      };
      if (payload.storageLocation)
        add(
          "inbound_recent_storage_locations",
          setRecentStorageLocations,
          payload.storageLocation
        );
      if (payload.inboundManager)
        add(
          "inbound_recent_inbound_staff",
          setRecentInboundStaff,
          payload.inboundManager
        );
    },
    []
  );

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

        const pathRows: any[] = Array.isArray(data.purchasePaths)
          ? data.purchasePaths
          : Array.isArray(data.purchase_paths)
            ? data.purchase_paths
            : [];
        const purchasePaths = await mergePurchasePathsForProduct(
          apiUrl,
          params.id,
          pathRows
        );

        const formattedProduct: ProductDetail = {
          id: data.id,
          productName: data.productName || data.name,
          brand: data.brand,
          barcode: data.barcode || null,
          barcodes: data.barcodes || [],
          productImage: formattedImageUrl,

          category: data.category,
          status: data.status,
          currentStock:
            data.currentStock !== undefined
              ? data.currentStock
              : data.current_stock,
          inboundQty:
            data.inboundQty !== undefined
              ? data.inboundQty
              : data.inbound_qty || null,
          minStock:
            data.minStock !== undefined ? data.minStock : data.min_stock,
          unit: data.unit,
          purchasePrice: data.purchasePrice || data.purchase_price,
          taxRate: data.taxRate ?? data.tax_rate ?? 0,
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
          hasExpiryPeriod:
            data.hasExpiryPeriod ?? data.has_expiry_period ?? false,
          batches: data.batches,
          purchasePaths,
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
            storage: batch.보관위치 ?? batch.storage ?? null,
            qty: batch["입고 수량"] ?? batch.qty ?? 0,
            inbound_qty: batch.inbound_qty ?? null,
            unit: batch.unit ?? null,
            expiry_date: batch.유효기간 ?? batch.expiry_date ?? null,
            purchase_price: batch.purchase_price ?? null,
            sale_price: batch.sale_price ?? null,
            manufacture_date: batch.manufacture_date ?? null,
            created_at: batch.created_at || new Date().toISOString(),
            is_separate_purchase: batch.is_separate_purchase ?? false,
            reason_for_modification: batch.reason_for_modification ?? null,
            inbound_manager: batch.inbound_manager ?? null,
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

  useEffect(() => {
    if (!showBatchHistory || !params?.id) return;
    const load = async () => {
      setLoadingBatchHistory(true);
      try {
        const { apiGet } = await import("../../../lib/api");
        const data = await apiGet<any[]>(
          `${apiUrl}/products/${params.id}/batches/history?months=${batchHistoryMonths}`
        );
        setBatchHistoryList(Array.isArray(data) ? data : []);
      } catch {
        setBatchHistoryList([]);
      } finally {
        setLoadingBatchHistory(false);
      }
    };
    load();
  }, [showBatchHistory, apiUrl, params?.id, batchHistoryMonths]);

  if (!loading && !product) {
    notFound();
  }

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              제품 상세 정보
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/inbound"
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
                          sessionStorage.setItem(
                            "inbound_force_refresh",
                            "true"
                          );
                          window.dispatchEvent(
                            new CustomEvent("productDeleted", {
                              detail: { productId: params.id },
                            })
                          );
                        }

                        alert("제품이 성공적으로 삭제되었습니다.");
                        router.push("/inbound");
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
              onPurchasePathsUpdated={(paths) => {
                setProduct((p) => (p ? { ...p, purchasePaths: paths } : p));
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
                          label="제조사"
                          value={product.brand || "—"}
                        />
                        <ReadOnlyField
                          label="카테고리"
                          value={product.category || "—"}
                        />
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            바코드 번호
                          </span>
                          {product.barcodes && product.barcodes.length > 0 ? (
                            product.barcodes.map((b, idx) => (
                              <div
                                key={b.id ?? idx}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                              >
                                <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-900/30 dark:text-sky-300">
                                  {b.barcode_package_type}
                                </span>
                                <span className="text-sm text-slate-700 dark:text-slate-200">
                                  {b.gtin}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              {product.barcode || "—"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 배치 목록 Section */}
              {batches && Array.isArray(batches) && batches.length > 0 && (
                <>
                  <h2 className="flex items-center justify-between gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <span className="flex items-center gap-3">
                      <BoxIcon className="h-5 w-5 text-slate-500" />
                      배치 목록
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBatchHistory(true)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      배치 이력
                    </button>
                  </h2>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="space-y-3">
                      {batches.map((batch) => (
                        <div
                          key={batch.id}
                          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                                배치:
                              </span>
                              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                                {batch.batch_no}
                              </span>
                              {batch.is_separate_purchase && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  별도 구매
                                </span>
                              )}
                              {batch.is_separate_purchase &&
                                batch.reason_for_modification && (
                                  <span
                                    className="inline-flex max-w-[200px] truncate rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                    title={batch.reason_for_modification}
                                  >
                                    수정 사유: {batch.reason_for_modification}
                                  </span>
                                )}
                            </div>
                            {batch.is_separate_purchase && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBatch({
                                    batch,
                                    product: product!,
                                  });
                                  setBatchEditForm({
                                    qty: batch.qty ?? 0,
                                    expiryDate:
                                      batch.expiry_date
                                        ?.toString()
                                        .split("T")[0] ?? "",
                                    manufactureDate:
                                      batch.manufacture_date
                                        ?.toString()
                                        .split("T")[0] ?? "",
                                    purchasePrice: batch.purchase_price ?? 0,
                                    storage: batch.storage ?? "",
                                    reasonForModification:
                                      batch.reason_for_modification ?? "",
                                    inboundManager: batch.inbound_manager ?? "",
                                  });
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                수정하기
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            {batch.inbound_qty && (
                              <span className="inline-flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400">
                                입고수량: {batch.inbound_qty.toLocaleString()}{" "}
                                {batch.unit ?? product?.unit ?? "EA"}
                              </span>
                            )}
                            {batch.storage && (
                              <span className="inline-flex items-center gap-1">
                                <WarehouseIcon className="h-3.5 w-3.5" />
                                보관위치: {batch.storage}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              입고 날짜:{" "}
                              {
                                new Date(batch.created_at)
                                  .toISOString()
                                  .split("T")[0]
                              }
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
                              {batch.unit ?? product?.unit ?? "EA"}
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
                {(product.capacityPerProduct || product.usageCapacity) && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {product.capacityPerProduct && (
                      <ReadOnlyField
                        label="제품 용량"
                        value={`${product.capacityPerProduct} ${product.capacityUnit || "EA"}`}
                      />
                    )}
                    {product.usageCapacity && (
                      <ReadOnlyField
                        label="일부 사용"
                        value={`${Number(product.usageCapacity).toFixed(2)} ${product.capacityUnit || "EA"}`}
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <ReadOnlyField
                    label="최소 제품 재고"
                    value={`${(product.minStock || 0).toLocaleString()} ${product?.unit ?? "EA"}`}
                  />
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
                        ? `${product.purchasePrice.toLocaleString()} 원${product?.unit ? ` / ${product.unit}` : ""}`
                        : "—"
                    }
                  />
                  <ReadOnlyField
                    label="부기세"
                    value={
                      product.taxRate === 0.1
                        ? "부가세 별도 10% 추가"
                        : "부가세 포함"
                    }
                  />
                  {/* <ReadOnlyField
                    label="판매가"
                    value={
                      product.salePrice !== null &&
                      product.salePrice !== undefined
                        ? `${product.salePrice.toLocaleString()} 원${
                            product.usageCapacity
                              ? ` / ${product.capacityUnit || "EA"}`
                              : product.capacityPerProduct
                                ? ` / ${product.capacityUnit || "EA"}`
                                : ""
                          }`
                        : "—"
                    }
                  /> */}
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
                      label="유효기간 있음"
                      value={product.hasExpiryPeriod ? "예" : "아니오"}
                    />
                    {/* <ReadOnlyField
                      label="유효기간"
                      value={
                        product.expiryDate
                          ? new Date(product.expiryDate)
                              .toISOString()
                              .split("T")[0]
                          : "—"
                      }
                    /> */}
                    <ReadOnlyField
                      label="유효기간 임박 알림 기준"
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

              {/* 구매 경로 (read-only) */}
              <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <TruckIcon className="h-5 w-5 text-indigo-500" />
                구매 경로
              </h2>
              <div className="space-y-4">
                {purchasePathGroups.manager.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    <h3 className="mb-4 text-base font-semibold text-left text-slate-800 dark:text-slate-100">
                      담당자 경로
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-center text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <th className="pb-2 pr-3">회사명</th>
                            <th className="pb-2 pr-3">담당자 성함</th>
                            <th className="pb-2 pr-3">직함</th>
                            <th className="pb-2 pr-3">연락처</th>
                            <th className="pb-2 pr-3">플랫폼</th>
                            <th className="pb-2">액션</th>
                          </tr>
                        </thead>

                        <tbody>
                          {purchasePathGroups.manager.map((p) => (
                            <tr
                              key={p.id}
                              className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                            >
                              <td className="py-3 pr-3 align-middle font-medium text-slate-800 dark:text-slate-100">
                                {p.manager?.companyName || "—"}
                              </td>

                              <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                                {p.manager?.name || "—"}
                              </td>

                              <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                                {p.manager?.position || "—"}
                              </td>

                              <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                                {p.manager?.phoneNumber || "—"}
                              </td>

                              <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                                {!p.manager
                                  ? "—"
                                  : p.manager.platformLinked
                                    ? "연동"
                                    : "수동"}
                              </td>

                              <td className="py-3 align-middle">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setManagerSupplierDetailModal(p)
                                  }
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                                >
                                  상세보기
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {purchasePathGroups.site.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
                      사이트 경로
                    </h3>
                    <div className="grid grid-cols-[minmax(0,140px)_1fr] justify-items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <span>경로</span>
                      <span>내용</span>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {purchasePathGroups.site.map((p) => (
                        <li
                          key={p.id}
                          className="grid grid-cols-[minmax(0,140px)_1fr] justify-items-center gap-x-4 gap-y-1 py-3 text-sm"
                        >
                          <span className="text-center text-slate-600 dark:text-slate-300">
                            {p.siteName?.trim() || "사이트 경로"}
                          </span>

                          <span className="text-center break-all text-slate-800 dark:text-slate-100">
                            {p.siteUrl ||
                              p.normalizedDomain ||
                              p.siteName ||
                              "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {purchasePathGroups.other.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    <h3 className="mb-4 text-base font-semibold text-left text-slate-800 dark:text-slate-100">
                      기타 경로
                    </h3>

                    <div className="grid grid-cols-[minmax(0,140px)_1fr] justify-items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <span>경로</span>
                      <span>내용</span>
                    </div>

                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {purchasePathGroups.other.map((p) => (
                        <li
                          key={p.id}
                          className="grid grid-cols-[minmax(0,140px)_1fr] justify-items-center gap-x-4 gap-y-1 py-3 text-center text-sm"
                        >
                          <span className="text-slate-600 dark:text-slate-300">
                            기타 경로
                          </span>
                          <span className="text-slate-800 dark:text-slate-100">
                            {p.otherText?.trim() || "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {purchasePathGroups.rawCount === 0 && (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      등록된 구매 경로가 없습니다. 제품 수정에서 경로를 추가할
                      수 있습니다.
                    </p>
                    {product.supplierName && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          연결 공급업체 (기본)
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
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
                    )}
                  </>
                )}
              </div>

              {/* 보관 정보 Section */}
              {/* {(product.storageLocation ||
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
              )} */}
            </section>
          )
        ) : null}

        {/* 담당자 경로 — 공급업체 정보 (read-only) */}
        {managerSupplierDetailModal?.manager && (
          <div
            className="fixed inset-0 z-50  flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-supplier-detail-title"
            onClick={() => setManagerSupplierDetailModal(null)}
          >
            <div
              className="mr-10 w-[calc(100%-80px)] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-sky-100 bg-sky-50 px-6 py-4 dark:border-sky-900/40 dark:bg-sky-950/40">
                <div className="flex items-start justify-between gap-3">
                  <h3
                    id="manager-supplier-detail-title"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    공급업체 정보
                  </h3>
                  <button
                    type="button"
                    onClick={() => setManagerSupplierDetailModal(null)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-sky-100 dark:text-slate-400 dark:hover:bg-sky-900/50"
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
              </div>

              <div className="space-y-8 p-6">
                {(() => {
                  const mgr = managerSupplierDetailModal.manager!;
                  const show = (v: string | null | undefined) =>
                    v?.trim() ? v : "—";
                  const showList = (arr: string[] | undefined) =>
                    arr?.length ? arr.join(", ") : "—";
                  const emailLine = [mgr.email1, mgr.email2]
                    .filter((e) => e?.trim())
                    .join(" · ");
                  return (
                    <>
                      <div>
                        <h4 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          담당자 정보
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              담당자 성함
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.name)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              직함
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.position)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              핸드폰 번호
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.phoneNumber)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              이메일 주소
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {emailLine || "—"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          회사 정보
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              회사명
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.companyName)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              사업자 등록번호 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.businessNumber)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              회사 전화번호 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.companyPhone)}
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              회사 주소 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.companyAddress)}
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              회사 이메일 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {show(mgr.companyEmail)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          업무 정보
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              담당 제품 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {showList(mgr.responsibleProducts)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              담당 지역 (선택)
                            </label>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                              {showList(mgr.responsibleRegions)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          메모 (선택)
                        </label>
                        <div className="min-h-[5rem] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 whitespace-pre-wrap dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                          {show(mgr.memo)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex justify-end border-t border-slate-100 px-6 py-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setManagerSupplierDetailModal(null)}
                  className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  확인하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Batch edit modal */}
        {editingBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl ml-[320px]  rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  배치번호 {editingBatch.batch.batch_no}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-400"
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
              <form
                className="space-y-4 p-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editingBatch || submittingBatchEdit) return;
                  if (!batchEditForm.reasonForModification?.trim()) {
                    alert("수정 이유를 입력해 주세요.");
                    return;
                  }
                  if (!batchEditForm.inboundManager?.trim()) {
                    alert("입고 직원을 입력해 주세요.");
                    return;
                  }
                  const token = await getAccessToken();
                  if (!token) return;
                  setSubmittingBatchEdit(true);
                  try {
                    const tenantId = getTenantId();
                    const res = await fetch(
                      `${apiUrl}/products/${editingBatch.product.id}/batches/${editingBatch.batch.id}`,
                      {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                          "X-Tenant-Id": tenantId || "",
                        },
                        body: JSON.stringify({
                          qty: batchEditForm.qty,
                          inbound_qty: batchEditForm.qty,
                          expiry_date: batchEditForm.expiryDate || undefined,
                          manufacture_date:
                            batchEditForm.manufactureDate || undefined,
                          purchase_price: batchEditForm.purchasePrice
                            ? Number(batchEditForm.purchasePrice)
                            : undefined,
                          storage: batchEditForm.storage || undefined,
                          inbound_manager:
                            batchEditForm.inboundManager || undefined,
                          reason_for_modification:
                            batchEditForm.reasonForModification || undefined,
                        }),
                      }
                    );
                    if (!res.ok) throw new Error(await res.text());
                    const { apiGet } = await import("../../../lib/api");
                    const batchesData = await apiGet<any[]>(
                      `${apiUrl}/products/${editingBatch.product.id}/batches`
                    );
                    const formattedBatches: ProductDetail["batches"] =
                      batchesData.map((batch: any) => ({
                        id: batch.id,
                        batch_no: batch.batch_no,
                        storage: batch.보관위치 ?? batch.storage ?? null,
                        qty: batch["입고 수량"] ?? batch.qty ?? 0,
                        inbound_qty: batch.inbound_qty ?? null,
                        unit: batch.unit ?? null,
                        expiry_date:
                          batch.유효기간 ?? batch.expiry_date ?? null,
                        purchase_price: batch.purchase_price ?? null,
                        sale_price: batch.sale_price ?? null,
                        manufacture_date: batch.manufacture_date ?? null,
                        created_at:
                          batch.created_at || new Date().toISOString(),
                        is_separate_purchase:
                          batch.is_separate_purchase ?? false,
                        reason_for_modification:
                          batch.reason_for_modification ?? null,
                        inbound_manager: batch.inbound_manager ?? null,
                      }));
                    setBatches(formattedBatches);
                    addRecentBatchValues({
                      storageLocation: batchEditForm.storage?.trim(),
                      inboundManager: batchEditForm.inboundManager?.trim(),
                    });
                    setEditingBatch(null);
                    alert("배치가 성공적으로 수정되었습니다.");
                  } catch (err: any) {
                    console.error(err);
                    alert(err?.message || "배치 수정에 실패했습니다.");
                  } finally {
                    setSubmittingBatchEdit(false);
                  }
                }}
              >
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    입고 수량 *
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setBatchEditForm((f) => ({
                          ...f,
                          qty: Math.max(0, f.qty - 1),
                        }))
                      }
                      className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-white dark:text-slate-800"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={batchEditForm.qty}
                      onChange={(e) =>
                        setBatchEditForm((f) => ({
                          ...f,
                          qty: Number(e.target.value) || 0,
                        }))
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBatchEditForm((f) => ({ ...f, qty: f.qty + 1 }))
                      }
                      className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-white dark:text-slate-800"
                    >
                      +
                    </button>
                    <span className="text-sm text-slate-500">
                      {editingBatch.product.unit ?? "EA"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    유효 기간 *
                  </label>
                  <input
                    type="date"
                    value={batchEditForm.expiryDate}
                    onChange={(e) =>
                      setBatchEditForm((f) => ({
                        ...f,
                        expiryDate: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    제조일 *
                  </label>
                  <input
                    type="date"
                    value={batchEditForm.manufactureDate}
                    onChange={(e) =>
                      setBatchEditForm((f) => ({
                        ...f,
                        manufactureDate: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    구매가 *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      batchEditForm.purchasePrice === 0
                        ? ""
                        : batchEditForm.purchasePrice.toLocaleString()
                    }
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, "");
                      const num =
                        raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                      setBatchEditForm((f) => ({ ...f, purchasePrice: num }));
                    }}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    전구매가{" "}
                    {(
                      editingBatch.batch as any
                    ).purchase_price?.toLocaleString() ?? "0"}{" "}
                    / {editingBatch.product.unit ?? "EA"}
                  </p>
                </div>
                <div className="relative">
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    보관 위치 *
                  </label>
                  <input
                    type="text"
                    value={batchEditForm.storage}
                    onChange={(e) =>
                      setBatchEditForm((f) => ({
                        ...f,
                        storage: e.target.value,
                      }))
                    }
                    onFocus={() => setShowBatchEditStorageSuggestions(true)}
                    onBlur={() =>
                      setTimeout(
                        () => setShowBatchEditStorageSuggestions(false),
                        200
                      )
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                  />
                  {showBatchEditStorageSuggestions &&
                    recentStorageLocations.length > 0 && (
                      <ul
                        className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {recentStorageLocations.map((loc) => (
                          <li
                            key={loc}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setBatchEditForm((f) => ({ ...f, storage: loc }));
                              setShowBatchEditStorageSuggestions(false);
                            }}
                            className="cursor-pointer px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {loc}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    수정 이유 *
                  </label>
                  <input
                    type="text"
                    value={batchEditForm.reasonForModification}
                    onChange={(e) =>
                      setBatchEditForm((f) => ({
                        ...f,
                        reasonForModification: e.target.value,
                      }))
                    }
                    placeholder="수정 이유를 입력하세요"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                  />
                </div>
                <div className="relative">
                  <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    입고 직원 *
                  </label>
                  <input
                    type="text"
                    value={batchEditForm.inboundManager}
                    onChange={(e) =>
                      setBatchEditForm((f) => ({
                        ...f,
                        inboundManager: e.target.value,
                      }))
                    }
                    onFocus={() => setShowBatchEditStaffSuggestions(true)}
                    onBlur={() =>
                      setTimeout(
                        () => setShowBatchEditStaffSuggestions(false),
                        200
                      )
                    }
                    placeholder="이름 입력"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-800 dark:border-slate-500 dark:bg-white dark:text-slate-800"
                  />
                  {showBatchEditStaffSuggestions &&
                    recentInboundStaff.length > 0 && (
                      <ul
                        className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {recentInboundStaff.map((name) => (
                          <li
                            key={name}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setBatchEditForm((f) => ({
                                ...f,
                                inboundManager: name,
                              }));
                              setShowBatchEditStaffSuggestions(false);
                            }}
                            className="cursor-pointer px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={
                      submittingBatchEdit ||
                      !batchEditForm.reasonForModification?.trim() ||
                      !batchEditForm.inboundManager?.trim()
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingBatchEdit ? "저장 중..." : "저장하기"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Batch history modal */}
        {showBatchHistory && (
          <div className="fixed inset-0  z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-5xl max-h-[85vh] ml-[320px] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  배치 이력 (최근 {batchHistoryMonths}개월)
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={batchHistoryMonths}
                    onChange={(e) =>
                      setBatchHistoryMonths(Number(e.target.value))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value={1}>1개월</option>
                    <option value={3}>3개월</option>
                    <option value={6}>6개월</option>
                    <option value={12}>12개월</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowBatchHistory(false)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-400"
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
              </div>
              <div className="flex-1 overflow-auto p-6">
                {loadingBatchHistory ? (
                  <p className="text-sm text-slate-500">로딩 중...</p>
                ) : batchHistoryList.length === 0 ? (
                  <p className="text-sm text-slate-500">이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {batchHistoryList.map((batch: any) => (
                      <div
                        key={batch.id}
                        className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-800 dark:text-white">
                            {batch.batch_no}
                          </span>
                          {batch.is_separate_purchase && (
                            <span className="rounded-lg bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                              별도 구매
                            </span>
                          )}
                          {batch.reason_for_modification && (
                            <span
                              className="max-w-[200px] truncate rounded-lg bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                              title={batch.reason_for_modification}
                            >
                              수정 사유: {batch.reason_for_modification}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex flex-wrap items-center gap-x-4">
                            {(batch.보관위치 ?? batch.storage) ? (
                              <span>
                                보관: {batch.보관위치 ?? batch.storage}
                              </span>
                            ) : null}
                            <span>
                              입고 날짜:{" "}
                              {batch.created_at
                                ? new Date(batch.created_at)
                                    .toISOString()
                                    .split("T")[0]
                                : "-"}
                            </span>
                            {(batch.유효기간 ?? batch.expiry_date) ? (
                              <span>
                                유효기간: {batch.유효기간 ?? batch.expiry_date}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-x-4 ml-auto">
                            <span>
                              입고 수량:{" "}
                              {(
                                batch["입고 수량"] ??
                                batch.inbound_qty ??
                                batch.qty ??
                                0
                              ).toLocaleString()}{" "}
                              {batch.unit ?? product?.unit ?? "EA"}
                            </span>
                            {/* <span>
                              현재 수량: {(batch.qty ?? 0).toLocaleString()}{" "}
                              {batch.unit ?? product?.unit ?? "EA"}
                            </span> */}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
  onPurchasePathsUpdated?: (paths: PurchasePathDetail[]) => void;
}

function ProductEditForm({
  product,
  apiUrl,
  onCancel,
  onSuccess,
  onPurchasePathsUpdated,
}: ProductEditFormProps) {
  const unitOptions = [
    "cc",
    "ml",
    "unit",
    "mg",
    "vial",
    "bottel",
    "shot",
    "ea",
    "box",
    "set",
    "roll",
  ];

  /** 사용 단위 dropdown: faqat shu qiymatlar DB usage_capacity ga yoziladi */
  const USAGE_CAPACITY_OPTIONS = [0.1, 0.5, 1, 10, 100] as const;

  const [loading, setLoading] = useState(false);

  // Supplier state
  const [supplierViewMode, setSupplierViewMode] = useState<
    "search" | "table" | "results"
  >("search");
  const [supplierSearchCompanyName, setSupplierSearchCompanyName] =
    useState("");
  const [supplierSearchManagerName, setSupplierSearchManagerName] =
    useState("");
  const [supplierSearchPosition, setSupplierSearchPosition] = useState("");
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
  /** true = 사업자등록증/OCR 카드, false = 간단 입력 카드 (inbound/new 와 동일) */
  const [manualEntryLegacyMode, setManualEntryLegacyMode] = useState(false);

  const [purchasePathsList, setPurchasePathsList] = useState<
    PurchasePathDetail[]
  >(product.purchasePaths ?? []);
  const [purchasePathAddOpen, setPurchasePathAddOpen] = useState(false);
  const [purchasePathType, setPurchasePathType] = useState<
    "" | "MANAGER" | "SITE" | "OTHER"
  >("");
  const [sitePathInput, setSitePathInput] = useState("");
  const [otherPathInput, setOtherPathInput] = useState("");
  const [purchasePathWriteNow, setPurchasePathWriteNow] = useState(true);
  const [purchasePathSaving, setPurchasePathSaving] = useState(false);
  /** Parallel refresh (delete + add) da eski javob yangi roʻyxatni ustidan yozmasin */
  const purchasePathsRefreshGen = useRef(0);
  const [purchasePathEditModal, setPurchasePathEditModal] = useState<
    | { kind: "SITE" | "OTHER"; path: PurchasePathDetail }
    | { kind: "MANAGER"; path: PurchasePathDetail }
    | null
  >(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteUrl, setEditSiteUrl] = useState("");
  const [editOtherText, setEditOtherText] = useState("");

  // Faqat boshqa mahsulotga oʻtganda sinxronlash — `product.purchasePaths` har yangilanishida
  // mahalliy roʻyxatni (delete/add keyingi) eski parent state bilan ustma-ust qoʻymaymiz.
  useEffect(() => {
    purchasePathsRefreshGen.current += 1;
    setPurchasePathsList(product.purchasePaths ?? []);
  }, [product.id]);

  useEffect(() => {
    if (!purchasePathEditModal) return;
    if (purchasePathEditModal.kind === "SITE") {
      const p = purchasePathEditModal.path;
      setEditSiteName(p.siteName?.trim() ?? "");
      setEditSiteUrl((p.siteUrl || p.normalizedDomain || "").trim());
    } else if (purchasePathEditModal.kind === "OTHER") {
      setEditOtherText(purchasePathEditModal.path.otherText?.trim() ?? "");
    }
  }, [purchasePathEditModal]);

  // New supplier form state
  const [newSupplierForm, setNewSupplierForm] = useState({
    companyName: "",
    position: "",
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
  const [showTaxDropdown, setShowTaxDropdown] = useState(false);

  const manualSupplierFormReady = useMemo(() => {
    if (!showNewSupplierModal) return true;
    const digits = pendingSupplierPhone.replace(/\D/g, "");
    const phoneOk = /^010\d{8}$/.test(digits);
    if (
      !supplierSearchManagerName?.trim() ||
      !newSupplierForm.companyName?.trim() ||
      !phoneOk
    ) {
      return false;
    }
    if (!manualEntryLegacyMode && !supplierSearchPosition?.trim()) {
      return false;
    }
    if (certificateUrl && isBusinessValid !== true) {
      return false;
    }
    return true;
  }, [
    showNewSupplierModal,
    manualEntryLegacyMode,
    supplierSearchManagerName,
    pendingSupplierPhone,
    newSupplierForm.companyName,
    supplierSearchPosition,
    certificateUrl,
    isBusinessValid,
  ]);

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
          clinicSupplierManagerId: product.supplierId || undefined,
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
    currentStockUnit: product.unit || unitOptions[0] || "cc",
    minStockUnit: "box",
    purchasePriceUnit: "box",
    capacityUnit: product.capacityUnit || unitOptions[0] || "cc",
    usageCapacityUnit: product.capacityUnit || unitOptions[0] || "cc",
    taxRate: (product as any).taxRate ?? (null as number | null),
    salePriceUnit: product.capacityUnit || unitOptions[0] || "cc",
    purchasePrice: product.purchasePrice?.toString() || "",
    salePrice: product.salePrice?.toString() || "",
    currentStock: product.inboundQty?.toString() || "",
    minStock: product.minStock?.toString() || "0",
    capacityPerProduct: product.capacityPerProduct?.toString() || "",
    usageCapacity: (() => {
      const opts = [0.1, 0.5, 1, 10, 100];
      const v = product.usageCapacity;
      if (v == null) return "";
      const n = Number(v);
      return opts.includes(n) ? String(n) : "1";
    })(),
    enableUsageCapacity: !(
      Number(product.capacityPerProduct) === 1 &&
      Number(product.usageCapacity) === 1
    ),
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
    hasExpiryPeriod: product.hasExpiryPeriod ?? false,
    barcodePackageType:
      (product.barcodes && product.barcodes.length > 0
        ? product.barcodes[0].barcode_package_type
        : null) ?? "BOX",
  });

  // GTIN parse helper for additional barcode inputs
  const parseGtinInputEdit = async (
    raw: string,
    onResult: (value: string) => void
  ) => {
    const cleaned = raw.replace(/[^\x20-\x7E]/g, "");
    if (!cleaned.trim()) return;
    if (/^\d{12,15}$/.test(cleaned)) {
      onResult(cleaned.padStart(14, "0"));
      return;
    }
    if (cleaned.startsWith("01") && cleaned.length >= 16) {
      try {
        const { parseGS1Barcode } =
          await import("../../../utils/barcodeParser");
        const parsed = parseGS1Barcode(cleaned);
        if (parsed.gtin) onResult(parsed.gtin);
      } catch (_) {}
    }
  };

  const BARCODE_PACKAGE_TYPES_EDIT = [
    { value: "BOX", label: "BOX (박스)" },
    { value: "AMPULE", label: "AMPULE (앰플)" },
    { value: "VIAL", label: "VIAL (바이알)" },
    { value: "UNIT", label: "UNIT (낱개)" },
    { value: "SYRINGE", label: "SYRINGE (주사기)" },
    { value: "BOTTLE", label: "BOTTLE (병)" },
    { value: "OTHER", label: "OTHER (기타)" },
  ] as const;

  const [additionalBarcodesEdit, setAdditionalBarcodesEdit] = useState<
    Array<{ gtin: string; barcode_package_type: string }>
  >(
    product.barcodes && product.barcodes.length > 1
      ? product.barcodes.slice(1).map((b) => ({
          gtin: b.gtin,
          barcode_package_type: b.barcode_package_type,
        }))
      : []
  );

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

      // 제품 용량 unit o'zgarganda: 사용 단위 unit ham bir xil (read-only), 판매가 unit ham (checkbox o'chirilgan bo'lsa)
      if (field === "capacityUnit") {
        newData.usageCapacityUnit = value;
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
          // Checkbox o'chirilganda: 제품 용량 = 1 box, 일부 사용 = 1 box (auto)
          newData.capacityPerProduct = "1";
          newData.capacityUnit = "box";
          newData.usageCapacity = "1";
          newData.usageCapacityUnit = "box";
          newData.salePriceUnit = "box";
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
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      const tenantId = getTenantId();

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
          clinicSupplierManagerId:
            item.clinicSupplierManagerId || item.managerId || item.id || "",
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
      console.error("❌ Error searching suppliers by phone:", error);
      setSupplierSearchResults([]);
      setPhoneSearchNoResults(true);
      setPendingSupplierPhone(supplierSearchPhoneNumber);
      setShowNewSupplierConfirmModal(true);
    } finally {
      setSupplierSearchLoading(false);
    }
  };

  const handleSupplierSelect = (result: any) => {
    setSelectedSupplierDetails({
      ...result,
      clinicSupplierManagerId:
        result.clinicSupplierManagerId || result.managerId || result.supplierId,
    });
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

  const refreshPurchasePathsList = useCallback(async () => {
    const gen = ++purchasePathsRefreshGen.current;
    try {
      const { apiGet } = await import("../../../lib/api");
      const rows = await apiGet<any[]>(
        `${apiUrl}/products/${product.id}/purchase-paths`
      );
      if (gen !== purchasePathsRefreshGen.current) return;
      const mapped = (rows || []).map(mapPurchasePathApiRow);
      setPurchasePathsList(mapped);
      onPurchasePathsUpdated?.(mapped);
    } catch (e) {
      console.error("Failed to load purchase paths", e);
    }
  }, [apiUrl, product.id, onPurchasePathsUpdated]);

  const purchasePathEditGroups = useMemo(() => {
    return {
      manager: purchasePathsList.filter((p) => p.pathType === "MANAGER"),
      site: purchasePathsList.filter((p) => p.pathType === "SITE"),
      other: purchasePathsList.filter((p) => p.pathType === "OTHER"),
    };
  }, [purchasePathsList]);

  const setDefaultPurchasePath = async (pathId: string) => {
    if (purchasePathSaving) return;
    const current = purchasePathsList.find((p) => p.id === pathId);
    if (current?.isDefault) return;
    setPurchasePathSaving(true);
    try {
      const { apiPut } = await import("../../../lib/api");
      await apiPut(
        `${apiUrl}/products/${product.id}/purchase-paths/${pathId}/default`,
        {}
      );
      await refreshPurchasePathsList();
    } catch (err: any) {
      alert(err?.message || "기본 경로 설정에 실패했습니다.");
    } finally {
      setPurchasePathSaving(false);
    }
  };

  const savePurchasePathEdit = async () => {
    if (!purchasePathEditModal) return;
    const { path, kind } = purchasePathEditModal;
    if (kind === "MANAGER") return;
    setPurchasePathSaving(true);
    try {
      const { apiRequest } = await import("../../../lib/api");
      let siteUrlBody = editSiteUrl.trim() || undefined;
      if (
        siteUrlBody &&
        !/^https?:\/\//i.test(siteUrlBody) &&
        (/^www\./i.test(siteUrlBody) ||
          /\.[a-z0-9-]+\.[a-z]{2,}/i.test(siteUrlBody))
      ) {
        siteUrlBody = `https://${siteUrlBody.replace(/^https?:\/\//i, "")}`;
      }
      const body =
        kind === "SITE"
          ? {
              siteName: editSiteName.trim() || undefined,
              siteUrl: siteUrlBody,
            }
          : { otherText: editOtherText.trim() };
      if (kind === "SITE" && !editSiteName.trim() && !editSiteUrl.trim()) {
        alert("사이트 이름 또는 URL 중 하나는 입력해 주세요.");
        setPurchasePathSaving(false);
        return;
      }
      if (kind === "OTHER" && !editOtherText.trim()) {
        alert("내용을 입력해 주세요.");
        setPurchasePathSaving(false);
        return;
      }
      const res = await apiRequest(
        `${apiUrl}/products/${product.id}/purchase-paths/${path.id}`,
        { method: "PATCH", body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "수정에 실패했습니다.");
      }
      setPurchasePathEditModal(null);
      await refreshPurchasePathsList();
    } catch (err: any) {
      alert(err?.message || "수정에 실패했습니다.");
    } finally {
      setPurchasePathSaving(false);
    }
  };

  const managerPathDedupeKey = (
    details: NonNullable<typeof selectedSupplierDetails>
  ) => {
    const id = (
      details.clinicSupplierManagerId ||
      details.managerId ||
      details.supplierId ||
      ""
    )
      .trim()
      .toLowerCase();
    if (id) return `id:${id}`;
    const phone = String(details.phoneNumber || "").replace(/\D/g, "");
    const company = String(details.companyName || "")
      .trim()
      .toLowerCase();
    const name = String(details.managerName || "")
      .trim()
      .toLowerCase();
    return `k:${company}|${name}|${phone}`;
  };

  const managerPathRowDedupeKey = (p: PurchasePathDetail) => {
    if (p.pathType !== "MANAGER") return null;
    const id = (p.clinicSupplierManagerId || p.manager?.id || "")
      .trim()
      .toLowerCase();
    if (id) return `id:${id}`;
    const m = p.manager;
    if (!m) return null;
    const phone = String(m.phoneNumber || "").replace(/\D/g, "");
    const company = String(m.companyName || "")
      .trim()
      .toLowerCase();
    const name = String(m.name || "")
      .trim()
      .toLowerCase();
    return `k:${company}|${name}|${phone}`;
  };

  const registerManagerPurchasePath = async () => {
    if (!selectedSupplierDetails) {
      alert("담당자를 검색하여 선택한 뒤 등록할 수 있습니다.");
      return;
    }
    const mgrId =
      selectedSupplierDetails.clinicSupplierManagerId ||
      selectedSupplierDetails.managerId ||
      selectedSupplierDetails.supplierId;
    if (!mgrId) {
      alert("담당자를 검색하여 선택한 뒤 등록할 수 있습니다.");
      return;
    }
    const newKey = managerPathDedupeKey(selectedSupplierDetails);
    if (
      purchasePathsList.some((p) => {
        if (p.pathType !== "MANAGER") return false;
        const rowKey = managerPathRowDedupeKey(p);
        return rowKey != null && rowKey === newKey;
      })
    ) {
      alert("이미 동일한 담당자 경로가 등록되어 있습니다.");
      return;
    }
    setPurchasePathSaving(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/products/${product.id}/purchase-paths`, {
        pathType: "MANAGER",
        clinicSupplierManagerId: mgrId,
      });
      await refreshPurchasePathsList();
      alert("구매 경로가 등록되었습니다.");
      setPurchasePathType("");
      setPurchasePathAddOpen(false);
    } catch (err: any) {
      const msg =
        err?.response?.message ||
        err?.message ||
        "구매 경로 등록에 실패했습니다.";
      alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setPurchasePathSaving(false);
    }
  };

  const registerSitePurchasePath = async () => {
    const v = sitePathInput.trim();
    if (!v) {
      alert("사이트 이름 또는 URL을 입력해주세요.");
      return;
    }
    const asUrl = /^https?:\/\//i.test(v)
      ? v
      : /^www\./i.test(v) || /\.[a-z0-9-]+\.[a-z]{2,}/i.test(v)
        ? `https://${v.replace(/^https?:\/\//i, "")}`
        : null;
    setPurchasePathSaving(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/products/${product.id}/purchase-paths`, {
        pathType: "SITE",
        ...(asUrl ? { siteUrl: asUrl } : { siteName: v }),
      });
      await refreshPurchasePathsList();
      setSitePathInput("");
      alert("구매 경로가 등록되었습니다.");
      setPurchasePathType("");
      setPurchasePathAddOpen(false);
    } catch (err: any) {
      const msg =
        err?.response?.message ||
        err?.message ||
        "구매 경로 등록에 실패했습니다.";
      alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setPurchasePathSaving(false);
    }
  };

  const registerOtherPurchasePath = async () => {
    const v = otherPathInput.trim();
    if (!v) {
      alert("구매 경로 내용을 입력해주세요.");
      return;
    }
    setPurchasePathSaving(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/products/${product.id}/purchase-paths`, {
        pathType: "OTHER",
        otherText: v,
      });
      await refreshPurchasePathsList();
      setOtherPathInput("");
      alert("구매 경로가 등록되었습니다.");
      setPurchasePathType("");
      setPurchasePathAddOpen(false);
    } catch (err: any) {
      const msg =
        err?.response?.message ||
        err?.message ||
        "구매 경로 등록에 실패했습니다.";
      alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setPurchasePathSaving(false);
    }
  };

  const deletePurchasePath = async (pathId: string) => {
    if (!confirm("이 구매 경로를 삭제할까요?")) return;
    setPurchasePathSaving(true);
    try {
      const { apiDelete } = await import("../../../lib/api");
      await apiDelete(
        `${apiUrl}/products/${product.id}/purchase-paths/${pathId}`
      );
      await refreshPurchasePathsList();
    } catch (err: any) {
      alert(err?.message || "삭제에 실패했습니다.");
    } finally {
      setPurchasePathSaving(false);
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
        process.env.NEXT_PUBLIC_SUPPLIER_API_URL ||
        "https://api-supplier.jaclit.com";
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

    // ✅ Validate manual supplier form if active (inbound/new 와 동일 규칙)
    if (showNewSupplierModal) {
      if (
        !supplierSearchManagerName?.trim() ||
        !pendingSupplierPhone?.trim() ||
        !newSupplierForm.companyName?.trim()
      ) {
        alert("담당자 이름, 핸드폰 번호, 회사명은 필수 입력 사항입니다.");
        setLoading(false);
        return;
      }
      const phoneDigits = pendingSupplierPhone.replace(/\D/g, "");
      if (!/^010\d{8}$/.test(phoneDigits)) {
        alert("휴대폰 번호 형식이 올바르지 않습니다 (예: 01012345678)");
        setLoading(false);
        return;
      }
      if (!manualEntryLegacyMode && !supplierSearchPosition?.trim()) {
        alert("직함을 선택해주세요.");
        setLoading(false);
        return;
      }
      if (certificateUrl && isBusinessValid !== true) {
        alert(
          "사업자 정보 확인이 필요합니다. 사업자등록증을 다시 업로드하거나 확인해주세요."
        );
        setLoading(false);
        return;
      }
      const brnTrim = newSupplierForm.businessNumber.trim();
      if (brnTrim && !/^\d{3}-\d{2}-\d{5}$/.test(brnTrim)) {
        alert("사업자 등록번호 형식이 올바르지 않습니다 (예: 123-45-67890)");
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      const { apiPut } = await import("../../../lib/api");
      const payload: any = {
        name: formData.name,
        brand: formData.brand,
        barcode: formData.barcode || undefined,
        barcodePackageType: formData.barcodePackageType || "BOX",
        additionalBarcodes: additionalBarcodesEdit
          .filter((b) => b.gtin.trim())
          .map((b) => ({
            gtin: b.gtin.trim(),
            barcode_package_type: b.barcode_package_type,
          })),
        category: formData.category,
        status: formData.status,
        unit: formData.unit || undefined,
        purchasePrice: formData.purchasePrice
          ? Number(formData.purchasePrice)
          : undefined,
        salePrice: formData.salePrice ? Number(formData.salePrice) : undefined,
        taxRate: formData.taxRate ?? undefined,
      };

      // 제품 재고 수량: edit form'dan olib tashlandi — yuborilmaydi

      // minStock faqat o'zgartirilgan bo'lsa yuborilamiz
      if (formData.minStock !== "" && formData.minStock !== undefined) {
        const newMinStock = Number(formData.minStock);
        if (newMinStock !== product.minStock) {
          payload.minStock = newMinStock;
        }
      }

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

      // Image handling - faqat o'zgargan bo'lsa yuborish
      if (formData.imageFile) {
        // Base64'ni yuborish - backend file sifatida saqlaydi va URL qaytaradi
        payload.image = formData.image;
      } else if (formData.image === "" || formData.image === null) {
        // Image o'chirilmoqda
        payload.image = null;
      }
      // Agar imageFile yo'q va image o'zgarmagan bo'lsa, hech narsa yubormaydi (backend eski image'ni saqlaydi)

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

      // 유효기간 설정 (DB has_expiry_period)
      payload.hasExpiryPeriod = !!formData.hasExpiryPeriod;
      if (formData.alertDays) {
        payload.alertDays = formData.alertDays.toString();
      }

      // 유효기간, 보관 위치, 입고 담당자: edit form'dan olib tashlandi — yuborilmaydi

      // ✅ Manual Supplier Information (from newSupplierForm)
      if (showNewSupplierModal && newSupplierForm.companyName) {
        const contactPhone = pendingSupplierPhone.replace(/\D/g, "");
        const brnTrim = newSupplierForm.businessNumber.trim();
        payload.suppliers = [
          {
            supplier_id: null, // Will trigger CREATE in backend
            company_name: newSupplierForm.companyName,
            ...(brnTrim ? { business_number: brnTrim } : {}),
            ...(newSupplierForm.companyPhone?.trim()
              ? { company_phone: newSupplierForm.companyPhone.trim() }
              : {}),
            ...(newSupplierForm.companyEmail?.trim()
              ? { company_email: newSupplierForm.companyEmail.trim() }
              : {}),
            ...(newSupplierForm.companyAddress?.trim()
              ? { company_address: newSupplierForm.companyAddress.trim() }
              : {}),
            contact_name: supplierSearchManagerName.trim(),
            contact_phone: contactPhone,
            contact_email: newSupplierForm.companyEmail?.trim() || undefined,
            purchase_price: formData.purchasePrice
              ? Number(formData.purchasePrice)
              : undefined,
            moq: undefined,
            lead_time_days: undefined,
            note: newSupplierForm.memo || undefined,
          },
        ];
      }
      // ✅ Supplier information (ProductSupplier table uchun)
      else if (selectedSupplierDetails && selectedSupplierDetails.companyName) {
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
      } else {
        // Don't send empty suppliers array - but check if payload.suppliers already exists
      }

      // Clear cache before update
      const { clearCache } = await import("../../../lib/api");
      clearCache(`/products/${product.id}`);
      clearCache(`/products`);

      // ✅ Set flag to force refresh inbound page when user navigates back
      if (typeof window !== "undefined") {
        sessionStorage.setItem("inbound_force_refresh", "true");
      }

      const updatedProductResponse = await apiPut<any>(
        `${apiUrl}/products/${product.id}`,
        payload
      );

      // Refresh product data after update (especially for images)
      let finalProductResponse = updatedProductResponse;
      try {
        const { apiGet } = await import("../../../lib/api");
        finalProductResponse = await apiGet<any>(
          `${apiUrl}/products/${product.id}`
        );
      } catch (refreshErr) {
        console.error("Failed to refresh product after update", refreshErr);
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
        barcode: finalProductResponse.barcode ?? product.barcode,
        productImage: formattedImageUrl,
        category: finalProductResponse.category || product.category,
        status: finalProductResponse.status || product.status,
        currentStock:
          finalProductResponse.currentStock !== undefined
            ? finalProductResponse.currentStock
            : finalProductResponse.current_stock !== undefined
              ? finalProductResponse.current_stock
              : product.currentStock,
        inboundQty:
          finalProductResponse.inboundQty !== undefined
            ? finalProductResponse.inboundQty
            : finalProductResponse.inbound_qty !== undefined
              ? finalProductResponse.inbound_qty
              : product.inboundQty,
        minStock:
          finalProductResponse.minStock !== undefined
            ? finalProductResponse.minStock
            : finalProductResponse.min_stock !== undefined
              ? finalProductResponse.min_stock
              : product.minStock,
        unit: finalProductResponse.unit || product.unit,
        purchasePrice:
          finalProductResponse.purchasePrice ||
          finalProductResponse.purchase_price ||
          product.purchasePrice,
        taxRate:
          finalProductResponse.taxRate !== undefined
            ? finalProductResponse.taxRate
            : finalProductResponse.tax_rate !== undefined
              ? finalProductResponse.tax_rate
              : product.taxRate,
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
        supplierCompanyAddress:
          finalProductResponse.supplierCompanyAddress ||
          product.supplierCompanyAddress,
        supplierBusinessNumber:
          finalProductResponse.supplierBusinessNumber ||
          product.supplierBusinessNumber,
        supplierCompanyPhone:
          finalProductResponse.supplierCompanyPhone ||
          product.supplierCompanyPhone,
        supplierCompanyEmail:
          finalProductResponse.supplierCompanyEmail ||
          product.supplierCompanyEmail,
        supplierPosition:
          finalProductResponse.supplierPosition || product.supplierPosition,
        supplierEmail2:
          finalProductResponse.supplierEmail2 || product.supplierEmail2,
        supplierResponsibleProducts:
          finalProductResponse.supplierResponsibleProducts ||
          product.supplierResponsibleProducts,
        supplierMemo: finalProductResponse.supplierMemo || product.supplierMemo,
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
        hasExpiryPeriod:
          finalProductResponse.hasExpiryPeriod ??
          (finalProductResponse as any).has_expiry_period ??
          product.hasExpiryPeriod ??
          false,
        batches: finalProductResponse.batches || product.batches,
        purchasePaths: await mergePurchasePathsForProduct(
          apiUrl,
          product.id,
          purchasePathsList
        ),
      };

      if (showNewSupplierModal) {
        setShowNewSupplierModal(false);
        setManualEntryLegacyMode(false);
        setPhoneSearchNoResults(false);
        setCertificateImage(null);
        setCertificatePreview("");
        setCertificateUrl("");
        setOcrResult(null);
        setVerificationResult(null);
        setIsBusinessValid(null);
      }

      alert("제품이 성공적으로 업데이트되었습니다.");
      onSuccess(updatedProduct);
    } catch (err: any) {
      console.error("Failed to update product", err);
      const errorMessage =
        err?.response?.message ||
        err?.response?.error ||
        err?.message ||
        err?.toString() ||
        "제품 업데이트에 실패했습니다.";
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = ["활성", "재고 부족", "만료", "단종"];

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName === "INPUT" &&
          (e.target as HTMLInputElement).type === "text"
        ) {
          e.preventDefault();
        }
      }}
    >
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
                  label="제조사"
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
                    바코드 번호
                  </label>
                  {/* Primary barcode row */}
                  <div className="flex gap-2">
                    <select
                      value={formData.barcodePackageType}
                      onChange={(e) =>
                        handleInputChange("barcodePackageType", e.target.value)
                      }
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {BARCODE_PACKAGE_TYPES_EDIT.map((pt) => (
                        <option key={pt.value} value={pt.value}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="바코드 번호 (스캔 후 포커스 아웃 시 GTIN 자동 추출)"
                      value={formData.barcode}
                      onChange={(e) =>
                        handleInputChange("barcode", e.target.value)
                      }
                      onKeyDown={async (e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        e.stopPropagation();
                        const raw = (formData.barcode || "").replace(
                          /[^\x20-\x7E]/g,
                          ""
                        );
                        if (!raw.trim()) return;
                        if (/^\d{12,14}$/.test(raw)) {
                          handleInputChange("barcode", raw.padStart(14, "0"));
                          return;
                        }
                        if (raw.startsWith("01") && raw.length >= 16) {
                          try {
                            const { parseGS1Barcode } =
                              await import("../../../utils/barcodeParser");
                            const parsed = parseGS1Barcode(raw);
                            if (parsed.gtin) {
                              handleInputChange("barcode", parsed.gtin);
                            }
                          } catch (_) {}
                        }
                      }}
                      onBlur={async () => {
                        const raw = (formData.barcode || "").replace(
                          /[^\x20-\x7E]/g,
                          ""
                        );
                        if (!raw.trim()) return;
                        if (/^\d{12,15}$/.test(raw)) {
                          handleInputChange("barcode", raw.padStart(14, "0"));
                          return;
                        }
                        if (raw.startsWith("01") && raw.length >= 16) {
                          try {
                            const { parseGS1Barcode } =
                              await import("../../../utils/barcodeParser");
                            const parsed = parseGS1Barcode(raw);
                            if (parsed.gtin) {
                              handleInputChange("barcode", parsed.gtin);
                            }
                          } catch (_) {}
                        }
                      }}
                      onPaste={async (e) => {
                        const pasted = (
                          e.clipboardData?.getData("text") || ""
                        ).replace(/[^\x20-\x7E]/g, "");
                        if (!pasted.trim()) return;
                        if (/^\d{12,15}$/.test(pasted)) {
                          e.preventDefault();
                          handleInputChange(
                            "barcode",
                            pasted.padStart(14, "0")
                          );
                          return;
                        }
                        if (pasted.startsWith("01") && pasted.length >= 16) {
                          try {
                            const { parseGS1Barcode } =
                              await import("../../../utils/barcodeParser");
                            const parsed = parseGS1Barcode(pasted);
                            if (parsed.gtin) {
                              e.preventDefault();
                              handleInputChange("barcode", parsed.gtin);
                            }
                          } catch (_) {}
                        }
                      }}
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>
                  {/* Additional barcode rows */}
                  {additionalBarcodesEdit.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select
                        value={item.barcode_package_type}
                        onChange={(e) => {
                          const updated = [...additionalBarcodesEdit];
                          updated[idx] = {
                            ...updated[idx],
                            barcode_package_type: e.target.value,
                          };
                          setAdditionalBarcodesEdit(updated);
                        }}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {BARCODE_PACKAGE_TYPES_EDIT.map((pt) => (
                          <option key={pt.value} value={pt.value}>
                            {pt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="바코드 숫자 (스캔 또는 입력)"
                        value={item.gtin}
                        onChange={(e) => {
                          const updated = [...additionalBarcodesEdit];
                          updated[idx] = {
                            ...updated[idx],
                            gtin: e.target.value,
                          };
                          setAdditionalBarcodesEdit(updated);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          e.stopPropagation();
                          const rawValue = (e.target as HTMLInputElement).value;
                          await parseGtinInputEdit(rawValue, (val) => {
                            setAdditionalBarcodesEdit((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], gtin: val };
                              return updated;
                            });
                          });
                        }}
                        onBlur={async (e) => {
                          const rawValue = e.target.value;
                          await parseGtinInputEdit(rawValue, (val) => {
                            setAdditionalBarcodesEdit((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], gtin: val };
                              return updated;
                            });
                          });
                        }}
                        onPaste={async (e) => {
                          const pasted = (
                            e.clipboardData?.getData("text") || ""
                          ).replace(/[^\x20-\x7E]/g, "");
                          if (!pasted.trim()) return;
                          if (/^\d{12,14}$/.test(pasted)) {
                            e.preventDefault();
                            setAdditionalBarcodesEdit((prev) => {
                              const updated = [...prev];
                              updated[idx] = {
                                ...updated[idx],
                                gtin: pasted.padStart(14, "0"),
                              };
                              return updated;
                            });
                            return;
                          }
                          if (pasted.startsWith("01") && pasted.length >= 16) {
                            try {
                              const { parseGS1Barcode } =
                                await import("../../../utils/barcodeParser");
                              const parsed = parseGS1Barcode(pasted);
                              if (parsed.gtin) {
                                e.preventDefault();
                                const parsedGtin = parsed.gtin;
                                setAdditionalBarcodesEdit((prev) => {
                                  const updated = [...prev];
                                  updated[idx] = {
                                    ...updated[idx],
                                    gtin: parsedGtin,
                                  };
                                  return updated;
                                });
                              }
                            } catch (_) {}
                          }
                        }}
                        className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAdditionalBarcodesEdit(
                            additionalBarcodesEdit.filter((_, i) => i !== idx)
                          )
                        }
                        className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
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
                  ))}
                  {/* Add barcode button */}
                  <button
                    type="button"
                    onClick={() =>
                      setAdditionalBarcodesEdit([
                        ...additionalBarcodesEdit,
                        { gtin: "", barcode_package_type: "BOX" },
                      ])
                    }
                    className="flex items-center gap-2 self-start rounded-xl border border-dashed border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-600 hover:bg-sky-100 transition dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
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
                    바코드 추가
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 수량 및 용량 Section (제품 재고 수량 제외 - 편집 불가) */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <InfoIcon className="h-5 w-5 text-sky-500" />
        수량 및 용량
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        {/* 제품 나누어 사용 checkbox */}
        <div className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="enableCapacityInputEdit"
            checked={formData.enableUsageCapacity}
            onChange={(e) =>
              handleInputChange("enableUsageCapacity", e.target.checked)
            }
            className="h-5 w-5 shrink-0 rounded appearance-none bg-white border border-slate-300 checked:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-900 dark:border-slate-600 relative after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:h-2.5 after:w-1.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45 after:border-r-2 after:border-b-2 after:border-black after:opacity-0 checked:after:opacity-100"
          />
          <label
            htmlFor="enableCapacityInputEdit"
            className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            제품을 나누어 사용하시나요?
          </label>
          <span className="text-xs font-medium text-sky-500">
            * 제품을 나누어 사용하는 경우 체크해주세요.
          </span>
        </div>

        {formData.enableUsageCapacity && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* 제품 용량 */}
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

            {/* 일부 사용 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  일부 사용
                </label>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  (제품을 일부만 사용하는 경우, &apos;일부 사용&apos;을 체크하고
                  사용량을 선택해주세요.)
                </label>
              </div>
              <div className="flex gap-2">
                <select
                  value={
                    formData.usageCapacity !== undefined &&
                    formData.usageCapacity !== null &&
                    formData.usageCapacity !== ""
                      ? String(formData.usageCapacity)
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    handleInputChange("usageCapacity", v ? v : "");
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">사용량 선택</option>
                  {USAGE_CAPACITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {Number(opt).toFixed(2)}
                    </option>
                  ))}
                </select>
                <div className="relative w-28 flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={formData.capacityUnit || ""}
                    className="h-11 w-full cursor-default rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    tabIndex={-1}
                    aria-label="사용 단위 (제품 용량과 동일)"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
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
                {/* <select
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
                </select> */}
                <div className="h-11 w-28 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  box
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
              <div className="w-28">
                <div className="h-11 w-28 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  box
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              부가세 포함 여부
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTaxDropdown((prev) => !prev)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <span
                  className={formData.taxRate === null ? "text-slate-400" : ""}
                >
                  {formData.taxRate === null
                    ? "부가세 선택해주세요."
                    : formData.taxRate === 0
                      ? "부가세 포함"
                      : "부가세 별도  10% 추가"}
                </span>
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
              </button>
              {showTaxDropdown && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      handleInputChange("taxRate", 0);
                      setShowTaxDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    부가세 포함
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleInputChange("taxRate", 0.1);
                      setShowTaxDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    부가세 별도&nbsp; 10% 추가
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* <div className="flex flex-col gap-2">
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
              </div>

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
                          ? `${Number(formData.usageCapacity).toFixed(2)} ${formData.usageCapacityUnit || ""}`
                          : formData.capacityPerProduct
                            ? `${formData.capacityPerProduct} ${formData.capacityUnit || ""}`
                            : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div> */}
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
              placeholder="보관 위치를 입력해 주세요.*미입력 시 제품 위치로 자동 기록됩니다"
            />
          </div>
        )}
      </div>

      {/* 유효기간 설정 Section */}
      <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <CalendarIcon className="h-5 w-5 text-emerald-500" />
        유효기간 설정
      </h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="space-y-4">
          {/* Switch: 유효기간 있음/없음 */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl dark:bg-slate-800/50">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              유효기간 있음
            </label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasExpiryPeriod}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  handleInputChange("hasExpiryPeriod", isChecked);
                  if (!isChecked) {
                    handleInputChange("alertDays", "");
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* 유효기간 임박 알림 기준 - only when 유효기간 있음 */}
          {formData.hasExpiryPeriod && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                유효기간 임박 알림 기준
              </label>
              <div className="relative">
                <select
                  value={formData.alertDays || ""}
                  onChange={(e) =>
                    handleInputChange("alertDays", e.target.value)
                  }
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
          )}
        </div>
      </div>

      {/* 구매 경로 Section */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <TruckIcon className="h-5 w-5 text-indigo-500" />
            구매 경로
          </h2>
          <button
            type="button"
            onClick={() => {
              setPurchasePathAddOpen(true);
              setPurchasePathType("");
              setSitePathInput("");
              setOtherPathInput("");
            }}
            className="rounded-lg border border-sky-500 bg-white px-3 py-1.5 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 dark:border-sky-400 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
          >
            경로 추가
          </button>
        </div>

        {purchasePathsList.length > 0 && (
          <div className="mb-4 space-y-4">
            {purchasePathEditGroups.manager.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
                  담당자 경로
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-center text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                        <th className="pb-2 pr-2 text-left">기본경로</th>
                        <th className="pb-2 pr-3">회사명</th>
                        <th className="pb-2 pr-3">담당자 성함</th>
                        <th className="pb-2 pr-3">직함</th>
                        <th className="pb-2 pr-3">연락처</th>
                        <th className="pb-2 pr-3">플랫폼</th>
                        <th className="pb-2 text-right">액션</th>
                      </tr>
                    </thead>

                    <tbody>
                      {purchasePathEditGroups.manager.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="py-3 pr-2 align-middle text-left">
                            <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                              {" "}
                              <input
                                type="radio"
                                name="productPurchasePathDefault"
                                className="h-4 w-4 shrink-0 appearance-none rounded-full border border-slate-300 bg-white checked:border-sky-600 checked:bg-white checked:shadow-[inset_0_0_0_3px_theme(colors.sky.600)]"
                                checked={!!p.isDefault}
                                disabled={purchasePathSaving}
                                onChange={() => setDefaultPurchasePath(p.id)}
                              />
                              <span className="text-xs">기본 경로</span>
                            </label>
                          </td>

                          <td className="py-3 pr-3 align-middle font-medium text-slate-800 dark:text-slate-100">
                            {p.manager?.companyName || "—"}
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            {p.manager?.name || "—"}
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            {p.manager?.position || "—"}
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            {p.manager?.phoneNumber || "—"}
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            {!p.manager
                              ? "—"
                              : p.manager.platformLinked
                                ? "연동"
                                : "수동"}
                          </td>

                          <td className="py-3 align-middle text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {" "}
                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() =>
                                  setPurchasePathEditModal({
                                    kind: "MANAGER",
                                    path: p,
                                  })
                                }
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                수정하기
                              </button>
                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() => deletePurchasePath(p.id)}
                                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchasePathEditGroups.site.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
                  사이트 경로
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-center text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                        <th className="pb-2 pr-2 text-left">기본경로</th>
                        <th className="pb-2 pr-3">경로</th>
                        <th className="pb-2 pr-3">내용</th>
                        <th className="pb-2 text-right">액션</th>
                      </tr>
                    </thead>

                    <tbody>
                      {purchasePathEditGroups.site.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="py-3 pr-2 align-middle text-left">
                            <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                              <input
                                type="radio"
                                name="productPurchasePathDefault"
                                className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-white checked:border-sky-600 checked:bg-white checked:shadow-[inset_0_0_0_3px_theme(colors.sky.600)] focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 disabled:opacity-50 dark:border-slate-500 dark:bg-white dark:checked:bg-white dark:checked:shadow-[inset_0_0_0_3px_theme(colors.sky.500)]"
                                checked={!!p.isDefault}
                                disabled={purchasePathSaving}
                                onChange={() => setDefaultPurchasePath(p.id)}
                              />
                              <span className="text-xs text-slate-700 dark:text-slate-200">
                                기본 경로
                              </span>
                              <span className="sr-only">기본 경로</span>
                            </label>
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            {p.siteName?.trim() || "사이트 경로"}
                          </td>

                          <td className="max-w-xs py-3 pr-3 align-middle break-all text-slate-800 dark:text-slate-100">
                            {p.siteUrl ||
                              p.normalizedDomain ||
                              p.siteName ||
                              "—"}
                          </td>

                          <td className="py-3 align-middle text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() =>
                                  setPurchasePathEditModal({
                                    kind: "SITE",
                                    path: p,
                                  })
                                }
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                수정하기
                              </button>

                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() => deletePurchasePath(p.id)}
                                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                aria-label="삭제"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchasePathEditGroups.other.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
                  기타 경로
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-center text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                        <th className="pb-2 pr-2 text-left">기본경로</th>
                        <th className="pb-2 pr-3">경로</th>
                        <th className="pb-2 pr-3">내용</th>
                        <th className="pb-2 text-right">액션</th>
                      </tr>
                    </thead>

                    <tbody>
                      {purchasePathEditGroups.other.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="py-3 pr-2 align-middle text-left">
                            <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                              <input
                                type="radio"
                                name="productPurchasePathDefault"
                                className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-white checked:border-sky-600 checked:bg-white checked:shadow-[inset_0_0_0_3px_theme(colors.sky.600)] focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 disabled:opacity-50 dark:border-slate-500 dark:bg-white dark:checked:bg-white dark:checked:shadow-[inset_0_0_0_3px_theme(colors.sky.500)]"
                                checked={!!p.isDefault}
                                disabled={purchasePathSaving}
                                onChange={() => setDefaultPurchasePath(p.id)}
                              />
                              <span className="text-xs text-slate-700 dark:text-slate-200">
                                기본 경로
                              </span>
                              <span className="sr-only">기본 경로</span>
                            </label>
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                            기타 경로
                          </td>

                          <td className="py-3 pr-3 align-middle text-slate-800 dark:text-slate-100">
                            {p.otherText?.trim() || "—"}
                          </td>

                          <td className="py-3 align-middle text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() =>
                                  setPurchasePathEditModal({
                                    kind: "OTHER",
                                    path: p,
                                  })
                                }
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                수정하기
                              </button>

                              <button
                                type="button"
                                disabled={purchasePathSaving}
                                onClick={() => deletePurchasePath(p.id)}
                                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                aria-label="삭제"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {purchasePathAddOpen && (
          <div className="mb-6 space-y-4 border-b border-slate-100 pb-6 dark:border-slate-700">
            {(purchasePathType === "SITE" || purchasePathType === "OTHER") && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={purchasePathWriteNow}
                  onChange={(e) => setPurchasePathWriteNow(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                이 제품의 구매 경로 바로 작성하기
              </label>
            )}
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>어디에서 이 제품 구매 하세요?</span>
              <span
                className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400"
                title="제품을 구매하는 경로를 등록하면 발주 시 선택할 수 있습니다."
              >
                ⓘ
              </span>
            </div>
            <div className="relative">
              <select
                value={purchasePathType}
                onChange={(e) =>
                  setPurchasePathType(
                    e.target.value as "" | "MANAGER" | "SITE" | "OTHER"
                  )
                }
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">구매 경로 선택해주세요</option>
                <option value="MANAGER">담당자 경로</option>
                <option value="SITE">사이트 경로</option>
                <option value="OTHER">기타 경로</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
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
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {purchasePathType === "SITE" && (
              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  value={sitePathInput}
                  onChange={(e) => setSitePathInput(e.target.value)}
                  placeholder="사이트 이름 또는 URL 붙여넣기"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm bg-white focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-white dark:text-slate-100"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={purchasePathSaving}
                    onClick={registerSitePurchasePath}
                    className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                  >
                    {purchasePathSaving ? "등록 중..." : "등록하기"}
                  </button>
                </div>
              </div>
            )}

            {purchasePathType === "OTHER" && (
              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  value={otherPathInput}
                  onChange={(e) => setOtherPathInput(e.target.value)}
                  placeholder="예) 서비스 무료제공, 학회 수령, 샘플 등..."
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm bg-white focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-white dark:text-slate-100"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={purchasePathSaving}
                    onClick={registerOtherPurchasePath}
                    className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                  >
                    {purchasePathSaving ? "등록 중..." : "등록하기"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {purchasePathAddOpen && purchasePathType === "MANAGER" && (
          <div className="rounded-xl bg-sky-50/90 p-4 dark:bg-sky-950/25">
            {supplierViewMode === "table" && selectedSupplierDetails ? (
              /* 2-rasm: Table Format - Faqat ko'rsatish */
              <div className="relative">
                {/* 수정 button - o'ng tarafda burchakda */}
                <div className="absolute right-0 top-0">
                  <button
                    type="button"
                    onClick={() => {
                      // Table'dan search form'ga o'tish (2-rasm)

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

                        setSupplierViewMode("search");
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
              <>
                {manualEntryLegacyMode ? (
                  <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 md:p-6">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        담당자 정보 작성
                      </h3>

                      <button
                        type="button"
                        onClick={() => {
                          setShowNewSupplierModal(false);
                          setManualEntryLegacyMode(false);
                          setPendingSupplierPhone("");
                          setPhoneSearchNoResults(false);
                          setNewSupplierForm({
                            companyName: "",
                            position: "",
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
                        className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
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

                    <div className="flex flex-row gap-4 rounded-xl border border-sky-100 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/30">
                      <button
                        type="button"
                        onClick={() => setManualEntryLegacyMode(false)}
                        className="mb-2 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                      >
                        회사정보 수동 등록
                      </button>
                      <p className="mb-2 inline-flex items-center justify-center text-xl leading-relaxed text-blue-800">
                        직접 입력하여 회사 정보를 등록합니다.
                      </p>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            담당자 이름 <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={supplierSearchManagerName}
                              onChange={(e) =>
                                setSupplierSearchManagerName(e.target.value)
                              }
                              placeholder="담당자 성함을 입력해주세요"
                              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                            <select
                              value={supplierSearchPosition}
                              onChange={(e) =>
                                setSupplierSearchPosition(e.target.value)
                              }
                              className="h-11 w-36 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            >
                              {positionOptions.map((option) => (
                                <option
                                  key={option}
                                  value={option === "직함 선택" ? "" : option}
                                >
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            사업자등록증
                          </label>
                          <div className="space-y-3">
                            {!certificatePreview ? (
                              <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-sky-800">
                                <span className="mb-1 text-center text-sm text-slate-600 dark:text-slate-400">
                                  이미지를 업로드하세요 / 업로드 시 자동으로
                                  정보를 추출합니다
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-500">
                                  PNG, JPG, WEBP
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
                                      <p className="mt-2 text-sm">
                                        OCR 처리 중...
                                      </p>
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
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            핸드폰 번호 <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            value={pendingSupplierPhone}
                            onChange={(e) =>
                              setPendingSupplierPhone(e.target.value)
                            }
                            placeholder="핸드폰 번호를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            회사명 <span className="text-rose-500">*</span>
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
                            placeholder="회사명을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            회사 주소
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
                            placeholder="회사 주소를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            사업자 등록번호
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
                            placeholder="사업자등록번호를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            회사 전화번호
                          </label>
                          <input
                            type="tel"
                            value={newSupplierForm.companyPhone}
                            onChange={(e) =>
                              setNewSupplierForm((prev) => ({
                                ...prev,
                                companyPhone: e.target.value,
                              }))
                            }
                            placeholder="핸드폰 번호를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            이메일
                          </label>
                          <input
                            type="email"
                            value={newSupplierForm.companyEmail}
                            onChange={(e) =>
                              setNewSupplierForm((prev) => ({
                                ...prev,
                                companyEmail: e.target.value,
                              }))
                            }
                            placeholder="이메일을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            담당 제품
                          </label>
                          <input
                            type="text"
                            value={newSupplierForm.responsibleProducts}
                            onChange={(e) =>
                              setNewSupplierForm((prev) => ({
                                ...prev,
                                responsibleProducts: e.target.value,
                              }))
                            }
                            placeholder="제품을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            메모
                          </label>
                          <textarea
                            value={newSupplierForm.memo}
                            onChange={(e) =>
                              setNewSupplierForm((prev) => ({
                                ...prev,
                                memo: e.target.value,
                              }))
                            }
                            placeholder="메모를 입력하세요"
                            rows={3}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewSupplierModal(false);
                          setManualEntryLegacyMode(false);
                          setPendingSupplierPhone("");
                          setPhoneSearchNoResults(false);
                          setNewSupplierForm({
                            companyName: "",
                            companyAddress: "",
                            position: "",
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
                      <div className="flex max-w-md items-center gap-2 text-right text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
                        <svg
                          className="h-5 w-5 shrink-0 text-sky-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="font-medium">
                          하단{" "}
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            저장
                          </span>
                          을 눌러 등록을 완료하세요.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 md:p-6">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        담당자 정보 작성
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewSupplierModal(false);
                          setManualEntryLegacyMode(false);
                          setPendingSupplierPhone("");
                          setPhoneSearchNoResults(false);
                          setNewSupplierForm({
                            companyName: "",
                            position: "",
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
                        className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
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

                    <div className="rounded-xl flex  flex-row  border gap-4 border-sky-100 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/30">
                      <button
                        type="button"
                        onClick={() => setManualEntryLegacyMode(true)}
                        className="mb-2 inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 sm:w-auto dark:bg-sky-500 dark:hover:bg-sky-600"
                      >
                        회사정보 간편 등록
                      </button>
                      <p className="mb-2 text-xl inline-flex leading-relaxed items-center justify-center text-blue-800">
                        사업자등록증으로 등록하면 회사 정보가 자동으로
                        입력됩니다.
                      </p>
                    </div>

                    <div>
                      <h4 className="mb-3 text-xl font-bold text-slate-500 dark:text-slate-400">
                        회사 정보
                      </h4>
                      <div className="grid px-4 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            회사명 <span className="text-rose-500">*</span>
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
                            placeholder="회사명을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            사업자등록번호{" "}
                            <span className="font-normal text-slate-500">
                              (선택)
                            </span>
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
                            placeholder="사업자등록번호를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-3 text-xl font-bold text-slate-500 dark:text-slate-400">
                        담당자 정보
                      </h4>
                      <div className="grid px-4 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            담당자 성함 <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={supplierSearchManagerName}
                            onChange={(e) =>
                              setSupplierSearchManagerName(e.target.value)
                            }
                            placeholder="담당자 성함을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            직함 <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={supplierSearchPosition}
                            onChange={(e) =>
                              setSupplierSearchPosition(e.target.value)
                            }
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {positionOptions.map((option) => (
                              <option
                                key={option}
                                value={option === "직함 선택" ? "" : option}
                              >
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            핸드폰 번호 <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            value={pendingSupplierPhone}
                            onChange={(e) =>
                              setPendingSupplierPhone(e.target.value)
                            }
                            placeholder="담당자 핸드폰 번호를 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xm font-semibold text-slate-700 dark:text-slate-300">
                            이메일 주소{" "}
                            <span className="font-normal text-slate-500">
                              (선택)
                            </span>
                          </label>
                          <input
                            type="email"
                            value={newSupplierForm.companyEmail}
                            onChange={(e) =>
                              setNewSupplierForm((prev) => ({
                                ...prev,
                                companyEmail: e.target.value,
                              }))
                            }
                            placeholder="담당자 이메일을 입력해주세요"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xm font-bold text-slate-800 dark:text-slate-200">
                        메모
                      </h4>
                      <textarea
                        value={newSupplierForm.memo}
                        onChange={(e) =>
                          setNewSupplierForm((prev) => ({
                            ...prev,
                            memo: e.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="메모를 입력하세요"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewSupplierModal(false);
                          setManualEntryLegacyMode(false);
                          setPendingSupplierPhone("");
                          setPhoneSearchNoResults(false);
                          setNewSupplierForm({
                            companyName: "",
                            position: "",
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
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      >
                        취소
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        하단{" "}
                        <span className="font-bold text-emerald-600">저장</span>
                        으로 완료합니다.
                      </p>
                    </div>
                  </div>
                )}
              </>
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
                      onChange={(e) =>
                        setSupplierSearchCompanyName(e.target.value)
                      }
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
                    담당자님 못 찾은 경우, 핸드폰 입력하시고 한번 더 검색해
                    보세요.
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
                          onClick={() => {
                            setManualEntryLegacyMode(false);
                            setShowNewSupplierModal(true);
                          }}
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
            {supplierViewMode === "table" && selectedSupplierDetails && (
              <div className="mt-6 flex justify-end border-t border-sky-200/80 pt-4 dark:border-sky-800/50">
                <button
                  type="button"
                  disabled={purchasePathSaving}
                  onClick={registerManagerPurchasePath}
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                >
                  {purchasePathSaving ? "등록 중..." : "구매 경로 등록하기"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 구매 경로 수정 / 담당자 안내 */}
      {purchasePathEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {purchasePathEditModal.kind === "MANAGER" && "담당자 경로 수정"}
                {purchasePathEditModal.kind === "SITE" && "사이트 경로 수정"}
                {purchasePathEditModal.kind === "OTHER" && "기타 경로 수정"}
              </h3>
            </div>
            <div className="p-5">
              {purchasePathEditModal.kind === "MANAGER" ? (
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  담당자를 바꾸려면 이 경로를 삭제한 뒤{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    경로 추가
                  </span>
                  에서 다시 등록해 주세요.
                </p>
              ) : purchasePathEditModal.kind === "SITE" ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      표시 이름 (선택)
                    </label>
                    <input
                      type="text"
                      value={editSiteName}
                      onChange={(e) => setEditSiteName(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-white dark:text-slate-100"
                      placeholder="사이트 이름"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      URL
                    </label>
                    <input
                      type="text"
                      value={editSiteUrl}
                      onChange={(e) => setEditSiteUrl(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-white dark:text-slate-100"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    내용
                  </label>
                  <textarea
                    value={editOtherText}
                    onChange={(e) => setEditOtherText(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-white dark:text-slate-100"
                    placeholder="기타 구매 경로 설명"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPurchasePathEditModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                닫기
              </button>
              {purchasePathEditModal.kind !== "MANAGER" && (
                <button
                  type="button"
                  disabled={purchasePathSaving}
                  onClick={() => void savePurchasePathEdit()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {purchasePathSaving ? "저장 중..." : "저장"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                    setManualEntryLegacyMode(false);
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
          onClick={(e) => {}}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || !manualSupplierFormReady}
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
