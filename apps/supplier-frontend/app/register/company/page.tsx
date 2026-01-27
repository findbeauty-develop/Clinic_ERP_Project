"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Product categories
const PRODUCT_CATEGORIES = [
  { id: "cosmeceutical", label: "코스메슈티컬" },
  { id: "injection", label: "주사 재료" },
  { id: "disposable", label: "일회용품" },
  { id: "health_food", label: "건강기능식품" },
  { id: "cleaning", label: "청소용품" },
  { id: "laser", label: "레이저 소모품" },
  { id: "medical_device", label: "의료기기" },
  { id: "skincare", label: "스킨케어 제품" },
  { id: "equipment", label: "장비 부품" },
  { id: "other", label: "기타" },
];

export default function CompanyInfoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: "",
    businessNumber: "",
    companyPhone: "",
    companyEmail: "",
    companyAddress: "",
    productCategories: [] as string[],
    shareConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [ocrData, setOcrData] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";

  useEffect(() => {
    // OCR natijalarini localStorage'dan olish
    const ocrStr = localStorage.getItem("supplier_registration_ocr");
    if (ocrStr) {
      try {
        const ocr = JSON.parse(ocrStr);
        setOcrData(ocr);

        // OCR natijalarini form'ga to'ldirish
        if (ocr.parsedFields) {
          const fields = ocr.parsedFields;

          // Auto-fill form fields from OCR
          setFormData((prev) => ({
            ...prev,
            // 법인명 -> 회사명
            companyName: fields.companyName || prev.companyName,
            // 등록번호 -> 사업자등록번호
            businessNumber: fields.businessNumber || prev.businessNumber,
            // 사업장 소재지 or 본점소재지 -> 회사 주소
            companyAddress: fields.address || prev.companyAddress,
            // Email OCR'dan kelmasa bo'sh qoldiriladi (user to'ldirishi kerak)
          }));
        }
      } catch (error) {
        console.error("Failed to parse OCR data:", error);
      }
    }
  }, []);

  const handleCategoryToggle = (categoryId: string) => {
    setFormData((prev) => {
      const categories = prev.productCategories.includes(categoryId)
        ? prev.productCategories.filter((id) => id !== categoryId)
        : [...prev.productCategories, categoryId];
      return { ...prev, productCategories: categories };
    });

    // Error'ni tozalash
    if (errors.productCategories) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.productCategories;
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = "회사명을 입력하세요";
    }

    if (!formData.businessNumber.trim()) {
      newErrors.businessNumber = "사업자 등록번호를 입력하세요";
    }

    if (!formData.companyEmail.trim()) {
      newErrors.companyEmail = "회사 이메일 주소를 입력하세요";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.companyEmail)) {
      newErrors.companyEmail = "올바른 이메일 형식이 아닙니다";
    }

    if (!formData.companyPhone.trim()) {
      newErrors.companyPhone = "회사 전화번호를 입력하세요";
    }

    if (formData.productCategories.length === 0) {
      newErrors.productCategories =
        "최소 1개 이상의 제품 카테고리를 선택하세요";
    }

    // ✅ shareConsent is now optional - removed validation

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      // Step 2 data'ni olish
      const step2DataStr = localStorage.getItem("supplier_registration_step2");
      const step2Data = step2DataStr ? JSON.parse(step2DataStr) : {};

      // Backend API'ga yuborish
      const response = await fetch(
        `${apiUrl}/supplier/manager/register-company`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formData,
            step2Data: step2Data,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "회사 정보 저장에 실패했습니다");
      }

      // Company info'ni localStorage'ga saqlash
      localStorage.setItem(
        "supplier_registration_step3",
        JSON.stringify({
          ...formData,
          step2Data: step2Data,
        })
      );

      // Keyingi step'ga o'tish (S 0-4)
      router.push("/register/contact");
    } catch (error: any) {
      setErrors({ submit: error.message || "저장에 실패했습니다" });
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-2xl font-bold text-slate-900">제클릿 공급업체</h1>
        </div>

        {/* Progress Indicator - 4 steps */}
        <div className="mb-6 flex items-center justify-between gap-1 sm:mb-8 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              1
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">
              계정 정보
            </span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white sm:h-10 sm:w-10 sm:text-sm">
              2
            </div>
            <span className="hidden text-xs font-medium text-slate-900 sm:inline sm:text-sm">
              회사 정보
            </span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              3
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">
              담당자 정보
            </span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              4
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">
              담당자 ID
            </span>
          </div>
        </div>

        {/* Main Form Card */}
        <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
          {/* Error Message */}
          {errors.submit && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {errors.submit}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                회사명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => {
                  setFormData({ ...formData, companyName: e.target.value });
                  if (errors.companyName) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.companyName;
                      return newErrors;
                    });
                  }
                }}
                placeholder="회사명을 입력하세요"
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.companyName
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.companyName && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.companyName}
                </p>
              )}
            </div>

            {/* Business Registration Number */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                사업자 등록번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.businessNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d-]/g, "");
                  setFormData({ ...formData, businessNumber: value });
                  if (errors.businessNumber) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.businessNumber;
                      return newErrors;
                    });
                  }
                }}
                placeholder="XXX-XX-XXXXX"
                maxLength={13}
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.businessNumber
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.businessNumber && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.businessNumber}
                </p>
              )}
            </div>

            {/* Company Phone */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                회사 전화번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.companyPhone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  setFormData({ ...formData, companyPhone: value });
                  if (errors.companyPhone) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.companyPhone;
                      return newErrors;
                    });
                  }
                }}
                placeholder="02-1234-5678"
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.companyPhone
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.companyPhone && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.companyPhone}
                </p>
              )}
            </div>

            {/* Company Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                회사 이메일 주소 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.companyEmail}
                onChange={(e) => {
                  setFormData({ ...formData, companyEmail: e.target.value });
                  if (errors.companyEmail) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.companyEmail;
                      return newErrors;
                    });
                  }
                }}
                placeholder="company@example.com"
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.companyEmail
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.companyEmail && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.companyEmail}
                </p>
              )}
            </div>

            {/* Company Address */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                회사 주소
              </label>
              <textarea
                value={formData.companyAddress}
                onChange={(e) => {
                  setFormData({ ...formData, companyAddress: e.target.value });
                }}
                placeholder="서울시 강남구..."
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-300 py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-0 sm:text-base"
              />
            </div>

            {/* Product Categories */}
            <div>
              <label className="mb-3 block text-sm font-medium text-slate-700">
                취급 제품 카테고리 <span className="text-red-500">*</span>{" "}
                <span className="text-xs font-normal text-slate-500">
                  (중복 선택 가능)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PRODUCT_CATEGORIES.map((category) => (
                  <label
                    key={category.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.productCategories.includes(category.id)}
                      onChange={() => handleCategoryToggle(category.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">
                      {category.label}
                    </span>
                  </label>
                ))}
              </div>
              {errors.productCategories && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.productCategories}
                </p>
              )}
            </div>

            {/* Company Info Sharing Consent */}
            {/* Company Info Sharing Consent */}
            <div
              className={`rounded-lg border-2 p-4 ${
                errors.shareConsent
                  ? "border-red-300 bg-red-50"
                  : formData.shareConsent
                  ? "border-green-300 bg-green-50"
                  : "border-blue-100 bg-blue-50"
              }`}
            >
              <div className="mb-3 flex items-start gap-3">
                <svg
                  className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                    errors.shareConsent
                      ? "text-red-600"
                      : formData.shareConsent
                      ? "text-green-600"
                      : "text-blue-600"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="mb-2 text-sm font-medium text-slate-900">
                    회사 정보 공유 동의
                  </p>
                  <p className="mb-3 text-xs text-slate-600">
                    병원 모드의 재고 관리 및 주문 시스템과 회사 정보를 공유하여
                    병원에서 쉽게 우리 회사를 공급업체로 선택할 수 있도록
                    합니다.
                  </p>
                  <ul className="mb-3 space-y-1 text-xs text-slate-600">
                    <li>• 회사명</li>
                    <li>• 대표 전화번호</li>
                    <li>• 이메일 주소</li>
                    <li>• 취급 제품 카테고리</li>
                  </ul>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={formData.shareConsent}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          shareConsent: e.target.checked,
                        });
                        if (errors.shareConsent) {
                          setErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors.shareConsent;
                            return newErrors;
                          });
                        }
                      }}
                      className={`mt-0.5 h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-blue-500 ${
                        errors.shareConsent
                          ? "border-red-500 text-red-600"
                          : "text-blue-600"
                      }`}
                    />
                    <span
                      className={`text-xs ${
                        errors.shareConsent
                          ? "text-red-700 font-medium"
                          : "text-slate-700"
                      }`}
                    >
                      위 회사 정보를 클리닉 사용자에게 공유하는 것에 동의합니다
                    </span>
                  </label>
                  {errors.shareConsent && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 font-medium">
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {errors.shareConsent}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg px-4 py-3.5 text-base font-semibold text-white shadow-lg transition-all active:scale-[0.98] ${
                loading
                  ? "cursor-not-allowed bg-gradient-to-r from-purple-600 to-pink-600 opacity-50"
                  : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-5 w-5 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  처리 중...
                </span>
              ) : (
                "다음"
              )}
            </button>
          </form>

          {/* Login Link */}
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
    </div>
  );
}
