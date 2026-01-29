"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = {
  id: string;
  name: string;
  english_name?: string | null;
  category: string;
  location: string;
  medical_subjects: string;
  description?: string | null;
  doctor_name?: string | null;
  license_type: string;
  license_number: string;
  document_issue_number: string;
  document_image_urls?: string[];
  tenant_id?: string | null;
  created_at?: string;
};

type ClinicSummary = {
  id?: string | null;
  name?: string | null;
  englishName?: string | null;
  category?: string | null;
  location?: string | null;
  medicalSubjects?: string | null;
  description?: string | null;
  licenseType?: string | null;
  licenseNumber?: string | null;
  documentIssueNumber?: string | null;
};

type OwnerProfile = {
  ownerId?: string;
  ownerName?: string;
  ownerPhoneNumber?: string;
  ownerIdCardNumber?: string;
  ownerAddress?: string;
};

type CreatedMember = {
  memberId: string;
  role: string;
  password: string;
};

const normalizeClinicName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "");

const STEP_ITEMS = [
  { step: 1, label: "클리닉 인증" },
  // { step: 2, label: "법인 인증" },
  { step: 2, label: "계정 만들기" },
  { step: 3, label: "가입성공" },
];

const roleLabel = (role: string) => {
  switch (role) {
    case "owner":
    case "owner1":
      return "원장 ID";
    case "manager":
    case "manager1":
      return "관리자 ID";
    case "member":
    case "member1":
      return "직원 ID";
    default:
      return `${role.toUpperCase()} ID`;
  }
};

export default function ClinicRegisterSuccessPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com", []);
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [clinicFromApi, setClinicFromApi] = useState<Clinic | null>(null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [members, setMembers] = useState<CreatedMember[]>([]);
  const [missingData, setMissingData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadData = async () => {
      try {
        const clinicRaw = sessionStorage.getItem("erp_clinic_summary");
        const ownerRaw = sessionStorage.getItem("erp_owner_profile");
        const membersRaw = sessionStorage.getItem("erp_created_members");

        if (!clinicRaw || !ownerRaw || !membersRaw) {
          setMissingData(true);
          setLoading(false);
          return;
        }

        const parsedClinic = JSON.parse(clinicRaw) as ClinicSummary;
        const parsedOwner = JSON.parse(ownerRaw) as OwnerProfile;
        const parsedMembers = JSON.parse(membersRaw) as CreatedMember[];

        // ✅ Debug: Log members to check if owner password is present
        console.log("Parsed members:", parsedMembers);
        const ownerMember = parsedMembers.find((m) => m.role === "owner" || m.role === "owner1" || m.role === "소유자");
        if (ownerMember) {
          console.log("Owner member:", ownerMember);
          console.log("Owner password:", ownerMember.password);
        }

        setClinic(parsedClinic);
        setOwner(parsedOwner);
        setMembers(parsedMembers);

        // Fetch clinic from API to get english_name
        if (apiUrl) {
          try {
            // Get tenant_id from sessionStorage
            const tenantId = sessionStorage.getItem("erp_tenant_id");
            const url = tenantId
              ? `${apiUrl}/iam/members/clinics?tenantId=${encodeURIComponent(tenantId)}`
              : `${apiUrl}/iam/members/clinics`;

            const response = await fetch(url);
            if (response.ok) {
              const clinics = (await response.json()) as Clinic[];
              // Find the clinic that matches the stored clinic name
              const matchedClinic = clinics.find(
                (c) => c.name === parsedClinic.name
              );
              if (matchedClinic) {
                setClinicFromApi(matchedClinic);
              }
            }
          } catch (err) {
            console.error("Failed to fetch clinic from API", err);
          }
        }
      } catch (error) {
        console.error("Failed to parse session storage data", error);
        setMissingData(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [apiUrl]);

  useEffect(() => {
    if (missingData && typeof window !== "undefined") {
      router.replace("/clinic/register/member");
    }
  }, [missingData, router]);

  const clinicSlug = useMemo(() => {
    // Prefer API data, fallback to sessionStorage data
    if (clinicFromApi) {
      const key =
        clinicFromApi.english_name?.trim() || clinicFromApi.name || "";
      return normalizeClinicName(key);
    }
    if (clinic) {
      const key = clinic.englishName?.trim() || clinic.name || "";
      return normalizeClinicName(key);
    }
    return "";
  }, [clinicFromApi, clinic]);

  const displayMembers = useMemo(() => {
    // Use member IDs directly from backend (they already include clinic identifier)
    // If clinicSlug is available and member ID doesn't match expected format, reconstruct it
    if (!clinicSlug || members.length === 0) return members;
    return members.map((member) => {
      // Check if memberId already contains clinic identifier (clinic-{id} format)
      // If it does, extract and use clinic name for display
      if (member.memberId.includes("@clinic-")) {
        // Extract role and reconstruct with clinic name
        const roleToLabel: Record<string, string> = {
          owner: "owner1",
          manager: "manager1",
          member: "member1",
          소유자: "owner1",
          관리자: "manager1",
          직원: "member1",
        };
        const roleLabel =
          roleToLabel[member.role.toLowerCase()] || member.role.toLowerCase();
        const newMemberId = `${roleLabel}@${clinicSlug}`;
        return {
          ...member,
          memberId: newMemberId,
        };
      }
      // If memberId already uses clinic name format, use as is
      return member;
    });
  }, [members, clinicSlug]);

  const handleCopyMemberId = async (memberId: string) => {
    try {
      await navigator.clipboard.writeText(memberId);
      setCopiedMemberId(memberId);
      setTimeout(() => {
        setCopiedMemberId(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy member ID", err);
    }
  };

  const togglePasswordVisibility = (memberId: string) => {
    setVisiblePasswords((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const ownerFields = useMemo(
    () => [
      { label: "성함", value: owner?.ownerName ?? "-" },
      { label: "핸드폰", value: owner?.ownerPhoneNumber ?? "-" },
      { label: "신분증번호", value: owner?.ownerIdCardNumber ?? "-" },
      { label: "거주주소", value: owner?.ownerAddress ?? "-" },
    ],
    [owner]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 md:px-10">
        <div className="mx-auto flex max-w-5xl justify-center">
          <p className="text-sm text-slate-500">정보를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (missingData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="text-center space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
            가입이 완료되었습니다
          </h1>
          <p className="text-sm text-slate-500 md:text-base">
            등록하신 클리닉과 계정 정보를 확인해주세요.
          </p>
        </header>

        <nav className="mx-auto flex w-full max-w-2xl items-center justify-between text-sm text-slate-400">
          {STEP_ITEMS.map(({ step, label }) => (
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
                  step === 4 ? "text-indigo-500 font-medium" : ""
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </nav>

        <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)] p-6 md:p-10">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-900">
                병의원 인증
              </h2>
              
            </div>
            <dl className="mt-6 grid gap-4 text-sm text-slate-700 md:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  명칭
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.name ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  종류
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.category ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  소재지
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.location ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  진료과목
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.medicalSubjects ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  성명
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinicFromApi?.doctor_name ?? clinic?.description ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  면허종류
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.licenseType ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  면허번호
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.licenseNumber ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  문서발급번호
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {clinic?.documentIssueNumber ?? "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)] p-6 md:p-10">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-900">
                원장 개인 정보
              </h2>
              <button
                type="button"
                onClick={() => {
                  // Store clinic ID for edit mode (from API or sessionStorage)
                  const clinicId = clinicFromApi?.id || clinic?.id;
                  if (clinicId) {
                    sessionStorage.setItem(
                      "erp_editing_clinic_id",
                      clinicId
                    );
                  }
                  router.push("/clinic/register/member");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-500"
              >
                수정
              </button>
            </div>
            <dl className="mt-6 grid gap-4 text-sm text-slate-700 md:grid-cols-2">
              {ownerFields.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase text-slate-400">
                    {label}
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)] p-6 md:p-10">
            <div className="flex items-start justify-between gap-4 flex-col">
              <h2 className="text-xl font-semibold text-slate-900">
                계정 정보
              </h2>
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h3 className="text-sm font-medium text-slate-900">
                  아이디가 생성 되었으니 아래 아이디와 설정하신 비번으로 로그인 하세요
                </h3>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {displayMembers.length > 0 ? (
                displayMembers.map((member) => {
                  const isOwner = member.role === "owner" || member.role === "owner1" || member.role === "소유자";
                  return (
                  <div
                    key={member.memberId}
                    className={`rounded-2xl border-2 bg-slate-50/60 px-5 py-4 shadow-sm ${
                      isOwner 
                        ? "border-yellow-400" 
                        : "border-slate-100"
                    }`}
                  >
                    <div className="flex flex-col gap-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-xs font-semibold uppercase text-indigo-500">
                          {roleLabel(member.role)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {member.memberId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyMemberId(member.memberId)}
                            className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            aria-label="복사"
                            title="복사"
                          >
                            {copiedMemberId === member.memberId ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 md:items-end">
                        <span className="text-xs font-semibold uppercase text-slate-400">
                          비밀번호
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 font-mono">
                            {visiblePasswords.has(member.memberId)
                              ? member.password || ""
                              : "•".repeat(member.password?.length || 0)}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(member.memberId)}
                            className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            aria-label={
                              visiblePasswords.has(member.memberId)
                                ? "비밀번호 숨기기"
                                : "비밀번호 보기"
                            }
                            title={
                              visiblePasswords.has(member.memberId)
                                ? "비밀번호 숨기기"
                                : "비밀번호 보기"
                            }
                          >
                            {visiblePasswords.has(member.memberId) ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
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
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
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
                  </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">
                  생성된 계정 정보를 불러오지 못했습니다.
                </p>
              )}
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-4xl justify-end">
          <button
            type="button"
            onClick={() => {
              setShowCompletionModal(true);
            }}
            className="rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            완료
          </button>
        </footer>
      </div>

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowCompletionModal(false)}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Modal Content */}
            <div className="p-6">
              <h2 className="mb-2 text-xl font-bold text-slate-900">
                가입이 완료되었습니다.
              </h2>
              <p className="mb-6 text-sm font-semibold text-slate-900">
                생성된 아이디와 설정하신 비번을 이용하여 로그인 하세요
              </p>

              {/* Confirmation Button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompletionModal(false);
                    router.push("/login");
                  }}
                  className="rounded-xl bg-gradient-to-r from-blue-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
