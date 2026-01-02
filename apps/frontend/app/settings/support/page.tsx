"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function SupportPage() {
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [loading, setLoading] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [formData, setFormData] = useState({
    memberName: "",
    clinicName: "",
    phoneNumber: "",
    inquiry: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Load clinic name for auto-fill
  useEffect(() => {
    const fetchClinicName = async () => {
      try {
        const { apiGet, getTenantId } = await import("../../../lib/api");
        const tenantId = getTenantId();
        if (!tenantId) return;

        const response = await apiGet<{ clinicName: string | null }>(
          `${apiUrl}/support/clinic-name`
        );
        if (response.clinicName) {
          setClinicName(response.clinicName);
          setFormData((prev) => ({
            ...prev,
            clinicName: response.clinicName || "",
          }));
        }
      } catch (err) {
        console.error("Failed to load clinic name", err);
        // Don't show error - clinic name is optional
      }
    };

    fetchClinicName();
  }, [apiUrl]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.memberName.trim()) {
      newErrors.memberName = "이름을 입력해주세요.";
    }

    if (!formData.clinicName.trim()) {
      newErrors.clinicName = "병의원 이름을 입력해주세요.";
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = "연락처를 입력해주세요.";
    } else {
      // Validate phone number format (Korean format: 010-1234-5678 or 01012345678)
      const phoneRegex = /^010-?\d{4}-?\d{4}$/;
      if (!phoneRegex.test(formData.phoneNumber.replace(/-/g, ""))) {
        newErrors.phoneNumber =
          "올바른 전화번호 형식을 입력해주세요. (예: 010-1234-5678)";
      }
    }

    if (!formData.inquiry.trim()) {
      newErrors.inquiry = "문의 내용을 입력해주세요.";
    } else if (formData.inquiry.length > 500) {
      newErrors.inquiry = "문의 내용은 500자 이하여야 합니다.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      const response = await apiPost(`${apiUrl}/support/inquiry`, {
        memberName: formData.memberName,
        clinicName: formData.clinicName,
        phoneNumber: formData.phoneNumber,
        inquiry: formData.inquiry,
      });

      if (response.success) {
        setShowSuccessModal(true);
        // Reset form
        setFormData({
          memberName: "",
          clinicName: clinicName || "",
          phoneNumber: "",
          inquiry: "",
        });
        setErrors({});
      } else {
        alert(response.message || "문의 전송에 실패했습니다.");
      }
    } catch (err: any) {
      console.error("Failed to submit inquiry", err);
      alert(err.message || "문의 전송에 실패했습니다.");
    } finally {
      setLoading(false);
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
          <h2 className="mt-6 text-3xl font-bold text-slate-900 dark:text-white">
            고객센터
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            문의 내용을 남겨주시면 담당자가 확인 후 연락드리겠습니다.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 병의원 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                병의원
              </label>
              <input
                type="text"
                value={formData.clinicName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    clinicName: e.target.value,
                  }))
                }
                placeholder="XXXXXX CLINIC"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 ${
                  errors.clinicName
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-700"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                }`}
              />
              {errors.clinicName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.clinicName}
                </p>
              )}
            </div>

            {/* 이름 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                이름*
              </label>
              <input
                type="text"
                value={formData.memberName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    memberName: e.target.value,
                  }))
                }
                placeholder="이름 입력"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 ${
                  errors.memberName
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-700"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                }`}
              />
              {errors.memberName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.memberName}
                </p>
              )}
            </div>

            {/* 연락처 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                연락처*
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    phoneNumber: e.target.value,
                  }))
                }
                placeholder="000-0000-0000"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 ${
                  errors.phoneNumber
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-700"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                }`}
              />
              {errors.phoneNumber && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.phoneNumber}
                </p>
              )}
            </div>

            {/* 문의 내용 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                문의 내용을 남겨주세요.*
              </label>
              <textarea
                value={formData.inquiry}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, inquiry: e.target.value }))
                }
                placeholder="예: 계정 오류, 정보 수정 요청, 업체 협업 문의 등"
                rows={8}
                maxLength={500}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 ${
                  errors.inquiry
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-700"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                }`}
              />
              <div className="mt-1 flex items-center justify-between">
                {errors.inquiry && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {errors.inquiry}
                  </p>
                )}
                <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {formData.inquiry.length}/500
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {loading ? "전송 중..." : "보내기"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg
                  className="h-8 w-8 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                문의가 전송되었습니다
              </h3>
              <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                담당자가 확인 후 연락드리겠습니다.
              </p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
