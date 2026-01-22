"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/api";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // ✅ Root page (`/`) faqat root path uchun ishlaydi
      // Token'ni tekshirish
      const token = await getAccessToken();
      
      if (token) {
        // Token mavjud - dashboard'ga redirect
        router.replace("/dashboard");
      } else {
        // Token yo'q - login'ga redirect
        // Login va register page'lar to'g'ridan-to'g'ri URL'ga kirganda root page ishlamaydi
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
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}