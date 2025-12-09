"use client";

import { useState, useEffect, useMemo } from "react";

export default function OrderReturnsPage() {
  const [activeTab, setActiveTab] = useState<"processing" | "in-progress" | "history">("processing");
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    fetchReturns();
    fetchMembers();
  }, [activeTab]);

  const fetchMembers = async () => {
    try {
      const { apiGet } = await import("../../lib/api");
      const data = await apiGet<any[]>(`${apiUrl}/iam/members`);
      setMembers(data || []);
    } catch (err) {
      console.error("Failed to load members", err);
    }
  };

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

  const formatReturnType = (returnType: string) => {
    if (returnType.includes("불량")) return "불량 | 교환";
    if (returnType.includes("주문") && returnType.includes("교환")) return "주문 | 교환";
    if (returnType.includes("주문") && returnType.includes("반품")) return "주문 | 반품";
    return returnType;
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
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            반품 처리
          </button>
          <button
            onClick={() => setActiveTab("in-progress")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "in-progress"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            반품 진행중
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === "history"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            반품 내역
          </button>
        </div>

        {/* Content */}
        <section className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
              불러오는 중...
            </div>
          ) : returns.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              반품 항목이 없습니다.
            </div>
          ) : (
            returns.map((returnItem) => (
              <ReturnCard
                key={returnItem.id}
                returnItem={returnItem}
                members={members}
                onRefresh={fetchReturns}
                apiUrl={apiUrl}
                formatReturnType={formatReturnType}
              />
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function ReturnCard({ returnItem, members, onRefresh, apiUrl, formatReturnType }: any) {
  const [processing, setProcessing] = useState(false);
  const [memo, setMemo] = useState(returnItem.memo || "");
  const [selectedManager, setSelectedManager] = useState(returnItem.return_manager || "");
  const [images, setImages] = useState<string[]>(returnItem.images || []);

  const isOrderReturn = returnItem.return_type?.includes("주문") && returnItem.return_type?.includes("반품");

  const handleProcessReturn = async () => {
    if (isOrderReturn && !selectedManager) {
      alert("반품 담당자를 선택해주세요.");
      return;
    }

    setProcessing(true);
    try {
      const { apiPost } = await import("../../lib/api");
      await apiPost(`${apiUrl}/order-returns/${returnItem.id}/process`, {
        memo: memo || null,
        returnManager: selectedManager || null,
        images: images,
      });
      alert("반품 처리가 완료되었습니다.");
      onRefresh();
    } catch (err: any) {
      alert(err?.message || "오류가 발생했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (date: string | Date) => {
    if (!date) return "00-00-00";
    const d = new Date(date);
    const year = d.getFullYear().toString().slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateTime = (date: string | Date) => {
    if (!date) return "00-00-00 00:00";
    const d = new Date(date);
    const year = d.getFullYear().toString().slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800">
      {/* Header: Supplier | Return Type | Date */}
      <div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-3 dark:border-slate-600">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
          공급처: {returnItem.supplierName || "알 수 없음"} {returnItem.managerName ? `${returnItem.managerName} 대리` : ""}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={returnItem.return_type || ""}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            disabled
          >
            <option>{formatReturnType(returnItem.return_type || "")}</option>
          </select>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDateTime(returnItem.inbound_date || returnItem.created_at)}
          </span>
        </div>
      </div>

      {/* Product Details Row: 배치번호, 입고, 미입고수량, 단가 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
        {returnItem.batch_no && (
          <div className="flex items-center gap-1">
            <span className="font-medium">배치번호</span>
            <span>{returnItem.batch_no}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="font-medium">입고</span>
          <span>{formatDate(returnItem.inbound_date || returnItem.created_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">미입고수량:</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {returnItem.return_quantity}개
          </span>
          {returnItem.total_quantity && (
            <span className="text-slate-500 dark:text-slate-400">
              / {returnItem.total_quantity}개
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">단가</span>
          <span className="font-semibold text-blue-600 underline dark:text-blue-400">
            {returnItem.unit_price?.toLocaleString() || 0}원
          </span>
        </div>
      </div>

      {/* Product Name, Memo Input, and Camera Buttons in one row */}
      <div className="mb-4 flex items-center gap-3">
        {/* Product Name */}
        <div className="flex-shrink-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white whitespace-nowrap">
            {returnItem.product_name || "알 수 없음"}
          </h3>
        </div>

        {/* Memo Input */}
        <div className="flex-1">
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={isOrderReturn ? "출고의 메모" : "메모"}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </div>

        {/* Camera Buttons */}
        <div className="flex-shrink-0 flex gap-2">
          {[1, 2, 3].map((idx) => (
            <button
              key={idx}
              className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-xl hover:border-sky-400 dark:border-slate-600 dark:bg-slate-700"
              onClick={() => {
                // TODO: Implement image upload
                alert("이미지 업로드 기능은 곧 추가될 예정입니다.");
              }}
            >
              📷
            </button>
          ))}
        </div>
      </div>

      {/* Return Manager & Process Button (only for 주문|반품) */}
      {isOrderReturn && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              반품 담당자:
            </label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">성함 선택</option>
              {members.map((member: any) => (
                <option key={member.id} value={member.member_id || member.id}>
                  {member.full_name || member.member_id}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleProcessReturn}
            disabled={processing}
            className="rounded-lg bg-rose-600 px-6 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-600"
          >
            {processing ? "처리 중..." : "반품하기"}
          </button>
        </div>
      )}
    </div>
  );
}
