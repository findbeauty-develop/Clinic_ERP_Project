"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, getTenantId } from "../../../lib/api";

type WarehouseLocation = {
  name: string;
  items: string[];
};

type WarehouseCategory = {
  category: string;
  locations: WarehouseLocation[];
};

export default function WarehouseManagementPage() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", []);
  const [warehouses, setWarehouses] = useState<WarehouseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newItems, setNewItems] = useState("");

  useEffect(() => {
    fetchWarehouses();
  }, [apiUrl]);

  const fetchWarehouses = async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantId = getTenantId();
      
      // Fetch warehouse locations from WarehouseLocation table
      const warehouseLocations = await apiGet<any[]>(`${apiUrl}/products/warehouses/list`).catch(() => []);
      console.log("Warehouse locations from API:", warehouseLocations);
      
      // Also fetch storage locations from Batch table (for backward compatibility)
      const storages = await apiGet<string[]>(`${apiUrl}/products/storages/list`).catch(() => []);
      
      // Fetch inventory by location to get items (for batch-based storages)
      const inventoryByLocation = await apiGet<any[]>(`${apiUrl}/inventory/by-location`).catch(() => []);
      
      // Organize warehouses by category
      const organized = organizeWarehouses(warehouseLocations, storages, inventoryByLocation);
      console.log("Organized warehouses:", organized);
      setWarehouses(organized);
    } catch (err: any) {
      console.error("Failed to load warehouses", err);
      setError(`창고 위치 정보를 불러오지 못했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const parseLocationItems = (locationName: string): string[] => {
    // Try to extract items from location name
    // For example: "수면실 A 침대, B 침대" -> ["A 침대", "B 침대"]
    const items: string[] = [];
    
    // Check if location name contains bed positions (A, B, C, etc.)
    const bedMatches = locationName.match(/([A-Z]\s*침대)/g);
    if (bedMatches) {
      return bedMatches;
    }
    
    // If no specific items found, return empty array
    return items;
  };

  const organizeWarehouses = (
    warehouseLocations: any[],
    storages: string[],
    inventoryByLocation: any[]
  ): WarehouseCategory[] => {
    // Create a map of location to items from inventory
    const locationItemsMap = new Map<string, string[]>();
    
    inventoryByLocation.forEach((loc) => {
      const items = loc.items?.map((item: any) => {
        return item.productName || item.batchNo || "항목";
      }) || [];
      locationItemsMap.set(loc.location, items);
    });

    // Categorize locations
    const categories: Record<string, WarehouseLocation[]> = {
      "수면실": [],
      "레이저 실": [],
      "창고": [],
      "기타": [],
    };

    // Process warehouse locations from WarehouseLocation table
    warehouseLocations.forEach((warehouse) => {
      console.log("Processing warehouse:", warehouse);
      const category = warehouse.category || "기타";
      const categoryKey = category in categories ? category : "기타";
      
      // Ensure items is an array
      const items = Array.isArray(warehouse.items) ? warehouse.items : (warehouse.items ? [warehouse.items] : []);
      console.log("Warehouse items:", items);
      
      categories[categoryKey].push({
        name: warehouse.name,
        items: items,
      });
    });

    // Process batch-based storages (for backward compatibility)
    const processedWarehouseNames = new Set(warehouseLocations.map((w) => w.name));
    
    storages.forEach((storage) => {
      // Skip if already processed from WarehouseLocation table
      if (processedWarehouseNames.has(storage)) {
        return;
      }

      const items = locationItemsMap.get(storage) || [];
      
      // Categorize based on storage name
      if (storage.includes("수면") || storage.includes("침대")) {
        categories["수면실"].push({ name: storage, items });
      } else if (storage.includes("레이저") || storage.includes("라저")) {
        categories["레이저 실"].push({ name: storage, items });
      } else if (storage.includes("창고") || storage.match(/창고\s*\d+/)) {
        categories["창고"].push({ name: storage, items });
      } else {
        categories["기타"].push({ name: storage, items });
      }
    });

    // Convert to array format and filter empty categories
    const result: WarehouseCategory[] = [];
    
    Object.entries(categories).forEach(([category, locations]) => {
      if (locations.length > 0) {
        result.push({ category, locations });
      }
    });

    // Sort 창고 locations by number
    result.forEach((cat) => {
      if (cat.category === "창고") {
        cat.locations.sort((a, b) => {
          const numA = parseInt(a.name.match(/\d+/)?.[0] || "0");
          const numB = parseInt(b.name.match(/\d+/)?.[0] || "0");
          return numA - numB;
        });
      }
    });

    return result;
  };

  const handleAddWarehouse = async () => {
    if (!newWarehouseName.trim()) {
      alert("창고 이름을 입력하세요.");
      return;
    }

    try {
      // Parse items from input (comma or pipe separated)
      const items = newItems
        .split(/[|,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      console.log("Adding warehouse with items:", items);

      const result = await apiPost(`${apiUrl}/products/warehouse`, {
        name: newWarehouseName.trim(),
        category: newCategory || null,
        items: items,
      });

      console.log("Warehouse added result:", result);

      alert("창고가 추가되었습니다.");
      setShowAddModal(false);
      setNewWarehouseName("");
      setNewCategory("");
      setNewItems("");
      
      // Refresh warehouse list
      fetchWarehouses();
    } catch (err: any) {
      console.error("Failed to add warehouse", err);
      alert(`창고 추가에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            설정 및 서포트
          </h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            사용 환경 설정 및 문제 해결 지원
          </p>
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
              창고위치 관리
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              창고 추가
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {error}
            <button
              onClick={() => {
                setError(null);
                fetchWarehouses();
              }}
              className="ml-4 text-xs underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
          </div>
        )}

        {/* Warehouse List */}
        {!loading && !error && (
          <div className="space-y-8">
            {warehouses.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400">
                  창고 위치가 없습니다.
                </p>
              </div>
            ) : (
              warehouses.map((category) => (
                <div
                  key={category.category}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <h3 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                    {category.category}
                  </h3>
                  <div className="space-y-4">
                    {category.locations.map((location, idx) => {
                      // Use items from database
                      console.log("Location:", location.name, "Items:", location.items);
                      const displayItems = location.items && Array.isArray(location.items) && location.items.length > 0 
                        ? location.items 
                        : [];
                      console.log("Display items:", displayItems);
                      
                      return (
                        <div
                          key={`${location.name}-${idx}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700/50"
                        >
                          <div className="text-sm">
                            <span className="font-semibold text-slate-600 dark:text-slate-400">
                              {location.name}:
                            </span>{" "}
                            {displayItems.length > 0 ? (
                              <span className="text-slate-900 dark:text-slate-100">
                                {displayItems
                                  .map((item, itemIdx) => (
                                    <span key={itemIdx}>
                                      {item}
                                      {itemIdx < displayItems.length - 1 && " | "}
                                    </span>
                                  ))}
                              </span>
                            ) : (
                              <span className="text-slate-400">항목 없음</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add Warehouse Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
              <h4 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                창고 추가
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    카테고리
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  >
                    <option value="">선택하세요</option>
                    <option value="수면실">수면실</option>
                    <option value="레이저 실">레이저 실</option>
                    <option value="창고">창고</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    창고 이름
                  </label>
                  <input
                    type="text"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="예: 창고 1, A 침대 등"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAddWarehouse}
                  className="flex-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
                >
                  추가
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewWarehouseName("");
                    setNewCategory("");
                    setNewItems("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

