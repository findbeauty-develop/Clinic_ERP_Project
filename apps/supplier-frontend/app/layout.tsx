import type { Metadata } from "next";
import "./globals.css";
import { MobileNav } from "../components/layout/mobile-nav";

export const metadata: Metadata = {
  title: "Supplier ERP",
  description: "Supplier Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
