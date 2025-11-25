"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "success">("form");
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
  });
  const [certificateImage, setCertificateImage] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [certificateUrl, setCertificateUrl] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

  // Phone number validation
  const validatePhoneNumber = (phone: string): boolean => {
    return /^010\d{8}$/.test(phone);
  };

  // Check phone duplicate
  const checkPhoneDuplicate = async (phoneNumber: string) => {
    if (!validatePhoneNumber(phoneNumber)) {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: "올바른 휴대폰 번호 형식이 아닙니다 (010XXXXXXXX)",
      }));
      return false;
    }

    setPhoneCheckLoading(true);
    try {
      const response = await fetch(`${apiUrl}/supplier/manager/check-phone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (data.isDuplicate) {
        setErrors((prev) => ({
          ...prev,
          phoneNumber: "이미 등록된 휴대폰 번호입니다",
        }));
        return false;
      }

      setErrors((prev => {
        const newErrors = { ...prev };
        delete newErrors.phoneNumber;
        return newErrors;
      }));
      return true;
    } catch (error) {
      console.error("Phone check error:", error);
      return true; // Continue on error
    } finally {
      setPhoneCheckLoading(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    // File validation
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        certificate: "지원하지 않는 파일 형식입니다. (JPG, PNG, WEBP만 가능)",
      }));
      return;
    }

    if (file.size > maxSize) {
      setErrors((prev) => ({
        ...prev,
        certificate: "파일 크기는 10MB 이하여야 합니다",
      }));
      return;
    }

    setCertificateImage(file);
    setErrors((prev => {
      const newErrors = { ...prev };
      delete newErrors.certificate;
      return newErrors;
    }));

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setCertificatePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiUrl}/supplier/manager/upload-certificate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("파일 업로드에 실패했습니다");
      }

      const data = await response.json();
      setCertificateUrl(data.fileUrl);
      
      // OCR natijalarini saqlash
      if (data.ocrResult) {
        setOcrResult(data.ocrResult);
        
        // Auto-fill form fields if OCR extracted data
        if (data.ocrResult.parsedFields) {
          const fields = data.ocrResult.parsedFields;
          // OCR data will be used in the next step (company info page)
        }
      }
    } catch (error: any) {
      setErrors((prev) => ({
        ...prev,
        certificate: error.message || "파일 업로드에 실패했습니다",
      }));
      setCertificateImage(null);
      setCertificatePreview("");
    } finally {
      setUploading(false);
    }
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};

 

    if (!formData.name.trim()) {
      newErrors.name = "이름을 입력하세요";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "이름은 최소 2자 이상이어야 합니다";
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = "휴대폰 번호를 입력하세요";
    } else if (!validatePhoneNumber(formData.phoneNumber)) {
      newErrors.phoneNumber = "올바른 휴대폰 번호 형식이 아닙니다 (010XXXXXXXX)";
    }

    if (!certificateUrl) {
      newErrors.certificate = "사업자등록증 이미지를 업로드하세요";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Check phone duplicate
    const isPhoneValid = await checkPhoneDuplicate(formData.phoneNumber);
    if (!isPhoneValid) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/supplier/manager/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          phoneNumber: formData.phoneNumber,
          certificateImageUrl: certificateUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "가입 신청에 실패했습니다");
      }

      // OCR natijalarini va step 2 data'ni localStorage'ga saqlash
      if (ocrResult) {
        localStorage.setItem('supplier_registration_ocr', JSON.stringify(ocrResult));
      }
      localStorage.setItem('supplier_registration_step2', JSON.stringify({
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        certificateUrl: certificateUrl,
      }));

      // S 0-3 company info page'ga o'tish
      router.push('/register/company');
    } catch (error: any) {
      setErrors({ submit: error.message || "가입 신청에 실패했습니다" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
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
              <h2 className="mb-2 text-2xl font-bold text-slate-900">
                가입 신청 완료
              </h2>
              <p className="mb-6 text-sm text-slate-600">
                담당자 가입 신청이 완료되었습니다.
                <br />
                회사 승인을 기다려주세요.
              </p>
              <Link
                href="/login"
                className="inline-block w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700"
              >
                로그인으로 이동
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 sm:h-12 sm:w-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
            Supplier ERP
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">
          {/* Registration Card */}
          <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-purple-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
                {/* Profile picture overlay */}
                <div className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-slate-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                공급업체 회원가입
              </h2>
              <p className="text-sm text-slate-600 sm:text-base">
                뷰티겠고 공급업체 모드
              </p>
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {errors.submit}
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  이름
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="이름을 입력하세요"
                  className={`w-full rounded-lg border py-3 px-4 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                    errors.name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                  }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label
                  htmlFor="phoneNumber"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  핸드폰번호/ID
                </label>
                <div className="relative">
                  <input
                    id="phoneNumber"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "");
                      setFormData({ ...formData, phoneNumber: value });
                      if (errors.phoneNumber) {
                        setErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors.phoneNumber;
                          return newErrors;
                        });
                      }
                    }}
                    onBlur={() => {
                      if (formData.phoneNumber) {
                        checkPhoneDuplicate(formData.phoneNumber);
                      }
                    }}
                    placeholder="01012345678"
                    maxLength={11}
                    className={`w-full rounded-lg border py-3 px-4 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                      errors.phoneNumber
                        ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                        : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                    }`}
                  />
                  {phoneCheckLoading && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <svg
                        className="h-5 w-5 animate-spin text-blue-600"
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
                    </div>
                  )}
                </div>
                {errors.phoneNumber && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.phoneNumber}
                  </p>
                )}
              </div>

              {/* Certificate Upload */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  사업자등록증 이미지
                </label>
                <div className="space-y-3">
                  {certificatePreview ? (
                    <div className="relative">
                      <img
                        src={certificatePreview}
                        alt="Certificate preview"
                        className="h-48 w-full rounded-lg border border-slate-300 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCertificateImage(null);
                          setCertificatePreview("");
                          setCertificateUrl("");
                          setOcrResult(null);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600"
                      >
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      {uploading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                          <div className="flex flex-col items-center gap-2 text-white">
                            <svg
                              className="h-6 w-6 animate-spin"
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
                            <span className="text-sm">OCR 처리 중...</span>
                          </div>
                        </div>
                      )}
                      {/* OCR Results */}
                      {ocrResult && !uploading && ocrResult.parsedFields && (
                        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <svg
                              className="h-4 w-4 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-xs font-semibold text-green-800">
                              OCR 처리 완료
                            </span>
                          </div>
                          {ocrResult.parsedFields.companyName && (
                            <div className="text-xs text-green-700">
                              회사명: {ocrResult.parsedFields.companyName}
                            </div>
                          )}
                          {ocrResult.parsedFields.businessNumber && (
                            <div className="text-xs text-green-700">
                              사업자등록번호: {ocrResult.parsedFields.businessNumber}
                            </div>
                          )}
                          {ocrResult.parsedFields.representativeName && (
                            <div className="text-xs text-green-700">
                              대표자명: {ocrResult.parsedFields.representativeName}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <label
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 px-4 transition-colors ${
                        errors.certificate
                          ? "border-red-300 bg-red-50"
                          : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleImageUpload(file);
                          }
                        }}
                        className="hidden"
                      />
                      <svg
                        className="mb-2 h-10 w-10 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <span className="text-sm font-medium text-slate-600">
                        이미지를 선택하거나 드래그하세요
                      </span>
                      <span className="mt-1 text-xs text-slate-500">
                        JPG, PNG, WEBP (최대 10MB)
                      </span>
                    </label>
                  )}
                </div>
                {errors.certificate && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.certificate}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:from-purple-700 hover:to-pink-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
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
                  "가입 신청"
                )}
              </button>
            </form>

            {/* Login Link */}
            <div className="mt-6 space-y-3 text-center">
              <p className="text-sm text-slate-600">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-blue-600 hover:text-blue-700"
                >
                  로그인
                </Link>
              </p>
             
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

