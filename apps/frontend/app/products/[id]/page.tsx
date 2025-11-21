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
  supplierName?: string | null;
  managerName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
  memo?: string | null;
  isReturnable?: boolean;
  refundAmount?: number | null;
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
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", []);
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
        const formatImageUrl = (imageUrl: string | null | undefined): string | null => {
          if (!imageUrl) return null;
          // Agar to'liq URL bo'lsa (http:// yoki https:// bilan boshlansa), o'zgartirmaslik
          if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
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
          supplierName: data.supplierName,
          managerName: data.managerName,
          contactPhone: data.contactPhone || data.contact_phone,
          contactEmail: data.contactEmail || data.contact_email,
          expiryDate: data.expiryDate || data.expiry_date,
          storageLocation: data.storageLocation || data.storage_location,
          memo: data.memo,
          isReturnable: data.isReturnable ?? false,
          refundAmount: data.refundAmount || data.refund_amount || null,
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
        const batchesData = await apiGet<any[]>(`${apiUrl}/products/${params.id}/batches`);
        
        // Map API response (Korean field names) to expected format
        const formattedBatches: ProductDetail["batches"] = batchesData.map((batch: any) => ({
          id: batch.id,
          batch_no: batch.batch_no,
          storage: batch.보관위치 || null,
          qty: batch["입고 수량"] || 0,
          expiry_date: batch.유효기간 || null,
          purchase_price: null,
          sale_price: null,
          manufacture_date: null,
          created_at: batch.created_at || new Date().toISOString(),
        }));

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/inbound"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </Link>
              <div>
                <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">제품 상세</p>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">제품 정보 전체 수정</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
              >
                <PencilIcon className="h-4 w-4" />
                {isEditing ? "취소" : "수정"}
              </button>
              {!isEditing && (
                <button
                  onClick={async () => {
                    if (!confirm("정말 이 제품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
                    try {
                      const { apiRequest } = await import("../../../lib/api");
                      const response = await apiRequest(`${apiUrl}/products/${params.id}`, {
                        method: "DELETE",
                      });
                      if (!response.ok) {
                        const error = await response.json().catch(() => ({}));
                        throw new Error(error?.message || "제품 삭제에 실패했습니다.");
                      }
                      alert("제품이 성공적으로 삭제되었습니다.");
                      router.push("/inbound");
                    } catch (err) {
                      console.error("Failed to delete product", err);
                      alert(err instanceof Error ? err.message : "제품 삭제에 실패했습니다.");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 dark:border-rose-500/60 dark:text-rose-200"
                >
                  <TrashIcon className="h-4 w-4" />
                  삭제
                </button>
              )}
            </div>
          </div>
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
          <section className="space-y-6">
            {isEditing ? (
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
              <>
                <ProductInfoCard product={product} batches={batches} />
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* <BatchListCard batches={product.batches ?? []} unit={product.unit ?? "EA"} /> */}
                  {/* <NewBatchCard /> */}
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <ReturnPolicyCard product={product} />
                  <StorageInfoCard product={product} />
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

interface ProductEditFormProps {
  product: ProductDetail;
  apiUrl: string;
  onCancel: () => void;
  onSuccess: (updatedProduct: ProductDetail) => void;
}

function ProductEditForm({ product, apiUrl, onCancel, onSuccess }: ProductEditFormProps) {
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
    image: product.productImage || "",
    imageFile: null as File | null,
    supplierName: product.supplierName || "",
    managerName: product.managerName || "",
    contactPhone: product.contactPhone || "",
    contactEmail: product.contactEmail || "",
    expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString().split('T')[0] : "",
    storageLocation: product.storageLocation || "",
    memo: product.memo || "",
    isReturnable: product.isReturnable || false,
    refundAmount: product.refundAmount?.toString() || "",
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
    setLoading(true);

    try {
      const { apiPut } = await import("../../../lib/api");
      const payload: any = {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        status: formData.status,
        unit: formData.unit || undefined,
        purchasePrice: formData.purchasePrice ? Number(formData.purchasePrice) : undefined,
        salePrice: formData.salePrice ? Number(formData.salePrice) : undefined,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
      };

      // Image handling: to'g'ri logika
      // 1. Agar yangi image yuklangan bo'lsa (imageFile mavjud)
      // 2. Agar image o'chirilgan bo'lsa (image bo'sh yoki null)
      // 3. Agar image o'zgarmagan bo'lsa (payload'ga qo'shmaslik - undefined)
      if (formData.imageFile) {
        // Yangi image yuklangan - base64 format'da yuborish
        payload.image = formData.image;
      } else if (formData.image === "" || formData.image === null) {
        // Image o'chirilgan - null yuborish (backend image'ni o'chiradi)
        payload.image = null;
      }
      // Agar image o'zgarmagan bo'lsa (formData.image === product.productImage va formData.imageFile yo'q),
      // payload'ga qo'shmaslik (undefined qoladi, backend eski image'ni saqlaydi)

      // Supplier information
      if (formData.supplierName || formData.managerName || formData.contactPhone || formData.contactEmail) {
        payload.suppliers = [
          {
            supplier_id: formData.supplierName || product.supplierName || undefined,
            contact_name: formData.managerName || undefined,
            contact_phone: formData.contactPhone || undefined,
            contact_email: formData.contactEmail || undefined,
          },
        ];
      }

      // Additional fields
      if (formData.expiryDate) {
        payload.expiryDate = formData.expiryDate;
      }
      if (formData.storageLocation) {
        payload.storageLocation = formData.storageLocation;
      }
      if (formData.memo) {
        payload.memo = formData.memo;
      }
      payload.isReturnable = formData.isReturnable;
      if (formData.refundAmount) {
        payload.refundAmount = Number(formData.refundAmount) || 0;
      }

      // Return policy
      if (formData.isReturnable || formData.refundAmount) {
        payload.returnPolicy = {
          is_returnable: formData.isReturnable,
          refund_amount: formData.refundAmount ? Number(formData.refundAmount) : 0,
        };
      }

      const updatedProductResponse = await apiPut<any>(`${apiUrl}/products/${product.id}`, payload);
      
      // Agar yangi image yuklangan bo'lsa, product'ni qayta fetch qilish
      // (chunki backend'dan qaytgan response'da yangi image URL bo'lishi kerak)
      let finalProductResponse = updatedProductResponse;
      if (formData.imageFile) {
        try {
          const { apiGet } = await import("../../../lib/api");
          finalProductResponse = await apiGet<any>(`${apiUrl}/products/${product.id}`);
        } catch (refreshErr) {
          console.error("Failed to refresh product after image upload", refreshErr);
          // Fallback: original response ishlatish
        }
      }
      
      // Helper function to format image URL (relative path -> full URL)
      const formatImageUrl = (imageUrl: string | null | undefined): string | null => {
        if (!imageUrl) return null;
        // Agar to'liq URL bo'lsa (http:// yoki https:// bilan boshlansa), o'zgartirmaslik
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
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

      // Transform backend response to frontend ProductDetail format
      const rawImageUrl = finalProductResponse.productImage || 
                          finalProductResponse.image_url || 
                          product.productImage;
      const formattedImageUrl = formatImageUrl(rawImageUrl);

      const updatedProduct: ProductDetail = {
        id: finalProductResponse.id || product.id,
        productName: finalProductResponse.productName || finalProductResponse.name || product.productName,
        brand: finalProductResponse.brand || product.brand,
        productImage: formattedImageUrl,
        category: finalProductResponse.category || product.category,
        status: finalProductResponse.status || product.status,
        currentStock: finalProductResponse.currentStock || finalProductResponse.current_stock || product.currentStock,
        minStock: finalProductResponse.minStock || finalProductResponse.min_stock || product.minStock,
        unit: finalProductResponse.unit || product.unit,
        purchasePrice: finalProductResponse.purchasePrice || finalProductResponse.purchase_price || product.purchasePrice,
        salePrice: finalProductResponse.salePrice || finalProductResponse.sale_price || product.salePrice,
        supplierName: finalProductResponse.supplierName || product.supplierName,
        managerName: finalProductResponse.managerName || product.managerName,
        contactPhone: finalProductResponse.contactPhone || finalProductResponse.contact_phone || product.contactPhone,
        contactEmail: finalProductResponse.contactEmail || finalProductResponse.contact_email || product.contactEmail,
        expiryDate: finalProductResponse.expiryDate || finalProductResponse.expiry_date || product.expiryDate,
        storageLocation: finalProductResponse.storageLocation || finalProductResponse.storage_location || product.storageLocation,
        memo: finalProductResponse.memo || product.memo,
        isReturnable: finalProductResponse.isReturnable ?? product.isReturnable ?? false,
        refundAmount: finalProductResponse.refundAmount || finalProductResponse.refund_amount || product.refundAmount || null,
        batches: finalProductResponse.batches || product.batches,
      };
      
      alert("제품이 성공적으로 업데이트되었습니다.");
      onSuccess(updatedProduct);
    } catch (err) {
      console.error("Failed to update product", err);
      alert(err instanceof Error ? err.message : "제품 업데이트에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = ["활성", "재고 부족", "만료", "단종"];
  const unitOptions = ["개", "ml", "g", "세트", "박스", "병", "EA"];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <PackageIcon className="h-5 w-5 text-sky-500" />
            제품 정보 수정
          </div>
        </div>
        <div className="space-y-6 p-6">
          {/* Image Upload */}
          <div className="grid gap-6 lg:grid-cols-[240px,1fr]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                제품 이미지
              </label>
              <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                {formData.image ? (
                  <div className="relative">
                    <img src={formData.image} alt="Preview" className="h-40 w-full rounded-xl object-cover" />
                    <label className="absolute inset-0 cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleInputChange("image", "")}
                      className="absolute right-2 top-2 rounded-lg bg-rose-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-600"
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                  <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 transition hover:border-sky-400 dark:border-slate-600">
                    <UploadIcon className="h-8 w-8 text-slate-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">이미지 선택</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  카테고리 *
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => handleInputChange("category", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  상태 *
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

          {/* Basic Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                제품명 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                브랜드 *
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => handleInputChange("brand", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                required
              />
            </div>
          </div>

          {/* Stock Info */}
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                현재 재고
              </label>
              <input
                type="number"
                min="0"
                value={formData.currentStock}
                onChange={(e) => handleInputChange("currentStock", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                최소 재고
              </label>
              <input
                type="number"
                min="0"
                value={formData.minStock}
                onChange={(e) => handleInputChange("minStock", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                단위
              </label>
              <select
                value={formData.unit}
                onChange={(e) => handleInputChange("unit", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">선택 안함</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Price Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                구매가 (원)
              </label>
              <input
                type="number"
                min="0"
                value={formData.purchasePrice}
                onChange={(e) => handleInputChange("purchasePrice", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                판매가 (원)
              </label>
              <input
                type="number"
                min="0"
                value={formData.salePrice}
                onChange={(e) => handleInputChange("salePrice", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Supplier Info */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <h4 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-100">공급업체 정보</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  공급업체명
                </label>
                <input
                  type="text"
                  value={formData.supplierName}
                  onChange={(e) => handleInputChange("supplierName", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  담당자
                </label>
                <input
                  type="text"
                  value={formData.managerName}
                  onChange={(e) => handleInputChange("managerName", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  담당자 연락처
                </label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => handleInputChange("contactPhone", e.target.value)}
                  placeholder="010-1234-5678"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  이메일
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                  placeholder="example@supplier.com"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Storage and Memo Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                유효기간
              </label>
              <input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => handleInputChange("expiryDate", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                보관 위치
              </label>
              <input
                type="text"
                value={formData.storageLocation}
                onChange={(e) => handleInputChange("storageLocation", e.target.value)}
                placeholder="예: 창고 A-3, 냉장실 1번"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              보관 메모
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) => handleInputChange("memo", e.target.value)}
              rows={3}
              placeholder="보관 관련 메모를 입력하세요"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          {/* Return Policy */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <h4 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-100">반납 정책</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isReturnable"
                  checked={formData.isReturnable}
                  onChange={(e) => handleInputChange("isReturnable", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-2 focus:ring-indigo-500 checked:bg-indigo-500 checked:border-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <label htmlFor="isReturnable" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  반납 가능한 제품
                </label>
              </div>
              {formData.isReturnable && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    반납시개당 가격 (원)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.refundAmount}
                    onChange={(e) => handleInputChange("refundAmount", e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Storage and Memo Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                유효기간
              </label>
              <input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => handleInputChange("expiryDate", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                보관 위치
              </label>
              <input
                type="text"
                value={formData.storageLocation}
                onChange={(e) => handleInputChange("storageLocation", e.target.value)}
                placeholder="예: 창고 A-3, 냉장실 1번"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              보관 메모
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) => handleInputChange("memo", e.target.value)}
              rows={3}
              placeholder="보관 관련 메모를 입력하세요"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          {/* Return Policy */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <h4 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-100">반납 정책</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isReturnable"
                  checked={formData.isReturnable}
                  onChange={(e) => handleInputChange("isReturnable", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-2 focus:ring-indigo-500 checked:bg-indigo-500 checked:border-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <label htmlFor="isReturnable" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  반납 가능한 제품
                </label>
              </div>
              {formData.isReturnable && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    반납시개당 가격 (원)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.refundAmount}
                    onChange={(e) => handleInputChange("refundAmount", e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
              )}
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
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ProductInfoCard({ product, batches }: { product: ProductDetail; batches: ProductDetail["batches"] }) {
  // Null/undefined check
  if (!product) {
    return null;
  }

  const isLowStock = (product.currentStock ?? 0) <= (product.minStock ?? 0);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          <PackageIcon className="h-5 w-5 text-sky-500" />
          제품 정보
        </div>
      </div>
      <div className="space-y-6 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <InfoField label="제품명" value={product.productName ?? ""} />
          <InfoField label="브랜드" value={product.brand ?? ""} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[240px,1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-900/50">
            {product.productImage ? (
              <img src={product.productImage} alt={product.productName ?? "Product image"} className="mx-auto rounded-xl object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">이미지 없음</div>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <InfoField label="카테고리" value={product.category ?? ""} />
            <InfoField
              label="상태"
              value={
                <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${isLowStock ? "bg-rose-100 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {product.status ?? ""}
                </span>
              }
            />
          </div>
        </div>
        {product.status === "단종" ? (
          <Alert color="amber" text="이 제품은 단종되었습니다. 단종 제품은 유효기간이 만료되거나 재고가 소진되면 자동으로 휴지통으로 이동됩니다." />
        ) : (
          <Alert color="sky" text="재고 상태는 실시간으로 업데이트되며 최소 재고 이하일 경우 알림이 발송됩니다." />
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <InfoField label="현재 재고" value={`${(product.currentStock ?? 0).toLocaleString()} ${product.unit ?? "EA"}`} />
          <InfoField label="최소 재고" value={`${(product.minStock ?? 0).toLocaleString()} ${product.unit ?? "EA"}`} />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <InfoField label="구매가" value={`₩${(product.purchasePrice ?? 0).toLocaleString()}`} />
          
          <InfoField label="단위" value={product.unit ?? "EA"} />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-100">공급업체 정보</h4>
          <div className="grid gap-4 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
            <InfoField label="공급업체명" value={product.supplierName ?? "미지정"} compact />
            <InfoField label="담당자" value={product.managerName ?? "미지정"} compact />
            <InfoField label="담당자 연락처" value={product.contactPhone ?? "미지정"} compact />
            <InfoField label="이메일" value={product.contactEmail ?? "미지정"} compact />
            <InfoField label="유효기간" value={product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : "미지정"} compact />
            <InfoField label="보관 위치" value={product.storageLocation ?? "미지정"} compact />
          </div>
        </div>
        <BatchListCard batches={batches} unit={product.unit || "EA"} />
      </div>
    </div>
  );
}

function BatchListCard({ batches, unit }: { batches: ProductDetail["batches"]; unit: string }) {
  if (!batches) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
        <BoxIcon className="h-4 w-4" />
        기존 배치 목록
      </div>
      <div className="space-y-3">
        {batches.length > 0 ? (
          batches.map((batch) => (
            <div
              key={batch.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
            >
              {/* Batch nomi - alohida row */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-white">Batch:</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">{batch.batch_no}</span>
              </div>
              
              {/* Barcha ma'lumotlar bitta row'da */}
              <div className="flex items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {batch.storage && (
                  <span className="inline-flex items-center gap-1">
                    <WarehouseIcon className="h-3.5 w-3.5" />
                    보관위치: {batch.storage}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  입고 날짜: {new Date(batch.created_at).toLocaleDateString()}
                </span>
                {batch.expiry_date && (
                  <span className="inline-flex items-center gap-1">
                    유효기간: {typeof batch.expiry_date === 'string' ? batch.expiry_date : new Date(batch.expiry_date).toISOString().split('T')[0]}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white ml-auto">
                  {batch.qty.toLocaleString()} {unit}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            등록된 배치가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// function NewBatchCard() {
//   return (
//     <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
//       <h3 className="text-lg font-semibold text-slate-900 dark:text-white">새 배치 입고 처리</h3>
//       <p className="text-sm text-slate-500 dark:text-slate-400">입고 담당자와 기초 정보를 입력하여 새 배치를 추가하세요.</p>

//       <form className="mt-6 space-y-4">
//         <div className="grid gap-4 md:grid-cols-2">
//           <InputField label="입고 담당자" placeholder="담당자 이름" name="managerName" />
//           <InputField label="제조일" type="date" name="manufactureDate" />
//         </div>
//         <div className="grid gap-4 md:grid-cols-2">
//           <InputField label="입고 수량" type="number" placeholder="수량" name="quantity" />
//           <InputField label="유효 기간" type="date" name="expiryDate" />
//         </div>
//         <InputField label="배치 번호" placeholder="미입력 시 자동 생성" name="batchNumber" />
//         <InputField label="보관 위치" placeholder="예: 창고 A-3, 냉장실 1번" name="storageLocation" />
//         <div className="flex justify-end">
//           <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600">
//             +
//             입고
//           </button>
//         </div>
//       </form>
//     </div>
//   );
// }

function ReturnPolicyCard({ product }: { product: ProductDetail }) {
  if (!product) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">반납 정책</h3>
      <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
        {product.isReturnable && (
          <Alert color="amber" text="이 제품은 반납 가능한 제품입니다." />
        )}
        {product.refundAmount && product.refundAmount > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">반납시개당 가격</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                ₩{product.refundAmount.toLocaleString()}
              </span>
            </div>
          </div>
        )}
        <p>반납 가능 여부와 조건은 공급업체와의 계약에 따라 달라질 수 있습니다. 자세한 사항은 담당자에게 문의하세요.</p>
      </div>
    </div>
  );
}

function StorageInfoCard({ product }: { product: ProductDetail }) {
  // Null/undefined check
  if (!product) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">보관 정보</h3>
      <div className="mt-4 grid gap-4 text-sm text-slate-600 dark:text-slate-300">
        <InfoField label="보관 위치" value={product.storageLocation ?? "—"} />
        <InfoField label="보관 메모" value={product.memo ?? "메모 없음"} />
      </div>
    </div>
  );
}

function InfoField({ label, value, compact = false }: { label: string; value: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {value ?? "—"}
      </span>
    </div>
  );
}

function InputField({
  label,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
    </div>
  );
}

function Alert({ text, color }: { text: string; color: "amber" | "sky" }) {
  const palette =
    color === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${palette}`}>
      <div className="flex items-baseline gap-2">
        <WarningIcon className="h-4 w-4" />
        <span>{text}</span>
      </div>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5v-9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9 4.5 9-4.5M12 12v9" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.008v.008H12v-.008z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.76-1.36 2.553-1.36 3.314 0l7.389 13.24c.75 1.344-.214 3.02-1.657 3.02H4.61c-1.443 0-2.407-1.676-1.657-3.02L10.343 3.94z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7.5h12M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5m-7.5 0V18a2.25 2.25 0 002.25 2.25h4.5A2.25 2.25 0 0017.25 18V7.5" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function WarehouseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h4.5V10.75M8.25 21H3.375c-.621 0-1.125-.504-1.125-1.125V3.545c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v16.33c0 .621-.504 1.125-1.125 1.125z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

