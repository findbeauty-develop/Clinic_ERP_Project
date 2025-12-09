"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../lib/api";

type SupplierOrderItem = {
  id: string;
  productId?: string | null;
  productName: string;
  brand?: string | null;
  batchNo?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  memo?: string | null;
};

type SupplierOrder = {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  memo?: string | null;
  orderDate: string;
  clinic?: {
    tenantId?: string | null;
    name?: string | null;
    managerName?: string | null;
  };
  items: SupplierOrderItem[];
};

type OrdersResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  orders: SupplierOrder[];
};

const statusLabels: Record<string, string> = {
  pending: "주문 대기",
  confirmed: "클리닉 확인중",
  rejected: "거절됨",
  shipped: "출고됨",
  completed: "진행 완료",
};

const tabs = [
  { key: "pending", label: "주문 목록" },
  { key: "confirmed", label: "클리닉 확인중" },
  { key: "all", label: "주문 내역" },
];

const formatNumber = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString();

type ItemAdjustment = {
  itemId: string;
  actualQuantity: number;
  actualPrice: number;
  quantityChangeReason?: string;
  quantityChangeNote?: string;
  priceChangeReason?: string;
  priceChangeNote?: string;
};

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "confirmed" | "all">(
    "pending"
  );
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); // Item ID'lar
  const [detailOrder, setDetailOrder] = useState<SupplierOrder | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<SupplierOrder | null>(null);
  const [itemAdjustments, setItemAdjustments] = useState<Record<string, ItemAdjustment>>({});
  const [rejectOrder, setRejectOrder] = useState<SupplierOrder | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const statusParam = useMemo(() => {
    if (activeTab === "all") return "all";
    return activeTab;
  }, [activeTab]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<OrdersResponse>(
        `/supplier/orders?status=${statusParam}`
      );
      setOrders(data.orders || []);
      setSelectedItems(new Set());
    } catch (err: any) {
      setError(err?.message || "주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [statusParam]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleSelectItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllItemsInOrder = (order: SupplierOrder) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      
      // Check if all items in this order are already selected
      const allSelected = order.items.every((item) => prev.has(item.id));
      
      if (allSelected) {
        // Deselect all items in this order
        order.items.forEach((item) => next.delete(item.id));
      } else {
        // Select all items in this order
        order.items.forEach((item) => next.add(item.id));
      }
      
      return next;
    });
  };

  const selectAll = () => {
    if (orders.length === 0) return;
    const allItemIds = orders.flatMap((o) => o.items.map((item) => item.id));
    setSelectedItems(new Set(allItemIds));
  };

  const clearSelection = () => setSelectedItems(new Set());

  const handleStatusUpdate = async (status: string, orderIds?: string[]) => {
    // If orderIds provided, use them directly (from card buttons)
    if (orderIds && orderIds.length > 0) {
      setUpdating(true);
      try {
        await Promise.all(
          orderIds.map((id) =>
            apiPut(`/supplier/orders/${id}/status`, { status })
          )
        );
        await fetchOrders();
      } catch (err: any) {
        alert(err?.message || "상태 변경에 실패했습니다.");
      } finally {
        setUpdating(false);
      }
      return;
    }

    // Otherwise, find orders that have selected items
    const orderIdsToUpdate = new Set<string>();
    orders.forEach((order) => {
      // If any item in this order is selected, update the entire order
      if (order.items.some((item) => selectedItems.has(item.id))) {
        orderIdsToUpdate.add(order.id);
      }
    });

    if (orderIdsToUpdate.size === 0) {
      alert("선택된 항목이 없습니다.");
      return;
    }

    setUpdating(true);
    try {
      await Promise.all(
        Array.from(orderIdsToUpdate).map((id) =>
          apiPut(`/supplier/orders/${id}/status`, { status })
        )
      );
      await fetchOrders();
    } catch (err: any) {
      alert(err?.message || "상태 변경에 실패했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  const fetchOrderDetail = async (id: string) => {
    try {
      const data = await apiGet<SupplierOrder>(`/supplier/orders/${id}`);
      setDetailOrder(data);
    } catch (err: any) {
      alert(err?.message || "주문 상세를 불러오지 못했습니다.");
    }
  };

  const renderStatusBadge = (status: string) => {
    const label = statusLabels[status] || status;
    const color =
      status === "pending"
        ? "bg-amber-100 text-amber-700"
        : status === "confirmed"
        ? "bg-blue-100 text-blue-700"
        : status === "rejected"
        ? "bg-red-100 text-red-700"
        : status === "completed"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-700";
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>
        {label}
      </span>
    );
  };

  // Helper function to extract rejection reason from memo
  const extractRejectionReason = (memo: string | null | undefined): string | null => {
    if (!memo) return null;
    const match = memo.match(/\[거절 사유:\s*([^\]]+)\]/);
    return match ? match[1].trim() : null;
  };

  const renderOrderCard = (order: SupplierOrder) => {
    const date = new Date(order.orderDate);
    const dateStr = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
      date.getHours()
    ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

    const isRejected = order.status === "rejected";

    return (
      <div
        key={order.id}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        {/* Top: Date and Order Number */}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm text-slate-500">{dateStr}</div>
          <div className="text-xs text-slate-500">
            주문번호 {order.orderNo}
          </div>
        </div>

        {/* Clinic Name and Status */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-slate-900">
            {order.clinic?.name || "클리닉"}{" "}
            <span className="text-sm text-slate-500">
              {order.clinic?.managerName || ""}님
            </span>
          </div>
          {renderStatusBadge(order.status)}
        </div>

        <div className="divide-y divide-slate-100">
          {order.items.map((item) => {
            const rejectionReason = isRejected ? extractRejectionReason(item.memo) : null;
            
            return (
              <div
                key={item.id}
                className={`grid gap-2 py-2 text-sm text-slate-700 items-center ${
                  isRejected ? "grid-cols-4" : "grid-cols-5"
                }`}
              >
                <div className={`flex items-center gap-2 ${isRejected ? "col-span-1" : "col-span-1"}`}>
                  {!isRejected && activeTab === "pending" && (
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                  <span className="truncate font-medium">{item.productName}</span>
                </div>
                <div className="text-slate-500">{item.brand || "-"}</div>
                <div className="text-slate-500">{item.quantity}개</div>
                {isRejected ? (
                  <div className="text-right text-slate-400 text-xs">
                    {rejectionReason || "거절 사유 없음"}
                  </div>
                ) : (
                  <div className="col-span-2 text-right font-semibold">
                    {formatNumber(item.totalPrice)}원
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Total Amount - Only show if not rejected */}
        {!isRejected && (
          <div className="mt-3 border-t border-slate-200 pt-2">
            <div className="text-right text-sm font-semibold text-slate-900">
              총금액 {formatNumber(order.totalAmount)} 원
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {activeTab === "pending" && (
            <button
              onClick={() => selectAllItemsInOrder(order)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {order.items.every((item) => selectedItems.has(item.id)) ? "선택 해제" : "전체 선택"}
            </button>
          )}
          {order.status === "pending" && activeTab === "pending" && (
            <div className="flex gap-2">
              <button
                disabled={updating}
                onClick={() => {
                  // Initialize rejection reasons for all items
                  const initialReasons: Record<string, string> = {};
                  order.items.forEach((item) => {
                    initialReasons[item.id] = "";
                  });
                  setRejectionReasons(initialReasons);
                  setRejectOrder(order);
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                주문 거절
              </button>
              <button
                disabled={updating}
                onClick={() => {
                  // Initialize adjustments for this order
                  const initialAdjustments: Record<string, ItemAdjustment> = {};
                  order.items.forEach((item) => {
                    initialAdjustments[item.id] = {
                      itemId: item.id,
                      actualQuantity: item.quantity,
                      actualPrice: item.unitPrice,
                    };
                  });
                  setItemAdjustments(initialAdjustments);
                  setConfirmOrder(order);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                주문 접수
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const selectedCount = selectedItems.size;
  
  // Check if any selected items belong to pending orders
  const hasPendingSelected = orders.some((order) =>
    order.status === "pending" && order.items.some((item) => selectedItems.has(item.id))
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">주문</h1>
            <p className="mt-1 text-sm text-slate-500">
              재고 부족 및 유효기한 임박 제품을 주문하고 관리하세요
            </p>
          </div>
          <button
            onClick={() => fetchOrders()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            새로고침
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() =>
                setActiveTab(tab.key as "pending" | "confirmed" | "all")
              }
              className={`rounded-md px-4 py-2 text-sm font-semibold ${
                activeTab === tab.key
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm">
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            주문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => renderOrderCard(order))}
          </div>
        )}
      </div>

      {detailOrder && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="text-sm text-slate-500">
                  {new Date(detailOrder.orderDate).toLocaleString()}
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {detailOrder.clinic?.name || "클리닉"}{" "}
                  <span className="text-sm text-slate-500">
                    {detailOrder.clinic?.managerName || ""}님
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  주문번호 {detailOrder.orderNo}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderStatusBadge(detailOrder.status)}
                <button
                  onClick={() => setDetailOrder(null)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-6 py-4">
              <div className={`mb-3 grid text-xs font-semibold text-slate-500 ${
                detailOrder.status === "rejected" ? "grid-cols-4" : "grid-cols-6"
              }`}>
                <div className="col-span-2">제품</div>
                <div>브랜드</div>
                <div className="text-right">수량</div>
                {detailOrder.status === "rejected" ? (
                  <div className="text-right">거절 사유</div>
                ) : (
                  <>
                    <div className="text-right">단가</div>
                    <div className="text-right">금액</div>
                  </>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {detailOrder.items.map((item) => {
                  const rejectionReason = detailOrder.status === "rejected" 
                    ? extractRejectionReason(item.memo) 
                    : null;
                  
                  return (
                    <div
                      key={item.id}
                      className={`grid py-2 text-sm text-slate-700 ${
                        detailOrder.status === "rejected" ? "grid-cols-4" : "grid-cols-6"
                      }`}
                    >
                      <div className="col-span-2 truncate font-medium">
                        {item.productName}
                      </div>
                      <div className="truncate text-slate-500">
                        {item.brand || "-"}
                      </div>
                      <div className="text-right">{item.quantity}개</div>
                      {detailOrder.status === "rejected" ? (
                        <div className="text-right text-slate-400 text-xs">
                          {rejectionReason || "거절 사유 없음"}
                        </div>
                      ) : (
                        <>
                          <div className="text-right">
                            {formatNumber(item.unitPrice)}원
                          </div>
                          <div className="text-right font-semibold">
                            {formatNumber(item.totalPrice)}원
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="text-sm text-slate-600">
                  메모: {detailOrder.memo || "없음"}
                </div>
                {detailOrder.status !== "rejected" && (
                  <div className="text-lg font-bold text-slate-900">
                    총 {formatNumber(detailOrder.totalAmount)}원
                  </div>
                )}
              </div>
            </div>

            {detailOrder.status === "pending" && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  disabled={updating}
                  onClick={() =>
                    handleStatusUpdate("rejected", [detailOrder.id]).then(() =>
                      setDetailOrder(null)
                    )
                  }
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  주문 거절
                </button>
                <button
                  disabled={updating}
                  onClick={() =>
                    handleStatusUpdate("confirmed", [detailOrder.id]).then(() =>
                      setDetailOrder(null)
                    )
                  }
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  주문 접수
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Order Modal */}
      {confirmOrder && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-2 sm:px-4">
          <div className="w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 bg-white px-4 sm:px-6 py-3 sm:py-4">
              {/* Header Row */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs sm:text-sm text-slate-900">
                  {new Date(confirmOrder.orderDate).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  }).replace(/\. /g, '-').replace('.', '')}
                </div>
                <button
                  onClick={() => {
                    setConfirmOrder(null);
                    setItemAdjustments({});
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Clinic Info - No Avatar */}
              <div className="flex items-center gap-2 mb-4">
                <div className="text-sm font-semibold text-slate-900">
                  {confirmOrder.clinic?.name || "클리닉"}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {confirmOrder.clinic?.managerName || ""}님
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
              {confirmOrder.items.map((item) => {
                const adjustment = itemAdjustments[item.id] || {
                  itemId: item.id,
                  actualQuantity: item.quantity,
                  actualPrice: item.unitPrice,
                };
                const qtyChanged = adjustment.actualQuantity !== item.quantity;
                const priceChanged = adjustment.actualPrice !== item.unitPrice;

                return (
                  <div key={item.id} className="space-y-2">
                    {/* Product Row - Compact Layout */}
                    <div className="flex items-center gap-2 text-sm">
                      {/* Product Name */}
                      <div className="w-20 font-medium text-slate-900 text-xs">{item.productName}</div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={adjustment.actualQuantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setItemAdjustments((prev) => ({
                              ...prev,
                              [item.id]: { ...adjustment, actualQuantity: val },
                            }));
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-1 text-center text-xs text-slate-900 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-600 text-xs whitespace-nowrap">/ {item.quantity}개</span>
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={adjustment.actualPrice}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setItemAdjustments((prev) => ({
                              ...prev,
                              [item.id]: { ...adjustment, actualPrice: val },
                            }));
                          }}
                          className="w-20 rounded border border-slate-300 px-1 py-1 text-center text-xs text-slate-900 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-600 text-xs whitespace-nowrap">/ {formatNumber(item.unitPrice)} 원</span>
                      </div>

                      {/* Total */}
                      <div className="ml-auto text-right font-semibold text-slate-900 text-xs whitespace-nowrap">
                        {formatNumber(adjustment.actualQuantity * adjustment.actualPrice)} 원
                      </div>
                    </div>

                    {/* Change Reason Dropdowns (Side by side if both changed) */}
                    {(qtyChanged || priceChanged) && (
                      <div className="ml-0 space-y-2">
                        <div className="flex gap-2">
                          {/* Quantity Change Reason */}
                          {qtyChanged && (
                            <div className="flex-1 rounded border border-slate-200 bg-slate-50 p-2">
                              <select
                                value={adjustment.quantityChangeReason || ""}
                                onChange={(e) => {
                                  setItemAdjustments((prev) => ({
                                    ...prev,
                                    [item.id]: { ...adjustment, quantityChangeReason: e.target.value },
                                  }));
                                }}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white text-slate-900 font-medium"

                              >
                                <option value="">수량 변동 사유</option>
                                <option value="제품단종">제품단종</option>
                                <option value="재고부족">재고부족</option>
                                <option value="메모">직접 입력</option>
                              </select>
                              {adjustment.quantityChangeReason === '메모' && (
                                <input
                                  type="text"
                                  placeholder="메모"
                                  value={adjustment.quantityChangeNote || ""}
                                  onChange={(e) => {
                                    setItemAdjustments((prev) => ({
                                      ...prev,
                                      [item.id]: { ...adjustment, quantityChangeNote: e.target.value },
                                    }));
                                  }}
                                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                                />
                              )}
                            </div>
                          )}

                          {/* Price Change Reason */}
                          {priceChanged && (
                            <div className="flex-1 rounded border border-slate-200 bg-slate-50 p-2">
                              <select
                                value={adjustment.priceChangeReason || ""}
                                onChange={(e) => {
                                  setItemAdjustments((prev) => ({
                                    ...prev,
                                    [item.id]: { ...adjustment, priceChangeReason: e.target.value },
                                  }));
                                }}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white text-slate-900 font-medium"

                              >
                                <option value="">가격 변동 사유</option>
                                <option value="환률변동">환률변동</option>
                                <option value="원자재 가격 변동">원자재 가격 변동</option>
                                <option value="메모">직접 입력</option>
                              </select>
                              {adjustment.priceChangeReason === '메모' && (
                                <input
                                  type="text"
                                  placeholder="메모"
                                  value={adjustment.priceChangeNote || ""}
                                  onChange={(e) => {
                                    setItemAdjustments((prev) => ({
                                      ...prev,
                                      [item.id]: { ...adjustment, priceChangeNote: e.target.value },
                                    }));
                                  }}
                                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 sm:py-4">
              <div className="text-sm sm:text-base font-bold text-slate-900">
                총 {formatNumber(
                  Object.values(itemAdjustments).reduce(
                    (sum, adj) => sum + adj.actualQuantity * adj.actualPrice,
                    0
                  )
                )}원
              </div>
              <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-0.9 py-2">
  {/* Left: 취소 */}
  <button
    onClick={() => {
      setConfirmOrder(null);
      setItemAdjustments({});
    }}
    className="rounded-lg border border-slate-300 px-4 sm:px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
  >
    취소
  </button>
  
  {/* Right: 판매가 확인 후 접수 */}
  <button
    disabled={updating}
    onClick={async () => {
      setUpdating(true);
      try {
        // Prepare adjustments array
        const adjustments = Object.values(itemAdjustments).map((adj) => ({
          itemId: adj.itemId,
          actualQuantity: adj.actualQuantity,
          actualPrice: adj.actualPrice,
          quantityChangeReason: adj.quantityChangeReason || null,
          quantityChangeNote: adj.quantityChangeNote || null,
          priceChangeReason: adj.priceChangeReason || null,
          priceChangeNote: adj.priceChangeNote || null,
        }));

        // Call API to update status with adjustments
        await apiPut(`/supplier/orders/${confirmOrder.id}/status`, {
          status: "confirmed",
          adjustments,
        });

        alert("주문이 접수되었습니다.");
        setConfirmOrder(null);
        setItemAdjustments({});
        await fetchOrders();
      } catch (err: any) {
        alert(err?.message || "주문 접수에 실패했습니다.");
      } finally {
        setUpdating(false);
      }
    }}
    className="rounded-lg bg-emerald-600 px-4 sm:px-6 py-2 text-sm sm:text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
  >
    판매가 확인 후 접수
  </button>
</div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectOrder && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-2 sm:px-4">
          <div className="w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 bg-white px-4 sm:px-6 py-3 sm:py-4">
              {/* Header Row */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs sm:text-sm text-slate-900">
                  {new Date(rejectOrder.orderDate).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  }).replace(/\. /g, '-').replace('.', '')}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm sm:text-base font-semibold text-slate-900">
                    금액: {formatNumber(rejectOrder.totalAmount)} 원
                  </div>
                  <button
                    onClick={() => {
                      setRejectOrder(null);
                      setRejectionReasons({});
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Clinic Info */}
              <div className="flex items-center gap-2 mb-4">
                <div className="text-sm font-semibold text-slate-900">
                  {rejectOrder.clinic?.name || "클리닉"}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {rejectOrder.clinic?.managerName || ""}님
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
              {rejectOrder.items.map((item) => (
                <div key={item.id} className="space-y-2 border-b border-slate-100 pb-4 last:border-b-0">
                  {/* Product Info Row */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="font-medium text-slate-900">{item.productName}</div>
                    <div className="text-slate-500">{item.brand || "-"}</div>
                    <div className="ml-auto flex items-center gap-4">
                      <div className="text-slate-600">{item.quantity}개</div>
                      <div className="text-slate-600">{formatNumber(item.unitPrice)}</div>
                      <div className="font-semibold text-slate-900">
                        {formatNumber(item.totalPrice)}
                      </div>
                    </div>
                  </div>

                  {/* Rejection Reason Input */}
                  <div>
                    <input
                      type="text"
                      placeholder="거절 사유를 입력해주세요."
                      value={rejectionReasons[item.id] || ""}
                      onChange={(e) => {
                        setRejectionReasons((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }));
                      }}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none dark:border-slate-600 dark:bg-slate-50 dark:text-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 sm:px-6 py-3 sm:py-4">
              <div className="text-sm sm:text-base font-bold text-slate-900">
                가격
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRejectOrder(null);
                    setRejectionReasons({});
                  }}
                  className="rounded-lg border border-slate-300 px-4 sm:px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  disabled={updating}
                  onClick={async () => {
                    // Validate: at least one rejection reason should be provided
                    const hasReasons = Object.values(rejectionReasons).some((reason) => reason.trim() !== "");
                    if (!hasReasons) {
                      alert("최소 하나의 거절 사유를 입력해주세요.");
                      return;
                    }

                    setUpdating(true);
                    try {
                      // Call API to update status to rejected with reasons
                      await apiPut(`/supplier/orders/${rejectOrder.id}/status`, {
                        status: "rejected",
                        rejectionReasons: rejectionReasons,
                      });

                      alert("주문이 거절되었습니다.");
                      setRejectOrder(null);
                      setRejectionReasons({});
                      await fetchOrders();
                    } catch (err: any) {
                      alert(err?.message || "주문 거절에 실패했습니다.");
                    } finally {
                      setUpdating(false);
                    }
                  }}
                  className="rounded-lg bg-rose-600 px-4 sm:px-6 py-2 text-sm sm:text-base font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  주문 거절
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

