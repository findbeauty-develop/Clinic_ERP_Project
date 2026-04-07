"use client";

import { useState, useEffect, useMemo, useCallback, memo } from "react";

export default function OrderReturnsPage() {
  const [activeTab, setActiveTab] = useState<
    "processing" | "in-progress" | "history"
  >("processing");
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // ✅ REMOVED: members state - not used and requires "owner" role

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL || "https://api.jaclit.com",
    []
  );

  // ✅ REMOVED: fetchMembers - not used and requires "owner" role
  // const fetchMembers = useCallback(async () => {
  //   try {
  //     const { apiGet } = await import("../../lib/api");
  //     const data = await apiGet<any[]>(`${apiUrl}/iam/members`);
  //     setMembers(data || []);
  //   } catch (err) {
  //     // Silent error handling
  //   }
  // }, [apiUrl]);

  const fetchReturns = useCallback(async () => {
    const statusMap = {
      processing: "pending",
      "in-progress": "processing",
      history: "history",
    };
    const status = statusMap[activeTab];

    setLoading(true);
    try {
      const { apiGet } = await import("../../lib/api");
      const data = await apiGet<any[]>(
        `${apiUrl}/order-returns?status=${status}`
      );
      setReturns(data || []);
    } catch (err) {
      // Silent error handling
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeTab]);

  useEffect(() => {
    // ✅ REMOVED: fetchMembers - not used and requires "owner" role
    fetchReturns().catch(() => {
      // Silent error handling
    });
  }, [fetchReturns]);

  const formatReturnType = (returnType: string) => {
    if (returnType === "defective_exchange") return "교환";
    if (returnType === "defective_return") return "반품";
    if (returnType.includes("교환") && !returnType.includes("반품"))
      return returnType.includes("주문") ? "주문 | 교환" : "교환";
    if (returnType.includes("반품"))
      return returnType.includes("주문") ? "주문 | 반품" : "반품";
    return returnType;
  };

  const getStatusBadge = (returnType: string, status: string) => {
    if (status === "completed") {
      if (returnType === "defective_exchange" || returnType?.includes("교환")) {
        return {
          text: "교환완료",
          className:
            "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-slate-200",
          textClassName: "text-sm font-medium text-green-700",
        };
      } else if (
        returnType === "defective_return" ||
        returnType?.includes("반품")
      ) {
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
        className:
          "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800",
        textClassName: "text-sm font-medium text-red-800 dark:text-red-200",
        iconClassName: "w-4 h-4 text-red-600 dark:text-red-400",
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
                onRefresh={() => {
                  fetchReturns();
                }}
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

const ReturnCard = memo(function ReturnCard({
  returnItem,
  onRefresh,
  onRemove,
  apiUrl,
  formatReturnType,
  activeTab,
  getStatusBadge,
}: any) {
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [images, setImages] = useState<string[]>(returnItem.images || []);
  const memoFromOutbound = (returnItem.memo || "").trim();
  /** 빈 값 = 페이지 진입 시 기본 "사유 선택" (서버 동기화 없음) */
  const [returnType, setReturnType] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false); // Add this state
  const [returnManagerName, setReturnManagerName] = useState("");

  useEffect(() => {
    setReturnType("");
  }, [returnItem.id]);

  // Get return manager name from backend response (for display in non-editable tabs)
  const managerName = returnItem.returnManagerName || "";

  const showReturnTypeDropdown = true;

  const isProcessingTab = activeTab === "in-progress";
  const isHistoryTab = activeTab === "history";
  const isProcessingTabWithInputs = activeTab === "processing";

  // 반품 처리: 사유 선택 전엔 returnType만 사용. 반품 진행중/내역: 서버 defective_return_type으로 확인 버튼 등 표시
  const typeForRules = isProcessingTabWithInputs
    ? returnType
    : returnType === "defective_exchange" || returnType === "defective_return"
      ? returnType
      : returnItem.defective_return_type || "";

  const isExchange =
    typeForRules === "defective_exchange" || typeForRules?.includes("교환");
  const isReturn =
    typeForRules === "defective_return" ||
    (typeForRules?.includes("반품") && !typeForRules?.includes("교환"));

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
    // "사유 선택" — 로컬만 초기화, API 호출 없음
    if (newType === "") {
      setReturnType("");
      return;
    }
    if (newType !== "defective_exchange" && newType !== "defective_return") {
      return;
    }
    const oldType = returnType;
    setReturnType(newType);

    try {
      const { apiPut } = await import("../../lib/api");
      await apiPut(`${apiUrl}/order-returns/${returnItem.id}/return-type`, {
        defective_return_type: newType,
      });
    } catch (err: any) {
      console.error("Failed to update return type:", err);
      // Revert on error
      setReturnType(oldType);
      alert("반품 유형 업데이트에 실패했습니다.");
    }
  };

  const handleProcessReturn = async () => {
    // Continue with normal processing
    await processReturn();
  };

  const processReturn = async () => {
    if (
      returnType !== "defective_exchange" &&
      returnType !== "defective_return"
    ) {
      alert("반품 유형(사유)을 선택해주세요.");
      return;
    }
    setProcessing(true);
    try {
      const { apiPost } = await import("../../lib/api");

      const response = await apiPost(
        `${apiUrl}/order-returns/${returnItem.id}/process`,
        {
          memo: memoFromOutbound || null,
          returnManager: returnManagerName || null,
          images: images,
          defective_return_type: returnType,
        }
      );

      // Remove the item from the list immediately
      if (onRemove) {
        onRemove(returnItem.id);
      }
      alert("반품 처리가 완료되었습니다.");
    } catch (err: any) {
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
    ? getStatusBadge(
        returnType || returnItem.defective_return_type || "",
        returnItem.status
      )
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
              className={
                statusBadge.iconClassName || "w-4 h-4 text-green-700"
              }
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
                  {returnItem.managerPosition
                    ? ` ${returnItem.managerPosition}`
                    : " 대리"}
                </>
              ) : (
                ""
              )}
            </div>
            {returnItem.defective_return_no && (
              <div className="text-xs text-slate-500 dark:text-slate-400 break-all">
                반품번호: {returnItem.defective_return_no}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isProcessingTabWithInputs && showReturnTypeDropdown ? (
              <div className="relative inline-block">
                <select
                  value={returnType}
                  onChange={(e) => handleReturnTypeChange(e.target.value)}
                  className="appearance-none rounded-lg border-2 border-slate-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-700 cursor-pointer hover:border-sky-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-sky-500 dark:focus:border-sky-500 dark:focus:ring-sky-800 transition-all"
                  style={{
                    color: returnType === "" ? "#94a3b8" : "#1e293b",
                    minWidth: "140px",
                  }}
                >
                  <option value="">사유 선택</option>
                  <option value="defective_exchange">불량 | 교환</option>
                  <option value="defective_return">불량 | 반품</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg
                    className="h-5 w-5 text-slate-400"
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
                value={returnItem.defective_return_type || ""}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 appearance-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                disabled
              >
                <option>
                  {formatReturnType(returnItem.defective_return_type || "")}
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
        {/* Product Details Row: 입고, 수량, 단가 */}
        <div className="mb-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {returnItem.product_name || "알 수 없음"}
          </h3>
          <div className="flex items-center gap-1">
            <span className="font-medium">입고:</span>
            <span>
              {formatDate(returnItem.inbound_date || returnItem.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">
              {isHistoryTab
                ? returnItem.defective_return_type === "defective_exchange"
                  ? "교환수량:"
                  : "반품수량:"
                : isExchange
                  ? "교환수량:"
                  : "반품수량:"}
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
              {Number(
                returnItem.unit_price ?? returnItem.unitPrice ?? 0
              ).toLocaleString()}
              원
            </span>
          </div>
        </div>

        {/* Memo Input and Camera Buttons (only for processing tab) */}
        {isProcessingTabWithInputs && (
          <>
            <div className="mb-4 flex items-center gap-3">
              {/* Memo: 출고 시 입력, 읽기 전용 */}
              <div className="flex-1 min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  메모 (출고)
                </label>
                <textarea
                  readOnly
                  value={returnItem.memo || ""}
                  placeholder="출고 시 입력한 메모가 여기에 표시됩니다"
                  rows={2}
                  className="w-full resize-none rounded-lg border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 cursor-default dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
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
                          loading="lazy"
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
                      <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-400 hover:border-sky-400 hover:text-sky-500 transition-colors dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500 dark:hover:text-sky-400">
                        <svg
                          className="h-6 w-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
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

            {/* Return Manager & Process Button (defective / damaged returns) */}
            {showReturnTypeDropdown && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    반품 담당자:
                  </label>
                  <input
                    type="text"
                    value={returnManagerName}
                    onChange={(e) => setReturnManagerName(e.target.value)}
                    placeholder="담당자 이름 입력"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3">
                  {/* <button
                    onClick={() => setShowDetailModal(true)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  >
                    상세보기1
                  </button> */}
                  <button
                    onClick={handleProcessReturn}
                    disabled={
                      processing ||
                      !returnManagerName.trim() ||
                      !memoFromOutbound ||
                      (returnType !== "defective_exchange" &&
                        returnType !== "defective_return")
                    }
                    className="rounded-lg bg-rose-600 px-6 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-rose-500 dark:hover:bg-rose-600"
                  >
                    {processing
                      ? "처리 중..."
                      : returnType === "defective_exchange" ||
                          returnType?.includes("교환")
                        ? "교환하기"
                        : returnType === "defective_return"
                          ? "반품하기"
                          : "유형 선택"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Exchange: supplier «요청 확인» 전에는 요청 중(회색), 이후에만 확인 */}
        {isProcessingTab && isExchange && (
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
              <button
                onClick={() => setShowDetailModal(true)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                상세보기
              </button>
              {returnItem.supplier_accepted_at ? (
                <>
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
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-200 px-6 py-2 text-sm font-semibold text-slate-500 cursor-not-allowed dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                >
                  요청 중
                </button>
              )}
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
                {formatReturnType(
                  returnType || returnItem.defective_return_type || ""
                )}
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
                          loading="lazy"
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
});
