"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPut,
  getTenantIdAfterAuth,
} from "../../../lib/api";

type ClinicSettings = {
  allowCompanySearch: boolean;
  allowInfoDisclosure: boolean;
};

export default function NotificationSettingsPage() {
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
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
  const [tauriDesktop, setTauriDesktop] = useState(false);
  const [tauriTestMsg, setTauriTestMsg] = useState<string | null>(null);
  const [browserNotifySupported, setBrowserNotifySupported] = useState(false);
  const [browserTestMsg, setBrowserTestMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [apiUrl]);

  useEffect(() => {
    setBrowserNotifySupported(
      typeof window !== "undefined" && "Notification" in window
    );
    let cancelled = false;
    void import("../../../lib/tauri-desktop-notification").then(
      ({ detectTauriDesktop }) => {
        void detectTauriDesktop().then((v) => {
          if (!cancelled) setTauriDesktop(v);
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantId = await getTenantIdAfterAuth();
      const q = tenantId
        ? `?tenantId=${encodeURIComponent(tenantId)}&tenant_id=${encodeURIComponent(tenantId)}`
        : "";
      const clinicsPath = `${apiUrl}/iam/members/clinics${q}`;

      // Fetch clinic settings - returns array, get first one
      const clinics = await apiGet<any[]>(clinicsPath);
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
      await getTenantIdAfterAuth();

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
            {browserNotifySupported && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/40">
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                  웹 브라우저 알림 테스트
                </h3>
                <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                  이 페이지는 Chrome 등 브라우저에서 열려 있습니다. OS 알림(브라우저
                  알림)이 뜨는지 확인합니다. 데스크톱 앱 전용 테스트는 아래
                  &quot;데스크톱 앱&quot; 블록을 사용하세요.
                </p>
                {browserTestMsg && (
                  <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
                    {browserTestMsg}
                  </p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setBrowserTestMsg(null);
                    if (typeof window === "undefined" || !("Notification" in window)) {
                      return;
                    }
                    if (Notification.permission === "default") {
                      const p = await Notification.requestPermission();
                      if (p !== "granted") {
                        setBrowserTestMsg(
                          "알림 권한이 거부되었습니다. 브라우저 주소창 옆 자물쇠 아이콘에서 알림을 허용해 주세요."
                        );
                        return;
                      }
                    }
                    if (Notification.permission === "granted") {
                      try {
                        new Notification("Jaclit ERP", {
                          body: "브라우저 알림 테스트입니다.",
                          icon: "/favicon.ico",
                        });
                        setBrowserTestMsg(
                          "알림을 보냈습니다. 화면 구석 또는 알림 센터를 확인하세요."
                        );
                      } catch (e) {
                        setBrowserTestMsg(
                          e instanceof Error
                            ? `실패: ${e.message}`
                            : "알림을 표시할 수 없습니다."
                        );
                      }
                    } else {
                      setBrowserTestMsg(
                        "이 브라우저에서 알림이 차단되어 있습니다. 설정에서 허용해 주세요."
                      );
                    }
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  브라우저 테스트 알림 보내기
                </button>
              </div>
            )}

            {tauriDesktop && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/40">
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                  데스크톱 앱 알림 테스트
                </h3>
                <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                  Jaclit ERP 데스크톱(Tauri) 앱으로 이 사이트를 열었을 때만
                  표시됩니다. OS 네이티브 알림이 표시되는지 확인합니다.
                </p>
                {tauriTestMsg && (
                  <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
                    {tauriTestMsg}
                  </p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setTauriTestMsg(null);
                    const { sendTauriTestNotificationFromWeb } = await import(
                      "../../../lib/tauri-desktop-notification"
                    );
                    const r = await sendTauriTestNotificationFromWeb();
                    if (r.ok) {
                      setTauriTestMsg("알림을 보냈습니다. 시스템 알림을 확인하세요.");
                    } else if (r.reason === "denied") {
                      setTauriTestMsg("알림 권한이 거부되었습니다. OS 설정에서 허용해 주세요.");
                    } else {
                      setTauriTestMsg(
                        r.reason
                          ? `실패: ${r.reason}`
                          : "알림을 보낼 수 없습니다."
                      );
                    }
                  }}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                >
                  테스트 알림 보내기
                </button>
              </div>
            )}

            {!tauriDesktop && (
              <p className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  데스크톱 앱:
                </span>{" "}
                Tauri 데스크톱 앱으로 로드하면 위에 &quot;데스크톱 앱 알림
                테스트&quot; 블록이 나타나 네이티브 알림을 시험할 수 있습니다.
              </p>
            )}

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
