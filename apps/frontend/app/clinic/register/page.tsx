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
};

const categoryOptions = ["피부과", "성형외과", "치과", "안과", "내과"];
const licenseTypes = ["의사면허", "의료기관개설신고필증", "사업자등록증"];

export default function ClinicRegisterPage() {
  const [form, setForm] = useState<ClinicForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [isLoadingClinic, setIsLoadingClinic] = useState(true);
  const [clinicId, setClinicId] = useState<string | null>(null);
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

  // Load clinic data from API when page loads
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
        if (!clinicSummaryRaw && !editingClinicId) {
          console.log("No clinic data found in sessionStorage");
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

          // Auto-fill form with clinic data
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
          });
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

  const updateField = (key: keyof ClinicForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        })
    );

    try {
      const encodedFiles = await Promise.all(readers);
      setForm((prev) => ({
        ...prev,
        documentImageUrls: [...prev.documentImageUrls, ...encodedFiles],
      }));
    } catch (error) {
      console.error(error);
      window.alert("파일을 읽는 중 오류가 발생했습니다.");
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
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : isUpdateMode
            ? "클리닉 수정 중 오류가 발생했습니다."
            : "클리닉 등록 중 오류가 발생했습니다."
        );
      }

      setForm(initialForm);
      setClinicId(null);
      if (typeof window !== "undefined") {
        // Clear editing clinic ID
        sessionStorage.removeItem("erp_editing_clinic_id");
        
        // Update sessionStorage with new clinic data
        if (isUpdateMode && result) {
          sessionStorage.setItem(
            "erp_clinic_summary",
            JSON.stringify({
              name: result.name,
              englishName: result.english_name,
              category: result.category,
              location: result.location,
              medicalSubjects: result.medical_subjects,
              description: result.description,
              licenseType: result.license_type,
              licenseNumber: result.license_number,
              documentIssueNumber: result.document_issue_number,
            })
          );
        }
        window.location.href = "/clinic/register/complete";
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "클리닉 등록 중 오류가 발생했습니다."
      );
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
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="absolute inset-0">
                  <label
                    htmlFor="documentUpload"
                    className="absolute inset-0 cursor-pointer"
                    title="다른 파일로 교체하려면 클릭하세요."
                  >
                    {form.documentImageUrls[0].startsWith("data:image") ? (
                      <img
                        src={form.documentImageUrls[0]}
                        alt="업로드된 이미지 미리보기"
                        className="h-full w-full object-cover object-center transition hover:opacity-95"
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
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {form.documentImageUrls.length > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 flex gap-2 overflow-x-auto bg-white/80 px-3 py-2">
                      {form.documentImageUrls.map((preview, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setForm((prev) => {
                              const reordered = [...prev.documentImageUrls];
                              const [selected] = reordered.splice(index, 1);
                              reordered.unshift(selected);
                              return { ...prev, documentImageUrls: reordered };
                            });
                          }}
                          className="h-12 w-12 overflow-hidden rounded-lg border border-white shadow-sm transition hover:border-indigo-400"
                        >
                          {preview.startsWith("data:image") ? (
                            <img
                              src={preview}
                              alt={`첨부 이미지 ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                              PDF
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
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
                <select
                  value={form.licenseType}
                  onChange={(event) =>
                    updateField("licenseType", event.target.value)
                  }
                  required
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="" disabled>
                    면허 종류를 선택하세요
                  </option>
                  {licenseTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={loading}
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

