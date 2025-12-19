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
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    []
  );

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { apiGet } = await import("../../../lib/api");
        const { getTenantId } = await import("../../../lib/api");
        const tenantId = getTenantId();

        // Fetch clinic data
        const clinicsData = await apiGet<Clinic[]>(
          `${apiUrl}/iam/members/clinics${tenantId ? `?tenantId=${tenantId}` : ""}`
        );
        if (clinicsData && clinicsData.length > 0) {
          setClinic(clinicsData[0]);
        }

        // Fetch members data
        const membersData = await apiGet<Member[]>(
          `${apiUrl}/iam/members${tenantId ? `?tenantId=${tenantId}` : ""}`
        );
        if (membersData) {
          setMembers(membersData);
        }
      } catch (err) {
        console.error("Failed to load account data", err);
        setError("계정 정보를 불러오지 못했습니다.");
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
    setCurrentPassword("");
  };

  const handlePasswordSave = async (member: Member) => {
    if (newPassword !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 6) {
      alert("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (!currentPassword) {
      alert("현재 비밀번호를 입력해주세요.");
      return;
    }

    try {
      const { apiPost } = await import("../../../lib/api");
      await apiPost(`${apiUrl}/iam/members/change-password`, {
        memberId: member.member_id, // Use member_id (string) not id (UUID)
        currentPassword,
        newPassword,
      });
      alert("비밀번호가 성공적으로 변경되었습니다.");
      setEditingPassword(null);
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
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
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="현재 비밀번호"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="새 비밀번호"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="비밀번호 확인"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePasswordSave(member)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-600"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(null);
                            setCurrentPassword("");
                            setNewPassword("");
                            setConfirmPassword("");
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
                  {editingPassword !== member.id && (
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
