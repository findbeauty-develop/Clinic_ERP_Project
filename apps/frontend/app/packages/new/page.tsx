"use client";

import { useEffect, useMemo, useState, memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "../../../lib/api";

type Batch = {
  id: string;
  batch_no: string;
  qty: number;
  inbound_qty?: number | null;
  used_count?: number | null; // ✅ Add for availableQuantity calculation
  available_quantity?: number | null; // ✅ Add available_quantity from database
  min_stock?: number | null;
  expiry_date?: string | null;
  storage?: string | null;
  isExpiringSoon?: boolean;
  daysUntilExpiry?: number | null;
};

type Product = {
  id: string;
  productName: string;
  brand: string;
  barcode?: string | null;
  category: string;
  unit?: string | null;
  currentStock?: number;
  minStock?: number;
  usageCapacity?: number | null;
  usageCapacityUnit?: string | null;
  capacityPerProduct?: number | null; // ✅ Add for availableQuantity calculation
  capacityUnit?: string | null; // ✅ Add for capacity_unit display
  supplierName?: string | null;
  batches?: Batch[];
};

type SelectedItem = {
  productId: string;
  batchId: string;
  batchNo: string;
  productName: string;
  brand: string;
  unit: string;
  quantity: number;
};

// Product Card Component
const ProductCard = memo(function ProductCard({
  product,
  selectedItems,
  onQuantityChange,
  isExpanded,
  onToggleExpand,
}: {
  product: Product;
  selectedItems: SelectedItem[];
  onQuantityChange: (
    productId: string,
    batchId: string,
    batchNo: string,
    productName: string,
    brand: string,
    unit: string,
    quantity: number,
    maxQuantity?: number,
    capacity_unit?: string // ✅ Add capacity_unit parameter
  ) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  // Helper function to calculate available quantity for a batch
  const calculateAvailableQuantity = (batch: Batch): number => {
    // ✅ First: Use available_quantity from database if available
    if (
      batch.available_quantity !== null &&
      batch.available_quantity !== undefined
    ) {
      return batch.available_quantity;
    }

    // Fallback: Calculate if available_quantity not in database
    // If inbound_qty, capacity_per_product, and usage_capacity exist, use them
    if (
      batch.inbound_qty !== null &&
      batch.inbound_qty !== undefined &&
      product.capacityPerProduct !== null &&
      product.capacityPerProduct !== undefined &&
      product.capacityPerProduct > 0 &&
      product.usageCapacity !== null &&
      product.usageCapacity !== undefined &&
      product.usageCapacity > 0
    ) {
      // Jami miqdor: inbound_qty * capacity_per_product
      const totalQuantity = batch.inbound_qty * product.capacityPerProduct;
      // Ishlatilgan miqdor: used_count (agar mavjud bo'lsa)
      const usedCount = batch.used_count || 0;
      // Qolgan miqdor: totalQuantity - usedCount
      return Math.max(0, totalQuantity - usedCount);
    }
    // Fallback: agar capacity_per_product yo'q bo'lsa, oddiy batch.qty
    if (
      batch.inbound_qty !== null &&
      batch.inbound_qty !== undefined &&
      product.capacityPerProduct !== null &&
      product.capacityPerProduct !== undefined &&
      product.capacityPerProduct > 0
    ) {
      // usage_capacity yo'q bo'lsa ham, capacity_per_product bor bo'lsa
      return batch.inbound_qty * product.capacityPerProduct;
    }
    return batch.qty;
  };

  // Calculate total stock (sum of all batches' available quantities)
  const totalStock =
    product.batches
      ?.filter((batch) => batch.qty > 0)
      .reduce((sum, batch) => sum + calculateAvailableQuantity(batch), 0) ?? 0;

  // Filter batches (only qty > 0) and sort (qty ascending, then FEFO)
  const availableBatches =
    product.batches
      ?.filter((batch) => batch.qty > 0)
      .sort((a, b) => {
        // 1. Sort by quantity (lowest first)
        if (a.qty !== b.qty) {
          return a.qty - b.qty;
        }
        // 2. Sort by expiry date (FEFO - oldest first)
        const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
        const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        // 3. Sort by batch number
        return (a.batch_no || "").localeCompare(b.batch_no || "");
      }) ?? [];

  // Unit logic: if usageCapacity exists, use usageCapacityUnit, otherwise use unit
  const displayUnit =
    product.usageCapacity && product.usageCapacityUnit
      ? product.usageCapacityUnit
      : product.unit || "단위";

  if (availableBatches.length === 0) {
    return null; // Don't show product if no available batches
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60">
      {/* Product Parent Card Header */}
      <div className="flex items-center justify-between p-4">
        {/* Product Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {product.productName}
            </h3>
            {product.brand && (
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {product.brand}
              </span>
            )}
            {product.category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {product.category}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">
              총 재고: {totalStock.toLocaleString()} {displayUnit}
            </span>
            {product.supplierName && (
              <span>공급처: {product.supplierName}</span>
            )}
          </div>
        </div>

        {/* Batch Count and Expand/Collapse Button */}
        <div className="ml-4 flex flex-shrink-0 items-center gap-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {availableBatches.length} 배치
          </span>
          <button
            onClick={onToggleExpand}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Batch Cards (when expanded) */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="space-y-2 p-4">
            {availableBatches.map((batch) => {
              const selectedItem = selectedItems.find(
                (item) =>
                  item.productId === product.id && item.batchId === batch.id
              );
              const quantity = selectedItem?.quantity || 0;

              // Format expiry date
              const expiryDateStr = batch.expiry_date
                ? new Date(batch.expiry_date)
                    .toLocaleDateString("ko-KR", {
                      year: "2-digit",
                      month: "2-digit",
                      day: "2-digit",
                    })
                    .replace(/\s/g, "-")
                    .replace(/\./g, "")
                : "00-00-00";

              // Check if THIS batch has low stock
              const batchMinStock = batch.min_stock ?? product.minStock;
              const isBatchLowStock = batchMinStock
                ? batch.qty <= batchMinStock
                : false;

              return (
                <div
                  key={batch.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  {/* Left Section - Batch Info */}
                  <div className="min-w-0 flex-1">
                    {/* Top Line - Batch Number and Badges */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        배치: {batch.batch_no}
                      </span>
                      {batch.isExpiringSoon && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
                          유효기간 임박
                        </span>
                      )}
                      {isBatchLowStock && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                          부족
                        </span>
                      )}
                    </div>

                    {/* Bottom Line - Batch Details */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <span
                        className={
                          isBatchLowStock
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : ""
                        }
                      >
                        재고:{" "}
                        {batch.inbound_qty !== null &&
                        batch.inbound_qty !== undefined &&
                        product.capacityPerProduct !== null &&
                        product.capacityPerProduct !== undefined &&
                        product.capacityPerProduct > 0 &&
                        product.usageCapacity !== null &&
                        product.usageCapacity !== undefined &&
                        product.usageCapacity > 0
                          ? `${batch.qty.toLocaleString()} [${calculateAvailableQuantity(batch).toLocaleString()}]`
                          : batch.inbound_qty !== null &&
                              batch.inbound_qty !== undefined &&
                              product.capacityPerProduct !== null &&
                              product.capacityPerProduct !== undefined &&
                              product.capacityPerProduct > 0
                            ? `${batch.qty.toLocaleString()} [${calculateAvailableQuantity(batch).toLocaleString()}]`
                            : `${batch.qty.toString().padStart(2, "0")}`}{" "}
                        {displayUnit}
                      </span>
                      {batch.expiry_date && (
                        <span>유효기한: {expiryDateStr}</span>
                      )}
                      {batch.storage && <span>위치: {batch.storage}</span>}
                    </div>
                  </div>

                  {/* Right Section - Quantity Controls */}
                  <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                    {(() => {
                      const availableQuantity =
                        calculateAvailableQuantity(batch);
                      return (
                        <>
                          <button
                            onClick={() =>
                              onQuantityChange(
                                product.id,
                                batch.id,
                                batch.batch_no,
                                product.productName,
                                product.brand,
                                displayUnit,
                                Math.max(0, quantity - 1),
                                availableQuantity,
                                product.capacityUnit || undefined
                              )
                            }
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={availableQuantity}
                            value={quantity}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 0;
                              onQuantityChange(
                                product.id,
                                batch.id,
                                batch.batch_no,
                                product.productName,
                                product.brand,
                                displayUnit,
                                Math.min(newQty, availableQuantity),
                                availableQuantity,
                                product.capacityUnit || undefined
                              );
                            }}
                            className="h-10 w-20 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() =>
                              onQuantityChange(
                                product.id,
                                batch.id,
                                batch.batch_no,
                                product.productName,
                                product.brand,
                                displayUnit,
                                Math.min(quantity + 1, availableQuantity),
                                availableQuantity,
                                product.capacityUnit || undefined
                              )
                            }
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            +
                          </button>
                          <span className="ml-2 flex-shrink-0 whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200">
                            {(product.usageCapacity ?? 0).toLocaleString()}{" "}
                            {displayUnit}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

ProductCard.displayName = "ProductCard";

export default function PackageNewPage() {
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [packageName, setPackageName] = useState("");
  const [packageNameSuggestions, setPackageNameSuggestions] = useState<
    string[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  // ✅ Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Expand/collapse state for products
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set()
  );

  // Load package data if in edit mode
  useEffect(() => {
    const loadPackageForEdit = async () => {
      const packageId = sessionStorage.getItem("editing_package_id");
      if (packageId) {
        setEditingPackageId(packageId);
        setIsEditMode(true);

        try {
          // Load package details
          const packageData = await apiGet<any>(
            `${apiUrl}/packages/${packageId}`
          );
          setPackageName(packageData.name || "");

          // Load package items
          const itemsData = await apiGet<any[]>(
            `${apiUrl}/packages/${packageId}/items`
          );
          // Note: Package items don't have batchId in edit mode, so we'll use a placeholder
          // In edit mode, we aggregate by productId since batch info isn't stored
          const formattedItems = itemsData.map((item: any, index: number) => ({
            productId: item.productId || item.product_id,
            batchId: item.batchId || item.batch_id || `temp-${index}`, // Temporary batchId for edit mode
            batchNo: item.batchNo || item.batch_no || "N/A",
            productName: item.productName || item.product?.name || "",
            brand: item.brand || item.product?.brand || "",
            unit: item.unit || item.product?.unit || "개",
            quantity: item.quantity || 0,
          }));
          setSelectedItems(formattedItems);
        } catch (err) {
          console.error("Failed to load package for edit:", err);
          alert("패키지 정보를 불러오지 못했습니다.");
        }
      }
    };

    loadPackageForEdit();

    // Cleanup: Clear sessionStorage when component unmounts
    return () => {
      // Only clear if not redirecting to outbound
      if (!window.location.pathname.includes("/outbound")) {
        sessionStorage.removeItem("editing_package_id");
      }
    };
  }, [apiUrl]);

  useEffect(() => {
    fetchProducts();
  }, [apiUrl]);

  useEffect(() => {
    if (packageName.trim() && packageName.length >= 2) {
      fetchPackageNameSuggestions(packageName);
    } else {
      setPackageNameSuggestions([]);
      setShowSuggestions(false);
    }
  }, [packageName, apiUrl]);

  const fetchProducts = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all products for package creation
      // Use getAllProducts endpoint which returns products with batches
      // Add cache-busting parameter when force refresh
      const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : "";
      const data = await apiGet<any[]>(
        `${apiUrl}/products${cacheBuster}`,
        forceRefresh
          ? {
              headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
              },
            }
          : undefined
      );

      // Format products with batches
      const formattedProducts = data.map((product: any) => {
        // Format batches
        const batches: Batch[] = (product.batches || []).map((batch: any) => ({
          id: batch.id,
          batch_no: batch.batch_no || batch.batchNo,
          qty: batch.qty || 0,
          inbound_qty: batch.inbound_qty || batch.inboundQty,
          used_count: batch.used_count || batch.usedCount || null, // ✅ Add used_count
          available_quantity:
            batch.available_quantity || batch.availableQuantity || null, // ✅ Add available_quantity
          min_stock: batch.min_stock || batch.minStock,
          expiry_date: batch.expiry_date || batch.expiryDate,
          storage: batch.storage,
          isExpiringSoon: batch.isExpiringSoon,
          daysUntilExpiry: batch.daysUntilExpiry,
        }));

        return {
          id: product.id,
          productName: product.productName || product.name,
          brand: product.brand,
          barcode: product.barcode,
          category: product.category,
          unit: product.unit || "개",
          currentStock: product.currentStock || product.current_stock || 0,
          minStock: product.minStock || product.min_stock,
          usageCapacity: product.usageCapacity || product.usage_capacity,
          usageCapacityUnit: product.usageCapacityUnit || product.capacity_unit,
          capacityPerProduct:
            product.capacityPerProduct || product.capacity_per_product, // ✅ Add capacityPerProduct
          capacityUnit: product.capacityUnit || product.capacity_unit, // ✅ Add capacityUnit
          supplierName: product.supplierName || product.supplier_name,
          batches: batches.filter((b) => b.qty > 0), // Only batches with qty > 0
        };
      });

      setProducts(formattedProducts);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("제품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPackageNameSuggestions = async (query: string) => {
    try {
      const data = await apiGet<{ name: string }[]>(
        `${apiUrl}/packages/search/names?q=${encodeURIComponent(query)}&limit=10`
      );
      setPackageNameSuggestions(data.map((p) => p.name));
      setShowSuggestions(true);
    } catch (err) {
      console.error("Failed to load package name suggestions", err);
      setPackageNameSuggestions([]);
    }
  };

  // Toggle product expand/collapse
  const toggleProductExpand = useCallback((productId: string) => {
    setExpandedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  }, []);

  const handleQuantityChange = (
    productId: string,
    batchId: string,
    batchNo: string,
    productName: string,
    brand: string,
    unit: string,
    newQuantity: number,
    maxQuantity?: number,
    capacity_unit?: string // ✅ Add capacity_unit parameter
  ) => {
    // Clamp quantity to max available
    const clampedQuantity = maxQuantity
      ? Math.min(newQuantity, maxQuantity)
      : newQuantity;

    if (clampedQuantity <= 0) {
      // Remove from selected items
      setSelectedItems((prev) =>
        prev.filter(
          (item) => !(item.productId === productId && item.batchId === batchId)
        )
      );
      return;
    }

    // Update or add to selected items
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === productId && item.batchId === batchId
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: clampedQuantity,
        };
        return updated;
      }

      return [
        ...prev,
        {
          productId,
          batchId,
          batchNo,
          productName,
          brand,
          unit,
          quantity: clampedQuantity,
        },
      ];
    });
  };

  const decreaseSelectedItem = (item: SelectedItem) => {
    const newQuantity = item.quantity - 1;
    if (newQuantity <= 0) {
      // Remove from selected items if quantity reaches 0
      setSelectedItems((prev) =>
        prev.filter(
          (selectedItem) =>
            !(
              selectedItem.productId === item.productId &&
              selectedItem.batchId === item.batchId
            )
        )
      );
    } else {
      // Decrease quantity by 1
      const product = products.find((p) => p.id === item.productId);
      const batch = product?.batches?.find((b) => b.id === item.batchId);
      if (product && batch) {
        // Calculate availableQuantity
        let availableQuantity = batch.qty;
        if (
          batch.inbound_qty !== null &&
          batch.inbound_qty !== undefined &&
          product.capacityPerProduct !== null &&
          product.capacityPerProduct !== undefined &&
          product.capacityPerProduct > 0 &&
          product.usageCapacity !== null &&
          product.usageCapacity !== undefined &&
          product.usageCapacity > 0
        ) {
          const totalQuantity = batch.inbound_qty * product.capacityPerProduct;
          const usedCount = batch.used_count || 0;
          availableQuantity = Math.max(0, totalQuantity - usedCount);
        } else if (
          batch.inbound_qty !== null &&
          batch.inbound_qty !== undefined &&
          product.capacityPerProduct !== null &&
          product.capacityPerProduct !== undefined &&
          product.capacityPerProduct > 0
        ) {
          availableQuantity = batch.inbound_qty * product.capacityPerProduct;
        }
        handleQuantityChange(
          item.productId,
          item.batchId,
          item.batchNo,
          item.productName,
          item.brand,
          item.unit,
          newQuantity,
          availableQuantity,
          product.capacityUnit || undefined
        );
      }
    }
  };

  const handlePackageNameSelect = (suggestion: string) => {
    setPackageName(suggestion);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!packageName.trim()) {
      alert("패키지 이름을 입력해주세요.");
      return;
    }

    if (selectedItems.length === 0) {
      alert("패키지에 포함할 제품을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      // Skip duplicate checks in edit mode
      if (!isEditMode) {
        // Check for duplicate package name
        const nameCheck = await apiPost<{
          exists: boolean;
          existingPackage?: { id: string; name: string };
        }>(`${apiUrl}/packages/check-name`, {
          name: packageName.trim(),
        });

        if (nameCheck.exists) {
          alert(
            "동일한 이름의 패키지를 생성할 수 없습니다. 다른 패키지 이름을 입력해주세요."
          );
          setSubmitting(false);
          return;
        }

        // Check for duplicate package composition
        // Aggregate quantities by productId for duplicate check
        const aggregatedForCheck = selectedItems.reduce(
          (acc, item) => {
            const existing = acc.find((i) => i.productId === item.productId);
            if (existing) {
              existing.quantity += item.quantity;
            } else {
              acc.push({
                productId: item.productId,
                quantity: item.quantity,
              });
            }
            return acc;
          },
          [] as { productId: string; quantity: number }[]
        );

        const duplicateCheck = await apiPost<{
          isDuplicate: boolean;
          existingPackage?: { id: string; name: string };
        }>(`${apiUrl}/packages/check-duplicate`, {
          name: packageName.trim(),
          items: aggregatedForCheck,
        });

        if (duplicateCheck.isDuplicate) {
          const confirmMessage = `동일 구성의 패키지가 이미 존재합니다: ${duplicateCheck.existingPackage?.name}\n그래도 등록하시겠습니까?`;
          if (!confirm(confirmMessage)) {
            setSubmitting(false);
            return;
          }
        }
      }

      // Prepare payload - aggregate quantities by productId
      // Backend expects product-level quantities, not batch-level
      const aggregatedItems = selectedItems.reduce(
        (acc, item) => {
          const existing = acc.find((i) => i.productId === item.productId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            acc.push({
              productId: item.productId,
              quantity: item.quantity,
            });
          }
          return acc;
        },
        [] as { productId: string; quantity: number }[]
      );

      const payload = {
        name: packageName.trim(),
        description: null,
        items: aggregatedItems,
      };

      // Update or create package
      if (isEditMode && editingPackageId) {
        const { apiPut } = await import("../../../lib/api");
        await apiPut(`${apiUrl}/packages/${editingPackageId}`, payload);
        alert("패키지가 성공적으로 수정되었습니다.");

        // Clear sessionStorage
        sessionStorage.removeItem("editing_package_id");

        // ✅ Force refresh products to get latest data after package update
        await fetchProducts(true);

        // Redirect to outbound page with package outbound tab
        router.push("/outbound?type=package");
      } else {
        const createdPackage = await apiPost(`${apiUrl}/packages`, payload);

        // ✅ Force refresh products to get latest data after package creation
        await fetchProducts(true);

        // ✅ Yangi package yaratilganda modal ko'rsatish
        setSubmitting(false); // Submitting'ni to'xtatish
        setShowSuccessModal(true);
        return; // Modal ko'rsatilganda funksiyani to'xtatish
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "패키지 저장 중 오류가 발생했습니다.";
      alert(`패키지 저장 실패: ${errorMessage}`);
      setSubmitting(false);
    }
  };

  // Filter products by search query (including batch numbers)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;

    const query = searchQuery.toLowerCase();
    return products.filter((product) => {
      // Check product fields
      if (
        product.productName.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query)
      ) {
        return true;
      }
      // Check batch numbers
      if (product.batches) {
        return product.batches.some((batch) =>
          batch.batch_no.toLowerCase().includes(query)
        );
      }
      return false;
    });
  }, [products, searchQuery]);

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back Arrow Button */}
              <Link
                href="/outbound"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="패키지 출고 페이지로 돌아가기"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                  출고 관리
                </h1>
                <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                  필요한 제품을 바로 출고해보세요.
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              마지막 업데이트: {new Date().toLocaleString("ko-KR")}
            </span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Left Panel - Product List */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                {isEditMode ? "패키지 수정" : "새 패키지등록"}
              </h2>

              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="제품명, 브랜드, 배치번호로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pl-10 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <svg
                    className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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

              {/* Product List */}
              {loading ? (
                <div className="py-8 text-center text-slate-500">
                  로딩 중...
                </div>
              ) : error ? (
                <div className="py-8 text-center text-red-500">{error}</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  제품이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredProducts
                    .filter((product) => {
                      // Only show products with batches
                      return product.batches && product.batches.length > 0;
                    })
                    .map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        selectedItems={selectedItems}
                        onQuantityChange={handleQuantityChange}
                        isExpanded={expandedProducts.has(product.id)}
                        onToggleExpand={() => toggleProductExpand(product.id)}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Package Info */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                패키지 이름
              </h2>

              {/* Package Name Input with Auto-complete */}
              <div className="mb-6 relative">
                <input
                  type="text"
                  placeholder="패키지 이름 입력"
                  value={packageName}
                  onChange={(e) => {
                    setPackageName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    if (packageNameSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className="h-11 w-full rounded-xl border-2 border-black bg-white px-4 text-sm text-slate-700 transition focus:border-black focus:outline-none dark:border-black dark:bg-slate-900 dark:text-slate-200"
                />
                {showSuggestions && packageNameSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border-2 border-black bg-white shadow-lg dark:border-black dark:bg-slate-900">
                    {packageNameSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePackageNameSelect(suggestion)}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Items List */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  선택된 제품
                </h3>
                {selectedItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    패키지에 포함할 제품을 선택해주세요.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(() => {
                      // Group selected items by product
                      const groupedItems = selectedItems.reduce(
                        (acc, item) => {
                          if (!acc[item.productId]) {
                            acc[item.productId] = {
                              productId: item.productId,
                              productName: item.productName,
                              brand: item.brand,
                              unit: item.unit,
                              batches: [],
                              totalQuantity: 0,
                            };
                          }
                          acc[item.productId].batches.push(item);
                          acc[item.productId].totalQuantity += item.quantity;
                          return acc;
                        },
                        {} as Record<
                          string,
                          {
                            productId: string;
                            productName: string;
                            brand: string;
                            unit: string;
                            batches: SelectedItem[];
                            totalQuantity: number;
                          }
                        >
                      );

                      return Object.values(groupedItems).map((group) => (
                        <div
                          key={group.productId}
                          className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex-1">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {group.productName}
                              </span>
                              <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                                총 {group.totalQuantity}
                                {group.unit}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                // Remove all batches for this product
                                setSelectedItems((prev) =>
                                  prev.filter(
                                    (item) => item.productId !== group.productId
                                  )
                                );
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M20 12H4"
                                />
                              </svg>
                            </button>
                          </div>
                          {group.batches.length > 1 && (
                            <div className="mt-1 pl-2 space-y-1">
                              {group.batches.map((batch) => (
                                <div
                                  key={batch.batchId}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-slate-600 dark:text-slate-400">
                                    배치 {batch.batchNo}: {batch.quantity}
                                    {batch.unit}
                                  </span>
                                  <button
                                    onClick={() => decreaseSelectedItem(batch)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    -
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Register Button */}
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !packageName.trim() ||
                  selectedItems.length === 0
                }
                className="mt-6 w-full rounded-xl border-2 border-[#1b52e3] bg-[#1b52e3] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1642b8] focus:outline-none focus:ring-2 focus:ring-[#1c52e6] disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#1c52e6] dark:bg-[#1c52e6] dark:hover:bg-[#1c52e6]"
              >
                {submitting
                  ? isEditMode
                    ? "수정 중..."
                    : "등록 중..."
                  : isEditMode
                    ? "패키지 수정하기"
                    : "패키지 등록하기"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-black bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {/* Close Button */}
            <button
              onClick={() => {
                setShowSuccessModal(false);
                // Form'ni tozalash va outbound page'ga o'tish
                setPackageName("");
                setSelectedItems([]);
                router.push("/outbound?type=package");
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Modal Content */}
            <div className="px-6 py-6">
              <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                패키지가 성공적으로 등록되었습니다.
              </h2>
              <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                새 패키지를 계속 등록하시겠습니까?
              </p>

              {/* Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    // Form'ni tozalash va outbound page'ga o'tish
                    setPackageName("");
                    setSelectedItems([]);
                    router.push("/outbound?type=package");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  완료
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    // Form'ni tozalash va page'da qolish
                    setPackageName("");
                    setSelectedItems([]);
                  }}
                  className="rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 px-6 py-2.5 text-sm font-medium text-white transition hover:from-blue-600 hover:to-teal-600"
                >
                  계속 등록하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
