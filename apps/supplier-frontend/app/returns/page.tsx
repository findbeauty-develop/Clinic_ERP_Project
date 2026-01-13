"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../../lib/api";

interface ReturnNotificationItem {
  id?: string; // Item ID from supplier backend
  productCode: string;
  productName: string;
  productBrand: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  memo?: string;
}

interface ReturnNotification {
  id: string;
  returnId?: string; // For grouping
  clinicName: string;
  returnManagerName: string;
  returnDate: string;
  totalRefund: number;
  items: ReturnNotificationItem[];
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  isRead: boolean;
  createdAt: string;
  acceptedAt?: string;
}

interface GroupedNotification {
  returnId: string;
  clinicName: string;
  returnManagerName: string;
  returnDate: string;
  totalRefund: number;
  items: ReturnNotificationItem[];
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  notifications: ReturnNotification[]; // All notifications in this group
  acceptedAt?: string;
}

type ItemAdjustment = {
  itemId: string;
  originalQuantity: number;
  actualQuantity: number;
  quantityChangeReason?: string;
};

const tabs = [
  { key: "pending", label: "반납 목록" },
  { key: "all", label: "반납 내역" },
];

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [notifications, setNotifications] = useState<ReturnNotification[]>([]);
  const [groupedNotifications, setGroupedNotifications] = useState<
    GroupedNotification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] =
    useState<GroupedNotification | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [itemAdjustments, setItemAdjustments] = useState<
    Record<string, ItemAdjustment>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10); // Items per page

  // Fetch notifications
  const fetchNotifications = async (page: number = currentPage) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Set status based on active tab
      if (activeTab === "pending") {
        params.append("status", "PENDING");
      } else {
        params.append("status", "ACCEPTED");
      }

      // Filter by return category: only empty box returns (빈 박스 반납)
      // Empty box returns do NOT have "|" in returnType
      // Product returns/exchanges have "|" (e.g., "주문|반품", "불량|교환")
      params.append("returnCategory", "empty_box");

      params.append("page", page.toString());
      params.append("limit", limit.toString());

      const response = await apiGet<{
        notifications: ReturnNotification[];
        total: number;
        unreadCount: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/supplier/returns?${params.toString()}`);

      setNotifications(response.notifications);
      setTotal(response.total);
      setTotalPages(response.totalPages || Math.ceil(response.total / limit));
      setCurrentPage(response.page || page);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      alert("반납 목록을 불러오는데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Group notifications by return_id
  useEffect(() => {
    const grouped: { [key: string]: GroupedNotification } = {};

    notifications.forEach((notification) => {
      // Group by return_id (same return_id means same return transaction)
      const groupKey =
        notification.returnId ||
        `${notification.clinicName}-${notification.returnDate}-${notification.returnManagerName}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          returnId: notification.returnId || groupKey,
          clinicName: notification.clinicName,
          returnManagerName: notification.returnManagerName,
          returnDate: notification.returnDate,
          totalRefund: 0,
          items: [],
          status: notification.status,
          notifications: [],
          acceptedAt: notification.acceptedAt,
        };
      }

      // Add items and accumulate total
      grouped[groupKey].items.push(...notification.items);
      grouped[groupKey].totalRefund += notification.totalRefund;
      grouped[groupKey].notifications.push(notification);

      // Update status (if any is PENDING, show as PENDING)
      if (notification.status === "PENDING") {
        grouped[groupKey].status = "PENDING";
      }

      // Update acceptedAt if available
      if (notification.acceptedAt && !grouped[groupKey].acceptedAt) {
        grouped[groupKey].acceptedAt = notification.acceptedAt;
      }
    });

    // Convert to array and sort by date (newest first)
    const groupedArray = Object.values(grouped).sort(
      (a, b) =>
        new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime()
    );

    setGroupedNotifications(groupedArray);
  }, [notifications]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when tab changes
    fetchNotifications(1);
  }, [activeTab]);

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      fetchNotifications(page);
      // Scroll to top when page changes
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Format number
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("ko-KR").format(num);
  };

  // Accept return
  const handleAcceptReturn = async () => {
    if (!selectedNotification) return;

    // Validate: agar quantity kamaytirilgan bo'lsa, reason majburiy
    const invalidItems = selectedNotification.items.filter((item) => {
      const adjustment = itemAdjustments[item.id || item.productCode];
      if (
        adjustment &&
        adjustment.actualQuantity < adjustment.originalQuantity
      ) {
        return !adjustment.quantityChangeReason;
      }
      return false;
    });

    if (invalidItems.length > 0) {
      alert("수량이 감소한 제품에 대한 사유를 선택해주세요.");
      return;
    }

    try {
      setProcessing(true);

      // Prepare adjustments array
      const adjustments = selectedNotification.items.map((item) => {
        const adjustment = itemAdjustments[item.id || item.productCode] || {
          itemId: item.id || item.productCode,
          originalQuantity: item.qty,
          actualQuantity: item.qty,
        };

        return {
          itemId: item.id || item.productCode,
          actualQuantity: adjustment.actualQuantity,
          quantityChangeReason: adjustment.quantityChangeReason || null,
        };
      });

      // Accept all notifications in the group with adjustments
      const acceptPromises = selectedNotification.notifications
        .filter((n) => n.status === "PENDING")
        .map((n) =>
          apiPut(`/supplier/returns/${n.id}/accept`, { adjustments })
        );

      await Promise.all(acceptPromises);

      setShowConfirmModal(false);
      setSelectedNotification(null);
      setItemAdjustments({});
      await fetchNotifications(); // Refresh list
      alert("반납이 접수되었습니다.");
    } catch (error: any) {
      console.error("Error accepting return:", error);
      alert("반납 접수에 실패했습니다: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  // Filter notifications by search query
  const filteredNotifications = groupedNotifications.filter((notification) => {
    if (searchQuery) {
      return notification.clinicName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900  ml-14 mt-2">반납</h1>
        <p className="text-sm text-slate-600 mt-1">
          팁 제품 반납을 처리하고 할인을 적용합니다
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-3 ml-4 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as "pending" | "all")}
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

      {/* Content */}
      <div className="p-4">
        {/* Search Bar (only for history tab) */}
        {activeTab === "all" && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="클리닉 명"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-slate-400"
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-slate-600">로딩 중...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredNotifications.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-600">
              {activeTab === "pending"
                ? "대기 중인 반납이 없습니다."
                : "반납 내역이 없습니다."}
            </p>
          </div>
        )}

        {/* Notification Cards */}
        {!loading && filteredNotifications.length > 0 && (
          <div className="space-y-4">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.returnId}
                className="bg-white rounded-lg p-6 shadow-sm border border-slate-200"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm text-black">
                      {formatDate(notification.returnDate)}
                    </p>
                    <p className="text-lg font-semibold text-black mt-1">
                      {notification.clinicName} {notification.returnManagerName}
                      님
                    </p>
                  </div>
                  {notification.status === "ACCEPTED" && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      반납 완료
                    </span>
                  )}
                </div>

                {/* Product List */}
                <div className="mb-4 border-t border-slate-200 pt-4">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-black border-b border-slate-200">
                        <th className="pb-2">제품</th>
                        <th className="pb-2 text-right">수량</th>
                        {activeTab === "all" && <th className="pb-2">사유</th>}
                        <th className="pb-2 text-right">단가</th>
                        <th className="pb-2 text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notification.items.map((item, index) => (
                        <tr key={index} className="border-b border-slate-100">
                          <td className="py-2 text-black">
                            <span className="font-medium">
                              {item.productName}
                            </span>
                          </td>
                          <td className="py-2 text-right text-black">
                            {item.qty}개
                          </td>
                          {activeTab === "all" && (
                            <td className="py-2 text-black">
                              {item.memo || "-"}
                            </td>
                          )}
                          <td className="py-2 text-right text-black">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-2 text-right font-medium text-black">
                            {formatCurrency(item.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Refund and Action Button */}
                {notification.status === "PENDING" &&
                activeTab === "pending" ? (
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-bold text-black">
                      반납금 {formatCurrency(notification.totalRefund)} 원
                    </p>
                    <button
                      onClick={() => {
                        // Initialize adjustments for this notification
                        const initialAdjustments: Record<
                          string,
                          ItemAdjustment
                        > = {};
                        notification.items.forEach((item) => {
                          const itemId = item.id || item.productCode;
                          initialAdjustments[itemId] = {
                            itemId: itemId,
                            originalQuantity: item.qty,
                            actualQuantity: item.qty,
                          };
                        });
                        setItemAdjustments(initialAdjustments);
                        setSelectedNotification(notification);
                        setShowConfirmModal(true);
                      }}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      반납 접수
                    </button>
                  </div>
                ) : notification.status === "ACCEPTED" &&
                  notification.acceptedAt ? (
                  <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                    <p className="text-lg font-bold text-black">
                      반납금 {formatCurrency(notification.totalRefund)} 원
                    </p>
                    <p className="text-sm text-black">
                      회수일: {formatDate(notification.acceptedAt)}
                    </p>
                  </div>
                ) : (
                  <div className="mb-4">
                    <p className="text-lg font-bold text-black">
                      반납금 {formatCurrency(notification.totalRefund)} 원
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredNotifications.length > 0 && totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                currentPage === 1
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300"
              }`}
            >
              이전
            </button>

            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first page, last page, current page, and pages around current
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .map((page, index, array) => {
                  // Add ellipsis if there's a gap
                  const showEllipsisBefore =
                    index > 0 && page - array[index - 1] > 1;

                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsisBefore && (
                        <span className="px-2 text-slate-500">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          currentPage === page
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300"
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                currentPage === totalPages
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300"
              }`}
            >
              다음
            </button>
          </div>
        )}

        {/* Pagination Info */}
        {!loading && filteredNotifications.length > 0 && (
          <div className="mt-4 text-center text-sm text-slate-600">
            {total}개 중 {(currentPage - 1) * limit + 1}-
            {Math.min(currentPage * limit, total)}개 표시
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedNotification && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-2 sm:px-4">
          <div className="w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 bg-white px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200">
              {/* Header Row */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs sm:text-sm text-slate-900">
                  {formatDate(selectedNotification.returnDate)}
                </div>
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setSelectedNotification(null);
                    setItemAdjustments({});
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="h-6 w-6"
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
              </div>

              {/* Clinic Info */}
              <div className="flex items-center justify-between">
                <div className="text-sm sm:text-base font-semibold text-slate-900">
                  {selectedNotification.clinicName}
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-900">
                  반납금 {formatCurrency(selectedNotification.totalRefund)} 원
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3">
              {selectedNotification.items.map((item) => {
                const itemId = item.id || item.productCode;
                const adjustment = itemAdjustments[itemId] || {
                  itemId: itemId,
                  originalQuantity: item.qty,
                  actualQuantity: item.qty,
                };
                const qtyChanged =
                  adjustment.actualQuantity < adjustment.originalQuantity;

                return (
                  <div key={itemId} className="space-y-2">
                    {/* Product Row */}
                    <div className="flex items-center gap-2 text-sm">
                      {/* Product Name */}
                      <div className="flex-1 font-medium text-slate-900 text-xs sm:text-sm">
                        {item.productName}
                      </div>

                      {/* Quantity Input */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={adjustment.originalQuantity}
                          value={adjustment.actualQuantity}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(
                                adjustment.originalQuantity,
                                parseInt(e.target.value) || 0
                              )
                            );
                            setItemAdjustments((prev) => ({
                              ...prev,
                              [itemId]: {
                                ...adjustment,
                                actualQuantity: val,
                                // If quantity is back to original, clear reason
                                quantityChangeReason:
                                  val >= adjustment.originalQuantity
                                    ? undefined
                                    : adjustment.quantityChangeReason,
                              },
                            }));
                          }}
                          className="w-16 sm:w-20 rounded border border-slate-300 px-2 py-1 text-center text-xs sm:text-sm text-slate-900 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-600 text-xs sm:text-sm whitespace-nowrap">
                          / {adjustment.originalQuantity}개
                        </span>
                      </div>
                    </div>

                    {/* Quantity Change Reason Dropdown (only if quantity decreased) */}
                    {qtyChanged && (
                      <div className="ml-0 rounded border border-slate-200 bg-slate-50 p-2">
                        <select
                          value={adjustment.quantityChangeReason || ""}
                          onChange={(e) => {
                            setItemAdjustments((prev) => ({
                              ...prev,
                              [itemId]: {
                                ...adjustment,
                                quantityChangeReason: e.target.value,
                              },
                            }));
                          }}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white text-slate-900 font-medium"
                          required
                        >
                          <option value="">사유를 선택</option>
                          <option value="추후반납">추후반납</option>
                          <option value="분실">분실</option>
                          <option value="초과(전에 재고)">
                            초과(전에 재고)
                          </option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 sm:py-4">
              <div className="text-xs sm:text-sm text-slate-600">
                회수일: {formatDate(new Date().toISOString())}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setSelectedNotification(null);
                    setItemAdjustments({});
                  }}
                  className="flex-1 sm:flex-none px-4 sm:px-6 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                  disabled={processing}
                >
                  취소
                </button>
                <button
                  onClick={handleAcceptReturn}
                  className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? "처리 중..." : "확인"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
