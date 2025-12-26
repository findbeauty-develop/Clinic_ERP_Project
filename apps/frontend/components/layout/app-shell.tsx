"use client";

import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
