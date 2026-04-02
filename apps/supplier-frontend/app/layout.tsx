import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/layout/sidebar";
import { Header } from "../components/layout/header";
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
        <div className="lg:pl-64 flex flex-col min-h-screen">
          <Header />
          <MainWrapper>
            {children}
          </MainWrapper>
        </div>
      </body>
    </html>
  );
}
