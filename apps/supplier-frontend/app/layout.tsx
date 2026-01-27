import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/layout/sidebar";
import { MainWrapper } from "../components/layout/main-wrapper";

export const metadata: Metadata = {
  title: "Jaclit Supplier",
  description: "Jaclit Supplier Management System",
  icons: {
    icon: "/favicon.svg",
  },
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
        <MainWrapper>
          {children}
        </MainWrapper>
      </body>
    </html>
  );
}
