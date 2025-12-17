"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "", []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberId.trim() || !password.trim()) {
      window.alert("Please enter both ID and password.");
      return;
    }
    if (!apiUrl) {
      window.alert("API base URL is not configured.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/iam/members/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, password }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          typeof errorBody?.message === "string"
            ? errorBody.message
            : "ID or Password is incorrect";
        throw new Error(message);
      }

      const result = await response.json();

      if (typeof window !== "undefined") {
        if (result.token) {
          localStorage.setItem("erp_access_token", result.token);
        }
        if (result.member) {
          localStorage.setItem("erp_member_data", JSON.stringify(result.member));
          localStorage.setItem("erp_tenant_id", result.member.tenant_id);
        }
      }

      // Agar mustChangePassword true bo'lsa, password change modal ochish
      if (result.member?.mustChangePassword) {
        setShowPasswordChangeModal(true);
        return; // Dashboard'ga o'tmaslik
      }

      // Redirect to dashboard after successful login
      // Use window.location.href for full page reload to update sidebar state
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "ID or Password is incorrect"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClinicSignup = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (typeof window !== "undefined") {
      // Clear all registration-related data from sessionStorage and localStorage
      // to ensure a fresh start for new clinic registration
      const keysToRemove = [
        "erp_clinic_summary",
        "erp_owner_profile",
        "erp_created_members",
        "erp_editing_clinic_id",
        "erp_selected_clinic",
        "erp_owner_info",
        "clinic_register_form", // Clear form data from localStorage
      ];

      keysToRemove.forEach((key) => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      });

      router.push("/clinic/register");
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      window.alert("모든 필드를 입력해주세요.");
      return;
    }

    if (newPassword !== confirmPassword) {
      window.alert("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    if (newPassword.length < 8) {
      window.alert("비밀번호는 최소 8자 이상이어야 합니다.");
      return;
    }

    setChangingPassword(true);
    try {
      const token = localStorage.getItem("erp_access_token");
      if (!token) {
        throw new Error("인증 토큰이 없습니다.");
      }

      const response = await fetch(`${apiUrl}/iam/members/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "비밀번호 변경에 실패했습니다.");
      }

      window.alert("비밀번호가 성공적으로 변경되었습니다.");
      setShowPasswordChangeModal(false);
      
      // Dashboard'ga o'tish
      // Use window.location.href for full page reload to update sidebar state
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error: any) {
      console.error("Password change error", error);
      window.alert(error.message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-white to-blue-100 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="rounded-[36px] bg-white/95 px-12 py-12 shadow-[0px_24px_60px_rgba(99,102,241,0.18)] backdrop-blur-xl min-h-[560px] flex flex-col justify-between space-y-10 border border-white/60">
          <div className="text-center space-y-4">
            <span className="inline-block rounded-full bg-gradient-to-r from-purple-200 to-indigo-200 px-5 py-2 text-sm font-semibold text-gray-700 shadow-sm">
              뷰티재고
            </span>
            <h1 className="text-4xl font-semibold text-gray-900 tracking-tight">
              로그인
            </h1>
            <p className="text-base text-gray-500">
              클리닉 계정으로 재고 관리를 시작하세요.
            </p>
          </div>

          <form className="space-y-8 flex-1" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="memberId"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                ID
              </label>
              <input
                id="memberId"
                name="memberId"
                type="text"
                autoComplete="new-member-id"
                placeholder="아이디를 입력하세요"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-base text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-base text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 px-5 py-4 text-base font-semibold text-white shadow-lg transition hover:from-purple-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </form>
          
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleClinicSignup}
              className="w-full rounded-2xl border border-indigo-300 bg-white px-5 py-4 text-base font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              클리닉 가입
            </button>
          </div>

          <p className="text-center text-sm text-gray-500">
            비밀번호를 잊으셨다면 오너에게 문의하세요.
          </p>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                비밀번호 변경
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                보안을 위해 비밀번호를 변경해주세요.
              </p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="현재 비밀번호 입력"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="새 비밀번호 입력 (최소 8자)"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="새 비밀번호 다시 입력"
                  required
                  minLength={8}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-purple-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {changingPassword ? "변경 중..." : "변경"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

