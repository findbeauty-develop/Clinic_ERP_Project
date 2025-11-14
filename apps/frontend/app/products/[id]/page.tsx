"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
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
  expiryDate?: string | null;
  storageLocation?: string | null;
  memo?: string | null;
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
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", []);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params?.id) return;

      setLoading(true);
      setError(null);
      try {
        const { apiGet } = await import("../../../lib/api");
        const data = await apiGet<ProductDetail>(`${apiUrl}/products/${params.id}`);
        setProduct(data);
      } catch (err) {
        console.error("Failed to load product", err);
        setError("제품 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [apiUrl, params?.id]);

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
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200">
                <PencilIcon className="h-4 w-4" />
                수정
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 dark:border-rose-500/60 dark:text-rose-200">
                <TrashIcon className="h-4 w-4" />
                삭제
              </button>
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
            <ProductInfoCard product={product} />
            <div className="grid gap-6 lg:grid-cols-2">
              {/* <BatchListCard batches={product.batches ?? []} unit={product.unit ?? "EA"} /> */}
              {/* <NewBatchCard /> */}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ReturnPolicyCard />
              <StorageInfoCard product={product} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ProductInfoCard({ product }: { product: ProductDetail }) {
  const isLowStock = product.currentStock <= product.minStock;

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
          <InfoField label="제품명" value={product.productName} />
          <InfoField label="브랜드" value={product.brand} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[240px,1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-900/50">
            {product.productImage ? (
              <img src={product.productImage} alt={product.productName} className="mx-auto rounded-xl object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">이미지 없음</div>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <InfoField label="카테고리" value={product.category} />
            <InfoField
              label="상태"
              value={
                <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${isLowStock ? "bg-rose-100 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {product.status}
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
          <InfoField label="현재 재고" value={`${product.currentStock.toLocaleString()} ${product.unit ?? "EA"}`} />
          <InfoField label="최소 재고" value={`${product.minStock.toLocaleString()} ${product.unit ?? "EA"}`} />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <InfoField label="구매가" value={`₩${(product.purchasePrice ?? 0).toLocaleString()}`} />
          <InfoField label="판매가" value={`₩${(product.salePrice ?? 0).toLocaleString()}`} />
          <InfoField label="단위" value={product.unit ?? "EA"} />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-100">공급업체 정보</h4>
          <div className="grid gap-4 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
            <InfoField label="공급업체명" value={product.supplierName ?? "미지정"} compact />
            <InfoField label="담당자" value={product.managerName ?? "미지정"} compact />
            <InfoField label="유효기간" value={product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : "미지정"} compact />
            <InfoField label="보관 위치" value={product.storageLocation ?? "미지정"} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

// function BatchListCard({ batches, unit }: { batches: ProductDetail["batches"]; unit: string }) {
//   return (
//     <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
//       <div className="flex items-center justify-between">
//         <h3 className="text-lg font-semibold text-slate-900 dark:text-white">기존 배치 목록</h3>
//         <button className="text-sm font-semibold text-sky-600 transition hover:text-sky-700 dark:text-sky-300">+ 배치 추가</button>
//       </div>
//       <div className="mt-4 space-y-3">
//         {batches && batches.length ? (
//           batches.map((batch) => (
//             <div key={batch.id} className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
//               <div className="flex flex-wrap items-center justify-between gap-3">
//                 <div>
//                   <p className="text-sm font-semibold text-slate-900 dark:text-white">{batch.batch_no}</p>
//                   <p className="text-xs text-slate-500 dark:text-slate-400">
//                     유효기간: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : "—"}
//                   </p>
//                 </div>
//                 <div className="text-sm font-semibold text-slate-700 dark:text-white">
//                   {batch.qty.toLocaleString()} {unit}
//                 </div>
//               </div>
//             </div>
//           ))
//         ) : (
//           <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
//             등록된 배치가 없습니다.
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

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

function ReturnPolicyCard() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">반납 정책</h3>
      <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <Alert color="amber" text="이 제품은 반납 가능한 제품입니다." />
        <p>반납 가능 여부와 조건은 공급업체와의 계약에 따라 달라질 수 있습니다. 자세한 사항은 담당자에게 문의하세요.</p>
      </div>
    </div>
  );
}

function StorageInfoCard({ product }: { product: ProductDetail }) {
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

