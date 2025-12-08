"use client";

import { useState, useEffect } from "react";

export default function OrderReturnsPage() {
  const [activeTab, setActiveTab] = useState<"processing" | "in-progress" | "history">("processing");
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    fetchReturns();
  }, [activeTab]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const { apiGet } = await import("../../lib/api");
      const statusMap = {
        processing: "pending",
        "in-progress": "processing",
        history: "completed",
      };
      const data = await apiGet<any[]>(`${apiUrl}/order-returns?status=${statusMap[activeTab]}`);
      setReturns(data || []);
    } catch (err) {
      console.error("Failed to load returns", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            반품 및 교환
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
            불량 또는 오배송된 제품을 반품 사항하고 처리하세요
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("processing")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "processing"
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            반품 처리
          </button>
          <button
            onClick={() => setActiveTab("in-progress")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "in-progress"
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            반품 진행중
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "history"
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            반품 내역
          </button>
        </div>

        {/* Content */}
        <section className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              불러오는 중...
            </div>
          ) : returns.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
              반품 항목이 없습니다.
            </div>
          ) : (
            returns.map((returnItem) => (
              <ReturnCard
                key={returnItem.id}
                returnItem={returnItem}
                onRefresh={fetchReturns}
                apiUrl={apiUrl}
              />
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function ReturnCard({ returnItem, onRefresh, apiUrl }: any) {
  const [processing, setProcessing] = useState(false);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 grid grid-cols-3 gap-4 border-b pb-4">
        <div>
          <p className="text-sm text-slate-500">공급자</p>
          <p className="font-semibold">공급업체 정보</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">배치번호</p>
          <p className="font-semibold">{returnItem.batch_no}</p>
          <p className="text-sm text-slate-500 mt-1">주문번호: {returnItem.order_no}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">입고: {new Date(returnItem.inbound_date).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold text-slate-900">{returnItem.product_name}</h3>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <span>미입고수량: <strong className="text-rose-600">{returnItem.return_quantity}개</strong> / {returnItem.total_quantity}개</span>
          <span>단가: {returnItem.unit_price.toLocaleString()}원</span>
        </div>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="메모"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        
        <div className="flex gap-2">
          <button className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300">
            📷
          </button>
          <button className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300">
            📷
          </button>
          <button className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300">
            📷
          </button>
        </div>

        <div className="flex items-center justify-between">
          <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            <option>반품 담당자</option>
          </select>
          <button
            onClick={async () => {
              setProcessing(true);
              try {
                const { apiPost } = await import("../../lib/api");
                await apiPost(`${apiUrl}/order-returns/${returnItem.id}/process`, {});
                alert("반품 처리가 완료되었습니다.");
                onRefresh();
              } catch (err: any) {
                alert(err?.message || "오류가 발생했습니다.");
              } finally {
                setProcessing(false);
              }
            }}
            disabled={processing}
            className="rounded-lg bg-rose-600 px-6 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {processing ? "처리 중..." : "반품하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

