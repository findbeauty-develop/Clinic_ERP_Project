"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface RegistrationData {
  step2Data?: {
    name?: string;
    phoneNumber?: string;
    position?: string;
    certificateUrl?: string;
  };
  step3Data?: {
    companyName?: string;
    businessNumber?: string;
    companyPhone?: string;
    companyEmail?: string;
    companyAddress?: string;
    productCategories?: string[];
  };
  step4Data?: {
    password?: string;
    email1?: string;
    managerAddress?: string;
    responsibleProducts?: string[];
  };
}

export default function CompletePage() {
  const router = useRouter();
  const [registrationData, setRegistrationData] = useState<RegistrationData>({});
  const [managerId, setManagerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

  useEffect(() => {
    // Load all registration data from localStorage
    const step2DataStr = localStorage.getItem("supplier_registration_step2");
    const step3DataStr = localStorage.getItem("supplier_registration_step3");
    const step4DataStr = localStorage.getItem("supplier_registration_step4");

    if (!step2DataStr || !step3DataStr || !step4DataStr) {
      // If any step data is missing, redirect back
      router.push("/register/contact");
      return;
    }

    const step2Data = step2DataStr ? JSON.parse(step2DataStr) : null;
    const step3Data = step3DataStr ? JSON.parse(step3DataStr) : null;
    const step4Data = step4DataStr ? JSON.parse(step4DataStr) : null;

    setRegistrationData({
      step2Data,
      step3Data,
      step4Data,
    });

    // Generate Manager ID: 회사이름+4자리 랜덤 숫자
    const companyName = step3Data?.companyName || "";
    const formattedCompanyName = companyName.replace(/\s+/g, ""); // Remove spaces
    // Generate random 4-digit number (1000-9999)
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    const managerIdValue = `${formattedCompanyName}${randomNumber}`;
    setManagerId(managerIdValue);
  }, [router]);

  const copyManagerId = async () => {
    try {
      await navigator.clipboard.writeText(managerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleConfirmAndSave = async () => {
    setLoading(true);
    try {
      // Combine all data and send to backend
      const finalData = {
        manager: {
          name: registrationData.step2Data?.name,
          phoneNumber: registrationData.step2Data?.phoneNumber,
          position: registrationData.step2Data?.position,
          certificateImageUrl: registrationData.step2Data?.certificateUrl,
        },
        company: {
          companyName: registrationData.step3Data?.companyName,
          businessNumber: registrationData.step3Data?.businessNumber,
          companyPhone: registrationData.step3Data?.companyPhone,
          companyEmail: registrationData.step3Data?.companyEmail,
          companyAddress: registrationData.step3Data?.companyAddress,
          productCategories: registrationData.step3Data?.productCategories,
        },
        contact: {
          password: registrationData.step4Data?.password,
          email1: registrationData.step4Data?.email1,
          managerAddress: registrationData.step4Data?.managerAddress,
          responsibleProducts: registrationData.step4Data?.responsibleProducts,
        },
        managerId: managerId,
      };

      // Send to backend final registration endpoint
      const response = await fetch(`${apiUrl}/supplier/manager/register-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "저장에 실패했습니다");
      }

      // Clear localStorage
      localStorage.removeItem("supplier_registration_step2");
      localStorage.removeItem("supplier_registration_step3");
      localStorage.removeItem("supplier_registration_step4");

      // Show success message
      alert("회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.");

      // Redirect to login page
      router.push("/login?registered=true");
    } catch (error: any) {
      alert(error.message || "저장에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return "";
    // Format: 010-1234-5678
    if (phone.length === 11) {
      return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
    }
    return phone;
  };

  const formatBusinessNumber = (number: string) => {
    if (!number) return "";
    // Format: 123-45-67890
    if (number.length >= 10) {
      return `${number.slice(0, 3)}-${number.slice(3, 5)}-${number.slice(5)}`;
    }
    return number;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">뷰티재고</h1>
        </div>

        {/* Progress Indicator - 4 steps */}
        <div className="mb-6 flex items-center justify-between gap-1 sm:mb-8 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              1
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">계정 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              2
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">회사 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              3
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">담당자 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white sm:h-10 sm:w-10 sm:text-sm">
              4
            </div>
            <span className="hidden text-xs font-medium text-slate-900 sm:inline sm:text-sm">담당자 ID</span>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
          {/* Title */}
          <h2 className="mb-6 text-2xl font-bold text-slate-900">계정 정보확인</h2>

          {/* Personal Information */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">이름</span>
              <span className="text-sm text-slate-900 text-right">
                {registrationData.step2Data?.name || "-"}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">핸드폰 번호</span>
              <span className="text-sm text-slate-900 text-right">
                {formatPhoneNumber(registrationData.step2Data?.phoneNumber || "")}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">이메일</span>
              <span className="text-sm text-slate-900 text-right">
                {registrationData.step4Data?.email1 || "-"}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">담당자 주소</span>
              <span className="text-sm text-slate-900 text-right max-w-[60%]">
                {registrationData.step4Data?.managerAddress || "-"}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">담당 제품</span>
              <span className="text-sm text-slate-900 text-right max-w-[60%]">
                {registrationData.step4Data?.responsibleProducts?.join(", ") || "-"}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-slate-200"></div>

          {/* Company Information */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">회사명</span>
              <span className="text-sm text-slate-900 text-right">
                {registrationData.step3Data?.companyName || "-"}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">사업자 등록번호</span>
              <span className="text-sm text-slate-900 text-right">
                {formatBusinessNumber(registrationData.step3Data?.businessNumber || "")}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">회사 주소</span>
              <span className="text-sm text-slate-900 text-right max-w-[60%]">
                {registrationData.step3Data?.companyAddress || "-"}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-700">회사 전화번호</span>
              <span className="text-sm text-slate-900 text-right">
                {registrationData.step3Data?.companyPhone || "-"}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-slate-200"></div>

          {/* Manager ID Section */}
          <div className="mb-6 rounded-lg bg-orange-500 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">담당자 ID</h3>
              <button
                type="button"
                onClick={copyManagerId}
                className="flex items-center gap-1 rounded bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30 transition-colors"
              >
                {copied ? (
                  <>
                    <svg
                      className="h-4 w-4"
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
                    복사됨
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    복사
                  </>
                )}
              </button>
            </div>
            <p className="mb-3 text-xs text-white/90">
              * 병원 쪽에 담당자 ID 입력해야 주문서가 들어옵니다.
            </p>
            <div className="rounded bg-white p-3">
              <p className="text-2xl font-bold text-slate-900">{managerId}</p>
            </div>
          </div>

          {/* Confirm and Save Button */}
          <button
            type="button"
            onClick={handleConfirmAndSave}
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:from-purple-700 hover:to-pink-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                저장 중...
              </span>
            ) : (
              "확인 후 저장"
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/login"
              className="font-semibold text-purple-600 hover:text-purple-700"
            >
              로그인하기
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

