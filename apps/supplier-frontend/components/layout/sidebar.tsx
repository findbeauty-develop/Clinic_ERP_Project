"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  {
    href: "/",
    label: "대시보드",
    icon: (
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
          d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },
  {
    href: "/returns",
    label: "반납",
    icon: (
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
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    ),
  },
  {
    href: "/orders",
    label: "주문",
    icon: (
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
          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
        />
      </svg>
    ),
  },
  {
    href: "/exchanges",
    label: "반품 및 교환",
    icon: (
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
          d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
        />
      </svg>
    ),
  },
  {
    href: "/payment",
    label: "결제",
    icon: (
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
          d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
        />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('.sidebar-container') && !target.closest('.hamburger-button')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Get user info from localStorage
  const [userInfo, setUserInfo] = useState<{ managerId?: string; name?: string; companyName?: string }>({});
  
  // Load user info from localStorage
  const loadUserInfo = () => {
    if (typeof window !== 'undefined') {
      const managerData = localStorage.getItem('supplier_manager_data');
      if (managerData) {
        try {
          const data = JSON.parse(managerData);
          setUserInfo({
            managerId: data.manager_id || '',
            name: data.name || '',
            companyName: data.company_name || '',
          });
        } catch (e) {
          console.error('Failed to parse user data', e);
          setUserInfo({});
        }
      } else {
        setUserInfo({});
      }
    }
  };
  
  useEffect(() => {
    loadUserInfo();
    
    // Listen for storage changes (e.g., login/logout in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'supplier_manager_data') {
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
      setUserInfo({});
      
      // Barcha localStorage ma'lumotlarini tozalash
      localStorage.removeItem("supplier_access_token");
      localStorage.removeItem("supplier_manager_data");
      
      // Login sahifasiga yo'naltirish
      router.push("/login");
    }
  };

  // Get initials for avatar
  const getInitials = () => {
    if (userInfo.name) {
      return userInfo.name.charAt(0).toUpperCase();
    }
    if (userInfo.managerId) {
      return userInfo.managerId.charAt(0).toUpperCase();
    }
    return 'S';
  };

  // Sidebar is now visible on all pages

  return (
    <>
      {/* Hamburger Button - Only visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hamburger-button fixed top-4 left-4 z-50 rounded-lg bg-white p-2 shadow-lg"
          aria-label="Toggle menu"
        >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6 text-slate-900"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
        </button>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar-container fixed left-0 top-0 z-40 h-full w-64 transform bg-slate-100 transition-transform duration-300 ease-in-out lg:sticky lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* User Profile Section */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-4 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white backdrop-blur-sm">
                {getInitials()}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-bold text-white">
                  {userInfo.name || userInfo.managerId || 'Supplier'}
                </span>
                {userInfo.companyName && (
                  <span className="truncate text-xs text-indigo-100">
                    {userInfo.companyName}
                  </span>
                )}
                {userInfo.managerId && (
                  <span className="truncate text-xs text-indigo-200">
                    {userInfo.managerId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-300" />

          {/* Navigation Menu */}
          <nav className="flex-1 space-y-1 overflow-y-auto bg-slate-100 px-4 py-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-500 text-white shadow-lg'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="border-t border-slate-300 bg-slate-100 px-4 py-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
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
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                />
              </svg>
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

