"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Clinic = {
  id: string;
  name: string;
  english_name?: string | null;
  category: string;
  location: string;
  medical_subjects: string;
  description?: string | null;
  license_type: string;
  license_number: string;
  document_issue_number: string;
  document_image_urls?: string[];
  open_date?: string | null; // 개설신고일자
  doctor_name?: string | null; // 성명
  tenant_id?: string | null;
  created_at?: string;
};

type ClinicForm = {
  name: string;
  englishName: string;
  category: string;
  location: string;
  medicalSubjects: string;
  description: string;
  licenseType: string;
  licenseNumber: string;
  documentIssueNumber: string;
  documentImageUrls: string[];
  openDate?: string; // 개설신고일자 (from OCR)
  doctorName?: string; // 성명 (from OCR)
};

const initialForm: ClinicForm = {
  name: "",
  englishName: "",
  category: "",
  location: "",
  medicalSubjects: "",
  description: "",
  licenseType: "",
  licenseNumber: "",
  documentIssueNumber: "",
  documentImageUrls: [],
  openDate: "",
  doctorName: "",
};

const categoryOptions = ["피부과", "성형외과", "치과", "안과", "내과"];

export default function ClinicRegisterPage() {
  const [form, setForm] = useState<ClinicForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [isLoadingClinic, setIsLoadingClinic] = useState(true);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [isVerifyingCertificate, setIsVerifyingCertificate] = useState(false);
  const [certificateVerificationError, setCertificateVerificationError] = useState<string | null>(null);
  const [isCertificateVerified, setIsCertificateVerified] = useState(false);
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "", []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken =
        window.localStorage.getItem("erp_access_token") ??
        window.localStorage.getItem("access_token") ??
        "";
      setToken(storedToken);
    }
  }, []);

  // Load form data from sessionStorage (only persists for current tab session)
  // This prevents showing other users' data when a new user starts registration
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if we're in edit mode first
      const editingClinicId = sessionStorage.getItem("erp_editing_clinic_id");
      const clinicSummaryRaw = sessionStorage.getItem("erp_clinic_summary");
      
      // If NOT in edit mode, clear any old localStorage data to prevent showing other users' data
      if (!editingClinicId && !clinicSummaryRaw) {
        console.log("🔄 New registration - clearing old localStorage data");
        localStorage.removeItem("clinic_register_form");
      }
      
      // Load from sessionStorage (preferred) or localStorage (fallback for edit mode)
      const savedForm = sessionStorage.getItem("clinic_register_form") || 
                       (editingClinicId || clinicSummaryRaw ? localStorage.getItem("clinic_register_form") : null);
      
      if (savedForm) {
        try {
          const parsed = JSON.parse(savedForm);
          // Restore form data
          setForm({
            name: parsed.name || "",
            englishName: parsed.englishName || "",
            category: parsed.category || "",
            location: parsed.location || "",
            medicalSubjects: parsed.medicalSubjects || "",
            description: parsed.description || "",
            licenseType: parsed.licenseType || "",
            licenseNumber: parsed.licenseNumber || "",
            documentIssueNumber: parsed.documentIssueNumber || "",
            documentImageUrls: parsed.documentImageUrls || [],
            openDate: parsed.openDate || "",
            doctorName: parsed.doctorName || "",
          });
          setIsCertificateVerified(parsed.isCertificateVerified || false);
          setCertificateVerificationError(parsed.certificateVerificationError || null);
          console.log("✅ Loaded form data from storage");
        } catch (error) {
          console.error("Error loading saved form data:", error);
        }
      }
    }
  }, []);

  // Load clinic data from API when page loads (only for edit mode)
  useEffect(() => {
    const loadClinicData = async () => {
      if (!apiUrl) {
        setIsLoadingClinic(false);
        return;
      }

      try {
        // Check if we're in edit mode (clinic ID from success page)
        const editingClinicId = sessionStorage.getItem("erp_editing_clinic_id");
        console.log("Editing clinic ID from sessionStorage:", editingClinicId);
        
        // Get clinic name from sessionStorage (from success page)
        const clinicSummaryRaw = sessionStorage.getItem("erp_clinic_summary");
        
        // Only load from API if we're in edit mode
        if (!editingClinicId && !clinicSummaryRaw) {
          console.log("No edit mode - skipping API load, using localStorage data");
          setIsLoadingClinic(false);
          return;
        }

        // Fetch clinics from API
        const response = await fetch(`${apiUrl}/iam/members/clinics`);
        if (!response.ok) {
          setIsLoadingClinic(false);
          return;
        }

        const clinics = (await response.json()) as Clinic[];
        
        // Find clinic by ID (if editing) or by name
        let matchedClinic: Clinic | undefined;
        if (editingClinicId) {
          matchedClinic = clinics.find((c) => c.id === editingClinicId);
        } else if (clinicSummaryRaw) {
          const clinicSummary = JSON.parse(clinicSummaryRaw) as {
            name?: string;
            englishName?: string;
          };
          matchedClinic = clinics.find((c) => c.name === clinicSummary.name);
        }

        if (matchedClinic) {
          // Store clinic ID for update mode
          console.log("Found clinic for editing:", matchedClinic.id, matchedClinic.name);
          setClinicId(matchedClinic.id);

          // Convert image URLs to absolute URLs if they are relative
          const imageUrls = (matchedClinic.document_image_urls || []).map(
            (url) => {
              // If URL is already absolute (starts with http:// or https:// or data:), use as is
              if (
                url.startsWith("http://") ||
                url.startsWith("https://") ||
                url.startsWith("data:")
              ) {
                return url;
              }
              // If relative URL, prepend API URL
              return url.startsWith("/") ? `${apiUrl}${url}` : `${apiUrl}/${url}`;
            }
          );

          // Auto-fill form with clinic data (overwrite localStorage data in edit mode)
          setForm({
            name: matchedClinic.name || "",
            englishName: matchedClinic.english_name || "",
            category: matchedClinic.category || "",
            location: matchedClinic.location || "",
            medicalSubjects: matchedClinic.medical_subjects || "",
            description: matchedClinic.description || "",
            licenseType: matchedClinic.license_type || "",
            licenseNumber: matchedClinic.license_number || "",
            documentIssueNumber: matchedClinic.document_issue_number || "",
            documentImageUrls: imageUrls,
            openDate: matchedClinic.open_date ? new Date(matchedClinic.open_date).toISOString().split('T')[0] : "",
            doctorName: matchedClinic.doctor_name || "",
          });
          
          // In edit mode, assume certificate is already verified
          setIsCertificateVerified(true);
          setCertificateVerificationError(null);
        } else {
          console.log("Clinic not found for editing");
        }
      } catch (error) {
        console.error("Failed to load clinic data", error);
      } finally {
        setIsLoadingClinic(false);
      }
    };

    loadClinicData();
  }, [apiUrl]);

  // Save form data to sessionStorage (and localStorage as backup for edit mode)
  // sessionStorage only persists for current tab, preventing data leakage between users
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Skip saving if form is still in initial state (to avoid overwriting on first render)
      const hasFormData = form.name || form.location || form.documentImageUrls.length > 0;
      if (hasFormData) {
        const formData = {
          ...form,
          isCertificateVerified,
          certificateVerificationError,
        };
        // Save to sessionStorage (primary) - cleared when tab closes
        sessionStorage.setItem("clinic_register_form", JSON.stringify(formData));
        
        // Also save to localStorage if in edit mode (for persistence across tabs)
        const editingClinicId = sessionStorage.getItem("erp_editing_clinic_id");
        const clinicSummaryRaw = sessionStorage.getItem("erp_clinic_summary");
        if (editingClinicId || clinicSummaryRaw) {
          localStorage.setItem("clinic_register_form", JSON.stringify(formData));
        }
        console.log("💾 Saved form data to sessionStorage");
      }
    }
  }, [form, isCertificateVerified, certificateVerificationError]);

  const updateField = (key: keyof ClinicForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({
      ...prev,
      documentImageUrls: [],
    }));
    setIsCertificateVerified(false);
    setCertificateVerificationError(null);
    // Clear saved form data
    if (typeof window !== "undefined") {
      localStorage.removeItem("clinic_register_form");
    }
  };


  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Automatically trigger OCR verification when image is uploaded
    setIsVerifyingCertificate(true);
    setCertificateVerificationError(null);
    setIsCertificateVerified(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiUrl}/iam/members/clinics/verify-certificate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add the uploaded file URL or convert to base64
      if (data.fileUrl) {
        const fullUrl = data.fileUrl.startsWith("http") 
          ? data.fileUrl 
          : `${apiUrl}${data.fileUrl}`;
        setForm((prev) => ({
          ...prev,
          documentImageUrls: [fullUrl],
        }));
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Image = reader.result as string;
          setForm((prev) => ({
            ...prev,
            documentImageUrls: [base64Image],
          }));
        };
        reader.readAsDataURL(file);
      }

      if (data.isValid) {
        // Auto-fill form fields from OCR results
        if (data.mappedData) {
          setForm((prev) => ({
            ...prev,
            name: data.mappedData.name || prev.name,
            category: data.mappedData.category || prev.category,
            location: data.mappedData.location || prev.location,
            medicalSubjects: data.mappedData.medicalSubjects || prev.medicalSubjects,
            licenseType: data.mappedData.licenseType || prev.licenseType,
            licenseNumber: data.mappedData.licenseNumber || prev.licenseNumber,
            documentIssueNumber: data.mappedData.documentIssueNumber || prev.documentIssueNumber,
            openDate: data.mappedData.openDate || prev.openDate,
            doctorName: data.mappedData.doctorName || prev.doctorName,
            description: data.mappedData.doctorName || prev.description, // Fill 성명 (법인명) from OCR
          }));
        } else {
          // Fallback to fields if mappedData is not available
          setForm((prev) => ({
            ...prev,
            name: data.fields.clinicName || prev.name,
            category: data.fields.clinicType || prev.category,
            location: data.fields.address || prev.location,
            medicalSubjects: data.fields.department || prev.medicalSubjects,
            licenseNumber: data.fields.doctorLicenseNo || prev.licenseNumber,
            documentIssueNumber: data.fields.reportNumber || prev.documentIssueNumber,
            openDate: data.fields.openDate || prev.openDate,
            doctorName: data.fields.doctorName || prev.doctorName,
            description: data.fields.doctorName || prev.description, // Fill 성명 (법인명) from OCR
            licenseType: data.fields.licenseType || prev.licenseType, // Fill 면허종류 from OCR
          }));
        }

        // Mark certificate as verified
        setIsCertificateVerified(true);
        setCertificateVerificationError(null);
        
        // Show success message
        window.alert("인증서가 성공적으로 인식되었습니다. 필드가 자동으로 채워졌습니다.");
      } else {
        // Check if HIRA verification failed
        const hiraFailed = data.hiraVerification && !data.hiraVerification.isValid;
        const notFoundInHIRA = data.warnings?.some((w: string | string[]) => 
          typeof w === 'string' && (w.includes('not found in HIRA database') || 
          w.includes('이 의료기관은 국가에서 인정하지 않은 병원'))
        );
        
        const errorMessage = hiraFailed || notFoundInHIRA
          ? '이 의료기관은 국가에서 인정하지 않은 병원이거나 의료기관개설신고증을 다시 확인해주세요.'
          : '인증서 검증에 실패했습니다. 다시 시도해주세요.';
        
        // Set error message to display below image uploader
        setCertificateVerificationError(errorMessage);
        setIsCertificateVerified(false);
        
        // Still try to fill what we can from fields or mappedData
        if (data.mappedData) {
          setForm((prev) => ({
            ...prev,
            name: data.mappedData.name || prev.name,
            category: data.mappedData.category || prev.category,
            location: data.mappedData.location || prev.location,
            medicalSubjects: data.mappedData.medicalSubjects || prev.medicalSubjects,
            licenseType: data.mappedData.licenseType || prev.licenseType,
            licenseNumber: data.mappedData.licenseNumber || prev.licenseNumber,
            documentIssueNumber: data.mappedData.documentIssueNumber || prev.documentIssueNumber,
            openDate: data.mappedData.openDate || prev.openDate,
            doctorName: data.mappedData.doctorName || prev.doctorName,
            description: data.mappedData.doctorName || prev.description, // Fill 성명 (법인명) from OCR
          }));
        } else if (data.fields) {
          setForm((prev) => ({
            ...prev,
            name: data.fields.clinicName || prev.name,
            category: data.fields.clinicType || prev.category,
            location: data.fields.address || prev.location,
            medicalSubjects: data.fields.department || prev.medicalSubjects,
            licenseNumber: data.fields.doctorLicenseNo || prev.licenseNumber,
            documentIssueNumber: data.fields.reportNumber || prev.documentIssueNumber,
            openDate: data.fields.openDate || prev.openDate,
            doctorName: data.fields.doctorName || prev.doctorName,
            description: data.fields.doctorName || prev.description, // Fill 성명 (법인명) from OCR
            licenseType: data.fields.licenseType || prev.licenseType, // Fill 면허종류 from OCR
          }));
        }
      }
    } catch (error) {
      console.error("Certificate verification error:", error);
      const errorMessage = "인증서 검증 중 오류가 발생했습니다. 수동으로 입력해주세요.";
      setCertificateVerificationError(errorMessage);
      setIsCertificateVerified(false);
      
      // Still add the image to documentImageUrls even if verification fails
      const reader = new FileReader();
      reader.onload = () => {
        const base64Image = reader.result as string;
        setForm((prev) => ({
          ...prev,
          documentImageUrls: [base64Image],
        }));
      };
      reader.readAsDataURL(file);
    } finally {
      setIsVerifyingCertificate(false);
      // Reset input value to allow re-uploading the same file
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiUrl) {
      window.alert("API 주소가 설정되지 않았습니다.");
      return;
    }

    const payload = {
      name: form.name,
      englishName: form.englishName || undefined,
      category: form.category,
      location: form.location,
      medicalSubjects: form.medicalSubjects,
      description: form.description || undefined,
      licenseType: form.licenseType,
      licenseNumber: form.licenseNumber,
      documentIssueNumber: form.documentIssueNumber,
      documentImageUrls: form.documentImageUrls,
      openDate: form.openDate || undefined,
      doctorName: form.doctorName || undefined,
    };

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // If clinicId exists, update existing clinic; otherwise create new one
      const isUpdateMode = clinicId !== null;
      console.log("Submit mode:", isUpdateMode ? "UPDATE" : "CREATE", "Clinic ID:", clinicId);
      const url = isUpdateMode
        ? `${apiUrl}/iam/members/clinics/${clinicId}`
        : `${apiUrl}/iam/members/clinics`;
      const method = isUpdateMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = typeof result?.message === "string"
          ? result.message
          : isUpdateMode
          ? "클리닉 수정 중 오류가 발생했습니다."
          : "클리닉 등록 중 오류가 발생했습니다.";
        
        // Show alert for duplicate registration
        window.alert(errorMessage);
        throw new Error(errorMessage);
      }

      setForm(initialForm);
      setClinicId(null);
      if (typeof window !== "undefined") {
        // Clear form data from both sessionStorage and localStorage after successful submission
        sessionStorage.removeItem("clinic_register_form");
        localStorage.removeItem("clinic_register_form");
        
        // Clear editing clinic ID
        sessionStorage.removeItem("erp_editing_clinic_id");
        
        // Save tenant_id for use in complete page and member creation
        if (result && result.tenant_id) {
          sessionStorage.setItem("erp_tenant_id", result.tenant_id);
          console.log("✅ Saved tenant_id:", result.tenant_id);
        }
        
        // Update sessionStorage with new clinic data
        sessionStorage.setItem(
          "erp_clinic_summary",
          JSON.stringify({
            id: result.id,
            name: result.name,
            englishName: result.english_name,
            category: result.category,
            location: result.location,
            medicalSubjects: result.medical_subjects,
            description: result.description,
            licenseType: result.license_type,
            licenseNumber: result.license_number,
            documentIssueNumber: result.document_issue_number,
            tenantId: result.tenant_id, // Include tenant_id
          })
        );
        window.location.href = "/clinic/register/complete";
      }
    } catch (error) {
      // Error message is already shown in the if (!response.ok) block
      // Only show alert here if it's a network error or other unexpected error
      if (error instanceof Error && !error.message.includes("클리닉 등록 중 오류가 발생했습니다") && !error.message.includes("이미 등록된 클리닉")) {
        window.alert(
          error.message || "클리닉 등록 중 오류가 발생했습니다."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 md:py-16">
        <header className="text-center space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
            클리닉 가입
          </h1>
          <p className="text-sm text-slate-500 md:text-base">
            필요한 정보를 입력하고 재고 관리 시스템을 시작하세요.
          </p>
        </header>

        <nav className="mx-auto flex w-full max-w-2xl items-center justify-between text-sm text-slate-400">
          {[
            { step: 1, label: "클리닉 인증" },
            { step: 2, label: "법인 인증" },
            { step: 3, label: "계정 만들기" },
            { step: 4, label: "가입성공" },
          ].map(({ step, label }) => (
            <div key={step} className="flex flex-col items-center gap-2">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                  step === 1
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {step}
              </div>
              <span
                className={`text-xs md:text-sm ${
                  step === 1 ? "text-indigo-500 font-medium" : ""
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </nav>

        <section className="rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)]">
          <form
            onSubmit={handleSubmit}
            className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)] md:p-10"
          >
            <div className="relative flex flex-col">
              <div className="relative flex h-[620px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 text-center text-slate-500">
                {form.documentImageUrls.length === 0 ? (
                  <label
                    htmlFor="documentUpload"
                    className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-8"
                  >
                    <div className="rounded-full bg-slate-100 p-4 text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-8 w-8"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-slate-700">
                        의료기관개설신고필증 업로드
                      </p>
                      <p className="text-xs text-slate-400">
                        JPG, PNG 또는 PDF 파일을 선택하세요.
                      </p>
                    </div>
                    <input
                      id="documentUpload"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileUpload}
                      disabled={isVerifyingCertificate}
                      className="hidden"
                    />
                    {isVerifyingCertificate && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="text-center">
                          <div className="mb-2 text-sm font-medium text-slate-700">
                            인증 중...
                          </div>
                          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
                        </div>
                      </div>
                    )}
                  </label>
                ) : (
                  <div className="absolute inset-0">
                    {/* X button to remove image */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage();
                      }}
                      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                      title="이미지 제거"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                    <label
                      htmlFor="documentUpload"
                      className="absolute inset-0 cursor-pointer"
                      title="다른 파일로 교체하려면 클릭하세요."
                    >
                      {form.documentImageUrls[0].startsWith("data:image") || 
                       form.documentImageUrls[0].startsWith("http") ? (
                        <img
                          src={form.documentImageUrls[0]}
                          alt="업로드된 이미지 미리보기"
                          className="h-full w-full object-contain bg-white transition hover:opacity-95"
                        />
                      ) : (
                        <iframe
                          src={form.documentImageUrls[0]}
                          title="업로드된 문서 미리보기"
                          className="h-full w-full"
                        />
                      )}
                      <input
                        id="documentUpload"
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={handleFileUpload}
                        disabled={isVerifyingCertificate}
                        className="hidden"
                      />
                      {isVerifyingCertificate && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                          <div className="text-center">
                            <div className="mb-2 text-sm font-medium text-slate-700">
                              인증 중...
                            </div>
                            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
                          </div>
                        </div>
                      )}
                    </label>
                  </div>
                )}
              </div>
              {certificateVerificationError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">
                    {certificateVerificationError}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  명칭 *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="클리닉 명칭을 입력하세요."
                  required
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  영어이름
                </label>
                <input
                  type="text"
                  value={form.englishName}
                  onChange={(event) =>
                    updateField("englishName", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="수동 입력 필요."
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  종류 *
                </label>
                <select
                  value={form.category}
                  onChange={(event) =>
                    updateField("category", event.target.value)
                  }
                  required
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="" disabled>
                    카테고리를 선택하세요
                  </option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  소재지 *
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="예: 서울특별시 강남구 ..."
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  진료과목 *
                </label>
                <input
                  type="text"
                  value={form.medicalSubjects}
                  onChange={(event) =>
                    updateField("medicalSubjects", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="예: 피부과, 성형외과"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  성명 (법인명)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="법인명 또는 추가 설명을 입력하세요."
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  면허종류 *
                </label>
                <input
                  type="text"
                  value={form.licenseType}
                  onChange={(event) =>
                    updateField("licenseType", event.target.value)
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="예: 의사면허"
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  면허번호 *
                </label>
                <input
                  type="text"
                  value={form.licenseNumber}
                  onChange={(event) =>
                    updateField("licenseNumber", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="숫자만 입력하세요."
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  문서발급번호 *
                </label>
                <input
                  type="text"
                  value={form.documentIssueNumber}
                  onChange={(event) =>
                    updateField("documentIssueNumber", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="문서 발급번호를 입력하세요."
                  required
                />
              </div>

            </div>

            <div className="md:col-span-2 flex flex-col items-end gap-2">
              {!isCertificateVerified && !clinicId && (
                <p className="text-sm text-red-600 font-medium">
                  의료기관개설신고증을 data.go.kr에서 인증해주세요.
                </p>
              )}
              <button
                type="submit"
                disabled={loading || (!isCertificateVerified && !clinicId)}
                className="rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "등록 중..." : "다음"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

