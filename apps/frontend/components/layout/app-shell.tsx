"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login va clinic register pagelarda sidebar yashirin bo'lsin
  const hideSidebar =
    pathname === "/login" ||
    pathname.startsWith("/login/") || // agar nested bo'lsa
    pathname === "/clinic/register" ||
    pathname.startsWith("/clinic/register/"); // clinic register va barcha sub-pagelar

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      {!hideSidebar && <Sidebar />}

      <div className="flex flex-1 flex-col overflow-y-auto">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}