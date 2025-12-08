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
  confirmed: "입고 확인 대기",
  rejected: "거절됨",
  shipped: "출고됨",
  completed: "완료",
};

const tabs = [
  { key: "pending", label: "주문 목록" },
  { key: "confirmed", label: "입고 확인 대기" },
  { key: "all", label: "주문 내역" },
];

const formatNumber = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString();

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

  const renderOrderCard = (order: SupplierOrder) => {
    const date = new Date(order.orderDate);
    const dateStr = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
      date.getHours()
    ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

    return (
      <div
        key={order.id}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">{dateStr}</div>
            <div className="text-lg font-semibold text-slate-900">
              {order.clinic?.name || "클리닉"}{" "}
              <span className="text-sm text-slate-500">
                {order.clinic?.managerName || ""}님
              </span>
            </div>
            <div className="text-xs text-slate-500">
              주문번호 {order.orderNo}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {renderStatusBadge(order.status)}
            <div className="text-right text-sm font-semibold text-slate-900">
              금액 {formatNumber(order.totalAmount)} 원
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-5 gap-2 py-2 text-sm text-slate-700 items-center"
            >
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleSelectItem(item.id)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="truncate font-medium">{item.productName}</span>
              </div>
              <div className="text-slate-500">{item.brand || "-"}</div>
              <div className="text-right">{item.quantity}개</div>
              <div className="text-right font-semibold">
                {formatNumber(item.totalPrice)}원
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => selectAllItemsInOrder(order)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {order.items.every((item) => selectedItems.has(item.id)) ? "선택 해제" : "전체 선택"}
          </button>
          {order.status === "pending" && (
            <div className="flex gap-2">
              <button
                disabled={updating}
                onClick={() => handleStatusUpdate("rejected", [order.id])}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                주문 거절
              </button>
              <button
                disabled={updating}
                onClick={() => handleStatusUpdate("confirmed", [order.id])}
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
        <h1 className="text-2xl font-bold text-slate-900">주문</h1>
        <p className="mt-1 text-sm text-slate-500">
          재고 부족 및 유효기한 임박 제품을 주문하고 관리하세요
        </p>

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
              <div className="mb-3 grid grid-cols-6 text-xs font-semibold text-slate-500">
                <div className="col-span-2">제품</div>
                <div>브랜드</div>
                <div className="text-right">수량</div>
                <div className="text-right">단가</div>
                <div className="text-right">금액</div>
              </div>
              <div className="divide-y divide-slate-100">
                {detailOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-6 py-2 text-sm text-slate-700"
                  >
                    <div className="col-span-2 truncate font-medium">
                      {item.productName}
                    </div>
                    <div className="truncate text-slate-500">
                      {item.brand || "-"}
                    </div>
                    <div className="text-right">{item.quantity}개</div>
                    <div className="text-right">
                      {formatNumber(item.unitPrice)}원
                    </div>
                    <div className="text-right font-semibold">
                      {formatNumber(item.totalPrice)}원
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="text-sm text-slate-600">
                  메모: {detailOrder.memo || "없음"}
                </div>
                <div className="text-lg font-bold text-slate-900">
                  총 {formatNumber(detailOrder.totalAmount)}원
                </div>
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
    </div>
  );
}

