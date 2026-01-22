"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../../lib/api";

type InventorySummary = {
  inbound: {
    total: number;
    previous: number;
    change: number;
  };
  outbound: {
    total: number;
    previous: number;
    change: number;
  };
  lastUpdated: string;
};

type RiskyItem = {
  productId: string;
  productName: string;
  batchNo: string;
  remainingQty: number;
  unit: string;
  daysUntilExpiry: number;
  usageRate: number;
};

type DepletionItem = {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
  minStock: number;
  lastOrderQty: number;
  orderFrequency: string;
  estimatedDepletion: string;
};

type TopValueProduct = {
  productId: string;
  productName: string;
  category: string;
  imageUrl?: string | null;
  quantity: number;
  unit: string;
  totalValue: number;
  unitValue: number;
};

type LocationInventory = {
  location: string;
  productCount: number;
  items: Array<{
    productId: string;
    productName: string;
    batchNo: string;
    quantity: number;
    unit: string;
  }>;
};

export default function InventoryPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [riskyItems, setRiskyItems] = useState<RiskyItem[]>([]);
  const [depletionItems, setDepletionItems] = useState<DepletionItem[]>([]);
  const [topValueProducts, setTopValueProducts] = useState<TopValueProduct[]>(
    []
  );
  const [locations, setLocations] = useState<LocationInventory[]>([]);
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7" | "30" | "90" | "other">("7");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  useEffect(() => {
    fetchAllData();
  }, [apiUrl, dateRange, customStartDate, customEndDate]);

  const getDateRange = () => {
    const end = new Date();
    let start: Date;

    if (dateRange === "7") {
      start = new Date();
      start.setDate(start.getDate() - 7);
    } else if (dateRange === "30") {
      start = new Date();
      start.setDate(start.getDate() - 30);
    } else if (dateRange === "90") {
      start = new Date();
      start.setDate(start.getDate() - 90);
    } else {
      // Custom date range
      if (customStartDate && customEndDate) {
        start = new Date(customStartDate);
        end.setTime(new Date(customEndDate).getTime());
      } else {
        start = new Date();
        start.setDate(start.getDate() - 7);
      }
    }

    return { start, end };
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [
        summaryData,
        riskyData,
        depletionData,
        topValueData,
        locationData,
      ] = await Promise.all([
        apiGet<InventorySummary>(
          `${apiUrl}/inventory/summary?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
        ),
        apiGet<RiskyItem[]>(`${apiUrl}/inventory/risky`),
        apiGet<DepletionItem[]>(`${apiUrl}/inventory/depletion`),
        apiGet<TopValueProduct[]>(`${apiUrl}/inventory/top-value?limit=8`),
        apiGet<LocationInventory[]>(`${apiUrl}/inventory/by-location`),
      ]);

      setSummary(summaryData);
      setRiskyItems(riskyData);
      setDepletionItems(depletionData);
      setTopValueProducts(topValueData);
      setLocations(locationData);
    } catch (err) {
      console.error("Failed to load inventory data", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  const formatImageUrl = (
    imageUrl: string | null | undefined
  ): string | null => {
    if (!imageUrl) return null;
    // Agar to'liq URL bo'lsa (http:// yoki https:// bilan boshlansa), o'zgartirmaslik
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }
    // Agar base64 bo'lsa, o'zgartirmaslik
    if (imageUrl.startsWith("data:image")) {
      return imageUrl;
    }
    // Relative path bo'lsa, apiUrl qo'shish
    if (imageUrl.startsWith("/")) {
      return `${apiUrl}${imageUrl}`;
    }
    return imageUrl;
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">재고 현황</h1>
            <p className="text-sm text-slate-600 mt-1">
              재고 현황과 입출고 동향을 분석합니다
            </p>
          </div>
          {summary && (
            <p className="text-sm text-slate-500">
              마지막 업데이트: {formatDate(summary.lastUpdated)}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* 출입고 요약 */}
        <section className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            출입고 요약
          </h2>

          {/* Date Range Selector */}
          <div className="mb-4 flex items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700">
                기간:
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dateRange"
                    value="7"
                    checked={dateRange === "7"}
                    onChange={(e) => setDateRange(e.target.value as any)}
                    className="
  h-4 w-4 shrink-0 rounded-full
  appearance-none bg-white
  border border-slate-300
  relative
  checked:border-blue-600
  focus:outline-none focus:ring-2 focus:ring-blue-500
  after:content-['']
  after:absolute after:left-1/2 after:top-1/2
  after:h-2 after:w-2
  after:-translate-x-1/2 after:-translate-y-1/2
  after:rounded-full
  after:bg-transparent
  checked:after:bg-blue-600
  dark:bg-white dark:border-slate-400
"
                  />
                  <span className="text-sm text-slate-700">7일</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dateRange"
                    value="30"
                    checked={dateRange === "30"}
                    onChange={(e) => setDateRange(e.target.value as any)}
                    className="
  h-4 w-4 shrink-0 rounded-full
  appearance-none bg-white
  border border-slate-300
  relative
  checked:border-blue-600
  focus:outline-none focus:ring-2 focus:ring-blue-500
  after:content-['']
  after:absolute after:left-1/2 after:top-1/2
  after:h-2 after:w-2
  after:-translate-x-1/2 after:-translate-y-1/2
  after:rounded-full
  after:bg-transparent
  checked:after:bg-blue-600
  dark:bg-white dark:border-slate-400
"
                  />
                  <span className="text-sm text-slate-700">30일</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dateRange"
                    value="90"
                    checked={dateRange === "90"}
                    onChange={(e) => setDateRange(e.target.value as any)}
                    className="
  h-4 w-4 shrink-0 rounded-full
  appearance-none bg-white
  border border-slate-300
  relative
  checked:border-blue-600
  focus:outline-none focus:ring-2 focus:ring-blue-500
  after:content-['']
  after:absolute after:left-1/2 after:top-1/2
  after:h-2 after:w-2
  after:-translate-x-1/2 after:-translate-y-1/2
  after:rounded-full
  after:bg-transparent
  checked:after:bg-blue-600
  dark:bg-white dark:border-slate-400
"
                  />
                  <span className="text-sm text-slate-700">90일</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dateRange"
                    value="other"
                    checked={dateRange === "other"}
                    onChange={(e) => setDateRange(e.target.value as any)}
                    className="
  h-4 w-4 shrink-0 rounded-full
  appearance-none bg-white
  border border-slate-300
  relative
  checked:border-blue-600
  focus:outline-none focus:ring-2 focus:ring-blue-500
  after:content-['']
  after:absolute after:left-1/2 after:top-1/2
  after:h-2 after:w-2
  after:-translate-x-1/2 after:-translate-y-1/2
  after:rounded-full
  after:bg-transparent
  checked:after:bg-blue-600
  dark:bg-white dark:border-slate-400
"
                  />
                  <span className="text-sm text-slate-700">기타</span>
                </label>
              </div>

              {dateRange === "other" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-1 border border-slate-300 rounded text-sm bg-white text-slate-900
                             [color-scheme:light] dark:bg-white dark:text-slate-900 dark:border-slate-300"
                  />
                  <span className="text-slate-500">~</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-1 border border-slate-300 rounded text-sm bg-white text-slate-900
                             [color-scheme:light] dark:bg-white dark:text-slate-900 dark:border-slate-300"
                  />
                </div>
              )}
            </div>
            <Link
              href="/order"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              주문하기
            </Link>
          </div>

          {/* Summary Boxes */}
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-sm text-slate-600 mb-1">총 입고량</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">
                  {summary?.inbound.total || 0}
                </p>
                {summary && summary.inbound.change !== 0 && (
                  <p
                    className={`text-sm font-medium ${
                      summary.inbound.change > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    전 비교 {summary.inbound.change > 0 ? "+" : ""}
                    {summary.inbound.change}
                  </p>
                )}
              </div>
            </div>

            <div className="flex-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-sm text-slate-600 mb-1">총 출고량</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">
                  {summary?.outbound.total || 0}
                </p>
                {summary && summary.outbound.change !== 0 && (
                  <p
                    className={`text-sm font-medium ${
                      summary.outbound.change > 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    전 비교 {summary.outbound.change > 0 ? "+" : ""}
                    {summary.outbound.change}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 위험재고 */}
        <section className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            위험재고
          </h2>
          {loading ? (
            <p className="text-slate-500 text-center py-8">로딩 중...</p>
          ) : riskyItems.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              위험재고가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      제품명
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      임박기간
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      배치
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      남은 수량
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      사용량
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {riskyItems.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.productName}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        D-{item.daysUntilExpiry}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.batchNo}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.remainingQty} {item.unit}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.usageRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 소진 */}
        <section className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">소진</h2>
          {loading ? (
            <p className="text-slate-500 text-center py-8">로딩 중...</p>
          ) : depletionItems.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              소진 예정 제품이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      제품명
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      현재고
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      안정 재고
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      전 주문량
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      주문 빈도
                    </th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">
                      소진 예상
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {depletionItems.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.productName}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.minStock} {item.unit}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.lastOrderQty} {item.unit}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.orderFrequency}
                      </td>
                      <td className="py-2 px-4 text-sm text-slate-900">
                        {item.estimatedDepletion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bottom Section: Top Value Products and Location View */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 재고 가치 상위 제품 */}
          <section className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                재고 가치 상위 제품
              </h2>
              <Link
                href="/inventory/products"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                전체 제품
              </Link>
            </div>
            {loading ? (
              <p className="text-slate-500 text-center py-8">로딩 중...</p>
            ) : topValueProducts.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                제품이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {topValueProducts.map((product, index) => (
                  <Link
                    key={product.productId}
                    href={`/products/${product.productId}`}
                    className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-slate-600 font-bold">
                      {index + 1}
                    </div>
                    {formatImageUrl(product.imageUrl) ? (
                      <img
                        src={formatImageUrl(product.imageUrl) || ""}
                        alt={product.productName}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                        이미지
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">
                        {product.productName}
                      </p>
                      <p className="text-sm text-slate-600">
                        {product.category} ({product.quantity}
                        {product.unit})
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        ₩{formatCurrency(product.totalValue)}
                      </p>
                      <p className="text-xs text-slate-500">
                        ₩{formatCurrency(product.unitValue)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 위치별 보기 */}
          <section className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              위치별 보기
            </h2>
            {loading ? (
              <p className="text-slate-500 text-center py-8">로딩 중...</p>
            ) : locations.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                위치 정보가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {locations.map((location) => {
                  const isExpanded = expandedLocations.has(location.location);
                  return (
                    <div
                      key={location.location}
                      className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
                    >
                      {/* Header */}
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedLocations);
                          if (isExpanded) {
                            newExpanded.delete(location.location);
                          } else {
                            newExpanded.add(location.location);
                          }
                          setExpandedLocations(newExpanded);
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4 text-sm">
                          <span className="font-medium text-slate-900">
                            {location.location}
                          </span>
                          <span className="text-slate-600">
                            제품종류 {location.productCount}종
                          </span>
                        </div>
                        <svg
                          className={`w-5 h-5 text-slate-500 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
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
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-1 border-t border-slate-100">
                          {location.items.map((item) => (
                            <div
                              key={`${location.location}-${item.batchNo}`}
                              className="flex justify-between items-center py-2 text-sm text-slate-700"
                            >
                              <span className="font-medium">
                                {item.productName}
                              </span>
                              <span className="text-slate-600">
                                {item.batchNo}, {item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
