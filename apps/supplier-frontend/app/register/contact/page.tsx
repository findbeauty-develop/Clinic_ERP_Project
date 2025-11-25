"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ContactInfoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    password: "",
    passwordConfirm: "",
    email1: "",
    email2: "",
    responsibleRegions: [] as string[],
    responsibleProducts: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [newRegion, setNewRegion] = useState("");
  const [newProduct, setNewProduct] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

  useEffect(() => {
    // Previous step data'ni localStorage'dan olish
    const step3Data = localStorage.getItem("supplier_registration_step3");
    if (!step3Data) {
      // Agar step 3 data yo'q bo'lsa, orqaga qaytarish
      router.push("/register/company");
    }
  }, [router]);

  // Password validation
  const validatePassword = (password: string): string | null => {
    if (!password) {
      return "비밀번호를 입력하세요";
    }
    if (password.length < 9) {
      return "비밀번호는 최소 9자 이상이어야 합니다";
    }
    if (!/^(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      return "비밀번호는 영문과 숫자를 포함해야 합니다";
    }
    return null;
  };

  // Email validation
  const validateEmail = (email: string): string | null => {
    if (!email) {
      return "이메일을 입력하세요";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return "올바른 이메일 형식이 아닙니다";
    }
    return null;
  };

  const addRegion = () => {
    const trimmed = newRegion.trim();
    if (!trimmed) {
      setErrors((prev) => ({
        ...prev,
        newRegion: "지역명을 입력하세요",
      }));
      return;
    }
    if (formData.responsibleRegions.includes(trimmed)) {
      setErrors((prev) => ({
        ...prev,
        newRegion: "이미 추가된 지역입니다",
      }));
      return;
    }
    setFormData({
      ...formData,
      responsibleRegions: [...formData.responsibleRegions, trimmed],
    });
    setNewRegion("");
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.newRegion;
      return newErrors;
    });
  };

  const removeRegion = (region: string) => {
    setFormData({
      ...formData,
      responsibleRegions: formData.responsibleRegions.filter((r) => r !== region),
    });
  };

  const addProduct = () => {
    const trimmed = newProduct.trim();
    if (!trimmed) {
      setErrors((prev) => ({
        ...prev,
        newProduct: "제품명을 입력하세요",
      }));
      return;
    }
    if (formData.responsibleProducts.includes(trimmed)) {
      setErrors((prev) => ({
        ...prev,
        newProduct: "이미 추가된 제품입니다",
      }));
      return;
    }
    setFormData({
      ...formData,
      responsibleProducts: [...formData.responsibleProducts, trimmed],
    });
    setNewProduct("");
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.newProduct;
      return newErrors;
    });
  };

  const removeProduct = (product: string) => {
    setFormData({
      ...formData,
      responsibleProducts: formData.responsibleProducts.filter((p) => p !== product),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};

    // Password validation
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      newErrors.password = passwordError;
    }

    // Password confirmation
    if (!formData.passwordConfirm) {
      newErrors.passwordConfirm = "비밀번호 확인을 입력하세요";
    } else if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = "비밀번호가 일치하지 않습니다";
    }

    // Email validation
    const email1Error = validateEmail(formData.email1);
    if (email1Error) {
      newErrors.email1 = email1Error;
    }

    // Email2 validation (optional but must be valid if provided)
    if (formData.email2) {
      const email2Error = validateEmail(formData.email2);
      if (email2Error) {
        newErrors.email2 = email2Error;
      } else if (formData.email1 === formData.email2) {
        newErrors.email2 = "이메일1과 이메일2는 서로 다르게 입력하세요";
      }
    }

    // Regions validation
    if (formData.responsibleRegions.length === 0) {
      newErrors.responsibleRegions = "최소 1개 이상의 담당 지역을 추가하세요";
    }

    // Products validation
    if (formData.responsibleProducts.length === 0) {
      newErrors.responsibleProducts = "최소 1개 이상의 담당 제품을 추가하세요";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Submit to backend
    setLoading(true);
    try {
      // Get previous step data
      const step3DataStr = localStorage.getItem("supplier_registration_step3");
      const step2DataStr = localStorage.getItem("supplier_registration_step2");

      const response = await fetch(`${apiUrl}/supplier/manager/register-contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: formData.password,
          passwordConfirm: formData.passwordConfirm,
          email1: formData.email1,
          email2: formData.email2 || undefined,
          responsibleRegions: formData.responsibleRegions,
          responsibleProducts: formData.responsibleProducts,
          step3Data: step3DataStr ? JSON.parse(step3DataStr) : undefined,
          step2Data: step2DataStr ? JSON.parse(step2DataStr) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "저장에 실패했습니다");
      }

      // Contact info'ni localStorage'ga saqlash
      localStorage.setItem(
        "supplier_registration_step4",
        JSON.stringify({
          ...formData,
          step3Data: step3DataStr ? JSON.parse(step3DataStr) : undefined,
          step2Data: step2DataStr ? JSON.parse(step2DataStr) : undefined,
        })
      );

      // Keyingi step'ga o'tish (S 0-5 - 계정 정보확인)
      router.push("/register/complete");
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
          <h1 className="text-2xl font-bold text-slate-900">뷰티재고</h1>
        </div>

        {/* Progress Indicator - 4 steps */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
              1
            </div>
            <span className="text-sm text-slate-600">계정 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
              2
            </div>
            <span className="text-sm text-slate-600">회사 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              3
            </div>
            <span className="text-sm font-medium text-slate-900">담당자 정보</span>
          </div>
          <div className="h-0.5 flex-1 bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
              4
            </div>
            <span className="text-sm text-slate-600">담당자 ID</span>
          </div>
        </div>

        {/* Main Form Card */}
        <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
          {/* Title and Subtitle */}
          <div className="mb-6">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">담당자 정보</h2>
            <p className="text-sm text-slate-600">
              병원에서 주문 시 담당자로 표시될 정보입니다
            </p>
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {errors.submit}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                등록시 비밀번호 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.password;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="9짜리이상:숫자+영어"
                  className={`w-full rounded-lg border py-3 px-4 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                    errors.password
                      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
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
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.97 9.97 0 015.12 5.12m3.29 3.29L12 12m-3.29-3.29L3 3m9 9l3.29 3.29m0 0a9.97 9.97 0 015.12-5.12m-3.29 3.29L21 21"
                      />
                    </svg>
                  ) : (
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password}</p>
              )}
            </div>

            {/* Password Confirm */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                비밀번호 확인 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPasswordConfirm ? "text" : "password"}
                  value={formData.passwordConfirm}
                  onChange={(e) => {
                    setFormData({ ...formData, passwordConfirm: e.target.value });
                    if (errors.passwordConfirm) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.passwordConfirm;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="9짜리이상:숫자+영어"
                  className={`w-full rounded-lg border py-3 px-4 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                    errors.passwordConfirm
                      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswordConfirm ? (
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
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.97 9.97 0 015.12 5.12m3.29 3.29L12 12m-3.29-3.29L3 3m9 9l3.29 3.29m0 0a9.97 9.97 0 015.12-5.12m-3.29 3.29L21 21"
                      />
                    </svg>
                  ) : (
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {errors.passwordConfirm && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.passwordConfirm}
                </p>
              )}
            </div>

            {/* Email 1 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                이메일1 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email1}
                onChange={(e) => {
                  setFormData({ ...formData, email1: e.target.value });
                  if (errors.email1) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.email1;
                      return newErrors;
                    });
                  }
                }}
                placeholder="발주서가 도착하는 본인의 이메일을 입력"
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.email1
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.email1 && (
                <p className="mt-1 text-xs text-red-600">{errors.email1}</p>
              )}
            </div>

            {/* Email 2 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                이메일2 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email2}
                onChange={(e) => {
                  setFormData({ ...formData, email2: e.target.value });
                  if (errors.email2) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.email2;
                      return newErrors;
                    });
                  }
                }}
                placeholder="추가 검토 또는 내부 공유용 이메일을 입력"
                className={`w-full rounded-lg border py-3 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-base ${
                  errors.email2
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                }`}
              />
              {errors.email2 && (
                <p className="mt-1 text-xs text-red-600">{errors.email2}</p>
              )}
            </div>

            {/* Responsible Regions */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <svg
                  className="h-5 w-5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                담당 지역
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newRegion}
                  onChange={(e) => {
                    setNewRegion(e.target.value);
                    if (errors.newRegion) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.newRegion;
                        return newErrors;
                      });
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRegion();
                    }
                  }}
                  placeholder="예: 서울 강남구, 경기 성남시 분"
                  className={`flex-1 rounded-lg border py-2 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 ${
                    errors.newRegion
                      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={addRegion}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>
              {/* Hint text */}
              <div className="mb-2 flex items-start gap-2 text-xs text-slate-500">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <span>
                  상세한 지역을 입력하고 추가 버튼을 누르세요 (예: 서울 강남구, 부산 해운대구)
                </span>
              </div>
              {errors.newRegion && (
                <p className="mb-2 text-xs text-red-600">{errors.newRegion}</p>
              )}
              {errors.responsibleRegions && (
                <p className="mb-2 text-xs text-red-600">
                  {errors.responsibleRegions}
                </p>
              )}
              {formData.responsibleRegions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.responsibleRegions.map((region, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                    >
                      {region}
                      <button
                        type="button"
                        onClick={() => removeRegion(region)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
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
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Responsible Products */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <svg
                  className="h-5 w-5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
                담당 제품
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newProduct}
                  onChange={(e) => {
                    setNewProduct(e.target.value);
                    if (errors.newProduct) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.newProduct;
                        return newErrors;
                      });
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addProduct();
                    }
                  }}
                  placeholder="예: 보톡스, 필러, 레이저 소모품"
                  className={`flex-1 rounded-lg border py-2 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 ${
                    errors.newProduct
                      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={addProduct}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>
              {/* Hint text */}
              <div className="mb-2 flex items-start gap-2 text-xs text-slate-500">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <span>
                  담당하는 제품 또는 카테고리를 입력하고 추가 버튼을 누르세요
                </span>
              </div>
              {errors.newProduct && (
                <p className="mb-2 text-xs text-red-600">{errors.newProduct}</p>
              )}
              {errors.responsibleProducts && (
                <p className="mb-2 text-xs text-red-600">
                  {errors.responsibleProducts}
                </p>
              )}
              {formData.responsibleProducts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.responsibleProducts.map((product, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-800"
                    >
                      {product}
                      <button
                        type="button"
                        onClick={() => removeProduct(product)}
                        className="ml-1 text-purple-600 hover:text-purple-800"
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
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
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
                "다음"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              이미 계정이 있으신가요?{" "}
              <Link
                href="/supplier/login"
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
