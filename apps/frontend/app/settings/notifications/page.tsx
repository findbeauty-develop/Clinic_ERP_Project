"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut, getTenantId } from "../../../lib/api";

type ClinicSettings = {
  allowCompanySearch: boolean;
  allowInfoDisclosure: boolean;
};

export default function NotificationSettingsPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );
  const [settings, setSettings] = useState<ClinicSettings>({
    allowCompanySearch: false,
    allowInfoDisclosure: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [apiUrl]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantId = getTenantId();

      // Fetch clinic settings - returns array, get first one
      const clinics = await apiGet<any[]>(`${apiUrl}/iam/members/clinics`);
      const clinic =
        Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : clinics;

      // Handle both boolean and string "true"/"false" values
      const allowCompanySearch =
        clinic?.allow_company_search === true ||
        clinic?.allow_company_search === "true";
      const allowInfoDisclosure =
        clinic?.allow_info_disclosure === true ||
        clinic?.allow_info_disclosure === "true";

      setSettings({
        allowCompanySearch,
        allowInfoDisclosure,
      });
    } catch (err: any) {
      console.error("Failed to load settings", err);
      setError(
        `설정 정보를 불러오지 못했습니다: ${err?.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (field: keyof ClinicSettings) => {
    const newValue = !settings[field];
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const tenantId = getTenantId();

      // Update clinic settings - send both fields to preserve the other one
      const updatePayload: any = {};
      if (field === "allowCompanySearch") {
        updatePayload.allow_company_search = newValue;
        updatePayload.allow_info_disclosure = settings.allowInfoDisclosure;
      } else {
        updatePayload.allow_company_search = settings.allowCompanySearch;
        updatePayload.allow_info_disclosure = newValue;
      }

      await apiPut(`${apiUrl}/iam/members/clinics`, updatePayload);

      setSettings((prev) => ({
        ...prev,
        [field]: newValue,
      }));

      // Refresh settings to ensure we have the latest data from server
      setTimeout(() => {
        fetchSettings();
      }, 6000);
    } catch (err: any) {
      console.error("Failed to update settings", err);
      setError(`설정 저장에 실패했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-8xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            설정 및 서포트
          </h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            사용 환경 설정 및 문제 해결 지원
          </p>
          <h2 className="mt-6 text-3xl font-bold text-slate-900 dark:text-white">
            알람 설정
          </h2>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200">
            {success}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
          </div>
        )}

        {/* Settings Content */}
        {!loading && (
          <div className="space-y-8">
            {/* 개인정보 공개 여부 Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
                개인정보 공개 여부
              </h3>

              {/* 기업 검색 허용 */}
              <div className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
                      기업 검색 허용
                    </h4>
                    <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                      기업 측 검색 결과에 내 병원이 노출되도록 허용합니다.
                    </p>
                    <p className="mb-3 text-sm text-slate-500 dark:text-slate-500">
                      검색 허용을 끄면 기업은 병원 정보를 검색하거나 찾을 수
                      없습니다.
                    </p>
                    <a
                      href="#"
                      className="text-sm text-sky-600 hover:underline dark:text-sky-400"
                      onClick={(e) => {
                        e.preventDefault();
                        alert("자세한 정보는 고객센터로 문의하세요.");
                      }}
                    >
                      자세히 알아보기
                    </a>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <button
                      onClick={() => handleToggle("allowCompanySearch")}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
                        settings.allowCompanySearch
                          ? "bg-sky-500"
                          : "bg-slate-300 dark:bg-slate-600"
                      } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.allowCompanySearch
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* 병의원 정보 공개 */}
              <div className="mb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
                      병의원 정보 공개
                    </h4>
                    <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                      병원 정보를 공개로 설정하면, 인증된 기업 사용자가
                    </p>
                    <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                      병원명, 주소, 담당자 정보, 취급 품목 등을 조회할 수
                      있습니다.
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-500">
                      공개를 활성화하면 더 많은 기업과의 협업 기회를 얻을 수
                      있습니다.
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <button
                      onClick={() => handleToggle("allowInfoDisclosure")}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
                        settings.allowInfoDisclosure
                          ? "bg-sky-500"
                          : "bg-slate-300 dark:bg-slate-600"
                      } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.allowInfoDisclosure
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 주의사항 Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                주의사항
              </h3>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 text-sky-500">•</span>
                  <span>병원 정보는 인증된 기업 사용자에게만 제공됩니다.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-sky-500">•</span>
                  <span>
                    민감 정보(개인 연락처, 내부 문서 등)는 자동으로 비공개
                    처리됩니다.
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-sky-500">•</span>
                  <span>공개 설정은 언제든지 변경할 수 있습니다.</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
