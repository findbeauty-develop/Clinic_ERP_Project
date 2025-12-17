"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPut } from "../../../lib/api";

type Clinic = {
  tenant_id: string;
  status: string;
  requested_at: string;
  approved_at: string | null;
  memo: string | null;
  clinic: {
    id: string;
    name: string;
    english_name: string;
    category: string;
    location: string;
    phone_number: string | null;
    medical_subjects: string;
    doctor_name: string | null;
    license_type: string;
    license_number: string;
    document_issue_number: string;
  };
};

export default function ClinicsManagementPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [filteredClinics, setFilteredClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedClinics, setExpandedClinics] = useState<Set<string>>(new Set());
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [savingMemo, setSavingMemo] = useState<string | null>(null);

  useEffect(() => {
    fetchClinics();
  }, []);

  useEffect(() => {
    // Filter clinics by name
    if (!searchQuery.trim()) {
      setFilteredClinics(clinics);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredClinics(
        clinics.filter((item) =>
          item.clinic.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, clinics]);

  const fetchClinics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Clinic[]>("/supplier/manager/clinics");
      // Sort by clinic name alphabetically
      const sorted = data.sort((a, b) =>
        a.clinic.name.localeCompare(b.clinic.name, "ko")
      );
      setClinics(sorted);
      setFilteredClinics(sorted);
      // Don't initialize memos from server - always start with empty
      // User can type new memo which will replace the old one
      // Only update memos that are not currently being edited
      setMemos((prev) => {
        const newMemos = { ...prev };
        // Keep existing memo values that user is typing
        // Don't overwrite with server data
        return newMemos;
      });
    } catch (err: any) {
      console.error("Failed to fetch clinics", err);
      setError(err?.message || "Failed to fetch clinics");
    } finally {
      setLoading(false);
    }
  };

  const toggleClinic = (tenantId: string) => {
    const newExpanded = new Set(expandedClinics);
    if (newExpanded.has(tenantId)) {
      newExpanded.delete(tenantId);
    } else {
      newExpanded.add(tenantId);
    }
    setExpandedClinics(newExpanded);
  };

  const handleMemoChange = (tenantId: string, value: string) => {
    setMemos((prev) => ({
      ...prev,
      [tenantId]: value,
    }));
  };

  const handleSaveMemo = async (tenantId: string) => {
    setSavingMemo(tenantId);
    try {
      await apiPut(`/supplier/manager/clinic/${tenantId}/memo`, {
        memo: memos[tenantId] || "",
      });
      // Clear memo field after successful save
      setMemos((prev) => ({
        ...prev,
        [tenantId]: "",
      }));
      // Refresh clinics to get updated memo from server
      await fetchClinics();
      alert("메모가 저장되었습니다.");
    } catch (err: any) {
      console.error("Failed to save memo", err);
      alert(`메모 저장에 실패했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setSavingMemo(null);
    }
  };


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">거래처 데이터 관리</h1>
          <button
            onClick={() => router.back()}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
          >
            뒤로
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          사용 환경 설정 및 문제 해결 지원
        </p>
      </div>

      {/* Search */}
      <div className="bg-white px-4 py-4 shadow-sm">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="병의원명으로 검색..."
            className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 pl-10 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
      </div>

      {/* Clinic List */}
      <div className="space-y-3 p-4">
        {filteredClinics.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-slate-500">
            {searchQuery ? "검색 결과가 없습니다." : "거래처가 없습니다."}
          </div>
        ) : (
          filteredClinics.map((item) => {
            const isExpanded = expandedClinics.has(item.tenant_id);
            const clinicMemo = memos[item.tenant_id] || "";

            return (
              <div
                key={item.tenant_id}
                className="rounded-lg bg-white shadow-sm"
              >
                {/* Clinic Header */}
                <button
                  onClick={() => toggleClinic(item.tenant_id)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="font-semibold text-slate-900">
                    {item.clinic.name}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>

                {/* Clinic Details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-4">
                    {/* Clinic Info Fields */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">병의원명</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.name}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">종류</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.category}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">소재지</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.location}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">진료과목</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.medical_subjects}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">성명</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.doctor_name || "—"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">면허종류</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.license_type}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">면허번호</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.license_number}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 flex-shrink-0">문서발급번호</span>
                        <span className="font-medium text-slate-900 text-right break-words">
                          {item.clinic.document_issue_number}
                        </span>
                      </div>
                    </div>

                    {/* Memo Section */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {item.memo ? (
                            <span className="text-slate-600 font-medium">
                              메모: <span className="text-slate-900">{item.memo}</span>
                            </span>
                          ) : (
                            <span className="text-slate-600 font-medium">메모</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleSaveMemo(item.tenant_id)}
                          disabled={savingMemo === item.tenant_id || !clinicMemo.trim()}
                          className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                          {savingMemo === item.tenant_id ? "저장 중..." : "메모 저장"}
                        </button>
                      </div>
                      <textarea
                        value={clinicMemo}
                        onChange={(e) =>
                          handleMemoChange(item.tenant_id, e.target.value)
                        }
                        placeholder="메모를 입력하세요 (선택사항)"
                        rows={4}
                        className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      {item.memo && clinicMemo !== item.memo && clinicMemo.trim() && (
                        <p className="mt-2 text-xs text-slate-500">
                          저장된 메모: {item.memo}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

