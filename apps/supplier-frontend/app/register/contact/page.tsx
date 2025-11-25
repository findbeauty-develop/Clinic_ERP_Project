"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ContactInfoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
          <h1 className="mb-4 text-2xl font-bold text-slate-900">
            담당자 정보 입력
          </h1>
          <p className="text-slate-600">이 페이지는 곧 구현될 예정입니다.</p>
          <button
            onClick={() => router.back()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            뒤로 가기
          </button>
        </div>
      </div>
    </div>
  );
}

