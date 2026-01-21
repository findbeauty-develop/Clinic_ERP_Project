"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDelete, getTenantId } from "../../../lib/api";

type SupplierManager = {
  managerId?: string;
  id?: string;
  name: string;
  position?: string | null;
  phoneNumber?: string | null;
  email1?: string | null;
  email2?: string | null;
  responsibleProducts?: string[] | null;
  status?: string | null;
};

type Supplier = {
  id: string;
  supplierId: string;
  companyName: string;
  companyAddress?: string | null;
  businessNumber?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  businessType?: string | null;
  businessItem?: string | null;
  productCategories?: string[] | null;
  status?: string | null;
  managers: SupplierManager[];
  clinicManagers?: SupplierManager[]; // Optional - backend may not return this field
  notes?: string | null;
};

export default function SupplierManagementPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, [apiUrl]);

  const fetchSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantId = getTenantId();
      

      // Fetch all approved suppliers
      const data = await apiGet<Supplier[]>(`${apiUrl}/supplier/list`);

      
      setSuppliers(data || []);
    } catch (err: any) {
      console.error("Failed to load suppliers", err);
      setError(
        `공급업체 정보를 불러오지 못했습니다: ${err?.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;

    const query = searchQuery.toLowerCase();
    return suppliers.filter((supplier) => {
      const companyMatch = supplier.companyName?.toLowerCase().includes(query);
      const managerMatch = [
        ...supplier.managers,
        ...(supplier.clinicManagers || []),
      ].some((m) => m.name?.toLowerCase().includes(query));
      return companyMatch || managerMatch;
    });
  }, [suppliers, searchQuery]);

  const handleSaveNotes = async (supplierId: string) => {
    try {
      // TODO: Implement notes save API
      // For now, just update local state
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, notes: notesValue } : s))
      );
      setEditingNotes(null);
      setNotesValue("");
    } catch (err) {
      console.error("Failed to save notes", err);
      alert("비고 저장에 실패했습니다.");
    }
  };

  const handleDeleteContact = async (supplierId: string, contactId: string) => {
    if (!confirm("담당자를 삭제하시겠습니까?")) return;

    try {
      // Faqat ClinicSupplierManager'ni o'chirish mumkin (id field bor bo'lsa)
      // SupplierManager'ni o'chirib bo'lmaydi (managerId bor bo'lsa)
      const supplier = suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        alert("공급업체를 찾을 수 없습니다.");
        return;
      }

      // Contact'ni topish - avval clinicManagers'da, keyin managers'da
      const clinicManager = supplier.clinicManagers?.find(
        (m) => m.id === contactId
      );
      const supplierManager = supplier.managers.find(
        (m) => m.managerId === contactId || m.id === contactId
      );

      // Faqat ClinicSupplierManager'ni o'chirish mumkin
      if (!clinicManager && supplierManager) {
        alert("이 담당자는 삭제할 수 없습니다. (공급업체 플랫폼 담당자)");
        return;
      }

      if (!clinicManager) {
        alert("담당자를 찾을 수 없습니다.");
        return;
      }

      await apiDelete(`${apiUrl}/supplier/manager/${contactId}`);

      // Local state'ni yangilash
      setSuppliers((prev) =>
        prev.map((supplier) =>
          supplier.id === supplierId
            ? {
                ...supplier,
                clinicManagers: (supplier.clinicManagers || []).filter(
                  (m) => m.id !== contactId
                ),
              }
            : supplier
        )
      );

      alert("담당자가 삭제되었습니다");
    } catch (err: any) {
      console.error("Failed to delete contact", err);
      alert(`담당자 삭제에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const getAllContacts = (supplier: Supplier): SupplierManager[] => {
    return [...supplier.managers, ...(supplier.clinicManagers || [])];
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
          <h2 className="mt-6 text-3xl font-bold text-slate-900 dark:text-white">
            공급처 관리
          </h2>
        </div>

        {/* Search and Add Button */}
        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1">
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
            <input
              type="text"
              placeholder="공급처 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowAddSupplier(true)}
            className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            공급업체 추가
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {error}
            <button
              onClick={() => {
                setError(null);
                fetchSuppliers();
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

        {/* Supplier List */}
        {!loading && !error && (
          <div className="space-y-6">
            {filteredSuppliers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400">
                  공급업체가 없습니다.
                </p>
              </div>
            ) : (
              filteredSuppliers.map((supplier) => {
                const contacts = getAllContacts(supplier);
                return (
                  <div
                    key={supplier.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {/* Company Header */}
                    <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {supplier.companyName}
                      </h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                            비고:
                          </span>
                          <select
                            value={supplier.notes || ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                setNotesValue(e.target.value);
                                setEditingNotes(supplier.id);
                              }
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                          >
                            <option value="">비고 없음</option>
                            {supplier.notes && (
                              <option value={supplier.notes}>
                                {supplier.notes}
                              </option>
                            )}
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            setEditingNotes(supplier.id);
                            setNotesValue(supplier.notes || "");
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                        >
                          비고 작성
                        </button>
                      </div>
                    </div>

                    {/* Company Details */}
                    <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          회사 주소:
                        </span>{" "}
                        <span className="text-slate-900 dark:text-slate-100">
                          {supplier.companyAddress || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          회사 번호:
                        </span>{" "}
                        <span className="text-slate-900 dark:text-slate-100">
                          {supplier.companyPhone || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          회사 이메일:
                        </span>{" "}
                        <span className="text-slate-900 dark:text-slate-100">
                          {supplier.companyEmail || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          사업자등록증:
                        </span>{" "}
                        <span className="text-slate-900 dark:text-slate-100">
                          {supplier.businessNumber || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Notes Editor Modal */}
                    {editingNotes === supplier.id && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
                          <h4 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                            비고 작성
                          </h4>
                          <textarea
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            placeholder="비고를 입력하세요..."
                            className="mb-4 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            rows={4}
                          />
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleSaveNotes(supplier.id)}
                              className="flex-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => {
                                setEditingNotes(null);
                                setNotesValue("");
                              }}
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Contacts List */}
                    {contacts.length > 0 && (
                      <div className="space-y-2">
                        {contacts.map((contact, index) => (
                          <div
                            key={contact.managerId || contact.id || index}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50"
                          >
                            <div className="flex items-start justify-between">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1 text-sm">
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    담당자:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.name || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    직함:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.position || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    담당 제품:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.responsibleProducts?.join(", ") ||
                                      "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    핸드폰 번호:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.phoneNumber || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    이메일:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.email1 || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                                    ID:
                                  </span>{" "}
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {contact.managerId || contact.id || "—"}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  handleDeleteContact(
                                    supplier.id,
                                    contact.managerId || contact.id || ""
                                  )
                                }
                                className="ml-4 flex-shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500 dark:bg-slate-700 dark:text-red-400"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
