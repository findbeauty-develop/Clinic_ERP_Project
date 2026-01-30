"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMemberData } from "@/lib/api";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndRedirect = () => {
      // ✅ Root page (`/`) - member data'ni tekshirish (refresh qilmaydi)
      // getMemberData() faqat localStorage'dan o'qiydi, API so'rov yubormaydi
      const memberData = getMemberData();

      if (memberData) {
        // ✅ Member data mavjud - dashboard'ga redirect
        // Dashboard page ochilganda u o'zining API so'rovlarida token refresh qiladi
        router.replace("/dashboard");
      } else {
        // ✅ Member data yo'q - login'ga redirect
        router.replace("/login");
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  // Loading state (qisqa vaqt)
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-500 border-r-transparent"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">로딩중...</p>
      </div>
    </div>
  );
}
