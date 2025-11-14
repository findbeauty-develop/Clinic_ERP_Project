"use client";

import Link from "next/link";

export function Topbar() {
  return (
    <header className="sticky top-0 z-50 h-16 w-full flex-shrink-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 dark:bg-gray-900/95 dark:border-gray-800 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">ERP System</h1>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md border border-blue-500 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-500/10"
        >
          로그인
        </Link>
      </div>
    </header>
  );
}

