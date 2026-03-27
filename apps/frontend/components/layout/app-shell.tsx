"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { NotificationProvider } from "@/components/notifications/notification-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Login va clinic register pagelarda sidebar yashirin bo'lsin
  const hideSidebar =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/clinic/register" ||
    pathname.startsWith("/clinic/register/");

  return (
    <NotificationProvider enabled={!hideSidebar}>
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      {!hideSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Drawer ushalgich: sidebar yopiq bo'lganda chapda vertikal markazda */}
      {!hideSidebar && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-1/2 z-50 flex h-14 w-6 -translate-y-1/2 items-center justify-center gap-0.5 rounded-r-lg border border-l-0 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 hover:w-7 transition-all duration-200"
          aria-label="메뉴 열기"
        >
          <span className="flex items-center gap-[2px]">
            <span className="h-3 w-px rounded-full bg-current" />
            <span className="h-3 w-px rounded-full bg-current" />
            <span className="h-3 w-px rounded-full bg-current" />
          </span>
        </button>
      )}

      <div
        className={`flex flex-1 flex-col overflow-y-auto transition-[margin] duration-300 ${
          !hideSidebar && sidebarOpen ? "ml-80" : "ml-0"
        }`}
      >
        <main className="flex-1">{children}</main>
      </div>
    </div>
    </NotificationProvider>
  );
}
