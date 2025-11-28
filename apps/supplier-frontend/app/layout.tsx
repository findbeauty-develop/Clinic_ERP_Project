import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/layout/sidebar";

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
        <Sidebar />
        <main className="lg:pl-64">
          {children}
        </main>
      </body>
    </html>
  );
}
