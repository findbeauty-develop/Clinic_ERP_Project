"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet } from "@/lib/api";

interface SettlementStats {
  outstandingAmount: number; // 미수금
  refundAmount: number; // 반납금
  daysOverdue: number; // 미수경과일수
}

interface Transaction {
  id: string;
  type: "주문" | "반납" | "반품 및 교환";
  status: "접수대기" | "진행중" | "완료";
  timestamp: string;
  timeType: "요청시간" | "확인시간" | "완료시간";
  itemCount: number;
  amount: number;
}

export default function SettlementPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const [clinicName, setClinicName] = useState("A Clinic");
  const [stats, setStats] = useState<SettlementStats>({
    outstandingAmount: 7800000,
    refundAmount: 800000,
    daysOverdue: 45,
  });
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [inProgressTransactions, setInProgressTransactions] = useState<Transaction[]>([]);
  const [completedTransactions, setCompletedTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettlementData();
  }, [clinicId]);

  const fetchSettlementData = async () => {
    try {
      setLoading(true);
      
      const supplierApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
      const token = localStorage.getItem("supplier_access_token");
      
      if (!token) {
        console.error("No authentication token found");
        return;
      }

      // Fetch pending orders for this clinic
      try {
        const ordersResponse = await fetch(
          `${supplierApiUrl}/supplier/orders?status=pending&limit=100`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          
          // Filter orders by clinic tenant ID
          const clinicOrders = (ordersData.orders || []).filter(
            (order: any) => order.clinic?.tenantId === clinicId || order.clinicTenantId === clinicId
          );

          // Update clinic name from first order if available
          if (clinicOrders.length > 0 && clinicOrders[0].clinic?.name) {
            setClinicName(clinicOrders[0].clinic.name);
          }

          // Fetch pending returns for this clinic
          const returnsResponse = await fetch(
            `${supplierApiUrl}/supplier/returns?status=PENDING&limit=100`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );

          let clinicReturns: any[] = [];
          if (returnsResponse.ok) {
            const returnsData = await returnsResponse.json();
            // Returns API returns notifications array
            const allReturns = returnsData.notifications || returnsData.returns || (Array.isArray(returnsData) ? returnsData : []);
            
            // Get clinic name to filter returns
            const clinicOrder = clinicOrders[0];
            const targetClinicName = clinicOrder?.clinic?.name || clinicName;
            
            // Filter returns by clinic name (returns API uses clinic_name field)
            clinicReturns = allReturns.filter(
              (returnItem: any) => {
                // Match by clinic name
                return returnItem.clinicName === targetClinicName || 
                       returnItem.clinic_name === targetClinicName;
              }
            );
          }

          // Format pending transactions
          const formattedPending: Transaction[] = [];

          // Add orders
          clinicOrders.forEach((order: any) => {
            const orderDate = new Date(order.orderDate);
            const month = String(orderDate.getMonth() + 1).padStart(2, "0");
            const day = String(orderDate.getDate()).padStart(2, "0");
            const hours = String(orderDate.getHours()).padStart(2, "0");
            const minutes = String(orderDate.getMinutes()).padStart(2, "0");
            const timestamp = `${month}-${day} ${hours}:${minutes}`;

            formattedPending.push({
              id: order.id,
              type: "주문",
              status: "접수대기",
              timestamp: timestamp,
              timeType: "요청시간",
              itemCount: order.items?.length || 0,
              amount: order.totalAmount || 0,
            });
          });

          // Add returns
          clinicReturns.forEach((returnItem: any) => {
            // Get date from returnDate or createdAt or created_at
            const returnDate = new Date(
              returnItem.returnDate || 
              returnItem.createdAt || 
              returnItem.created_at ||
              new Date()
            );
            const month = String(returnDate.getMonth() + 1).padStart(2, "0");
            const day = String(returnDate.getDate()).padStart(2, "0");
            const hours = String(returnDate.getHours()).padStart(2, "0");
            const minutes = String(returnDate.getMinutes()).padStart(2, "0");
            const timestamp = `${month}-${day} ${hours}:${minutes}`;

            // Determine return type from items
            const returnType = returnItem.items?.some((item: any) => 
              item.returnType?.includes("교환") || item.return_type?.includes("교환")
            ) ? "반품 및 교환" : "반납";

            formattedPending.push({
              id: returnItem.id || returnItem.returnId,
              type: returnType as "반납" | "반품 및 교환",
              status: "접수대기",
              timestamp: timestamp,
              timeType: "요청시간",
              itemCount: returnItem.items?.length || 0,
              amount: returnItem.totalRefund || 0, // Use totalRefund if available
            });
          });

          // Sort by timestamp (newest first)
          formattedPending.sort((a, b) => {
            const dateA = new Date(`20${a.timestamp.replace(" ", "T")}`);
            const dateB = new Date(`20${b.timestamp.replace(" ", "T")}`);
            return dateB.getTime() - dateA.getTime();
          });

          setPendingTransactions(formattedPending);
        } else {
          console.error("Failed to fetch orders:", ordersResponse.statusText);
          setPendingTransactions([]);
        }
      } catch (error) {
        console.error("Error fetching pending transactions:", error);
        setPendingTransactions([]);
      }

      setInProgressTransactions([
        {
          id: "3",
          type: "주문",
          status: "진행중",
          timestamp: "00-00 10:50",
          timeType: "확인시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "4",
          type: "반품 및 교환",
          status: "진행중",
          timestamp: "00-00 10:50",
          timeType: "확인시간",
          itemCount: 111,
          amount: 0,
        },
      ]);

      setCompletedTransactions([
        {
          id: "5",
          type: "주문",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "6",
          type: "반납",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "7",
          type: "주문",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "8",
          type: "반품 및 교환",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "9",
          type: "반품 및 교환",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "10",
          type: "주문",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "11",
          type: "반납",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "12",
          type: "반납",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
        {
          id: "13",
          type: "반품 및 교환",
          status: "완료",
          timestamp: "00-00 10:50",
          timeType: "완료시간",
          itemCount: 111,
          amount: 0,
        },
      ]);
    } catch (error) {
      console.error("Failed to fetch settlement data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("ko-KR");
  };

  const getTypeButtonClass = (status: string) => {
    if (status === "완료") {
      return "bg-gray-400 text-white";
    }
    return "border border-gray-300 bg-white text-gray-700";
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center justify-center">
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">{clinicName}</h1>
        </div>
        <Link
          href={`/settlement/${clinicId}/details`}
          className="text-sm text-gray-700 underline hover:text-blue-600"
        >
          정산 내역 보기
        </Link>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* 전사보기 Section */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">전사보기</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">미수금</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(stats.outstandingAmount)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">반납금</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(stats.refundAmount)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">미수경과일수</p>
              <p className="text-lg font-bold text-gray-900">D+{stats.daysOverdue}</p>
            </div>
          </div>
        </div>

        {/* 접수대기 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">접수대기</h2>
          <div className="space-y-2">
            {pendingTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0"
              >
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${getTypeButtonClass(
                    transaction.status
                  )}`}
                >
                  {transaction.type}
                </button>
                <div className="flex-1 text-sm text-gray-700">
                  {transaction.timeType} {transaction.timestamp} 아이텀 {transaction.itemCount}{" "}
                  {transaction.amount > 0 ? formatCurrency(transaction.amount) : "0,000,000,000"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 진행중 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">진행중</h2>
          <div className="space-y-2">
            {inProgressTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0"
              >
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${getTypeButtonClass(
                    transaction.status
                  )}`}
                >
                  {transaction.type}
                </button>
                <div className="flex-1 text-sm text-gray-700">
                  {transaction.timeType} {transaction.timestamp} 아이텀 {transaction.itemCount}{" "}
                  {transaction.amount > 0 ? formatCurrency(transaction.amount) : "0,000,000,000"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 완료 내역 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">완료 내역</h2>
          <div 
            className="space-y-2 max-h-96 overflow-y-auto pr-2"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#cbd5e1 #f1f5f9",
            }}
          >
            {completedTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0"
              >
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${getTypeButtonClass(
                    transaction.status
                  )}`}
                >
                  {transaction.type}
                </button>
                <div className="flex-1 text-sm text-gray-700">
                  {transaction.timeType} {transaction.timestamp} 아이텀 {transaction.itemCount}{" "}
                  {transaction.amount > 0 ? formatCurrency(transaction.amount) : "0,000,000,000"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

