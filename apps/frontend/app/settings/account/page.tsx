"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  doctor_name?: string | null;
  phone_number?: string | null;
  open_date?: string | null;
  logo_url?: string | null;
};

type Member = {
  id: string;
  member_id: string;
  role: string;
  full_name?: string | null;
  phone_number?: string | null;
  id_card_number?: string | null;
  address?: string | null;
  clinic_name?: string | null;
};

export default function AccountManagementPage() {
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerificationCodeSent, setIsVerificationCodeSent] = useState(false);
  const [isVerificationCodeVerified, setIsVerificationCodeVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { apiGet, getMemberData } = await import("../../../lib/api");
        const { getTenantId } = await import("../../../lib/api");
        const tenantId = getTenantId();

        // ✅ Current user'ning role'ni olish
        const memberData = getMemberData();
        if (memberData?.role) {
          setCurrentUserRole(memberData.role);
        }

        // ✅ Owner emas bo'lsa, access'ni rad etish
        if (memberData?.role !== "owner") {
          setError("이 페이지는 원장만 접근할 수 있습니다.");
          setLoading(false);
          return;
        }

        // Fetch clinic data
        const clinicsData = await apiGet<Clinic[]>(
          `${apiUrl}/iam/members/clinics${tenantId ? `?tenantId=${tenantId}` : ""}`
        );
        if (clinicsData && clinicsData.length > 0) {
          setClinic(clinicsData[0]);
          // Set logo preview if logo_url exists
          if (clinicsData[0].logo_url) {
            setLogoUrl(clinicsData[0].logo_url);
            setLogoPreview(`${apiUrl}${clinicsData[0].logo_url}`);
          }
        }

        // Fetch members data
        const membersData = await apiGet<Member[]>(
          `${apiUrl}/iam/members${tenantId ? `?tenantId=${tenantId}` : ""}`
        );
        if (membersData) {
          setMembers(membersData);
        }
      } catch (err: any) {
        console.error("Failed to load account data", err);
        if (err?.response?.status === 403 || err?.status === 403) {
          setError("이 페이지는 원장만 접근할 수 있습니다.");
        } else {
          setError("계정 정보를 불러오지 못했습니다.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiUrl]);

  const handlePasswordEdit = (memberId: string) => {
    setEditingPassword(memberId);
    setNewPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setIsVerificationCodeSent(false);
    setIsVerificationCodeVerified(false);
  };

  const handleSendVerificationCode = async (phoneNumber: string) => {
    if (!phoneNumber) {
      alert("전화번호가 없습니다.");
      return;
    }

    setIsSendingCode(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/iam/members/send-phone-verification`, {
        phone_number: phoneNumber,
      });
      setIsVerificationCodeSent(true);
      alert("인증번호가 전송되었습니다.");
    } catch (err: any) {
      console.error("Failed to send verification code", err);
      alert(err?.message || "인증번호 전송에 실패했습니다.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async (phoneNumber: string, code: string) => {
    if (!code || code.length !== 6) {
      alert("6자리 인증번호를 입력해주세요.");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/iam/members/verify-phone-code`, {
        phone_number: phoneNumber,
        code: code,
      });
      setIsVerificationCodeVerified(true);
      alert("인증이 완료되었습니다.");
    } catch (err: any) {
      console.error("Failed to verify code", err);
      alert(err?.message || "인증번호가 올바르지 않습니다.");
      setIsVerificationCodeVerified(false);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handlePasswordSave = async (member: Member) => {
    if (!isVerificationCodeVerified) {
      alert("핸드폰 인증을 완료해주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 6) {
      alert("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/iam/members/change-password`, {
        memberId: member.member_id, // Use member_id (string) not id (UUID)
        newPassword,
        // ✅ currentPassword yo'q - phone verification bilan
      });
      alert("비밀번호가 성공적으로 변경되었습니다.");
      setEditingPassword(null);
      setNewPassword("");
      setConfirmPassword("");
      setVerificationCode("");
      setIsVerificationCodeSent(false);
      setIsVerificationCodeVerified(false);
    } catch (err: any) {
      console.error("Failed to change password", err);
      alert(err?.message || "비밀번호 변경에 실패했습니다.");
    }
  };

  const maskPassword = (password: string) => {
    return "•".repeat(password.length || 8);
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      owner: "원장",
      manager: "관리자",
      member: "직원",
    };
    return roleMap[role] || role;
  };

  const getRoleNumber = (role: string, members: Member[]) => {
    const sameRole = members.filter((m) => m.role === role);
    const index = sameRole.findIndex(
      (m) => m.member_id === members.find((mem) => mem.role === role)?.member_id
    );
    return sameRole.length > 1 ? index + 1 : "";
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // File validation
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert(`지원하지 않는 파일 형식입니다. 허용된 형식: ${validTypes.join(", ")}`);
      event.target.value = "";
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert(`파일 크기가 너무 큽니다. 최대 크기: 5MB`);
      event.target.value = "";
      return;
    }

    // Preview yaratish
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload qilish
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      console.log("Uploading file:", {
        name: file.name,
        type: file.type,
        size: file.size,
      });

      const { getAccessToken, getTenantId, apiPut, clearCache } = await import("../../../lib/api");
      const token = await getAccessToken();
      const tenantId = getTenantId();

      if (!token) {
        throw new Error("인증이 필요합니다.");
      }

      // Upload file - FormData uchun Content-Type header'ni o'chirish kerak
      const uploadUrl = `${apiUrl}/iam/members/clinics/upload-logo${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
          // Content-Type ni qo'shmaslik - browser avtomatik qo'shadi FormData uchun
        },
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        let errorMessage = "로고 업로드에 실패했습니다.";
        try {
          const errorData = await uploadResponse.json();
          errorMessage = errorData?.message || errorData?.error || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
          console.error("Upload error details:", {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorData,
          });
        } catch (e) {
          const errorText = await uploadResponse.text().catch(() => "");
          console.error("Upload error (non-JSON):", {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorText,
          });
          errorMessage = `HTTP ${uploadResponse.status}: ${uploadResponse.statusText || "Unknown error"}`;
        }
        throw new Error(errorMessage);
      }

      const uploadResult = await uploadResponse.json();
      console.log("Upload result:", uploadResult);

      // Database'ga saqlash
      const updateUrl = `${apiUrl}/iam/members/clinics/logo${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`;
      
      console.log("Updating logo URL:", updateUrl, { logoUrl: uploadResult.url });
      
      try {
        await apiPut(updateUrl, {
          logoUrl: uploadResult.url,
        });
      } catch (updateError: any) {
      console.error("Logo URL update error - Full details:", {
    error: updateError,
    message: updateError?.message,
    response: updateError?.response,
    status: updateError?.response?.status,
    statusText: updateError?.response?.statusText,
    data: updateError?.response?.data,
    body: updateError?.body,
  });
  
  // ✅ Error response'ni to'liq ko'rsatish
  let errorMessage = "로고 업로드되었지만 데이터베이스 업데이트에 실패했습니다.";
  if (updateError?.response?.data) {
    const errorData = updateError.response.data;
    if (Array.isArray(errorData.message)) {
      // Validation error - array of messages
      errorMessage = `Validation error: ${errorData.message.join(", ")}`;
    } else if (typeof errorData.message === "string") {
      errorMessage = errorData.message;
    }
  } else if (updateError?.message) {
    errorMessage = updateError.message;
  }
  
  alert(errorMessage);
  throw updateError;
      }

      setLogoUrl(uploadResult.url);
      const fullUrl = `${apiUrl}${uploadResult.url}`;
      setLogoPreview(fullUrl);

      // Clinic state'ni yangilash
      if (clinic) {
        setClinic({ ...clinic, logo_url: uploadResult.url });
      }

      // Cache'ni tozalash va sidebar'ni yangilash uchun event yuborish
      clearCache("/iam/members/clinics");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("clinicLogoUpdated", { detail: { logoUrl: uploadResult.url } }));
      }

      alert("로고가 성공적으로 업로드되었습니다.");
    } catch (error: any) {
      console.error("Logo upload error:", error);
      alert(error?.message || "로고 업로드에 실패했습니다.");
      setLogoPreview("");
    } finally {
      setUploadingLogo(false);
      // Reset file input
      event.target.value = "";
    }
  };

  if (loading) {
    return (
      <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            불러오는 중...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  const director = members.find((m) => m.role === "owner");

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-8xl flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              계정 관리
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              병의원 정보, 원장 정보 및 계정 정보를 관리할 수 있습니다.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            돌아가기
          </Link>
        </header>

         {/* 병의원 로고 Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">
            병의원 로고
          </h2>

          <div className="flex flex-col items-center gap-4">
            {/* Logo Preview */}
            <div className="relative">
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-slate-50 shadow-sm">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Clinic Logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Upload Button */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="hidden"
              />
              <div className="flex items-center gap-2 rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                {uploadingLogo ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
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
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    업로드 중...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    로고 업로드
                  </>
                )}
              </div>
            </label>
            <p className="text-xs text-slate-500">
              JPG, PNG 또는 WEBP 형식 (최대 5MB)
            </p>
          </div>
        </section>

        {/* 병의원 정보 Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">
            병의원 정보
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                명칭
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.name || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                종류
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.category || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                소재지
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.location || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                진료과목
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.medical_subjects || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                설명(법인명)
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.doctor_name || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                면허종류
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.license_type || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                면허번호
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.license_number || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                문서발급번호
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {clinic?.document_issue_number || "—"}
              </div>
            </div>
          </div>
        </section>

       

        {/* 원장 개인 정보 Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">
            원장 개인 정보
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                성함
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {director?.full_name || clinic?.doctor_name || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                신분증번호
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {director?.id_card_number || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                핸드폰
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {director?.phone_number || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                거주주소
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {director?.address || "—"}
              </div>
            </div>
          </div>
        </section>

        {/* 계정 정보 Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">
            계정 정보
          </h2>
          <div className="space-y-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 md:grid-cols-[1fr_1fr_auto]"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {getRoleLabel(member.role)}
                    {getRoleNumber(member.role, members)} ID
                  </label>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {member.member_id}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    비밀번호
                  </label>
                  {editingPassword === member.id ? (
                    <div className="space-y-2">
                      {/* Owner phone number (read-only) */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={director?.phone_number || ""}
                          readOnly
                          className="h-9 flex-1 rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          placeholder="핸드폰 번호"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendVerificationCode(director?.phone_number || "")}
                          disabled={isSendingCode || !director?.phone_number || isVerificationCodeVerified}
                          className="h-9 rounded-lg bg-indigo-500 px-3 text-xs font-medium text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSendingCode ? "전송 중..." : "인증번호 전송"}
                        </button>
                      </div>
                      {/* Verification code input */}
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => {
                          const code = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                          setVerificationCode(code);
                          // Auto-verify when 6 digits entered
                          if (code.length === 6 && director?.phone_number) {
                            handleVerifyCode(director.phone_number, code);
                          }
                        }}
                        placeholder="핸드폰 인증번호"
                        maxLength={6}
                        disabled={!isVerificationCodeSent || isVerificationCodeVerified}
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      {isVerificationCodeVerified && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ 인증이 완료되었습니다.
                        </p>
                      )}
                      {/* New password */}
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="새 비밀번호"
                        disabled={!isVerificationCodeVerified}
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      {/* Confirm password */}
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="비밀번호 확인"
                        disabled={!isVerificationCodeVerified}
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePasswordSave(member)}
                          disabled={!isVerificationCodeVerified}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(null);
                            setNewPassword("");
                            setConfirmPassword("");
                            setVerificationCode("");
                            setIsVerificationCodeSent(false);
                            setIsVerificationCodeVerified(false);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {maskPassword("password")}
                    </div>
                  )}
                </div>
                <div className="flex items-end">
                  {editingPassword !== member.id && currentUserRole === "owner" && (
                    <button
                      onClick={() => handlePasswordEdit(member.id)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                      비번수정
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
