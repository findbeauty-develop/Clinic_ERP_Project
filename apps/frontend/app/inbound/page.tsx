"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
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
  id: string;
  batch_no: string;
  storage?: string | null;
  qty: number;
  expiry_date?: string | null;
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
  batches?: ProductBatch[];
};

export default function InboundPage() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", []);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const { apiGet } = await import("../../lib/api");
        const data = await apiGet<ProductListItem[]>(`${apiUrl}/products`);
        setProducts(data);
      } catch (err) {
        console.error("Failed to load products", err);
        setError("제품 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [apiUrl]);

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">입고 관리</h1>
            <p className="text-base text-slate-500 dark:text-slate-300">
              제품의 입고를 기록하고 재고를 관리합니다
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
              <UploadIcon className="h-5 w-5" />
              CSV로 대량 등록
            </button>
            <Link
              href="/inbound/new"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <PlusIcon className="h-5 w-5" />
              신제품 등록
            </Link>
          </div>
        </header>

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
            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <FilterChip label="정렬" options={inboundFilters} defaultValue="최근 업데이트순" />
              <FilterChip label="카테고리" options={categories} defaultValue="전체 카테고리" />
              <FilterChip label="상태" options={statuses} defaultValue="전체 상태" />
              <FilterChip label="공급업체" options={suppliers} defaultValue="전체 공급업체" />
            </div>
          </div>
        </div>

        <section className="space-y-4">
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
              products.map((product) => <ProductCard key={product.id} product={product} />)
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function ProductCard({ product }: { product: ProductListItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(1);
  const isLowStock = product.currentStock <= product.minStock;
  const statusColor =
    product.status === "활성"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-sky-200 dark:border-slate-800 dark:bg-slate-900/70">
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
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">No Image</div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {product.category}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>{product.status}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{product.productName}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <BoxIcon className="h-4 w-4" />
              {product.currentStock.toLocaleString()} / {product.minStock.toLocaleString()}{" "}
              {product.unit ?? "EA"}
            </span>
            <span className="inline-flex items-center gap-1">
              <WonIcon className="h-4 w-4 text-emerald-500" />
              구매: ₩{(product.purchasePrice ?? 0).toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <WonIcon className="h-4 w-4 text-sky-500" />
              판매: ₩{(product.salePrice ?? 0).toLocaleString()}
            </span>
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
          <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300">
            🧾 1개 배치
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300">
            🛒 주문
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "닫기" : "상세 보기"}
            <ChevronIcon className={`h-3 w-3 transition ${isExpanded ? "rotate-180" : ""}`} />
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
            {product.batches?.length ? (
              product.batches.map((batch) => (
                <div
                  key={batch.id}
                  className="mb-3 flex flex-wrap items-center justify-between rounded-xl bg-white px-4 py-3 text-sm text-slate-600 last:mb-0 dark:bg-slate-900/70 dark:text-slate-300"
                >
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white">{batch.batch_no}</p>
                    {batch.expiry_date && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        유효기간: {new Date(batch.expiry_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {batch.qty} {product.unit ?? "EA"}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">등록된 배치가 없습니다.</p>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-500/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">새 배치 입고 처리</div>
              <Link
                href={`/products/${product.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                제품 정보 전체 수정
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 ">
              <InlineField label="입고 담당자 *" placeholder="입고 담당자 이름" />
              <InlineField label="제조일 (선택)" type="date" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <QuantityField value={batchQuantity} onChange={setBatchQuantity} />
              <InlineField label="유효 기간 *" type="date" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 ">
              <InlineField label="배치 번호 (선택)" placeholder="미입력 시 자동 생성" />
              <InlineField label="보관 위치 (선택)" placeholder="예: 창고 A-3, 냉장실 1번" />
            </div>
            <div className="flex justify-end">
              <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600">
                +
                입고
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
    <button className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300">
        {label}
      </span>
      <span className="truncate text-sm text-slate-700 dark:text-slate-200">{defaultValue}</span>
    </button>
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
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1115 6.75a7.5 7.5 0 011.65 9.9z" />
    </svg>
  );
}

function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5h12M8.25 9h7.5M10.5 13.5h3M9 18h6" />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9 4.5 9-4.5M3 7.5l9-4.5 9 4.5M3 7.5v9l9 4.5m0-13.5v9l9-4.5v-9" />
    </svg>
  );
}

function WonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h4.5L9 16l3-8.5 3 8.5 1.5-8.5H21M3 12h18M3 16.5h18" />
    </svg>
  );
}

function WarehouseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9-4.5 9 4.5v10.5a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V7.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5h6V21H9z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 9h18M4.5 7.5h15a1.5 1.5 0 011.5 1.5v11.25A1.5 1.5 0 0119.5 21H4.5A1.5 1.5 0 013 19.5V9a1.5 1.5 0 011.5-1.5z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function InlineField({ label, placeholder, type = "text" }: { label: string; placeholder?: string; type?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none dark:border-slate-700"
      />
    </div>
  );
}

function QuantityField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
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
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">입고 수량 *</label>
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
          className="h-11 flex-1 appearance-none border-0 bg-white text-center text-base font-semibold text-slate-800 focus:outline-none"
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
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
    </svg>
  );
}

