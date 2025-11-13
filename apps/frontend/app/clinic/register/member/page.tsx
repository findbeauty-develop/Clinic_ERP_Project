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
  document_image_urls: string[];
  tenant_id?: string | null;
  created_at: string;
};

type CreatedMember = {
  memberId: string;
  role: string;
  password: string;
  name?: string;
  phoneNumber?: string;
  idCardNumber?: string;
  address?: string;
};

const normalizeClinicName = (name: string) =>
  name.replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, "");

export default function ClinicMemberSetupPage() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "", []);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhoneNumber, setOwnerPhoneNumber] = useState("");
  const [ownerIdCardNumber, setOwnerIdCardNumber] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClinics = async () => {
      if (!apiUrl) {
        setError("API 주소가 설정되지 않았습니다.");
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`${apiUrl}/iam/members/clinics`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body?.message === "string"
              ? body.message
              : "클리닉 정보를 불러오지 못했습니다."
          );
        }
        const data = (await response.json()) as Clinic[];
        setClinics(data);
        
        // Check if we're in edit mode (clinic ID from success page)
        const editingClinicId = sessionStorage.getItem("erp_editing_clinic_id");
        if (editingClinicId) {
          // Find clinic by ID
          const matchedClinic = data.find((c) => c.id === editingClinicId);
          if (matchedClinic) {
            setSelectedClinicId(matchedClinic.id);
            
            // Load owner info from sessionStorage
            const ownerProfileRaw = sessionStorage.getItem("erp_owner_profile");
            if (ownerProfileRaw) {
              try {
                const ownerProfile = JSON.parse(ownerProfileRaw) as {
                  ownerName?: string;
                  ownerPhoneNumber?: string;
                  ownerIdCardNumber?: string;
                  ownerAddress?: string;
                };
                if (ownerProfile.ownerName) setOwnerName(ownerProfile.ownerName);
                if (ownerProfile.ownerPhoneNumber) setOwnerPhoneNumber(ownerProfile.ownerPhoneNumber);
                if (ownerProfile.ownerIdCardNumber) setOwnerIdCardNumber(ownerProfile.ownerIdCardNumber);
                if (ownerProfile.ownerAddress) setOwnerAddress(ownerProfile.ownerAddress);
              } catch (err) {
                console.error("Failed to parse owner profile", err);
              }
            }
          } else if (data.length > 0) {
            setSelectedClinicId(data[0].id);
          }
        } else if (data.length > 0) {
          setSelectedClinicId(data[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "클리닉 정보를 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchClinics();
  }, [apiUrl]);

  const selectedClinic = clinics.find((clinic) => clinic.id === selectedClinicId);

  const clinicSlug = useMemo(() => {
    if (!selectedClinic) return "";
    const key =
      selectedClinic.english_name?.trim() || selectedClinic.name || "";
    return normalizeClinicName(key);
  }, [selectedClinic]);

  const ownerId = clinicSlug ? `owner1@${clinicSlug}` : "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClinic || !apiUrl) {
      setError("클리닉 정보가 올바르지 않습니다.");
      return;
    }
    if (!ownerName || !ownerPhoneNumber || !ownerIdCardNumber || !ownerAddress) {
      setError("모든 필드를 입력해주세요.");
      return;
    }
    if (!ownerPassword) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    if (ownerPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    // Check if we're in edit mode
    const editingClinicId = sessionStorage.getItem("erp_editing_clinic_id");
    const isEditMode = editingClinicId !== null;

    const payload = {
      clinicName: selectedClinic.name,
      ownerPassword,
      ownerName,
      ownerPhoneNumber,
      ownerIdCardNumber,
      ownerAddress,
      clinicEnglishName: selectedClinic.english_name ?? undefined,
      clinicId: selectedClinic.id,
      tenantId: selectedClinic.tenant_id,
      isEditMode,
    };

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/iam/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "계정을 생성하지 못했습니다."
        );
      }
      const result = (await response.json()) as CreatedMember[];
      if (typeof window !== "undefined") {
        const clinicSummary = {
          name: selectedClinic.name,
          englishName: selectedClinic.english_name,
          category: selectedClinic.category,
          location: selectedClinic.location,
          medicalSubjects: selectedClinic.medical_subjects,
          description: selectedClinic.description,
          licenseType: selectedClinic.license_type,
          licenseNumber: selectedClinic.license_number,
          documentIssueNumber: selectedClinic.document_issue_number,
        };
        sessionStorage.setItem(
          "erp_clinic_summary",
          JSON.stringify(clinicSummary)
        );
        sessionStorage.setItem(
          "erp_owner_profile",
          JSON.stringify({
            ownerId,
            ownerName,
            ownerPhoneNumber,
            ownerIdCardNumber,
            ownerAddress,
          })
        );
        sessionStorage.setItem(
          "erp_created_members",
          JSON.stringify(result)
        );
        // Clear editing clinic ID after successful submission
        sessionStorage.removeItem("erp_editing_clinic_id");
        window.location.href = "/clinic/register/success";
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "계정을 생성하지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClinicChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedClinicId(event.target.value);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="text-center space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
            계정 만들기
          </h1>
          <p className="text-sm text-slate-500 md:text-base">
            오너 정보를 입력하고 기본 계정을 생성하세요.
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
                  step === 3
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : step < 3
                    ? "border-indigo-200 bg-indigo-50 text-indigo-400"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {step}
              </div>
              <span
                className={`text-xs md:text-sm ${
                  step === 3 ? "text-indigo-500 font-medium" : ""
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </nav>

        <section className="mx-auto w-full max-w-3xl space-y-8">
          <div className="rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)] p-6 md:p-10">
            <h2 className="text-xl font-semibold text-slate-900">
              오너 정보 입력
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              입력하신 정보로 오너, 매니저, 일반 계정이 자동 생성됩니다.
            </p>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    클리닉 선택 *
                  </label>
                  <select
                    value={selectedClinicId}
                    onChange={handleClinicChange}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    성함 *
                  </label>
                  <input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    placeholder="오너 성함을 입력하세요."
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    핸드폰 *
                  </label>
                  <input
                    value={ownerPhoneNumber}
                    onChange={(e) => setOwnerPhoneNumber(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    placeholder="010-XXXX-XXXX"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    신분증 번호 *
                  </label>
                  <input
                    value={ownerIdCardNumber}
                    onChange={(e) => setOwnerIdCardNumber(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    placeholder="주민등록번호를 입력하세요."
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    주소 *
                  </label>
                  <input
                    value={ownerAddress}
                    onChange={(e) => setOwnerAddress(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    placeholder="클리닉 주소를 입력하세요."
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    ID
                  </label>
                  <input
                    value={ownerId}
                    readOnly
                    className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3 text-sm text-slate-500"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    ID는 클리닉 명칭을 기반으로 자동 생성됩니다.
                  </p>
                </div>

                <div className="relative">
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    비밀번호 *
                  </label>
                  <input
                    type={showOwnerPassword ? "text" : "password"}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    placeholder="비밀번호를 입력하세요."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    aria-label={showOwnerPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  >
                    {showOwnerPassword ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.98 8.223A10.477 10.477 0 001.942 12C3.644 16.09 7.523 19 12 19c1.356 0 2.65-.272 3.828-.765M6.228 6.228A10.45 10.45 0 0112 5c4.477 0 8.356 2.91 10.058 7-.52 1.272-1.198 2.444-2.002 3.47m-3.728 2.442A10.45 10.45 0 0112 19c-4.477 0-8.356-2.91-10.058-7a10.52 10.52 0 012.51-3.56"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 4.5l15 15"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 5 12 5c4.642 0 8.58 2.51 9.966 6.678.07.21.07.434 0 .644C20.577 16.49 16.64 19 12 19c-4.642 0-8.58-2.51-9.966-6.678z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    )}
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    비밀번호 재입력 *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      placeholder="비밀번호를 한 번 더 입력하세요."
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                      aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                    >
                      {showConfirmPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-5 w-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.98 8.223A10.477 10.477 0 001.942 12C3.644 16.09 7.523 19 12 19c1.356 0 2.65-.272 3.828-.765M6.228 6.228A10.45 10.45 0 0112 5c4.477 0 8.356 2.91 10.058 7-.52 1.272-1.198 2.444-2.002 3.47m-3.728 2.442A10.45 10.45 0 0112 19c-4.477 0-8.356-2.91-10.058-7a10.52 10.52 0 012.51-3.56"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 4.5l15 15"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-5 w-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 5 12 5c4.642 0 8.58 2.51 9.966 6.678.07.21.07.434 0 .644C20.577 16.49 16.64 19 12 19c-4.642 0-8.58-2.51-9.966-6.678z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>

        </section>
      </div>
    </div>
  );
}

