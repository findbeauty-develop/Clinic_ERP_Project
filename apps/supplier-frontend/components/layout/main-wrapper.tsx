"use client";

import { usePathname } from "next/navigation";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // ✅ Hide padding on login, register, company, complete pages
  const hideSidebarPages = [
    "/login",
    "/register",
    "/register/company",
    "/register/contact",
    "/register/complete",
  ];
  
  const shouldHideSidebar = hideSidebarPages.some(page => pathname.startsWith(page));

  return (
    <main className="flex-1">
      {children}
    </main>
  );
}

