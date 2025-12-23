"use client";

import { useState, useEffect, useMemo } from "react";

export default function OrderReturnsPage() {
  const [activeTab, setActiveTab] = useState<
    "processing" | "in-progress" | "history"
  >("processing");
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
      const data = await apiGet<any[]>(
        `${apiUrl}/order-returns?status=${statusMap[activeTab]}`
      );
      setReturns(data || []);
    } catch (err) {
      console.error("Failed to load returns", err);
    } finally {
      setLoading(false);
    }
  };

  const formatReturnType = (returnType: string) => {
    if (returnType.includes("불량") && returnType.includes("교환"))
      return "불량 | 교환";
    if (returnType.includes("불량") && returnType.includes("반품"))
      return "불량 | 반품";
    if (returnType.includes("주문") && returnType.includes("교환"))
      return "주문 | 교환";
    if (returnType.includes("주문") && returnType.includes("반품"))
      return "주문 | 반품";
    return returnType;
  };

  const getStatusBadge = (returnType: string, status: string) => {
    if (status === "completed") {
      if (returnType?.includes("교환")) {
        return {
          text: "교환완료",
          className:
            "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-slate-200",
          textClassName: "text-sm font-medium text-green-700",
        };
      } else if (returnType?.includes("반품")) {
        return {
          text: "반품완료",
          className:
            "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-slate-200",
          textClassName: "text-sm font-medium text-green-700",
        };
      }
    } else if (status === "rejected") {
      return {
        text: "요청 거절",
        className: "bg-slate-100 text-slate-700 border border-slate-300",
      };
    }
    return null;
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
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
                onRemove={(id: string) => {
                  setReturns((prev) => prev.filter((item) => item.id !== id));
                }}
                apiUrl={apiUrl}
                formatReturnType={formatReturnType}
                activeTab={activeTab}
                getStatusBadge={getStatusBadge}
              />
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function ReturnCard({
  returnItem,
  members,
  onRefresh,
  onRemove,
  apiUrl,
  formatReturnType,
  activeTab,
  getStatusBadge,
}: any) {
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [memo, setMemo] = useState(returnItem.memo || "");
  const [images, setImages] = useState<string[]>(returnItem.images || []);
  const [returnType, setReturnType] = useState(
    returnItem.return_type || "주문|반품"
  );
  const [showDetailModal, setShowDetailModal] = useState(false); // Add this state

  // Get return manager name from backend response
  const managerName = returnItem.returnManagerName || "";

  const isOrderReturn = returnType?.includes("주문");
  const isDefectiveReturn = returnType?.includes("불량");
  const showReturnTypeDropdown = isOrderReturn || isDefectiveReturn;
  const isExchange = returnType?.includes("교환");
  const isReturn = returnType?.includes("반품");
  const isProcessingTab = activeTab === "in-progress";
  const isHistoryTab = activeTab === "history";
  const isProcessingTabWithInputs = activeTab === "processing";

  const handleImageUpload = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("이미지 크기는 5MB 이하여야 합니다.");
        return;
      }

      // Check file type
      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 업로드 가능합니다.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newImages = [...images];
        newImages[index] = base64String;
        setImages(newImages);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = [...images];
    newImages[index] = "";
    setImages(newImages.filter((img, idx) => idx !== index || img !== ""));
  };

  const handleReturnTypeChange = async (newType: string) => {
    const oldType = returnType;
    setReturnType(newType);

    try {
      const { apiPut } = await import("../../lib/api");
      await apiPut(`${apiUrl}/order-returns/${returnItem.id}/return-type`, {
        return_type: newType,
      });
    } catch (err: any) {
      console.error("Failed to update return type:", err);
      // Revert on error
      setReturnType(oldType);
      alert("반품 유형 업데이트에 실패했습니다.");
    }
  };

  const handleProcessReturn = async () => {
    setProcessing(true);
    try {
      const { apiPost } = await import("../../lib/api");

      // IMPORTANT: /order-returns page'dan yuborilgan barcha product'lar /exchanges page'ga kelishi kerak
      // - Order returns: "주문|교환" (always exchange for exchanges page)
      // - Defective returns: "불량|교환" (convert to exchange for exchanges page)
      let finalReturnType: string;
      if (returnType?.includes("불량")) {
        // Defective product - convert to exchange type for exchanges page
        finalReturnType = "불량|교환";
      } else if (returnType?.includes("주문")) {
        // Order return - use exchange type if not already
        finalReturnType = returnType.includes("교환") ? returnType : "주문|교환";
      } else {
        // Default to "주문|교환" for order returns
        finalReturnType = "주문|교환";
      }

      const response = await apiPost(
        `${apiUrl}/order-returns/${returnItem.id}/process`,
        {
          memo: memo || null,
          returnManager: returnItem.return_manager || null,
          images: images,
          return_type: finalReturnType, // Always "주문|교환" for order-returns page
        }
      );

      console.log("Process return response:", response);

      // Remove the item from the list immediately
      if (onRemove) {
        onRemove(returnItem.id);
      }
      alert("반품 처리가 완료되었습니다.");
    } catch (err: any) {
      console.error("Failed to process return:", err);
      alert(err?.message || "오류가 발생했습니다.");
      // Only refresh on error to reload data
      onRefresh();
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmExchange = async () => {
    if (!confirm("교환 제품을 받으셨나요?")) {
      return;
    }

    setConfirming(true);
    try {
      const { apiPut } = await import("../../lib/api");
      await apiPut(
        `${apiUrl}/order-returns/${returnItem.id}/confirm-exchange`,
        {}
      );

      // Remove from list and refresh
      if (onRemove) {
        onRemove(returnItem.id);
      }
      onRefresh();
      alert("교환이 확인되었습니다.");
    } catch (err: any) {
      console.error("Failed to confirm exchange:", err);
      alert(err?.message || "오류가 발생했습니다.");
    } finally {
      setConfirming(false);
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

  const statusBadge = isHistoryTab
    ? getStatusBadge(returnType, returnItem.status)
    : null;

  return (
    <div>
      {/* Badge for in-progress tab - Outside the card */}
      {isProcessingTab && (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-slate-200">
            <svg
              className="w-4 h-4 text-green-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-green-700">
              {isExchange ? "교환하기" : "반품하기"}
            </span>
          </div>
        </div>
      )}
      {isHistoryTab && statusBadge && (
        <div className="mb-2 flex items-center gap-2">
          <div className={statusBadge.className}>
            <svg
              className="w-4 h-4 text-green-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span
              className={
                statusBadge.textClassName ||
                "text-sm font-medium text-green-700"
              }
            >
              {statusBadge.text}
            </span>
          </div>
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        {/* Header: Date/User, Status Badge (for history), Supplier | Return Type | Date */}
        <div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-3 dark:border-slate-600">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              공급처: {returnItem.supplierName || "알 수 없음"}{" "}
              {returnItem.managerName ? (
                <>
                  {returnItem.managerName}
                  {returnItem.managerPosition ? ` ${returnItem.managerPosition}` : " 대리"}
                </>
              ) : ""}
            </div>
            {returnItem.return_no && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                반품번호: {returnItem.return_no}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isProcessingTabWithInputs && showReturnTypeDropdown ? (
              <div className="relative">
                <select
                  value={returnType}
                  onChange={(e) => handleReturnTypeChange(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-1 pr-8 text-sm text-slate-700 appearance-none cursor-pointer hover:border-sky-400 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  {isOrderReturn ? (
                    <>
                      <option value="주문|교환">주문 | 교환</option>
                      <option value="주문|반품">주문 | 반품</option>
                    </>
                  ) : (
                    <>
                      <option value="불량|교환">불량 | 교환</option>
                      <option value="불량|반품">불량 | 반품</option>
                    </>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <svg
                    className="h-4 w-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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
            ) : (
              <select
                value={returnItem.return_type || ""}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 appearance-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                disabled
              >
                <option>
                  {formatReturnType(returnItem.return_type || "")}
                </option>
              </select>
            )}
            {isHistoryTab && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(
                    returnItem.inbound_date || returnItem.created_at
                  )}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {returnItem.created_by}
                </span>
              </div>
            )}
            {!isHistoryTab && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(
                  returnItem.inbound_date || returnItem.created_at
                )}
              </span>
            )}
          </div>
        </div>
        {/* Product Name */}
        <div className="mb-4"></div>
        {/* Product Details Row: 배치번호/주문번호, 입고, 미입고수량, 단가 */}
        <div className="mb-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {returnItem.product_name || "알 수 없음"}
          </h3>
          {/* Show 주문번호 for 주문 returns, 배치번호 for 불량 returns */}
          {isOrderReturn && returnItem.order_no && (
            <div className="flex items-center gap-1">
              <span className="font-medium">주문번호:</span>
              <span>{returnItem.order_no}</span>
            </div>
          )}
          {isDefectiveReturn && returnItem.batch_no && (
            <div className="flex items-center gap-1">
              <span className="font-medium">배치번호:</span>
              <span>{returnItem.batch_no}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-medium">입고:</span>
            <span>
              {formatDate(returnItem.inbound_date || returnItem.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">
              {isHistoryTab
                ? "교환수량:"
                : isExchange
                  ? "교환수량:"
                  : isDefectiveReturn
                    ? "불량수량:"
                    : "교환수량:"}
            </span>
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
            <span className="font-medium">단가:</span>
            <span className="font-semibold text-blue-600 underline dark:text-blue-400">
              {returnItem.unit_price?.toLocaleString() || 0}원
            </span>
          </div>
        </div>

        {/* Memo Input and Camera Buttons (only for processing tab) */}
        {isProcessingTabWithInputs && (
          <>
            <div className="mb-4 flex items-center gap-3">
              {/* Memo Input */}
              <div className="flex-1">
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={showReturnTypeDropdown ? "출고의 메모" : "메모"}
                  className="w-full h-12 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:border-sky-400 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Camera Buttons */}
              <div className="flex-shrink-0 flex gap-2">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="relative">
                    {images[idx] ? (
                      <div className="relative h-12 w-12">
                        <img
                          src={images[idx]}
                          alt={`Upload ${idx + 1}`}
                          className="h-full w-full rounded-lg object-cover border-2 border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs text-white hover:bg-rose-600"
                        >
                          ×
                        </button>
                        <label className="absolute inset-0 cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(idx, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-xl hover:border-sky-400 dark:border-slate-600 dark:bg-slate-700">
                        📷
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(idx, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Return Manager & Process Button (only for 주문 or 불량 returns) */}
            {showReturnTypeDropdown && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    반품 담당자:
                  </label>
                  <span className="text-sm text-slate-900 dark:text-slate-200">
                    {managerName || "담당자 없음"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDetailModal(true)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  >
                    상세보기
                  </button>
                  <button
                    onClick={handleProcessReturn}
                    disabled={processing}
                    className="rounded-lg bg-rose-600 px-6 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-600"
                  >
                    {processing
                      ? "처리 중..."
                      : returnType === "주문|교환" || returnType === "불량|교환"
                        ? "교환하기"
                        : "반품하기"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Confirm Exchange Button (only for in-progress tab with exchange type) */}
        {isProcessingTab && isExchange && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                반품 담당자:
              </label>
              <span className="text-sm text-slate-900 dark:text-slate-200">
                {managerName || "담당자 없음"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDetailModal(true)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                상세보기
              </button>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                교환 제품 받아셨어요?
              </span>
              <button
                onClick={handleConfirmExchange}
                disabled={confirming}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {confirming ? "확인 중..." : "확인"}
              </button>
            </div>
          </div>
        )}

        {/* Return Manager (only for in-progress tab with return type - no button) */}
        {isProcessingTab && isReturn && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                반품 담당자:
              </label>
              <span className="text-sm text-slate-900 dark:text-slate-200">
                {managerName || "담당자 없음"}님
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                공급처 확인 대기 중...
              </span>
              <button
                onClick={() => setShowDetailModal(true)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                상세보기
              </button>
            </div>
          </div>
        )}

        {/* History Tab - No buttons, just display info */}
        {isHistoryTab && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                반품 담당자:
              </label>
              <span className="text-sm text-slate-900 dark:text-slate-200">
                {managerName || "담당자 없음"}님
              </span>
            </div>
            <button
              onClick={() => setShowDetailModal(true)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              상세보기
            </button>
          </div>
        )}
      </div>

      {/* Add the Detail Modal before the closing </div> tags */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl">
            {/* Header with Title and Close Button */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {formatReturnType(returnType || returnItem.return_type || "")}
              </h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Memo/Description */}
              <div>
                <p className="text-sm text-slate-700">
                  {returnItem.memo || "메모 없음"}
                </p>
              </div>

              {/* Images */}
              <div className="flex gap-2">
                {[0, 1, 2].map((idx) => {
                  const imageUrl = returnItem.images?.[idx] || images[idx];
                  return (
                    <div key={idx} className="flex-1 aspect-square">
                      {imageUrl ? (
                        <img
                          src={
                            imageUrl.startsWith("data:")
                              ? imageUrl
                              : `${apiUrl}${imageUrl}`
                          }
                          alt={`Image ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg border border-slate-200"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center">
                          <span className="text-xs text-slate-400">
                            이미지 없음
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Sender Information */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600">
                  출고자:{" "}
                  {managerName || returnItem.returnManagerName || "담당자 없음"}
                  님
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
