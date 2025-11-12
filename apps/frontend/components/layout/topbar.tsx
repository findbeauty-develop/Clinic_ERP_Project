"use client";

export function Topbar() {
  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">ERP System</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">User Menu</span>
      </div>
    </header>
  );
}

