"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";

interface NewClinic {
  id: string;
  name: string;
  area: string;
  registrationTime: string;
}

interface Order {
  id: string;
  clinicName: string;
  status: "접수대기" | "진행중" | "완료";
  timestamp: string;
  timeType: "요청시간" | "확인시간";
}

interface ReturnExchange {
  id: string;
  clinicName: string;
  status: "접수대기" | "진행중";
  timestamp: string;
  timeType: "요청시간" | "확인시간";
}

interface Return {
  id: string;
  clinicName: string;
  status: "접수대기";
  timestamp: string;
  timeType: "요청시간";
}

interface TopCompany {
  id: string;
  name: string;
  amount: number;
}

interface DashboardStats {
  totalCompanies: number;
  totalReceivables: number;
  topCompanies: TopCompany[];
}

export default function DashboardPage() {
  const [newClinics, setNewClinics] = useState<NewClinic[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returnExchanges, setReturnExchanges] = useState<ReturnExchange[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
   const [notificationCount, setNotificationCount] = useState(4);
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 40,
    totalReceivables: 217800000,
    topCompanies: [
      { id: "1", name: "XXX 회사", amount: 8800000 },
      { id: "2", name: "XXX 회사", amount: 8800000 },
      { id: "3", name: "XXX 회사", amount: 8800000 },
    ],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Get supplier manager ID from localStorage
      const managerData = localStorage.getItem("supplier_manager_data");
      if (!managerData) {
        console.error("Supplier manager data not found");
        setLoading(false);
        return;
      }

      const managerInfo = JSON.parse(managerData);
      const supplierManagerId = managerInfo.manager_id || managerInfo.id;

      if (!supplierManagerId) {
        console.error("Supplier manager ID not found");
        setLoading(false);
        return;
      }

      // Fetch clinics from API via supplier-backend
      // Supplier-backend proxies this request to clinic-backend
      try {
        const supplierApiUrl =
          process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";
        const token = localStorage.getItem("supplier_access_token");

        // Use supplier-backend endpoint which proxies to clinic-backend
        const clinicsResponse = await fetch(
          `${supplierApiUrl}/supplier/manager/clinics`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );

        if (clinicsResponse.ok) {
          const clinicsData = await clinicsResponse.json();

          // Format clinics data - get latest 2 clinics
          // Use Set to ensure unique clinics by tenant_id
          const seenTenantIds = new Set<string>();
          const formattedClinics: NewClinic[] = clinicsData
            .map((item: any, index: number) => {
              const clinic = item.clinic;
              if (!clinic) return null;

              const tenantId = item.tenant_id || clinic.id;

              // Skip if we've already seen this tenant_id
              if (seenTenantIds.has(tenantId)) {
                return null;
              }
              seenTenantIds.add(tenantId);

              // Format location (extract district and dong from location)
              const location = clinic.location || "";
              const areaMatch = location.match(/([가-힣]+구)\s*([가-힣]+동)/);
              const area = areaMatch
                ? `${areaMatch[1]} ${areaMatch[2]}`
                : location || "지역 정보 없음";

              // Format registration time (from requested_at or approved_at)
              const registrationDate =
                item.approved_at || item.requested_at || item.created_at;
              const date = new Date(registrationDate);
              const year = date.getFullYear().toString().slice(-2);
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              const registrationTime = `${year}-${month}-${day}`;

              return {
                id: `${tenantId}_${index}`, // Ensure unique ID
                name: clinic.name || "알 수 없음",
                area: area,
                registrationTime: registrationTime,
              };
            })
            .filter((clinic: NewClinic | null) => clinic !== null)
            .slice(0, 2); // Get only first 2 unique clinics

          setNewClinics(formattedClinics);
        } else {
          console.error("Failed to fetch clinics:", clinicsResponse.statusText);
          // Fallback to empty array if API fails
          setNewClinics([]);
        }
      } catch (error) {
        console.error("Error fetching clinics:", error);
        // Fallback to empty array if API fails
        setNewClinics([]);
      }

      // Fetch orders from API
      try {
        const supplierApiUrl =
          process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";
        const token = localStorage.getItem("supplier_access_token");

        // Fetch latest orders (pending and confirmed status)
        const ordersResponse = await fetch(
          `${supplierApiUrl}/supplier/orders?status=all&limit=3`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();

          // Format orders data - get latest 3 orders
          const formattedOrders: Order[] = (ordersData.orders || [])
            .slice(0, 3)
            .map((order: any) => {
              // Map status to Korean
              const statusMap: Record<string, "접수대기" | "진행중" | "완료"> =
                {
                  pending: "접수대기",
                  confirmed: "진행중",
                  shipped: "진행중",
                  completed: "완료",
                  rejected: "접수대기", // Rejected orders can be shown as pending
                };

              const koreanStatus = statusMap[order.status] || "접수대기";

              // Format timestamp
              const orderDate = new Date(order.orderDate);
              const month = String(orderDate.getMonth() + 1).padStart(2, "0");
              const day = String(orderDate.getDate()).padStart(2, "0");
              const hours = String(orderDate.getHours()).padStart(2, "0");
              const minutes = String(orderDate.getMinutes()).padStart(2, "0");
              const timestamp = `${month}-${day} ${hours}:${minutes}`;

              // Determine time type based on status
              const timeType =
                order.status === "pending" ? "요청시간" : "확인시간";

              // Get clinic tenant ID for settlement page link
              const clinicTenantId =
                order.clinic?.tenantId || order.clinicTenantId || order.id;

              return {
                id: clinicTenantId, // Use clinic tenant ID for settlement page
                clinicName:
                  order.clinic?.name || order.clinicName || "알 수 없음",
                status: koreanStatus,
                timestamp: timestamp,
                timeType: timeType,
              };
            });

          setOrders(formattedOrders);
        } else {
          console.error("Failed to fetch orders:", ordersResponse.statusText);
          // Fallback to empty array if API fails
          setOrders([]);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
        // Fallback to empty array if API fails
        setOrders([]);
      }

      setReturnExchanges([
        {
          id: "1",
          clinicName: "EEE Clinic",
          status: "접수대기",
          timestamp: "00-00 10:50",
          timeType: "요청시간",
        },
        {
          id: "2",
          clinicName: "A Clinic",
          status: "진행중",
          timestamp: "00-00 10:50",
          timeType: "확인시간",
        },
      ]);

      setReturns([
        {
          id: "1",
          clinicName: "A Clinic",
          status: "접수대기",
          timestamp: "00-00 10:50",
          timeType: "요청시간",
        },
      ]);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "접수대기":
        return "bg-green-600";
      case "진행중":
        return "bg-orange-500";
      case "완료":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("ko-KR");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation Bar */}
      <div
  className="sticky top-0 z-30 flex items-center justify-between bg-white px-4 py-4 shadow-sm"
        style={{ backgroundColor: "#ffffff" }}
      >
        <h1 className="text-lg font-bold ml-14 mt-2 text-gray-900">대시보드</h1>
        <button className="relative flex ml-2 mt-2 items-center justify-center">
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

  {notificationCount > 0 && (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {notificationCount}
    </span>
  )}
</button>
      </div>

      {/* Dashboard Content */}
      <div className="p-4 space-y-4">
        {/* 신규 가입 병의원 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              신규 가입 병의원
            </h2>
            <Link
              href="/settings/clinics"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {newClinics.map((clinic) => (
              <div
                key={clinic.id}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {clinic.name}
                </p>
                <p className="text-xs text-gray-600 mb-1">
                  지역: {clinic.area}
                </p>
                <p className="text-xs text-gray-500">
                  가입시간: {clinic.registrationTime}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 주문 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">주문</h2>
            <Link
              href="/orders"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(
                      order.status
                    )}`}
                  >
                    {order.status}
                  </span>
                  <Link
                    href={`/settlement/${order.id}`}
                    className="text-sm font-medium text-gray-900 underline hover:text-blue-600"
                  >
                    {order.clinicName}
                  </Link>
                </div>
                <span className="text-xs text-gray-500">
                  {order.timeType} {order.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 반품 및 교환 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              반품 및 교환
            </h2>
            <Link
              href="/exchanges"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="space-y-2">
            {returnExchanges.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                  <Link
                    href={`/exchanges/${item.id}`}
                    className="text-sm font-medium text-gray-900 underline hover:text-blue-600"
                  >
                    {item.clinicName}
                  </Link>
                </div>
                <span className="text-xs text-gray-500">
                  {item.timeType} {item.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 반납 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">반납</h2>
            <Link
              href="/returns"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="space-y-2">
            {returns.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                  <Link
                    href={`/returns/${item.id}`}
                    className="text-sm font-medium text-gray-900 underline hover:text-blue-600"
                  >
                    {item.clinicName}
                  </Link>
                </div>
                <span className="text-xs text-gray-500">
                  {item.timeType} {item.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 나의 전산 Section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">나의 전산</h2>
            <Link
              href="/settings"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {/* 총 업체수 Card */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">총 업체수</p>
              <p className="text-lg font-bold text-gray-900">
                {stats.totalCompanies}
              </p>
            </div>

            {/* 총 미수금 Card */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">총 미수금</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(stats.totalReceivables)}
              </p>
            </div>

            {/* TOP 3 Card */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-2">TOP 3</p>
              <div className="space-y-1">
                {stats.topCompanies.map((company, index) => (
                  <div
                    key={company.id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-900">
                      {company.name}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(company.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
