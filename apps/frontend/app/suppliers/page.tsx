"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SupplierFormModal from "../../components/supplier-form-modal";
import { getAccessToken } from "../../lib/api";

interface Supplier {
  id: string;
  company_name: string;
  name: string;
  phone_number: string;
  email1?: string;
  position?: string;
  business_number?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  memo?: string;
  responsible_products?: string[];
  responsible_regions?: string[];
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();

      if (!token) {
        throw new Error("Authentication token not found");
      }

      // Use clinic-managers endpoint to get ClinicSupplierManager records
      const response = await fetch(`${apiUrl}/supplier/clinic-managers`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch suppliers");
      }

      const data = await response.json();
      setSuppliers(data || []);
    } catch (err: any) {
      console.error("Error fetching suppliers:", err);
      setError(err.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setShowModal(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowModal(true);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (
      !confirm(
        "이 협력업체를 삭제하시겠습니까?\n연결된 제품 정보는 유지되지만, 협력업체 정보는 삭제됩니다."
      )
    ) {
      return;
    }

    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();

      const response = await fetch(`${apiUrl}/supplier/manager/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include", // ✅ Cookie'ni yuborish
      });

      if (!response.ok) {
        throw new Error("Failed to delete supplier");
      }

      alert("협력업체가 삭제되었습니다");
      fetchSuppliers();
    } catch (err: any) {
      console.error("Error deleting supplier:", err);
      alert(err.message || "Failed to delete supplier");
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingSupplier(null);
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingSupplier(null);
    fetchSuppliers();
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = searchQuery.toLowerCase();
    return (
      supplier.company_name?.toLowerCase().includes(query) ||
      supplier.name?.toLowerCase().includes(query) ||
      supplier.phone_number?.includes(query) ||
      supplier.business_number?.includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              협력업체 관리
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              협력업체 정보를 관리하고 제품과 연결하세요
            </p>
          </div>
          <button
            onClick={handleAddSupplier}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            업체 추가
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="회사명, 담당자, 전화번호, 사업자번호로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pl-10 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Suppliers Table */}
            <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      회사명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      담당자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      연락처
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      이메일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      담당 제품
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      사업자번호
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        {searchQuery
                          ? "검색 결과가 없습니다"
                          : "등록된 협력업체가 없습니다"}
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <tr
                        key={supplier.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {supplier.company_name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900 dark:text-white">
                          <div>{supplier.name}</div>
                          {supplier.position && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {supplier.position}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900 dark:text-white">
                          {supplier.phone_number}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900 dark:text-white">
                          {supplier.email1 || "-"}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {supplier.responsible_products &&
                          supplier.responsible_products.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {supplier.responsible_products
                                .slice(0, 3)
                                .map((product: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                  >
                                    {product}
                                  </span>
                                ))}
                              {supplier.responsible_products.length > 3 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  +{supplier.responsible_products.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900 dark:text-white">
                          {supplier.business_number || "-"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditSupplier(supplier)}
                            className="mr-3 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteSupplier(supplier.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              총 {filteredSuppliers.length}개의 협력업체
              {searchQuery && ` (검색: "${searchQuery}")`}
            </div>
          </>
        )}
      </div>

      {/* Supplier Form Modal */}
      {showModal && (
        <SupplierFormModal
          isOpen={showModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          supplier={editingSupplier}
        />
      )}
    </div>
  );
}

