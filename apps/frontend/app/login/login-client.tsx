"use client";

import { FormEvent, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiUrl } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // ✅ Double request'ni oldini olish uchun ref
  const isSubmittingRef = useRef(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const apiUrl = useMemo(() => getApiUrl(), []);

  const next = searchParams.get("next") || "/dashboard";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // ✅ Double request'ni oldini olish
    if (isSubmittingRef.current || loading) {
      console.warn("[Login] Request already in progress, ignoring duplicate submit");
      return;
    }

    if (!memberId.trim() || !password.trim()) {
      window.alert("Please enter both ID and password.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    
    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[Login] Starting login request: ${requestId}`);
      
      const response = await fetch(`${apiUrl}/iam/members/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ Cookie'ni yuborish (refresh token)
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
      console.log(`[Login] ✅ Login successful: ${requestId}`);

      // ✅ Token'ni memory'da saqlash (localStorage emas)
      if (typeof window !== "undefined") {
        // Import setAccessToken va setMemberData
        const { setAccessToken, setMemberData } = await import("../../lib/api");

        if (result.access_token) {
          // ✅ Access token'ni memory'da saqlash (expires_in bilan)
          setAccessToken(result.access_token, result.expires_in);
        }

        if (result.member) {
          // ✅ Member data'ni memory'da saqlash
          setMemberData(result.member);
        }
      }

      // Agar mustChangePassword true bo'lsa, password change modal ochish
      if (result.member?.mustChangePassword) {
        setShowPasswordChangeModal(true);
        isSubmittingRef.current = false; // ✅ Reset qilish
        return; // Dashboard'ga o'tmaslik
      }

      // Redirect to dashboard after successful login
      // Use window.location.href for full page reload to update sidebar state
      if (typeof window !== "undefined") {
        window.location.href = next; // "/dashboard" yoki ?next=... bo'lsa o'sha
      }
    } catch (error) {
      console.error(`[Login] ❌ Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      window.alert(
        error instanceof Error ? error.message : "ID or Password is incorrect"
      );
    } finally {
      setLoading(false);
      isSubmittingRef.current = false; // ✅ Reset qilish
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

      // ✅ window.location.href ishlatish - to'liq page reload (root page redirect'ini oldini olish uchun)
      window.location.href = "/clinic/register";
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
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const { getAccessToken } = await import("../../lib/api");
      const token = await getAccessToken();
      if (!token) {
        throw new Error("인증 토큰이 없습니다.");
      }

      const response = await fetch(
        `${apiUrl}/iam/members/change-password-first-login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include", // ✅ Cookie'ni yuborish
          body: JSON.stringify({
            currentPassword,
            newPassword,
            // ✅ memberId yo'q - token'dan olinadi
          }),
        }
      );

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
    <div className="min-h-screen bg-[#f5fbff] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="rounded-[36px] bg-white/95 px-12 py-12 shadow-[0px_24px_60px_rgba(99,102,241,0.18)] backdrop-blur-xl min-h-[560px] flex flex-col justify-between space-y-10 border border-white/60">
          <div className="text-center">
            <div className="mx-auto flex h-52 w-52 items-center justify-center ">
              <img
                src="/images/JaclitName.svg"
                alt="Jaclit Logo"
                className="h-full w-full object-contain "
              />
            </div>

            <p className="text-base mt-[-30px] text-gray-500">
              우리 병원 재고 관리를 쉽고 간편하게!
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
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 pr-12 text-base text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 표시"
                  }
                >
                  {showPassword ? (
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

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-[#2f66d9] to-[#3f8f98] px-5 py-4 text-base font-semibold text-white shadow-lg transition hover:from-[#285bc2] hover:to-[#378086] focus:outline-none focus:ring-2 focus:ring-[#2f66d9]/30 disabled:cursor-not-allowed disabled:opacity-70"
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
        <div className="fixed inset-0 z-510 flex items-center justify-center bg-black/50 p-4">
          <div className="relative ml-[-60px] mr-[-60px]  w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ml-64">
            <button
              type="button"
              onClick={() => setShowPasswordChangeModal(false)}
              className="absolute right-4 top-4 text-gray-400 transition hover:text-gray-600"
              aria-label="닫기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
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
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder="현재 비밀번호 입력"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 focus:outline-none"
                    aria-label={
                      showCurrentPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                    }
                  >
                    {showCurrentPassword ? (
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

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder="새 비밀번호 입력 (최소 8자)"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 focus:outline-none"
                    aria-label={
                      showNewPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                    }
                  >
                    {showNewPassword ? (
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

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  새 비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder="새 비밀번호 다시 입력"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 focus:outline-none"
                    aria-label={
                      showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                    }
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
