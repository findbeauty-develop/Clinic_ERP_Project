"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../../lib/api";

interface ReturnItem {
  id: string;
  productName: string;
  productBrand: string;
  qty: number;
  returnType: string;
  memo?: string;
  images: string[];
  inboundDate: string;
  totalPrice: number;
  orderNo?: string;
  batchNo?: string;
  unitPrice: number;
  status?: string;
}

interface ReturnRequest {
  id: string;
  returnNo: string;
  clinicName: string;
  clinicManagerName: string;
  items: ReturnItem[];
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";
  createdAt: string;
  confirmedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
}

export default function ExchangesPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "processing" | "history">("pending");
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
   const [notificationCount, setNotificationCount] = useState("");

  // Clinic backend URL for images
  const clinicBackendUrl = process.env.NEXT_PUBLIC_CLINIC_BACKEND_URL || "https://api.jaclit.com";

  // Fetch return requests
  const fetchRequests = async (page: number = currentPage) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Map tab to status
      if (activeTab === "pending") {
        params.append("status", "PENDING");
      } else if (activeTab === "processing") {
        params.append("status", "ACCEPTED"); // Backend uses ACCEPTED for processing
      } else {
        params.append("status", "ALL");
      }
      
      // Filter by return category: only product returns/exchanges (제품 반품/교환)
      // Product returns/exchanges have "|" (e.g., "주문|반품", "불량|교환", "주문|교환", "불량|반품")
      params.append("returnCategory", "product");
      
      params.append("page", page.toString());
      params.append("limit", limit.toString());

      const response = await apiGet<{
        notifications: ReturnRequest[];
        total: number;
        unreadCount: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/supplier/returns?${params.toString()}`);

      // Map response to our format
      const mappedRequests: ReturnRequest[] = response.notifications.map((notif: any) => ({
        id: notif.id,
        returnNo: notif.returnNo || notif.id,
        clinicName: notif.clinicName,
        clinicManagerName: notif.returnManagerName,
        items: notif.items || [],
        status: notif.status === "ACCEPTED" ? "PROCESSING" : notif.status,
        createdAt: notif.createdAt || notif.returnDate,
        confirmedAt: notif.confirmedAt,
        completedAt: notif.completedAt,
        rejectedAt: notif.rejectedAt,
      }));

      setRequests(mappedRequests);
      setTotal(response.total);
      setTotalPages(response.totalPages || Math.ceil(response.total / limit));
      setCurrentPage(response.page || page);
      
      // ✅ Update notification count from API response
      // if (response.unreadCount !== undefined) {
      //   setNotificationCount(response.unreadCount);
      // }
    } catch (error: any) {
      console.error("Error fetching return requests:", error);
      alert("반품/교환 목록을 불러오는데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch notification count on component mount
  // const fetchNotificationCount = async () => {
  //   try {
  //     const supplierApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";
  //     const token = localStorage.getItem("supplier_access_token");
      
  //     if (!token) return;

  //     // Fetch unread counts for different notification types
  //     const [exchangesResponse, returnsResponse, ordersResponse] = await Promise.all([
  //       // Product returns/exchanges (반품 및 교환)
  //       fetch(
  //         `${supplierApiUrl}/supplier/returns?status=PENDING&returnCategory=product&limit=1`,
  //         {
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${token}`,
  //           },
  //         }
  //       ),
  //       // Empty box returns (반납)
  //       fetch(
  //         `${supplierApiUrl}/supplier/returns?status=PENDING&returnCategory=empty_box&limit=1`,
  //         {
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${token}`,
  //           },
  //         }
  //       ),
  //       // Pending orders (주문)
  //       fetch(
  //         `${supplierApiUrl}/supplier/orders?status=pending&limit=1`,
  //         {
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${token}`,
  //           },
  //         }
  //       ),
  //     ]);

  //     let totalUnread = 0;

  //     if (exchangesResponse.ok) {
  //       const exchangesData = await exchangesResponse.json();
  //       totalUnread += exchangesData.unreadCount || 0;
  //     }

  //     if (returnsResponse.ok) {
  //       const returnsData = await returnsResponse.json();
  //       totalUnread += returnsData.unreadCount || 0;
  //     }

  //     if (ordersResponse.ok) {
  //       const ordersData = await ordersResponse.json();
  //       // Count pending orders
  //       const pendingOrders = (ordersData.orders || []).filter(
  //         (order: any) => order.status === "pending"
  //       ).length;
  //       totalUnread += pendingOrders;
  //     }

  //     setNotificationCount(totalUnread);
  //   } catch (error) {
  //     console.error("Error fetching notification count:", error);
  //   }
  // };

  useEffect(() => {
    setCurrentPage(1);
    fetchRequests(1);
    // fetchNotificationCount(); // ✅ Fetch notification count on mount
  }, [activeTab]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      fetchRequests(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Accept return (요청 확인)
  const handleAcceptReturn = async () => {
    if (!selectedRequest) return;

    try {
      setProcessing(true);
      // Send itemId if it's a single item request
      const itemId = selectedRequest.items.length === 1 ? selectedRequest.items[0].id : undefined;
      await apiPut(`/supplier/returns/${selectedRequest.id}/accept`, { itemId });
      setShowConfirmModal(false);
      setSelectedRequest(null);
      await fetchRequests();
      //await fetchNotificationCount(); // ✅ Update notification count
      alert("요청이 확인되었습니다.");
    } catch (error: any) {
      console.error("Error accepting return:", error);
      alert("요청 확인에 실패했습니다: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Reject return (요청 거절)
  const handleRejectReturn = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      alert("거절 사유를 입력해주세요.");
      return;
    }

    try {
      setProcessing(true);
      await apiPut(`/supplier/returns/${selectedRequest.id}/reject`, {
        reason: rejectionReason,
      });
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectionReason("");
      await fetchRequests();
      //await fetchNotificationCount(); // ✅ Update notification count
      alert("요청이 거절되었습니다.");
    } catch (error: any) {
      console.error("Error rejecting return:", error);
      alert("요청 거절에 실패했습니다: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Mark as received (제품 받았음)
  const handleMarkAsReceived = async () => {
    if (!selectedRequest) return;

    try {
      setProcessing(true);
      await apiPut(`/supplier/returns/${selectedRequest.id}/complete`, {});
      alert("제품 받았음으로 처리되었습니다.");
      setShowCompleteModal(false);
      setSelectedRequest(null);
      await fetchRequests();
     // await fetchNotificationCount(); // ✅ Update notification count
    } catch (error: any) {
      console.error("Error marking as received:", error);
      alert("처리에 실패했습니다: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  const formatReturnType = (type: string) => {
    return type.replace(/\|/g, " | ");
  };

  const calculateTotal = (items: ReturnItem[]) => {
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const renderStatusBadge = (status: string, items?: ReturnItem[]) => {
    const label =
      status === "PENDING"
        ? "요청 확인 대기"
        : status === "PROCESSING"
        ? "요청 진행"
        : status === "COMPLETED"
        ? items?.[0]?.returnType?.includes("교환") ? "교환 완료" : "반품 완료"
        : "요청 거절";
    const color =
      status === "PENDING"
        ? "bg-amber-100 text-amber-700"
        : status === "PROCESSING"
        ? "bg-blue-100 text-blue-700"
        : status === "COMPLETED"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-red-100 text-red-700";
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header and Tabs */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 ml-14 mt-4">반품 및 교환</h1>
          
         <div className="flex items-center justify-center mt-2"><button
            onClick={() => {
              fetchRequests(currentPage);
             // fetchNotificationCount();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            새로고침
          </button>
            <button 
              onClick={() => {
               // fetchNotificationCount();
                fetchRequests(currentPage);
              }}
              className="relative flex ml-2 items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              title="알림 새로고침"
            >
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-6 w-6 text-gray-700"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
    />
  </svg>

  {/* {notificationCount > 0 && (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {notificationCount}
    </span>
  )} */}
</button></div>
        </div>
  
        
      </div>
{/* Tabs */}
        <div className="mt-4 mb-3 flex gap-2 ml-3">
          <button
            onClick={() => setActiveTab("pending")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              activeTab === "pending"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            요청 확인 대기
          </button>
          <button
            onClick={() => setActiveTab("processing")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              activeTab === "processing"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            요청 진행
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              activeTab === "history"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            반품 내역
          </button>
        </div>
      {/* Content */}
      <div className="p-2 sm:p-4">
        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-slate-600">로딩 중...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && requests.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-600">
              {activeTab === "pending"
                ? "대기 중인 요청이 없습니다."
                : activeTab === "processing"
                ? "진행 중인 요청이 없습니다."
                : "반품 내역이 없습니다."}
            </p>
          </div>
        )}

        {/* Request Cards - Each item gets its own card */}
        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.flatMap((request) => {
              const date = new Date(request.createdAt);
              const dateStr = `${date.getFullYear()}-${String(
                date.getMonth() + 1
              ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
                date.getHours()
              ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
              
              return request.items.map((item, itemIndex) => {
                // Get item status (default to pending if not set)
                const itemStatus = item.status || "pending";
                
                // Filter items based on active tab
                if (activeTab === "pending" && itemStatus !== "pending") return null;
                if (activeTab === "processing" && itemStatus !== "processing") return null;
                if (activeTab === "history" && itemStatus !== "completed" && itemStatus !== "rejected") return null;
                
                return (
                <div
                  key={`${request.id}-${item.id || itemIndex}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {/* Top: Date and Return Number */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm text-slate-500">{dateStr}</div>
                    <div className="text-xs text-slate-500">
                      반품번호: {request.returnNo}
                    </div>
                  </div>

                  {/* Clinic Name and Status */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-lg font-semibold text-slate-900">
                      {request.clinicName}{" "}
                      <span className="text-sm text-slate-500">
                        {request.clinicManagerName}님
                      </span>
                    </div>
                    {renderStatusBadge(itemStatus.toUpperCase(), [item])}
                  </div>
{/* 1-qator: 제품명 / 반환유형 / 수량 */}
<div className="flex items-center py-2 text-sm font-semibold text-slate-700 gap-4">
  {/* LEFT – 제품명 */}
  <div className="flex-1 min-w-0">
    <span className="truncate">{item.productName}</span>
  </div>

  {/* CENTER – 반환유형 (입고일 bilan bir xil ustun) */}
  <div className="w-32">
    {item.returnType && (
      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
        {formatReturnType(item.returnType)}
      </span>
    )}
  </div>

  {/* RIGHT – 수량 */}
  <div className="flex-1 flex justify-end text-slate-500 font-semibold whitespace-nowrap">
    {item.qty}개
  </div>
</div>

{/* 2-qator: 주문번호 / 배치번호 | 입고일 | 금액/거절됨 */}
<div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
  {/* LEFT – 주문번호 / 배치번호 */}
  <div className="flex-1 flex flex-wrap items-center gap-2">
    {item.orderNo && <span>주문번호: {item.orderNo}</span>}
    {item.batchNo && item.returnType?.includes("불량") && (
      <span>배치번호: {item.batchNo}</span>
    )}
  </div>

  {/* CENTER – 입고일 (yuqoridagi 반환유형 bilan bir xil joydan boshlanadi) */}
  <div className="w-32">
    {item.inboundDate && <span>입고일: {item.inboundDate}</span>}
  </div>

  {/* RIGHT – 금액 yoki 거절됨 */}
  <div className="flex-1 flex justify-end whitespace-nowrap">
    {request.status === "REJECTED" ? (
      <span className="text-slate-400 font-semibold">거절됨</span>
    ) : (
      <span className="font-semibold">
        {formatCurrency(item.totalPrice)}원
      </span>
    )}
  </div>
</div>


                 

                 

                  {/* Return Type */}
                  

                 
                 

                  {item.images && item.images.length > 0 && (
  <div className="mt-3 flex w-full items-center gap-5 overflow-x-auto pb-1">
    {item.images.slice(0, 5).map((img, imgIdx) => (
      <img
        key={imgIdx}
        src={img.startsWith("http") ? img : `${clinicBackendUrl}${img}`}
        alt={`Image ${imgIdx + 1}`}
        className="h-28 w-28 flex-shrink-0 rounded-xl border border-slate-200 object-cover"
      />
    ))}
  </div>
)}




                   {/* Memo */}
                   {item.memo && (
  <div className="mt-2 w-full">
    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span className="font-semibold text-slate-700">메모: </span>
      <span className="break-words">{item.memo}</span>
    </div>
  </div>
)}

                  {/* Action Buttons */}
                  {itemStatus === "pending" && activeTab === "pending" && (
                    <div className="flex items-center justify-end gap-2 border-t  px-0.9 py-3 mt-4">
                      <button
                        onClick={() => {
                          // Create a temporary request with only this item
                          const singleItemRequest = {
                            ...request,
                            items: [item]
                          };
                          setSelectedRequest(singleItemRequest);
                          setShowRejectModal(true);
                        }}
                        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        요청 거절
                      </button>
                      <button
                        onClick={() => {
                          // Create a temporary request with only this item
                          const singleItemRequest = {
                            ...request,
                            items: [item]
                          };
                          setSelectedRequest(singleItemRequest);
                          setShowConfirmModal(true);
                        }}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        요청 확인
                      </button>
                    </div>
                  )}
                  {itemStatus === "processing" && activeTab === "processing" && (
                    <div className="flex items-center justify-end gap-2 px-0.9 py-3 mt-4">
                      <button
                        onClick={() => {
                          // Create a temporary request with only this item
                          const singleItemRequest = {
                            ...request,
                            items: [item]
                          };
                          setSelectedRequest(singleItemRequest);
                          setShowCompleteModal(true);
                        }}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        제품 받았음
                      </button>
                    </div>
                  )}
                </div>
              );
              });
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && requests.length > 0 && totalPages > 1 && (
          <div className="mt-4 sm:mt-6 flex justify-center items-center gap-1 sm:gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-medium transition-colors ${
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
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .map((page, index, array) => {
                  const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                  
                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsisBefore && (
                        <span className="px-1 sm:px-2 text-xs sm:text-sm text-slate-500">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-medium transition-colors ${
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
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-medium transition-colors ${
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
        {!loading && requests.length > 0 && (
          <div className="mt-3 sm:mt-4 text-center text-xs sm:text-sm text-slate-600">
            {total}개 중 {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, total)}개 표시
          </div>
        )}
      </div>

      {/* Confirm Modal (요청 확인) */}
      {showConfirmModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">요청 확인</h3>
            <p className="text-sm sm:text-base text-slate-700 mb-3 sm:mb-4">
              {selectedRequest.clinicName}의 반품/교환 요청을 확인하시겠습니까?
            </p>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedRequest(null);
                }}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleAcceptReturn}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                disabled={processing}
              >
                {processing ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal (요청 거절) */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">요청 거절</h3>
            <p className="text-sm sm:text-base text-slate-700 mb-2">
              {selectedRequest.clinicName}의 반품/교환 요청을 거절하시겠습니까?
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="거절 사유를 입력해주세요"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400 mb-3 sm:mb-4"
              rows={4}
            />
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRequest(null);
                  setRejectionReason("");
                }}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleRejectReturn}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                disabled={processing || !rejectionReason.trim()}
              >
                {processing ? "처리 중..." : "거절"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Modal (제품 받았음) */}
      {showCompleteModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">제품 받았음</h3>
            <p className="text-sm sm:text-base text-slate-700 mb-3 sm:mb-4">
              {selectedRequest.clinicName}의 반품/교환 제품을 받으셨습니까?
            </p>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedRequest(null);
                }}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleMarkAsReceived}
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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

