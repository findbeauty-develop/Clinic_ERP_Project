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
    } catch (error: any) {
      console.error("Error fetching return requests:", error);
      alert("반품/교환 목록을 불러오는데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchRequests(1);
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
      await apiPut(`/supplier/returns/${selectedRequest.id}/accept`, {});
      setShowConfirmModal(false);
      setSelectedRequest(null);
      await fetchRequests();
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
      // TODO: Implement this endpoint in backend
      // await apiPut(`/supplier/returns/${selectedRequest.id}/complete`, {});
      alert("기능이 곧 추가될 예정입니다.");
      setShowCompleteModal(false);
      setSelectedRequest(null);
      // await fetchRequests();
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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">반품 및 교환</h1>
        <p className="text-sm text-slate-600 mt-1">
          클리닉에서 요청한 반품 및 교환을 처리하세요
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "pending"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            요청 확인 대기
          </button>
          <button
            onClick={() => setActiveTab("processing")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "processing"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            요청 진행
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "history"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            반품 내역
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
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

        {/* Request Cards */}
        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((request) => {
              const totalAmount = calculateTotal(request.items);
              return (
                <div
                  key={request.id}
                  className="bg-white rounded-lg p-6 shadow-sm border border-slate-200"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        반품번호: {request.returnNo}
                      </p>
                      <p className="text-sm text-slate-600 mb-1">
                        {formatDate(request.createdAt)}
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {request.clinicName} - {request.clinicManagerName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {request.status === "PENDING" && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                          요청 확인 대기
                        </span>
                      )}
                      {request.status === "PROCESSING" && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          요청 진행
                        </span>
                      )}
                      {request.status === "COMPLETED" && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          {request.items[0]?.returnType?.includes("교환") ? "교환 완료" : "반품 완료"}
                        </span>
                      )}
                      {request.status === "REJECTED" && (
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                          요청 거절
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Product List */}
                  <div className="mb-4 border-t border-slate-200 pt-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-sm text-slate-700 border-b border-slate-200">
                          <th className="pb-2">제품</th>
                          <th className="pb-2">유형</th>
                          <th className="pb-2 text-right">수량</th>
                          <th className="pb-2 text-right">단가</th>
                          <th className="pb-2 text-right">합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {request.items.map((item, index) => (
                          <tr key={index} className="border-b border-slate-100">
                            <td className="py-2">
                              <div>
                                <span className="font-medium text-slate-900">
                                  {item.productName}
                                </span>
                                {item.productBrand && (
                                  <span className="text-sm text-slate-500 ml-2">
                                    ({item.productBrand})
                                  </span>
                                )}
                              </div>
                              {item.memo && (
                                <p className="text-xs text-slate-500 mt-1">{item.memo}</p>
                              )}
                              {item.images && item.images.length > 0 && (
                                <div className="flex gap-2 mt-2">
                                  {item.images.slice(0, 3).map((img, imgIdx) => (
                                    <img
                                      key={imgIdx}
                                      src={img.startsWith("http") ? img : `http://localhost:3002${img}`}
                                      alt={`Image ${imgIdx + 1}`}
                                      className="w-16 h-16 object-cover rounded border border-slate-200"
                                    />
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-slate-700">
                              {formatReturnType(item.returnType)}
                            </td>
                            <td className="py-2 text-right text-slate-700">{item.qty}개</td>
                            <td className="py-2 text-right text-slate-700">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="py-2 text-right font-medium text-slate-900">
                              {formatCurrency(item.totalPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total and Actions */}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                    <p className="text-lg font-bold text-slate-900">
                      총액: {formatCurrency(totalAmount)} 원
                    </p>
                    <div className="flex gap-2">
                      {request.status === "PENDING" && activeTab === "pending" && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowRejectModal(true);
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                          >
                            요청 거절
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowConfirmModal(true);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                          >
                            요청 확인
                          </button>
                        </>
                      )}
                      {request.status === "PROCESSING" && activeTab === "processing" && (
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowCompleteModal(true);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                        >
                          제품 받았음
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && requests.length > 0 && totalPages > 1 && (
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
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .map((page, index, array) => {
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
        {!loading && requests.length > 0 && (
          <div className="mt-4 text-center text-sm text-slate-600">
            {total}개 중 {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, total)}개 표시
          </div>
        )}
      </div>

      {/* Confirm Modal (요청 확인) */}
      {showConfirmModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">요청 확인</h3>
            <p className="text-slate-700 mb-4">
              {selectedRequest.clinicName}의 반품/교환 요청을 확인하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedRequest(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleAcceptReturn}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">요청 거절</h3>
            <p className="text-slate-700 mb-2">
              {selectedRequest.clinicName}의 반품/교환 요청을 거절하시겠습니까?
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="거절 사유를 입력해주세요"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400 mb-4"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRequest(null);
                  setRejectionReason("");
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleRejectReturn}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">제품 받았음</h3>
            <p className="text-slate-700 mb-4">
              {selectedRequest.clinicName}의 반품/교환 제품을 받으셨습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedRequest(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                disabled={processing}
              >
                취소
              </button>
              <button
                onClick={handleMarkAsReceived}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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

