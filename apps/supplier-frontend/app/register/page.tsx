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
    position: "",
  });
  const [certificateImage, setCertificateImage] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [certificateUrl, setCertificateUrl] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isBusinessValid, setIsBusinessValid] = useState<boolean | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";

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

      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.phoneNumber;
        return newErrors;
      });
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
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.certificate;
      return newErrors;
    });

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

      const response = await fetch(
        `${apiUrl}/supplier/manager/upload-certificate`,
        {
          method: "POST",
          body: formData,
        }
      );

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

        // Show verification result modal
        if (
          data.ocrResult.verification !== null &&
          data.ocrResult.verification !== undefined
        ) {
          setVerificationResult(data.ocrResult.verification);
          setIsBusinessValid(data.ocrResult.verification.isValid);
          setShowVerificationModal(true);
        } else if (data.ocrResult.verificationError) {
          // Verification error occurred
          setVerificationResult({
            isValid: false,
            error: data.ocrResult.verificationError,
          });
          setIsBusinessValid(false);
          setShowVerificationModal(true);
        } else {
          // Verification is null - disable registration
          setIsBusinessValid(false);
          setVerificationResult({
            isValid: false,
            error: "사업자등록번호 확인이 완료되지 않았습니다",
          });
          setShowVerificationModal(true);
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
      newErrors.phoneNumber =
        "올바른 휴대폰 번호 형식이 아닙니다 (010XXXXXXXX)";
    }

    if (!certificateUrl) {
      newErrors.certificate = "사업자등록증 이미지를 업로드하세요";
    }

    // Check verification status
    if (isBusinessValid === null || isBusinessValid === false) {
      newErrors.certificate =
        "사업자등록증 확인이 필요합니다. 유효한 사업자등록번호만 가입 신청할 수 있습니다.";
      setErrors(newErrors);
      return;
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
          position: formData.position || undefined,
          certificateImageUrl: certificateUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "가입 신청에 실패했습니다");
      }

      // OCR natijalarini va step 2 data'ni localStorage'ga saqlash
      if (ocrResult) {
        localStorage.setItem(
          "supplier_registration_ocr",
          JSON.stringify(ocrResult)
        );
      }
      localStorage.setItem(
        "supplier_registration_step2",
        JSON.stringify({
          name: formData.name,
          phoneNumber: formData.phoneNumber,
          position: formData.position || undefined,
          certificateUrl: certificateUrl,
        })
      );

      // S 0-3 company info page'ga o'tish
      router.push("/register/company");
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
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between sm:mb-8"></div>

        {/* Progress Indicator - 4 steps */}
        <div className="mb-6 flex items-center justify-between gap-1 sm:mb-8 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white sm:h-10 sm:w-10 sm:text-sm">
              1
            </div>
            <span className="hidden text-xs font-medium text-slate-900 sm:inline sm:text-sm">
              계정 정보
            </span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 sm:h-8 sm:w-8 sm:text-xs">
              2
            </div>
            <span className="hidden text-xs text-slate-600 sm:inline sm:text-sm">
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
      </div>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">
          {/* Registration Card */}
          <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            {/* Header */}
            

            {/* Error Message */}
            {errors.submit && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {errors.submit}
              </div>
            )}

            {/* Registration Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4 pb-20 sm:space-y-5 sm:pb-5"
            >
              {/* Name and 직함 side by side */}
              <div className="flex flex-row gap-3 sm:gap-4">
                {/* Name - Left side */}
                <div className="flex-1">
                  <label
                    htmlFor="name"
                    className="mb-1.5 block text-sm font-medium text-slate-700 sm:mb-2"
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
                    className={`w-full rounded-lg border py-2.5 px-3.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:py-3 sm:px-4 sm:text-base ${
                      errors.name
                        ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                        : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                    }`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-600 sm:text-xs">
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* 직함 (Job Title) - Right side */}
                <div className="flex-1 relative z-10">
                  <label
                    htmlFor="position"
                    className="mb-1.5 block text-sm font-medium text-slate-700 sm:mb-2"
                  >
                    직함
                  </label>
                  <div className="relative">
                    <select
                      id="position"
                      value={formData.position}
                      onChange={(e) =>
                        setFormData({ ...formData, position: e.target.value })
                      }
                      onFocus={(e) => {
                        // Scroll to ensure dropdown opens downward on mobile
                        const target = e.currentTarget as HTMLSelectElement;
                        if (!target) return;

                        setTimeout(() => {
                          try {
                            const rect = target.getBoundingClientRect();
                            const scrollTop =
                              window.pageYOffset ||
                              document.documentElement.scrollTop;
                            const viewportHeight = window.innerHeight;
                            const elementBottom = rect.bottom + scrollTop;
                            const spaceBelow = viewportHeight - rect.bottom;

                            // If less than 200px space below, scroll down
                            if (spaceBelow < 200) {
                              window.scrollTo({
                                top: elementBottom - viewportHeight + 250,
                                behavior: "smooth",
                              });
                            }
                          } catch (error) {
                            // Silently handle any errors
                            console.error(
                              "Error scrolling for dropdown:",
                              error
                            );
                          }
                        }, 100);
                      }}
                      className={`w-full appearance-none rounded-lg border py-2.5 pl-3.5 pr-10 text-base text-slate-900 focus:outline-none focus:ring-2 sm:py-3 sm:pl-4 sm:text-base ${
                        errors.position
                          ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                          : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                      } ${
                        !formData.position ? "text-slate-400" : "text-slate-900"
                      }`}
                      style={{
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        appearance: "none",
                      }}
                    >
                      <option value="" disabled hidden>
                        직함
                      </option>
                      <option value="사원">사원</option>
                      <option value="주임">주임</option>
                      <option value="대리">대리</option>
                      <option value="과장">과장</option>
                      <option value="차장">차장</option>
                      <option value="부장">부장</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <svg
                        className="h-5 w-5 text-slate-400 sm:h-5 sm:w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  {errors.position && (
                    <p className="mt-1 text-xs text-red-600 sm:text-xs">
                      {errors.position}
                    </p>
                  )}
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label
                  htmlFor="phoneNumber"
                  className="mb-1.5 block text-sm font-medium text-slate-700 sm:mb-2"
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
                    className={`w-full rounded-lg border py-2.5 px-3.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:py-3 sm:px-4 sm:text-base ${
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
                  <p className="mt-1 text-xs text-red-600 sm:text-xs">
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
                      {/* {ocrResult && !uploading && ocrResult.parsedFields && (
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
                      )} */}
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
                disabled={
                  loading ||
                  uploading ||
                  isBusinessValid === null ||
                  isBusinessValid === false
                }
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

            {/* Verification Modal */}
            {showVerificationModal && verificationResult && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">
                      사업자등록번호 확인
                    </h3>
                    <button
                      onClick={() => setShowVerificationModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <svg
                        className="h-6 w-6"
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
                  </div>

                  {verificationResult.isValid ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                          <svg
                            className="h-6 w-6 text-green-600"
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
                        <div>
                          <p className="font-semibold text-green-900">
                            사업자등록번호가 확인되었습니다
                          </p>
                          <p className="text-sm text-green-700">
                            {verificationResult.businessStatus ||
                              "유효한 사업자입니다"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowVerificationModal(false)}
                        className="w-full rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white hover:bg-green-700"
                      >
                        확인
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                          <svg
                            className="h-6 w-6 text-red-600"
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
                        </div>
                        <div>
                          <p className="font-semibold text-red-900">
                            사업자등록번호 확인 실패
                          </p>
                          <p className="text-sm text-red-700">
                            {verificationResult.error ||
                              "사업자등록번호가 유효하지 않습니다"}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-yellow-50 p-4">
                        <p className="text-sm text-yellow-800">
                          유효하지 않은 사업자등록번호이므로 가입 신청을 진행할
                          수 없습니다.
                          <br />
                          사업자등록증 이미지를 확인하고 다시 업로드해주세요.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowVerificationModal(false);
                          setCertificateImage(null);
                          setCertificatePreview("");
                          setCertificateUrl("");
                          setOcrResult(null);
                          setIsBusinessValid(null);
                          setVerificationResult(null);
                        }}
                        className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700"
                      >
                        다시 업로드
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

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
