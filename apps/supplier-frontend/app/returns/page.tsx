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
      if (activeTab === "list") {
        params.append("status", "PENDING");
      } else {
        params.append("status", "ACCEPTED");
      }
      
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
                    <p className="text-sm text-black">
                      {formatDate(notification.returnDate)}
                    </p>
                    <p className="text-lg font-semibold text-black mt-1">
                      {notification.clinicName} {notification.returnManagerName}님
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
                          <td className="py-2 text-right text-black">{item.qty}개</td>
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
                {notification.status === "PENDING" && activeTab === "list" ? (
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-bold text-black">
                      반납금 {formatCurrency(notification.totalRefund)} 원
                    </p>
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
                ) : notification.status === "ACCEPTED" && notification.acceptedAt ? (
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
                  const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                  
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
            {total}개 중 {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, total)}개 표시
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
          

              <div className="space-y-3 mb-6">
                <p className="text-sm text-slate-500">
                  {formatDate(selectedNotification.returnDate)}
                </p>
                <div className="flex justify-between items-center w-full">
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedNotification.clinicName}
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    반납금 {formatCurrency(selectedNotification.totalRefund)} 원
                  </p>
                </div>
              

              <div className="mt-4 space-y-2">
                {selectedNotification.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm text-slate-700">
                    <span>{item.productName}</span>
                    <span>{item.qty}개</span>
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
                취소
              </button>
              <button
                onClick={handleAcceptReturn}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                disabled={processing}
              >
                {processing ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

