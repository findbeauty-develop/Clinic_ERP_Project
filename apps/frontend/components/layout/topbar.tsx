"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Topbar() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Load user info from localStorage
  const loadUserInfo = () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("erp_access_token");
      const memberData = localStorage.getItem("erp_member_data");
      
      if (token && memberData) {
        setIsLoggedIn(true);
        try {
          const member = JSON.parse(memberData);
          setUserName(member.full_name || member.member_id || "");
        } catch (error) {
          console.error("Error parsing member data:", error);
          setUserName("");
          setIsLoggedIn(false);
        }
      } else {
        setUserName("");
        setIsLoggedIn(false);
      }
    }
  };

  useEffect(() => {
    loadUserInfo();
    
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'erp_member_data' || e.key === 'erp_access_token') {
        loadUserInfo();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      // State'ni darhol tozalash
      setUserName("");
      setIsLoggedIn(false);
      
      // Barcha localStorage ma'lumotlarini tozalash
      localStorage.removeItem("erp_access_token");
      localStorage.removeItem("erp_member_data");
      localStorage.removeItem("erp_tenant_id");
      
      // Login sahifasiga yo'naltirish
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-50 h-16 w-full flex-shrink-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 dark:bg-gray-900/95 dark:border-gray-800 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">뷰티재고 관리</h1>
      </div>
      <div className="flex items-center gap-4">
        {isLoggedIn && userName ? (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-semibold text-white">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {userName}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                />
              </svg>
              로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center justify-center rounded-md border border-blue-500 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            로그인
          </button>
        )}
      </div>
    </header>
  );
}

