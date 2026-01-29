"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { apiGet, getTenantId, getMemberData } from "../../lib/api";
import { Settings } from "lucide-react";

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
    href: "/inventory",
    label: "재고 현황",
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
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
    ),
  },
  {
    href: "/inbound",
    label: "입고 관리",
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
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
    ),
  },
  {
    href: "/outbound",
    label: "제품 출고",
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
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
    ),
  },
  {
    href: "/returns",
    label: "반납 관리",
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
    href: "/order-returns",
    label: "반품",
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
          d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
        />
      </svg>
    ),
  },
  {
    href: "/order",
    label: "주문 관리",
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
  // {
  //   label: "CSV 입고",
  //   isDropdown: true,
  //   icon: (
  //     <svg
  //       xmlns="http://www.w3.org/2000/svg"
  //       fill="none"
  //       viewBox="0 0 24 24"
  //       strokeWidth={1.5}
  //       stroke="currentColor"
  //       className="h-5 w-5"
  //     >
  //       <path
  //         strokeLinecap="round"
  //         strokeLinejoin="round"
  //         d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
  //       />
  //     </svg>
  //   ),
  //   children: [
  //     {
  //       href: "/inventory/products/pricing",
  //       label: "제품 가격 관리",
  //       icon: (
  //         <svg
  //           xmlns="http://www.w3.org/2000/svg"
  //           fill="none"
  //           viewBox="0 0 24 24"
  //           strokeWidth={1.5}
  //           stroke="currentColor"
  //           className="h-4 w-4"
  //         >
  //           <path
  //             strokeLinecap="round"
  //             strokeLinejoin="round"
  //             d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  //           />
  //         </svg>
  //       ),
  //     },
     
  //   ],
  // },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false); // hydration-safe flag
  const [userName, setUserName] = useState<string>("");
  const [clinicName, setClinicName] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
  const [clinicLogo, setClinicLogo] = useState<string>("");
  const loadUserInfo = useCallback(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (!memberData) {
      setUserName("");
      setClinicName("");
      setRole("");
      return;
    }

    try {
      const member = JSON.parse(memberData);
      setUserName(member.full_name || member.member_id || "Foydalanuvchi");
      setClinicName(member.clinic_name || "");
      // ✅ Role'ni member data'dan olish
      if (member.role) {
        setRole(member.role);
      }
    } catch (error) {
      console.error("Error parsing member data:", error);
      setUserName("");
      setClinicName("");
      setRole("");
    }
  }, []);

   const loadClinicAndRole = useCallback(async () => {
    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        return;
      }

      // Clinic name'ni API'dan olish - apiGet body'ni avtomatik o'qiydi
      try {
        const clinics = await apiGet<any[]>(
          `/iam/members/clinics?tenantId=${encodeURIComponent(tenantId)}`
        );
        
        if (clinics && clinics.length > 0) {
          // Birinchi clinic'ni olish (tenant_id bo'yicha faqat bitta clinic bo'lishi kerak)
          setClinicName(clinics[0].name || "");
        }
      } catch (error) {
        console.error("Error fetching clinic name:", error);
      }

      // Member role'ni localStorage'dan yoki member data'dan olish
      const memberData = getMemberData();
      if (memberData) {
        // Role'ni member data'dan olish
        if (memberData.role) {
          setRole(memberData.role);
        }
        
        // User name'ni ham olish
        setUserName(memberData.full_name || memberData.member_id || "Foydalanuvchi");
      }
    } catch (error) {
      console.error("Error loading clinic and role:", error);
    }
  }, []);


  useEffect(() => {
    setMounted(true);
    loadUserInfo();
    
    // ✅ Clinic name va role'ni API'dan yuklash
    loadClinicAndRole();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "erp_member_data") {
        loadUserInfo();
        loadClinicAndRole(); // ✅ Storage o'zgarganda qayta yuklash
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadUserInfo, loadClinicAndRole]);

  const handleLogout = () => {
    // client-only
    setUserName("");
    setClinicName("");
    setRole("");
    localStorage.removeItem("erp_access_token");
    localStorage.removeItem("erp_member_data");
    localStorage.removeItem("erp_tenant_id");
    router.push("/login");
  };

  const toggleDropdown = (label: string) => {
    setOpenDropdowns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-80 flex-col bg-[#fcfcfc] px-6 py-8 text-black">
      {/* Logo & Clinic Info Section */}
      <div className="flex flex-col items-center gap-4 border-b border-slate-200 pb-6">
        {/* Logo Display Area */}
        <div className="relative">
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden border-2 border-gray-200 rounded-full bg-[#fcfcfc] shadow-full">
            <img
              src="/images/white-question-mark.svg"
              alt="Clinic Logo"
              cursor-pointer
              aria-label="Message to owner"
              onClick={() => alert("Message to owner")}
              
              className="h-24 w-24 object-contain bg-[#fcfcfc]"
            />
          </div>
        </div>

        {/* Clinic Name & Manager Info */}
        <div className="text-center">
          <h2 className="mb-1 text-xl font-bold text-slate-900">
            {clinicName || "뷰티재고"}
          </h2>

          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <p className="text-sm font-medium text-slate-700">
              {role ? role.charAt(0).toUpperCase() + role.slice(1) : "관리자"}
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-10 flex-1 space-y-1 overflow-y-auto pr-2">
        {navItems.map((item: any) => {
          if ('isDropdown' in item && item.isDropdown && Array.isArray(item.children)) {
            const isOpen = openDropdowns.has(item.label);
            const isAnyChildActive = item.children.some(
              (child: any) => pathname === child.href
            );

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleDropdown(item.label)}
                  className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                    isAnyChildActive
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 ${
                      isAnyChildActive ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {item.icon}
                  </span>

                  <span className="flex-1 text-left font-medium">
                    {item.label}
                  </span>

                  <svg
                    className={`h-4 w-4 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    } ${isAnyChildActive ? "text-white" : "text-slate-700"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isOpen && (
                  <div className="mt-1 space-y-1">
                    {item.children.map((child: any) => {
                      const isChildActive = pathname === child.href;

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-3 rounded-lg py-2.5 pl-12 pr-4 text-sm transition-all ${
                            isChildActive
                              ? "bg-indigo-600 text-white"
                              : "text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <span
                            className={`flex-shrink-0 ${
                              isChildActive ? "text-white" : "text-slate-700"
                            }`}
                          >
                            {child.icon}
                          </span>
                          <span className="font-medium">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href || item.label}
              href={item.href || "#"}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-900 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span
                className={`flex-shrink-0 ${
                  isActive ? "text-white" : "text-slate-700"
                }`}
              >
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User card - hydration-safe */}
      <div className="mt-6 space-y-3 border-t border-slate-200 pt-6">
        {/* {mounted && userName ? (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full rounded-lg bg-slate-100 px-4 py-3 text-left transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-semibold text-white">
                {userName.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {userName}
                </p>
                {clinicName && (
                  <p className="truncate text-xs text-slate-600">
                    {clinicName}
                  </p>
                )}
              </div>
            </div>
          </button>
        ) : (
          <div className="rounded-lg bg-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-300" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-300" />
                <div className="h-2 w-32 animate-pulse rounded bg-slate-300" />
              </div>
            </div>
          </div>
        )} */}
{/* Bottom Settings Button (like the screenshot) */}
<div className="">
  <button
    onClick={() => setShowSettingsModal(true)}
    className="flex w-full items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm transition hover:bg-slate-50"
  >
    {/* Gear icon */}
   <Settings className="h-5 w-5 text-slate-500" />
<span className="text-sm font-medium">설정</span>
  </button>
</div>

        {/* Settings Modal */}
        {showSettingsModal && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setShowSettingsModal(false)}
            />

            {/* Modal - positioned relative to sidebar */}
            <div className="absolute bottom-20 left-full z-50 ml-2 w-72 rounded-xl bg-white shadow-2xl">
              <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    설정 및 서포트
                  </h2>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {/* Menu Items */}
                <div className="px-3 py-3">
                  <nav className="space-y-1">
                    {[
                      { label: "계정 관리", href: "/settings/account" },
                      { label: "공급업체 정보", href: "/settings/supplier" },
                      { label: "제품 가격 관리", href: "/settings/csvprice" },
                      { label: "창고위치 관리", href: "/settings/warehouse" },
                      { label: "알림 설정", href: "/settings/notifications" },
                      { label: "고객센터", href: "/settings/support" },
                    ].map((mi) => (
                      <Link
                        key={mi.href}
                        href={mi.href}
                        onClick={() => setShowSettingsModal(false)}
                        className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                      >
                        <span>{mi.label}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="h-4 w-4 text-slate-500"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </Link>
                    ))}
                  </nav>
                </div>

                {/* Logout Button */}
                <div className="border-t border-slate-200 px-3 py-3">
                <button
  onClick={() => {
    setShowSettingsModal(false);
    handleLogout();
  }}
  className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="h-4 w-4 text-white"
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
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
