"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const pathname = usePathname();

  // Login va register page'larida mobile nav ko'rsatilmaydi
  const hiddenPaths = ["/login", "/register", "/forgot-password", "/register/company", "/register/contact"];
  if (hiddenPaths.includes(pathname)) {
    return null;
  }

  const navItems = [
    { href: "/", label: "홈", icon: "🏠" },
    { href: "/orders", label: "주문", icon: "📦" },
    { href: "/products", label: "제품", icon: "📋" },
    { href: "/profile", label: "프로필", icon: "👤" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 ${
                isActive ? "text-blue-600" : "text-slate-600"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

