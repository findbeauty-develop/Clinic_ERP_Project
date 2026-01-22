"use client";

import { useState, useEffect } from "react";
import { getAccessToken } from "../lib/api";

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplier?: any | null;
}

const positionOptions = [
  "직함 선택",
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
];

export default function SupplierFormModal({
  isOpen,
  onClose,
  onSuccess,
  supplier,
}: SupplierFormModalProps) {
  const [formData, setFormData] = useState({
    company_name: "",
    business_number: "",
    company_phone: "",
    company_email: "",
    company_address: "",
    name: "",
    phone_number: "",
    email1: "",
    position: "",
    responsible_products: "",
    memo: "",
  });

  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isBusinessValid, setIsBusinessValid] = useState<boolean | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://13.209.40.48:3000";
  const supplierApiUrl =
    process.env.NEXT_PUBLIC_SUPPLIER_API_URL || "http://13.209.40.48:3002";

  useEffect(() => {
    if (supplier) {
      setFormData({
        company_name: supplier.company_name || "",
        business_number: supplier.business_number || "",
        company_phone: supplier.company_phone || "",
        company_email: supplier.company_email || "",
        company_address: supplier.company_address || "",
        name: supplier.name || "",
        phone_number: supplier.phone_number || "",
        email1: supplier.email1 || "",
        position: supplier.position || "",
        responsible_products: supplier.responsible_products?.join(", ") || "",
        memo: supplier.memo || "",
      });
      if (supplier.certificate_image_url) {
        setCertificatePreview(supplier.certificate_image_url);
      }
    }
  }, [supplier]);

  const handleCertificateUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setCertificatePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server with OCR and verification
    setUploading(true);
    setOcrProcessing(true);
    setOcrResult(null);
    setVerificationResult(null);
    setIsBusinessValid(null);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const response = await fetch(
        `${supplierApiUrl}/supplier/manager/upload-certificate`,
        {
          method: "POST",
          body: formDataUpload,
        }
      );

      if (!response.ok) {
        throw new Error("파일 업로드에 실패했습니다");
      }

      const data = await response.json();
      setOcrResult(data.ocrResult);

      // Auto-fill from OCR if available
      if (data.ocrResult?.parsedFields) {
        const fields = data.ocrResult.parsedFields;
        setFormData((prev) => ({
          ...prev,
          company_name: fields.companyName || prev.company_name,
          business_number: fields.businessNumber || prev.business_number,
          company_address: fields.address || prev.company_address,
          name: fields.representativeName || prev.name,
        }));
      }

      // Check verification result
      if (data.ocrResult?.verification) {
        setVerificationResult(data.ocrResult.verification);
        setIsBusinessValid(data.ocrResult.verification.isValid);
        setShowVerificationModal(true);
      } else if (data.ocrResult?.verification === null) {
        setIsBusinessValid(false);
        setVerificationResult({ error: "사업자 정보를 확인할 수 없습니다" });
        setShowVerificationModal(true);
      }
    } catch (error: any) {
      console.error("Error uploading certificate:", error);
      alert(error.message || "파일 업로드에 실패했습니다");
      setIsBusinessValid(false);
    } finally {
      setUploading(false);
      setOcrProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.company_name.trim()) {
      alert("회사명을 입력하세요");
      return;
    }
    if (!formData.business_number.trim()) {
      alert("사업자번호를 입력하세요 (형식: 123-45-67890)");
      return;
    }
    if (!formData.phone_number.trim()) {
      alert("담당자 연락처를 입력하세요");
      return;
    }
    if (!formData.responsible_products.trim()) {
      alert("담당 제품을 입력하세요");
      return;
    }

    setSaving(true);

    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();

      if (!token) {
        throw new Error("Authentication token not found");
      }

      // Use create-manual endpoint for creating new suppliers
      const endpoint = `${apiUrl}/supplier/create-manual`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyName: formData.company_name,
          businessNumber: formData.business_number,
          companyPhone: formData.company_phone || undefined,
          companyEmail: formData.company_email || undefined,
          companyAddress: formData.company_address || undefined,
          managerName: formData.name || undefined,
          phoneNumber: formData.phone_number,
          managerEmail: formData.email1 || undefined,
          position: formData.position || undefined,
          responsibleProducts: formData.responsible_products || undefined,
          memo: formData.memo || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Failed to save supplier (${response.status})`
        );
      }

      alert("협력업체가 등록되었습니다");
      onSuccess();
    } catch (err: any) {
      console.error("Error saving supplier:", err);
      alert(err.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {supplier ? "협력업체 수정" : "협력업체 추가"}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-3xl font-light leading-none"
            >
              ×
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column */}
              <div className="space-y-4">
                {/* 담당자 이름 + 직함 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당자 이름*
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="성함"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                    <select
                      value={formData.position}
                      onChange={(e) =>
                        setFormData({ ...formData, position: e.target.value })
                      }
                      className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    >
                      {positionOptions.map((option) => (
                        <option
                          key={option}
                          value={option === "직함 선택" ? "" : option}
                        >
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 사업자등록증 업로드 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    사업자등록증
                  </label>
                  <div className="space-y-2">
                    {certificatePreview ? (
                      <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                        <img
                          src={certificatePreview}
                          alt="Certificate preview"
                          className="h-62 w-full object-contain rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCertificatePreview("");
                            setOcrResult(null);
                            setVerificationResult(null);
                            setIsBusinessValid(null);
                          }}
                          className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white transition hover:bg-red-600"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                        {ocrProcessing && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
                            <div className="bg-white rounded-lg p-4 flex items-center gap-3">
                              <svg
                                className="animate-spin h-5 w-5 text-sky-600"
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
                              <span className="text-sm font-medium text-slate-700">
                                OCR 처리 중...
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                        <div className="text-center">
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            이미지를 업로드하세요
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            업로드 시 자동으로 정보를 추출합니다
                          </p>
                        </div>
                      </div>
                    )}

                    <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                      {uploading || ocrProcessing
                        ? "업로드 및 OCR 처리 중..."
                        : certificatePreview
                          ? "사업자등록증 변경"
                          : "사업자등록증 업로드"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCertificateUpload}
                        disabled={uploading || ocrProcessing}
                        className="hidden"
                      />
                    </label>

                    {isBusinessValid === false && (
                      <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        <div className="flex items-center gap-2">
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          <span className="font-medium">
                            ⚠️ 사업자 정보 확인 실패
                          </span>
                        </div>
                        <p className="mt-1 text-xs">
                          수동으로 정보를 입력해주세요
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* 회사명 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사명*
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) =>
                      setFormData({ ...formData, company_name: e.target.value })
                    }
                    placeholder="회사명"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {/* 사업자번호 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    사업자번호*
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.business_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        business_number: e.target.value,
                      })
                    }
                    placeholder="123-45-67890"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    형식: 123-45-67890
                  </p>
                </div>

                {/* 회사 주소 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사 주소
                  </label>
                  <input
                    type="text"
                    value={formData.company_address}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        company_address: e.target.value,
                      })
                    }
                    placeholder="주소"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {/* 회사 전화번호 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사 전화번호
                  </label>
                  <input
                    type="tel"
                    value={formData.company_phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        company_phone: e.target.value,
                      })
                    }
                    placeholder="02-1234-5678"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {/* 회사 이메일 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    회사 이메일
                  </label>
                  <input
                    type="email"
                    value={formData.company_email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        company_email: e.target.value,
                      })
                    }
                    placeholder="company@example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                {/* 담당자 전화번호 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당자 전화번호*
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone_number}
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number: e.target.value })
                    }
                    placeholder="010-1234-5678"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {/* 담당자 이메일 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당자 이메일
                  </label>
                  <input
                    type="email"
                    value={formData.email1}
                    onChange={(e) =>
                      setFormData({ ...formData, email1: e.target.value })
                    }
                    placeholder="manager@company.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {/* 담당 제품 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    담당 제품*
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.responsible_products}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        responsible_products: e.target.value,
                      })
                    }
                    placeholder="예: 시럽, 주사기, 마스크"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    쉼표(,)로 구분하여 여러 제품을 입력할 수 있습니다
                  </p>
                </div>

                {/* 메모 */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    메모
                  </label>
                  <textarea
                    value={formData.memo}
                    onChange={(e) =>
                      setFormData({ ...formData, memo: e.target.value })
                    }
                    placeholder="추가 메모를 입력하세요"
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "저장 중..." : supplier ? "수정" : "등록"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Verification Modal */}
      {showVerificationModal && verificationResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              사업자 정보 확인
            </h3>
            {isBusinessValid ? (
              <div className="text-green-600 dark:text-green-400">
                ✅ 유효한 사업자입니다
              </div>
            ) : (
              <div className="text-red-600 dark:text-red-400">
                ❌ {verificationResult.error || "유효하지 않은 사업자입니다"}
              </div>
            )}
            <button
              onClick={() => setShowVerificationModal(false)}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
