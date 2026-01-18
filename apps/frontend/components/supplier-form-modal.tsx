"use client";

import { useState, useEffect } from "react";

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
    email2: "",
    position: "",
    responsible_products: [] as string[],
    responsible_regions: [] as string[],
    memo: "",
    certificate_image_url: "",
  });

  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isBusinessValid, setIsBusinessValid] = useState<boolean | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  const supplierApiUrl =
    process.env.NEXT_PUBLIC_SUPPLIER_API_URL || "http://localhost:3002";

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
        email2: supplier.email2 || "",
        position: supplier.position || "",
        responsible_products: supplier.responsible_products || [],
        responsible_regions: supplier.responsible_regions || [],
        memo: supplier.memo || "",
        certificate_image_url: supplier.certificate_image_url || "",
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
          certificate_image_url: data.fileUrl || prev.certificate_image_url,
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

    setSaving(true);

    try {
      const token =
        localStorage.getItem("erp_access_token") ||
        localStorage.getItem("token");

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
        <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {supplier ? "협력업체 수정" : "협력업체 추가"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* OCR Certificate Upload */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                📄 사업자등록증 업로드 (OCR 자동 입력)
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                사업자등록증을 업로드하면 자동으로 정보가 입력됩니다
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={handleCertificateUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700"
              />
              {certificatePreview && (
                <img
                  src={certificatePreview}
                  alt="Certificate"
                  className="mt-3 w-full h-48 object-contain rounded border border-gray-300 dark:border-gray-600"
                />
              )}
              {uploading && (
                <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                  업로드 중...
                </div>
              )}
            </div>

            {/* Company Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                회사 정보
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    회사명 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) =>
                      setFormData({ ...formData, company_name: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    사업자번호 *
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
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    형식: 123-45-67890
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    회사 전화번호
                  </label>
                  <input
                    type="tel"
                    value={formData.company_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, company_phone: e.target.value })
                    }
                    placeholder="02-1234-5678"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    회사 이메일
                  </label>
                  <input
                    type="email"
                    value={formData.company_email}
                    onChange={(e) =>
                      setFormData({ ...formData, company_email: e.target.value })
                    }
                    placeholder="company@example.com"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                담당자 정보
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    담당자 이름 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    연락처 *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone_number}
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number: e.target.value })
                    }
                    placeholder="010-1234-5678"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    이메일 1
                  </label>
                  <input
                    type="email"
                    value={formData.email1}
                    onChange={(e) =>
                      setFormData({ ...formData, email1: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    이메일 2
                  </label>
                  <input
                    type="email"
                    value={formData.email2}
                    onChange={(e) =>
                      setFormData({ ...formData, email2: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    직함
                  </label>
                  <select
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({ ...formData, position: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                  >
                    {positionOptions.map((pos) => (
                      <option key={pos} value={pos === "직함 선택" ? "" : pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                메모
              </label>
              <textarea
                value={formData.memo}
                onChange={(e) =>
                  setFormData({ ...formData, memo: e.target.value })
                }
                rows={3}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
              ></textarea>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
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
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}

