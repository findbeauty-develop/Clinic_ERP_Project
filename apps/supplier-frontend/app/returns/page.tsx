"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../../lib/api";

interface ReturnNotificationItem {
  productCode: string;
  productName: string;
  productBrand: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
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
  batchNo?: string;
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

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<"list" | "history">("list");
  const [notifications, setNotifications] = useState<ReturnNotification[]>([]);
  const [groupedNotifications, setGroupedNotifications] = useState<GroupedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<GroupedNotification | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Set status based on active tab
      if (activeTab === "list") {
        params.append("status", "PENDING");
      } else {
        params.append("status", "ACCEPTED");
      }
      
      params.append("page", "1");
      params.append("limit", "100");

      const response = await apiGet<{
        notifications: ReturnNotification[];
        total: number;
        unreadCount: number;
      }>(`/supplier/returns?${params.toString()}`);

      setNotifications(response.notifications);
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
      const groupKey = notification.returnId || 
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
    const groupedArray = Object.values(grouped).sort((a, b) => 
      new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime()
    );

    setGroupedNotifications(groupedArray);
  }, [notifications]);

  useEffect(() => {
    fetchNotifications();
  }, [activeTab]);

  // Accept return
  const handleAcceptReturn = async () => {
    if (!selectedNotification) return;

    try {
      setProcessing(true);

      // Accept all notifications in the group
      const acceptPromises = selectedNotification.notifications
        .filter((n) => n.status === "PENDING")
        .map((n) => apiPut(`/supplier/returns/${n.id}/accept`, {}));

      await Promise.all(acceptPromises);

      setShowConfirmModal(false);
      setSelectedNotification(null);
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
      return notification.clinicName.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">반납</h1>
        <p className="text-sm text-slate-600 mt-1">
          팁 제품 반납을 처리하고 할인을 적용합니다
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "list"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            반납 목록
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "history"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            반납 내역
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Search Bar (only for history tab) */}
        {activeTab === "history" && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="클리닉 명"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              {activeTab === "list" 
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
                    <p className="text-sm text-slate-500">
                      {formatDate(notification.returnDate)}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {notification.clinicName} {notification.returnManagerName}님
                    </p>
                  </div>
                  {notification.status === "ACCEPTED" && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      반납 완료
                    </span>
                  )}
                </div>

                {/* Total Refund */}
                <div className="mb-4">
                  <p className="text-lg font-bold text-slate-900">
                    반납금 {formatCurrency(notification.totalRefund)} 원
                  </p>
                </div>

                {/* Product List */}
                <div className="mb-4 border-t border-slate-200 pt-4">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-slate-600 border-b border-slate-200">
                        <th className="pb-2">제품</th>
                        <th className="pb-2 text-right">수량</th>
                        <th className="pb-2 text-right">단가</th>
                        <th className="pb-2 text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notification.items.map((item, index) => (
                        <tr key={index} className="border-b border-slate-100">
                          <td className="py-2">
                            <span className="font-medium">
                              {item.productCode} {item.productName}
                            </span>
                          </td>
                          <td className="py-2 text-right">{item.qty}개</td>
                          <td className="py-2 text-right">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(item.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action Button */}
                {notification.status === "PENDING" && activeTab === "list" && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setSelectedNotification(notification);
                        setShowConfirmModal(true);
                      }}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      반납 접수
                    </button>
                  </div>
                )}

                {/* Recovery Date (for completed returns) */}
                {notification.status === "ACCEPTED" && notification.acceptedAt && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-600">
                      회수일: {formatDate(notification.acceptedAt)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              반납 제품 받아셨습니까?
            </h2>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-slate-500">
                {formatDate(selectedNotification.returnDate)}
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {selectedNotification.clinicName}
              </p>
              <p className="text-lg font-bold text-slate-900">
                반납금 {formatCurrency(selectedNotification.totalRefund)} 원
              </p>

              <div className="mt-4 space-y-2">
                {selectedNotification.items.map((item, index) => (
                  <div key={index} className="text-sm text-slate-700">
                    {item.productCode} {item.productName}: {item.qty}개
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedNotification(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                아니요
              </button>
              <button
                onClick={handleAcceptReturn}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                disabled={processing}
              >
                {processing ? "처리 중..." : "네, 받았습니다."}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

