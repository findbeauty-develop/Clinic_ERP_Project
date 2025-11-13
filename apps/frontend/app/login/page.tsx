"use client";

import { FormEvent, useMemo, useState } from "react";

export default function LoginPage() {
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

      window.alert("You Logined Successfuly");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "ID or Password is incorrect"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClinicSignup = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/clinic/register";
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
                autoComplete="username"
                placeholder="예: manager1@SeoulMedicalCenter"
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
                autoComplete="current-password"
                placeholder="••••••••"
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
              <button
                type="button"
                onClick={handleClinicSignup}
                className="w-full rounded-2xl border border-indigo-300 bg-white px-5 py-4 text-base font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                클리닉 가입
              </button>
            </div>
          </form>

          <p className="text-center text-sm text-gray-500">
            비밀번호를 잊으셨다면 오너에게 문의하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

