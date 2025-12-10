// "use client";

// import Link from "next/link";
// import { usePathname, useRouter } from "next/navigation";
// import { useEffect, useState } from "react";

// const navItems = [
//   {
//     href: "/",
//     label: "대시보드",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/inventory",
//     label: "재고 현황",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/inbound",
//     label: "입고 관리",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/outbound",
//     label: "제품 출고",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
//         />
//       </svg>
//     ),
//   },
  
//   {
//     href: "/returns",
//     label: "반납 관리",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/order",
//     label: "주문 관리",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/sales",
//     label: "재고 분석",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
//         />
//       </svg>
//     ),
//   },
//   {
//     href: "/trash",
//     label: "휴지통",
//     icon: (
//       <svg
//         xmlns="http://www.w3.org/2000/svg"
//         fill="none"
//         viewBox="0 0 24 24"
//         strokeWidth={1.5}
//         stroke="currentColor"
//         className="h-5 w-5"
//       >
//         <path
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
//         />
//       </svg>
//     ),
//   },
// ];

// export function Sidebar() {
//   const pathname = usePathname();
//   const router = useRouter();
//   const [userName, setUserName] = useState<string>("");
//   const [clinicName, setClinicName] = useState<string>("");

//   // Load user info from localStorage
//   const loadUserInfo = () => {
//     if (typeof window !== "undefined") {
//       const memberData = localStorage.getItem("erp_member_data");
//       if (memberData) {
//         try {
//           const member = JSON.parse(memberData);
//           setUserName(member.full_name || member.member_id || "Foydalanuvchi");
//           setClinicName(member.clinic_name || "");
//         } catch (error) {
//           console.error("Error parsing member data:", error);
//           setUserName("");
//           setClinicName("");
//         }
//       } else {
//         setUserName("");
//         setClinicName("");
//       }
//     }
//   };

//   useEffect(() => {
//     loadUserInfo();
    
//     // Listen for storage changes (e.g., login/logout in another tab)
//     const handleStorageChange = (e: StorageEvent) => {
//       if (e.key === 'erp_member_data') {
//         loadUserInfo();
//       }
//     };
    
//     window.addEventListener('storage', handleStorageChange);
    
//     return () => {
//       window.removeEventListener('storage', handleStorageChange);
//     };
//   }, []);

//   const handleLogout = () => {
//     if (typeof window !== "undefined") {
//       // State'ni darhol tozalash
//       setUserName("");
//       setClinicName("");
      
//       // Barcha localStorage ma'lumotlarini tozalash
//       localStorage.removeItem("erp_access_token");
//       localStorage.removeItem("erp_member_data");
//       localStorage.removeItem("erp_tenant_id");
      
//       // Login sahifasiga yo'naltirish
//       router.push("/login");
//     }
//   };

//   return (
//     <aside className="sticky top-0 z-40 flex h-screen w-64 flex-col bg-slate-900 px-6 py-8 text-white">
//       <div>
//         <h2 className="text-2xl font-bold text-white">뷰티재고</h2>
//         <p className="mt-1 text-sm text-slate-400">ERP System</p>
//       </div>
//       <nav className="mt-10 flex-1 space-y-1 overflow-y-auto pr-2">
//         {navItems.map((item) => {
//           const isActive = pathname === item.href;
//           return (
//             <Link
//               key={item.href}
//               href={item.href}
//               className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
//                 isActive ? "bg-indigo-600 text-white shadow-lg" : "text-slate-300 hover:bg-slate-800 hover:text-white"
//               }`}
//             >
//               <span className={`flex-shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}>{item.icon}</span>
//               <span className="font-medium">{item.label}</span>
//             </Link>
//           );
//         })}
//       </nav>

//       {/* Foydalanuvchi ma'lumotlari va Logout */}
//       <div className="mt-6 space-y-3 border-t border-slate-700 pt-6">
//         {userName && (
//           <div className="rounded-lg bg-slate-800 px-4 py-3">
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-semibold text-white">
//                 {userName.charAt(0).toUpperCase()}
//               </div>
//               <div className="flex-1 overflow-hidden">
//                 <p className="truncate text-sm font-semibold text-white">
//                   {userName}
//                 </p>
//                 {clinicName && (
//                   <p className="truncate text-xs text-slate-400">
//                     {clinicName}
//                   </p>
//                 )}
//               </div>
//             </div>
//           </div>
//         )}
        
//         <button
//           onClick={handleLogout}
//           className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900"
//         >
//           <svg
//             xmlns="http://www.w3.org/2000/svg"
//             fill="none"
//             viewBox="0 0 24 24"
//             strokeWidth={1.5}
//             stroke="currentColor"
//             className="h-5 w-5"
//           >
//             <path
//               strokeLinecap="round"
//               strokeLinejoin="round"
//               d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
//             />
//           </svg>
//           <span>로그아웃</span>
//         </button>
//       </div>
//     </aside>
//   );
// }

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

const navItems = [
  {
    href: "/",
    label: "대시보드",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    href: "/inventory",
    label: "재고 현황",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    href: "/inbound",
    label: "입고 관리",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    href: "/outbound",
    label: "제품 출고",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    href: "/returns",
    label: "반납 관리",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    href: "/order-returns",
    label: "반품",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
      </svg>
    ),
  },
  {
    href: "/order",
    label: "주문 관리",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    href: "/sales",
    label: "재고 분석",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    href: "/trash",
    label: "휴지통",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false); // hydration-safe flag
  const [userName, setUserName] = useState<string>("");
  const [clinicName, setClinicName] = useState<string>("");

  const loadUserInfo = useCallback(() => {
    const memberData = localStorage.getItem("erp_member_data");
    if (!memberData) {
      setUserName("");
      setClinicName("");
      return;
    }

    try {
      const member = JSON.parse(memberData);
      setUserName(member.full_name || member.member_id || "Foydalanuvchi");
      setClinicName(member.clinic_name || "");
    } catch (error) {
      console.error("Error parsing member data:", error);
      setUserName("");
      setClinicName("");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadUserInfo();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "erp_member_data") loadUserInfo();
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadUserInfo]);

  const handleLogout = () => {
    // client-only
    setUserName("");
    setClinicName("");
    localStorage.removeItem("erp_access_token");
    localStorage.removeItem("erp_member_data");
    localStorage.removeItem("erp_tenant_id");
    router.push("/login");
  };

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-64 flex-col bg-slate-900 px-6 py-8 text-white">
      <div>
        <h2 className="text-2xl font-bold text-white">뷰티재고</h2>
        <p className="mt-1 text-sm text-slate-400">ERP System</p>
      </div>

      <nav className="mt-10 flex-1 space-y-1 overflow-y-auto pr-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className={`flex-shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}>
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User card - hydration-safe */}
      <div className="mt-6 space-y-3 border-t border-slate-700 pt-6">
        {/* mounted bo'lmaguncha SSR va client bir xil bo'lishi uchun placeholder */}
        {mounted && userName ? (
          <div className="rounded-lg bg-slate-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-semibold text-white">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-semibold text-white">{userName}</p>
                {clinicName && (
                  <p className="truncate text-xs text-slate-400">{clinicName}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          // bir xil HTML chiqishi uchun skeleton (optional)
          <div className="rounded-lg bg-slate-800/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-700 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-slate-700 animate-pulse" />
                <div className="h-2 w-32 rounded bg-slate-700 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
